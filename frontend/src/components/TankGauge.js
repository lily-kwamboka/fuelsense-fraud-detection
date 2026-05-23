import React from 'react';

function TankGauge({ tank, darkMode }) {
  const fill        = parseFloat(tank.fill_pct) || 0;
  const nsv         = parseFloat(tank.nsv_litres) || 0;
  const temp        = parseFloat(tank.temperature_c) || 0;
  const water       = parseFloat(tank.water_mm) || 0;
  const innage      = parseFloat(tank.innage_mm) || 0;
  const vcf         = parseFloat(tank.vcf) || 0;
  const isLow       = fill < 20;
  const isMedium    = fill >= 20 && fill < 40;
  const isHigh      = fill >= 40;
  const isWaterHigh = water > 50;

  const gaugeColor  = isLow ? '#e74c3c' : isMedium ? '#f39c12' : '#4CAF50';
  const bgColor     = darkMode ? '#1e1e2e' : '#ffffff';
  const textColor   = darkMode ? '#e0e0e0' : '#1a1a2e';
  const subColor    = darkMode ? '#888' : '#999';
  const borderColor = darkMode ? '#2a2a3e' : '#f0f0f0';

  // SVG gauge calculation
  const radius      = 54;
  const cx          = 70;
  const cy          = 70;
  const startAngle  = -220;
  const endAngle    = 40;
  const totalAngle  = endAngle - startAngle;
  const fillAngle   = startAngle + (totalAngle * fill / 100);

  function polarToCartesian(cx, cy, r, angle) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start  = polarToCartesian(cx, cy, r, endAngle);
    const end    = polarToCartesian(cx, cy, r, startAngle);
    const large  = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
  }

  return (
    <div style={{ ...styles.card, background: bgColor, borderColor }}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{ ...styles.tankName, color: textColor }}>
            Tank {tank.tank_number}
          </div>
          <div style={{
            ...styles.fuelBadge,
            background: tank.fuel_type === 'petrol' ? '#fff3e0' : '#e8f5e9',
            color: tank.fuel_type === 'petrol' ? '#e65100' : '#2e7d32',
          }}>
            {tank.fuel_type.toUpperCase()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {isLow && <div style={styles.alertBadge}>⚠ LOW</div>}
          {isWaterHigh && <div style={{ ...styles.alertBadge, background: '#fff3cd', color: '#856404' }}>💧 WATER</div>}
          {!isLow && !isWaterHigh && (
            <div style={{ ...styles.alertBadge, background: '#eafaf1', color: '#27ae60' }}>✓ NORMAL</div>
          )}
        </div>
      </div>

      {/* SVG Gauge */}
      <div style={styles.gaugeContainer}>
        <svg width="140" height="100" viewBox="0 0 140 100">
          {/* Background arc */}
          <path
            d={describeArc(cx, cy, radius, startAngle, endAngle)}
            fill="none"
            stroke={darkMode ? '#2a2a3e' : '#f0f0f0'}
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Fill arc */}
          {fill > 0 && (
            <path
              d={describeArc(cx, cy, radius, startAngle, fillAngle)}
              fill="none"
              stroke={gaugeColor}
              strokeWidth="10"
              strokeLinecap="round"
            />
          )}
          {/* Percentage text */}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fill={gaugeColor}
            fontSize="20"
            fontWeight="700"
          >
            {fill.toFixed(0)}%
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fill={subColor}
            fontSize="8"
          >
            CAPACITY
          </text>
          {/* Min/Max labels */}
          <text x="12" y="92" fill={subColor} fontSize="7">0%</text>
          <text x="110" y="92" fill={subColor} fontSize="7">100%</text>
        </svg>
      </div>

      {/* NSV highlight */}
      <div style={{ ...styles.nsvBox, background: darkMode ? '#0f0f1a' : '#f8fffe', borderColor: gaugeColor }}>
        <div style={{ ...styles.nsvValue, color: gaugeColor }}>{nsv.toFixed(0)} L</div>
        <div style={{ ...styles.nsvLabel, color: subColor }}>NSV at 15°C</div>
      </div>

      {/* Stats grid */}
      <div style={styles.statsGrid}>
        <StatItem label="Innage"      value={innage.toFixed(1) + ' mm'} color={textColor} sub={subColor} />
        <StatItem label="Temperature" value={temp.toFixed(1) + ' °C'}   color={textColor} sub={subColor} alert={temp > 35} />
        <StatItem label="Water level" value={water.toFixed(1) + ' mm'}  color={textColor} sub={subColor} alert={isWaterHigh} />
        <StatItem label="VCF"         value={vcf.toFixed(5)}            color={textColor} sub={subColor} />
      </div>

      {/* Last updated */}
      <div style={{ ...styles.updated, color: subColor, borderColor }}>
        Last reading: {tank.recorded_at ? new Date(tank.recorded_at).toLocaleTimeString() : '—'}
      </div>
    </div>
  );
}

function StatItem({ label, value, color, sub, alert }) {
  return (
    <div style={styles.statItem}>
      <div style={{ fontSize: '11px', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: '500', color: alert ? '#e74c3c' : color, marginTop: '2px' }}>{value}</div>
    </div>
  );
}

const styles = {
  card:          { borderRadius: '12px', border: '1px solid', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', transition: 'transform 0.2s', cursor: 'default' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 16px 0' },
  tankName:      { fontSize: '17px', fontWeight: '700', marginBottom: '6px' },
  fuelBadge:     { display: 'inline-block', padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '600' },
  alertBadge:    { display: 'inline-block', padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '600', background: '#fdecea', color: '#e74c3c' },
  gaugeContainer:{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' },
  nsvBox:        { margin: '0 16px 12px', padding: '10px', borderRadius: '8px', border: '1.5px solid', textAlign: 'center' },
  nsvValue:      { fontSize: '22px', fontWeight: '700' },
  nsvLabel:      { fontSize: '11px', marginTop: '2px' },
  statsGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '0 16px 12px' },
  statItem:      { },
  updated:       { padding: '10px 16px', fontSize: '11px', borderTop: '1px solid' },
};

export default TankGauge;