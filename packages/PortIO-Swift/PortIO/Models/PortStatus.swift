import Foundation

struct PortStatus: Identifiable {
    let port: Int
    let serviceName: String
    let isRunning: Bool
    let pid: Int32?
    let processName: String?

    var id: String { "\(serviceName)-\(port)" }
}
