import Foundation

struct FirebaseInfo: Codable {
    var isFirebaseProject: Bool?
    var projectId: String?
    var currentProject: String?
    var projectAlias: String?
    var firebaseConfig: FirebaseConfig?
    var hasFirebaseRC: Bool?
    var availableProjects: [FirebaseProject]?
    var firebaseTools: FirebaseTools?

    struct FirebaseConfig: Codable {
        private var functionsValue: Bool?
        private var hostingValue: Bool?

        var hasFunctions: Bool { functionsValue == true }
        var hasHosting: Bool { hostingValue == true }

        enum CodingKeys: String, CodingKey { case functions, hosting }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            functionsValue = c.contains(.functions) ? true : nil
            hostingValue = c.contains(.hosting) ? true : nil
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            if functionsValue == true { try c.encode([String: String](), forKey: .functions) }
            if hostingValue == true { try c.encode([String: String](), forKey: .hosting) }
        }
    }

    struct FirebaseProject: Codable {
        var alias: String?
        var projectId: String?
    }

    struct FirebaseTools: Codable {
        var hasFirebaseCLI: Bool?
        var version: String?
    }
}
