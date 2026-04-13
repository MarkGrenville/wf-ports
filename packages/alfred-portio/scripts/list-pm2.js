#!/usr/bin/env node
/**
 * Alfred Script Filter: List PM2 processes for a project
 * Usage: node list-pm2.js <project-json>
 */

const api = require('../lib/api');

async function main() {
  const input = process.argv[2];
  
  if (!input) {
    console.log(JSON.stringify({
      items: [{
        title: 'No project selected',
        valid: false
      }]
    }));
    return;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    console.log(JSON.stringify({
      items: [{
        title: 'Invalid data',
        subtitle: e.message,
        valid: false
      }]
    }));
    return;
  }

  const project = data.project || data;
  const projectPrefix = (project.pm2Prefix || project.id).toLowerCase().replace(/[^a-z0-9]/g, '-');

  try {
    const response = await api.getPm2Processes();
    
    if (!response.processes || response.processes.length === 0) {
      console.log(JSON.stringify({
        items: [{
          title: 'No PM2 processes running',
          subtitle: 'Start some tasks first',
          valid: false
        }]
      }));
      return;
    }

    // Filter processes for this project
    const projectProcesses = response.processes.filter(proc => {
      const name = proc.name || '';
      return name === projectPrefix || name.startsWith(`${projectPrefix}-`);
    });

    if (projectProcesses.length === 0) {
      console.log(JSON.stringify({
        items: [{
          title: `No PM2 processes for ${project.name || project.id}`,
          subtitle: `Looking for processes starting with "${projectPrefix}"`,
          valid: false
        }]
      }));
      return;
    }

    const items = projectProcesses.map(proc => {
      const status = proc.pm2_env?.status || 'unknown';
      const memory = proc.monit?.memory ? formatBytes(proc.monit.memory) : 'N/A';
      const cpu = proc.monit?.cpu !== undefined ? `${proc.monit.cpu}%` : 'N/A';
      const uptime = proc.pm2_env?.pm_uptime ? formatUptime(proc.pm2_env.pm_uptime) : 'N/A';

      const statusIcon = status === 'online' ? '🟢' : status === 'stopped' ? '🔴' : '🟡';

      return {
        uid: proc.name,
        title: `${statusIcon} ${proc.name}`,
        subtitle: `Status: ${status} | CPU: ${cpu} | Memory: ${memory} | Uptime: ${uptime}`,
        arg: JSON.stringify({
          action: 'pm2-menu',
          project,
          process: proc
        }),
        icon: { path: 'icons/pm2.png' },
        mods: {
          cmd: {
            subtitle: `View logs for ${proc.name}`,
            arg: JSON.stringify({
              action: 'pm2-logs',
              project,
              pm2Name: proc.name
            })
          },
          alt: {
            subtitle: `Restart ${proc.name}`,
            arg: JSON.stringify({
              action: 'pm2-restart',
              project,
              pm2Name: proc.name
            })
          },
          ctrl: {
            subtitle: `Delete ${proc.name}`,
            arg: JSON.stringify({
              action: 'pm2-delete',
              project,
              pm2Name: proc.name
            })
          }
        }
      };
    });

    console.log(JSON.stringify({ items }));
  } catch (error) {
    console.log(JSON.stringify({
      items: [{
        title: 'Error getting PM2 processes',
        subtitle: error.message,
        valid: false
      }]
    }));
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(startTime) {
  const diff = Date.now() - startTime;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

main();
