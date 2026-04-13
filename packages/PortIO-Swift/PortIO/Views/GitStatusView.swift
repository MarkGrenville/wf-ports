import SwiftUI

struct GitStatusView: View {
    let project: Project

    var body: some View {
        if let git = project.gitInfo {
            Button(action: {
                if let url = git.repoUrl {
                    URLOpener.openURL(url)
                }
            }) {
                HStack(spacing: 4) {
                    Text(git.branch ?? "—")
                        .font(.caption)
                        .lineLimit(1)
                    if git.status?.hasUncommittedChanges == true {
                        Image(systemName: "circle.fill")
                            .font(.caption2)
                            .foregroundColor(.orange)
                    } else {
                        Image(systemName: "checkmark")
                            .font(.caption2)
                            .foregroundColor(.green)
                    }
                }
            }
            .buttonStyle(.plain)
        } else {
            Text("—")
                .foregroundColor(.secondary)
        }
    }
}
