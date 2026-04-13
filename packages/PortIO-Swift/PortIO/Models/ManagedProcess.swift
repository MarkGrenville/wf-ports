import Foundation
import SwiftUI

final class ManagedProcess: ObservableObject, Identifiable {
    let id: String
    let projectId: String
    let taskLabel: String
    let command: String
    let workingDirectory: String

    @Published var isRunning: Bool = false
    @Published var logs: String = ""
    @Published var pid: Int32?
    var process: Process?

    init(id: String, projectId: String, taskLabel: String, command: String, workingDirectory: String) {
        self.id = id
        self.projectId = projectId
        self.taskLabel = taskLabel
        self.command = command
        self.workingDirectory = workingDirectory
    }
}
