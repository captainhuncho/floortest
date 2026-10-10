package app.floortest;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

/** The system media player for FloorTest on Android: one notification (and lock-screen card) with previous, play/pause, next. */
public class PlaybackService extends Service {
    static final String UPDATE = "app.floortest.NOW_PLAYING";
    private static final String CHANNEL = "playback";
    private static final int ID = 7;
    private MediaSessionCompat session;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Playing", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("The track playing in FloorTest");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        session = new MediaSessionCompat(this, "FloorTest");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { NowPlayingPlugin.send("play"); }
            @Override public void onPause() { NowPlayingPlugin.send("pause"); }
            @Override public void onSkipToNext() { NowPlayingPlugin.send("next"); }
            @Override public void onSkipToPrevious() { NowPlayingPlugin.send("previous"); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Headphone and notification buttons arrive here too.
        MediaButtonReceiver.handleIntent(session, intent);
        if (intent != null && UPDATE.equals(intent.getAction())) show(intent);
        return START_NOT_STICKY;
    }

    private void show(Intent in) {
        boolean playing = in.getBooleanExtra("playing", false);
        String title = in.getStringExtra("title");
        String artist = in.getStringExtra("artist");
        session.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "FloorTest")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, in.getLongExtra("duration", 0))
            .build());
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, in.getLongExtra("position", 0), playing ? 1f : 0f)
            .build());

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_floortest)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .setDeleteIntent(MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_STOP))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_previous, "Previous", MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, playing ? PlaybackStateCompat.ACTION_PAUSE : PlaybackStateCompat.ACTION_PLAY))
            .addAction(android.R.drawable.ic_media_next, "Next", MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT))
            .setStyle(new MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2))
            .build();

        // Playing: a foreground service, so Android keeps the app (and the music) going with the screen off.
        // Paused: the card stays, but Android may close the app as usual.
        ServiceCompat.startForeground(this, ID, n, Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0);
        if (!playing) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
    }

    @Override
    public void onDestroy() {
        session.setActive(false);
        session.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
