import SwiftUI

struct TaskPickerView: View {
    let project: Project
    @ObservedObject var appState: AppState
    @State private var selectedTaskLabel: String = ""
    @State private var executing = false

    var tasks: [VSCodeTask] {
        project.vscodeTasksInfo?.tasks ?? []
    }

    var selectedTask: VSCodeTask? {
        tasks.first { $0.label == selectedTaskLabel }
    }

    var body: some View {
        HStack(spacing: 4) {
            if tasks.isEmpty {
                Text("—")
                    .foregroundColor(.secondary)
            } else {
                Picker("", selection: $selectedTaskLabel) {
                    ForEach(tasks) { task in
                        Text(task.label).tag(task.label)
                    }
                }
                .labelsHidden()
                .frame(width: 120)
                .onAppear {
                    if selectedTaskLabel.isEmpty {
                        selectedTaskLabel = tasks.sorted { $0.label < $1.label }.first?.label ?? ""
                    }
                }

                Button(action: {
                    guard let task = selectedTask, VSCodeTaskParser.extractCommand(from: task) != nil else { return }
                    executing = true
                    Task {
                        await appState.executeTask(project: project, task: task)
                        executing = false
                    }
                }) {
                    Image(systemName: "play.fill")
                }
                .buttonStyle(.plain)
                .disabled(selectedTask == nil || executing || (selectedTask != nil && VSCodeTaskParser.extractCommand(from: selectedTask!) == nil))
            }
        }
    }
}
