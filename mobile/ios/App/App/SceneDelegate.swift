import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// FloorTest's screen: the Capacitor web view, plus native touches so it feels like an app, not a website in a box.
class MainViewController: CAPBridgeViewController {
    private let refresher = UIRefreshControl()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        // Same dark ink as the app behind every edge, so overscroll and loading never flash white.
        let ink = UIColor(red: 16 / 255, green: 17 / 255, blue: 15 / 255, alpha: 1)
        view.backgroundColor = ink
        webView.isOpaque = false
        webView.backgroundColor = ink
        webView.scrollView.backgroundColor = ink
        // Pull down to refresh, like any native list.
        refresher.tintColor = UIColor(red: 213 / 255, green: 1, blue: 72 / 255, alpha: 1)
        refresher.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresher
        webView.allowsBackForwardNavigationGestures = true
    }

    @objc private func pullToRefresh() {
        webView?.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in self?.refresher.endRefreshing() }
    }
}
