import Foundation
import Darwin

@MainActor
final class ProcessManager {
    static let shared = ProcessManager()
    private var processes: [String: ManagedProcess] = [:]
    private let lock = NSLock()

    func startProcess(id: String, projectId: String? = nil, taskLabel: String? = nil, command: String, workingDirectory: String) {
        lock.lock()
        if let existing = processes[id] {
            existing.process?.terminate()
            processes[id] = nil
        }
        lock.unlock()

        let proc = ManagedProcess(
            id: id,
            projectId: projectId ?? id.components(separatedBy: "-").dropLast().joined(separator: "-"),
            taskLabel: taskLabel ?? id,
            command: command,
            workingDirectory: workingDirectory
        )

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", "cd \"\(workingDirectory)\" && \(command)"]
        process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)

        let outPipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe

        outPipe.fileHandleForReading.readabilityHandler = { [weak proc] handle in
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in
                proc?.logs.append(str)
            }
        }
        errPipe.fileHandleForReading.readabilityHandler = { [weak proc] handle in
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in
                proc?.logs.append(str)
            }
        }

        process.terminationHandler = { [weak proc] _ in
            Task { @MainActor in
                proc?.isRunning = false
                proc?.pid = nil
            }
        }

        do {
            try process.run()
            proc.process = process
            proc.isRunning = true
            proc.pid = process.processIdentifier
        } catch {
            proc.isRunning = false
        }

        lock.lock()
        processes[id] = proc
        lock.unlock()
    }

    func stopProcess(_ proc: ManagedProcess) {
        proc.process?.terminate()
        usleep(100_000)
        if proc.process?.isRunning == true {
            proc.process?.interrupt()
            usleep(100_000)
            if let pid = proc.pid {
                kill(pid, SIGKILL)
            }
        }
        lock.lock()
        processes.removeValue(forKey: proc.id)
        lock.unlock()
    }

    func getProcesses(for projectId: String) -> [ManagedProcess] {
        lock.lock()
        let result = processes.values.filter { $0.projectId == projectId || $0.id.hasPrefix(projectId + "-") }
        lock.unlock()
        return Array(result)
    }

    func getAllProcesses() -> [ManagedProcess] {
        lock.lock()
        let result = Array(processes.values)
        lock.unlock()
        return result
    }
}
