// Action transport: localhost-only HTTP to the daemon (`http://127.0.0.1:3853/cmd`).
// Sub-100 ms round trip, doesn't touch Firestore quota. Live state still flows
// through Firestore subscriptions in the stores.

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

const DAEMON_BASE = "http://127.0.0.1:3853";

export async function dispatch(
  type: CommandType,
  payload: Record<string, unknown> = {},
  options: DispatchOptions = {},
): Promise<Command> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DAEMON_BASE}/cmd`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, payload }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      const err = body.error || `HTTP ${res.status}`;
      return {
        id: "local",
        type,
        payload,
        status: "error",
        error: err,
      };
    }
    return {
      id: "local",
      type,
      payload,
      status: "done",
      result: body.result ?? null,
    };
  } catch (err) {
    return {
      id: "local",
      type,
      payload,
      status: "error",
      error: (err as Error).message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
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
