import SwiftUI

struct ProjectIconView: View {
    let project: Project

    var body: some View {
        Group {
            if let faviconPath = project.faviconPath, FileManager.default.fileExists(atPath: faviconPath),
               let image = NSImage(contentsOfFile: faviconPath) {
                Image(nsImage: image)
                    .resizable()
                    .frame(width: 24, height: 24)
            } else {
                Image(systemName: "folder.fill")
                    .foregroundColor(.secondary)
            }
        }
        .frame(width: 24, height: 24)
    }
}
