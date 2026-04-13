import Foundation

struct Service: Codable, Identifiable, Hashable {
    var name: String
    var port: Int
    var url: String
    var purpose: String?

    var id: String { "\(name)-\(port)" }
}
