import SwiftUI

struct StopButtonView: View {
    let project: Project
    @ObservedObject var appState: AppState
    @State private var stopping = false

    var hasActivity: Bool {
        let ports = appState.portStatuses[project.id] ?? []
        let pm2Procs = appState.pm2ProcessesForProject(project)
        return ports.contains { $0.isRunning } || !pm2Procs.isEmpty
    }

    var body: some View {
        Button("Stop All") {
            stopping = true
            Task {
                await appState.stopAllForProject(project)
                stopping = false
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
        .disabled(!hasActivity || stopping)
    }
}
