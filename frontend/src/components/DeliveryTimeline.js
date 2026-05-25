import React from 'react';

const STAGES = [
  { key: 'truck_arrived_at',   icon: '🚚', label: 'Truck Arrived' },
  { key: 'offload_started_at', icon: '⛽', label: 'Offloading' },
  { key: 'offload_ended_at',   icon: '⏳', label: 'Stabilising' },
  { key: 'stabilisation_at',   icon: '✅', label: 'Reconciled' },
];

function DeliveryTimeline({ delivery, darkMode }) {
  const bgColor   = darkMode ? '#1e1e2e' : '#ffffff';
  const textColor = darkMode ? '#e0e0e0' : '#1a1a2e';
  const subColor  = darkMode ? '#888'    : '#999';
  const borderColor = darkMode ? '#2a2a3e' : '#f0f0f0';

  // Find current active stage
  const activeIndex = STAGES.reduce((acc, stage, i) => {
    return delivery[stage.key] ? i : acc;
  }, -1);

  const isFlagged   = delivery.status === 'flagged';
  const isConfirmed = delivery.status === 'confirmed';

  return (
    <div style={{ ...styles.card, background: bgColor, borderColor }}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{ ...styles.bolNumber, color: textColor }}>
            {delivery.bol_number}
          </div>
          <div style={{ fontSize: '12px', color: subColor, marginTop: '3px' }}>
            Tank {delivery.tank_number} — {delivery.fuel_type?.toUpperCase()} · {delivery.supplier_name}
          </div>
        </div>
        <div>
          <span style={{
            ...styles.statusBadge,
            background: isFlagged   ? '#fdecea' :
                        isConfirmed ? '#eafaf1' :
                        '#fff3cd',
            color:      isFlagged   ? '#e74c3c' :
                        isConfirmed ? '#27ae60' :
                        '#856404',
          }}>
            {delivery.status?.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div style={styles.timeline}>
        {STAGES.map((stage, index) => {
          const isCompleted = index <= activeIndex;
          const isActive    = index === activeIndex;
          const timestamp   = delivery[stage.key];

          return (
            <div key={stage.key} style={styles.stageWrapper}>
              {/* Connector line */}
              {index > 0 && (
                <div style={{
                  ...styles.connector,
                  background: index <= activeIndex ? '#4CAF50' : (darkMode ? '#2a2a3e' : '#e0e0e0'),
                }} />
              )}

              {/* Stage */}
              <div style={styles.stage}>
                {/* Circle */}
                <div style={{
                  ...styles.circle,
                  background: isCompleted ? '#4CAF50' : (darkMode ? '#2a2a3e' : '#f0f0f0'),
                  border: isActive ? '3px solid #4CAF50' : 'none',
                  boxShadow: isActive ? '0 0 0 4px rgba(76,175,80,0.2)' : 'none',
                }}>
                  <span style={{ fontSize: isActive ? '16px' : '14px' }}>
                    {isCompleted ? stage.icon : '○'}
                  </span>
                </div>

                {/* Label */}
                <div style={{ ...styles.stageLabel, color: isCompleted ? textColor : subColor, fontWeight: isActive ? '600' : '400' }}>
                  {stage.label}
                </div>

                {/* Timestamp */}
                <div style={{ ...styles.timestamp, color: subColor }}>
                  {timestamp
                    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reconciliation result */}
      {delivery.variance_litres && (
        <div style={{ ...styles.recon, background: darkMode ? '#0f0f1a' : '#f8f9fa', borderColor }}>
          <div style={styles.reconGrid}>
            <ReconStat
              label="BOL NSV"
              value={parseFloat(delivery.bol_nsv_litres).toFixed(0) + ' L'}
              color={textColor}
              sub={subColor}
            />
            <ReconStat
              label="Received NSV"
              value={parseFloat(delivery.received_nsv_litres).toFixed(0) + ' L'}
              color={textColor}
              sub={subColor}
            />
            <ReconStat
              label="Variance"
              value={(parseFloat(delivery.variance_litres) > 0 ? '+' : '') + parseFloat(delivery.variance_litres).toFixed(0) + ' L'}
              color={isFlagged ? '#e74c3c' : '#27ae60'}
              sub={subColor}
            />
            <ReconStat
              label="Variance %"
              value={(parseFloat(delivery.variance_pct) > 0 ? '+' : '') + parseFloat(delivery.variance_pct).toFixed(3) + '%'}
              color={isFlagged ? '#e74c3c' : '#27ae60'}
              sub={subColor}
            />
          </div>
          {delivery.variance_classification && (
            <div style={{ ...styles.classification, color: subColor }}>
              Classification: <strong style={{ color: textColor }}>{delivery.variance_classification.replace(/_/g, ' ')}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReconStat({ label, value, color, sub }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '16px', fontWeight: '600', color }}>{value}</div>
      <div style={{ fontSize: '11px', color: sub, marginTop: '2px' }}>{label}</div>
    </div>
  );
}

const styles = {
  card:          { borderRadius: '12px', border: '1px solid', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  bolNumber:     { fontSize: '15px', fontWeight: '700' },
  statusBadge:   { padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
  timeline:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', position: 'relative' },
  stageWrapper:  { display: 'flex', alignItems: 'center', flex: 1 },
  connector:     { flex: 1, height: '2px', marginBottom: '24px' },
  stage:         { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '70px' },
  circle:        { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stageLabel:    { fontSize: '11px', textAlign: 'center' },
  timestamp:     { fontSize: '10px', textAlign: 'center' },
  recon:         { borderRadius: '8px', border: '1px solid', padding: '14px', marginTop: '8px' },
  reconGrid:     { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '8px' },
  classification:{ fontSize: '12px', textAlign: 'center', marginTop: '4px' },
};

export default DeliveryTimeline;