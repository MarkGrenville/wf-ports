// Firebase Service for generating console links based on detected Firebase projects
// This service works with Firebase project information detected by the backend CLI commands

// Check if Firebase project data is available
export const hasFirebaseProject = (projectFirebaseInfo) => {
  return (
    projectFirebaseInfo &&
    projectFirebaseInfo.isFirebaseProject &&
    projectFirebaseInfo.projectId
  );
};

// Get Firebase project information from project data
export const getFirebaseProjectInfo = (project) => {
  if (!project || !project.firebaseInfo) {
    return null;
  }

  const firebaseInfo = project.firebaseInfo;

  if (!firebaseInfo.isFirebaseProject || !firebaseInfo.projectId) {
    return null;
  }

  return {
    projectId: firebaseInfo.projectId,
    projectAlias: firebaseInfo.projectAlias,
    hasFirebaseCLI: firebaseInfo.firebaseTools?.hasFirebaseCLI || false,
    cliVersion: firebaseInfo.firebaseTools?.version,
    isActive: true, // Since it was detected in the project
    config: firebaseInfo.firebaseConfig,
    availableProjects: firebaseInfo.availableProjects || [],
  };
};

// Generate Google Cloud Console and Firebase links
export const generateCloudConsoleLinks = (
  project,
  serviceName = null,
  port = null
) => {
  const firebaseInfo = getFirebaseProjectInfo(project);

  if (!firebaseInfo || !firebaseInfo.projectId) {
    return {};
  }

  const projectId = firebaseInfo.projectId;
  const baseCloudUrl = "https://console.cloud.google.com";
  const baseFirebaseUrl = "https://console.firebase.google.com";

  // Generate service-specific log query if service name is provided
  let logQuery = "";
  if (serviceName) {
    // Create a log filter for the service
    logQuery = `resource.type="cloud_run_revision"
resource.labels.service_name="${serviceName}"`;

    // If port is provided, add it to the query
    if (port) {
      logQuery += `
jsonPayload.port="${port}"`;
    }
  }

  const encodedLogQuery = encodeURIComponent(logQuery);

  return {
    // Google Cloud Logs
    cloudLogs: serviceName
      ? `${baseCloudUrl}/logs/query;query=${encodedLogQuery};timeRange=PT1H?project=${projectId}`
      : `${baseCloudUrl}/logs/query?project=${projectId}`,

    // Cloud Run services
    cloudRun: `${baseCloudUrl}/run?project=${projectId}`,

    // Specific Cloud Run service (if service name matches)
    cloudRunService: serviceName
      ? `${baseCloudUrl}/run/detail/us-central1/${serviceName}?project=${projectId}`
      : null,

    // Firebase Console
    firebaseConsole: `${baseFirebaseUrl}/project/${projectId}`,

    // Firebase Functions
    firebaseFunctions: `${baseFirebaseUrl}/project/${projectId}/functions`,

    // Firebase Hosting
    firebaseHosting: `${baseFirebaseUrl}/project/${projectId}/hosting`,

    // Firebase Database
    firebaseDatabase: `${baseFirebaseUrl}/project/${projectId}/database`,

    // Firebase Auth
    firebaseAuth: `${baseFirebaseUrl}/project/${projectId}/authentication`,

    // Cloud Build
    cloudBuild: `${baseCloudUrl}/cloud-build/builds?project=${projectId}`,

    // Error Reporting
    errorReporting: `${baseCloudUrl}/errors?project=${projectId}`,

    // Performance Monitoring
    performance: `${baseCloudUrl}/traces/list?project=${projectId}`,

    // Cloud Storage
    cloudStorage: `${baseCloudUrl}/storage/browser?project=${projectId}`,

    // IAM & Admin
    iam: `${baseCloudUrl}/iam-admin/iam?project=${projectId}`,

    // APIs & Services
    apis: `${baseCloudUrl}/apis/dashboard?project=${projectId}`,
  };
};

// Generate Firebase Functions specific links
export const generateFunctionsLinks = (project) => {
  const firebaseInfo = getFirebaseProjectInfo(project);

  if (!firebaseInfo || !firebaseInfo.projectId) {
    return {};
  }

  const projectId = firebaseInfo.projectId;
  const baseFirebaseUrl = "https://console.firebase.google.com";
  const baseCloudUrl = "https://console.cloud.google.com";

  return {
    // Firebase Functions Console
    functionsConsole: `${baseFirebaseUrl}/project/${projectId}/functions`,

    // Cloud Functions (Google Cloud Console)
    cloudFunctions: `${baseCloudUrl}/functions/list?project=${projectId}`,

    // Functions Logs
    functionsLogs: `${baseCloudUrl}/logs/query;query=resource.type%3D%22cloud_function%22;timeRange=PT1H?project=${projectId}`,

    // Functions Usage
    functionsUsage: `${baseFirebaseUrl}/project/${projectId}/functions/usage`,

    // Functions Health
    functionsHealth: `${baseFirebaseUrl}/project/${projectId}/functions/health`,
  };
};

// Get Firebase project status for display
export const getProjectStatus = (project) => {
  const firebaseInfo = getFirebaseProjectInfo(project);

  if (!firebaseInfo) {
    return {
      hasFirebase: false,
      status: "No Firebase project detected",
      projectId: null,
    };
  }

  return {
    hasFirebase: true,
    status: firebaseInfo.hasFirebaseCLI
      ? "Firebase CLI available"
      : "Firebase project detected (no CLI)",
    projectId: firebaseInfo.projectId,
    alias: firebaseInfo.projectAlias,
    cliVersion: firebaseInfo.cliVersion,
    availableProjects: firebaseInfo.availableProjects?.length || 0,
  };
};

// Check if a project has Firebase Functions based on config
export const hasFunctions = (project) => {
  const firebaseInfo = getFirebaseProjectInfo(project);

  if (!firebaseInfo || !firebaseInfo.config) {
    return false;
  }

  return !!firebaseInfo.config.functions;
};

// Check if a project has Firebase Hosting based on config
export const hasHosting = (project) => {
  const firebaseInfo = getFirebaseProjectInfo(project);

  if (!firebaseInfo || !firebaseInfo.config) {
    return false;
  }

  return !!firebaseInfo.config.hosting;
};

// Default export with all functions
const FirebaseService = {
  hasFirebaseProject,
  getFirebaseProjectInfo,
  generateCloudConsoleLinks,
  generateFunctionsLinks,
  getProjectStatus,
  hasFunctions,
  hasHosting,
};

export default FirebaseService;
