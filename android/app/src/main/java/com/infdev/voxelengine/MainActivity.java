package com.infdev.voxelengine;

import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    private static final String FIREBASE_AUTH_HOST = "scenic-beaker-7nzsc.firebaseapp.com";
    private Dialog activeAuthDialog = null;
    private WebView activePopupWebView = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getWindow() != null) {
            getWindow().getDecorView().setBackgroundColor(Color.parseColor("#09090b"));
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(lp);
            }
            applyImmersiveMode();
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            final WebView mainWebView = getBridge().getWebView();
            mainWebView.setBackgroundColor(Color.parseColor("#09090b"));
            mainWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            configureOAuthFriendlyWebView(mainWebView, true);

            getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri url = request != null ? request.getUrl() : null;
                    if (isFirebaseNetworkAuthUrl(url)) {
                        // Bypass Capacitor local asset server so /__/auth/* & /__/firebase/* load live from Firebase
                        return null;
                    }
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    if (isDisallowedUserAgentUrl(url)) {
                        notifyAndroidOAuthError("auth/disallowed-useragent");
                        view.post(() -> view.loadUrl("https://" + FIREBASE_AUTH_HOST + "/"));
                    }
                }
            });

            mainWebView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onCreateWindow(
                    WebView view,
                    boolean isDialog,
                    boolean isUserGesture,
                    Message resultMsg
                ) {
                    if (resultMsg == null || !(resultMsg.obj instanceof WebView.WebViewTransport)) {
                        return false;
                    }
                    openOAuthPopupDialog(resultMsg);
                    return true;
                }

                @Override
                public void onCloseWindow(WebView window) {
                    dismissAuthPopupDialog();
                    super.onCloseWindow(window);
                }
            });
        }
    }

    private void configureOAuthFriendlyWebView(WebView targetWebView, boolean enableZoomSupport) {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(targetWebView, true);

        WebSettings settings = targetWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        if (enableZoomSupport) {
            settings.setSupportZoom(false);
        }

        // Prevent Google OAuth 403 disallowed_useragent inside Android WebView
        String currentUa = settings.getUserAgentString();
        if (currentUa != null && !currentUa.isEmpty()) {
            String sanitizedUa = currentUa
                .replaceAll(";\\s*wv\\b", "")
                .replaceAll("Version/\\d+\\.\\d+\\s*", "");
            settings.setUserAgentString(sanitizedUa);
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, Collections.emptySet());
        }
    }

    private boolean isFirebaseNetworkAuthUrl(Uri url) {
        if (url == null) return false;
        String host = url.getHost();
        String path = url.getPath();
        if (host == null || path == null) return false;
        if (!FIREBASE_AUTH_HOST.equalsIgnoreCase(host)) return false;
        return (
            path.startsWith("/__/auth/") ||
            path.startsWith("/__/firebase/") ||
            path.startsWith("/.well-known/")
        );
    }

    private boolean isDisallowedUserAgentUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();
        return (
            lower.contains("accounts.google.com") &&
            (lower.contains("disallowed_useragent") || lower.contains("v3/signin/rejected"))
        );
    }

    private void notifyAndroidOAuthError(final String code) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final WebView mainWebView = getBridge().getWebView();
        mainWebView.post(() -> {
            String safeCode = code.replace("'", "");
            mainWebView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('android-oauth-error', { detail: { code: '" + safeCode + "' } }));",
                null
            );
        });
    }

    private void openOAuthPopupDialog(Message resultMsg) {
        dismissAuthPopupDialog();

        final Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#09090b"));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(Color.parseColor("#18181b"));
        int padH = (int) (14 * getResources().getDisplayMetrics().density);
        int padV = (int) (10 * getResources().getDisplayMetrics().density);
        header.setPadding(padH, padV, padH, padV);

        TextView titleView = new TextView(this);
        titleView.setText("Google Sign-In");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(14);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        header.addView(titleView, titleLp);

        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#e4e4e7"));
        closeBtn.setTextSize(18);
        closeBtn.setPadding(padH, 4, padH, 4);
        closeBtn.setOnClickListener(v -> dismissAuthPopupDialog());
        header.addView(closeBtn);

        final WebView popupWebView = new WebView(this);
        popupWebView.setBackgroundColor(Color.WHITE);
        configureOAuthFriendlyWebView(popupWebView, false);

        popupWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request != null ? request.getUrl() : null;
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                } catch (Exception ignored) {
                    return true;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isDisallowedUserAgentUrl(url)) {
                    notifyAndroidOAuthError("auth/disallowed-useragent");
                    dismissAuthPopupDialog();
                }
            }

            @Override
            public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (
                    request != null &&
                    request.isForMainFrame() &&
                    errorResponse != null &&
                    errorResponse.getStatusCode() == 403 &&
                    request.getUrl() != null &&
                    request.getUrl().toString().contains("accounts.google.com")
                ) {
                    notifyAndroidOAuthError("auth/disallowed-useragent");
                    dismissAuthPopupDialog();
                }
            }
        });

        popupWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                dismissAuthPopupDialog();
            }
        });

        FrameLayout webContainer = new FrameLayout(this);
        webContainer.addView(
            popupWebView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        root.addView(
            header,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );
        root.addView(
            webContainer,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        );

        dialog.setContentView(root);
        dialog.setCancelable(true);
        dialog.setOnDismissListener(d -> {
            if (activePopupWebView != null) {
                try {
                    activePopupWebView.stopLoading();
                    activePopupWebView.removeAllViews();
                    activePopupWebView.destroy();
                } catch (Exception ignored) {}
                activePopupWebView = null;
            }
            if (activeAuthDialog == dialog) {
                activeAuthDialog = null;
            }
            CookieManager.getInstance().flush();
        });

        activeAuthDialog = dialog;
        activePopupWebView = popupWebView;
        dialog.show();

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popupWebView);
        resultMsg.sendToTarget();
    }

    private void dismissAuthPopupDialog() {
        if (activeAuthDialog != null) {
            Dialog d = activeAuthDialog;
            activeAuthDialog = null;
            try {
                if (d.isShowing()) {
                    d.dismiss();
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onPause() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('app-background'));",
                null
            );
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.onResume();
            webView.resumeTimers();
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('app-foreground'));",
                null
            );
        }
        applyImmersiveMode();
    }

    @Override
    public void onDestroy() {
        dismissAuthPopupDialog();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
        }
    }

    private void applyImmersiveMode() {
        if (getWindow() == null) return;
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}
