package my.gov.moe.idme.attendance;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PdfPrintHelper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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
import java.io.OutputStream;

@CapacitorPlugin(name = "PdfGenerator")
public class PdfGeneratorPlugin extends Plugin {
    private static final String TAG = "PdfGenerator";

    @PluginMethod
    public void generatePdf(PluginCall call) {
        String html = call.getString("html");
        String fileName = call.getString("fileName");
        boolean autoOpen = Boolean.TRUE.equals(call.getBoolean("open", true));

        if (html == null || html.isEmpty()) {
            call.reject("HTML 内容不能为空");
            return;
        }

        if (fileName == null || fileName.isEmpty()) {
            fileName = "MOEIS_Report.pdf";
        }
        if (!fileName.toLowerCase().endsWith(".pdf")) {
            fileName += ".pdf";
        }

        final String finalFileName = fileName;
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity 不可用");
            return;
        }

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Log.i(TAG, "Starting PDF generation for " + finalFileName);
                final ViewGroup root = (ViewGroup) activity.findViewById(android.R.id.content);

                final WebView webView = new WebView(activity);
                webView.setVisibility(View.INVISIBLE);
                // Attach to window hierarchy so Chromium layout & measurement pass executes
                root.addView(webView, new ViewGroup.LayoutParams(1200, 850));

                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setUseWideViewPort(true);
                settings.setLoadWithOverviewMode(true);
                settings.setDatabaseEnabled(true);
                settings.setDomStorageEnabled(true);

                final Runnable[] cleanup = new Runnable[1];
                cleanup[0] = () -> {
                    try {
                        root.removeView(webView);
                        webView.destroy();
                    } catch (Exception ignored) {}
                };

                final boolean[] isTriggered = new boolean[]{false};
                final Runnable triggerPrint = () -> {
                    if (isTriggered[0]) return;
                    isTriggered[0] = true;
                    Log.i(TAG, "Triggering PDF print conversion...");

                    try {
                        webView.measure(
                                View.MeasureSpec.makeMeasureSpec(1200, View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec(850, View.MeasureSpec.EXACTLY)
                        );
                        webView.layout(0, 0, 1200, 850);

                        File appDownloadsDir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        if (appDownloadsDir == null) {
                            appDownloadsDir = activity.getCacheDir();
                        }
                        if (!appDownloadsDir.exists()) {
                            appDownloadsDir.mkdirs();
                        }
                        final File tempPdfFile = new File(appDownloadsDir, finalFileName);

                        PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter("MOEIS_Report");
                        PrintAttributes printAttributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();

                        PdfPrintHelper.print(printAdapter, tempPdfFile, printAttributes, new PdfPrintHelper.Callback() {
                            @Override
                            public void onSuccess(File file) {
                                Log.i(TAG, "PDF generated successfully: " + file.getAbsolutePath() + " (" + file.length() + " bytes)");
                                cleanup[0].run();

                                String publicSavedPath = null;
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    try {
                                        ContentValues values = new ContentValues();
                                        values.put(MediaStore.Downloads.DISPLAY_NAME, finalFileName);
                                        values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                                        Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                                        if (uri != null) {
                                            try (InputStream in = new FileInputStream(tempPdfFile);
                                                 OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
                                                byte[] buf = new byte[8192];
                                                int len;
                                                while ((len = in.read(buf)) > 0) {
                                                    out.write(buf, 0, len);
                                                }
                                                out.flush();
                                            }
                                            publicSavedPath = "/storage/emulated/0/Download/" + finalFileName;
                                        }
                                    } catch (Exception e) {
                                        Log.e(TAG, "MediaStore save error: " + e.getMessage(), e);
                                    }
                                } else {
                                    try {
                                        File dl = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                                        if (!dl.exists()) dl.mkdirs();
                                        File pubFile = new File(dl, finalFileName);
                                        try (InputStream in = new FileInputStream(tempPdfFile);
                                             OutputStream out = new FileOutputStream(pubFile)) {
                                            byte[] buf = new byte[8192];
                                            int len;
                                            while ((len = in.read(buf)) > 0) {
                                                out.write(buf, 0, len);
                                            }
                                            out.flush();
                                        }
                                        publicSavedPath = pubFile.getAbsolutePath();
                                        MediaScannerConnection.scanFile(activity, new String[]{pubFile.getAbsolutePath()}, new String[]{"application/pdf"}, null);
                                    } catch (Exception ignored) {}
                                }

                                if (publicSavedPath == null) {
                                    publicSavedPath = tempPdfFile.getAbsolutePath();
                                }

                                MediaScannerConnection.scanFile(
                                        activity,
                                        new String[]{tempPdfFile.getAbsolutePath()},
                                        new String[]{"application/pdf"},
                                        null
                                );

                                if (autoOpen) {
                                    try {
                                        Uri contentUri = FileProvider.getUriForFile(
                                                activity,
                                                activity.getPackageName() + ".fileprovider",
                                                tempPdfFile
                                        );
                                        Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                                        viewIntent.setDataAndType(contentUri, "application/pdf");
                                        viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        activity.startActivity(viewIntent);
                                    } catch (Exception e) {
                                        Log.e(TAG, "Auto open error: " + e.getMessage(), e);
                                    }
                                }

                                JSObject ret = new JSObject();
                                ret.put("success", true);
                                ret.put("path", publicSavedPath);
                                ret.put("internalPath", tempPdfFile.getAbsolutePath());
                                ret.put("fileName", finalFileName);
                                call.resolve(ret);
                            }

                            @Override
                            public void onError(String error) {
                                Log.e(TAG, "PdfPrintHelper error: " + error);
                                cleanup[0].run();
                                call.reject("生成 PDF 失败: " + error);
                            }
                        });

                    } catch (Exception e) {
                        Log.e(TAG, "Exception during PDF processing", e);
                        cleanup[0].run();
                        call.reject("PDF 转换过程异常: " + e.getMessage());
                    }
                };

                // Watchdog: If onPageFinished does not fire within 3 seconds, proceed anyway
                final Handler mainHandler = new Handler(Looper.getMainLooper());
                mainHandler.postDelayed(triggerPrint, 3000);

                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        Log.i(TAG, "WebView onPageFinished received for: " + url);
                        mainHandler.postDelayed(triggerPrint, 300);
                    }
                });

                webView.loadDataWithBaseURL("about:blank", html, "text/html", "utf-8", null);

            } catch (Exception e) {
                Log.e(TAG, "Init WebView error", e);
                call.reject("初始化 WebView 异常: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String jobName = call.getString("jobName");
        if (jobName == null || jobName.isEmpty()) {
            jobName = "MOEIS_Report";
        }
        if (html == null || html.isEmpty()) {
            call.reject("HTML 内容不能为空");
            return;
        }
        final String finalJobName = jobName;
        final Context context = getContext();
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                WebView webView = new WebView(context);
                webView.getSettings().setJavaScriptEnabled(true);
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter printAdapter = view.createPrintDocumentAdapter(finalJobName);
                        PrintAttributes printAttributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                        printManager.print(finalJobName, printAdapter, printAttributes);
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    }
                });
                webView.loadDataWithBaseURL("https://moeispel.moe.gov.my", html, "text/html", "utf-8", null);
            } catch (Exception e) {
                call.reject("唤起打印失败: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void openPdf(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("PDF 路径不能为空");
            return;
        }

        try {
            File pdfFile = new File(path);
            if (!pdfFile.exists()) {
                call.reject("PDF 文件不存在: " + path);
                return;
            }

            Context context = getContext();
            Uri contentUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    pdfFile
            );
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(contentUri, "application/pdf");
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(viewIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("打开 PDF 失败: " + e.getMessage());
        }
    }
}
