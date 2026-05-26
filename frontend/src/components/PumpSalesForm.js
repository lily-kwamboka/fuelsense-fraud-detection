import React, { useState, useContext } from 'react';
import { ToastContext } from '../Toast';

function PumpSalesForm({ tanks, api, onSuccess }) {
  const [form, setForm] = useState({
    tank_id:          '',
    recon_date:       new Date().toISOString().split('T')[0],
    pump_sales_litres: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [result,  setResult]  = useState(null);
  const { addToast } = useContext(ToastContext);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setResult(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!form.tank_id || !form.recon_date || !form.pump_sales_litres) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(api + '/api/reconciliation/pump-sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tank_id:           form.tank_id,
          recon_date:        form.recon_date,
          pump_sales_litres: parseFloat(form.pump_sales_litres),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update pump sales.');
        setLoading(false);
        return;
      }

      setResult(data);
      setLoading(false);
      addToast(
        'Pump sales saved! Daily variance: ' + parseFloat(data.variance_litres).toFixed(0) + 'L',
        Math.abs(parseFloat(data.variance_litres)) > 200 ? 'warning' : 'success',
        5000
      );
      if (onSuccess) onSuccess();

    } catch (err) {
      setError('Network error: ' + err.message);
      setLoading(false);
    }
  }

  return (
    <div style={styles.form}>
      <div style={styles.title}>Enter Pump Sales</div>
      <div style={styles.sub}>Enter the total litres dispensed from the pump for a given tank and date.</div>

      {error  && <div style={styles.error}>{error}</div>}

      <div style={styles.grid}>
        <div style={styles.field}>
          <label style={styles.label}>Tank</label>
          <select name="tank_id" value={form.tank_id} onChange={handleChange} style={styles.input}>
            <option value="">Select tank...</option>
            {tanks.map(t => (
              <option key={t.id} value={t.id}>
                Tank {t.tank_number} — {t.fuel_type.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Date</label>
          <input
            type="date"
            name="recon_date"
            value={form.recon_date}
            onChange={handleChange}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Pump Sales (litres)</label>
          <input
            type="number"
            name="pump_sales_litres"
            value={form.pump_sales_litres}
            onChange={handleChange}
            placeholder="e.g. 3500"
            style={styles.input}
          />
        </div>
      </div>

      <button
        style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Saving...' : 'Save Pump Sales'}
      </button>

      {result && (
        <div style={styles.result}>
          <div style={styles.resultTitle}>✅ Reconciliation Updated</div>
          <div style={styles.resultGrid}>
            <ResultRow label="Opening NSV"          value={result.opening_nsv + ' L'} />
            <ResultRow label="Deliveries received"  value={result.deliveries_nsv + ' L'} />
            <ResultRow label="Pump sales entered"   value={result.pump_sales_litres + ' L'} />
            <ResultRow label="Theoretical closing"  value={result.theoretical_closing + ' L'} />
            <ResultRow label="Actual closing"       value={result.closing_nsv + ' L'} />
            <ResultRow
              label="Daily variance"
              value={parseFloat(result.variance_litres) > 0
                ? '+' + result.variance_litres + ' L'
                : result.variance_litres + ' L'}
              highlight={Math.abs(parseFloat(result.variance_litres)) > 200}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }) {
  return (
    <div style={styles.resultRow}>
      <div style={styles.resultLabel}>{label}</div>
      <div style={{ ...styles.resultValue, color: highlight ? '#e74c3c' : '#1a1a2e', fontWeight: highlight ? '700' : '500' }}>
        {value}
      </div>
    </div>
  );
}

const styles = {
  form:        { background: '#fff', borderRadius: '10px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  title:       { fontSize: '15px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' },
  sub:         { fontSize: '13px', color: '#999', marginBottom: '16px' },
  error:       { background: '#fdecea', color: '#e74c3c', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' },
  grid:        { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' },
  field:       { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:       { fontSize: '12px', color: '#666', fontWeight: '500' },
  input:       { padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  btn:         { background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  result:      { marginTop: '16px', background: '#f0faf5', border: '1px solid #c3e6d8', borderRadius: '8px', padding: '16px' },
  resultTitle: { fontSize: '14px', fontWeight: '600', color: '#27ae60', marginBottom: '12px' },
  resultGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  resultRow:   { },
  resultLabel: { fontSize: '11px', color: '#999', textTransform: 'uppercase' },
  resultValue: { fontSize: '14px', marginTop: '2px' },
};

export default PumpSalesForm;