import Foundation

struct GitInfo: Codable {
    var isGitRepo: Bool?
    var branch: String?
    var remoteUrl: String?
    var repoUrl: String?
    var status: GitStatus?
    var lastCommit: LastCommit?

    struct GitStatus: Codable {
        var modified: [String]?
        var untracked: [String]?
        var staged: [String]?
        var ahead: Int?
        var behind: Int?
        var hasChanges: Bool?
        var hasUncommittedChanges: Bool?
    }

    struct LastCommit: Codable {
        var hash: String?
        var author: String?
        var date: String?
        var message: String?
    }
}
