const GITHUB_API = "https://api.github.com";

let backoffUntil = 0;

function parseOwnerRepo(repoUrl) {
  if (!repoUrl) return null;
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function getWorkflowRuns(owner, repo, branch, token) {
  if (Date.now() < backoffUntil) return null;

  const url = `${GITHUB_API}/repos/${owner}/${repo}/actions/runs?per_page=5&branch=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 401 || res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const resetAt = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      backoffUntil = resetAt || Date.now() + 60_000;
      console.warn(`[ci] rate-limited, backing off until ${new Date(backoffUntil).toISOString()}`);
    } else {
      console.error(`[ci] GitHub API auth error ${res.status} for ${owner}/${repo}`);
    }
    return null;
  }

  if (!res.ok) {
    console.error(`[ci] GitHub API ${res.status} for ${owner}/${repo}: ${res.statusText}`);
    return null;
  }

  const data = await res.json();
  return (data.workflow_runs || []).map((run) => ({
    id: run.id,
    workflowName: run.name || run.workflow_id,
    status: run.status,
    conclusion: run.conclusion,
    branch: run.head_branch,
    event: run.event,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
  }));
}

module.exports = { getWorkflowRuns, parseOwnerRepo };
