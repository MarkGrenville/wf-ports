function buildPortioDocsMarkdown(projects) {
  const allPorts = [];
  for (const project of projects) {
    if (Array.isArray(project.services)) {
      for (const service of project.services) {
        if (typeof service.port === "number" && !allPorts.includes(service.port)) {
          allPorts.push(service.port);
        }
      }
    }
  }
  allPorts.sort((a, b) => a - b);

  return `# PortIO - Local Development Ports

I have various local projects running in development on my computer at any one time. In light of that, can you update all the ports of this project to use unique ports? Here are the ports I'm currently using:

## Currently Used Ports

${allPorts.join(", ")}

---

## Standard Ports to Avoid

These are common system and web ports that should not be used for local development:

**System Ports (0-1023):**
20, 21 (FTP), 22 (SSH), 23 (Telnet), 25 (SMTP), 53 (DNS), 67, 68 (DHCP), 80 (HTTP), 110 (POP3), 119 (NNTP), 123 (NTP), 143 (IMAP), 161, 162 (SNMP), 194 (IRC), 443 (HTTPS), 465 (SMTPS), 514 (Syslog), 587 (SMTP), 993 (IMAPS), 995 (POP3S)

**Common Development Ports:**
3306 (MySQL), 5432 (PostgreSQL), 6379 (Redis), 27017 (MongoDB), 5672, 15672 (RabbitMQ), 9200, 9300 (Elasticsearch), 2181 (Zookeeper), 9092 (Kafka)

**macOS Specific:**
88 (Kerberos), 311 (AppleShare), 389 (LDAP), 427 (SLP), 548 (AFP), 631 (CUPS/Printing), 636 (LDAPS), 749 (Kerberos Admin), 1023 (Reserved)

**Other Common Services:**
1433 (MSSQL), 1521 (Oracle), 2049 (NFS), 3389 (RDP), 5000 (Flask default, macOS AirPlay), 5001 (macOS AirPlay), 5353 (mDNS/Bonjour), 5900 (VNC), 8000 (common dev), 8080 (HTTP alt), 8443 (HTTPS alt), 8888 (Jupyter), 9000 (PHP-FPM), 9090 (Prometheus)

---

## wf-ports.json Reference

The \`wf-ports.json\` file configures how PortIO monitors your project. Place it in your project root directory.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| \`id\` | string | Unique identifier (lowercase with hyphens). Used for PM2 naming and database storage. Example: \`"my-project"\` |
| \`name\` | string | Display name shown in PortIO. Can contain spaces and special characters. Example: \`"My Project"\` |
| \`services\` | array | Array of service objects to monitor (see below) |

### Service Object Fields

| Field | Type | Description |
|-------|------|-------------|
| \`name\` | string | Service name (e.g., "Frontend", "API") |
| \`port\` | number | Port number (e.g., 3000) |
| \`url\` | string | URL to open in browser (e.g., \`"http://localhost:3000"\`) |
| \`purpose\` | string | Description of what the service does |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| \`faviconPath\` | string | Absolute path to favicon image. Embedded as base64 in Firestore on rescan. |
| \`description\` | string | Brief project description shown in details popup |
| \`focusIdentifier\` | string | Identifier to focus Cursor window. Should match part of window title |
| \`projectPath\` | string | Absolute path to project root. Auto-detected if not specified |
| \`projectBackendPath\` | string | Path to backend subdirectory for terminal actions |
| \`firebaseProjectId\` | string | Firebase project ID. Auto-detected from \`firebase.json\` or \`.firebaserc\` |
| \`pm2Prefix\` | string | Custom prefix for PM2 process matching. Defaults to \`id\`. |

---

## PM2 Process Naming Convention

PM2 processes should be named \`{projectId}-{taskLabel}\` so PortIO can associate them.
`;
}

function buildUsedPortsExport(projects) {
  const allPorts = new Set();
  const portToServices = new Map();
  const projectsOut = [];

  for (const project of projects) {
    if (!Array.isArray(project.services)) continue;
    const svcOut = [];
    for (const svc of project.services) {
      if (typeof svc.port !== "number") continue;
      allPorts.add(svc.port);
      svcOut.push({
        name: svc.name,
        port: svc.port,
        description: svc.purpose || "",
        url: svc.url,
      });
      if (!portToServices.has(svc.port)) portToServices.set(svc.port, []);
      portToServices.get(svc.port).push({ project: project.name || project.id, service: svc.name });
    }
    projectsOut.push({
      id: project.id,
      name: project.name || project.id,
      path: project.projectPath,
      services: svcOut,
    });
  }

  const duplicatePorts = [];
  for (const [port, usedBy] of portToServices.entries()) {
    if (usedBy.length > 1) duplicatePorts.push({ port, usedBy });
  }

  const portsByType = {};
  for (const project of projectsOut) {
    for (const svc of project.services) {
      const type = svc.name?.toLowerCase().includes("backend")
        ? "Backend"
        : svc.name?.toLowerCase().includes("frontend")
        ? "Frontend"
        : svc.name?.toLowerCase().includes("emul")
        ? "Emulator"
        : "Other";
      if (!portsByType[type]) portsByType[type] = [];
      portsByType[type].push({ port: svc.port, project: project.name });
    }
  }

  return {
    summary: {
      totalProjects: projectsOut.length,
      totalPorts: Array.from(allPorts).length,
      uniquePorts: Array.from(allPorts).length,
      lastScanned: new Date().toISOString(),
    },
    allPorts: Array.from(allPorts).sort((a, b) => a - b),
    projects: projectsOut,
    duplicatePorts,
    portsByType,
  };
}

module.exports = { buildPortioDocsMarkdown, buildUsedPortsExport };
