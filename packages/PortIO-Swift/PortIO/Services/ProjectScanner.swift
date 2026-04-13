import Foundation

struct ConfigFileResult {
    let configPath: String
    let projectPath: String
    let directoryName: String
    let pathExists: Bool
    let vscodeTasksInfo: VSCodeTasksInfo?
    let gitInfo: GitInfo?
    let firebaseInfo: FirebaseInfo?
}

actor ProjectScanner {
    static let shared = ProjectScanner()
    private let fileManager = FileManager.default
    private let projectsBasePath = NSHomeDirectory() + "/Projects"
    private let configFileName = "wf-ports.json"
    private let skipDirs = ["node_modules", ".git", ".next", "dist", "build", ".idea"]

    func scanProjects() async throws -> [Project] {
        let configFiles = try await findConfigFiles(dirPath: projectsBasePath, maxDepth: 2)
        var projects: [Project] = []

        for result in configFiles {
            do {
                let configData = try Data(contentsOf: URL(fileURLWithPath: result.configPath))
                var projectConfig = try JSONDecoder().decode(WFPortsConfig.self, from: configData)

                var finalFirebaseInfo = result.firebaseInfo
                if let backendPath = projectConfig.projectBackendPath {
                    if let backendFirebase = await FirebaseDetector.shared.getFirebaseInfo(projectPath: backendPath),
                       backendFirebase.isFirebaseProject == true {
                        finalFirebaseInfo = backendFirebase
                    }
                }
                if let firebaseId = projectConfig.firebaseProjectId {
                    if finalFirebaseInfo == nil {
                        finalFirebaseInfo = FirebaseInfo(
                            isFirebaseProject: true,
                            projectId: firebaseId,
                            currentProject: firebaseId,
                            projectAlias: nil,
                            firebaseConfig: nil,
                            hasFirebaseRC: nil,
                            availableProjects: nil,
                            firebaseTools: nil
                        )
                    } else {
                        var updated = finalFirebaseInfo!
                        updated.projectId = firebaseId
                        updated.currentProject = firebaseId
                        updated.isFirebaseProject = true
                        finalFirebaseInfo = updated
                    }
                }

                let startAllTasks = result.vscodeTasksInfo.map { VSCodeTaskParser.findStartAllTasks($0.tasks) } ?? []
                let projectId = projectConfig.id ?? result.directoryName.lowercased()
                    .components(separatedBy: CharacterSet.alphanumerics.inverted)
                    .filter { !$0.isEmpty }
                    .joined(separator: "-")

                let project = Project(
                    id: projectId,
                    name: projectConfig.name ?? result.directoryName,
                    services: projectConfig.services ?? [],
                    description: projectConfig.description,
                    faviconPath: projectConfig.faviconPath ?? projectConfig.favicon,
                    focusIdentifier: projectConfig.focusIdentifier,
                    projectPath: result.projectPath,
                    projectBackendPath: projectConfig.projectBackendPath,
                    configPath: result.configPath,
                    directoryName: result.directoryName,
                    pathExists: result.pathExists,
                    firebaseProjectId: projectConfig.firebaseProjectId ?? finalFirebaseInfo?.projectId,
                    favicon: nil,
                    vscodeTasksInfo: result.vscodeTasksInfo,
                    startAllTasks: startAllTasks,
                    hasStartAllTasks: !startAllTasks.isEmpty,
                    gitInfo: result.gitInfo,
                    firebaseInfo: finalFirebaseInfo
                )
                projects.append(project)
            } catch {
                print("Invalid wf-ports.json at \(result.configPath): \(error)")
            }
        }

        return projects
    }

    private func findConfigFiles(dirPath: String, maxDepth: Int, currentDepth: Int = 0) async throws -> [ConfigFileResult] {
        var results: [ConfigFileResult] = []
        if currentDepth >= maxDepth { return results }

        let configPath = (dirPath as NSString).appendingPathComponent(configFileName)
        if fileManager.fileExists(atPath: configPath) {
            let vscodeTasksInfo = VSCodeTaskParser.parseTasks(projectPath: dirPath)
            let gitInfo = await GitService.shared.getGitInfo(projectPath: dirPath)
            let firebaseInfo = await FirebaseDetector.shared.getFirebaseInfo(projectPath: dirPath)

            results.append(ConfigFileResult(
                configPath: configPath,
                projectPath: dirPath,
                directoryName: (dirPath as NSString).lastPathComponent,
                pathExists: true,
                vscodeTasksInfo: vscodeTasksInfo,
                gitInfo: gitInfo,
                firebaseInfo: firebaseInfo
            ))
        }

        if let entries = try? fileManager.contentsOfDirectory(atPath: dirPath) {
            for entry in entries {
                let fullPath = (dirPath as NSString).appendingPathComponent(entry)
                var isDir: ObjCBool = false
                guard fileManager.fileExists(atPath: fullPath, isDirectory: &isDir),
                      isDir.boolValue,
                      !skipDirs.contains(entry),
                      !entry.hasPrefix(".") else { continue }

                let subResults = try await findConfigFiles(dirPath: fullPath, maxDepth: maxDepth, currentDepth: currentDepth + 1)
                results.append(contentsOf: subResults)
            }
        }

        return results
    }
}

private struct WFPortsConfig: Decodable {
    var id: String?
    var name: String?
    var description: String?
    var faviconPath: String?
    var favicon: String?
    var focusIdentifier: String?
    var projectPath: String?
    var projectBackendPath: String?
    var firebaseProjectId: String?
    var services: [Service]?
}
