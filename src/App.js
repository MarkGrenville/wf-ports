import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PortMonitor from "./components/PortMonitor";
import PortExport from "./components/PortExport";
import Help from "./components/Help";
import "./App.css";

function App() {
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<PortMonitor />} />
          <Route path="/help" element={<Help />} />
          <Route path="/export" element={<PortExport />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
