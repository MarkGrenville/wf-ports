import { socket } from "$lib/socket.svelte";
import type { CIStatus, CIRun } from "$lib/types";

class CIStore {
  byProject = $state<Record<string, CIStatus>>({});
  loaded = $state(false);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic("ciStatus", (data) => {
      const entries = (data as CIStatus[]) ?? [];
      const next: Record<string, CIStatus> = {};
      for (const entry of entries) next[entry.projectId] = entry;
      this.byProject = next;
      this.loaded = true;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  forProject(projectId: string): CIRun[] {
    return this.byProject[projectId]?.runs ?? [];
  }

  latestRun(projectId: string): CIRun | undefined {
    return this.byProject[projectId]?.runs?.[0];
  }
}

export const ciStore = new CIStore();
