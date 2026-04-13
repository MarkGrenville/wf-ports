#!/usr/bin/env node
/**
 * Alfred Script Filter: List all Portio projects
 * Shows clean project list with name, description, and icon
 */

const fs = require('fs');
const path = require('path');
const api = require('../lib/api');

// Cache file to store project data for the actions script
const CACHE_FILE = path.join(__dirname, '..', '.project-cache.json');

async function main() {
  const query = (process.argv[2] || '').toLowerCase().trim();

  try {
    const response = await api.getProjects();
    
    if (!response.projects || response.projects.length === 0) {
      console.log(JSON.stringify({
        items: [{
          title: 'No projects found',
          subtitle: 'Run "Rescan Projects" in Portio first',
          valid: false,
          icon: { path: 'icon.png' }
        }]
      }));
      return;
    }

    let projects = response.projects;

    // Save full project data to cache for actions script to use
    const cache = {};
    projects.forEach(p => {
      cache[p.id] = {
        id: p.id,
        name: p.name,
        projectPath: p.projectPath,
        faviconPath: p.faviconPath,
        // Git info
        gitInfo: p.gitInfo ? {
          isGitRepo: p.gitInfo.isGitRepo,
          repoUrl: p.gitInfo.repoUrl,
          branch: p.gitInfo.branch
        } : null,
        // Firebase info
        firebaseInfo: p.firebaseInfo ? {
          isFirebaseProject: p.firebaseInfo.isFirebaseProject,
          projectId: p.firebaseInfo.projectId
        } : null,
        // VS Code tasks
        tasks: p.vscodeTasksInfo?.tasks?.map(t => ({
          label: t.label,
          command: t.command
        })) || []
      };
    });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

    // Filter by query if provided
    if (query) {
      projects = projects.filter(p => 
        (p.name || '').toLowerCase().includes(query) ||
        (p.id || '').toLowerCase().includes(query) ||
        (p.description || '').toLowerCase().includes(query)
      );
    }

    // Sort projects alphabetically
    projects.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

    const items = projects.map(project => {
      const iconPath = project.faviconPath || 'icon.png';
      
      return {
        uid: project.id,
        title: project.name || project.id,
        subtitle: project.description || '',
        arg: project.id,
        autocomplete: project.name || project.id,
        icon: { path: iconPath },
        mods: {
          cmd: {
            subtitle: 'Open in Cursor',
            arg: `cursor:${project.id}`
          }
        }
      };
    });

    if (items.length === 0) {
      items.push({
        title: `No projects matching "${query}"`,
        subtitle: 'Try a different search term',
        valid: false,
        icon: { path: 'icon.png' }
      });
    }

    console.log(JSON.stringify({ items }));
  } catch (error) {
    console.log(JSON.stringify({
      items: [{
        title: 'Error connecting to Portio',
        subtitle: error.message,
        valid: false,
        icon: { path: 'icon.png' }
      }]
    }));
  }
}

main();
