import React, { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const SHIFT_COLORS = {
  morning:   { bg: '#fff9e6', border: '#ffc107', text: '#856404', icon: '🌅' },
  afternoon: { bg: '#e8f4fd', border: '#3498db', text: '#1a5276', icon: '☀️'  },
  night:     { bg: '#f0e6ff', border: '#9b59b6', text: '#4a235a', icon: '🌙' },
};

const STATUS_COLORS = {
  open:    { bg: '#eafaf1', text: '#1e8449', label: 'OPEN'    },
  closed:  { bg: '#f0f0f0', text: '#555',    label: 'CLOSED'  },
  flagged: { bg: '#fdecea', text: '#721c24', label: 'FLAGGED' },
};

export default function ShiftManager({ tanks, darkMode, stationId }) {
  const [shifts,         setShifts]        = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [openingShift,   setOpeningShift]  = useState(false);
  const [closingShiftId, setClosingShiftId] = useState(null);
  const [tankId,         setTankId]        = useState('');
  const [attendantName,  setAttendantName] = useState('');
  const [closeForm,      setCloseForm]     = useState({
    pump_meter_opening: '',
    pump_meter_closing: '',
    notes: '',
  });

  const stationIdRef = useRef(stationId);

  const colors = {
    card:    darkMode ? '#1e1e2e' : '#ffffff',
    text:    darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888'    : '#666',
    border:  darkMode ? '#2a2a3e' : '#e0e0e0',
    input:   darkMode ? '#2a2a3e' : '#f8f8f8',
  };

  async function loadShifts(sid) {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const id   = sid !== undefined ? sid : stationIdRef.current;
      const res  = await fetch(`${API}/api/shifts?limit=30${id ? '&station_id=' + id : ''}`);
      const data = await res.json();
      setShifts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    stationIdRef.current = stationId;
    loadShifts(stationId);
  }, [stationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOpenShift() {
    if (!tankId) { alert('Please select a tank.'); return; }
    if (!attendantName.trim()) { alert('Please enter attendant name.'); return; }
    try {
      const res  = await fetch(`${API}/api/shifts/open`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tank_id: tankId, attendant_name: attendantName }),
      });
      const data = await res.json();
      if (data.alreadyOpen) {
        alert('A shift is already open for this tank.');
      } else {
        alert('Shift opened successfully!');
        setOpeningShift(false);
        setTankId('');
        setAttendantName('');
        await loadShifts(stationIdRef.current);
      }
    } catch (err) {
      console.error('Failed to open shift:', err);
      alert('Error opening shift.');
    }
  }

  async function handleCloseShift(shiftId) {
    try {
      const res  = await fetch(`${API}/api/shifts/${shiftId}/close`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pump_meter_opening: closeForm.pump_meter_opening ? parseFloat(closeForm.pump_meter_opening) : null,
          pump_meter_closing: closeForm.pump_meter_closing ? parseFloat(closeForm.pump_meter_closing) : null,
          notes:              closeForm.notes,
        }),
      });
      const data = await res.json();
      if (data.status === 'flagged') {
        alert('⚠️ Shift closed but FLAGGED — pump vs dip variance exceeds 0.5%. Check alerts.');
      } else {
        alert('Shift closed successfully.');
      }
      setClosingShiftId(null);
      setCloseForm({ pump_meter_opening: '', pump_meter_closing: '', notes: '' });
      await loadShifts(stationIdRef.current);
    } catch (err) {
      console.error('Failed to close shift:', err);
      alert('Error closing shift.');
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: `1px solid ${colors.border}`, fontSize: '13px',
    background: colors.input, color: colors.text, outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: '500',
    color: colors.subtext, marginBottom: '4px',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: colors.text }}>⏱ Shift Management</div>
        <button
          onClick={() => { setOpeningShift(!openingShift); setClosingShiftId(null); }}
          style={{ padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
        >
          {openingShift ? '✕ Cancel' : '+ Open New Shift'}
        </button>
      </div>

      {openingShift && (
        <div style={{ background: colors.card, borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '16px' }}>🌅 Open New Shift</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Tank</label>
              <select
                value={tankId}
                onChange={e => setTankId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select tank...</option>
                {Array.isArray(tanks) && tanks.map(t => (
                  <option key={t.id} value={t.id}>
                    Tank {t.tank_number} — {t.fuel_type?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Attendant Name</label>
              <input
                type="text"
                value={attendantName}
                onChange={e => setAttendantName(e.target.value)}
                placeholder="e.g. John Kamau"
                style={inputStyle}
              />
            </div>
          </div>
          <button
            onClick={handleOpenShift}
            style={{ padding: '9px 20px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
          >
            Open Shift
          </button>
        </div>
      )}

      {closingShiftId && (
        <div style={{ background: '#fff9e6', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #ffc107' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#856404', marginBottom: '16px' }}>🔒 Close Shift — Enter Pump Meter Readings</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ ...labelStyle, color: '#856404' }}>Pump Meter Opening (L)</label>
              <input
                type="number"
                value={closeForm.pump_meter_opening}
                onChange={e => setCloseForm({ ...closeForm, pump_meter_opening: e.target.value })}
                placeholder="e.g. 45230.5"
                style={{ ...inputStyle, background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#856404' }}>Pump Meter Closing (L)</label>
              <input
                type="number"
                value={closeForm.pump_meter_closing}
                onChange={e => setCloseForm({ ...closeForm, pump_meter_closing: e.target.value })}
                placeholder="e.g. 47890.0"
                style={{ ...inputStyle, background: '#fff' }}
              />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...labelStyle, color: '#856404' }}>Notes (optional)</label>
            <textarea
              value={closeForm.notes}
              onChange={e => setCloseForm({ ...closeForm, notes: e.target.value })}
              placeholder="Any observations during this shift..."
              rows={2}
              style={{ ...inputStyle, background: '#fff', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => handleCloseShift(closingShiftId)}
              style={{ padding: '9px 20px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
            >
              Close Shift
            </button>
            <button
              onClick={() => { setClosingShiftId(null); setCloseForm({ pump_meter_opening: '', pump_meter_closing: '', notes: '' }); }}
              style={{ padding: '9px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: colors.subtext }}>Loading shifts...</div>
      ) : shifts.length === 0 ? (
        <div style={{ background: colors.card, borderRadius: '12px', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏱</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: colors.text, marginBottom: '8px' }}>No shifts yet</div>
          <div style={{ fontSize: '13px', color: colors.subtext }}>Open a shift to start tracking attendant activity.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {shifts.map(shift => {
            const sc = SHIFT_COLORS[shift.shift_name]  || SHIFT_COLORS.morning;
            const st = STATUS_COLORS[shift.status]     || STATUS_COLORS.closed;
            const isClosing = closingShiftId === shift.id;

            return (
              <div key={shift.id} style={{ background: colors.card, borderRadius: '10px', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                        {sc.icon} {shift.shift_name?.toUpperCase()}
                      </span>
                      <span style={{ background: st.bg, color: st.text, padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
                        {st.label}
                      </span>
                      <span style={{ fontSize: '12px', color: colors.subtext }}>
                        Tank {shift.tank_number} · {shift.fuel_type?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: colors.text, marginBottom: '6px' }}>
                      📅 {shift.shift_date} &nbsp;·&nbsp;
                      {shift.attendant_name && <span>👤 {shift.attendant_name} &nbsp;·&nbsp;</span>}
                      🕐 {new Date(shift.started_at).toLocaleTimeString()}
                      {shift.ended_at && ` → ${new Date(shift.ended_at).toLocaleTimeString()}`}
                    </div>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: colors.subtext }}>
                      {shift.opening_nsv && <span>Opening: <strong style={{ color: colors.text }}>{parseFloat(shift.opening_nsv).toFixed(0)}L</strong></span>}
                      {shift.closing_nsv && <span>Closing: <strong style={{ color: colors.text }}>{parseFloat(shift.closing_nsv).toFixed(0)}L</strong></span>}
                      {shift.dip_sales   && <span>Dip sales: <strong style={{ color: colors.text }}>{parseFloat(shift.dip_sales).toFixed(0)}L</strong></span>}
                      {shift.pump_meter_sales && <span>Pump sales: <strong style={{ color: colors.text }}>{parseFloat(shift.pump_meter_sales).toFixed(0)}L</strong></span>}
                    </div>
                    {shift.variance_litres !== null && shift.variance_litres !== undefined && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: shift.status === 'flagged' ? '#e74c3c' : '#27ae60', fontWeight: '600' }}>
                        {shift.status === 'flagged' ? '⚠️' : '✅'} Variance: {parseFloat(shift.variance_litres).toFixed(1)}L
                        {shift.variance_pct && ` (${parseFloat(shift.variance_pct).toFixed(3)}%)`}
                      </div>
                    )}
                  </div>
                  {shift.status === 'open' && (
                    <button
                      onClick={() => { setClosingShiftId(isClosing ? null : shift.id); setOpeningShift(false); }}
                      style={{ marginLeft: '12px', padding: '7px 14px', background: isClosing ? '#f0f0f0' : '#e74c3c', color: isClosing ? '#333' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                    >
                      {isClosing ? 'Cancel' : 'Close Shift'}
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
