const path = require("path");
const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const { Server: WebSocketServer } = require("ws");
const { HANDLERS, MUTATING_TYPES, CRON_MUTATING_TYPES } = require("./commands/handlers");
const registry = require("./shared/port-registry");
const { buildPortioDocsMarkdown } = require("./shared/docs");

const PORT = Number(process.env.PORTIO_DAEMON_HTTP_PORT || 3853);
const HOST = process.env.PORTIO_DAEMON_HOST || "0.0.0.0";
const OPENAPI_PATH = path.join(__dirname, "openapi.json");

function start(state, refreshers = {}, deps = {}) {
  const getProjects =
    typeof deps.getProjects === "function" ? deps.getProjects : () => [];

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const openapi = require(OPENAPI_PATH);
  app.get("/openapi.json", (_req, res) => {
    res.json(openapi);
  });
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: "PortIO Port Registry API",
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, types: Object.keys(HANDLERS) });
  });

  // Static integration docs over plain HTTP so scripts and agents can curl
  // them. Not a WebSocket topic and not dependent on the project scan.
  const DOCS_MARKDOWN = buildPortioDocsMarkdown();

  app.get(["/docs", "/docs.md"], (_req, res) => {
    res.type("text/markdown; charset=utf-8").send(DOCS_MARKDOWN);
  });

  app.get("/docs.json", (_req, res) => {
    res.json({ ok: true, markdown: DOCS_MARKDOWN });
  });

  app.get("/api/ports", async (_req, res) => {
    try {
      const data = await registry.listAllPorts(getProjects);
      res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[http] GET /api/ports ERR:", err.message);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get("/api/ports/conflicts", (_req, res) => {
    try {
      const duplicatePorts = registry.listConflicts(getProjects);
      res.json({ ok: true, duplicatePorts });
    } catch (err) {
      console.error("[http] GET /api/ports/conflicts ERR:", err.message);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get("/api/ports/blocked", (_req, res) => {
    try {
      res.json({ ok: true, ...registry.listBlocked() });
    } catch (err) {
      console.error("[http] GET /api/ports/blocked ERR:", err.message);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get("/api/ports/next", async (req, res) => {
    try {
      const count = req.query.count != null ? Number(req.query.count) : 1;
      const from = req.query.from != null ? Number(req.query.from) : registry.DEFAULT_FROM;
      const data = await registry.suggestNext({ count, from }, getProjects);
      res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[http] GET /api/ports/next ERR:", err.message);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post("/api/ports/claim", async (req, res) => {
    try {
      const claims = await registry.claim(req.body || {}, getProjects);
      res.json({ ok: true, claims });
    } catch (err) {
      const status =
        err.code === "BAD_REQUEST" ? 400 : err.code === "CONFLICT" ? 409 : 500;
      if (status >= 500) console.error("[http] POST /api/ports/claim ERR:", err.message);
      else console.log(`[http] POST /api/ports/claim ${status}:`, err.message);
      res.status(status).json({
        ok: false,
        error: err.message || String(err),
        detail: err.detail || undefined,
      });
    }
  });

  app.delete("/api/ports/claim/:port", (req, res) => {
    try {
      const result = registry.release(req.params.port);
      res.json(result);
    } catch (err) {
      const status = err.code === "NOT_FOUND" ? 404 : 500;
      if (status >= 500) console.error("[http] DELETE /api/ports/claim ERR:", err.message);
      res.status(status).json({ ok: false, error: err.message || String(err) });
    }
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
      if (MUTATING_TYPES.has(type)) {
        await Promise.all([
          refreshers.ports?.(),
          refreshers.pm2?.(),
        ]);
      }
      if (CRON_MUTATING_TYPES.has(type)) {
        await refreshers.cron?.();
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

  const server = app.listen(PORT, HOST, () => {
    console.log(`[http] listening on http://${HOST}:${PORT}`);
    console.log(`[http] swagger on http://127.0.0.1:${PORT}/api-docs`);
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
  console.log(`[http] websocket on ws://${HOST}:${PORT}/ws`);

  // Publish LAN IP so the frontend can rewrite service URLs for network access
  // (e.g. http://192.168.1.194:4920). Hostname/.local is unreliable across devices.
  const { execSync } = require("child_process");
  let networkHost = "localhost";
  for (const iface of ["en0", "en1"]) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { encoding: "utf8" }).trim();
      if (ip) {
        networkHost = ip;
        break;
      }
    } catch {
      /* try next iface */
    }
  }
  state.set("network", { host: networkHost, daemonPort: PORT });
  console.log(`[http] network host: ${networkHost}`);
}

module.exports = { start };
