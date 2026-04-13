import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import ServiceCard from "./ServiceCard";
import {
  checkMultipleServices,
  killProjectPorts,
  focusTerminal,
  minimizeCursorWindows,
} from "../services/portChecker";
import { StorageService } from "../services/localStorage";
import FirebaseService from "../services/firebaseService";
import FirestoreService from "../services/firestoreService";
import "./PortMonitor.scss";
import backgroundImage from "../assets/background.png";
import logoImage from "../assets/logo.svg";
import {
  MdAdd,
  MdCloudDownload,
  MdRefresh,
  MdLayers,
  MdPlayArrow,
  MdSettings,
  MdCancel,
  MdFolder,
  MdClose,
  MdKeyboardArrowUp,
  MdAccountTree,
  MdCommit,
  MdLink,
  MdVisibility,
  MdStop,
  MdCloud,
  MdWebAsset,
  MdTerminal,
  MdHelpOutline,
} from "react-icons/md";

const PortMonitor = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [killingPorts, setKillingPorts] = useState({});
  const [killingPm2, setKillingPm2] = useState({});
  const [stoppingAll, setStoppingAll] = useState({});
  const [focusingTerminal, setFocusingTerminal] = useState({});
  const [minimizingWindows, setMinimizingWindows] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [executingTasks, setExecutingTasks] = useState({});

  const [killingPort, setKillingPort] = useState(null);
  const [openingFinder, setOpeningFinder] = useState({});
  const [openingTerminal, setOpeningTerminal] = useState({});
  const [selectedTasks, setSelectedTasks] = useState({});
  const [pm2Processes, setPm2Processes] = useState([]);
  const [loadingPm2, setLoadingPm2] = useState(false);
  const [stoppingProcess, setStoppingProcess] = useState({});
  const [viewingLogs, setViewingLogs] = useState({});
  const [restartingProcess, setRestartingProcess] = useState({});
  const [rescanSettings, setRescanSettings] = useState({
    autoRescanOnStart: true,
    rescanInterval: 30000, // 30 seconds
  });
  const [initialStatusChecked, setInitialStatusChecked] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [projectDetailsModal, setProjectDetailsModal] = useState(null);

  // Define functions with useCallback to prevent re-creation and fix hoisting issues
  const scanProjectsForConfigs = useCallback(async () => {
    try {
      const response = await fetch("/api/scan-projects");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.projects || [];
    } catch (error) {
      console.error("Error scanning projects:", error);
      setScanError(error.message);
      return [];
    }
  }, []);

  const loadPm2Processes = useCallback(async () => {
    setLoadingPm2(true);
    try {
      const response = await fetch("/api/pm2-list");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setPm2Processes(data.processes || []);
        return data.processes || [];
      }
      return [];
    } catch (error) {
      console.error("Error loading PM2 processes:", error);
      setPm2Processes([]);
      return [];
    } finally {
      setLoadingPm2(false);
    }
  }, []);

  // Helper to get git status for a project
  const getGitStatus = async (projectPath) => {
    try {
      const response = await fetch("/api/git-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.gitInfo;
    } catch (error) {
      return null;
    }
  };

  const checkAllServices = useCallback(async () => {
    // Guard: Don't run if we have no projects to check
    if (projects.length === 0) {
      // console.log("⚠️ No projects to check - skipping port status check");
      return;
    }

    setChecking(true);
    try {
      // console.log(`🔍 Checking port status for ${projects.length} projects`);
      // Check port status, git status, and PM2 processes in parallel
      const [updatedProjects, pm2Data] = await Promise.all([
        Promise.all(
          projects.map(async (project) => {
            // Check port status and git status in parallel for each project
            const [updatedServices, gitInfo] = await Promise.all([
              checkMultipleServices(project.services),
              project.projectPath
                ? getGitStatus(project.projectPath)
                : Promise.resolve(null),
            ]);
            return {
              ...project,
              services: updatedServices,
              gitInfo: gitInfo || project.gitInfo, // Use new git info or keep existing
            };
          })
        ),
        loadPm2Processes(), // Also refresh PM2 processes
      ]);

      // Show Firebase project info for debugging
      updatedProjects.forEach((project) => {
        if (project.firebaseInfo && project.firebaseInfo.isFirebaseProject) {
          console.log(
            `🔥 Firebase Project: ${project.name} → ${project.firebaseInfo.projectId}`
          );
        }
      });

      // Sort projects: running ones first, then alphabetically
      const sortedProjects = updatedProjects.sort((a, b) => {
        const aActive = isProjectActive(a);
        const bActive = isProjectActive(b);

        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return a.name.localeCompare(b.name);
      });

      const now = new Date();
      setProjects(sortedProjects);
      setLastUpdated(now);
      setUsingCachedData(false);

      // Port status is ephemeral - not saved to Firestore
      // Only project configs are saved to Firestore during rescan
      // console.log(
      //   `✅ Updated port status for ${sortedProjects.length} projects`
      // );

      return { projects: sortedProjects, pm2Processes: pm2Data };
    } catch (error) {
      console.error("Error checking services:", error);
      return null;
    } finally {
      setChecking(false);
    }
  }, [projects, loadPm2Processes]);

  // Load projects from Firestore
  const loadProjectsFromFirestore = useCallback(async () => {
    try {
      console.log("📦 Loading projects from Firestore...");
      const firestoreProjects = await FirestoreService.getAllProjects();

      if (firestoreProjects && firestoreProjects.length > 0) {
        // Sort projects: active ones first, then alphabetically
        const sortedProjects = firestoreProjects.sort((a, b) => {
          const aActive = isProjectActive(a);
          const bActive = isProjectActive(b);

          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          return a.name.localeCompare(b.name);
        });

        setProjects(sortedProjects);
        setLastUpdated(new Date());
        console.log(
          `✅ Loaded ${sortedProjects.length} projects from Firestore`
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error loading projects from Firestore:", error);
      return false;
    }
  }, []);

  // Load rescan settings and setup page refresh detection
  useEffect(() => {
    // Clean up old cache on mount
    StorageService.cleanupOldCache();

    // Load rescan projects settings from localStorage
    const savedSettings = StorageService.loadRescanSettings();
    if (savedSettings) {
      setRescanSettings(savedSettings);
      // console.log("Loaded rescan settings from localStorage:", savedSettings);
    }
  }, []); // Only run once on mount

  // Save rescan settings whenever they change
  useEffect(() => {
    StorageService.saveRescanSettings(rescanSettings);
  }, [rescanSettings]);

  // Initial load - load projects from Firestore on mount
  useEffect(() => {
    const initializeProjects = async () => {
      setLoading(true);

      // Load projects from Firestore
      const hasFirestoreData = await loadProjectsFromFirestore();

      if (!hasFirestoreData) {
        console.log("📊 No projects in Firestore - need to rescan");
        setScanError(
          "No projects found in database. Click 'Rescan Projects' to scan your filesystem."
        );
      }

      setLoading(false);
    };

    initializeProjects();
  }, []); // Only run once on mount

  // Check status after projects are loaded - but only if we actually have projects
  useEffect(() => {
    if (projects.length > 0 && !initialStatusChecked && !isCheckingStatus) {
      setIsCheckingStatus(true);
      setInitialStatusChecked(true);

      const performStatusCheck = async () => {
        try {
          // console.log("✅ Auto-checking port status for loaded projects");
          await checkAllServices();
        } finally {
          setIsCheckingStatus(false);
        }
      };

      // Small delay to avoid race conditions
      setTimeout(performStatusCheck, 500);
    }
  }, [
    projects.length,
    initialStatusChecked,
    isCheckingStatus,
    checkAllServices,
  ]);

  // Auto-refresh port status every 60 seconds (ONLY if we have projects)
  useEffect(() => {
    if (projects.length === 0 || !initialStatusChecked) return;

    const interval = setInterval(() => {
      // console.log("🔄 Auto-refreshing port status (60s interval)");
      checkAllServices(); // checkAllServices has its own guard
      loadPm2Processes(); // Also refresh PM2 processes
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [
    initialStatusChecked,
    checkAllServices,
    loadPm2Processes,
    projects.length,
  ]);

  // Auto-select first task for each project with VS Code tasks
  useEffect(() => {
    if (projects.length === 0) return;

    const newSelectedTasks = { ...selectedTasks };
    let hasChanges = false;

    projects.forEach((project) => {
      // Only auto-select if project has tasks and no current selection
      if (
        project.vscodeTasksInfo?.tasks?.length > 0 &&
        !selectedTasks[project.id]
      ) {
        // Sort tasks alphabetically and select the first one
        const sortedTasks = project.vscodeTasksInfo.tasks
          .slice()
          .sort((a, b) => a.label.localeCompare(b.label));

        newSelectedTasks[project.id] = sortedTasks[0].label;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setSelectedTasks(newSelectedTasks);
    }
  }, [projects, selectedTasks]);

  const getProjectStatus = (project) => {
    // Check if any service is running
    const hasRunningServices = project.services.some(
      (service) => service.isRunning === true
    );
    return hasRunningServices ? "running" : "stopped";
  };

  const isProjectActive = (project) => {
    // Check if any port is running
    const hasRunningPorts = project.services.some(
      (service) => service.isRunning === true
    );

    // Check if any PM2 process is running for this project
    const projectPm2Processes = getProjectPm2Processes(project);
    const hasRunningPm2 = projectPm2Processes.some(
      (process) => process.pm2_env?.status === "online"
    );

    return hasRunningPorts || hasRunningPm2;
  };

  const handleKillProjectPorts = async (project) => {
    setKillingPorts((prev) => ({ ...prev, [project.id]: true }));

    try {
      const ports = project.services.map((service) => service.port);
      const result = await killProjectPorts(project.id, ports);

      if (result.success) {
        console.log(
          `🔄 All ports killed for project ${project.name} - refreshing status...`
        );

        // Immediate refresh to show the ports are killed
        checkAllServices();

        // Additional refresh after 1 second to ensure status is updated
        setTimeout(() => {
          console.log(
            `🔄 Secondary refresh for project ${project.name} status check`
          );
          checkAllServices();
        }, 1000);

        // Final refresh after 3 seconds to catch any delayed changes
        setTimeout(() => {
          console.log(
            `🔄 Final refresh for project ${project.name} status verification`
          );
          checkAllServices();
        }, 3000);
      }
      // No alerts - silent operation
    } catch (error) {
      console.error("Error killing ports:", error);
      // No alert - just log error
    } finally {
      setKillingPorts((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const handleKillProjectPm2 = async (project) => {
    setKillingPm2((prev) => ({ ...prev, [project.id]: true }));

    try {
      const response = await fetch("/api/pm2-delete-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(
        `🔄 PM2 processes killed for project ${project.name} - refreshing status...`
      );

      // Refresh PM2 processes list immediately
      await loadPm2Processes();

      // Immediate refresh to show the processes are killed
      checkAllServices();

      // Additional refresh after 1 second to ensure status is updated
      setTimeout(() => {
        console.log(
          `🔄 Secondary refresh for project ${project.name} PM2 status check`
        );
        checkAllServices();
        loadPm2Processes();
      }, 1000);

      // Final refresh after 3 seconds to catch any delayed changes
      setTimeout(() => {
        console.log(
          `🔄 Final refresh for project ${project.name} PM2 status verification`
        );
        checkAllServices();
        loadPm2Processes();
      }, 3000);
    } catch (error) {
      console.error("Error killing PM2 processes:", error);
      // No alert - just log error
    } finally {
      setKillingPm2((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const handleStopAll = async (project) => {
    setStoppingAll((prev) => ({ ...prev, [project.id]: true }));

    const ports = project.services.map((service) => service.port);

    try {
      // Step 1: Delete PM2 processes first so they release ports gracefully
      await fetch("/api/pm2-delete-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

      // Step 2: Brief pause to let PM2 processes wind down
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Force-kill all configured ports to catch any lingering processes
      if (ports.length > 0) {
        await killProjectPorts(project.id, ports);
      }

      // Step 4: Kill ports again after a short delay to catch stubborn processes
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (ports.length > 0) {
        await killProjectPorts(project.id, ports);
      }

      console.log(
        `🔄 All ports and PM2 processes stopped for ${project.name} - refreshing...`
      );

      await loadPm2Processes();
      checkAllServices();

      setTimeout(() => {
        checkAllServices();
        loadPm2Processes();
      }, 1000);

      setTimeout(() => {
        checkAllServices();
        loadPm2Processes();
      }, 3000);
    } catch (error) {
      console.error("Error stopping all for project:", error);
    } finally {
      setStoppingAll((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const handleFocusTerminal = async (project) => {
    if (!project.focusIdentifier) {
      console.warn("No focus identifier configured for project:", project.name);
      return;
    }

    setFocusingTerminal((prev) => ({ ...prev, [project.id]: true }));

    try {
      const result = await focusTerminal(
        project.id,
        project.focusIdentifier,
        project.projectPath
      );
      // No alerts - silent operation for both success and error
    } catch (error) {
      console.error("Error focusing terminal:", error);
      // No alert - just log error
    } finally {
      setFocusingTerminal((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const handleMinimizeCursorWindows = async () => {
    setMinimizingWindows(true);

    try {
      const result = await minimizeCursorWindows();
      // No alerts - completely silent operation
    } catch (error) {
      console.error("Error minimizing Cursor windows:", error);
      // No alert - just log error
    } finally {
      setMinimizingWindows(false);
    }
  };

  const handleFirebaseConsoleClick = (project) => {
    if (FirebaseService.hasFirebaseProject(project.firebaseInfo)) {
      const links = FirebaseService.generateCloudConsoleLinks(project);
      if (links.firebaseConsole) {
        window.open(links.firebaseConsole, "_blank", "noopener,noreferrer");
      }
    }
  };

  const handleCloudConsoleClick = (project) => {
    if (FirebaseService.hasFirebaseProject(project.firebaseInfo)) {
      const links = FirebaseService.generateCloudConsoleLinks(project);
      if (links.cloudLogs) {
        window.open(links.cloudLogs, "_blank", "noopener,noreferrer");
      }
    }
  };

  const handleKillIndividualPort = async (project, service) => {
    const portKey = `${project.id}-${service.port}`;
    setKillingPort(portKey);

    try {
      const response = await fetch("/api/kill-port", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          port: service.port,
          serviceName: service.name,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log(
          `🔄 Port ${service.port} killed successfully - refreshing status...`
        );

        // Immediate refresh to show the port is killed
        checkAllServices();

        // Additional refresh after 1 second to ensure status is updated
        setTimeout(() => {
          console.log(
            `🔄 Secondary refresh for port ${service.port} status check`
          );
          checkAllServices();
        }, 1000);

        // Final refresh after 3 seconds to catch any delayed changes
        setTimeout(() => {
          console.log(
            `🔄 Final refresh for port ${service.port} status verification`
          );
          checkAllServices();
        }, 3000);
      }
      // No alerts - silent operation
    } catch (error) {
      console.error("Error killing individual port:", error);
      // No alert - just log error
    } finally {
      setKillingPort(null);
    }
  };

  const handleOpenInFinder = async (project) => {
    setOpeningFinder((prev) => ({ ...prev, [project.id]: true }));

    try {
      const response = await fetch("/api/open-finder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: project.projectPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      // No alerts - silent operation
    } catch (error) {
      console.error("Error opening project in Finder:", error);
      // No alert - just log error
    } finally {
      setOpeningFinder((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const handleOpenTerminal = async (project) => {
    setOpeningTerminal((prev) => ({ ...prev, [project.id]: true }));

    try {
      // Use projectBackendPath if available, otherwise fall back to projectPath
      const terminalPath = project.projectBackendPath || project.projectPath;

      const response = await fetch("/api/open-terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: terminalPath,
          isBackendPath: !!project.projectBackendPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      // No alerts - silent operation
    } catch (error) {
      console.error("Error opening terminal:", error);
      // No alert - just log error
    } finally {
      setOpeningTerminal((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const handleTaskSelection = (project, taskLabel) => {
    setSelectedTasks((prev) => ({ ...prev, [project.id]: taskLabel }));
  };

  const executeSelectedTask = async (project) => {
    const selectedTaskLabel = selectedTasks[project.id];
    if (!selectedTaskLabel || !project.vscodeTasksInfo?.tasks) {
      return;
    }

    const task = project.vscodeTasksInfo.tasks.find(
      (t) => t.label === selectedTaskLabel
    );
    if (!task) {
      return;
    }

    await executeTask(project, task);
  };

  const executeTask = async (project, task) => {
    const taskKey = `${project.id}-${task.label}`;
    setExecutingTasks((prev) => ({ ...prev, [taskKey]: true }));

    try {
      const response = await fetch("/api/execute-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: project.projectPath,
          taskLabel: task.label,
          task: task, // Pass the full task object
          allTasks: project.vscodeTasksInfo?.tasks || [], // Pass all tasks for dependency resolution
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`Task execution result:`, result);

      // Refresh status after task execution - services may take time to start
      const refreshIntervals = [1000, 3000, 6000]; // 1s, 3s, 6s
      refreshIntervals.forEach((delay) => {
        setTimeout(() => {
          checkAllServices();
          loadPm2Processes(); // Also refresh PM2 processes
        }, delay);
      });
    } catch (error) {
      console.error("Error executing task:", error);
    } finally {
      setExecutingTasks((prev) => ({ ...prev, [taskKey]: false }));
    }
  };

  const loadProjects = useCallback(
    async (forceRefresh = false, showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }
      setScanError(null);
      setInitialStatusChecked(false);
      setIsCheckingStatus(false);

      try {
        console.log("🔍 Scanning filesystem for projects...");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Scan filesystem for fresh project configs
        const freshProjects = await scanProjectsForConfigs();

        if (freshProjects.length === 0) {
          setScanError(
            "No projects with wf-ports.json files found. Make sure your projects base directory contains wf-ports.json config files."
          );
          setProjects([]);
          setLastUpdated(new Date());
          return;
        }

        // Save fresh projects to Firestore
        console.log(
          `💾 Saving ${freshProjects.length} projects to Firestore...`
        );
        await FirestoreService.saveProjects(freshProjects);

        // Sort projects alphabetically
        const sortedProjects = freshProjects.sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        setProjects(sortedProjects);
        setLastUpdated(new Date());
        console.log(
          `✅ Rescan complete: ${sortedProjects.length} projects saved to Firestore`
        );
      } catch (error) {
        console.error("Error loading projects:", error);
        setScanError(error.message);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [scanProjectsForConfigs]
  );

  // PM2 functions are now defined at the top with useCallback

  const stopPm2Process = async (projectId, taskLabel, pm2Name) => {
    const processKey = `${projectId}-${taskLabel}`;
    setStoppingProcess((prev) => ({ ...prev, [processKey]: true }));

    try {
      const response = await fetch("/api/pm2-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          taskLabel,
          pm2Name,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`🔄 PM2 process ${pm2Name} deleted - refreshing status...`);

      // Refresh PM2 processes list immediately
      await loadPm2Processes();

      // Immediate refresh to show the process is killed
      checkAllServices();

      // Additional refresh after 1 second to ensure status is updated
      setTimeout(() => {
        console.log(
          `🔄 Secondary refresh for PM2 process ${pm2Name} status check`
        );
        checkAllServices();
        loadPm2Processes();
      }, 1000);

      // Final refresh after 3 seconds to catch any delayed changes
      setTimeout(() => {
        console.log(
          `🔄 Final refresh for PM2 process ${pm2Name} status verification`
        );
        checkAllServices();
        loadPm2Processes();
      }, 3000);
    } catch (error) {
      console.error("Error stopping PM2 process:", error);
    } finally {
      setStoppingProcess((prev) => ({ ...prev, [processKey]: false }));
    }
  };

  const restartPm2Process = async (projectId, taskLabel, pm2Name) => {
    const processKey = `${projectId}-${taskLabel}`;
    setRestartingProcess((prev) => ({ ...prev, [processKey]: true }));

    try {
      const response = await fetch("/api/pm2-restart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          taskLabel,
          pm2Name,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`🔄 PM2 process ${pm2Name} restarted - refreshing status...`);

      // Refresh PM2 processes list immediately
      await loadPm2Processes();

      // Immediate refresh to show the process is restarted
      checkAllServices();

      // Additional refresh after 1 second
      setTimeout(() => {
        console.log(
          `🔄 Secondary refresh for PM2 process ${pm2Name} status check`
        );
        checkAllServices();
        loadPm2Processes();
      }, 1000);

      // Final refresh after 3 seconds
      setTimeout(() => {
        console.log(
          `🔄 Final refresh for PM2 process ${pm2Name} status verification`
        );
        checkAllServices();
        loadPm2Processes();
      }, 3000);
    } catch (error) {
      console.error("Error restarting PM2 process:", error);
    } finally {
      setRestartingProcess((prev) => ({ ...prev, [processKey]: false }));
    }
  };

  const viewPm2Logs = async (projectId, taskLabel, pm2Name) => {
    const processKey = `${projectId}-${taskLabel}`;
    setViewingLogs((prev) => ({ ...prev, [processKey]: true }));

    try {
      const response = await fetch("/api/pm2-logs-terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          taskLabel,
          pm2Name,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log(`Successfully opened terminal for PM2 logs: ${pm2Name}`);
      } else {
        console.error("Failed to open PM2 logs terminal:", result.message);
        alert(`Failed to open PM2 logs terminal: ${result.message}`);
      }
    } catch (error) {
      console.error("Error opening PM2 logs terminal:", error);
      alert(`Error opening PM2 logs terminal: ${error.message}`);
    } finally {
      setViewingLogs((prev) => ({ ...prev, [processKey]: false }));
    }
  };

  const createPm2Name = (projectId, taskLabel) => {
    const cleanProjectId = projectId.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const cleanTaskLabel = taskLabel.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return `${cleanProjectId}-${cleanTaskLabel}`;
  };

  const getProjectPm2Processes = (project) => {
    // Use pm2Prefix if specified, otherwise use project id
    const prefix =
      project.pm2Prefix || project.id.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return pm2Processes.filter(
      (process) =>
        process.name &&
        (process.name === prefix || process.name.startsWith(`${prefix}-`))
    );
  };

  const formatLastUpdated = (date) => {
    if (!date) return "Never";
    const timeString = date.toLocaleTimeString();
    return timeString;
  };

  const openProjectDetails = (project) => {
    setProjectDetailsModal(project);
  };

  const closeProjectDetails = () => {
    setProjectDetailsModal(null);
  };

  // Helper to get favicon URL - uses favicon from rescan (copied to public dir)
  const getFaviconUrl = (project) => {
    // Use the pre-copied favicon if available
    if (project.favicon) {
      return project.favicon;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="port-monitor">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading your projects...</p>
        </div>
      </div>
    );
  }

  if (projects.length === 0 && !loading) {
    return (
      <div className="port-monitor">
        <div className="menu-bar">
          <div className="menu-left">
            <h1 className="menu-title">
              <img src={logoImage} alt="PortIO Logo" />
            </h1>
          </div>
          <div className="menu-right">
            <Link to="/help" className="help-link">
              <button
                className="help-nav-btn"
                title="Setup guide for new projects"
              >
                <MdHelpOutline /> Help
              </button>
            </Link>
            <button
              className="rescan-btn"
              onClick={() => loadProjects(true, true)}
              disabled={loading}
              title="Force refresh projects from disk"
            >
              {loading ? (
                "Scanning..."
              ) : (
                <>
                  <MdAdd /> Rescan Projects
                </>
              )}
            </button>
            <a
              href="/api/ports.json"
              target="_blank"
              rel="noopener noreferrer"
              className="export-link"
            >
              <button className="export-nav-btn" title="Export ports as JSON">
                <MdCloudDownload /> Export Ports
              </button>
            </a>
          </div>
        </div>
        <div className="no-projects">
          <h3>No Projects Found</h3>
          {scanError ? (
            <div>
              <p style={{ color: "#dc3545", marginBottom: "10px" }}>
                Error: {scanError}
              </p>
              <p>
                Make sure you have wf-ports.json files in your project
                directories.
              </p>
            </div>
          ) : (
            <p>
              Create wf-ports.json files in your project directories to get
              started.
            </p>
          )}
          <button
            onClick={() => loadProjects(true, true)}
            style={{
              marginTop: "15px",
              padding: "10px 20px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Rescan Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="port-monitor">
      <div className="menu-bar">
        <div className="menu-left">
          <h1 className="menu-title">
            <img src={logoImage} alt="PortIO Logo" />
          </h1>
        </div>
        <div className="menu-center">
          <span className="last-updated">
            Last updated: {formatLastUpdated(lastUpdated)}
            {usingCachedData && (
              <span className="cache-indicator"> ⚡ Using cached data</span>
            )}
          </span>
        </div>
        <div className="menu-right">
          <Link to="/help" className="help-link">
            <button
              className="help-nav-btn"
              title="Setup guide for new projects"
            >
              <MdHelpOutline /> Help
            </button>
          </Link>
          <button
            className="rescan-btn"
            onClick={() => {
              loadProjects(true, true); // Scan filesystem and save to Firestore
            }}
            disabled={loading}
            title="Rescan filesystem for wf-ports.json files and save to Firestore"
          >
            {loading ? (
              "Scanning..."
            ) : (
              <>
                <MdAdd /> Rescan Projects
              </>
            )}
          </button>
          <button
            className="refresh-btn"
            onClick={() => {
              // Don't clear cached data flag until after the API response
              checkAllServices().then(() => {
                // Only mark as not using cached data after successful refresh
                setUsingCachedData(false);
              });
            }}
            disabled={checking}
            title={
              usingCachedData ? "Refresh with fresh data" : "Refresh status"
            }
          >
            {checking ? (
              "Checking..."
            ) : (
              <>
                <MdRefresh />{" "}
                {usingCachedData ? "Refresh Ports" : "Refresh Status"}
              </>
            )}
          </button>
          <button
            className="minimize-btn"
            onClick={handleMinimizeCursorWindows}
            disabled={minimizingWindows}
            title="Minimize all Cursor windows"
          >
            {minimizingWindows ? (
              "Minimizing..."
            ) : (
              <>
                <MdLayers /> Minimize Cursor
              </>
            )}
          </button>

          <a
            href="/api/ports.json"
            target="_blank"
            rel="noopener noreferrer"
            className="export-link"
          >
            <button className="export-nav-btn" title="Export ports as JSON">
              <MdCloudDownload /> Export Ports
            </button>
          </a>
        </div>
      </div>

      <div className="projects-table-container">
        <table className="projects-table">
          <thead>
            <tr>
              <th className="favicon-column">Icon</th>
              <th className="project-name-column">Project</th>
              <th className="quick-actions-column">Quick</th>
              <th className="tasks-column">Tasks</th>
              <th className="ports-column">Active Ports</th>
              <th className="pm2-column">PM2 Processes</th>
              <th className="stop-column">Stop</th>
              <th className="git-column">Git Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const projectPm2Processes = getProjectPm2Processes(project);
              const activePorts = project.services.filter(
                (service) => service.isRunning === true
              );
              const isActive = isProjectActive(project);

              return (
                <tr
                  key={project.id}
                  className={`project-row ${isActive ? "active" : ""}`}
                >
                  {/* Favicon Column */}
                  <td className="favicon-column">
                    {getFaviconUrl(project) ? (
                      <img
                        src={getFaviconUrl(project)}
                        alt={project.name}
                        className="project-favicon"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "block";
                        }}
                      />
                    ) : null}
                    <MdFolder
                      className="default-favicon"
                      style={{
                        display: getFaviconUrl(project) ? "none" : "block",
                      }}
                    />
                  </td>

                  {/* Project Name Column */}
                  <td className="project-name-column">
                    <div className="project-name-cell">
                      <span
                        className="project-name clickable"
                        onClick={() => openProjectDetails(project)}
                        title="Click for more details"
                      >
                        {project.name}
                      </span>
                      {!project.pathExists && (
                        <span
                          className="path-error-badge"
                          title="Path not found"
                        >
                          <MdCancel />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Quick Actions Column */}
                  <td className="quick-actions-column">
                    <div className="quick-actions-icons">
                      {/* Finder */}
                      {project.pathExists && (
                        <button
                          className="quick-action-btn finder-btn"
                          onClick={() => handleOpenInFinder(project)}
                          disabled={openingFinder[project.id]}
                          title="Open in Finder"
                        >
                          <img
                            src="/icons/finder.webp"
                            alt="Finder"
                            className="action-icon"
                          />
                        </button>
                      )}

                      {/* Cursor */}
                      {project.focusIdentifier && project.pathExists && (
                        <button
                          className="quick-action-btn cursor-btn"
                          onClick={() => handleFocusTerminal(project)}
                          disabled={focusingTerminal[project.id]}
                          title="Open in Cursor"
                        >
                          <img
                            src="/icons/cursor.webp"
                            alt="Cursor"
                            className="action-icon"
                          />
                        </button>
                      )}

                      {/* Firebase Console */}
                      {FirebaseService.hasFirebaseProject(
                        project.firebaseInfo
                      ) && (
                        <button
                          className="quick-action-btn firebase-btn"
                          onClick={() => handleFirebaseConsoleClick(project)}
                          title={`Firebase Console: ${project.firebaseInfo.projectId}`}
                        >
                          <img
                            src="/icons/firebase.webp"
                            alt="Firebase"
                            className="action-icon"
                          />
                        </button>
                      )}

                      {/* Google Cloud Console */}
                      {FirebaseService.hasFirebaseProject(
                        project.firebaseInfo
                      ) && (
                        <button
                          className="quick-action-btn cloud-btn"
                          onClick={() => handleCloudConsoleClick(project)}
                          title={`Cloud Console: ${project.firebaseInfo.projectId}`}
                        >
                          <img
                            src="/icons/google-cloud.webp"
                            alt="Google Cloud"
                            className="action-icon"
                          />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Tasks Column */}
                  <td className="tasks-column">
                    {project.vscodeTasksInfo &&
                    project.vscodeTasksInfo.tasks.length > 0 ? (
                      <div className="tasks-controls">
                        <select
                          className="task-select"
                          value={selectedTasks[project.id] || ""}
                          onChange={(e) =>
                            handleTaskSelection(project, e.target.value)
                          }
                        >
                          <option value="">Select task...</option>
                          {project.vscodeTasksInfo.tasks
                            .slice()
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((task) => (
                              <option key={task.label} value={task.label}>
                                {task.label}
                              </option>
                            ))}
                        </select>
                        {selectedTasks[project.id] && (
                          <button
                            className="run-task-btn-small"
                            onClick={() => executeSelectedTask(project)}
                            disabled={
                              executingTasks[
                                `${project.id}-${selectedTasks[project.id]}`
                              ]
                            }
                            title={`Run: ${selectedTasks[project.id]}`}
                          >
                            {executingTasks[
                              `${project.id}-${selectedTasks[project.id]}`
                            ] ? (
                              <MdRefresh className="rotating" />
                            ) : (
                              <MdPlayArrow />
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="no-tasks">—</span>
                    )}
                  </td>

                  {/* Active Ports Column */}
                  <td className="ports-column">
                    {activePorts.length > 0 ? (
                      <div className="ports-container">
                        <div className="ports-list">
                          {activePorts
                            .sort((a, b) => a.port - b.port)
                            .map((service) => (
                              <span key={service.port} className="port-badge">
                                <a
                                  href={service.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="port-link"
                                  title={`${service.name} - ${service.url}`}
                                >
                                  <span className="port-name">
                                    {service.name}
                                  </span>
                                  <span className="port-number">
                                    :{service.port}
                                  </span>
                                </a>
                                <button
                                  className="kill-port-btn-small"
                                  onClick={() =>
                                    handleKillIndividualPort(project, service)
                                  }
                                  disabled={
                                    killingPort ===
                                    `${project.id}-${service.port}`
                                  }
                                  title="Kill port"
                                >
                                  <MdClose />
                                </button>
                              </span>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <span className="no-ports">—</span>
                    )}
                  </td>

                  {/* PM2 Processes Column */}
                  <td className="pm2-column">
                    {projectPm2Processes.length > 0 ? (
                      <div className="pm2-container">
                        <div className="pm2-processes-list">
                          {projectPm2Processes.map((process) => {
                            const cleanTaskName = process.name.replace(
                              `${project.id
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, "-")}-`,
                              ""
                            );
                            const processKey = `${project.id}-${cleanTaskName}`;
                            return (
                              <div
                                key={process.pm_id || process.name}
                                className="pm2-process-badge"
                              >
                                <span className="pm2-name">
                                  {cleanTaskName}
                                </span>
                                <select
                                  className="pm2-actions-select-compact"
                                  title="PM2 actions"
                                  onChange={(e) => {
                                    const action = e.target.value;
                                    e.target.value = "";

                                    if (action === "logs") {
                                      viewPm2Logs(
                                        project.id,
                                        cleanTaskName,
                                        process.name
                                      );
                                    } else if (action === "restart") {
                                      restartPm2Process(
                                        project.id,
                                        cleanTaskName,
                                        process.name
                                      );
                                    } else if (action === "delete") {
                                      stopPm2Process(
                                        project.id,
                                        cleanTaskName,
                                        process.name
                                      );
                                    }
                                  }}
                                  disabled={
                                    stoppingProcess[processKey] ||
                                    restartingProcess[processKey]
                                  }
                                >
                                  <option value="">▾</option>
                                  <option value="logs">View Logs</option>
                                  <option value="restart">Restart</option>
                                  <option value="delete">Delete</option>
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <span className="no-pm2">—</span>
                    )}
                  </td>

                  {/* Stop All Column */}
                  <td className="stop-column">
                    <button
                      className="stop-all-btn"
                      onClick={() => handleStopAll(project)}
                      disabled={stoppingAll[project.id]}
                      title="Stop all ports and PM2 processes"
                    >
                      {stoppingAll[project.id] ? (
                        <MdRefresh className="rotating" />
                      ) : (
                        <MdStop />
                      )}
                    </button>
                  </td>

                  {/* Git Status Column */}
                  <td className="git-column">
                    {project.gitInfo ? (
                      <div
                        className={`git-status ${
                          project.gitInfo.repoUrl ? "clickable" : ""
                        }`}
                        onClick={() => {
                          if (project.gitInfo.repoUrl) {
                            window.open(project.gitInfo.repoUrl, "_blank");
                          }
                        }}
                        title={
                          project.gitInfo.repoUrl
                            ? `Open repository: ${project.gitInfo.repoUrl}`
                            : "Git repository"
                        }
                      >
                        {project.gitInfo.status.hasUncommittedChanges ? (
                          <span className="git-dirty-indicator">●</span>
                        ) : (
                          <span className="git-clean-indicator">✓</span>
                        )}
                        <span className="git-branch">
                          {project.gitInfo.branch || "unknown"}
                        </span>
                      </div>
                    ) : (
                      <span className="no-git">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Project Details Modal */}
      {projectDetailsModal && (
        <div className="modal-overlay" onClick={closeProjectDetails}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {getFaviconUrl(projectDetailsModal) ? (
                  <img
                    src={getFaviconUrl(projectDetailsModal)}
                    alt={projectDetailsModal.name}
                    className="modal-favicon"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <MdFolder className="modal-default-favicon" />
                )}
                {projectDetailsModal.name}
                {FirebaseService.hasFirebaseProject(
                  projectDetailsModal.firebaseInfo
                ) && (
                  <span
                    className="firebase-badge"
                    title={`Firebase: ${projectDetailsModal.firebaseInfo.projectId}`}
                  >
                    🔥
                  </span>
                )}
              </h2>
              <button className="modal-close" onClick={closeProjectDetails}>
                <MdClose />
              </button>
            </div>

            <div className="modal-body">
              {/* Description */}
              {projectDetailsModal.description && (
                <div className="modal-section">
                  <h3>Description</h3>
                  <p>{projectDetailsModal.description}</p>
                </div>
              )}

              {/* Project Info */}
              <div className="modal-section">
                <h3>Project Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <strong>Project ID:</strong>
                    <span>{projectDetailsModal.id}</span>
                  </div>
                  <div className="info-item">
                    <strong>Path:</strong>
                    <span className="path-text">
                      {projectDetailsModal.projectPath}
                    </span>
                  </div>
                  {projectDetailsModal.projectBackendPath && (
                    <div className="info-item">
                      <strong>Backend Path:</strong>
                      <span className="path-text">
                        {projectDetailsModal.projectBackendPath}
                      </span>
                    </div>
                  )}
                  {projectDetailsModal.focusIdentifier && (
                    <div className="info-item">
                      <strong>Focus Identifier:</strong>
                      <span>{projectDetailsModal.focusIdentifier}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Services */}
              <div className="modal-section">
                <h3>Services ({projectDetailsModal.services.length})</h3>
                <div className="services-list">
                  {projectDetailsModal.services.map((service) => (
                    <div
                      key={service.port}
                      className={`service-item ${
                        service.isRunning ? "running" : ""
                      }`}
                    >
                      <div className="service-header">
                        <span className="service-name">{service.name}</span>
                        <span className="service-port">
                          Port {service.port}
                          {service.isRunning && (
                            <span className="running-badge">Running</span>
                          )}
                        </span>
                      </div>
                      {service.purpose && (
                        <div className="service-purpose">{service.purpose}</div>
                      )}
                      {service.url && (
                        <div className="service-url">
                          <a
                            href={service.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {service.url}
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Git Info */}
              {projectDetailsModal.gitInfo && (
                <div className="modal-section">
                  <h3>Git Repository</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <strong>Branch:</strong>
                      <span>
                        {projectDetailsModal.gitInfo.branch || "unknown"}
                      </span>
                    </div>
                    <div className="info-item">
                      <strong>Status:</strong>
                      <span>
                        {projectDetailsModal.gitInfo.status
                          .hasUncommittedChanges ? (
                          <span className="status-dirty">
                            Uncommitted changes
                          </span>
                        ) : (
                          <span className="status-clean">Clean</span>
                        )}
                      </span>
                    </div>
                    {projectDetailsModal.gitInfo.status.ahead > 0 && (
                      <div className="info-item">
                        <strong>Ahead:</strong>
                        <span>
                          {projectDetailsModal.gitInfo.status.ahead} commits
                        </span>
                      </div>
                    )}
                    {projectDetailsModal.gitInfo.status.behind > 0 && (
                      <div className="info-item">
                        <strong>Behind:</strong>
                        <span>
                          {projectDetailsModal.gitInfo.status.behind} commits
                        </span>
                      </div>
                    )}
                    {projectDetailsModal.gitInfo.lastCommit && (
                      <>
                        <div className="info-item full-width">
                          <strong>Last Commit:</strong>
                          <span className="commit-info">
                            {projectDetailsModal.gitInfo.lastCommit.hash} - "
                            {projectDetailsModal.gitInfo.lastCommit.message}"
                          </span>
                        </div>
                      </>
                    )}
                    {projectDetailsModal.gitInfo.repoUrl && (
                      <div className="info-item full-width">
                        <strong>Repository:</strong>
                        <a
                          href={projectDetailsModal.gitInfo.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repo-link"
                        >
                          {projectDetailsModal.gitInfo.repoUrl}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Firebase Info */}
              {FirebaseService.hasFirebaseProject(
                projectDetailsModal.firebaseInfo
              ) && (
                <div className="modal-section">
                  <h3>Firebase Integration</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <strong>Project ID:</strong>
                      <span>{projectDetailsModal.firebaseInfo.projectId}</span>
                    </div>
                    {projectDetailsModal.firebaseInfo.projectAlias && (
                      <div className="info-item">
                        <strong>Alias:</strong>
                        <span>
                          {projectDetailsModal.firebaseInfo.projectAlias}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="console-links">
                    <button
                      className="console-link-btn"
                      onClick={() =>
                        handleFirebaseConsoleClick(projectDetailsModal)
                      }
                    >
                      <MdWebAsset /> Open Firebase Console
                    </button>
                    <button
                      className="console-link-btn"
                      onClick={() =>
                        handleCloudConsoleClick(projectDetailsModal)
                      }
                    >
                      <MdCloud /> Open Cloud Console
                    </button>
                  </div>
                </div>
              )}

              {/* VS Code Tasks */}
              {projectDetailsModal.vscodeTasksInfo &&
                projectDetailsModal.vscodeTasksInfo.tasks.length > 0 && (
                  <div className="modal-section">
                    <h3>
                      Available Tasks (
                      {projectDetailsModal.vscodeTasksInfo.tasks.length})
                    </h3>
                    <div className="tasks-list">
                      {projectDetailsModal.vscodeTasksInfo.tasks
                        .slice()
                        .sort((a, b) => a.label.localeCompare(b.label))
                        .map((task) => (
                          <div key={task.label} className="task-item">
                            <span className="task-label">{task.label}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortMonitor;
