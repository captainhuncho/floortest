package app.floortest;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.RandomAccessFile;

/** The Send page's view of the share inbox, as `Capacitor.Plugins.ShareInbox` (same calls as the iOS plugin). */
@CapacitorPlugin(name = "ShareInbox")
public class ShareInboxPlugin extends Plugin {
    @PluginMethod
    public void list(PluginCall call) {
        JSArray files = new JSArray();
        for (File f : ShareInbox.entries(getContext())) {
            JSObject o = new JSObject();
            o.put("id", f.getParentFile().getName());
            o.put("name", f.getName());
            o.put("size", f.length());
            files.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("files", files);
        call.resolve(ret);
    }

    /** One piece of a file, base64 (the page asks for 2 MB at a time). */
    @PluginMethod
    public void read(PluginCall call) {
        File f = ShareInbox.entry(getContext(), call.getString("id"));
        if (f == null) { call.reject("Not found"); return; }
        // optLong, not call.getLong: the page sends plain numbers, which getLong ignores unless they arrive as Long.
        long offset = Math.max(0, call.getData().optLong("offset", 0L));
        int length = (int) Math.min(Math.max(0, call.getData().optLong("length", 0L)), 8L * 1024 * 1024);
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            r.seek(offset);
            byte[] buf = new byte[(int) Math.min(length, Math.max(0, r.length() - offset))];
            r.readFully(buf);
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(buf, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Couldn't read the file");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        File f = ShareInbox.entry(getContext(), call.getString("id"));
        if (f != null) ShareInbox.deleteTree(f.getParentFile());
        call.resolve();
    }
}
