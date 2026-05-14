export type ServiceConfig = {
  name: string;
  port: number;
  url?: string;
  purpose?: string;
};

export type GitInfo = {
  isGitRepo: boolean;
  branch?: string | null;
  remoteUrl?: string | null;
  repoUrl?: string | null;
  status?: {
    modified?: string[];
    untracked?: string[];
    staged?: string[];
    ahead?: number;
    behind?: number;
    hasChanges?: boolean;
    hasUncommittedChanges?: boolean;
  };
  lastCommit?: { hash: string; author: string; date: string; message: string } | null;
};

export type FirebaseInfo = {
  isFirebaseProject: boolean;
  projectId?: string | null;
  projectAlias?: string | null;
  hasFirebaseRC?: boolean;
  availableProjects?: { alias: string; projectId: string }[];
  firebaseTools?: { hasFirebaseCLI?: boolean; version?: string };
  firebaseConfig?: unknown;
};

export type Project = {
  id: string;
  name?: string;
  description?: string;
  projectPath?: string;
  configPath?: string;
  directoryName?: string;
  pathExists?: boolean;
  focusIdentifier?: string;
  projectBackendPath?: string;
  firebaseProjectId?: string;
  pm2Prefix?: string;
  faviconPath?: string;
  faviconDataUrl?: string | null;
  services?: ServiceConfig[];
  vscodeTasksInfo?: { tasksPath?: string; tasks: VsCodeTask[]; version?: string } | null;
  startAllTasks?: VsCodeTask[];
  hasStartAllTasks?: boolean;
  gitInfo?: GitInfo | null;
  firebaseInfo?: FirebaseInfo | null;
};

export type VsCodeTask = {
  label: string;
  command?: string;
  args?: string[];
  execution?: { command: string; args?: string[] };
  dependsOn?: string[];
  type?: string;
};

export type LiveStatus = {
  services: (ServiceConfig & { isRunning: boolean; pid: number | null; processName: string | null })[];
  lastChecked?: { toDate?: () => Date } | Date;
};

export type Pm2Process = {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  pid: number | null;
  restarts: number;
  uptime: number | null;
  execPath: string | null;
  cwd: string | null;
  projectId: string;
};

export type Command = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "error";
  result?: unknown;
  error?: string;
  createdAt?: unknown;
  claimedAt?: unknown;
  completedAt?: unknown;
  claimedBy?: string;
};
