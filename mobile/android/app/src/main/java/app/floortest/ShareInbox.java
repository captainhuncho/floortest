package app.floortest;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Share to FloorTest on Android: audio shared into the app waits in files/Inbox/<uuid>/<file name> until the Send page
 * takes it (through ShareInboxPlugin) and removes it once sent. Anything older than a day is cleared. Same rules as iOS.
 */
final class ShareInbox {
    private ShareInbox() {}

    static final long MAX_AGE_MS = 86_400_000L;
    static final long MAX_BYTES = 250L * 1024 * 1024;

    static File folder(Context c) {
        return new File(c.getFilesDir(), "Inbox");
    }

    static List<File> entries(Context c) {
        List<File> out = new ArrayList<>();
        File[] dirs = folder(c).listFiles();
        if (dirs == null) return out;
        for (File dir : dirs) {
            if (System.currentTimeMillis() - dir.lastModified() > MAX_AGE_MS) { deleteTree(dir); continue; }
            File[] files = dir.listFiles();
            if (files != null && files.length > 0) out.add(files[0]);
        }
        return out;
    }

    /** Only ids the inbox itself made (UUIDs), so a page can never reach outside it. */
    static File entry(Context c, String id) {
        if (id == null) return null;
        try { UUID.fromString(id); } catch (IllegalArgumentException e) { return null; }
        for (File f : entries(c)) if (f.getParentFile().getName().equals(id)) return f;
        return null;
    }

    static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /** The audio files in a share intent (one or several). */
    static List<Uri> sharedUris(Intent intent) {
        List<Uri> out = new ArrayList<>();
        if (intent == null || intent.getType() == null || !intent.getType().startsWith("audio/")) return out;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) out.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) out.addAll(list);
        }
        return out;
    }

    /** Copies WAV/MP3s into the inbox (up to 3). Returns how many were saved, or -1 if none were WAV or MP3. */
    static int save(Context c, List<Uri> uris) {
        int saved = 0;
        boolean refused = false;
        for (Uri u : uris) {
            if (saved >= 3) break;
            String name = displayName(c, u);
            String lower = name.toLowerCase();
            if (!lower.endsWith(".wav") && !lower.endsWith(".mp3")) { refused = true; continue; }
            File dir = new File(folder(c), UUID.randomUUID().toString());
            if (!dir.mkdirs()) continue;
            File dest = new File(dir, name);
            try (InputStream in = c.getContentResolver().openInputStream(u); OutputStream out = new FileOutputStream(dest)) {
                if (in == null) throw new java.io.IOException("no stream");
                byte[] buf = new byte[1 << 16];
                long total = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_BYTES) throw new java.io.IOException("too big");
                    out.write(buf, 0, n);
                }
                saved++;
            } catch (Exception e) {
                deleteTree(dir);
            }
        }
        return saved == 0 && refused ? -1 : saved;
    }

    /** The file's own name, made safe to use as a file name. */
    private static String displayName(Context c, Uri u) {
        String name = null;
        try (Cursor cur = c.getContentResolver().query(u, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst()) name = cur.getString(0);
        } catch (Exception ignored) {}
        if (name == null) name = u.getLastPathSegment();
        if (name == null) name = "track";
        name = name.replaceAll("[/\\\\:\u0000]", "_").trim();
        return name.isEmpty() ? "track" : name;
    }
}
