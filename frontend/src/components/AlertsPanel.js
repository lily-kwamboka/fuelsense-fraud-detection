import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const SEVERITY_COLORS = {
  critical: { bg: '#fdecea', border: '#f5c6cb', text: '#721c24', dot: '#e74c3c' },
  warning:  { bg: '#fff3cd', border: '#ffc107', text: '#856404', dot: '#f39c12' },
  info:     { bg: '#e8f4fd', border: '#bee5eb', text: '#0c5460', dot: '#3498db' },
};

const TYPE_LABELS = {
  variance_exceeded:    '📊 Variance Exceeded',
  high_water:           '💧 High Water',
  low_stock:            '⛽ Low Stock',
  pump_vs_dip:          '🔢 Pump vs Dip',
  shift_discrepancy:    '⏱ Shift Discrepancy',
  reading_gap:          '📡 Reading Gap',
};

export default function AlertsPanel({ darkMode }) {
  const [alerts,     setAlerts]     = useState([]);
  const [filter,     setFilter]     = useState('open');
  const [loading,    setLoading]    = useState(true);
  const [ackName,    setAckName]    = useState('');
  const [ackingId,   setAckingId]   = useState(null);

  const colors = {
    card:    darkMode ? '#1e1e2e' : '#ffffff',
    text:    darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888'    : '#666',
    border:  darkMode ? '#2a2a3e' : '#e0e0e0',
    bg:      darkMode ? '#0f0f1a' : '#f0f2f5',
  };

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? `${API}/api/alerts?limit=100`
        : `${API}/api/alerts?status=${filter}&limit=100`;
      const res  = await fetch(url);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  async function handleAcknowledge(alertId) {
    if (!ackName.trim()) {
      alert('Please enter your name to acknowledge this alert.');
      return;
    }
    try {
      await fetch(`${API}/api/alerts/${alertId}/acknowledge`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ acknowledged_by: ackName }),
      });
      setAckingId(null);
      loadAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  const filterBtnStyle = (f) => ({
    padding:      '6px 14px',
    borderRadius: '20px',
    border:       'none',
    cursor:       'pointer',
    fontSize:     '12px',
    fontWeight:   '500',
    background:   filter === f ? '#1a1a2e' : (darkMode ? '#2a2a3e' : '#f0f2f5'),
    color:        filter === f ? '#fff'    : colors.text,
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: colors.text }}>
          🔔 Alert History
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['open', 'acknowledged', 'resolved', 'all'].map(f => (
            <button key={f} style={filterBtnStyle(f)} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Acknowledge name input */}
      {filter === 'open' && alerts.length > 0 && (
        <div style={{ background: colors.card, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: colors.subtext }}>Your name to acknowledge:</span>
          <input
            value={ackName}
            onChange={e => setAckName(e.target.value)}
            placeholder="e.g. John Kamau"
            style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`, fontSize: '13px', outline: 'none', flex: 1, maxWidth: '200px' }}
          />
        </div>
      )}

      {/* Alert list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: colors.subtext }}>Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div style={{ background: colors.card, borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: colors.text, marginBottom: '8px' }}>
            No {filter === 'all' ? '' : filter} alerts
          </div>
          <div style={{ fontSize: '13px', color: colors.subtext }}>All systems operating normally.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {alerts.map(alert => {
            const s = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
            return (
              <div key={alert.id} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    {/* Type + severity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: s.text }}>
                        {TYPE_LABELS[alert.alert_type] || alert.alert_type}
                      </span>
                      <span style={{ background: s.dot, color: '#fff', fontSize: '10px', padding: '2px 7px', borderRadius: '10px', fontWeight: '600' }}>
                        {alert.severity.toUpperCase()}
                      </span>
                      {alert.tank_number && (
                        <span style={{ fontSize: '11px', color: s.text, opacity: 0.8 }}>
                          Tank {alert.tank_number} · {alert.fuel_type}
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <div style={{ fontSize: '13px', color: s.text, marginBottom: '8px' }}>
                      {alert.message}
                    </div>

                    {/* Values */}
                    {alert.value_actual !== null && (
                      <div style={{ fontSize: '11px', color: s.text, opacity: 0.8 }}>
                        Actual: {parseFloat(alert.value_actual).toFixed(2)}
                        {alert.value_threshold !== null && ` · Threshold: ${parseFloat(alert.value_threshold).toFixed(2)}`}
                      </div>
                    )}

                    {/* Meta */}
                    <div style={{ fontSize: '11px', color: s.text, opacity: 0.7, marginTop: '6px' }}>
                      {new Date(alert.created_at).toLocaleString()}
                      {alert.acknowledged_by && ` · Acknowledged by ${alert.acknowledged_by}`}
                      {alert.resolved_at && ` · Resolved ${new Date(alert.resolved_at).toLocaleString()}`}
                    </div>
                  </div>

                  {/* Acknowledge button */}
                  {alert.status === 'open' && (
                    <button
                      onClick={() => ackingId === alert.id ? handleAcknowledge(alert.id) : setAckingId(alert.id)}
                      style={{ marginLeft: '12px', padding: '6px 12px', background: s.dot, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap' }}
                    >
                      {ackingId === alert.id ? 'Confirm ✓' : 'Acknowledge'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}