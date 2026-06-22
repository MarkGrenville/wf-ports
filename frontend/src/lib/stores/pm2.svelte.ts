import { socket } from "$lib/socket.svelte";
import type { Pm2Process } from "$lib/types";

class Pm2Store {
  list = $state<Pm2Process[]>([]);
  loaded = $state(false);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic("pm2", (data) => {
      this.list = (data as Pm2Process[]) ?? [];
      this.loaded = true;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  forProject(projectId: string): Pm2Process[] {
    return this.list.filter(
      (p) => p.projectId === projectId || p.name === projectId || p.name.startsWith(`${projectId}-`),
    );
  }
}

export const pm2Store = new Pm2Store();
