import Foundation

struct Project: Codable, Identifiable {
    var id: String
    var name: String
    var services: [Service]
    var description: String?
    var faviconPath: String?
    var focusIdentifier: String?
    var projectPath: String
    var projectBackendPath: String?
    var configPath: String
    var directoryName: String
    var pathExists: Bool
    var firebaseProjectId: String?
    var pm2Prefix: String?
    var favicon: String?
    var vscodeTasksInfo: VSCodeTasksInfo?
    var startAllTasks: [VSCodeTask]
    var hasStartAllTasks: Bool
    var gitInfo: GitInfo?
    var firebaseInfo: FirebaseInfo?

    enum CodingKeys: String, CodingKey {
        case id, name, services, description, faviconPath, focusIdentifier
        case projectPath, projectBackendPath, configPath, directoryName, pathExists
        case firebaseProjectId, pm2Prefix, favicon, vscodeTasksInfo, startAllTasks, hasStartAllTasks
        case gitInfo, firebaseInfo
    }
}
