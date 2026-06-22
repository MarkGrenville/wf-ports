import { socket } from "$lib/socket.svelte";

class SystemDocStore<T> {
  data = $state<T | null>(null);
  loaded = $state(false);
  private unsub: (() => void) | null = null;
  constructor(private topic: string) {}

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic(this.topic, (data) => {
      this.data = (data as T) ?? null;
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
