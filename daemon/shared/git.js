const fs = require("fs").promises;
const path = require("path");
const { execWithTimeout } = require("./exec");

async function getGitInfo(projectPath) {
  try {
    const gitDir = path.join(projectPath, ".git");
    try {
      await fs.access(gitDir);
    } catch {
      return null;
    }

    const gitInfo = {
      isGitRepo: true,
      branch: null,
      remoteUrl: null,
      repoUrl: null,
      status: {
        modified: [],
        untracked: [],
        staged: [],
        ahead: 0,
        behind: 0,
        hasChanges: false,
        hasUncommittedChanges: false,
      },
      lastCommit: null,
    };

    try {
      gitInfo.branch = await execWithTimeout(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: projectPath },
        3000,
      );
    } catch {}

    try {
      const remote = await execWithTimeout(
        "git remote get-url origin",
        { cwd: projectPath },
        3000,
      );
      gitInfo.remoteUrl = remote;
      if (remote.startsWith("git@github.com:")) {
        gitInfo.repoUrl = remote.replace("git@github.com:", "https://github.com/").replace(/\.git$/, "");
      } else if (remote.startsWith("https://github.com/")) {
        gitInfo.repoUrl = remote.replace(/\.git$/, "");
      }
    } catch {}

    try {
      const statusResult = await execWithTimeout(
        "git status --porcelain",
        { cwd: projectPath },
        5000,
      );
      const statusLines = statusResult.split("\n").filter((l) => l.trim());
      gitInfo.status.hasChanges = statusLines.length > 0;
      gitInfo.status.hasUncommittedChanges = statusLines.length > 0;
      for (const line of statusLines) {
        const code = line.substring(0, 2);
        const file = line.substring(3);
        if (code[0] !== " " && code[0] !== "?") gitInfo.status.staged.push(file);
        if (code[1] !== " ") {
          if (code[1] === "?") gitInfo.status.untracked.push(file);
          else gitInfo.status.modified.push(file);
        }
      }
    } catch {}

    try {
      const aheadBehind = await execWithTimeout(
        "git rev-list --left-right --count HEAD...@{u}",
        { cwd: projectPath },
        3000,
      );
      const [ahead, behind] = aheadBehind.split("\t").map(Number);
      gitInfo.status.ahead = ahead || 0;
      gitInfo.status.behind = behind || 0;
    } catch {}

    try {
      const lastCommit = await execWithTimeout(
        'git log -1 --pretty=format:"%H|%an|%ad|%s" --date=iso',
        { cwd: projectPath },
        3000,
      );
      if (lastCommit) {
        const [hash, author, date, message] = lastCommit.split("|");
        gitInfo.lastCommit = { hash, author, date, message };
      }
    } catch {}

    return gitInfo;
  } catch {
    return null;
  }
}

module.exports = { getGitInfo };
