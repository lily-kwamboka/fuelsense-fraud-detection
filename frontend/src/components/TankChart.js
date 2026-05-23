import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function TankChart({ tank, api, darkMode }) {
  const [readings, setReadings] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!tank?.id) return;
    fetch(api + '/api/tanks/' + tank.id + '/readings')
      .then(r => r.json())
      .then(data => {
        const formatted = data
          .reverse()
          .map(r => ({
            time:  new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            nsv:   parseFloat(parseFloat(r.nsv_litres).toFixed(1)),
            temp:  parseFloat(parseFloat(r.temperature_c).toFixed(1)),
            innage: parseFloat(parseFloat(r.innage_mm).toFixed(1)),
          }));
        setReadings(formatted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tank?.id, api]);

  const bgColor   = darkMode ? '#1e1e2e' : '#ffffff';
  const textColor = darkMode ? '#888' : '#999';
  const gridColor = darkMode ? '#2a2a3e' : '#f0f0f0';
  const lineColor = tank?.fuel_type === 'petrol' ? '#f39c12' : '#3498db';

  if (loading) {
    return (
      <div style={{ ...styles.card, background: bgColor }}>
        <div style={{ color: textColor, padding: '20px', textAlign: 'center' }}>Loading chart...</div>
      </div>
    );
  }

  if (!readings.length) {
    return (
      <div style={{ ...styles.card, background: bgColor }}>
        <div style={{ color: textColor, padding: '20px', textAlign: 'center' }}>No readings available yet.</div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.card, background: bgColor }}>
      <div style={styles.header}>
        <div style={{ ...styles.title, color: darkMode ? '#e0e0e0' : '#1a1a2e' }}>
          Tank {tank.tank_number} — NSV Trend
        </div>
        <div style={{ ...styles.sub, color: textColor }}>
          Last {readings.length} readings
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={readings} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="time"
            tick={{ fill: textColor, fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: textColor, fontSize: 10 }}
            width={60}
            tickFormatter={v => v.toFixed(0) + 'L'}
          />
          <Tooltip
            contentStyle={{
              background: darkMode ? '#1e1e2e' : '#fff',
              border: '1px solid ' + gridColor,
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value) => [value + ' L', 'NSV']}
          />
          <Line
            type="monotone"
            dataKey="nsv"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Mini stats */}
      <div style={styles.miniStats}>
        <MiniStat
          label="Current"
          value={readings[readings.length - 1]?.nsv + ' L'}
          color={lineColor}
          textColor={darkMode ? '#e0e0e0' : '#1a1a2e'}
          subColor={textColor}
        />
        <MiniStat
          label="Highest"
          value={Math.max(...readings.map(r => r.nsv)) + ' L'}
          color="#27ae60"
          textColor={darkMode ? '#e0e0e0' : '#1a1a2e'}
          subColor={textColor}
        />
        <MiniStat
          label="Lowest"
          value={Math.min(...readings.map(r => r.nsv)) + ' L'}
          color="#e74c3c"
          textColor={darkMode ? '#e0e0e0' : '#1a1a2e'}
          subColor={textColor}
        />
        <MiniStat
          label="Avg Temp"
          value={(readings.reduce((a, b) => a + b.temp, 0) / readings.length).toFixed(1) + ' °C'}
          color="#f39c12"
          textColor={darkMode ? '#e0e0e0' : '#1a1a2e'}
          subColor={textColor}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, textColor, subColor }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '15px', fontWeight: '600', color }}>{value}</div>
      <div style={{ fontSize: '11px', color: subColor, marginTop: '2px' }}>{label}</div>
    </div>
  );
}

const styles = {
  card:      { borderRadius: '12px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '16px' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title:     { fontSize: '14px', fontWeight: '600' },
  sub:       { fontSize: '12px' },
  miniStats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' },
};

export default TankChart;