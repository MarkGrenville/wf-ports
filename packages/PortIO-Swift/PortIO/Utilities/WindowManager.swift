import AppKit

enum WindowManager {
    static func focusCursorWindow(matching identifier: String?) {
        let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.todesktop.230313mzl4w4u92")
        guard let cursor = apps.first else { return }
        cursor.activate(options: .activateIgnoringOtherApps)
    }

    static func minimizeCursorWindows() {
        let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.todesktop.230313mzl4w4u92")
        for app in apps {
            for window in NSApplication.shared.windows where window.isVisible {
                if window.identifier?.rawValue.contains("Cursor") == true {
                    window.miniaturize(nil)
                }
            }
        }
    }
}
