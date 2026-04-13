import SwiftUI

struct MainWindowView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            if appState.projects.isEmpty && !appState.loading {
                ContentUnavailableView(
                    "No Projects",
                    systemImage: "folder.badge.questionmark",
                    description: Text("Click \"Rescan Projects\" to scan for wf-ports.json files and load from Firestore.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
            ToolbarView()
            Divider()
            if appState.loading {
                Spacer()
                ProgressView("Loading...")
                Spacer()
            } else {
                ProjectTableView()
            }
            }
        }
        .background(Color(red: 0.12, green: 0.12, blue: 0.12))
        .alert("Error", isPresented: .constant(appState.error != nil)) {
            Button("OK") { appState.error = nil }
        } message: {
            Text(appState.error ?? "")
        }
        .sheet(item: $appState.selectedProjectForDetail) { project in
            ProjectDetailSheet(project: project)
        }
        .task {
            await appState.loadProjectsFromFirestore()
        }
    }
}

struct ToolbarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack {
            Button(action: { Task { await appState.rescanProjects() } }) {
                Label("Rescan Projects", systemImage: "arrow.clockwise.circle")
            }
            .disabled(appState.loading)

            Button(action: { Task { await appState.refreshStatus() } }) {
                Label("Refresh Status", systemImage: "arrow.clockwise")
            }
            .disabled(appState.checking)

            Spacer()

            if let last = appState.lastUpdated {
                Text("Last updated: \(last.formatted(date: .omitted, time: .shortened))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(red: 0.12, green: 0.12, blue: 0.12))
    }
}
