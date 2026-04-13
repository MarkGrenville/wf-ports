import Foundation
import FirebaseFirestore

final class FirestoreService {
    private lazy var db: Firestore = Firestore.firestore()
    private let projectsCollection = "projects"

    func getAllProjects() async throws -> [Project] {
        let snapshot = try await db.collection(projectsCollection).getDocuments()
        return snapshot.documents.compactMap { doc in
            try? doc.data(as: Project.self)
        }
    }

    func getProject(_ projectId: String) async throws -> Project? {
        let doc = try await db.collection(projectsCollection).document(projectId).getDocument()
        return try doc.data(as: Project.self)
    }

    func saveProject(_ project: Project) async throws {
        var data = try Firestore.Encoder().encode(project)
        data["lastUpdated"] = FieldValue.serverTimestamp()
        data["lastScanned"] = FieldValue.serverTimestamp()
        try await db.collection(projectsCollection).document(project.id).setData(data)
    }

    func saveProjects(_ projects: [Project]) async throws {
        let batch = db.batch()
        let timestamp = FieldValue.serverTimestamp()

        for project in projects {
            var data = try Firestore.Encoder().encode(project)
            data["lastUpdated"] = timestamp
            data["lastScanned"] = timestamp
            let ref = db.collection(projectsCollection).document(project.id)
            batch.setData(data, forDocument: ref)
        }

        try await batch.commit()
    }

    func updateProject(_ projectId: String, updates: [String: Any]) async throws {
        var data = updates
        data["lastUpdated"] = FieldValue.serverTimestamp()
        try await db.collection(projectsCollection).document(projectId).updateData(data)
    }

    func deleteProject(_ projectId: String) async throws {
        try await db.collection(projectsCollection).document(projectId).delete()
    }

    func deleteAllProjects() async throws {
        let snapshot = try await db.collection(projectsCollection).getDocuments()
        let batch = db.batch()
        for doc in snapshot.documents {
            batch.deleteDocument(doc.reference)
        }
        try await batch.commit()
    }

    func hasProjects() async throws -> Bool {
        let snapshot = try await db.collection(projectsCollection).limit(to: 1).getDocuments()
        return !snapshot.documents.isEmpty
    }
}
