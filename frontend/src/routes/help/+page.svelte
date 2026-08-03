<script lang="ts">
  import { onMount } from "svelte";
  import { daemonBase } from "$lib/commands.svelte";
  import { ArrowLeft, RefreshCw, Terminal } from "lucide-svelte";
  import { marked } from "marked";

  // Static docs, fetched once over plain HTTP rather than subscribed as a live
  // topic, so this page renders the same thing a `curl` gets.
  let markdown = $state("");
  let error = $state("");
  let loading = $state(true);

  const html = $derived(markdown ? marked.parse(markdown) : "");

  async function load() {
    loading = true;
    error = "";
    try {
      const res = await fetch(`${daemonBase()}/docs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      markdown = await res.text();
    } catch (err) {
      error = (err as Error).message || String(err);
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<div class="help-page">
  <div class="menu-bar">
    <div class="menu-left">
      <a class="back-link" href="/"><button><ArrowLeft size={14} /> Dashboard</button></a>
      <h1 class="page-title">Documentation</h1>
    </div>
    <div class="menu-right">
      <button class="reload-btn" onclick={load} disabled={loading}>
        <RefreshCw size={14} class={loading ? "rotating" : ""} />
        {loading ? "Loading…" : "Reload"}
      </button>
    </div>
  </div>

  <div class="help-container">
    <div class="curl-hint">
      <Terminal size={14} />
      <span>Scripts and agents can read this page directly:</span>
      <code>curl http://localhost:3850/help.md</code>
      <code>curl http://127.0.0.1:3853/docs.json</code>
    </div>

    {#if loading && !markdown}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading documentation…</p>
      </div>
    {:else if error}
      <p class="error">Could not reach the daemon at {daemonBase()}: {error}</p>
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
  .reload-btn { background: #007bff !important; border-color: #0056b3 !important; color: white !important; }
  .reload-btn:hover:not(:disabled) { background: #0056b3 !important; }

  .help-container { flex: 1; padding: 30px 40px; max-width: 980px; margin: 0 auto; width: 100%; }
  .curl-hint {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 14px;
    background: #252525;
    border: 1px solid #333;
    border-radius: 6px;
    color: #999;
    font-size: 12.5px;
  }
  .curl-hint code {
    background: #2a2a2a;
    color: #4fc3f7;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: "Monaco", "Menlo", monospace;
  }
  .loading { display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 80px; }
  .loading-spinner { width: 50px; height: 50px; border: 4px solid #333; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
  .loading p { color: #999; font-size: 16px; }
  .error { color: #ff6b6b; margin-top: 30px; }

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
