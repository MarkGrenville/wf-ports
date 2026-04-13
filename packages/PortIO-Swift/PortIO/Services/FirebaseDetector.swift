import Foundation

actor FirebaseDetector {
    static let shared = FirebaseDetector()
    private let shell = ShellExecutor.shared

    func getFirebaseInfo(projectPath: String) async -> FirebaseInfo? {
        var firebaseConfigPath = (projectPath as NSString).appendingPathComponent("firebase.json")

        if !FileManager.default.fileExists(atPath: firebaseConfigPath) {
            let subdirs = ["frontend", "backend", "web", "client", "server", "app"]
            for subdir in subdirs {
                let subdirPath = (projectPath as NSString).appendingPathComponent(subdir)
                let subdirConfig = (subdirPath as NSString).appendingPathComponent("firebase.json")
                if FileManager.default.fileExists(atPath: subdirConfig) {
                    firebaseConfigPath = subdirConfig
                    break
                }
            }
            if !FileManager.default.fileExists(atPath: firebaseConfigPath) {
                return nil
            }
        }

        var firebaseInfo = FirebaseInfo(
            isFirebaseProject: true,
            projectId: nil,
            currentProject: nil,
            projectAlias: nil,
            firebaseConfig: nil,
            hasFirebaseRC: false,
            availableProjects: nil,
            firebaseTools: FirebaseInfo.FirebaseTools(hasFirebaseCLI: false, version: nil)
        )

        if let version = try? await shell.run("firebase --version", in: projectPath, timeout: 5) {
            firebaseInfo.firebaseTools?.hasFirebaseCLI = true
            firebaseInfo.firebaseTools?.version = version
        }

        if let configData = try? Data(contentsOf: URL(fileURLWithPath: firebaseConfigPath)),
           let config = try? JSONDecoder().decode(FirebaseInfo.FirebaseConfig.self, from: configData) {
            firebaseInfo.firebaseConfig = config
        }

        let firebaseRCPath = (projectPath as NSString).appendingPathComponent(".firebaserc")
        if FileManager.default.fileExists(atPath: firebaseRCPath),
           let rcData = try? Data(contentsOf: URL(fileURLWithPath: firebaseRCPath)),
           let rc = try? JSONSerialization.jsonObject(with: rcData) as? [String: Any],
           let projects = rc["projects"] as? [String: Any],
           let defaultProject = projects["default"] as? String {
            firebaseInfo.hasFirebaseRC = true
            firebaseInfo.currentProject = defaultProject
            firebaseInfo.projectId = defaultProject
            firebaseInfo.availableProjects = projects.map { FirebaseInfo.FirebaseProject(alias: $0.key, projectId: $0.value as? String) }
        }

        return firebaseInfo
    }
}
