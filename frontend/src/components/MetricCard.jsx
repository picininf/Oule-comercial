import React from 'react';
export default function MetricCard({ label, icon, value, color }) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
