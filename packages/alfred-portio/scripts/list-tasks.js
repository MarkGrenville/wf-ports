#!/usr/bin/env node
/**
 * Alfred Script Filter: List tasks for a project
 * Receives the project ID and shows available VS Code tasks
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '.project-cache.json');

async function main() {
  let input = (process.argv[2] || '').trim();
  
  // Handle "tasks:projectId" format from router
  const projectId = input.startsWith('tasks:') ? input.replace('tasks:', '') : input;
  
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
    // Cache doesn't exist
  }

  if (!project) {
    console.log(JSON.stringify({
      items: [{
        title: 'Project not found',
        valid: false,
        icon: { path: 'icon.png' }
      }]
    }));
    return;
  }

  if (!project.tasks || project.tasks.length === 0) {
    console.log(JSON.stringify({
      items: [{
        title: 'No tasks found',
        subtitle: 'No VS Code tasks configured for this project',
        valid: false,
        icon: { path: 'icons/task.png' }
      }]
    }));
    return;
  }

  const items = project.tasks.map((task, index) => ({
    uid: `task-${index}`,
    title: task.label,
    subtitle: task.command || 'Run this task',
    arg: `runtask:${project.id}:${task.label}`,
    icon: { path: 'icons/play.png' }
  }));

  console.log(JSON.stringify({ items }));
}

main();
