import { collection, onSnapshot } from "firebase/firestore";
import { getDb } from "$lib/firebase";
import type { Project } from "$lib/types";

class ProjectsStore {
  list = $state<Project[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    const db = getDb();
    this.unsub = onSnapshot(
      collection(db, "projects"),
      (snap) => {
        this.list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }));
        this.loaded = true;
        this.error = null;
      },
      (err) => {
        this.error = err.message;
      },
    );
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }
}

export const projectsStore = new ProjectsStore();
