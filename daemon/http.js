const express = require("express");
const cors = require("cors");
const { Server: WebSocketServer } = require("ws");
const { HANDLERS, MUTATING_TYPES } = require("./commands/handlers");

const PORT = Number(process.env.PORTIO_DAEMON_HTTP_PORT || 3853);

function start(state, refreshers = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, types: Object.keys(HANDLERS) });
  });

  app.post("/cmd", async (req, res) => {
    const { type, payload } = req.body || {};
    if (!type || typeof type !== "string") {
      return res.status(400).json({ error: "missing 'type' (string)" });
    }
    const handler = HANDLERS[type];
    if (!handler) {
      return res.status(400).json({ error: `unknown command type: ${type}` });
    }
    try {
      const result = await handler({ type, payload: payload || {} }, { state });
      // Re-snapshot immediately so the WS push confirms the new reality within
      // a few hundred ms instead of waiting for the next poll tick.
      if (MUTATING_TYPES.has(type)) {
        await Promise.all([
          refreshers.ports?.(),
          refreshers.pm2?.(),
        ]);
      }
      if (result && result.success === false) {
        console.error(`[http] ${type} FAILED:`, result.error || "unknown");
      } else {
        console.log(`[http] ${type} OK`);
      }
      res.json({ ok: true, result: result ?? null });
    } catch (err) {
      console.error(`[http] ${type} ERR:`, err.message);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[http] listening on http://127.0.0.1:${PORT}`);
  });

  // WebSocket push: full snapshot on connect, then per-topic diffs.
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    try {
      ws.send(JSON.stringify({ type: "snapshot", data: state.snapshot() }));
    } catch {}
  });
  state.onChange((topic, data) => {
    const msg = JSON.stringify({ type: "update", topic, data });
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        try {
          client.send(msg);
        } catch {}
      }
    }
  });
  console.log(`[http] websocket on ws://127.0.0.1:${PORT}/ws`);
}

module.exports = { start };
