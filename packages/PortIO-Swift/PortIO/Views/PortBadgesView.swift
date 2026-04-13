import SwiftUI

struct PortBadgesView: View {
    let project: Project
    @ObservedObject var appState: AppState

    var statuses: [PortStatus] {
        (appState.portStatuses[project.id] ?? []).sorted { $0.port < $1.port }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 4) {
            ForEach(statuses) { status in
                PortBadgeView(project: project, status: status, appState: appState)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PortBadgeView: View {
    let project: Project
    let status: PortStatus
    @ObservedObject var appState: AppState
    @State private var killing = false

    var body: some View {
        HStack(spacing: 4) {
            if status.isRunning {
                Button(action: {
                    if let url = URL(string: "http://localhost:\(status.port)") {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    Text("\(status.serviceName):\(status.port)")
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.3))
                        .foregroundColor(.white)
                        .cornerRadius(4)
                }
                .buttonStyle(.plain)

                Button(action: {
                    killing = true
                    Task {
                        await appState.killPorts(projectId: project.id, ports: [status.port])
                        killing = false
                    }
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .disabled(killing)
            } else {
                Text("\(status.serviceName):\(status.port)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}
