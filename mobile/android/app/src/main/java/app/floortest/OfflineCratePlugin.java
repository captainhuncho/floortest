package app.floortest;

import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * `Capacitor.Plugins.OfflineCrate` (same calls as iOS): Prepare's kept tracks saved in the app's private, not-backed-up
 * storage for the offline screen to play. The copy always matches the last sync: tracks no longer in Prepare are deleted,
 * another account's copy is wiped, and everything is wiped if Prepare hasn't been opened online for maxDays (30).
 */
@CapacitorPlugin(name = "OfflineCrate")
public class OfflineCratePlugin extends Plugin {
    private volatile boolean syncing = false;
    private volatile int done = 0;
    private volatile int total = 0;
    /** Bumped by clear(): a sync started before it stops, and leaves nothing behind. */
    private final AtomicInteger generation = new AtomicInteger();
    private final Object lock = new Object();

    private File folder() {
        File f = new File(getContext().getNoBackupFilesDir(), "offline");
        //noinspection ResultOfMethodCallIgnored
        f.mkdirs();
        return f;
    }

    private File manifestFile() {
        return new File(folder(), "manifest.json");
    }

    /** The current copy, or null (and wiped) if there is none or it's past its check-in date. */
    private JSONObject manifest() {
        try {
            JSONObject m = new JSONObject(new String(Files.readAllBytes(manifestFile().toPath()), StandardCharsets.UTF_8));
            if (System.currentTimeMillis() - m.getDouble("syncedAt") > m.getDouble("maxDays") * 86_400_000d) { wipe(); return null; }
            return m;
        } catch (Exception e) {
            return null;
        }
    }

    private void wipe() {
        ShareInbox.deleteTree(folder());
    }

    @PluginMethod
    public void sync(PluginCall call) {
        JSONArray list = call.getData().optJSONArray("tracks");
        if (list == null || !call.getData().has("owner")) { call.reject("Bad request"); return; }
        long owner = call.getData().optLong("owner");
        double maxDays = call.getData().optDouble("maxDays", 30);
        JSObject r = new JSObject();
        if (syncing) { r.put("started", false); call.resolve(r); return; }
        syncing = true;
        r.put("started", true);
        call.resolve(r);
        int gen = generation.get();
        new Thread(() -> run(owner, maxDays, list, gen)).start();
    }

    /** Cleared (signed out, or Remove from phone) since this sync started: wipe whatever it put back, and stop. */
    private boolean stale(int gen) {
        synchronized (lock) {
            if (gen == generation.get()) return false;
            wipe();
            return true;
        }
    }

    private void run(long owner, double maxDays, JSONArray list, int gen) {
        try {
            JSONObject current = manifest();
            // Another account's copy never mixes with this one.
            if (current != null && current.optLong("owner") != owner) { wipe(); current = null; }
            Map<Long, String> have = new HashMap<>();
            if (current != null) {
                JSONArray ts = current.getJSONArray("tracks");
                for (int i = 0; i < ts.length(); i++) have.put(ts.getJSONObject(i).getLong("id"), ts.getJSONObject(i).getString("file"));
            }
            JSONArray kept = new JSONArray();
            done = 0;
            total = list.length();
            for (int i = 0; i < list.length(); i++) {
                if (stale(gen)) return;
                JSONObject t = list.getJSONObject(i);
                long id = t.getLong("id");
                String file = have.get(id);
                if (file == null || !new File(folder(), file).exists()) file = download(t.getString("url"), id);
                if (file != null) {
                    kept.put(new JSONObject().put("id", id).put("title", t.optString("title")).put("artist", t.optString("artist"))
                        .put("duration", t.optDouble("duration", 0)).put("file", file));
                }
                done = i + 1;
                JSObject p = new JSObject();
                p.put("done", done);
                p.put("total", total);
                notifyListeners("progress", p);
            }
            // Anything not in Prepare any more leaves the phone. The manifest is written only if nothing cleared the copy
            // meanwhile (checked under the same lock clear() takes).
            synchronized (lock) {
                if (stale(gen)) return;
                Set<String> keep = new HashSet<>();
                keep.add("manifest.json");
                for (int i = 0; i < kept.length(); i++) keep.add(kept.getJSONObject(i).getString("file"));
                File[] files = folder().listFiles();
                if (files != null) for (File f : files) if (!keep.contains(f.getName())) ShareInbox.deleteTree(f);
                JSONObject m = new JSONObject().put("owner", owner).put("syncedAt", (double) System.currentTimeMillis()).put("maxDays", maxDays).put("tracks", kept);
                Files.write(manifestFile().toPath(), m.toString().getBytes(StandardCharsets.UTF_8));
            }
            JSObject fin = new JSObject();
            fin.put("done", done);
            fin.put("total", total);
            fin.put("finished", true);
            fin.put("saved", kept.length());
            notifyListeners("progress", fin);
        } catch (Exception ignored) {
        } finally {
            syncing = false;
        }
    }

    private String download(String link, long id) {
        File tmp = new File(folder(), id + ".part");
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(link).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20_000);
            c.setReadTimeout(60_000);
            if (c.getResponseCode() != 200) return null;
            String type = c.getContentType() == null ? "" : c.getContentType();
            String name = id + (type.contains("mpeg") ? ".mp3" : ".wav");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            File dest = new File(folder(), name);
            //noinspection ResultOfMethodCallIgnored
            dest.delete();
            return tmp.renameTo(dest) ? name : null;
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return null;
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSONObject m = manifest();
        JSObject out = new JSObject();
        out.put("count", m == null ? 0 : m.optJSONArray("tracks").length());
        out.put("syncing", syncing);
        out.put("done", done);
        out.put("total", total);
        if (m != null) { out.put("owner", m.optLong("owner")); out.put("syncedAt", m.optDouble("syncedAt")); }
        call.resolve(out);
    }

    /** The saved tracks, each with a file path for Capacitor.convertFileSrc. */
    @PluginMethod
    public void list(PluginCall call) {
        JSArray out = new JSArray();
        JSONObject m = manifest();
        if (m != null) {
            JSONArray ts = m.optJSONArray("tracks");
            for (int i = 0; i < ts.length(); i++) {
                JSONObject t = ts.optJSONObject(i);
                JSObject o = new JSObject();
                o.put("id", t.optLong("id"));
                o.put("title", t.optString("title"));
                o.put("artist", t.optString("artist"));
                o.put("duration", t.optDouble("duration", 0));
                o.put("path", Uri.fromFile(new File(folder(), t.optString("file"))).toString());
                out.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("tracks", out);
        call.resolve(r);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        synchronized (lock) {
            generation.incrementAndGet();
            wipe();
        }
        call.resolve();
    }
}
