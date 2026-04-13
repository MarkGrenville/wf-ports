import SwiftUI
import FirebaseCore
import Darwin

@main
struct PortIOApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            MainWindowView()
                .environmentObject(appState)
                .frame(minWidth: 1200, minHeight: 700)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.automatic)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        let procs = ProcessManager.shared.getAllProcesses()
        for proc in procs {
            proc.process?.terminate()
            if let pid = proc.pid {
                kill(pid, SIGKILL)
            }
        }
    }
}
