<script lang="ts">
  import { usedPortsStore } from "$lib/stores/system.svelte";
  import { commandsStore } from "$lib/commands.svelte";
  import { ArrowLeft, RefreshCw, Copy, Download } from "lucide-svelte";

  let tab = $state<"summary" | "projects" | "duplicates" | "byType">("summary");
  let copied = $state(false);

  const data = $derived(usedPortsStore.data);

  async function rescan() {
    await commandsStore.run("rescan", "rescanProjects", {}, { timeoutMs: 120_000 });
  }

  async function copyAllPorts() {
    if (!data) return;
    await navigator.clipboard.writeText(data.allPorts.join(", "));
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function downloadJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portio-ports.json";
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="export-page">
  <div class="menu-bar">
    <div class="menu-left">
      <a class="back-link" href="/"><button><ArrowLeft size={14} /> Dashboard</button></a>
      <h1 class="page-title">Port Export</h1>
    </div>
    <div class="menu-right">
      <button onclick={copyAllPorts} disabled={!data}><Copy size={14} /> {copied ? "Copied!" : "Copy ports"}</button>
      <button onclick={downloadJson} disabled={!data}><Download size={14} /> Download JSON</button>
      <button class="rescan-btn" onclick={rescan} disabled={commandsStore.isRunning("rescan")}>
        <RefreshCw size={14} class={commandsStore.isRunning("rescan") ? "rotating" : ""} />
        {commandsStore.isRunning("rescan") ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  </div>

  <div class="export-container">
    {#if !usedPortsStore.loaded}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading export data…</p>
      </div>
    {:else if !data}
      <p class="muted">No export data in Firestore yet. Click "Refresh" to generate.</p>
    {:else}
      <nav class="tabs">
        <button class:on={tab === "summary"} onclick={() => (tab = "summary")}>Summary</button>
        <button class:on={tab === "projects"} onclick={() => (tab = "projects")}>Projects ({data.projects.length})</button>
        <button class:on={tab === "duplicates"} onclick={() => (tab = "duplicates")}>Duplicates ({data.duplicatePorts.length})</button>
        <button class:on={tab === "byType"} onclick={() => (tab = "byType")}>By Type</button>
      </nav>

      {#if tab === "summary"}
        <div class="cards">
          <div class="card"><div class="num">{data.summary.totalProjects}</div><div class="lbl">Projects</div></div>
          <div class="card"><div class="num">{data.summary.uniquePorts}</div><div class="lbl">Unique Ports</div></div>
          <div class="card"><div class="num">{data.duplicatePorts.length}</div><div class="lbl">Duplicates</div></div>
        </div>
        <h3>All Ports ({data.allPorts.length})</h3>
        <p class="ports-list">{data.allPorts.join(", ")}</p>
        <p class="muted small">Last scanned: {new Date(data.summary.lastScanned).toLocaleString()}</p>
      {/if}

      {#if tab === "projects"}
        {#each data.projects as p}
          <div class="proj-card">
            <h3>{p.name}</h3>
            <p class="muted small">{p.path}</p>
            <ul>
              {#each p.services as s}
                <li><span class="port">{s.port}</span> <strong>{s.name}</strong>{#if s.description} — {s.description}{/if}</li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}

      {#if tab === "duplicates"}
        {#if data.duplicatePorts.length === 0}
          <p class="muted">No duplicate ports.</p>
        {:else}
          {#each data.duplicatePorts as d}
            <div class="proj-card">
              <h3>Port {d.port}</h3>
              <ul>
                {#each d.usedBy as u}<li>{u.project} — {u.service}</li>{/each}
              </ul>
            </div>
          {/each}
        {/if}
      {/if}

      {#if tab === "byType"}
        {#each Object.entries(data.portsByType) as [type, items]}
          <div class="proj-card">
            <h3>{type} ({items.length})</h3>
            <ul>
              {#each items as it}<li><span class="port">{it.port}</span> {it.project}</li>{/each}
            </ul>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .export-page { min-height: 100vh; background: #1e1e1e; display: flex; flex-direction: column; }
  .menu-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #252525; border-bottom: 1px solid #333; }
  .menu-left { display: flex; align-items: center; gap: 16px; }
  .back-link { text-decoration: none; }
  .page-title { margin: 0; font-size: 18px; font-weight: 600; color: #e0e0e0; }
  .menu-right { display: flex; gap: 10px; }
  .rescan-btn { background: #007bff !important; border-color: #0056b3 !important; color: white !important; }
  .rescan-btn:hover:not(:disabled) { background: #0056b3 !important; }

  .export-container { flex: 1; padding: 20px 30px; max-width: 1200px; margin: 0 auto; width: 100%; }
  .loading { display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 80px; }
  .loading-spinner { width: 50px; height: 50px; border: 4px solid #333; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
  .loading p { color: #999; font-size: 16px; }
  .muted { color: #999; }
  .small { font-size: 11px; }

  .tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #333; }
  .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 16px; border-radius: 0; color: #aaa; font-size: 13px; }
  .tabs button:hover:not(:disabled) { color: #e0e0e0; background: none; border-color: transparent; border-bottom-color: rgba(0, 123, 255, 0.4); }
  .tabs button.on { border-bottom-color: #007bff; color: #007bff; }

  .cards { display: flex; gap: 16px; margin-bottom: 24px; }
  .card { background: #252525; border: 1px solid #333; border-radius: 8px; padding: 18px 22px; min-width: 140px; }
  .card .num { font-size: 32px; font-weight: 600; color: #007bff; line-height: 1.1; }
  .card .lbl { color: #aaa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  h3 { color: #fff; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 18px; }

  .proj-card { background: #252525; border: 1px solid #333; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
  .proj-card h3 { margin: 0 0 6px; font-size: 16px; text-transform: none; letter-spacing: 0; color: #fff; }
  .proj-card ul { margin: 8px 0 0; padding-left: 18px; }
  .proj-card li { color: #ccc; line-height: 1.7; }
  .proj-card strong { color: #e0e0e0; }
  .port { font-family: "Monaco", "Menlo", monospace; background: #2a2a2a; color: #4fc3f7; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
  .ports-list { font-family: "Monaco", "Menlo", monospace; font-size: 12px; line-height: 1.7; word-break: break-word; background: #252525; padding: 14px; border-radius: 6px; border: 1px solid #333; color: #4fc3f7; }
</style>
