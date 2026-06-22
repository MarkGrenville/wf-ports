// Action transport: localhost-only HTTP to the daemon (`http://127.0.0.1:3853/cmd`).
// Sub-100 ms round trip. Live state flows separately through the WebSocket
// subscriptions in the stores (see socket.svelte.ts).

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

  // Optimistic state: while a kill/delete is in flight we immediately hide the
  // affected ports/processes so the UI feels instant. The daemon re-snapshots
  // right after the action and pushes the confirmed state over the socket, so
  // we just clear the optimistic flag when the command resolves.
  hiddenPorts = $state<Record<number, boolean>>({});
  hiddenPm2 = $state<Record<string, boolean>>({});

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

  setPortsHidden(ports: number[], hidden: boolean) {
    const next = { ...this.hiddenPorts };
    for (const p of ports) {
      if (hidden) next[p] = true;
      else delete next[p];
    }
    this.hiddenPorts = next;
  }

  isPortHidden(port: number): boolean {
    return !!this.hiddenPorts[port];
  }

  setPm2Hidden(names: string[], hidden: boolean) {
    const next = { ...this.hiddenPm2 };
    for (const n of names) {
      if (hidden) next[n] = true;
      else delete next[n];
    }
    this.hiddenPm2 = next;
  }

  isPm2Hidden(name: string): boolean {
    return !!this.hiddenPm2[name];
  }
}

export const commandsStore = new CommandsStore();
