import { socket } from "$lib/socket.svelte";
import type { CronJob } from "$lib/types";

class CronStore {
  jobs = $state<CronJob[]>([]);
  loaded = $state(false);
  private unsub: (() => void) | null = null;

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic("cronJobs", (data) => {
      this.jobs = (data as CronJob[]) ?? [];
      this.loaded = true;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  forProject(projectId: string): CronJob[] {
    return this.jobs.filter((j) => j.projectId === projectId);
  }

  byLabel(label: string): CronJob | undefined {
    return this.jobs.find((j) => j.label === label);
  }
}

export const cronStore = new CronStore();
