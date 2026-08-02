<script lang="ts">
  import { cronStore } from "$lib/stores/cron.svelte";
  import { commandsStore } from "$lib/commands.svelte";
  import { socket } from "$lib/socket.svelte";
  import type { CronJob, CronRunEntry } from "$lib/types";
  import {
    ArrowLeft,
    Play,
    Pause,
    Clock,
    CheckCircle2,
    XCircle,
    Loader,
    SkipForward,
    ChevronDown,
    ChevronUp,
    FileText,
    RefreshCw,
  } from "lucide-svelte";

  let expandedJobs = $state<Record<string, boolean>>({});
  let logsModal = $state<{ job: CronJob; content: string } | null>(null);

  const jobs = $derived(cronStore.jobs);

  function formatDuration(ms: number | undefined): string {
    if (ms == null) return "...";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec}s`;
  }

  function formatAge(seconds: number | null): string {
    if (seconds == null) return "";
    if (seconds < 60) return `${seconds}s ago`;
    const min = Math.floor(seconds / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m ago`;
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusColor(run: CronRunEntry): string {
    switch (run.status) {
      case "success": return "#28a745";
      case "failed": return "#dc3545";
      case "running": return "#f0ad4e";
      case "skipped": return "#6c757d";
      default: return "#999";
    }
  }

  async function pauseJob(job: CronJob) {
    if (!job.plistPath) return;
    await commandsStore.run(
      `pauseCron:${job.label}`,
      "pauseCronJob",
      { plistPath: job.plistPath },
    );
  }

  async function resumeJob(job: CronJob) {
    if (!job.plistPath) return;
    await commandsStore.run(
      `resumeCron:${job.label}`,
      "resumeCronJob",
      { plistPath: job.plistPath },
    );
  }

  async function viewLogs(job: CronJob) {
    if (!job.logFile) return;
    const result = await commandsStore.run(
      `cronLogs:${job.label}`,
      "cronJobLogs",
      { logFile: job.logFile, lines: 150 },
    );
    if (result.status === "done" && result.result) {
      logsModal = { job, content: (result.result as { logs: string }).logs };
    }
  }

  function toggleExpand(label: string) {
    expandedJobs = { ...expandedJobs, [label]: !expandedJobs[label] };
  }
</script>

<div class="cron-page">
  <div class="menu-bar">
    <div class="menu-left">
      <a class="back-link" href="/"><button><ArrowLeft size={14} /> Dashboard</button></a>
      <h1 class="page-title">Scheduled Jobs</h1>
    </div>
    <div class="menu-center">
      {#if socket.connected}
        <span class="status-text">{jobs.length} job{jobs.length !== 1 ? "s" : ""} · live</span>
      {:else}
        <span class="daemon-offline"><span class="offline-dot"></span> daemon offline</span>
      {/if}
    </div>
    <div class="menu-right">
      <a class="back-link" href="/"><button><RefreshCw size={14} /> Dashboard</button></a>
    </div>
  </div>

  <div class="cron-container">
    {#if !cronStore.loaded}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>{socket.connected ? "Loading scheduled jobs..." : "Connecting to daemon..."}</p>
      </div>
    {:else if jobs.length === 0}
      <div class="empty-state">
        <Clock size={48} />
        <h3>No scheduled jobs found</h3>
        <p>Add a <code>.webfootprint/cron.json</code> file to any project to register launchd-scheduled jobs for monitoring.</p>
        <div class="config-example">
          <h4>Example config</h4>
          <pre>{`{
  "jobs": [{
    "label": "com.myproject.generate",
    "name": "Page Generator",
    "description": "Runs hourly to generate content",
    "lockFile": ".my-job.lock",
    "logFile": "logs/generator.log",
    "plistPath": "~/Library/LaunchAgents/com.myproject.generate.plist"
  }]
}`}</pre>
        </div>
      </div>
    {:else}
      <div class="jobs-grid">
        {#each jobs as job (job.label)}
          {@const isPausing = commandsStore.isRunning(`pauseCron:${job.label}`)}
          {@const isResuming = commandsStore.isRunning(`resumeCron:${job.label}`)}
          {@const isLoadingLogs = commandsStore.isRunning(`cronLogs:${job.label}`)}
          {@const expanded = expandedJobs[job.label] ?? false}
          <div class="job-card" class:running={job.isRunning} class:paused={!job.loaded}>
            <div class="job-header">
              <div class="job-identity">
                <div class="job-status-indicator" class:active={job.isRunning} class:loaded={job.loaded && !job.isRunning} class:unloaded={!job.loaded}></div>
                <div>
                  <h2 class="job-name">{job.name}</h2>
                  <span class="job-project">{job.projectName}</span>
                </div>
              </div>
              <div class="job-controls">
                {#if job.logFile}
                  <button
                    class="control-btn logs-btn"
                    onclick={() => viewLogs(job)}
                    disabled={isLoadingLogs}
                    title="View logs"
                  >
                    <FileText size={14} />
                    {isLoadingLogs ? "Loading..." : "Logs"}
                  </button>
                {/if}
                {#if job.plistPath}
                  {#if job.loaded}
                    <button
                      class="control-btn pause-btn"
                      onclick={() => pauseJob(job)}
                      disabled={isPausing}
                      title="Pause schedule (launchctl unload)"
                    >
                      <Pause size={14} />
                      {isPausing ? "Pausing..." : "Pause"}
                    </button>
                  {:else}
                    <button
                      class="control-btn resume-btn"
                      onclick={() => resumeJob(job)}
                      disabled={isResuming}
                      title="Resume schedule (launchctl load)"
                    >
                      <Play size={14} />
                      {isResuming ? "Resuming..." : "Resume"}
                    </button>
                  {/if}
                {/if}
              </div>
            </div>

            {#if job.description}
              <p class="job-description">{job.description}</p>
            {/if}

            <div class="job-meta">
              <div class="meta-item">
                <span class="meta-label">Schedule</span>
                <span class="meta-value"><Clock size={12} /> {job.schedule}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Status</span>
                <span class="meta-value">
                  {#if job.isRunning}
                    <span class="status-badge status-running"><Loader size={12} class="spinning" /> Running{#if job.lockAge != null} ({formatAge(job.lockAge)}){/if}</span>
                  {:else if job.loaded}
                    <span class="status-badge status-loaded">Scheduled</span>
                  {:else}
                    <span class="status-badge status-paused">Paused</span>
                  {/if}
                </span>
              </div>
              <div class="meta-item">
                <span class="meta-label">launchd label</span>
                <span class="meta-value mono">{job.label}</span>
              </div>
              {#if job.launchdPid}
                <div class="meta-item">
                  <span class="meta-label">PID</span>
                  <span class="meta-value mono">{job.launchdPid}</span>
                </div>
              {/if}
            </div>

            {#if job.latestRun}
              <div class="latest-run">
                <h3>Latest Run</h3>
                <div class="run-detail">
                  <span class="run-status-badge" style="color: {statusColor(job.latestRun)}">
                    {#if job.latestRun.status === "success"}<CheckCircle2 size={14} />{:else if job.latestRun.status === "failed"}<XCircle size={14} />{:else if job.latestRun.status === "running"}<Loader size={14} class="spinning" />{:else if job.latestRun.status === "skipped"}<SkipForward size={14} />{:else}<Clock size={14} />{/if}
                    {job.latestRun.status}
                  </span>
                  {#if job.latestRun.startedAt}
                    <span class="run-time">{formatTime(job.latestRun.startedAt)}</span>
                  {/if}
                  {#if job.latestRun.durationMs != null}
                    <span class="run-duration">{formatDuration(job.latestRun.durationMs)}</span>
                  {/if}
                  {#if job.latestRun.exitCode != null}
                    <span class="run-exit" class:error={job.latestRun.exitCode !== 0}>exit {job.latestRun.exitCode}</span>
                  {/if}
                </div>
              </div>
            {/if}

            {#if job.recentRuns.length > 1}
              <div class="history-section">
                <button class="history-toggle" onclick={() => toggleExpand(job.label)}>
                  {#if expanded}
                    <ChevronUp size={14} /> Hide history
                  {:else}
                    <ChevronDown size={14} /> Run history ({job.recentRuns.length})
                  {/if}
                </button>

                {#if expanded}
                  <div class="history-timeline">
                    {#each job.recentRuns as run, i}
                      <div class="timeline-entry" class:is-latest={i === 0}>
                        <div class="timeline-dot" style="background: {statusColor(run)}"></div>
                        <div class="timeline-content">
                          <span class="timeline-status" style="color: {statusColor(run)}">
                            {run.status}
                          </span>
                          <span class="timeline-time">{formatTime(run.startedAt)}</span>
                          {#if run.durationMs != null}
                            <span class="timeline-duration">{formatDuration(run.durationMs)}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if logsModal}
  <button
    type="button"
    class="modal-overlay"
    aria-label="Close logs"
    onclick={() => (logsModal = null)}
    onkeydown={(e) => { if (e.key === "Escape") logsModal = null; }}
  ></button>
  <div class="modal-content" role="dialog" aria-modal="true" tabindex="-1">
    <div class="modal-header">
      <h2>{logsModal.job.name} - Logs</h2>
      <button class="modal-close" onclick={() => (logsModal = null)} aria-label="Close">x</button>
    </div>
    <div class="modal-body">
      <pre class="log-output">{logsModal.content}</pre>
    </div>
  </div>
{/if}

<style>
  .cron-page { min-height: 100vh; background: #1e1e1e; display: flex; flex-direction: column; color: #e0e0e0; }

  .menu-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #252525; border-bottom: 1px solid #333; }
  .menu-left { display: flex; align-items: center; gap: 16px; }
  .menu-center { display: flex; align-items: center; }
  .menu-right { display: flex; gap: 10px; }
  .back-link { text-decoration: none; }
  .page-title { margin: 0; font-size: 18px; font-weight: 600; color: #e0e0e0; }
  .status-text { font-size: 13px; color: #999; }
  .daemon-offline { font-size: 13px; color: #dc3545; display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
  .offline-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc3545; animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .cron-container { flex: 1; padding: 24px 30px; max-width: 1000px; margin: 0 auto; width: 100%; }

  .loading { display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 80px; }
  .loading-spinner { width: 50px; height: 50px; border: 4px solid #333; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
  .loading p { color: #999; font-size: 16px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .empty-state { text-align: center; margin-top: 80px; color: #999; }
  .empty-state h3 { margin: 16px 0 8px; color: #e0e0e0; font-size: 20px; }
  .empty-state p { max-width: 480px; margin: 0 auto 24px; line-height: 1.6; }
  .empty-state code { background: #333; padding: 2px 6px; border-radius: 3px; font-size: 12px; color: #4fc3f7; }
  .config-example { text-align: left; max-width: 500px; margin: 0 auto; background: #252525; border: 1px solid #333; border-radius: 8px; padding: 16px 20px; }
  .config-example h4 { margin: 0 0 10px; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }
  .config-example pre { margin: 0; font-size: 12px; color: #4fc3f7; line-height: 1.6; overflow-x: auto; white-space: pre; }

  .jobs-grid { display: flex; flex-direction: column; gap: 16px; }

  .job-card {
    background: #252525;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 20px 24px;
    border-left: 4px solid #555;
    transition: border-color 0.2s;
  }
  .job-card.running { border-left-color: #f0ad4e; background: rgba(240, 173, 78, 0.04); }
  .job-card.paused { border-left-color: #6c757d; opacity: 0.75; }
  .job-card:not(.paused):not(.running) { border-left-color: #28a745; }

  .job-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .job-identity { display: flex; align-items: center; gap: 12px; }

  .job-status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #555;
  }
  .job-status-indicator.active {
    background: #f0ad4e;
    box-shadow: 0 0 8px rgba(240, 173, 78, 0.6);
    animation: pulse 1.5s ease-in-out infinite;
  }
  .job-status-indicator.loaded {
    background: #28a745;
    box-shadow: 0 0 6px rgba(40, 167, 69, 0.4);
  }
  .job-status-indicator.unloaded { background: #6c757d; }

  .job-name { margin: 0; font-size: 18px; font-weight: 600; color: #fff; }
  .job-project { font-size: 12px; color: #888; font-weight: 500; }

  .job-controls { display: flex; gap: 8px; flex-shrink: 0; }
  .control-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .control-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .pause-btn {
    background: rgba(220, 53, 69, 0.1);
    border-color: rgba(220, 53, 69, 0.4);
    color: #ff6b7a;
  }
  .pause-btn:hover:not(:disabled) { background: rgba(220, 53, 69, 0.2); }

  .resume-btn {
    background: rgba(40, 167, 69, 0.1);
    border-color: rgba(40, 167, 69, 0.4);
    color: #28a745;
  }
  .resume-btn:hover:not(:disabled) { background: rgba(40, 167, 69, 0.2); }

  .logs-btn {
    background: rgba(0, 123, 255, 0.1);
    border-color: rgba(0, 123, 255, 0.3);
    color: #4fa3ff;
  }
  .logs-btn:hover:not(:disabled) { background: rgba(0, 123, 255, 0.2); }

  .job-description { margin: 0 0 14px; font-size: 13px; color: #aaa; line-height: 1.5; }

  .job-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .meta-item { display: flex; flex-direction: column; gap: 3px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #777; font-weight: 600; }
  .meta-value { font-size: 13px; color: #ccc; display: flex; align-items: center; gap: 5px; }
  .mono { font-family: "Monaco", "Menlo", monospace; font-size: 11px; color: #4fc3f7; }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
  .status-running { background: rgba(240, 173, 78, 0.15); color: #f0ad4e; }
  .status-loaded { background: rgba(40, 167, 69, 0.12); color: #28a745; }
  .status-paused { background: rgba(108, 117, 125, 0.15); color: #adb5bd; }

  :global(.spinning) { animation: spin 1.2s linear infinite; }

  .latest-run { margin-bottom: 12px; }
  .latest-run h3 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #777;
    font-weight: 600;
  }
  .run-detail {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .run-status-badge { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 13px; text-transform: capitalize; }
  .run-time { font-size: 12px; color: #999; }
  .run-duration { font-size: 12px; color: #aaa; font-family: "Monaco", "Menlo", monospace; }
  .run-exit { font-size: 11px; color: #28a745; font-family: "Monaco", "Menlo", monospace; padding: 1px 6px; background: rgba(40, 167, 69, 0.1); border-radius: 3px; }
  .run-exit.error { color: #dc3545; background: rgba(220, 53, 69, 0.1); }

  .history-section { margin-top: 4px; }
  .history-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .history-toggle:hover { background: rgba(255, 255, 255, 0.08); color: #ccc; }

  .history-timeline {
    margin-top: 12px;
    padding-left: 8px;
    border-left: 2px solid #333;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .timeline-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    position: relative;
  }
  .timeline-entry.is-latest { font-weight: 600; }
  .timeline-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-left: -5px;
  }
  .timeline-content { display: flex; align-items: center; gap: 12px; font-size: 12px; }
  .timeline-status { font-weight: 500; text-transform: capitalize; min-width: 60px; }
  .timeline-time { color: #888; }
  .timeline-duration { color: #aaa; font-family: "Monaco", "Menlo", monospace; font-size: 11px; }

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
    max-width: 900px;
    width: calc(100% - 40px);
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 1001;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #333;
    position: sticky;
    top: 0;
    background: #252525;
    z-index: 10;
  }
  .modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; color: #fff; }
  .modal-close { background: transparent; border: none; color: #999; font-size: 20px; padding: 5px 10px; line-height: 1; cursor: pointer; }
  .modal-close:hover { color: #fff; background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
  .modal-body { padding: 16px 20px; }
  .log-output {
    margin: 0;
    font-family: "Monaco", "Menlo", monospace;
    font-size: 11px;
    line-height: 1.6;
    color: #ccc;
    white-space: pre-wrap;
    word-break: break-word;
    background: #1a1a1a;
    padding: 16px;
    border-radius: 6px;
    border: 1px solid #333;
    max-height: 60vh;
    overflow-y: auto;
  }
</style>
