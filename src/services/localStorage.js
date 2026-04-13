const STORAGE_KEYS = {
  RESCAN_PROJECTS_SETTINGS: "port-monitor-rescan-settings",
  STATUS_DATA: "port-monitor-status-data",
  STATUS_TIMESTAMP: "port-monitor-status-timestamp",
  CACHE_DURATION: 2 * 60 * 1000, // 2 minutes for status cache
};

export const StorageService = {
  // Save rescan projects settings to localStorage
  saveRescanSettings: (settings) => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.RESCAN_PROJECTS_SETTINGS,
        JSON.stringify(settings)
      );
      // console.log(`Saved rescan projects settings to localStorage`);
    } catch (error) {
      console.error("Failed to save rescan settings to localStorage:", error);
    }
  },

  // Load rescan projects settings from localStorage
  loadRescanSettings: () => {
    try {
      const cached = localStorage.getItem(
        STORAGE_KEYS.RESCAN_PROJECTS_SETTINGS
      );
      if (!cached) return null;

      const settings = JSON.parse(cached);
      // console.log(`Loaded rescan projects settings from localStorage`);
      return settings;
    } catch (error) {
      console.error("Failed to load rescan settings from localStorage:", error);
      StorageService.clearRescanSettings();
      return null;
    }
  },

  // Clear rescan projects settings
  clearRescanSettings: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.RESCAN_PROJECTS_SETTINGS);
      // console.log("Cleared rescan projects settings from localStorage");
    } catch (error) {
      console.error("Failed to clear rescan settings:", error);
    }
  },

  // Save complete status data to localStorage
  saveStatusData: (projects, pm2Processes, lastUpdated) => {
    try {
      const statusData = {
        projects,
        pm2Processes,
        lastUpdated: lastUpdated?.toISOString(),
        timestamp: Date.now(),
      };
      localStorage.setItem(
        STORAGE_KEYS.STATUS_DATA,
        JSON.stringify(statusData)
      );
      localStorage.setItem(
        STORAGE_KEYS.STATUS_TIMESTAMP,
        Date.now().toString()
      );
      // console.log(
      //   `💾 Cached status data for ${projects.length} projects to localStorage`
      // );
    } catch (error) {
      console.error("Failed to save status data to localStorage:", error);
    }
  },

  // Load complete status data from localStorage
  loadStatusData: () => {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.STATUS_DATA);
      if (!cached) return null;

      const statusData = JSON.parse(cached);
      const now = Date.now();

      // Return cached data regardless of age for instant loading
      // We'll update in background anyway
      // console.log(
      //   `⚡ Loaded cached status data for ${
      //     statusData.projects.length
      //   } projects (${Math.floor((now - statusData.timestamp) / 1000)}s old)`
      // );

      return {
        projects: statusData.projects,
        pm2Processes: statusData.pm2Processes || [],
        lastUpdated: statusData.lastUpdated
          ? new Date(statusData.lastUpdated)
          : null,
        timestamp: statusData.timestamp,
        isStale: now - statusData.timestamp > STORAGE_KEYS.CACHE_DURATION,
      };
    } catch (error) {
      console.error("Failed to load status data from localStorage:", error);
      StorageService.clearStatusData();
      return null;
    }
  },

  // Clear status data cache
  clearStatusData: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.STATUS_DATA);
      localStorage.removeItem(STORAGE_KEYS.STATUS_TIMESTAMP);
      // console.log("🗑️ Cleared status data cache from localStorage");
    } catch (error) {
      console.error("Failed to clear status data:", error);
    }
  },

  // Check if status cache exists
  hasStatusCache: () => {
    try {
      return localStorage.getItem(STORAGE_KEYS.STATUS_DATA) !== null;
    } catch (error) {
      return false;
    }
  },

  // Get cache age in seconds
  getStatusCacheAge: () => {
    try {
      const timestamp = localStorage.getItem(STORAGE_KEYS.STATUS_TIMESTAMP);
      if (!timestamp) return null;

      const ageMs = Date.now() - parseInt(timestamp);
      return Math.floor(ageMs / 1000); // Convert to seconds
    } catch (error) {
      return null;
    }
  },

  // Clean up any old cache keys that should no longer be used
  cleanupOldCache: () => {
    try {
      // Remove old caching keys that are no longer used
      const oldKeys = ["port-monitor-projects", "port-monitor-last-scan"];

      oldKeys.forEach((key) => {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
          // console.log(`Removed old cache key: ${key}`);
        }
      });
    } catch (error) {
      console.error("Failed to cleanup old cache:", error);
    }
  },
};
