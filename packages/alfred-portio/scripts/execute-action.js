#!/usr/bin/env node
/**
 * Alfred Run Script: Execute actions for Portio
 * Receives format like "action:projectId" or "runtask:projectId:taskLabel"
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CACHE_FILE = path.join(__dirname, '..', '.project-cache.json');
const API_BASE = 'http://localhost:3851';

function getProject(projectId) {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return cache[projectId];
  } catch (e) {
    return null;
  }
}

function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3851,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ success: true, message: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const input = (process.argv[2] || '').trim();
  
  if (!input) {
    console.log('No action provided');
    return;
  }

  // Parse action format: "action:projectId" or "runtask:projectId:taskLabel"
  const parts = input.split(':');
  const action = parts[0];
  const projectId = parts[1];
  const extra = parts.slice(2).join(':'); // For task label which might contain colons

  const project = getProject(projectId);
  
  if (!project && action !== 'tasks') {
    console.log(`Project not found: ${projectId}`);
    return;
  }

  switch (action) {
    case 'cursor':
      exec(`cursor "${project.projectPath}"`, (error) => {
        if (error) {
          console.log(`Error: ${error.message}`);
        } else {
          console.log(`Opened ${project.name} in Cursor`);
        }
      });
      break;

    case 'finder':
      exec(`open "${project.projectPath}"`, (error) => {
        if (error) {
          console.log(`Error: ${error.message}`);
        } else {
          console.log(`Opened ${project.name} in Finder`);
        }
      });
      break;

    case 'github':
      if (project.gitInfo?.repoUrl) {
        exec(`open "${project.gitInfo.repoUrl}"`, (error) => {
          if (error) {
            console.log(`Error: ${error.message}`);
          } else {
            console.log(`Opened GitHub for ${project.name}`);
          }
        });
      } else {
        console.log('No GitHub URL available');
      }
      break;

    case 'firebase':
      if (project.firebaseInfo?.projectId) {
        const url = `https://console.firebase.google.com/project/${project.firebaseInfo.projectId}`;
        exec(`open "${url}"`, (error) => {
          if (error) {
            console.log(`Error: ${error.message}`);
          } else {
            console.log(`Opened Firebase Console for ${project.name}`);
          }
        });
      } else {
        console.log('No Firebase project ID available');
      }
      break;

    case 'runtask':
      const taskLabel = extra;
      if (!taskLabel) {
        console.log('No task specified');
        return;
      }
      
      try {
        const result = await apiPost('/api/task/execute', {
          projectId: project.id,
          projectPath: project.projectPath,
          taskLabel: taskLabel
        });
        
        if (result.success) {
          console.log(`Started task: ${taskLabel}`);
        } else {
          console.log(`Failed: ${result.message || result.error}`);
        }
      } catch (error) {
        console.log(`Error running task: ${error.message}`);
      }
      break;

    default:
      console.log(`Unknown action: ${action}`);
  }
}

main();
