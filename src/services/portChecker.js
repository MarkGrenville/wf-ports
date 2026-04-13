import axios from "axios";

// API base URL - uses relative URLs which work with the proxy in development
// The proxy setting in package.json forwards /api requests to the backend
const API_BASE = "/api";

export const checkPortStatus = async (url, timeout = 3000) => {
  // This function is deprecated - use checkMultipleServices instead
  // console.warn(
  //   "checkPortStatus is deprecated, use checkMultipleServices instead"
  // );
  return { isRunning: false, error: "Deprecated - use backend API" };
};

export const checkMultipleServices = async (services) => {
  try {
    // Use backend API to check port status instead of making direct HTTP requests
    const response = await axios.post(
      `${API_BASE}/check-ports`,
      {
        services: services,
      },
      {
        timeout: 10000, // 10 second timeout for backend API
      }
    );

    if (response.data.success) {
      return response.data.services;
    } else {
      console.error("Backend port check failed:", response.data.error);
      // Return services with unknown status
      return services.map((service) => ({
        ...service,
        isRunning: false,
        error: "Backend check failed",
      }));
    }
  } catch (error) {
    console.error("Error checking services via backend:", error);
    // Return services with unknown status if backend is unavailable
    return services.map((service) => ({
      ...service,
      isRunning: false,
      error: "Backend unavailable",
    }));
  }
};

export const killProjectPorts = async (projectId, ports) => {
  try {
    // Try to use a local backend service to kill ports
    const response = await axios.post(
      `${API_BASE}/kill-ports`,
      {
        projectId,
        ports,
      },
      {
        timeout: 10000,
      }
    );

    return {
      success: true,
      message: response.data.message || "Ports killed successfully",
    };
  } catch (error) {
    // If backend service is not available, fall back to alternative approach
    console.warn("Backend port killer service not available:", error.message);

    // Try to gracefully shutdown services that support it
    const shutdownResults = await Promise.allSettled(
      ports.map(async (port) => {
        try {
          // Try common shutdown endpoints
          const shutdownUrls = [
            `http://localhost:${port}/shutdown`,
            `http://localhost:${port}/api/shutdown`,
            `http://localhost:${port}/__shutdown`,
          ];

          for (const url of shutdownUrls) {
            try {
              await axios.post(url, {}, { timeout: 2000 });
              return { port, success: true };
            } catch (e) {
              // Continue to next URL
            }
          }
          return { port, success: false };
        } catch (e) {
          return { port, success: false, error: e.message };
        }
      })
    );

    return {
      success: false,
      message:
        'Backend service unavailable. Please use the VS Code task "Kill All Project Ports" or manually kill the processes.',
      shutdownResults: shutdownResults.map((result) => result.value),
    };
  }
};

export const focusTerminal = async (
  projectId,
  focusIdentifier,
  projectPath = null
) => {
  try {
    const response = await axios.post(
      `${API_BASE}/focus-terminal`,
      {
        projectId,
        focusIdentifier,
        projectPath,
      },
      {
        timeout: 5000,
      }
    );

    return {
      success: true,
      message: response.data.message || "Terminal focused successfully",
      action: response.data.action || "focused",
    };
  } catch (error) {
    console.warn("Backend focus service not available:", error.message);

    return {
      success: false,
      message:
        error.response?.data?.suggestion ||
        "Backend service unavailable. Make sure yabai and jq are installed and the backend is running.",
      details: error.response?.data?.details || error.message,
    };
  }
};

export const minimizeCursorWindows = async () => {
  try {
    const response = await axios.post(
      `${API_BASE}/minimize-cursor-windows`,
      {},
      {
        timeout: 5000,
      }
    );

    return {
      success: true,
      message:
        response.data.message || "All Cursor windows minimized successfully",
    };
  } catch (error) {
    console.warn("Backend minimize service not available:", error.message);

    return {
      success: false,
      message:
        error.response?.data?.suggestion ||
        "Backend service unavailable. Make sure yabai and jq are installed and the backend is running.",
      details: error.response?.data?.details || error.message,
    };
  }
};
