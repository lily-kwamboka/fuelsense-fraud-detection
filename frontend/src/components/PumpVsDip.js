import React, { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const SHIFT_ICONS = {
  morning:   '🌅',
  afternoon: '☀️',
  night:     '🌙',
};

export default function PumpVsDip({ darkMode }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');

  const colors = {
    card:    darkMode ? '#1e1e2e' : '#ffffff',
    text:    darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888'    : '#666',
    border:  darkMode ? '#2a2a3e' : '#e0e0e0',
    header:  darkMode ? '#2a2a3e' : '#f8f8f8',
  };

  async function loadData() {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/pump-vs-dip`);
      const rows = await res.json();
      setData(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error('Failed to load pump vs dip data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = filter === 'all'
    ? data
    : data.filter(r => r.status === filter);

  // Summary stats
  const flaggedCount  = data.filter(r => r.status === 'flagged').length;
  const avgVariancePct = data.length
    ? data.reduce((s, r) => s + Math.abs(parseFloat(r.variance_pct) || 0), 0) / data.length
    : 0;

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
          🔢 Pump Meter vs Dip Reading
        </div>
        <button
          onClick={loadData}
          style={{ padding: '6px 14px', background: darkMode ? '#2a2a3e' : '#f0f2f5', color: colors.text, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: colors.card, borderRadius: '10px', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: colors.subtext, marginBottom: '6px' }}>Total Shifts Compared</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#3498db' }}>{data.length}</div>
        </div>
        <div style={{ background: colors.card, borderRadius: '10px', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: colors.subtext, marginBottom: '6px' }}>Flagged Shifts</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: flaggedCount > 0 ? '#e74c3c' : '#27ae60' }}>
            {flaggedCount}
          </div>
        </div>
        <div style={{ background: colors.card, borderRadius: '10px', padding: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: colors.subtext, marginBottom: '6px' }}>Avg Variance</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: avgVariancePct > 0.5 ? '#e74c3c' : '#27ae60' }}>
            {avgVariancePct.toFixed(3)}%
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['all', 'closed', 'flagged'].map(f => (
          <button key={f} style={filterBtnStyle(f)} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: colors.subtext }}>Loading data...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: colors.card, borderRadius: '12px', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔢</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: colors.text, marginBottom: '8px' }}>
            No comparison data yet
          </div>
          <div style={{ fontSize: '13px', color: colors.subtext }}>
            Close a shift with pump meter readings to see comparisons here.
          </div>
        </div>
      ) : (
        <div style={{ background: colors.card, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.header }}>
                {['Date', 'Shift', 'Tank', 'Attendant', 'Dip Sales (L)', 'Pump Sales (L)', 'Variance (L)', 'Variance %', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: colors.subtext, textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                    {h}
                  </th>
                ))}
               </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const varianceLitres = parseFloat(row.variance_litres) || 0;
                const variancePct    = parseFloat(row.variance_pct)    || 0;
                const isFlagged      = row.status === 'flagged';
                const rowBg          = i % 2 === 0 ? colors.card : (darkMode ? '#1a1a2a' : '#fafafa');

                return (
                  <tr key={row.id} style={{ background: isFlagged ? '#fdecea' : rowBg }}>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: colors.text, borderBottom: `1px solid ${colors.border}` }}>
                      {row.shift_date}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: colors.text, borderBottom: `1px solid ${colors.border}` }}>
                      {SHIFT_ICONS[row.shift_name]} {row.shift_name}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: colors.text, borderBottom: `1px solid ${colors.border}` }}>
                      Tank {row.tank_number} · {row.fuel_type?.toUpperCase()}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: colors.subtext, borderBottom: `1px solid ${colors.border}` }}>
                      {row.attendant_name || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: colors.text, borderBottom: `1px solid ${colors.border}`, fontWeight: '500' }}>
                      {row.dip_sales ? parseFloat(row.dip_sales).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: colors.text, borderBottom: `1px solid ${colors.border}`, fontWeight: '500' }}>
                      {row.pump_meter_sales ? parseFloat(row.pump_meter_sales).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', borderBottom: `1px solid ${colors.border}`, fontWeight: '600', color: isFlagged ? '#e74c3c' : '#27ae60' }}>
                      {varianceLitres > 0 ? '+' : ''}{varianceLitres.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', borderBottom: `1px solid ${colors.border}`, fontWeight: '600', color: isFlagged ? '#e74c3c' : '#27ae60' }}>
                      {variancePct > 0 ? '+' : ''}{variancePct.toFixed(3)}%
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.border}` }}>
                      <span style={{
                        background: isFlagged ? '#fdecea' : '#eafaf1',
                        color:      isFlagged ? '#e74c3c' : '#27ae60',
                        padding:    '3px 8px',
                        borderRadius: '10px',
                        fontSize:   '11px',
                        fontWeight: '600',
                      }}>
                        {isFlagged ? '⚠️ FLAGGED' : '✅ OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}