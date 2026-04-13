import Foundation
import Darwin

actor PortScanner {
    private let shell = ShellExecutor.shared

    func checkPorts(for projects: [Project]) async -> [String: [PortStatus]] {
        var result: [String: [PortStatus]] = [:]
        let portToService = buildPortServiceMap(projects: projects)

        for project in projects {
            var statuses: [PortStatus] = []
            for service in project.services {
                let status = await checkPort(port: service.port, serviceName: service.name)
                statuses.append(status)
            }
            result[project.id] = statuses
        }
        return result
    }

    private func checkPort(port: Int, serviceName: String) async -> PortStatus {
        let pids = await getPidsOnPort(port)
        if let pid = pids.first {
            let processName = await getProcessName(pid: pid)
            return PortStatus(
                port: port,
                serviceName: serviceName,
                isRunning: true,
                pid: pid,
                processName: processName
            )
        }
        return PortStatus(
            port: port,
            serviceName: serviceName,
            isRunning: false,
            pid: nil,
            processName: nil
        )
    }

    private func getPidsOnPort(_ port: Int) async -> [Int32] {
        let command = "lsof -i :\(port) -t 2>/dev/null"
        guard let output = try? await shell.run(command), !output.isEmpty else {
            return []
        }
        return output.split(separator: "\n").compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }
    }

    private func getProcessName(pid: Int32) async -> String? {
        let command = "ps -p \(pid) -o comm= 2>/dev/null"
        let output = try? await shell.run(command)
        return output?.trimmingCharacters(in: .whitespaces).nilIfEmpty
    }

    func killPorts(_ ports: [Int]) async {
        for port in ports {
            let pids = await getPidsOnPort(port)
            for pid in pids {
                kill(pid, SIGTERM)
                usleep(100_000)
                if processExists(pid) {
                    kill(pid, SIGKILL)
                }
            }
        }
    }

    private func processExists(_ pid: Int32) -> Bool {
        kill(pid, 0) == 0
    }

    private func buildPortServiceMap(projects: [Project]) -> [Int: String] {
        var map: [Int: String] = [:]
        for project in projects {
            for service in project.services {
                map[service.port] = service.name
            }
        }
        return map
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
