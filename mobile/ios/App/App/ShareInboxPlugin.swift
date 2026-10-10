import Foundation
import Capacitor

/// Share to FloorTest: the share extension drops audio files into the app group's Inbox; the Send page reads them
/// through this plugin (as `Capacitor.Plugins.ShareInbox`) and removes them once they're sent.
enum ShareInbox {
    static let group = "group.app.floortest"

    /// Inbox/<uuid>/<file name>. Anything older than a day is cleared, so nothing lingers on the phone.
    static var folder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("Inbox", isDirectory: true)
    }

    struct Entry { let id: String; let url: URL; let size: Int }

    static func entries() -> [Entry] {
        guard let folder, let ids = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.creationDateKey]) else { return [] }
        var out: [Entry] = []
        for dir in ids {
            let created = (try? dir.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? Date()
            if Date().timeIntervalSince(created) > 86_400 { try? FileManager.default.removeItem(at: dir); continue }
            guard let file = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey]))?.first else { continue }
            let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            out.append(Entry(id: dir.lastPathComponent, url: file, size: size))
        }
        return out
    }

    /// Only ids the inbox itself made (UUIDs), so a page can never reach outside it.
    static func entry(_ id: String?) -> Entry? {
        guard let id, UUID(uuidString: id) != nil else { return nil }
        return entries().first { $0.id == id }
    }
}

@objc(ShareInboxPlugin)
public class ShareInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareInboxPlugin"
    public let jsName = "ShareInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    @objc func list(_ call: CAPPluginCall) {
        call.resolve(["files": ShareInbox.entries().map { ["id": $0.id, "name": $0.url.lastPathComponent, "size": $0.size] }])
    }

    /// One piece of a file, base64 (the page asks for 2 MB at a time).
    @objc func read(_ call: CAPPluginCall) {
        guard let e = ShareInbox.entry(call.getString("id")) else { return call.reject("Not found") }
        let offset = max(0, call.getInt("offset") ?? 0)
        let length = min(max(0, call.getInt("length") ?? 0), 8 * 1024 * 1024)
        do {
            let h = try FileHandle(forReadingFrom: e.url)
            defer { try? h.close() }
            try h.seek(toOffset: UInt64(offset))
            let data = try h.read(upToCount: length) ?? Data()
            call.resolve(["data": data.base64EncodedString()])
        } catch {
            call.reject("Couldn't read the file")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        if let e = ShareInbox.entry(call.getString("id")) { try? FileManager.default.removeItem(at: e.url.deletingLastPathComponent()) }
        call.resolve()
    }
}
