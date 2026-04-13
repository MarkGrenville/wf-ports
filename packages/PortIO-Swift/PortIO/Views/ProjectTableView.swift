import SwiftUI

struct ProjectTableView: View {
    @EnvironmentObject var appState: AppState

    var sortedProjects: [Project] {
        let projects = appState.projects
        let hasActivity: (Project) -> Bool = { project in
            let ports = appState.portStatuses[project.id] ?? []
            let processes = appState.pm2Processes.filter {
                $0.name.hasPrefix(project.id + "-") || $0.name.hasPrefix((project.pm2Prefix ?? project.id) + "-")
            }
            return ports.contains { $0.isRunning } || !processes.isEmpty
        }
        return projects.sorted { p1, p2 in
            let a1 = hasActivity(p1)
            let a2 = hasActivity(p2)
            if a1 != a2 { return a1 }
            return p1.name.localizedCaseInsensitiveCompare(p2.name) == .orderedAscending
        }
    }

    var body: some View {
        Table(sortedProjects, selection: .constant(nil)) {
            TableColumn("") { project in
                ProjectIconView(project: project)
            }
            .width(40)

            TableColumn("Project") { project in
                Button(project.name) {
                    appState.selectedProjectForDetail = project
                }
                .buttonStyle(.plain)
            }
            .width(min: 120, ideal: 150, max: 250)

            TableColumn("Quick Actions") { project in
                QuickActionsView(project: project)
            }
            .width(min: 100, ideal: 140, max: 160)

            TableColumn("Tasks") { project in
                TaskPickerView(project: project, appState: appState)
            }
            .width(min: 150, ideal: 200, max: 300)

            TableColumn("Active Ports") { project in
                PortBadgesView(project: project, appState: appState)
            }
            .width(min: 150, ideal: 250, max: nil)

            TableColumn("Processes") { project in
                PM2ProcessBadgesView(project: project, appState: appState)
            }
            .width(min: 150, ideal: 250, max: nil)

            TableColumn("Stop") { project in
                StopButtonView(project: project, appState: appState)
            }
            .width(80)

            TableColumn("Git") { project in
                GitStatusView(project: project)
            }
            .width(min: 80, ideal: 120, max: 180)
        }
        .tableStyle(.bordered)
    }
}
