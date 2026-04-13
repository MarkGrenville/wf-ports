import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var projects: [Project] = []
    @Published var portStatuses: [String: [PortStatus]] = [:]
    @Published var pm2Processes: [PM2Process] = []
    @Published var managedProcesses: [ManagedProcess] = []
    @Published var loading = false
    @Published var checking = false
    @Published var lastUpdated: Date?
    @Published var error: String?
    @Published var selectedProjectForDetail: Project?

    private let firestoreService = FirestoreService()
    private let portScanner = PortScanner()
    private let processManager = ProcessManager.shared
    private var refreshTimer: AnyCancellable?
    private var cancellables = Set<AnyCancellable>()

    init() {
        setupAutoRefresh()
    }

    func loadProjectsFromFirestore() async {
        loading = true
        error = nil
        do {
            projects = try await firestoreService.getAllProjects()
            await refreshStatus()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func rescanProjects() async {
        loading = true
        error = nil
        do {
            let scanned = try await ProjectScanner.shared.scanProjects()
            try await firestoreService.saveProjects(scanned)
            projects = try await firestoreService.getAllProjects()
            await refreshStatus()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func refreshStatus() async {
        checking = true
        portStatuses = await portScanner.checkPorts(for: projects)
        pm2Processes = await PM2Scanner.shared.listProcesses()
        managedProcesses = processManager.getAllProcesses()
        lastUpdated = Date()
        checking = false
    }

    func killPorts(projectId: String, ports: [Int]) async {
        await portScanner.killPorts(ports)
        await scheduleRefresh()
    }

    func stopPM2Process(_ process: PM2Process) async {
        await PM2Scanner.shared.deleteProcess(name: process.name)
        await scheduleRefresh()
    }

    func restartPM2Process(_ process: PM2Process) async {
        await PM2Scanner.shared.restartProcess(name: process.name)
        await scheduleRefresh()
    }

    func stopProcess(_ process: ManagedProcess) async {
        processManager.stopProcess(process)
        await scheduleRefresh()
    }

    func stopAllForProject(_ project: Project) async {
        let projectPorts = project.services.map { $0.port }
        await portScanner.killPorts(projectPorts)

        let prefix = project.pm2Prefix ?? project.id
        let pm2Procs = pm2Processes.filter { $0.name.hasPrefix(prefix + "-") }
        for proc in pm2Procs {
            await PM2Scanner.shared.deleteProcess(name: proc.name)
        }

        let localProcesses = processManager.getProcesses(for: project.id)
        for proc in localProcesses {
            processManager.stopProcess(proc)
        }
        await scheduleRefresh()
    }

    func executeTask(project: Project, task: VSCodeTask) async {
        guard let command = VSCodeTaskParser.extractCommand(from: task) else { return }
        let workingDir = project.projectBackendPath ?? project.projectPath
        let processId = "\(project.id)-\(task.label)"
        processManager.startProcess(
            id: processId,
            projectId: project.id,
            taskLabel: task.label,
            command: command,
            workingDirectory: workingDir
        )
        await scheduleRefresh()
    }

    func pm2ProcessesForProject(_ project: Project) -> [PM2Process] {
        let prefix = project.pm2Prefix ?? project.id
        return pm2Processes.filter { $0.name.hasPrefix(prefix + "-") }
    }

    private func scheduleRefresh() async {
        await refreshStatus()
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        await refreshStatus()
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        await refreshStatus()
    }

    private func setupAutoRefresh() {
        refreshTimer = Timer.publish(every: 60, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task { @MainActor in
                    guard let self = self, !self.projects.isEmpty else { return }
                    await self.refreshStatus()
                }
            }
    }
}
