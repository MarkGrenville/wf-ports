import Foundation

struct VSCodeTask: Codable, Identifiable {
    var label: String
    var type: String?
    var command: String?
    var options: TaskOptions?
    var dependsOn: [String]?
    var presentation: TaskPresentation?
    var group: TaskGroup?
    var execution: TaskExecution?

    var id: String { label }

    var resolvedCommand: String? {
        if let cmd = command { return cmd }
        if let exec = execution?.command { return exec }
        return nil
    }

    struct TaskOptions: Codable {
        var cwd: String?
        var env: [String: String]?
    }

    struct TaskPresentation: Codable {
        var reveal: String?
        var panel: String?
    }

    struct TaskGroup: Codable {
        var kind: String?
        var isDefault: Bool?
    }

    struct TaskExecution: Codable {
        var command: String?
        var args: [String]?
    }
}

struct VSCodeTasksInfo: Codable {
    var tasksPath: String?
    var tasks: [VSCodeTask]
    var version: String?
}
