import SwiftUI

@main
struct LastSingularityApp: App {
    var body: some Scene {
        WindowGroup {
            WebGameView()
                .ignoresSafeArea()
                .persistentSystemOverlays(.hidden)
        }
    }
}
