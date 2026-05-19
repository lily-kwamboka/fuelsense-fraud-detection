import React from 'react';

function TankCard({ tank }) {
  const fill    = parseFloat(tank.fill_pct) || 0;
  const isLow   = fill < 20;
  const isWater = parseFloat(tank.water_mm) > 50;

  const fillColor = isLow ? '#e74c3c' : fill < 40 ? '#f39c12' : '#27ae60';

  return (
    <div style={styles.card}>
      {/* Card Header */}
      <div style={{ ...styles.cardHeader, background: tank.fuel_type === 'petrol' ? '#1a1a2e' : '#2c3e50' }}>
        <div>
          <div style={styles.tankName}>Tank {tank.tank_number}</div>
          <div style={styles.fuelType}>{tank.fuel_type.toUpperCase()}</div>
        </div>
        <div style={{ ...styles.fillBadge, background: fillColor }}>
          {fill}%
        </div>
      </div>

      {/* Fill bar */}
      <div style={styles.barBg}>
        <div style={{ ...styles.barFill, width: fill + '%', background: fillColor }} />
      </div>

      {/* Stats */}
      <div style={styles.stats}>
        <Stat label="NSV (15°C)"   value={parseFloat(tank.nsv_litres).toFixed(0) + ' L'} />
        <Stat label="Innage"       value={parseFloat(tank.innage_mm).toFixed(1) + ' mm'} />
        <Stat label="Temperature"  value={parseFloat(tank.temperature_c).toFixed(1) + ' °C'} />
        <Stat label="Water level"  value={parseFloat(tank.water_mm).toFixed(1) + ' mm'} alert={isWater} />
        <Stat label="VCF"          value={parseFloat(tank.vcf).toFixed(6)} />
        <Stat label="Capacity"     value={parseFloat(tank.capacity_litres).toFixed(0) + ' L'} />
      </div>

      {/* Alerts */}
      {isLow   && <div style={styles.alertRed}>⚠ Low stock — below 20%</div>}
      {isWater && <div style={styles.alertRed}>🚨 High water level — {tank.water_mm}mm</div>}

      {/* Last updated */}
      <div style={styles.updated}>
        Last reading: {new Date(tank.recorded_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: alert ? '#e74c3c' : '#1a1a2e' }}>{value}</div>
    </div>
  );
}

const styles = {
  card:       { background: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  cardHeader: { padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tankName:   { color: '#fff', fontSize: '18px', fontWeight: '600' },
  fuelType:   { color: '#aaa', fontSize: '12px', marginTop: '2px' },
  fillBadge:  { color: '#fff', fontWeight: '700', fontSize: '20px', padding: '4px 10px', borderRadius: '8px' },
  barBg:      { height: '8px', background: '#eee' },
  barFill:    { height: '8px', transition: 'width 0.5s ease' },
  stats:      { padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  stat:       { },
  statLabel:  { fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue:  { fontSize: '15px', fontWeight: '500', marginTop: '2px' },
  alertRed:   { margin: '0 16px 8px', background: '#fdecea', color: '#e74c3c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' },
  updated:    { padding: '10px 16px', fontSize: '11px', color: '#bbb', borderTop: '1px solid #f0f0f0' },
};

export default TankCard;