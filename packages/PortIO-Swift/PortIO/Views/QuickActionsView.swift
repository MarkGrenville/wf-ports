import SwiftUI

struct QuickActionsView: View {
    let project: Project

    var body: some View {
        HStack(spacing: 4) {
            Button(action: { URLOpener.openFinder(path: project.projectPath) }) {
                Image(systemName: "folder")
            }
            .buttonStyle(.plain)
            .help("Open in Finder")

            Button(action: { URLOpener.openCursor(at: project.projectPath) }) {
                Image(systemName: "chevron.left.forwardslash.chevron.right")
            }
            .buttonStyle(.plain)
            .help("Open in Cursor")

            if let projectId = FirebaseConsoleLinks.getFirebaseProjectId(from: project) {
                Button(action: {
                    URLOpener.openURL("https://console.firebase.google.com/project/\(projectId)")
                }) {
                    Image(systemName: "flame")
                }
                .buttonStyle(.plain)
                .help("Firebase Console")

                Button(action: {
                    URLOpener.openURL("https://console.cloud.google.com?project=\(projectId)")
                }) {
                    Image(systemName: "cloud")
                }
                .buttonStyle(.plain)
                .help("Google Cloud Console")
            }
        }
    }
}
