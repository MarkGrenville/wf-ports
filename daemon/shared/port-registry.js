const fs = require("fs");
const path = require("path");
const { isBlocked, listBlocked, listBlockedExtra } = require("./blocked-ports");
const { buildUsedPortsExport } = require("./docs");
const { snapshotListeningPorts } = require("./lsof");

const DATA_DIR = path.join(__dirname, "..", "data");
const REGISTRY_PATH = path.join(DATA_DIR, "port-registry.json");

const DEFAULT_FROM = 4000;
const MAX_PORT = 65535;

/** @type {{ claims: Array<{ port: number, projectId: string, service: string | null, claimedAt: string }> }} */
let cache = null;

function ensureLoaded() {
  if (cache) return cache;
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
      cache = {
        claims: Array.isArray(raw.claims)
          ? raw.claims
              .filter((c) => c && Number.isInteger(Number(c.port)))
              .map((c) => ({
                port: Number(c.port),
                projectId: String(c.projectId || "unknown"),
                service: c.service != null ? String(c.service) : null,
                claimedAt: c.claimedAt || new Date().toISOString(),
              }))
          : [],
      };
    } else {
      cache = { claims: [] };
    }
  } catch (err) {
    console.error("[port-registry] load failed:", err.message);
    cache = { claims: [] };
  }
  return cache;
}

function save() {
  ensureLoaded();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

function listClaims() {
  return ensureLoaded().claims.slice().sort((a, b) => a.port - b.port);
}

function declaredPortMap(projects) {
  /** @type {Map<number, Array<{ projectId: string, projectName: string, service: string }>>} */
  const map = new Map();
  for (const project of projects || []) {
    if (!Array.isArray(project.services)) continue;
    for (const svc of project.services) {
      if (typeof svc.port !== "number") continue;
      if (!map.has(svc.port)) map.set(svc.port, []);
      map.get(svc.port).push({
        projectId: project.id,
        projectName: project.name || project.id,
        service: svc.name,
      });
    }
  }
  return map;
}

function claimedPortSet() {
  return new Set(ensureLoaded().claims.map((c) => c.port));
}

/**
 * Why a port is unavailable, or null if free.
 * @returns {{ reason: string, detail?: object } | null}
 */
function unavailableReason(port, { projects, listening } = {}) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PORT) {
    return { reason: "invalid", detail: { port } };
  }
  if (isBlocked(n)) {
    return { reason: "blocked" };
  }
  const declared = declaredPortMap(projects).get(n);
  if (declared?.length) {
    return { reason: "declared", detail: { usedBy: declared } };
  }
  const claim = ensureLoaded().claims.find((c) => c.port === n);
  if (claim) {
    return { reason: "claimed", detail: { claim } };
  }
  if (listening instanceof Map && listening.has(n)) {
    const hit = listening.get(n);
    return {
      reason: "listening",
      detail: { pid: hit.pid, command: hit.command },
    };
  }
  return null;
}

async function getListeningSnapshot() {
  try {
    const snap = await snapshotListeningPorts();
    return snap instanceof Map ? snap : new Map();
  } catch {
    return new Map();
  }
}

function findNextPorts(count, from, ctx) {
  const n = Math.max(1, Math.min(50, Number(count) || 1));
  let cursor = Number(from);
  if (!Number.isInteger(cursor) || cursor < 1) cursor = DEFAULT_FROM;
  const found = [];
  while (cursor <= MAX_PORT && found.length < n) {
    if (!unavailableReason(cursor, ctx)) found.push(cursor);
    cursor += 1;
  }
  if (found.length < n) {
    const err = new Error(`could not find ${n} free port(s) from ${from}`);
    err.code = "NO_FREE_PORTS";
    throw err;
  }
  return found;
}

/**
 * Claim specific port(s) or auto-allocate.
 * @param {{ projectId: string, service?: string, port?: number, count?: number, from?: number }} opts
 */
async function claim(opts, getProjects) {
  const projectId = opts?.projectId;
  if (!projectId || typeof projectId !== "string") {
    const err = new Error("projectId is required");
    err.code = "BAD_REQUEST";
    throw err;
  }
  const service = opts.service != null ? String(opts.service) : null;
  const projects = typeof getProjects === "function" ? getProjects() : [];
  const listening = await getListeningSnapshot();
  const ctx = { projects, listening };

  let ports;
  if (opts.port != null) {
    const p = Number(opts.port);
    const why = unavailableReason(p, ctx);
    if (why) {
      const err = new Error(`port ${p} unavailable: ${why.reason}`);
      err.code = "CONFLICT";
      err.detail = why;
      throw err;
    }
    ports = [p];
  } else {
    ports = findNextPorts(opts.count ?? 1, opts.from ?? DEFAULT_FROM, ctx);
  }

  ensureLoaded();
  const claimedAt = new Date().toISOString();
  const created = [];
  for (const port of ports) {
    const entry = { port, projectId, service, claimedAt };
    cache.claims.push(entry);
    created.push(entry);
  }
  save();
  return created;
}

function release(port) {
  ensureLoaded();
  const n = Number(port);
  const before = cache.claims.length;
  cache.claims = cache.claims.filter((c) => c.port !== n);
  if (cache.claims.length === before) {
    const err = new Error(`no claim for port ${n}`);
    err.code = "NOT_FOUND";
    throw err;
  }
  save();
  return { ok: true, port: n };
}

async function listAllPorts(getProjects) {
  const projects = typeof getProjects === "function" ? getProjects() : [];
  const listening = await getListeningSnapshot();
  const declared = declaredPortMap(projects);
  const claims = listClaims();
  const byPort = new Map();

  for (const [port, usedBy] of declared) {
    byPort.set(port, {
      port,
      source: "declared",
      usedBy,
    });
  }
  for (const claim of claims) {
    const existing = byPort.get(claim.port);
    if (existing) {
      existing.alsoClaimed = claim;
    } else {
      byPort.set(claim.port, {
        port: claim.port,
        source: "claimed",
        claim,
      });
    }
  }
  for (const [port, hit] of listening) {
    const existing = byPort.get(port);
    if (existing) {
      existing.listening = { pid: hit.pid, command: hit.command };
    } else {
      byPort.set(port, {
        port,
        source: "listening",
        listening: { pid: hit.pid, command: hit.command },
      });
    }
  }
  for (const b of listBlockedExtra()) {
    if (!byPort.has(b.port)) {
      byPort.set(b.port, { port: b.port, source: "blocked", label: b.label });
    }
  }

  const ports = Array.from(byPort.values()).sort((a, b) => a.port - b.port);
  return {
    ports,
    blockedRange: listBlocked().systemRange,
    claims,
  };
}

function listConflicts(getProjects) {
  const projects = typeof getProjects === "function" ? getProjects() : [];
  return buildUsedPortsExport(projects).duplicatePorts || [];
}

async function suggestNext(opts, getProjects) {
  const projects = typeof getProjects === "function" ? getProjects() : [];
  const listening = await getListeningSnapshot();
  const ports = findNextPorts(opts?.count ?? 1, opts?.from ?? DEFAULT_FROM, {
    projects,
    listening,
  });
  return { ports };
}

module.exports = {
  REGISTRY_PATH,
  DEFAULT_FROM,
  listClaims,
  listBlocked,
  listAllPorts,
  listConflicts,
  suggestNext,
  claim,
  release,
  unavailableReason,
  isBlocked,
};
