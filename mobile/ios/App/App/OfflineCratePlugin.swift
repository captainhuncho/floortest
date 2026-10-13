import Foundation
import Capacitor

/// Offline kept tracks: Prepare's kept tracks saved in the app's private storage (not backed up), for the offline screen
/// to play with no connection. The phone's copy always matches the last sync: tracks no longer in Prepare are deleted,
/// another account's copy is wiped, and everything is wiped if Prepare hasn't been opened online for `maxDays` (30).
enum OfflineCrate {
    struct Track: Codable { let id: Int; let title: String; let artist: String; let duration: Double?; let file: String }
    struct Manifest: Codable { var owner: Int; var syncedAt: Double; var maxDays: Double; var tracks: [Track] }

    static var folder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Offline", isDirectory: true)
        if !FileManager.default.fileExists(atPath: base.path) {
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            var url = base
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
        }
        return base
    }
    static var manifestURL: URL { folder.appendingPathComponent("manifest.json") }

    /// The current copy, or nil (and wiped) if there is none or it's past its check-in date.
    static func manifest() -> Manifest? {
        guard let data = try? Data(contentsOf: manifestURL), let m = try? JSONDecoder().decode(Manifest.self, from: data) else { return nil }
        if Date().timeIntervalSince1970 * 1000 - m.syncedAt > m.maxDays * 86_400_000 { wipe(); return nil }
        return m
    }

    static func save(_ m: Manifest) {
        if let data = try? JSONEncoder().encode(m) { try? data.write(to: manifestURL, options: .atomic) }
    }

    static func wipe() {
        try? FileManager.default.removeItem(at: folder)
    }

    /// Bumped by clear(): a sync started before it stops, and leaves nothing behind.
    static var generation = 0
    static let lock = NSLock()

    /// Cleared (signed out, or Remove from phone) since `gen` started: wipe whatever that sync put back.
    static func stale(_ gen: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if gen == generation { return false }
        wipe()
        return true
    }
}

@objc(OfflineCratePlugin)
public class OfflineCratePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfflineCratePlugin"
    public let jsName = "OfflineCrate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]
    private var syncing = false
    private var done = 0
    private var total = 0

    /// { owner, maxDays, tracks: [{ id, title, artist, duration, url }] }. Resolves at once; "progress" events follow.
    @objc func sync(_ call: CAPPluginCall) {
        guard let owner = call.getInt("owner"), let list = call.getArray("tracks") as? [[String: Any]] else { return call.reject("Bad request") }
        let maxDays = call.getDouble("maxDays") ?? 30
        if syncing { return call.resolve(["started": false]) }
        syncing = true
        call.resolve(["started": true])
        OfflineCrate.lock.lock()
        let gen = OfflineCrate.generation
        OfflineCrate.lock.unlock()
        Task.detached { [weak self] in await self?.run(owner: owner, maxDays: maxDays, list: list, gen: gen) }
    }

    private func run(owner: Int, maxDays: Double, list: [[String: Any]], gen: Int) async {
        defer { syncing = false }
        // Another account's copy never mixes with this one.
        var current = OfflineCrate.manifest()
        if current?.owner != owner { OfflineCrate.wipe(); current = nil }
        let have = Dictionary(uniqueKeysWithValues: (current?.tracks ?? []).map { ($0.id, $0) })
        var kept: [OfflineCrate.Track] = []
        done = 0
        total = list.count
        for item in list {
            if OfflineCrate.stale(gen) { return }
            guard let id = item["id"] as? Int, let urlString = item["url"] as? String, let url = URL(string: urlString) else { continue }
            let title = item["title"] as? String ?? ""
            let artist = item["artist"] as? String ?? ""
            let duration = item["duration"] as? Double
            if let old = have[id], FileManager.default.fileExists(atPath: OfflineCrate.folder.appendingPathComponent(old.file).path) {
                kept.append(OfflineCrate.Track(id: id, title: title, artist: artist, duration: duration, file: old.file))
            } else if let file = await download(url, id: id) {
                kept.append(OfflineCrate.Track(id: id, title: title, artist: artist, duration: duration, file: file))
            }
            done += 1
            notifyListeners("progress", data: ["done": done, "total": total])
        }
        // Anything not in Prepare any more leaves the phone. The manifest is written only if nothing cleared the copy
        // meanwhile (checked under the same lock clear() takes).
        OfflineCrate.lock.lock()
        if gen != OfflineCrate.generation {
            OfflineCrate.wipe()
            OfflineCrate.lock.unlock()
            return
        }
        let keep = Set(kept.map(\.file) + ["manifest.json"])
        for f in (try? FileManager.default.contentsOfDirectory(atPath: OfflineCrate.folder.path)) ?? [] where !keep.contains(f) {
            try? FileManager.default.removeItem(at: OfflineCrate.folder.appendingPathComponent(f))
        }
        OfflineCrate.save(OfflineCrate.Manifest(owner: owner, syncedAt: Date().timeIntervalSince1970 * 1000, maxDays: maxDays, tracks: kept))
        OfflineCrate.lock.unlock()
        notifyListeners("progress", data: ["done": done, "total": total, "finished": true, "saved": kept.count])
    }

    private func download(_ url: URL, id: Int) async -> String? {
        guard let (tmp, res) = try? await URLSession.shared.download(from: url),
              let http = res as? HTTPURLResponse, http.statusCode == 200 else { return nil }
        let ext = (http.mimeType ?? "").contains("mpeg") ? "mp3" : "wav"
        let name = "\(id).\(ext)"
        let dest = OfflineCrate.folder.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.moveItem(at: tmp, to: dest) } catch { return nil }
        return name
    }

    @objc func status(_ call: CAPPluginCall) {
        let m = OfflineCrate.manifest()
        var out: [String: Any] = ["count": m?.tracks.count ?? 0, "syncing": syncing, "done": done, "total": total]
        if let m { out["owner"] = m.owner; out["syncedAt"] = m.syncedAt }
        call.resolve(out)
    }

    /// The saved tracks, each with a file path for Capacitor.convertFileSrc.
    @objc func list(_ call: CAPPluginCall) {
        let tracks = (OfflineCrate.manifest()?.tracks ?? []).map { t -> [String: Any] in
            ["id": t.id, "title": t.title, "artist": t.artist, "duration": t.duration ?? 0, "path": OfflineCrate.folder.appendingPathComponent(t.file).absoluteString]
        }
        call.resolve(["tracks": tracks])
    }

    @objc func clear(_ call: CAPPluginCall) {
        OfflineCrate.lock.lock()
        OfflineCrate.generation += 1
        OfflineCrate.wipe()
        OfflineCrate.lock.unlock()
        call.resolve()
    }
}
