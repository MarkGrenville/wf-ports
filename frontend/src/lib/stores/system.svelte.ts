import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "$lib/firebase";

class SystemDocStore<T> {
  data = $state<T | null>(null);
  loaded = $state(false);
  private unsub: (() => void) | null = null;
  constructor(private docId: string) {}

  start() {
    if (this.unsub) return;
    const db = getDb();
    this.unsub = onSnapshot(doc(db, "system", this.docId), (snap) => {
      this.data = snap.exists() ? (snap.data() as T) : null;
      this.loaded = true;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }
}

export const portioDocsStore = new SystemDocStore<{ markdown: string; lastGenerated?: unknown }>("portioDocs");
export const usedPortsStore = new SystemDocStore<{
  summary: { totalProjects: number; totalPorts: number; uniquePorts: number; lastScanned: string };
  allPorts: number[];
  projects: { id: string; name: string; path: string; services: { name: string; port: number; description: string; url?: string }[] }[];
  duplicatePorts: { port: number; usedBy: { project: string; service: string }[] }[];
  portsByType: Record<string, { port: number; project: string }[]>;
}>("usedPortsExport");
