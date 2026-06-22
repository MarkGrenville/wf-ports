import { socket } from "$lib/socket.svelte";
import type { Project } from "$lib/types";

class ProjectsStore {
  list = $state<Project[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic("projects", (data) => {
      this.list = (data as Project[]) ?? [];
      this.loaded = true;
      this.error = null;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }
}

export const projectsStore = new ProjectsStore();
