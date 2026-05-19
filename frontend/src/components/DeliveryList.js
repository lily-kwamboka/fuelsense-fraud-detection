import React from 'react';

function DeliveryList({ deliveries }) {
  if (!deliveries.length) {
    return (
      <div style={styles.empty}>
        No deliveries recorded yet. Click "+ New Delivery" to enter one.
      </div>
    );
  }

  return (
    <div style={styles.table}>
      <div style={styles.headerRow}>
        <div>Tank</div>
        <div>Supplier</div>
        <div>BOL No.</div>
        <div>BOL NSV</div>
        <div>Received NSV</div>
        <div>Variance</div>
        <div>Status</div>
      </div>

      {deliveries.map(d => {
        const variance    = parseFloat(d.variance_litres);
        const variancePct = parseFloat(d.variance_pct);
        const isFlagged   = d.status === 'flagged';
        const isConfirmed = d.status === 'confirmed';

        return (
          <div key={d.id} style={styles.row}>
            <div style={styles.cell}>
              <div style={styles.tankBadge}>
                Tank {d.tank_number}
              </div>
              <div style={styles.fuelType}>{d.fuel_type}</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{d.supplier_name}</div>
              <div style={styles.subText}>{new Date(d.truck_arrived_at).toLocaleDateString()}</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{d.bol_number}</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>
                {d.bol_nsv_litres ? parseFloat(d.bol_nsv_litres).toFixed(0) + ' L' : '—'}
              </div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>
                {d.received_nsv_litres ? parseFloat(d.received_nsv_litres).toFixed(0) + ' L' : '—'}
              </div>
            </div>

            <div style={styles.cell}>
              {d.variance_litres ? (
                <div>
                  <div style={{ color: variance < 0 ? '#e74c3c' : '#27ae60', fontWeight: '600' }}>
                    {variance > 0 ? '+' : ''}{variance.toFixed(0)} L
                  </div>
                  <div style={styles.subText}>
                    {variancePct > 0 ? '+' : ''}{variancePct.toFixed(3)}%
                  </div>
                </div>
              ) : '—'}
            </div>

            <div style={styles.cell}>
              <span style={{
                ...styles.badge,
                background: isFlagged   ? '#fdecea' :
                            isConfirmed ? '#eafaf1' :
                            '#fef9e7',
                color:      isFlagged   ? '#e74c3c' :
                            isConfirmed ? '#27ae60' :
                            '#f39c12',
              }}>
                {d.status.replace('_', ' ').toUpperCase()}
              </span>
              {d.variance_classification && (
                <div style={styles.subText}>{d.variance_classification.replace(/_/g, ' ')}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  empty:     { background: '#fff', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#999', fontSize: '14px' },
  table:     { background: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  headerRow: { display: 'grid', gridTemplateColumns: '100px 1fr 1fr 100px 120px 120px 160px', gap: '12px', padding: '12px 16px', background: '#f8f9fa', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  row:       { display: 'grid', gridTemplateColumns: '100px 1fr 1fr 100px 120px 120px 160px', gap: '12px', padding: '14px 16px', borderTop: '1px solid #f0f0f0', alignItems: 'center' },
  cell:      { },
  tankBadge: { background: '#1a1a2e', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', display: 'inline-block' },
  fuelType:  { fontSize: '11px', color: '#999', marginTop: '3px' },
  mainText:  { fontSize: '14px', color: '#1a1a2e' },
  subText:   { fontSize: '11px', color: '#999', marginTop: '2px' },
  badge:     { padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' },
};

export default DeliveryList;