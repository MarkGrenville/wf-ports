const express = require("express");
const cors = require("cors");
const { HANDLERS } = require("./commands/handlers");

const PORT = Number(process.env.PORTIO_DAEMON_HTTP_PORT || 3853);

function start(db, admin) {
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
      const result = await handler({ type, payload: payload || {} }, { db, admin });
      console.log(`[http] ${type} OK`);
      res.json({ ok: true, result: result ?? null });
    } catch (err) {
      console.error(`[http] ${type} ERR:`, err.message);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[http] listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { start };
