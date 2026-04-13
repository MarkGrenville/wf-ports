import Foundation

struct VSCodeTaskParser {
    static func parseTasks(projectPath: String) -> VSCodeTasksInfo? {
        let tasksPath = (projectPath as NSString).appendingPathComponent(".vscode/tasks.json")
        guard let content = try? String(contentsOfFile: tasksPath, encoding: .utf8) else {
            return nil
        }

        let blockCommentPattern = try! NSRegularExpression(pattern: "/\\*[\\s\\S]*?\\*/", options: [])
        let lineCommentPattern = try! NSRegularExpression(pattern: "//[^\n]*", options: [])
        let range = NSRange(content.startIndex..<content.endIndex, in: content) ?? NSRange(location: 0, length: 0)
        var cleaned = blockCommentPattern.stringByReplacingMatches(in: content, range: range, withTemplate: "")
        let range2 = NSRange(cleaned.startIndex..<cleaned.endIndex, in: cleaned) ?? NSRange(location: 0, length: 0)
        cleaned = lineCommentPattern.stringByReplacingMatches(in: cleaned, range: range2, withTemplate: "")

        guard let data = cleaned.data(using: .utf8),
              let config = try? JSONDecoder().decode(VSCodeTasksConfig.self, from: data) else {
            return nil
        }

        return VSCodeTasksInfo(
            tasksPath: tasksPath,
            tasks: config.tasks ?? [],
            version: config.version ?? "2.0.0"
        )
    }

    static func findStartAllTasks(_ tasks: [VSCodeTask]) -> [VSCodeTask] {
        tasks.filter { task in
            let lower = task.label.lowercased()
            return lower.contains("start all") ||
                lower.contains("start everything") ||
                (lower.hasPrefix("a.") && (lower.contains("start all") || lower.contains("start everything")))
        }
    }

    static func extractCommand(from task: VSCodeTask) -> String? {
        if let cmd = task.command {
            return cmd
        }
        if let exec = task.execution?.command {
            if let args = task.execution?.args, !args.isEmpty {
                return exec + " " + args.joined(separator: " ")
            }
            return exec
        }
        return nil
    }
}

private struct VSCodeTasksConfig: Decodable {
    var version: String?
    var tasks: [VSCodeTask]?
}
