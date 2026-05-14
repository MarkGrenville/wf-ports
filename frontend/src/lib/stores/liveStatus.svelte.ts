import { collection, onSnapshot } from "firebase/firestore";
import { getDb } from "$lib/firebase";
import type { LiveStatus } from "$lib/types";

class LiveStatusStore {
  byProject = $state<Record<string, LiveStatus>>({});
  loaded = $state(false);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    const db = getDb();
    this.unsub = onSnapshot(collection(db, "liveStatus"), (snap) => {
      const next: Record<string, LiveStatus> = {};
      for (const d of snap.docs) next[d.id] = d.data() as LiveStatus;
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
