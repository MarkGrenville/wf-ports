import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./PortExport.scss";
import {
  MdArrowBack,
  MdRefresh,
  MdContentCopy,
  MdCloudDownload,
  MdCheckCircle,
  MdCancel,
} from "react-icons/md";

const PortExport = () => {
  const [portData, setPortData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");

  const fetchPortData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/export-used-ports");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPortData(data);
    } catch (err) {
      console.error("Error fetching port data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortData();
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Copied to clipboard!");
    });
  };

  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAllPorts = () => {
    if (portData) {
      const portsArray = portData.allPorts;
      copyToClipboard(JSON.stringify(portsArray, null, 2));
    }
  };

  const exportFullData = () => {
    if (portData) {
      downloadJSON(
        portData,
        `used-ports-${new Date().toISOString().split("T")[0]}.json`
      );
    }
  };

  if (loading) {
    return (
      <div className="port-export">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading port data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="port-export">
        <div className="error">
          <h3>Error Loading Port Data</h3>
          <p>{error}</p>
          <button onClick={fetchPortData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!portData) {
    return (
      <div className="port-export">
        <div className="no-data">
          <h3>No Port Data Available</h3>
          <button onClick={fetchPortData} className="retry-btn">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="port-export">
      <div className="header">
        <div className="header-left">
          <Link to="/" className="back-link">
            <button className="back-btn">
              <MdArrowBack /> Back to Monitor
            </button>
          </Link>
          <h1>Port Usage Export</h1>
        </div>
        <div className="actions">
          <button onClick={fetchPortData} className="refresh-btn">
            <MdRefresh /> Refresh Data
          </button>
          <button onClick={exportAllPorts} className="export-btn">
            <MdContentCopy /> Copy All Ports
          </button>
          <button onClick={exportFullData} className="download-btn">
            <MdCloudDownload /> Download Full Report
          </button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === "summary" ? "active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </button>
        <button
          className={`tab ${activeTab === "projects" ? "active" : ""}`}
          onClick={() => setActiveTab("projects")}
        >
          Projects
        </button>
        <button
          className={`tab ${activeTab === "duplicates" ? "active" : ""}`}
          onClick={() => setActiveTab("duplicates")}
        >
          Duplicates{" "}
          {portData.duplicatePorts.length > 0 &&
            `(${portData.duplicatePorts.length})`}
        </button>
        <button
          className={`tab ${activeTab === "types" ? "active" : ""}`}
          onClick={() => setActiveTab("types")}
        >
          By Type
        </button>
      </div>

      <div className="content">
        {activeTab === "summary" && (
          <div className="summary">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Projects</h3>
                <div className="stat-value">
                  {portData.summary.totalProjects}
                </div>
              </div>
              <div className="stat-card">
                <h3>Total Services</h3>
                <div className="stat-value">{portData.summary.totalPorts}</div>
              </div>
              <div className="stat-card">
                <h3>Unique Ports</h3>
                <div className="stat-value">{portData.summary.uniquePorts}</div>
              </div>
              <div className="stat-card">
                <h3>Port Conflicts</h3>
                <div className="stat-value">
                  {portData.duplicatePorts.length}
                </div>
              </div>
            </div>

            <div className="all-ports">
              <h3>All Used Ports ({portData.allPorts.length} unique)</h3>
              <div className="ports-list">
                {portData.allPorts.map((port) => (
                  <span key={port} className="port-badge">
                    {port}
                  </span>
                ))}
              </div>
              <button
                onClick={() => copyToClipboard(portData.allPorts.join(", "))}
                className="copy-ports-btn"
              >
                Copy as comma-separated
              </button>
            </div>

            <div className="scan-info">
              <p>
                <strong>Last Scanned:</strong>{" "}
                {new Date(portData.summary.lastScanned).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {activeTab === "projects" && (
          <div className="projects">
            {portData.projects.map((project) => (
              <div key={project.id} className="project-card">
                <div className="project-header">
                  <h3>{project.name}</h3>
                  <span className="service-count">
                    {project.services.length} services
                  </span>
                </div>
                <div className="project-path">{project.path}</div>
                <div className="services">
                  {project.services.map((service, index) => (
                    <div key={index} className="service">
                      <div className="service-info">
                        <strong>{service.name}</strong>
                        <span className="port">Port {service.port}</span>
                      </div>
                      {service.description && (
                        <div className="service-description">
                          {service.description}
                        </div>
                      )}
                      <div className="service-url">
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {service.url}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "duplicates" && (
          <div className="duplicates">
            {portData.duplicatePorts.length === 0 ? (
              <div className="no-duplicates">
                <h3>
                  <MdCheckCircle /> No Port Conflicts!
                </h3>
                <p>All ports are unique across your projects.</p>
              </div>
            ) : (
              <div className="conflicts">
                <div className="warning">
                  <h3>
                    <MdCancel /> Port Conflicts Detected
                  </h3>
                  <p>
                    The following ports are used by multiple services. This may
                    cause conflicts when running projects simultaneously.
                  </p>
                </div>
                {portData.duplicatePorts.map((conflict) => (
                  <div key={conflict.port} className="conflict-card">
                    <div className="conflict-header">
                      <h4>Port {conflict.port}</h4>
                      <span className="usage-count">
                        Used by {conflict.usedBy.length} services
                      </span>
                    </div>
                    <div className="usage-list">
                      {conflict.usedBy.map((usage, index) => (
                        <div key={index} className="usage">
                          <strong>{usage.project}</strong> → {usage.service}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "types" && (
          <div className="types">
            {Object.entries(portData.portsByType).map(([type, services]) => (
              <div key={type} className="type-card">
                <div className="type-header">
                  <h3>{type}</h3>
                  <span className="count">{services.length} services</span>
                </div>
                <div className="type-services">
                  {services.map((service, index) => (
                    <div key={index} className="type-service">
                      <span className="port">Port {service.port}</span>
                      <span className="project">{service.project}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortExport;
