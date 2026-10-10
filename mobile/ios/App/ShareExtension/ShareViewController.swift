import UIKit
import UniformTypeIdentifiers

/// "Share to FloorTest": copies the shared WAV/MP3 files into the app group's Inbox and opens FloorTest on the Send
/// page, where the usual form (who it's for, title, genre…) takes over. Nothing is uploaded from here.
class ShareViewController: UIViewController {
    private let ink = UIColor(red: 16 / 255, green: 17 / 255, blue: 15 / 255, alpha: 1)
    private let lime = UIColor(red: 213 / 255, green: 1, blue: 72 / 255, alpha: 1)
    private let message = UILabel()
    private let button = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ink
        message.textColor = .white
        message.font = .monospacedSystemFont(ofSize: 16, weight: .semibold)
        message.numberOfLines = 0
        message.textAlignment = .center
        message.text = "Adding to FloorTest…"
        button.setTitle("Done", for: .normal)
        button.titleLabel?.font = .monospacedSystemFont(ofSize: 15, weight: .bold)
        button.setTitleColor(ink, for: .normal)
        button.backgroundColor = lime
        button.layer.cornerRadius = 10
        button.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        button.isHidden = true
        button.addTarget(self, action: #selector(close), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [message, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
        ])
        Task { await collect() }
    }

    private func collect() async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let audio = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.audio.identifier) }.prefix(3)
        var saved = 0
        var refused = false
        for p in audio {
            guard let url = await fileURL(from: p) else { continue }
            let ext = url.pathExtension.lowercased()
            guard ext == "wav" || ext == "mp3" else { refused = true; continue }
            if save(url) { saved += 1 }
        }
        await MainActor.run { finish(saved: saved, refused: refused) }
    }

    /// The file behind a share, as a temporary copy we're allowed to read.
    private func fileURL(from p: NSItemProvider) async -> URL? {
        await withCheckedContinuation { done in
            _ = p.loadFileRepresentation(forTypeIdentifier: UTType.audio.identifier) { url, _ in
                guard let url else { return done.resume(returning: nil) }
                // The system deletes `url` when this returns, so copy it somewhere of ours first.
                let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                let copy = tmp.appendingPathComponent(url.lastPathComponent)
                do {
                    try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
                    try FileManager.default.copyItem(at: url, to: copy)
                    done.resume(returning: copy)
                } catch {
                    done.resume(returning: nil)
                }
            }
        }
    }

    private func save(_ file: URL) -> Bool {
        guard let inbox = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.app.floortest")?
            .appendingPathComponent("Inbox", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true) else { return false }
        do {
            try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: file, to: inbox.appendingPathComponent(file.lastPathComponent))
            return true
        } catch {
            return false
        }
    }

    private func finish(saved: Int, refused: Bool) {
        if saved == 0 {
            message.text = refused ? "FloorTest takes WAV and MP3 files." : "Couldn't add that file. Try again."
            button.isHidden = false
            return
        }
        // Straight into the app, on the Send page.
        if openApp(URL(string: "floortest://send")!) { return close() }
        message.text = saved == 1 ? "Added. Open FloorTest to send it." : "Added. Open FloorTest to send them."
        button.isHidden = false
    }

    /// Extensions can't call UIApplication.shared, but the app object is still up the responder chain.
    private func openApp(_ url: URL) -> Bool {
        var r: UIResponder? = self
        while let next = r {
            if let app = next as? UIApplication {
                app.open(url, options: [:], completionHandler: nil)
                return true
            }
            r = next.next
        }
        return false
    }

    @objc private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
