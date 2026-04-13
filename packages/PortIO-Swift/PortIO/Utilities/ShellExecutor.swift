import Foundation

enum ShellError: Error {
    case commandFailed(String)
    case timeout
}

actor ShellExecutor {
    static let shared = ShellExecutor()

    func run(_ command: String, in directory: String? = nil, timeout: TimeInterval = 5) async throws -> String {
        let process = Process()
        // Use login shell so PATH includes nvm/node (pm2), homebrew, etc.
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-l", "-c", command]
        if let dir = directory {
            process.currentDirectoryURL = URL(fileURLWithPath: dir)
        }

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        try process.run()

        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                if process.isRunning {
                    process.terminate()
                    continuation.resume(throwing: ShellError.timeout)
                }
            }
            process.terminationHandler = { _ in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if process.terminationStatus == 0 {
                    continuation.resume(returning: output)
                } else {
                    continuation.resume(throwing: ShellError.commandFailed(output))
                }
            }
        }
    }
}
