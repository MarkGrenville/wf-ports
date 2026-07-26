import { socket } from "$lib/socket.svelte";

export type NetworkConfig = { host: string; daemonPort: number };

function modeFromHostname(): "local" | "network" {
  if (typeof window === "undefined") return "local";
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" ? "local" : "network";
}

class NetworkStore {
  data = $state<NetworkConfig | null>(null);
  private unsub: (() => void) | null = null;

  /** Always matches how the user reached PortIO (hostname). */
  get accessMode(): "local" | "network" {
    return modeFromHostname();
  }

  get isNetworkMode(): boolean {
    return this.accessMode === "network";
  }

  get networkHost(): string | null {
    return this.data?.host ?? null;
  }

  start() {
    if (this.unsub) return;
    socket.connect();
    this.unsub = socket.onTopic("network", (raw) => {
      this.data = (raw as NetworkConfig) ?? null;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  /** Jump to the other host; mode then follows the new URL. */
  toggleAccessMode() {
    if (typeof window === "undefined") return;
    const port = window.location.port || "3850";
    const targetHost = this.isNetworkMode ? "localhost" : this.data?.host;
    if (!targetHost) return;
    const targetOrigin = `http://${targetHost}:${port}`;
    if (window.location.origin !== targetOrigin) {
      window.location.href = `${targetOrigin}${window.location.pathname}`;
    }
  }

  /** Rewrite a service URL based on how PortIO itself is being accessed. */
  rewriteUrl(url: string | undefined | null): string | null {
    if (!url) return null;
    if (this.isNetworkMode) {
      const host = this.data?.host;
      if (!host) return url;
      return url.replace(/\/\/(localhost|127\.0\.0\.1)/, `//${host}`);
    }
    return url;
  }
}

export const networkStore = new NetworkStore();
