import React, { useState, useEffect } from 'react';

export default function Suppliers({ api }) {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        tolerance_pct: '0.25',
    });

    async function loadSuppliers() {
        setLoading(true);
        try {
            const res = await fetch(`${api}/api/admin/suppliers`);
            const data = await res.json();
            setSuppliers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load suppliers:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadSuppliers(); }, []);

    function openAdd() {
        setEditing(null);
        setForm({ name: '', contact_name: '', phone: '', email: '', address: '', tolerance_pct: '0.25' });
        setError('');
        setShowForm(true);
    }

    function openEdit(supplier) {
        setEditing(supplier);
        setForm({
            name: supplier.name || '',
            contact_name: supplier.contact_name || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            address: supplier.address || '',
            tolerance_pct: supplier.tolerance_pct || '0.25',
        });
        setError('');
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.name.trim()) { setError('Supplier name is required.'); return; }
        if (!form.tolerance_pct || isNaN(form.tolerance_pct)) { setError('Tolerance % must be a number.'); return; }
        setSaving(true);
        setError('');
        try {
            const url = editing ? `${api}/api/admin/suppliers/${editing.id}` : `${api}/api/admin/suppliers`;
            const method = editing ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    tolerance_pct: parseFloat(form.tolerance_pct),
                }),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setShowForm(false);
            loadSuppliers();
        } catch (err) {
            setError('Failed to save supplier.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(supplier) {
        if (!window.confirm(`Delete supplier "${supplier.name}"? This cannot be undone.`)) return;
        try {
            await fetch(`${api}/api/admin/suppliers/${supplier.id}`, { method: 'DELETE' });
            loadSuppliers();
        } catch (err) {
            alert('Failed to delete supplier.');
        }
    }

    async function toggleActive(supplier) {
        try {
            await fetch(`${api}/api/admin/suppliers/${supplier.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...supplier, is_active: !supplier.is_active }),
            });
            loadSuppliers();
        } catch (err) {
            alert('Failed to update supplier.');
        }
    }

    const inputStyle = {
        width: '100%', padding: '9px 12px', borderRadius: '8px',
        border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none',
        boxSizing: 'border-box', background: '#f8f8f8',
    };

    const labelStyle = {
        display: 'block', fontSize: '12px', fontWeight: '500',
        color: '#666', marginBottom: '4px',
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', color: '#666' }}>{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} total</div>
                <button
                    onClick={openAdd}
                    style={{ padding: '9px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                >
                    + Add Supplier
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0e0e0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>
                        {editing ? '✏️ Edit Supplier' : '🚚 Add New Supplier'}
                    </div>
                    {error && (
                        <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    {/* Row 1 — Name, Contact */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={labelStyle}>Supplier Name *</label>
                            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Total Energies Kenya" style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Contact Person</label>
                            <input type="text" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="e.g. James Mwangi" style={inputStyle} />
                        </div>
                    </div>

                    {/* Row 2 — Phone, Email */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={labelStyle}>Phone</label>
                            <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +254 700 000 000" style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Email</label>
                            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. james@totalenergies.com" style={inputStyle} />
                        </div>
                    </div>

                    {/* Row 3 — Address, Tolerance */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <label style={labelStyle}>Address</label>
                            <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="e.g. Upper Hill, Nairobi" style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Variance Tolerance (%)</label>
                            <input type="number" step="0.01" min="0" max="5" value={form.tolerance_pct} onChange={e => setForm({ ...form, tolerance_pct: e.target.value })} placeholder="e.g. 0.25" style={inputStyle} />
                            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
                                Default is 0.25% — agreed variance threshold with this supplier
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#888' : '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                            {saving ? 'Saving...' : editing ? 'Update Supplier' : 'Add Supplier'}
                        </button>
                        <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading suppliers...</div>
            ) : suppliers.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚚</div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>No suppliers yet</div>
                    <div style={{ fontSize: '13px', color: '#888' }}>Add your first supplier to get started.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {suppliers.map(supplier => (
                        <div key={supplier.id} style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: supplier.is_active ? 1 : 0.6 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>🚚 {supplier.name}</span>
                                    <span style={{ background: supplier.is_active ? '#eafaf1' : '#f0f0f0', color: supplier.is_active ? '#1e8449' : '#888', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                        {supplier.is_active ? 'ACTIVE' : 'INACTIVE'}
                                    </span>
                                    <span style={{ background: '#e8f4fd', color: '#1a5276', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                        Tolerance: {supplier.tolerance_pct || 0.25}%
                                    </span>
                                </div>
                                <div style={{ fontSize: '13px', color: '#666' }}>
                                    {supplier.contact_name && <span>👤 {supplier.contact_name} &nbsp;·&nbsp;</span>}
                                    {supplier.phone && <span>📞 {supplier.phone} &nbsp;·&nbsp;</span>}
                                    {supplier.email && <span>✉️ {supplier.email}</span>}
                                </div>
                                {supplier.address && (
                                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>📍 {supplier.address}</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => toggleActive(supplier)} style={{ padding: '7px 14px', background: supplier.is_active ? '#fff3cd' : '#eafaf1', color: supplier.is_active ? '#856404' : '#1e8449', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                    {supplier.is_active ? '⏸ Deactivate' : '▶ Activate'}
                                </button>
                                <button onClick={() => openEdit(supplier)} style={{ padding: '7px 14px', background: '#e8f4fd', color: '#1a5276', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                    ✏️ Edit
                                </button>
                                <button onClick={() => handleDelete(supplier)} style={{ padding: '7px 14px', background: '#fdecea', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                                    🗑 Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}