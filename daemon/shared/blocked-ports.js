/**
 * Ports that are never available for local project allocation.
 * System range 0–1023 is always blocked; CURATED covers well-known services above that.
 */

const SYSTEM_MAX = 1023;

/** Named ports for docs / API listing (labels optional). */
const CURATED = [
  // Common development
  { port: 3306, label: "MySQL" },
  { port: 5432, label: "PostgreSQL" },
  { port: 6379, label: "Redis" },
  { port: 27017, label: "MongoDB" },
  { port: 5672, label: "RabbitMQ" },
  { port: 15672, label: "RabbitMQ management" },
  { port: 9200, label: "Elasticsearch" },
  { port: 9300, label: "Elasticsearch transport" },
  { port: 2181, label: "Zookeeper" },
  { port: 9092, label: "Kafka" },
  // Other common services
  { port: 1433, label: "MSSQL" },
  { port: 1521, label: "Oracle" },
  { port: 2049, label: "NFS" },
  { port: 3389, label: "RDP" },
  { port: 5000, label: "Flask default / macOS AirPlay" },
  { port: 5001, label: "macOS AirPlay" },
  { port: 5353, label: "mDNS/Bonjour" },
  { port: 5900, label: "VNC" },
  { port: 8000, label: "common dev" },
  { port: 8080, label: "HTTP alt" },
  { port: 8443, label: "HTTPS alt" },
  { port: 8888, label: "Jupyter" },
  { port: 9000, label: "PHP-FPM" },
  { port: 9090, label: "Prometheus" },
];

const CURATED_SET = new Set(CURATED.map((c) => c.port));

/** Notable system ports for human-readable docs (entire 0–1023 is still blocked). */
const SYSTEM_HIGHLIGHTS = [
  { port: 20, label: "FTP" },
  { port: 21, label: "FTP" },
  { port: 22, label: "SSH" },
  { port: 23, label: "Telnet" },
  { port: 25, label: "SMTP" },
  { port: 53, label: "DNS" },
  { port: 67, label: "DHCP" },
  { port: 68, label: "DHCP" },
  { port: 80, label: "HTTP" },
  { port: 88, label: "Kerberos" },
  { port: 110, label: "POP3" },
  { port: 119, label: "NNTP" },
  { port: 123, label: "NTP" },
  { port: 143, label: "IMAP" },
  { port: 161, label: "SNMP" },
  { port: 162, label: "SNMP" },
  { port: 194, label: "IRC" },
  { port: 311, label: "AppleShare" },
  { port: 389, label: "LDAP" },
  { port: 427, label: "SLP" },
  { port: 443, label: "HTTPS" },
  { port: 465, label: "SMTPS" },
  { port: 514, label: "Syslog" },
  { port: 548, label: "AFP" },
  { port: 587, label: "SMTP" },
  { port: 631, label: "CUPS/Printing" },
  { port: 636, label: "LDAPS" },
  { port: 749, label: "Kerberos Admin" },
  { port: 993, label: "IMAPS" },
  { port: 995, label: "POP3S" },
  { port: 1023, label: "Reserved" },
];

function isBlocked(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 0 || n > 65535) return true;
  if (n <= SYSTEM_MAX) return true;
  return CURATED_SET.has(n);
}

/** Curated blocked ports above the system range (for API listing). */
function listBlockedExtra() {
  return CURATED.map((c) => ({ port: c.port, label: c.label, source: "blocked" }));
}

function listBlocked() {
  return {
    systemRange: { from: 0, to: SYSTEM_MAX },
    systemHighlights: SYSTEM_HIGHLIGHTS,
    ports: listBlockedExtra(),
  };
}

function formatBlockedMarkdown() {
  const fmt = (items) =>
    items.map((i) => (i.label ? `${i.port} (${i.label})` : String(i.port))).join(", ");

  return `These are common system and web ports that should not be used for local development.
The allocator blocks the entire range **0–${SYSTEM_MAX}** plus the curated list below.

**System Ports (0–${SYSTEM_MAX}):**
${fmt(SYSTEM_HIGHLIGHTS)}

**Common Development Ports:**
${fmt(CURATED.filter((c) => [3306, 5432, 6379, 27017, 5672, 15672, 9200, 9300, 2181, 9092].includes(c.port)))}

**Other Common Services:**
${fmt(CURATED.filter((c) => ![3306, 5432, 6379, 27017, 5672, 15672, 9200, 9300, 2181, 9092].includes(c.port)))}`;
}

module.exports = {
  SYSTEM_MAX,
  isBlocked,
  listBlocked,
  listBlockedExtra,
  formatBlockedMarkdown,
};
