package app.floortest;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * `Capacitor.Plugins.NowPlaying` (Android only): the web player says what's playing; PlaybackService shows it as the
 * system media player (notification + lock screen) and keeps the app alive while music plays with the screen off.
 * Buttons pressed there come back as "action" events (play, pause, next, previous).
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {
    private static NowPlayingPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent i = new Intent(getContext(), PlaybackService.class)
            .setAction(PlaybackService.UPDATE)
            .putExtra("title", call.getString("title", ""))
            .putExtra("artist", call.getString("artist", ""))
            .putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)))
            // optDouble: the page sends plain numbers (seconds).
            .putExtra("position", (long) (call.getData().optDouble("position", 0) * 1000))
            .putExtra("duration", (long) (call.getData().optDouble("duration", 0) * 1000));
        try {
            ContextCompat.startForegroundService(getContext(), i);
        } catch (Exception e) {
            // Android refuses to start it from the background; the next update from the foreground will.
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    static void send(String action) {
        if (instance == null) return;
        JSObject e = new JSObject();
        e.put("action", action);
        instance.notifyListeners("action", e);
    }
}
