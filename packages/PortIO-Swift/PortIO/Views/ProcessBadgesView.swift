import SwiftUI

struct PM2ProcessBadgesView: View {
    let project: Project
    @ObservedObject var appState: AppState

    var processes: [PM2Process] {
        appState.pm2ProcessesForProject(project)
    }

    var body: some View {
        if processes.isEmpty {
            Text("—")
                .foregroundColor(.secondary)
        } else {
            HStack(alignment: .top, spacing: 4) {
                ForEach(processes) { proc in
                    PM2ProcessBadgeView(process: proc, appState: appState)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct PM2ProcessBadgeView: View {
    let process: PM2Process
    @ObservedObject var appState: AppState
    @State private var showLogs = false
    @State private var logContent = ""

    var body: some View {
        Menu {
            Button("View Logs") {
                Task {
                    logContent = await PM2Scanner.shared.getLogs(name: process.name, lines: 100)
                    showLogs = true
                }
            }
            Button("Restart") {
                Task { await appState.restartPM2Process(process) }
            }
            Divider()
            Button("Delete", role: .destructive) {
                Task { await appState.stopPM2Process(process) }
            }
        } label: {
            Text(process.taskLabel)
                .font(.caption)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(process.isOnline ? Color.blue.opacity(0.3) : Color.gray.opacity(0.3))
                .foregroundColor(.white)
                .cornerRadius(4)
        }
        .sheet(isPresented: $showLogs) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Logs: \(process.name)")
                        .font(.headline)
                    Spacer()
                    Button("Close") { showLogs = false }
                }
                ScrollView {
                    Text(logContent.isEmpty ? "No logs available" : logContent)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
            }
            .padding()
            .frame(minWidth: 600, minHeight: 400)
        }
    }
}
