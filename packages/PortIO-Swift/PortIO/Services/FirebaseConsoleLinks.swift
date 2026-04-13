import Foundation

enum FirebaseConsoleLinks {
    static func getCloudConsoleLinks(projectId: String, serviceName: String? = nil, port: Int? = nil) -> [String: String] {
        let baseCloud = "https://console.cloud.google.com"
        let baseFirebase = "https://console.firebase.google.com"

        return [
            "cloudLogs": serviceName != nil
                ? "\(baseCloud)/logs/query?project=\(projectId)"
                : "\(baseCloud)/logs/query?project=\(projectId)",
            "cloudRun": "\(baseCloud)/run?project=\(projectId)",
            "firebaseConsole": "\(baseFirebase)/project/\(projectId)",
            "firebaseFunctions": "\(baseFirebase)/project/\(projectId)/functions",
            "firebaseHosting": "\(baseFirebase)/project/\(projectId)/hosting",
            "firebaseDatabase": "\(baseFirebase)/project/\(projectId)/database",
            "firebaseAuth": "\(baseFirebase)/project/\(projectId)/authentication",
            "cloudBuild": "\(baseCloud)/cloud-build/builds?project=\(projectId)",
            "cloudStorage": "\(baseCloud)/storage/browser?project=\(projectId)",
        ]
    }

    static func getFirebaseProjectId(from project: Project) -> String? {
        project.firebaseProjectId ?? project.firebaseInfo?.projectId
    }
}
