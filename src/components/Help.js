import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MdArrowBack, MdRefresh } from "react-icons/md";
import "./Help.scss";

const Help = () => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/docs");
      const data = await response.json();
      if (data.success) {
        setContent(data.content);
      } else {
        setContent(data.content || "# Error loading documentation");
      }
    } catch (err) {
      setError(err.message);
      setContent(
        "# Error loading documentation\n\nPlease try again or click Rescan Projects."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  // Simple markdown to HTML converter
  const renderMarkdown = (md) => {
    if (!md) return "";

    let html = md
      // Escape HTML
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Headers
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
      // Blockquotes
      .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
      // Horizontal rules
      .replace(/^---$/gm, "<hr />")
      // Tables
      .replace(/\|(.+)\|/g, (match) => {
        const cells = match.split("|").filter((c) => c.trim());
        if (cells.every((c) => c.trim().match(/^[-:]+$/))) {
          return ""; // Skip separator row
        }
        const isHeader = cells.every((c) => c.trim().length > 0);
        const cellTag = "td";
        return `<tr>${cells
          .map((c) => `<${cellTag}>${c.trim()}</${cellTag}>`)
          .join("")}</tr>`;
      })
      // Wrap consecutive table rows
      .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, "<table>$&</table>")
      // Lists
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
      // Wrap consecutive list items
      .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>")
      // Links
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      // Paragraphs (lines that aren't already wrapped)
      .replace(/^(?!<[a-z]|$)(.+)$/gm, "<p>$1</p>")
      // Clean up empty paragraphs
      .replace(/<p><\/p>/g, "")
      // Fix nested tags in paragraphs
      .replace(/<p>(<h[1-3]>)/g, "$1")
      .replace(/(<\/h[1-3]>)<\/p>/g, "$1")
      .replace(/<p>(<ul>)/g, "$1")
      .replace(/(<\/ul>)<\/p>/g, "$1")
      .replace(/<p>(<table>)/g, "$1")
      .replace(/(<\/table>)<\/p>/g, "$1")
      .replace(/<p>(<pre>)/g, "$1")
      .replace(/(<\/pre>)<\/p>/g, "$1")
      .replace(/<p>(<blockquote>)/g, "$1")
      .replace(/(<\/blockquote>)<\/p>/g, "$1")
      .replace(/<p>(<hr \/>)<\/p>/g, "$1");

    return html;
  };

  return (
    <div className="help-page">
      <div className="help-header">
        <Link to="/" className="back-link">
          <button className="back-btn">
            <MdArrowBack /> Back to Monitor
          </button>
        </Link>
        <h1>PortIO Documentation</h1>
        <button className="refresh-btn" onClick={fetchDocs} disabled={loading}>
          <MdRefresh className={loading ? "rotating" : ""} /> Refresh
        </button>
      </div>

      <div className="help-content">
        {loading ? (
          <div className="loading">Loading documentation...</div>
        ) : error ? (
          <div className="error">Error: {error}</div>
        ) : (
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </div>
    </div>
  );
};

export default Help;
