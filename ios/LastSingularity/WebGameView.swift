import SwiftUI
import WebKit

struct WebGameView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.setURLSchemeHandler(WebAppSchemeHandler(), forURLScheme: "lbh")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.load(URLRequest(url: launchURL()))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
    }

    private func launchURL() -> URL {
        var components = URLComponents()
        components.scheme = "lbh"
        components.host = "app"
        components.path = "/index.html"

        let simServer = Bundle.main.object(forInfoDictionaryKey: "LBHSimServerURL")
            .flatMap { $0 as? String }?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if simServer.isEmpty || simServer == "$(LBH_SIM_SERVER_URL)" {
            components.queryItems = [
                URLQueryItem(name: "localSandbox", value: "1"),
                URLQueryItem(name: "renderer", value: "three"),
            ]
        } else {
            components.queryItems = [
                URLQueryItem(name: "simServer", value: simServer),
                URLQueryItem(name: "renderer", value: "three"),
            ]
        }

        guard let url = components.url else {
            fatalError("Could not construct Last Singularity launch URL.")
        }
        return url
    }
}
