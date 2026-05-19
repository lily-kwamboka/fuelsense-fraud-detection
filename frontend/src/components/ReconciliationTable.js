import React from 'react';

function ReconciliationTable({ data }) {
  if (!data.length) {
    return (
      <div style={styles.empty}>
        No reconciliation data yet. Run the daily reconciliation job first.
      </div>
    );
  }

  return (
    <div style={styles.table}>
      <div style={styles.headerRow}>
        <div>Date</div>
        <div>Tank</div>
        <div>Opening NSV</div>
        <div>Deliveries</div>
        <div>Pump Sales</div>
        <div>Theoretical</div>
        <div>Actual Closing</div>
        <div>Variance</div>
      </div>

      {data.map((r, i) => {
        const variance   = parseFloat(r.variance_litres);
        const isNegative = variance < 0;
        const isBad      = Math.abs(variance) > 200;

        return (
          <div key={i} style={styles.row}>
            <div style={styles.cell}>
              <div style={styles.mainText}>
                {new Date(r.recon_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric'
                })}
              </div>
            </div>

            <div style={styles.cell}>
              <div style={styles.tankBadge}>Tank {r.tank_number}</div>
              <div style={styles.subText}>{r.fuel_type}</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{parseFloat(r.opening_nsv).toFixed(0)} L</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{parseFloat(r.deliveries_nsv).toFixed(0)} L</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{parseFloat(r.pump_sales_litres).toFixed(0)} L</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{parseFloat(r.theoretical_closing).toFixed(0)} L</div>
            </div>

            <div style={styles.cell}>
              <div style={styles.mainText}>{parseFloat(r.closing_nsv).toFixed(0)} L</div>
            </div>

            <div style={styles.cell}>
              <div style={{
                fontWeight: '600',
                fontSize:   '14px',
                color: isBad      ? '#e74c3c' :
                       isNegative ? '#f39c12' :
                       '#27ae60',
              }}>
                {variance > 0 ? '+' : ''}{variance.toFixed(0)} L
              </div>
              {isBad && (
                <div style={styles.flagged}>⚠ Investigate</div>
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
  headerRow: { display: 'grid', gridTemplateColumns: '120px 100px 1fr 1fr 1fr 1fr 1fr 120px', gap: '12px', padding: '12px 16px', background: '#f8f9fa', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  row:       { display: 'grid', gridTemplateColumns: '120px 100px 1fr 1fr 1fr 1fr 1fr 120px', gap: '12px', padding: '14px 16px', borderTop: '1px solid #f0f0f0', alignItems: 'center' },
  cell:      { },
  tankBadge: { background: '#1a1a2e', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', display: 'inline-block' },
  subText:   { fontSize: '11px', color: '#999', marginTop: '3px' },
  mainText:  { fontSize: '14px', color: '#1a1a2e' },
  flagged:   { fontSize: '11px', color: '#e74c3c', marginTop: '3px' },
};

export default ReconciliationTable;