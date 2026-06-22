// WebSocket client to the daemon. Replaces the Firestore web SDK: the daemon
// pushes a full snapshot on connect, then per-topic diffs. Auto-reconnects with
// exponential backoff and replays the last known value to late subscribers, so
// stores get data immediately whether they subscribe before or after connect.

type SnapshotMsg = { type: "snapshot"; data: Record<string, unknown> };
type UpdateMsg = { type: "update"; topic: string; data: unknown };
type ServerMsg = SnapshotMsg | UpdateMsg;

type TopicCallback = (data: unknown) => void;

const DAEMON_WS = "ws://127.0.0.1:3853/ws";
const MAX_BACKOFF_MS = 10_000;

class SocketClient {
  connected = $state(false);

  private ws: WebSocket | null = null;
  private topics = new Map<string, Set<TopicCallback>>();
  private latest = new Map<string, unknown>();
  private backoff = 500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (typeof window === "undefined") return;
    if (this.ws) return;

    const ws = new WebSocket(DAEMON_WS);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.backoff = 500;
    };
    ws.onmessage = (event) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "snapshot") {
        for (const [topic, data] of Object.entries(msg.data)) this.emit(topic, data);
      } else if (msg.type === "update") {
        this.emit(msg.topic, msg.data);
      }
    };
    ws.onerror = () => {
      ws.close();
    };
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  private emit(topic: string, data: unknown) {
    this.latest.set(topic, data);
    const subs = this.topics.get(topic);
    if (subs) for (const cb of subs) cb(data);
  }

  onTopic(topic: string, cb: TopicCallback): () => void {
    let subs = this.topics.get(topic);
    if (!subs) {
      subs = new Set();
      this.topics.set(topic, subs);
    }
    subs.add(cb);
    if (this.latest.has(topic)) cb(this.latest.get(topic));
    return () => {
      subs!.delete(cb);
    };
  }
}

export const socket = new SocketClient();
