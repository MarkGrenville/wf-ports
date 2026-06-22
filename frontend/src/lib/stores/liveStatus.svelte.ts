import { socket } from "$lib/socket.svelte";
import type { LiveStatus } from "$lib/types";

type LiveStatusEntry = LiveStatus & { id: string };

class LiveStatusStore {
  byProject = $state<Record<string, LiveStatus>>({});
  loaded = $state(false);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic("liveStatus", (data) => {
      const entries = (data as LiveStatusEntry[]) ?? [];
      const next: Record<string, LiveStatus> = {};
      for (const entry of entries) next[entry.id] = entry;
      this.byProject = next;
      this.loaded = true;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  forProject(projectId: string): LiveStatus | undefined {
    return this.byProject[projectId];
  }
}

export const liveStatusStore = new LiveStatusStore();
