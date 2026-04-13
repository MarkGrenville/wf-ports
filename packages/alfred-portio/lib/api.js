/**
 * Portio API Client for Alfred Workflow
 * Communicates with the Portio Express server at localhost:3001
 */

const http = require('http');

const API_BASE = 'http://localhost:3851';

/**
 * Make an HTTP request to the Portio API
 */
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Portio server not running. Start Portio first. (${e.message})`));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Get all projects from Portio
 */
async function getProjects() {
  return request('GET', '/api/projects');
}

/**
 * Get PM2 process list
 */
async function getPm2Processes() {
  return request('GET', '/api/pm2-list');
}

/**
 * Execute a VS Code task
 */
async function executeTask(projectId, projectPath, taskLabel, task, allTasks) {
  return request('POST', '/api/execute-task', {
    projectId,
    projectPath,
    taskLabel,
    task,
    allTasks,
  });
}

/**
 * Open PM2 logs in terminal
 */
async function pm2LogsTerminal(projectId, taskLabel, pm2Name) {
  return request('POST', '/api/pm2-logs-terminal', {
    projectId,
    taskLabel,
    pm2Name,
  });
}

/**
 * Restart PM2 process
 */
async function pm2Restart(projectId, taskLabel, pm2Name) {
  return request('POST', '/api/pm2-restart', {
    projectId,
    taskLabel,
    pm2Name,
  });
}

/**
 * Delete PM2 process
 */
async function pm2Delete(projectId, taskLabel, pm2Name) {
  return request('POST', '/api/pm2-delete', {
    projectId,
    taskLabel,
    pm2Name,
  });
}

/**
 * Delete all PM2 processes for a project
 */
async function pm2DeleteAll(projectId) {
  return request('POST', '/api/pm2-delete-all', { projectId });
}

/**
 * Kill a specific port
 */
async function killPort(projectId, port, serviceName) {
  return request('POST', '/api/kill-port', {
    projectId,
    port,
    serviceName,
  });
}

/**
 * Kill all ports for a project
 */
async function killPorts(projectId, ports) {
  return request('POST', '/api/kill-ports', {
    projectId,
    ports,
  });
}

/**
 * Focus/open project in Cursor
 */
async function focusTerminal(projectId, focusIdentifier, projectPath) {
  return request('POST', '/api/focus-terminal', {
    projectId,
    focusIdentifier,
    projectPath,
  });
}

/**
 * Check health of Portio server
 */
async function healthCheck() {
  return request('GET', '/api/health');
}

module.exports = {
  getProjects,
  getPm2Processes,
  executeTask,
  pm2LogsTerminal,
  pm2Restart,
  pm2Delete,
  pm2DeleteAll,
  killPort,
  killPorts,
  focusTerminal,
  healthCheck,
};
