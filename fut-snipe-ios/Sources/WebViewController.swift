import UIKit
import WebKit

/// Full-screen web view that loads the EA SPORTS FC Ultimate Team web app and
/// auto-injects the FUT Snipe engine (Resources/engine.js) on every main-frame load.
/// A persistent data store keeps the EA login between launches.
final class WebViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {

    private var webView: WKWebView!
    // The EA FC Ultimate Team web app entry point.
    private let startURL = URL(string: "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/")!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()              // persist cookies -> stay signed in
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.allowsInlineMediaPlayback = true

        if let url = Bundle.main.url(forResource: "engine", withExtension: "js"),
           let js = try? String(contentsOf: url, encoding: .utf8) {
            let script = WKUserScript(source: js,
                                      injectionTime: .atDocumentEnd,
                                      forMainFrameOnly: true)
            config.userContentController.addUserScript(script)
        }

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.uiDelegate = self
        wv.navigationDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { wv.isInspectable = true }   // lets you debug from a Mac if ever needed
        self.webView = wv
        self.view = wv
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: startURL))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // EA's sign-in sometimes opens a popup (window.open). Load it in the same web view
    // instead of dropping it, so login completes normally.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}
