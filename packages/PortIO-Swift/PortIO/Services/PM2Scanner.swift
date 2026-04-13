import Foundation

actor PM2Scanner {
    static let shared = PM2Scanner()
    private let shell = ShellExecutor.shared

    func listProcesses() async -> [PM2Process] {
        let env = "PM2_NO_COLOR=1 NO_COLOR=1 FORCE_COLOR=0"
        guard let output = try? await shell.run("\(env) pm2 jlist --no-color 2>/dev/null", timeout: 10) else {
            return []
        }

        guard let jsonStart = output.firstIndex(of: "[") else { return [] }
        let jsonString = String(output[jsonStart...])
        guard let data = jsonString.data(using: .utf8) else { return [] }

        guard let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }

        return list.compactMap { entry -> PM2Process? in
            guard let name = entry["name"] as? String,
                  let pm2Id = entry["pm_id"] as? Int else { return nil }

            let pm2Env = entry["pm2_env"] as? [String: Any]
            let status = pm2Env?["status"] as? String ?? "unknown"
            let monit = entry["monit"] as? [String: Any]

            return PM2Process(
                name: name,
                pm2Id: pm2Id,
                pid: entry["pid"] as? Int,
                status: status,
                cpu: monit?["cpu"] as? Double,
                memory: monit?["memory"] as? Int
            )
        }
    }

    func getProcesses(for projectId: String, pm2Prefix: String? = nil) async -> [PM2Process] {
        let all = await listProcesses()
        let prefix = pm2Prefix ?? projectId
        return all.filter { $0.name.hasPrefix(prefix + "-") }
    }

    func deleteProcess(name: String) async {
        _ = try? await shell.run("pm2 delete \"\(name)\" 2>/dev/null", timeout: 10)
    }

    func restartProcess(name: String) async {
        _ = try? await shell.run("pm2 restart \"\(name)\" 2>/dev/null", timeout: 10)
    }

    func getLogs(name: String, lines: Int = 50) async -> String {
        (try? await shell.run("pm2 logs \"\(name)\" --lines \(lines) --nostream 2>/dev/null", timeout: 10)) ?? ""
    }
}
