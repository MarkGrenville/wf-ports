// In-memory state hub. Replaces the Firebase emulator: pollers write topics
// here, the WebSocket layer subscribes via onChange and pushes diffs to the UI.
// Each topic holds a single value (an array for "collections", an object for
// system docs). set() only broadcasts when the JSON-serialised value actually
// changed, so idle ticks cost nothing.

const store = new Map(); // topic -> { value, json }
const listeners = new Set(); // (topic, value) => void

function set(topic, value) {
  const json = JSON.stringify(value);
  const prev = store.get(topic);
  if (prev && prev.json === json) return false;
  store.set(topic, { value, json });
  for (const cb of listeners) {
    try {
      cb(topic, value);
    } catch (err) {
      console.error("[state] listener failed:", err.message);
    }
  }
  return true;
}

function get(topic) {
  return store.get(topic)?.value;
}

function snapshot() {
  const out = {};
  for (const [topic, entry] of store) out[topic] = entry.value;
  return out;
}

function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

module.exports = { set, get, snapshot, onChange };
