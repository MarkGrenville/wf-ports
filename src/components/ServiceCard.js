import React from "react";
import { MdRefresh, MdClose } from "react-icons/md";
import "./ServiceCard.scss";

const ServiceCard = ({ service, project, onKillPort, isKilling }) => {
  const getStatusClass = () => {
    if (service.isRunning === undefined) return "status-checking";
    return service.isRunning ? "status-running" : "status-stopped";
  };

  const handleCardClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Only open URL if service is explicitly running
    if (service.isRunning === true && service.url) {
      try {
        // Open specifically in Chrome
        const chromeUrl = `googlechrome://${service.url.replace(
          /^https?:\/\//,
          ""
        )}`;

        // Try Chrome first, with fallback to default browser
        window.location.href = chromeUrl;

        // Fallback to regular window.open if Chrome URL scheme doesn't work
        setTimeout(() => {
          try {
            window.open(service.url, "_blank", "noopener,noreferrer");
          } catch (error) {
            // console.log(`Could not open ${service.url}:`, error.message);
          }
        }, 100);
      } catch (error) {
        // console.log(`Could not open ${service.url}:`, error.message);
      }
    } else if (service.isRunning === false) {
      // console.log(`Service ${service.name} is not running - cannot open URL`);
    } else {
      // console.log(`Service ${service.name} status unknown - cannot open URL`);
    }
  };

  const handleKillPort = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onKillPort && !isKilling) {
      onKillPort(project, service);
    }
  };

  // Check if we should show the actions row
  const shouldShowActions = service.isRunning;

  return (
    <div
      className={`service-card ${getStatusClass()} ${
        service.isRunning ? "clickable" : "disabled"
      }`}
      onClick={handleCardClick}
      title={
        service.isRunning && service.url
          ? `Open ${service.url} in browser`
          : service.isRunning
          ? `${service.name} is running on port ${service.port}`
          : `${service.name} is not running`
      }
    >
      {/* Action buttons row - only show if there are buttons to display */}
      {shouldShowActions && (
        <div className="service-actions">
          {/* Kill port button */}
          {service.isRunning && (
            <button
              className={`kill-port-btn ${isKilling ? "killing" : ""}`}
              onClick={handleKillPort}
              disabled={isKilling}
              title={
                isKilling ? "Killing port..." : `Kill port ${service.port}`
              }
            >
              {isKilling ? <MdRefresh className="rotating" /> : <MdClose />}
            </button>
          )}
        </div>
      )}

      {/* Service content */}
      <div className="service-content">
        <div className="service-info">
          <span className="service-name">{service.name}</span>
          <span className="service-separator">:</span>
          <span className="service-port">{service.port}</span>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;
