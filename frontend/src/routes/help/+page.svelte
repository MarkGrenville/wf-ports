<script lang="ts">
  import { portioDocsStore } from "$lib/stores/system.svelte";
  import { commandsStore } from "$lib/commands.svelte";
  import { ArrowLeft, RefreshCw } from "lucide-svelte";
  import { marked } from "marked";

  const html = $derived(portioDocsStore.data ? marked.parse(portioDocsStore.data.markdown) : "");

  async function rescan() {
    await commandsStore.run("rescan", "rescanProjects", {}, { timeoutMs: 120_000 });
  }
</script>

<div class="help-page">
  <div class="menu-bar">
    <div class="menu-left">
      <a class="back-link" href="/"><button><ArrowLeft size={14} /> Dashboard</button></a>
      <h1 class="page-title">Documentation</h1>
    </div>
    <div class="menu-right">
      <button class="rescan-btn" onclick={rescan} disabled={commandsStore.isRunning("rescan")}>
        <RefreshCw size={14} class={commandsStore.isRunning("rescan") ? "rotating" : ""} />
        {commandsStore.isRunning("rescan") ? "Refreshing…" : "Refresh Docs"}
      </button>
    </div>
  </div>

  <div class="help-container">
    {#if !portioDocsStore.loaded}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading documentation…</p>
      </div>
    {:else if !portioDocsStore.data}
      <p class="muted">No docs in Firestore yet. Click "Refresh Docs" to generate.</p>
    {:else}
      <article>{@html html}</article>
    {/if}
  </div>
</div>

<style>
  .help-page { min-height: 100vh; background: #1e1e1e; display: flex; flex-direction: column; }
  .menu-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #252525;
    border-bottom: 1px solid #333;
  }
  .menu-left { display: flex; align-items: center; gap: 16px; }
  .back-link { text-decoration: none; }
  .page-title { margin: 0; font-size: 18px; font-weight: 600; color: #e0e0e0; }
  .menu-right { display: flex; gap: 10px; }
  .rescan-btn { background: #007bff !important; border-color: #0056b3 !important; color: white !important; }
  .rescan-btn:hover:not(:disabled) { background: #0056b3 !important; }

  .help-container { flex: 1; padding: 30px 40px; max-width: 980px; margin: 0 auto; width: 100%; }
  .loading { display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 80px; }
  .loading-spinner { width: 50px; height: 50px; border: 4px solid #333; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
  .loading p { color: #999; font-size: 16px; }
  .muted { color: #999; }

  article :global(h1) { font-size: 26px; margin-top: 28px; color: #fff; }
  article :global(h2) { font-size: 19px; margin-top: 24px; border-bottom: 1px solid #333; padding-bottom: 6px; color: #fff; }
  article :global(h3) { font-size: 15px; margin-top: 18px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }
  article :global(table) { border-collapse: collapse; width: 100%; margin: 14px 0; background: #252525; border-radius: 6px; overflow: hidden; }
  article :global(th) { background: #2a2a2a; color: #aaa; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; padding: 10px; text-align: left; border-bottom: 1px solid #444; }
  article :global(td) { padding: 8px 10px; border-bottom: 1px solid #333; }
  article :global(code) { background: #2a2a2a; color: #4fc3f7; padding: 1px 5px; border-radius: 3px; font-family: "Monaco", "Menlo", monospace; font-size: 12.5px; }
  article :global(pre) { background: #252525; padding: 14px; border-radius: 6px; overflow-x: auto; border: 1px solid #333; }
  article :global(pre code) { background: none; padding: 0; color: #e0e0e0; }
  article :global(p), article :global(li) { line-height: 1.6; color: #ccc; }
  article :global(strong) { color: #fff; }
</style>
