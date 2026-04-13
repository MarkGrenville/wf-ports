#!/usr/bin/env node
/**
 * Alfred Script Filter: Show actions for a selected project
 * Receives the project ID and looks up details from cache
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '.project-cache.json');

async function main() {
  const projectId = (process.argv[2] || '').trim();
  
  if (!projectId) {
    console.log(JSON.stringify({
      items: [{
        title: 'No project selected',
        valid: false,
        icon: { path: 'icon.png' }
      }]
    }));
    return;
  }

  // Load project from cache
  let project;
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    project = cache[projectId];
  } catch (e) {
    // Cache doesn't exist or is invalid
  }

  if (!project) {
    console.log(JSON.stringify({
      items: [{
        title: 'Project not found',
        subtitle: `Could not find project: ${projectId}`,
        valid: false,
        icon: { path: 'icon.png' }
      }]
    }));
    return;
  }

  const items = [];

  // 1. Open in Cursor
  items.push({
    uid: 'open-cursor',
    title: 'Open in Cursor',
    subtitle: project.projectPath || '',
    arg: `cursor:${project.id}`,
    icon: { path: 'icons/cursor.png' }
  });

  // 2. Run Task (if tasks exist)
  if (project.tasks && project.tasks.length > 0) {
    items.push({
      uid: 'run-task',
      title: 'Run Task...',
      subtitle: `${project.tasks.length} tasks available`,
      arg: `tasks:${project.id}`,
      icon: { path: 'icons/task.png' }
    });
  }

  // 3. Open GitHub (if git repo with remote URL)
  if (project.gitInfo?.isGitRepo && project.gitInfo?.repoUrl) {
    items.push({
      uid: 'open-github',
      title: 'Open GitHub',
      subtitle: project.gitInfo.repoUrl,
      arg: `github:${project.id}`,
      icon: { path: 'icons/github.png' }
    });
  }

  // 4. Open Firebase Console (if Firebase project)
  if (project.firebaseInfo?.isFirebaseProject && project.firebaseInfo?.projectId) {
    items.push({
      uid: 'open-firebase',
      title: 'Open Firebase Console',
      subtitle: project.firebaseInfo.projectId,
      arg: `firebase:${project.id}`,
      icon: { path: 'icons/firebase.png' }
    });
  }

  // 5. Open in Finder
  items.push({
    uid: 'open-finder',
    title: 'Open in Finder',
    subtitle: project.projectPath || '',
    arg: `finder:${project.id}`,
    icon: { path: 'icons/finder.png' }
  });

  console.log(JSON.stringify({ items }));
}

main();
