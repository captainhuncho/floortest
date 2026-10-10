package app.floortest;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.lang.reflect.Method;
import java.util.Collections;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** FloorTest's screen: the Capacitor web view, plus Share to FloorTest and a back button that goes back a page. */
public class MainActivity extends BridgeActivity {
    /** Shared files we've already taken the page to (kept across restarts), so opening the app doesn't keep jumping to Send. */
    private Set<String> routed() {
        return new HashSet<>(getSharedPreferences("share", MODE_PRIVATE).getStringSet("routed", new HashSet<>()));
    }
    /** True while a share is still being copied in, so the page isn't opened on a half-copied file. */
    private volatile boolean saving = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInboxPlugin.class);
        registerPlugin(NowPlayingPlugin.class);
        registerPlugin(OfflineCratePlugin.class);
        super.onCreate(savedInstanceState);
        // Back goes back a page, like a browser; on the first page it leaves the app running (like Home).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web != null && web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
        bridgeOnOfflineScreen();
        takeShare(getIntent());
    }

    /**
     * The offline screen (errorPath) is served from the app itself at <scheme>://<hostname>, not the site's address, and
     * Capacitor only injects its bridge for the site's address. Inject the same bridge there too, so the offline screen can
     * list and play tracks saved for offline. (That address only ever serves the app's own bundled files, and Capacitor
     * already accepts plugin calls from it.) If Capacitor changes, this quietly does nothing.
     */
    private void bridgeOnOfflineScreen() {
        try {
            if (getBridge() == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
            Method m = getBridge().getClass().getDeclaredMethod("getJSInjector");
            m.setAccessible(true);
            Object injector = m.invoke(getBridge());
            if (injector == null) return;
            String script = (String) injector.getClass().getMethod("getScriptString").invoke(injector);
            String origin = getBridge().getScheme() + "://" + getBridge().getHost();
            WebViewCompat.addDocumentStartJavaScript(getBridge().getWebView(), script, Collections.singleton(origin));
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        openSharedFiles();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeShare(intent);
    }

    /** Audio shared to FloorTest: save it to the inbox and open the Send page, where the usual form takes over. */
    private void takeShare(Intent intent) {
        List<Uri> uris = ShareInbox.sharedUris(intent);
        if (uris.isEmpty()) return;
        // Clear it so a rotation or relaunch doesn't import the same files again.
        intent.setAction(Intent.ACTION_MAIN);
        saving = true;
        new Thread(() -> {
            int saved = ShareInbox.save(this, uris);
            runOnUiThread(() -> {
                saving = false;
                if (saved == -1) { Toast.makeText(this, "FloorTest takes WAV and MP3 files.", Toast.LENGTH_LONG).show(); return; }
                if (saved == 0) { Toast.makeText(this, "Couldn't add that file. Try again.", Toast.LENGTH_LONG).show(); return; }
                openSharedFiles();
            });
        }).start();
    }

    /** Files waiting in the inbox that the page hasn't been shown yet: open the Send page with them. */
    private void openSharedFiles() {
        if (saving || getBridge() == null) return;
        Set<String> ids = new HashSet<>();
        for (File f : ShareInbox.entries(this)) ids.add(f.getParentFile().getName());
        if (ids.isEmpty() || routed().containsAll(ids)) return;
        // Remember exactly the files waiting now, so the list never grows.
        getSharedPreferences("share", MODE_PRIVATE).edit().putStringSet("routed", ids).apply();
        String base = getBridge().getServerUrl();
        getBridge().getWebView().loadUrl(Uri.parse(base).buildUpon().path("/dashboard/send").appendQueryParameter("shared", "1").build().toString());
    }
}
