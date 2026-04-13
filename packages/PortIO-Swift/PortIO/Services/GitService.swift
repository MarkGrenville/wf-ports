import Foundation

actor GitService {
    static let shared = GitService()
    private let shell = ShellExecutor.shared

    func getGitInfo(projectPath: String) async -> GitInfo? {
        let gitDir = (projectPath as NSString).appendingPathComponent(".git")
        guard FileManager.default.fileExists(atPath: gitDir) else { return nil }

        var gitInfo = GitInfo(
            isGitRepo: true,
            branch: nil,
            remoteUrl: nil,
            repoUrl: nil,
            status: GitInfo.GitStatus(
                modified: [],
                untracked: [],
                staged: [],
                ahead: 0,
                behind: 0,
                hasChanges: false,
                hasUncommittedChanges: false
            ),
            lastCommit: nil
        )

        if let branch = try? await shell.run("git rev-parse --abbrev-ref HEAD", in: projectPath) {
            gitInfo.branch = branch
        }

        if let remote = try? await shell.run("git remote get-url origin", in: projectPath) {
            gitInfo.remoteUrl = remote
            if remote.hasPrefix("git@github.com:") {
                gitInfo.repoUrl = remote
                    .replacingOccurrences(of: "git@github.com:", with: "https://github.com/")
                    .replacingOccurrences(of: ".git", with: "")
            } else if remote.hasPrefix("https://github.com/") {
                gitInfo.repoUrl = remote.replacingOccurrences(of: ".git", with: "")
            }
        }

        if let statusOutput = try? await shell.run("git status --porcelain", in: projectPath, timeout: 10) {
            let lines = statusOutput.split(separator: "\n").map { String($0) }
            gitInfo.status?.hasChanges = !lines.isEmpty
            gitInfo.status?.hasUncommittedChanges = !lines.isEmpty
        }

        if let aheadBehind = try? await shell.run("git rev-list --left-right --count HEAD...@{u}", in: projectPath) {
            let parts = aheadBehind.split(separator: "\t")
            if parts.count == 2 {
                gitInfo.status?.ahead = Int(parts[0]) ?? 0
                gitInfo.status?.behind = Int(parts[1]) ?? 0
            }
        }

        if let commit = try? await shell.run("git log -1 --pretty=format:\"%H|%an|%ad|%s\" --date=iso", in: projectPath) {
            let parts = commit.split(separator: "|")
            if parts.count >= 4 {
                gitInfo.lastCommit = GitInfo.LastCommit(
                    hash: String(parts[0]),
                    author: String(parts[1]),
                    date: String(parts[2]),
                    message: String(parts[3])
                )
            }
        }

        return gitInfo
    }
}
