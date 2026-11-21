import Foundation
import Capacitor
import MediaPlayer
import UIKit

/// The lock screen and Control Centre player for the iPhone app: cover, title, artist, scrubber, play/pause, previous and
/// next. The web view's own Media Session shows the title but not the buttons, so the web player (src/lib/native-now-playing.ts)
/// tells this plugin what's playing and gets the buttons back as "action" events. Same names as the Android plugin.
@objc(NowPlayingPlugin)
public class NowPlayingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NowPlayingPlugin"
    public let jsName = "NowPlaying"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]
    /// A cover bigger than this is ignored (the page sends a thumbnail; this only stops a runaway payload).
    static let maxArtworkBytes = 2 * 1024 * 1024
    private var artwork: MPMediaItemArtwork?
    private var targets: [(MPRemoteCommand, Any)] = []

    /// { title, artist, playing, position, duration, artwork? } with artwork as base64 image data. Without artwork the
    /// last cover stays (the page sends it once per track).
    @objc func update(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let playing = call.getBool("playing") ?? false
        let position = max(0, call.getDouble("position") ?? 0)
        let duration = max(0, call.getDouble("duration") ?? 0)
        let art = call.getString("artwork")
        DispatchQueue.main.async {
            if let art, let image = Self.image(fromBase64: art) {
                self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            }
            self.listen()
            var info: [String: Any] = [
                MPMediaItemPropertyTitle: title,
                MPMediaItemPropertyArtist: artist,
                MPMediaItemPropertyAlbumTitle: "FloorTest",
                MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
                MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
            ]
            if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
            if let artwork = self.artwork { info[MPMediaItemPropertyArtwork] = artwork }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            MPNowPlayingInfoCenter.default().playbackState = playing ? .playing : .paused
            call.resolve()
        }
    }

    /// The player is gone: clear the lock screen and hand the buttons back.
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            for (command, target) in self.targets { command.removeTarget(target) }
            self.targets = []
            self.artwork = nil
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            MPNowPlayingInfoCenter.default().playbackState = .stopped
            call.resolve()
        }
    }

    static func image(fromBase64 text: String) -> UIImage? {
        let raw = text.range(of: "base64,").map { String(text[$0.upperBound...]) } ?? text
        guard raw.count <= maxArtworkBytes * 4 / 3 + 4, let data = Data(base64Encoded: raw) else { return nil }
        return UIImage(data: data)
    }

    /// Wires the lock screen's buttons once; each press goes to the page as { action, position? }.
    private func listen() {
        if !targets.isEmpty { return }
        let center = MPRemoteCommandCenter.shared()
        let send: (String, Double?) -> MPRemoteCommandHandlerStatus = { [weak self] action, position in
            var data: [String: Any] = ["action": action]
            if let position { data["position"] = position }
            self?.notifyListeners("action", data: data)
            return .success
        }
        let simple: [(MPRemoteCommand, String)] = [
            (center.playCommand, "play"),
            (center.pauseCommand, "pause"),
            (center.nextTrackCommand, "next"),
            (center.previousTrackCommand, "previous"),
        ]
        for (command, action) in simple {
            command.isEnabled = true
            targets.append((command, command.addTarget { _ in send(action, nil) }))
        }
        center.togglePlayPauseCommand.isEnabled = true
        targets.append((center.togglePlayPauseCommand, center.togglePlayPauseCommand.addTarget { _ in
            send(MPNowPlayingInfoCenter.default().playbackState == .playing ? "pause" : "play", nil)
        }))
        center.changePlaybackPositionCommand.isEnabled = true
        targets.append((center.changePlaybackPositionCommand, center.changePlaybackPositionCommand.addTarget { event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            return send("seek", e.positionTime)
        }))
    }
}
