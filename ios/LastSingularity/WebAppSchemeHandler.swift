import Foundation
import WebKit

final class WebAppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let rootURL: URL

    override init() {
        guard let resourceURL = Bundle.main.resourceURL else {
            fatalError("Bundle resource URL is unavailable.")
        }
        self.rootURL = resourceURL.appendingPathComponent("WebApp", isDirectory: true)
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            fail(urlSchemeTask, code: .badURL)
            return
        }

        let rawPath = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
        guard let decodedPath = rawPath.removingPercentEncoding else {
            fail(urlSchemeTask, code: .badURL)
            return
        }

        let relativePath = decodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let fileURL = rootURL.appendingPathComponent(relativePath).standardizedFileURL
        let rootPath = rootURL.standardizedFileURL.path

        guard fileURL.path == rootPath || fileURL.path.hasPrefix(rootPath + "/") else {
            fail(urlSchemeTask, code: .noPermissionsToReadFile)
            return
        }

        do {
            let data = try Data(contentsOf: fileURL)
            let response = URLResponse(
                url: url,
                mimeType: mimeType(for: fileURL.pathExtension),
                expectedContentLength: data.count,
                textEncodingName: "utf-8"
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            fail(urlSchemeTask, code: .fileDoesNotExist)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    }

    private func fail(_ task: WKURLSchemeTask, code: CocoaError.Code) {
        task.didFailWithError(NSError(domain: NSCocoaErrorDomain, code: code.rawValue))
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html":
            return "text/html"
        case "js", "mjs":
            return "text/javascript"
        case "css":
            return "text/css"
        case "json", "webmanifest", "map":
            return "application/json"
        case "png":
            return "image/png"
        case "jpg", "jpeg":
            return "image/jpeg"
        case "svg":
            return "image/svg+xml"
        case "wasm":
            return "application/wasm"
        case "wav":
            return "audio/wav"
        case "mp3":
            return "audio/mpeg"
        case "ogg":
            return "audio/ogg"
        default:
            return "application/octet-stream"
        }
    }
}
