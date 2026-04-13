import AppKit

enum URLOpener {
    static func openFinder(path: String) {
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: path)
    }

    static func openURL(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        NSWorkspace.shared.open(url)
    }

    static func openCursor(at path: String) {
        let url = URL(fileURLWithPath: path)
        let cursorURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.todesktop.230313mzl4w4u92")
            ?? URL(fileURLWithPath: "/Applications/Cursor.app")
        if FileManager.default.fileExists(atPath: cursorURL.path) {
            let configuration = NSWorkspace.OpenConfiguration()
            NSWorkspace.shared.open([url], withApplicationAt: cursorURL, configuration: configuration)
        } else {
            NSWorkspace.shared.open(url)
        }
    }

    static func openTerminal(at path: String) {
        let script = """
        tell application "Terminal"
            do script "cd \\"\(path.replacingOccurrences(of: "\"", with: "\\\""))\\""
            activate
        end tell
        """
        var error: NSDictionary?
        if let scriptObject = NSAppleScript(source: script) {
            scriptObject.executeAndReturnError(&error)
        }
    }
}
