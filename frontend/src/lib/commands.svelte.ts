import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "$lib/firebase";
import type { Command } from "$lib/types";

export type CommandType =
  | "killPort"
  | "killPorts"
  | "pm2Restart"
  | "pm2Delete"
  | "pm2DeleteAll"
  | "pm2Logs"
  | "openFinder"
  | "openTerminal"
  | "watchPort"
  | "focusTerminal"
  | "minimizeCursorWindows"
  | "pm2LogsTerminal"
  | "executeTask"
  | "executeStartAllTasks"
  | "rescanProjects";

export type DispatchOptions = {
  timeoutMs?: number;
};

export async function dispatch(
  type: CommandType,
  payload: Record<string, unknown> = {},
  options: DispatchOptions = {},
): Promise<Command> {
  const db = getDb();
  const ref = await addDoc(collection(db, "commands"), {
    type,
    payload,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  return await new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Command ${type} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const unsub = onSnapshot(doc(db, "commands", ref.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Omit<Command, "id">;
      if (data.status === "done" || data.status === "error") {
        clearTimeout(timer);
        unsub();
        resolve({ id: ref.id, ...data });
      }
    });
  });
}

class CommandsStore {
  inflight = $state<Record<string, boolean>>({});

  async run(
    key: string,
    type: CommandType,
    payload: Record<string, unknown> = {},
    options?: DispatchOptions,
  ): Promise<Command> {
    this.inflight = { ...this.inflight, [key]: true };
    try {
      return await dispatch(type, payload, options);
    } finally {
      const next = { ...this.inflight };
      delete next[key];
      this.inflight = next;
    }
  }

  isRunning(key: string): boolean {
    return !!this.inflight[key];
  }
}

export const commandsStore = new CommandsStore();
