import Foundation

struct PM2Process: Identifiable, Equatable {
    let name: String
    let pm2Id: Int
    let pid: Int?
    let status: String
    let cpu: Double?
    let memory: Int?

    var id: String { name }
    var isOnline: Bool { status == "online" }

    var taskLabel: String {
        if let dashIndex = name.firstIndex(of: "-") {
            return String(name[name.index(after: dashIndex)...])
        }
        return name
    }
}
