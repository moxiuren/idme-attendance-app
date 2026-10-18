package android.print;

import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import java.io.File;

public class PdfPrintHelper {
    private static final String TAG = "PdfPrintHelper";

    public interface Callback {
        void onSuccess(File file);
        void onError(String error);
    }

    public static void print(PrintDocumentAdapter adapter, File file, PrintAttributes attributes, Callback callback) {
        Handler handler = new Handler(Looper.getMainLooper());
        try {
            Log.i(TAG, "Opening ParcelFileDescriptor for: " + file.getAbsolutePath());
            final ParcelFileDescriptor pfd = ParcelFileDescriptor.open(
                    file,
                    ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_TRUNCATE
            );

            final CancellationSignal layoutSignal = new CancellationSignal();
            final CancellationSignal writeSignal = new CancellationSignal();
            final Bundle extras = new Bundle();

            final Runnable timeoutTask = () -> {
                Log.e(TAG, "PDF print layout/write timed out after 15s");
                try {
                    pfd.close();
                } catch (Exception ignored) {}
                layoutSignal.cancel();
                writeSignal.cancel();
                callback.onError("PDF 渲染超时 (15秒)");
            };
            handler.postDelayed(timeoutTask, 15000);

            PrintAttributes oldAttributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                    .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build();

            Log.i(TAG, "Calling adapter.onLayout...");
            adapter.onLayout(oldAttributes, attributes, layoutSignal, new PrintDocumentAdapter.LayoutResultCallback() {
                @Override
                public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                    Log.i(TAG, "onLayoutFinished: pageCount=" + (info != null ? info.getPageCount() : "unknown"));
                    try {
                        adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, pfd, writeSignal, new PrintDocumentAdapter.WriteResultCallback() {
                            @Override
                            public void onWriteFinished(PageRange[] pages) {
                                handler.removeCallbacks(timeoutTask);
                                Log.i(TAG, "onWriteFinished: written pages count=" + (pages != null ? pages.length : 0));
                                try {
                                    pfd.close();
                                } catch (Exception ignored) {}
                                callback.onSuccess(file);
                            }

                            @Override
                            public void onWriteFailed(CharSequence error) {
                                handler.removeCallbacks(timeoutTask);
                                Log.e(TAG, "onWriteFailed: " + error);
                                try {
                                    pfd.close();
                                } catch (Exception ignored) {}
                                callback.onError("写入失败: " + error);
                            }

                            @Override
                            public void onWriteCancelled() {
                                handler.removeCallbacks(timeoutTask);
                                Log.w(TAG, "onWriteCancelled");
                                try {
                                    pfd.close();
                                } catch (Exception ignored) {}
                                callback.onError("写入已取消");
                            }
                        });
                    } catch (Exception e) {
                        handler.removeCallbacks(timeoutTask);
                        Log.e(TAG, "Exception during adapter.onWrite", e);
                        try {
                            pfd.close();
                        } catch (Exception ignored) {}
                        callback.onError("onWrite 异常: " + e.getMessage());
                    }
                }

                @Override
                public void onLayoutFailed(CharSequence error) {
                    handler.removeCallbacks(timeoutTask);
                    Log.e(TAG, "onLayoutFailed: " + error);
                    try {
                        pfd.close();
                    } catch (Exception ignored) {}
                    callback.onError("排版失败: " + error);
                }

                @Override
                public void onLayoutCancelled() {
                    handler.removeCallbacks(timeoutTask);
                    Log.w(TAG, "onLayoutCancelled");
                    try {
                        pfd.close();
                    } catch (Exception ignored) {}
                    callback.onError("排版已取消");
                }
            }, extras);

        } catch (Exception e) {
            Log.e(TAG, "Exception during PdfPrintHelper.print", e);
            callback.onError("初始化打印异常: " + e.getMessage());
        }
    }
}
