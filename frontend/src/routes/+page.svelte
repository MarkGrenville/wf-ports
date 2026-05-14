<script lang="ts">
  import { projectsStore } from "$lib/stores/projects.svelte";
  import { liveStatusStore } from "$lib/stores/liveStatus.svelte";
  import { pm2Store } from "$lib/stores/pm2.svelte";
  import { commandsStore } from "$lib/commands.svelte";
  import type { Project, VsCodeTask } from "$lib/types";
  import {
    RefreshCw,
    HelpCircle,
    Download,
    Folder,
    EyeOff,
    Play,
    StopCircle,
    GitBranch,
    Cloud,
    ExternalLink,
  } from "lucide-svelte";

  let detailsModal: Project | null = $state(null);
  let selectedTaskByProject = $state<Record<string, string>>({});
  let pm2ActionDraft = $state<Record<string, string>>({});

  function isProjectActive(projectId: string): boolean {
    const portsActive = liveStatusStore.forProject(projectId)?.services?.some((s) => s.isRunning) ?? false;
    const pm2Active = pm2Store.forProject(projectId).some((p) => p.status === "online");
    return portsActive || pm2Active;
  }

  // Stable membership key: only changes when the *set* of active projects flips.
  // Svelte 5 dedupes $derived by ===, so downstream sort stays put when this string is unchanged,
  // even though the underlying liveStatus/pm2 stores fire every few seconds.
  const activeSetKey = $derived(
    projectsStore.list
      .filter((p) => isProjectActive(p.id))
      .map((p) => p.id)
      .sort()
      .join("|"),
  );

  const projects = $derived.by(() => {
    const activeSet = new Set(activeSetKey ? activeSetKey.split("|") : []);
    return [...projectsStore.list].sort((a, b) => {
      const aA = activeSet.has(a.id) ? 1 : 0;
      const bA = activeSet.has(b.id) ? 1 : 0;
      if (aA !== bA) return bA - aA;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
  });

  function pickDefaultTask(project: Project) {
    if (selectedTaskByProject[project.id]) return;
    const first = project.vscodeTasksInfo?.tasks?.[0];
    if (first?.label) selectedTaskByProject[project.id] = first.label;
  }
  $effect(() => {
    for (const p of projects) pickDefaultTask(p);
  });

  function liveServicesFor(project: Project) {
    const live = liveStatusStore.forProject(project.id);
    return live?.services ?? (project.services ?? []).map((s) => ({ ...s, isRunning: false, pid: null, processName: null }));
  }
  function pm2For(projectId: string) {
    return pm2Store.forProject(projectId);
  }
  function activePortCount(project: Project) {
    return liveServicesFor(project).filter((s) => s.isRunning).length;
  }
  function pm2RunningCount(project: Project) {
    return pm2For(project.id).filter((p) => p.status === "online").length;
  }

  async function rescan() {
    await commandsStore.run("rescan", "rescanProjects", {}, { timeoutMs: 120_000 });
  }
  async function minimizeCursor() {
    await commandsStore.run("minimize", "minimizeCursorWindows");
  }
  async function killOnePort(project: Project, port: number) {
    await commandsStore.run(`killPort:${project.id}:${port}`, "killPort", { port });
  }
  async function killAllPorts(project: Project) {
    const ports = liveServicesFor(project).filter((s) => s.isRunning).map((s) => s.port);
    if (ports.length === 0) return;
    await commandsStore.run(`killPorts:${project.id}`, "killPorts", { ports });
  }
  async function openFinder(project: Project) {
    if (!project.projectPath) return;
    await commandsStore.run(`finder:${project.id}`, "openFinder", { projectPath: project.projectPath });
  }
  async function focusCursor(project: Project) {
    if (!project.focusIdentifier) return;
    await commandsStore.run(`cursor:${project.id}`, "focusTerminal", {
      focusIdentifier: project.focusIdentifier,
      projectPath: project.projectPath,
    });
  }
  function firebaseUrl(project: Project) {
    const pid = project.firebaseInfo?.projectId || project.firebaseProjectId;
    return pid ? `https://console.firebase.google.com/project/${pid}` : null;
  }
  function cloudUrl(project: Project) {
    const pid = project.firebaseInfo?.projectId || project.firebaseProjectId;
    return pid ? `https://console.cloud.google.com/home/dashboard?project=${pid}` : null;
  }

  async function pm2Restart(name: string, projectId: string) {
    await commandsStore.run(`pm2restart:${name}`, "pm2Restart", { pm2Name: name, projectId });
  }
  async function pm2Delete(name: string, projectId: string) {
    await commandsStore.run(`pm2delete:${name}`, "pm2Delete", { pm2Name: name, projectId });
  }
  async function pm2Logs(name: string, projectId: string) {
    await commandsStore.run(`pm2logs:${name}`, "pm2LogsTerminal", { pm2Name: name, projectId });
  }
  async function pm2Action(name: string, projectId: string, action: string) {
    pm2ActionDraft[name] = "";
    if (action === "logs") await pm2Logs(name, projectId);
    else if (action === "restart") await pm2Restart(name, projectId);
    else if (action === "delete") await pm2Delete(name, projectId);
  }

  async function stopAll(project: Project) {
    const services = liveServicesFor(project);
    const ports = services.filter((s) => s.isRunning).map((s) => s.port);
    const key = `stopAll:${project.id}`;
    commandsStore.inflight = { ...commandsStore.inflight, [key]: true };
    try {
      await commandsStore.run(`pm2DeleteAll:${project.id}`, "pm2DeleteAll", { projectId: project.id });
      if (ports.length > 0) {
        await commandsStore.run(`killPorts:${project.id}`, "killPorts", { ports });
      }
    } finally {
      const next = { ...commandsStore.inflight };
      delete next[key];
      commandsStore.inflight = next;
    }
  }

  async function executeSelectedTask(project: Project) {
    const label = selectedTaskByProject[project.id];
    if (!label) return;
    const task = project.vscodeTasksInfo?.tasks?.find((t: VsCodeTask) => t.label === label);
    if (!task) return;
    await commandsStore.run(`execTask:${project.id}:${label}`, "executeTask", {
      task,
      projectPath: project.projectPath,
      projectId: project.id,
      allTasks: project.vscodeTasksInfo?.tasks ?? [],
    }, { timeoutMs: 60_000 });
  }
</script>

<div class="port-monitor">
  <div class="menu-bar">
    <div class="menu-left">
      <h1 class="menu-title"><img src="/logo.svg" alt="PortIO" /></h1>
    </div>
    <div class="menu-center">
      <span class="last-updated">{projects.length} projects · live</span>
    </div>
    <div class="menu-right">
      <a class="help-link" href="/help" title="Help"><button><HelpCircle size={14} /> Help</button></a>
      <a class="export-link" href="/export" title="Export ports"><button class="export-nav-btn"><Download size={14} /> Export</button></a>
      <button class="minimize-btn" onclick={minimizeCursor} disabled={commandsStore.isRunning("minimize")} title="Minimize all Cursor windows">
        <EyeOff size={14} /> {commandsStore.isRunning("minimize") ? "Minimizing…" : "Minimize Cursor"}
      </button>
      <button class="rescan-btn" onclick={rescan} disabled={commandsStore.isRunning("rescan")} title="Rescan projects">
        <RefreshCw size={14} class={commandsStore.isRunning("rescan") ? "rotating" : ""} />
        {commandsStore.isRunning("rescan") ? "Scanning…" : "Rescan Projects"}
      </button>
    </div>
  </div>

  {#if !projectsStore.loaded}
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Loading projects from Firestore…</p>
    </div>
  {:else if projects.length === 0}
    <div class="no-projects">
      <h3>No projects yet</h3>
      <p>The daemon hasn't found any <code>wf-ports.json</code> files under your projects directory. Make sure <code>portio-daemon</code> is running, then click rescan.</p>
      <button class="rescan-btn" onclick={rescan}><RefreshCw size={14} /> Rescan Projects</button>
    </div>
  {:else}
    <div class="projects-table-container">
      <table class="projects-table">
        <thead>
          <tr>
            <th class="favicon-column">Icon</th>
            <th class="project-name-column">Project</th>
            <th class="quick-actions-column">Quick</th>
            <th class="tasks-column">Tasks</th>
            <th class="ports-column">Active Ports</th>
            <th class="pm2-column">PM2 Processes</th>
            <th class="stop-column">Stop</th>
            <th class="git-column">Git Status</th>
          </tr>
        </thead>
        <tbody>
          {#each projects as project (project.id)}
            {@const services = liveServicesFor(project)}
            {@const runningServices = services.filter((s) => s.isRunning)}
            {@const procs = pm2For(project.id)}
            {@const stopKey = `stopAll:${project.id}`}
            {@const isActive = activePortCount(project) > 0 || pm2RunningCount(project) > 0}
            {@const fbUrl = firebaseUrl(project)}
            {@const gcUrl = cloudUrl(project)}
            <tr class="project-row" class:active={isActive}>
              <td class="favicon-column">
                {#if project.faviconDataUrl}
                  <img src={project.faviconDataUrl} alt={project.name || project.id} class="project-favicon" />
                {:else}
                  <Folder size={20} class="default-favicon" />
                {/if}
              </td>
              <td class="project-name-column">
                <div class="project-name-cell">
                  <button type="button" class="project-name clickable" onclick={() => (detailsModal = project)} title="Click for more details">
                    {project.name || project.id}
                  </button>
                  {#if project.pathExists === false}
                    <span class="path-error-badge" title="Path not found">!</span>
                  {/if}
                </div>
              </td>
              <td class="quick-actions-column">
                <div class="quick-actions-icons">
                  {#if project.projectPath}
                    <button class="quick-action-btn" onclick={() => openFinder(project)} disabled={commandsStore.isRunning(`finder:${project.id}`)} title="Open in Finder">
                      <img src="/icons/finder.webp" alt="Finder" class="action-icon" />
                    </button>
                  {/if}
                  {#if project.focusIdentifier && project.projectPath}
                    <button class="quick-action-btn" onclick={() => focusCursor(project)} disabled={commandsStore.isRunning(`cursor:${project.id}`)} title="Open in Cursor">
                      <img src="/icons/cursor.webp" alt="Cursor" class="action-icon" />
                    </button>
                  {/if}
                  {#if fbUrl}
                    <a class="quick-action-btn" href={fbUrl} target="_blank" rel="noreferrer" title="Firebase Console">
                      <img src="/icons/firebase.webp" alt="Firebase" class="action-icon" />
                    </a>
                  {/if}
                  {#if gcUrl}
                    <a class="quick-action-btn" href={gcUrl} target="_blank" rel="noreferrer" title="Google Cloud Console">
                      <img src="/icons/google-cloud.webp" alt="Google Cloud" class="action-icon" />
                    </a>
                  {/if}
                </div>
              </td>
              <td class="tasks-column">
                {#if (project.vscodeTasksInfo?.tasks?.length ?? 0) > 0}
                  <div class="tasks-controls">
                    <select class="task-select" bind:value={selectedTaskByProject[project.id]} title={selectedTaskByProject[project.id] || "Select task"}>
                      {#each [...(project.vscodeTasksInfo!.tasks)].sort((a, b) => a.label.localeCompare(b.label)) as t}
                        <option value={t.label}>{t.label}</option>
                      {/each}
                    </select>
                    <button
                      class="run-task-btn-small"
                      title="Run task"
                      onclick={() => executeSelectedTask(project)}
                      disabled={commandsStore.isRunning(`execTask:${project.id}:${selectedTaskByProject[project.id]}`)}
                    >
                      <Play size={14} class={commandsStore.isRunning(`execTask:${project.id}:${selectedTaskByProject[project.id]}`) ? "rotating" : ""} />
                    </button>
                  </div>
                {:else}
                  <span class="no-tasks">no tasks</span>
                {/if}
              </td>
              <td class="ports-column">
                <div class="ports-container">
                  <div class="ports-list">
                    {#if runningServices.length === 0}
                      <span class="no-ports">—</span>
                    {:else}
                      {#each runningServices as s}
                        <span class="port-badge">
                          {#if s.url}
                            <a class="port-link" href={s.url} target="_blank" rel="noreferrer" title={s.purpose}>
                              <span class="port-name">{s.name}</span><span class="port-number">:{s.port}</span>
                            </a>
                          {:else}
                            <span class="port-link">
                              <span class="port-name">{s.name}</span><span class="port-number">:{s.port}</span>
                            </span>
                          {/if}
                          <button
                            class="kill-port-btn-small"
                            title="Kill {s.port}"
                            onclick={() => killOnePort(project, s.port)}
                            disabled={commandsStore.isRunning(`killPort:${project.id}:${s.port}`)}
                          >×</button>
                        </span>
                      {/each}
                    {/if}
                  </div>
                  {#if runningServices.length > 0}
                    <button
                      class="kill-all-btn"
                      title="Kill all ports for {project.id}"
                      onclick={() => killAllPorts(project)}
                      disabled={commandsStore.isRunning(`killPorts:${project.id}`)}
                    >×</button>
                  {/if}
                </div>
              </td>
              <td class="pm2-column">
                <div class="pm2-container">
                  <div class="pm2-processes-list">
                    {#if procs.length === 0}
                      <span class="no-pm2">—</span>
                    {:else}
                      {#each procs as proc}
                        <span class="pm2-process-badge" class:offline={proc.status !== "online"}>
                          <span class="pm2-name" title={proc.name}>{proc.name}</span>
                          <select
                            class="pm2-actions-select-compact"
                            value={pm2ActionDraft[proc.name] || ""}
                            onchange={(e) => pm2Action(proc.name, project.id, (e.currentTarget as HTMLSelectElement).value)}
                            disabled={commandsStore.isRunning(`pm2logs:${proc.name}`) || commandsStore.isRunning(`pm2restart:${proc.name}`) || commandsStore.isRunning(`pm2delete:${proc.name}`)}
                            title="Process actions"
                          >
                            <option value="">⋮</option>
                            <option value="logs">View Logs</option>
                            <option value="restart">Restart</option>
                            <option value="delete">Delete</option>
                          </select>
                        </span>
                      {/each}
                    {/if}
                  </div>
                </div>
              </td>
              <td class="stop-column">
                <button
                  class="stop-all-btn"
                  onclick={() => stopAll(project)}
                  disabled={commandsStore.isRunning(stopKey) || (!isActive)}
                  title="Stop everything for {project.id}"
                >
                  <StopCircle size={16} />
                </button>
              </td>
              <td class="git-column">
                {#if project.gitInfo?.branch}
                  {@const dirty = project.gitInfo.status?.hasUncommittedChanges}
                  {@const ahead = project.gitInfo.status?.ahead ?? 0}
                  {@const behind = project.gitInfo.status?.behind ?? 0}
                  {#if project.gitInfo.repoUrl}
                    <a class="git-status clickable" href={project.gitInfo.repoUrl} target="_blank" rel="noreferrer" title="Open repository">
                      <GitBranch size={12} />
                      <span class="git-branch">{project.gitInfo.branch}</span>
                      {#if ahead}<span class="git-ahead">↑{ahead}</span>{/if}
                      {#if behind}<span class="git-behind">↓{behind}</span>{/if}
                      {#if dirty}<span class="git-dirty-indicator">●</span>{:else}<span class="git-clean-indicator">✓</span>{/if}
                    </a>
                  {:else}
                    <div class="git-status">
                      <GitBranch size={12} />
                      <span class="git-branch">{project.gitInfo.branch}</span>
                      {#if ahead}<span class="git-ahead">↑{ahead}</span>{/if}
                      {#if behind}<span class="git-behind">↓{behind}</span>{/if}
                      {#if dirty}<span class="git-dirty-indicator">●</span>{:else}<span class="git-clean-indicator">✓</span>{/if}
                    </div>
                  {/if}
                {:else}
                  <span class="no-git">—</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if detailsModal}
  {@const p = detailsModal}
  <button
    type="button"
    class="modal-overlay"
    aria-label="Close details"
    onclick={() => (detailsModal = null)}
    onkeydown={(e) => { if (e.key === "Escape") detailsModal = null; }}
  ></button>
  <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="details-title" tabindex="-1">
    <div class="modal-header">
      <h2 id="details-title">
        {#if p.faviconDataUrl}<img src={p.faviconDataUrl} alt="" class="modal-favicon" />{:else}<Folder size={28} class="modal-default-favicon" />{/if}
        {p.name || p.id}
      </h2>
      <button class="modal-close" onclick={() => (detailsModal = null)} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      {#if p.description}
        <div class="modal-section"><p>{p.description}</p></div>
      {/if}
      <div class="modal-section">
        <h3>Project Info</h3>
        <div class="info-grid">
          <div class="info-item"><strong>ID</strong><span>{p.id}</span></div>
          {#if p.projectPath}<div class="info-item full-width"><strong>Path</strong><span class="path-text">{p.projectPath}</span></div>{/if}
          {#if p.firebaseInfo?.projectId}<div class="info-item"><strong>Firebase</strong><span>{p.firebaseInfo.projectId}</span></div>{/if}
          {#if p.gitInfo?.branch}
            <div class="info-item"><strong>Branch</strong><span>{p.gitInfo.branch}</span></div>
            <div class="info-item"><strong>Status</strong>
              {#if p.gitInfo.status?.hasUncommittedChanges}<span class="status-dirty">Uncommitted changes</span>{:else}<span class="status-clean">Clean</span>{/if}
            </div>
          {/if}
          {#if p.gitInfo?.repoUrl}<div class="info-item full-width"><strong>Repo</strong><a class="repo-link" href={p.gitInfo.repoUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {p.gitInfo.repoUrl}</a></div>{/if}
        </div>
      </div>
      {#if p.firebaseInfo?.projectId || p.firebaseProjectId}
        <div class="modal-section">
          <h3>Cloud</h3>
          <div class="console-links">
            <a class="console-link-btn" href={firebaseUrl(p)} target="_blank" rel="noreferrer"><Cloud size={16} /> Firebase Console</a>
            <a class="console-link-btn" href={cloudUrl(p)} target="_blank" rel="noreferrer"><Cloud size={16} /> Google Cloud</a>
          </div>
        </div>
      {/if}
      {#if (p.services?.length ?? 0) > 0}
        <div class="modal-section">
          <h3>Services</h3>
          <div class="services-list">
            {#each p.services! as s}
              {@const live = liveStatusStore.forProject(p.id)?.services?.find((x) => x.port === s.port)}
              <div class="service-item" class:running={live?.isRunning}>
                <div class="service-header">
                  <span class="service-name">{s.name}</span>
                  <span class="service-port">
                    :{s.port}
                    {#if live?.isRunning}<span class="running-badge">live</span>{/if}
                  </span>
                </div>
                {#if s.purpose}<div class="service-purpose">{s.purpose}</div>{/if}
                {#if s.url}<div class="service-url"><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></div>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
      {#if (p.vscodeTasksInfo?.tasks?.length ?? 0) > 0}
        <div class="modal-section">
          <h3>VS Code Tasks ({p.vscodeTasksInfo!.tasks.length})</h3>
          <div class="tasks-list">
            {#each p.vscodeTasksInfo!.tasks as t}
              <div class="task-item"><span class="task-label">{t.label}</span></div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .port-monitor {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: #1e1e1e;
    color: #e0e0e0;
  }

  /* Menu bar */
  .menu-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #252525;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }
  .menu-left { display: flex; align-items: center; gap: 15px; }
  .menu-title { margin: 0; display: flex; align-items: center; gap: 10px; }
  .menu-title img { height: 32px; width: auto; }
  .menu-center { display: flex; align-items: center; gap: 10px; }
  .last-updated { font-size: 13px; color: #999; }
  .menu-right { display: flex; align-items: center; gap: 10px; }
  .menu-right button { padding: 6px 12px; font-size: 13px; }
  .help-link, .export-link { text-decoration: none; }
  .rescan-btn { background: #007bff !important; border-color: #0056b3 !important; color: white !important; }
  .rescan-btn:hover:not(:disabled) { background: #0056b3 !important; }
  .minimize-btn { background: #6c757d !important; border-color: #545b62 !important; color: white !important; }
  .minimize-btn:hover:not(:disabled) { background: #545b62 !important; }

  /* Loading + empty */
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(100vh - 60px); gap: 20px; }
  .loading-spinner { width: 50px; height: 50px; border: 4px solid #333; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
  .loading p { color: #999; font-size: 16px; }
  .no-projects { display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(100vh - 60px); gap: 15px; color: #999; padding: 0 20px; text-align: center; }
  .no-projects h3 { margin: 0; font-size: 24px; color: #e0e0e0; }
  .no-projects p { margin: 5px 0; max-width: 500px; }

  /* Table */
  .projects-table-container { flex: 1; overflow-x: auto; padding: 20px; }
  .projects-table { width: 100%; border-collapse: collapse; background: #252525; border-radius: 8px; overflow: hidden; }
  .projects-table thead { background: #2a2a2a; border-bottom: 2px solid #444; }
  .projects-table thead th {
    padding: 12px 10px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  th.favicon-column { width: 40px; text-align: center; }
  th.project-name-column { min-width: 150px; }
  th.tasks-column { min-width: 140px; }
  th.ports-column { min-width: 220px; }
  th.pm2-column { min-width: 220px; }
  th.stop-column { width: 60px; min-width: 60px; text-align: center; }
  th.git-column { min-width: 150px; }
  th.quick-actions-column { width: 120px; min-width: 120px; }

  .project-row { border-bottom: 1px solid #333; transition: background-color 0.2s; }
  .project-row:hover { background: #2a2a2a; }
  .project-row.active { background: rgba(40, 167, 69, 0.1); border-left: 3px solid #28a745; }
  .project-row.active:hover { background: rgba(40, 167, 69, 0.15); }
  .project-row td { padding: 10px; font-size: 13px; vertical-align: middle; }

  /* Favicon column */
  td.favicon-column { text-align: center; }
  .project-favicon { width: 24px; height: 24px; border-radius: 4px; object-fit: contain; }
  :global(.default-favicon) { color: #666; }

  /* Project name */
  .project-name-cell { display: flex; align-items: center; gap: 8px; }
  .project-name { font-weight: 500; color: #e0e0e0; background: none; border: 0; padding: 0; cursor: pointer; }
  .project-name.clickable:hover { color: #007bff; text-decoration: underline; }
  .path-error-badge { color: #dc3545; font-size: 14px; font-weight: bold; }

  /* Quick actions */
  .quick-actions-icons { display: flex; align-items: center; gap: 4px; }
  .quick-action-btn {
    width: 24px;
    height: 24px;
    padding: 2px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .quick-action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.15);
  }
  .quick-action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .action-icon { width: 18px; height: 18px; object-fit: contain; }

  /* Tasks */
  .tasks-controls { display: flex; align-items: center; gap: 5px; }
  .task-select { flex: 1; max-width: 130px; padding: 5px 6px; font-size: 11px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run-task-btn-small { padding: 5px 8px; background: #444; border: 1px solid #555; }
  .run-task-btn-small:hover:not(:disabled) { background: #555; border-color: #666; }

  /* Ports */
  .ports-container { display: flex; align-items: center; gap: 8px; }
  .ports-list { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }
  .port-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    background: rgba(40, 167, 69, 0.2);
    border: 1px solid rgba(40, 167, 69, 0.4);
    border-radius: 4px;
    font-size: 12px;
  }
  .port-link {
    color: #28a745;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .port-link:hover { color: #1e7e34; text-decoration: underline; }
  .port-name { font-weight: 500; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .port-number { color: #1e7e34; font-size: 11px; opacity: 0.85; font-family: "Monaco", "Menlo", monospace; }
  .kill-port-btn-small {
    padding: 0 4px;
    background: transparent;
    color: #e0e0e0;
    border: none;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .kill-port-btn-small:hover:not(:disabled) { color: #fff; }
  .kill-all-btn {
    padding: 4px 7px;
    background: transparent;
    color: #dc3545;
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 4px;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }
  .kill-all-btn:hover:not(:disabled) { background: rgba(220, 53, 69, 0.2); border-color: #dc3545; }

  /* PM2 */
  .pm2-container { display: flex; align-items: center; gap: 8px; }
  .pm2-processes-list { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }
  .pm2-process-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    background: rgba(0, 123, 255, 0.2);
    border: 1px solid rgba(0, 123, 255, 0.4);
    border-radius: 4px;
    font-size: 12px;
  }
  .pm2-process-badge.offline {
    background: rgba(220, 53, 69, 0.15);
    border-color: rgba(220, 53, 69, 0.4);
  }
  .pm2-process-badge.offline .pm2-name { color: #ff6b7a; }
  .pm2-name { color: #4fa3ff; font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pm2-actions-select-compact {
    width: 26px;
    padding: 1px 2px;
    font-size: 12px;
    background: transparent;
    color: #4fa3ff;
    border: 1px solid rgba(0, 123, 255, 0.4);
    border-radius: 3px;
    cursor: pointer;
    text-align: center;
    appearance: none;
    -webkit-appearance: none;
  }
  .pm2-actions-select-compact:hover:not(:disabled) { background: rgba(0, 123, 255, 0.3); }
  .pm2-actions-select-compact option { background: #2a2a2a; color: #e0e0e0; }

  /* Stop */
  td.stop-column { text-align: center; }
  .stop-all-btn {
    padding: 6px 10px;
    background: transparent;
    color: #dc3545;
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .stop-all-btn:hover:not(:disabled) { background: rgba(220, 53, 69, 0.2); border-color: #dc3545; color: #ff4757; }
  .stop-all-btn:disabled { opacity: 0.15; cursor: not-allowed; }

  /* Git */
  .git-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #e0e0e0;
  }
  .git-status.clickable:hover .git-branch { text-decoration: underline; color: #4fa3ff; }
  .git-branch { color: #e0e0e0; font-weight: 500; font-family: "Monaco", "Menlo", monospace; }
  .git-ahead { color: #28a745; font-size: 11px; }
  .git-behind { color: #ffc107; font-size: 11px; }
  .git-dirty-indicator { color: #ffc107; font-size: 11px; line-height: 1; }
  .git-clean-indicator { color: #28a745; font-size: 11px; }

  /* Empty placeholders */
  .no-tasks, .no-ports, .no-pm2, .no-git { color: #666; font-style: italic; font-size: 12px; }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.8);
    border: 0;
    padding: 0;
    cursor: pointer;
    z-index: 1000;
  }
  .modal-content {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: #252525;
    border: 1px solid #444;
    border-radius: 8px;
    max-width: 800px;
    width: calc(100% - 40px);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 1001;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 25px;
    border-bottom: 1px solid #333;
    position: sticky;
    top: 0;
    background: #252525;
    z-index: 10;
  }
  .modal-header h2 { margin: 0; font-size: 22px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 12px; }
  .modal-favicon { width: 28px; height: 28px; border-radius: 4px; object-fit: contain; }
  .modal-close { background: transparent; border: none; color: #999; font-size: 24px; padding: 5px 10px; line-height: 1; }
  .modal-close:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
  .modal-body { padding: 25px; }
  .modal-section { margin-bottom: 24px; }
  .modal-section:last-child { margin-bottom: 0; }
  .modal-section h3 { margin: 0 0 14px; font-size: 16px; font-weight: 600; color: #fff; border-bottom: 2px solid #333; padding-bottom: 8px; }
  .modal-section p { margin: 8px 0; line-height: 1.6; color: #ccc; }
  .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
  .info-item { display: flex; flex-direction: column; gap: 4px; }
  .info-item.full-width { grid-column: 1 / -1; }
  .info-item strong { color: #aaa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-item span { color: #e0e0e0; font-size: 13px; }
  .path-text { font-family: "Monaco", "Menlo", monospace; font-size: 12px; color: #4fc3f7; word-break: break-all; }
  .status-dirty { color: #ffc107; font-weight: 600; }
  .status-clean { color: #28a745; font-weight: 600; }
  .repo-link { color: #007bff; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }
  .console-links { display: flex; gap: 10px; flex-wrap: wrap; }
  .console-link-btn { padding: 8px 16px; font-size: 13px; background: #007bff; color: white; border: 1px solid #0056b3; border-radius: 4px; display: inline-flex; align-items: center; gap: 8px; font-weight: 500; }
  .console-link-btn:hover { background: #0056b3; text-decoration: none; }
  .services-list { display: flex; flex-direction: column; gap: 10px; }
  .service-item { background: #2a2a2a; border: 1px solid #444; border-left: 3px solid #6c757d; border-radius: 4px; padding: 12px; }
  .service-item.running { border-left-color: #28a745; background: rgba(40, 167, 69, 0.05); }
  .service-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .service-name { font-weight: 600; color: #fff; font-size: 14px; }
  .service-port { color: #aaa; font-size: 13px; display: flex; align-items: center; gap: 8px; font-family: "Monaco", "Menlo", monospace; }
  .running-badge { background: #28a745; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-family: inherit; }
  .service-purpose { color: #999; font-size: 13px; margin-bottom: 4px; }
  .service-url a { color: #007bff; font-size: 12px; font-family: "Monaco", "Menlo", monospace; }
  .tasks-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .task-item { background: #2a2a2a; border: 1px solid #444; padding: 6px 12px; border-radius: 4px; font-size: 13px; }
  .task-label { color: #e0e0e0; font-weight: 500; }
</style>
