package my.gov.moe.idme.attendance;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 应用内自更新：检测 → 下载 → 安装。
 *
 * 为什么必须自己写：Android 没有「应用自更新」的系统 API。所谓自更新，
 * 实际是两个系统动作的组合 —— 下载 APK 到应用私有目录，再用
 * ACTION_VIEW + MIME application/vnd.android.package-archive 调起系统安装器，
 * 配合 FileProvider 把文件临时授权给它。**没有静默安装路径**
 * （除非设备是 Device Owner 或受 MDM 管理），每次都会弹系统确认框，这是设计如此。
 *
 * 安全边界在 SHA-256：绕过 Play 商店后，唯一的完整性保证就是自己核对包体哈希。
 * 一次 DNS 劫持或镜像投毒就能塞进任意 APK，所以 download() 必须带 expectedSha256，
 * 校验不过就删文件并 reject —— 绝不把未校验的文件交给安装器。
 *
 * 签名一致性由构建侧保证（见 app/build.gradle 的 signingConfigs），
 * 本类不做也无法做签名校验：安装器会自己拒绝不同签名的包，且不给原因。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String TAG = "AppUpdater";
    private static final String APK_NAME = "idme-update.apk";

    /** 下载线程引用，用于取消 */
    private Thread downloadThread;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    // ---------------------------------------------------------------- 版本

    /**
     * 当前安装包的版本。**从 PackageManager 读，不信任 JS 侧常量** ——
     * __APP_VERSION_CODE__ 是构建期注入到 bundle 里的，若 WebView 加载了
     * 旧 bundle（热更新残留、缓存），拿到的版本会与实际安装的 APK 不符，
     * 进而误判「已是最新」。APK 自己的 manifest 才是唯一事实源。
     */
    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Activity activity = getActivity();
            PackageInfo pi = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? pi.getLongVersionCode()
                    : pi.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionCode", code);
            ret.put("versionName", pi.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "读取版本失败", e);
            call.reject("读取版本失败: " + e.getMessage());
        }
    }

    /**
     * 是否已允许「安装未知应用」。
     * Android 8.0 起这是逐应用的运行时开关，默认关闭 ——
     * 未授予时调起安装器会被系统直接拦掉，用户看不到任何反应。
     * 前端据此在安装前引导用户去设置页。
     */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("granted", ok);
        call.resolve(ret);
    }

    /** 跳到本应用的「安装未知应用」设置页 */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开设置页: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------- 下载

    /**
     * 下载 APK 到应用私有目录（external-files/Documents）。
     *
     * 为什么用 external-files 而不是公共 Downloads：从 Android 10 起写公共目录
     * 需要 MediaStore 或 SAF，而安装器只需要一个可读的 content:// URI。
     * 私有目录 + FileProvider 是唯一在 minSdk 24 ~ targetSdk 34 全区间都成立的路径，
     * 且无需任何存储权限（见 file_paths.xml 的 external-files-path）。
     *
     * 进度通过 notifyListeners 推给 JS，事件名 downloadProgress，
     * 载荷 { received, total, percent }。total 未知时为 -1。
     */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String expectedSha256 = call.getString("sha256");

        if (url == null || url.isEmpty()) {
            call.reject("下载地址不能为空");
            return;
        }
        if (expectedSha256 == null || expectedSha256.length() != 64) {
            // 没有哈希就不下载：宁可不更新，也不把无法验证的包交给安装器
            call.reject("缺少有效的 SHA-256，拒绝下载");
            return;
        }

        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity 不可用");
            return;
        }

        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) dir = activity.getFilesDir();
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("无法创建下载目录");
            return;
        }
        final File target = new File(dir, APK_NAME);
        final File tmp = new File(dir, APK_NAME + ".part");
        // 上一次的残留先清掉，避免校验到旧文件
        if (tmp.exists()) tmp.delete();

        cancelled.set(false);
        final String finalUrl = url;
        final String finalSha = expectedSha256.toLowerCase();

        downloadThread = new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(finalUrl).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("下载失败：HTTP " + status);
                    return;
                }

                long total = conn.getContentLengthLong();
                // 服务器没给 Content-Length 时 total = -1，前端据此显示「不确定进度」
                final long finalTotal = total;

                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long received = 0;
                int lastPercent = -1;
                byte[] buf = new byte[16384];

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(tmp)) {
                    int len;
                    while ((len = in.read(buf)) > 0) {
                        if (cancelled.get()) {
                            out.close();
                            tmp.delete();
                            call.reject("已取消");
                            return;
                        }
                        out.write(buf, 0, len);
                        md.update(buf, 0, len);
                        received += len;

                        int percent = finalTotal > 0
                                ? (int) (received * 100 / finalTotal)
                                : -1;
                        // 每变 1% 才推一次：进度事件走 WebView 桥，
                        // 每 16KB 推一次会在慢网下刷出上千条消息拖垮 UI 线程
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject p = new JSObject();
                            p.put("received", received);
                            p.put("total", finalTotal);
                            p.put("percent", percent);
                            notifyListeners("downloadProgress", p);
                        }
                    }
                }

                // ---- 完整性校验：不通过就删，绝不落盘成 .apk ----
                String actual = toHex(md.digest());
                if (!actual.equals(finalSha)) {
                    tmp.delete();
                    Log.e(TAG, "SHA-256 不匹配: 期望 " + finalSha + " 实际 " + actual);
                    call.reject("校验失败：安装包可能已损坏或被篡改");
                    return;
                }

                // 校验通过才改名为正式文件：中途失败不会留下一个「看起来能装」的 APK
                if (target.exists() && !target.delete()) {
                    call.reject("无法覆盖旧安装包");
                    return;
                }
                if (!tmp.renameTo(target)) {
                    call.reject("无法保存安装包");
                    return;
                }

                JSObject ret = new JSObject();
                ret.put("path", target.getAbsolutePath());
                ret.put("bytes", target.length());
                call.resolve(ret);

            } catch (Exception e) {
                if (tmp.exists()) tmp.delete();
                Log.e(TAG, "下载异常", e);
                call.reject("下载失败: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "app-updater-download");
        downloadThread.start();
    }

    /** 取消进行中的下载 */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled.set(true);
        call.resolve();
    }

    // ---------------------------------------------------------------- 安装

    /**
     * 调起系统安装器。
     *
     * FileProvider 把私有目录的 APK 映射成 content:// URI 并临时授权给安装器 ——
     * 直接用 file:// 在 Android 7.0+ 会抛 FileUriExposedException。
     *
     * FLAG_ACTIVITY_NEW_TASK 不可省：调用方可能不是 Activity 上下文。
     * 加 FLAG_GRANT_READ_URI_PERMISSION 让安装器有权读这个 URI。
     */
    @PluginMethod
    public void install(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity 不可用");
            return;
        }

        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) dir = activity.getFilesDir();
        File apk = new File(dir, APK_NAME);

        if (!apk.exists()) {
            call.reject("安装包不存在，请重新下载");
            return;
        }
        // 防御：0 字节或明显过小的文件不可能是有效 APK
        if (apk.length() < 1024 * 100) {
            call.reject("安装包不完整，请重新下载");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".fileprovider",
                    apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    activity.startActivity(intent);
                    JSObject ret = new JSObject();
                    ret.put("launched", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    Log.e(TAG, "调起安装器失败", e);
                    call.reject("无法调起安装器: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "FileProvider 失败", e);
            call.reject("准备安装失败: " + e.getMessage());
        }
    }

    /** 删除已下载的安装包（安装完成后清理，避免长期占用空间） */
    @PluginMethod
    public void clean(PluginCall call) {
        try {
            Activity activity = getActivity();
            File dir = activity != null
                    ? activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
                    : null;
            if (dir == null && activity != null) dir = activity.getFilesDir();
            if (dir != null) {
                new File(dir, APK_NAME).delete();
                new File(dir, APK_NAME + ".part").delete();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("清理失败: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------- 工具

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
