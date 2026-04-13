#!/usr/bin/env node
/**
 * Alfred Script Filter: Show PM2 action menu for a process
 * Usage: node pm2-menu.js <data-json>
 */

async function main() {
  const input = process.argv[2];
  
  if (!input) {
    console.log(JSON.stringify({
      items: [{
        title: 'No process selected',
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

  const { project, process: pm2Process } = data;
  const name = pm2Process?.name || 'unknown';

  const items = [
    {
      uid: 'pm2-logs',
      title: 'View Logs',
      subtitle: `Stream logs for ${name} in terminal`,
      arg: JSON.stringify({ action: 'pm2-logs', project, pm2Name: name }),
      icon: { path: 'icons/logs.png' }
    },
    {
      uid: 'pm2-restart',
      title: 'Restart Process',
      subtitle: `Restart ${name}`,
      arg: JSON.stringify({ action: 'pm2-restart', project, pm2Name: name }),
      icon: { path: 'icons/restart.png' }
    },
    {
      uid: 'pm2-delete',
      title: 'Delete Process',
      subtitle: `Stop and remove ${name} from PM2`,
      arg: JSON.stringify({ action: 'pm2-delete', project, pm2Name: name }),
      icon: { path: 'icons/delete.png' }
    }
  ];

  console.log(JSON.stringify({ items }));
}

main();
