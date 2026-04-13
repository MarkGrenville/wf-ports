import SwiftUI

struct ProjectDetailSheet: View {
    let project: Project
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(project.name)
                    .font(.title)
                Spacer()
                Button("Close") { dismiss() }
            }

            Group {
                DetailRow(label: "ID", value: project.id)
                DetailRow(label: "Path", value: project.projectPath)
                DetailRow(label: "Config", value: project.configPath)
            }

            if !project.services.isEmpty {
                VStack(alignment: .leading) {
                    Text("Services")
                        .font(.headline)
                    ForEach(project.services) { service in
                        HStack {
                            Text(service.name)
                            Text(":\(service.port)")
                            Text(service.url)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            if let git = project.gitInfo {
                VStack(alignment: .leading) {
                    Text("Git")
                        .font(.headline)
                    DetailRow(label: "Branch", value: git.branch ?? "—")
                    DetailRow(label: "Status", value: (git.status?.hasUncommittedChanges == true) ? "Uncommitted changes" : "Clean")
                    if let url = git.repoUrl {
                        Button("Open Repository") { URLOpener.openURL(url) }
                    }
                }
            }

            if FirebaseConsoleLinks.getFirebaseProjectId(from: project) != nil {
                VStack(alignment: .leading) {
                    Text("Firebase")
                        .font(.headline)
                    HStack {
                        Button("Firebase Console") {
                            if let id = FirebaseConsoleLinks.getFirebaseProjectId(from: project) {
                                URLOpener.openURL("https://console.firebase.google.com/project/\(id)")
                            }
                        }
                        Button("Google Cloud Console") {
                            if let id = FirebaseConsoleLinks.getFirebaseProjectId(from: project) {
                                URLOpener.openURL("https://console.cloud.google.com?project=\(id)")
                            }
                        }
                    }
                }
            }

            Spacer()
        }
        .padding()
        .frame(minWidth: 500, minHeight: 400)
    }
}

struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text("\(label):")
                .fontWeight(.medium)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
        }
    }
}
