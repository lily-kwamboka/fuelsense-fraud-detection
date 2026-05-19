import React, { useState } from 'react';

function DeliveryForm({ tanks, onSuccess, api }) {
  const [form, setForm] = useState({
    tank_id:        '',
    supplier_name:  '',
    bol_number:     '',
    bol_nsv_litres: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit() {
    if (!form.tank_id || !form.supplier_name || !form.bol_number || !form.bol_nsv_litres) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(api + '/api/deliveries', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tank_id:        form.tank_id,
          supplier_name:  form.supplier_name,
          bol_number:     form.bol_number,
          bol_nsv_litres: parseFloat(form.bol_nsv_litres),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create delivery.');
        setLoading(false);
        return;
      }

      alert(
        'Delivery created successfully!\n\n' +
        'Delivery ID: ' + data.delivery_id + '\n' +
        'Opening NSV: ' + parseFloat(data.opening_nsv).toFixed(1) + 'L\n\n' +
        'Opening reading has been locked.'
      );

      onSuccess();
    } catch (err) {
      setError('Network error: ' + err.message);
      setLoading(false);
    }
  }

  return (
    <div style={styles.form}>
      <div style={styles.title}>New Delivery Entry</div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.grid}>
        <div style={styles.field}>
          <label style={styles.label}>Tank</label>
          <select name="tank_id" value={form.tank_id} onChange={handleChange} style={styles.input}>
            <option value="">Select tank...</option>
            {tanks.map(t => (
              <option key={t.id} value={t.id}>
                Tank {t.tank_number} — {t.fuel_type.toUpperCase()} ({parseFloat(t.nsv_litres).toFixed(0)}L current NSV)
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Supplier Name</label>
          <input
            name="supplier_name"
            value={form.supplier_name}
            onChange={handleChange}
            placeholder="e.g. Total Kenya"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>BOL Number</label>
          <input
            name="bol_number"
            value={form.bol_number}
            onChange={handleChange}
            placeholder="e.g. BOL-2026-00123"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>BOL NSV at 15°C (litres)</label>
          <input
            name="bol_nsv_litres"
            type="number"
            value={form.bol_nsv_litres}
            onChange={handleChange}
            placeholder="e.g. 8000"
            style={styles.input}
          />
        </div>
      </div>

      <button
        style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Creating...' : 'Create Delivery & Lock Opening Reading'}
      </button>
    </div>
  );
}

const styles = {
  form:  { background: '#fff', borderRadius: '10px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  title: { fontSize: '15px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' },
  error: { background: '#fdecea', color: '#e74c3c', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' },
  grid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '12px', color: '#666', fontWeight: '500' },
  input: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  btn:   { background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
};

export default DeliveryForm;