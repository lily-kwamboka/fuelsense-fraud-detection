import React, { useState, useEffect } from 'react';

export default function AlertConfig({ api }) {
    const [stations, setStations] = useState([]);
    const [selectedStation, setSelectedStation] = useState('');
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    async function loadStations() {
        try {
            const res = await fetch(`${api}/api/admin/stations`);
            const data = await res.json();
            setStations(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load stations:', err);
        }
    }

    async function loadConfig(stationId) {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${api}/api/admin/alert-config/${stationId}`);
            const data = await res.json();
            setConfig(data);
        } catch (err) {
            setError('Failed to load alert config.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadStations(); }, []);

    useEffect(() => {
        if (selectedStation) loadConfig(selectedStation);
        else setConfig(null);
    }, [selectedStation]);

    async function handleSave() {
        if (!selectedStation) { setError('Please select a station.'); return; }
        setSaving(true);
        setError('');
        setSaved(false);
        try {
            const res = await fetch(`${api}/api/admin/alert-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, station_id: selectedStation }),
            });
            const data = await res.json();
            if (data.error) { setError(data.error); return; }
            setConfig(data);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            setError('Failed to save config.');
        } finally {
            setSaving(false);
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

    const sectionStyle = {
        background: '#fff', borderRadius: '12px', padding: '24px',
        marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #e0e0e0',
    };

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
                    Select a station to configure its alert thresholds and notification contacts.
                </div>
                <select
                    value={selectedStation}
                    onChange={e => setSelectedStation(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff', outline: 'none', minWidth: '280px' }}
                >
                    <option value="">Select a station...</option>
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </div>

            {error && (
                <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            {saved && (
                <div style={{ background: '#eafaf1', color: '#1e8449', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                    ✅ Alert configuration saved successfully
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading config...</div>
            )}

            {config && !loading && (
                <>
                    {/* Alert Thresholds */}
                    <div style={sectionStyle}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>
                            🔔 Alert Thresholds
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label style={labelStyle}>Low Stock Warning (%)</label>
                                <input
                                    type="number" step="1" min="1" max="100"
                                    value={config.low_stock_threshold_pct}
                                    onChange={e => setConfig({ ...config, low_stock_threshold_pct: e.target.value })}
                                    style={inputStyle}
                                />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Alert when tank drops below this % of capacity</div>
                            </div>
                            <div>
                                <label style={labelStyle}>High Water Warning (mm)</label>
                                <input
                                    type="number" step="1" min="0"
                                    value={config.high_water_mm}
                                    onChange={e => setConfig({ ...config, high_water_mm: e.target.value })}
                                    style={inputStyle}
                                />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Alert when water level exceeds this mm</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>Reading Gap Alert (minutes)</label>
                                <input
                                    type="number" step="1" min="1"
                                    value={config.reading_gap_minutes}
                                    onChange={e => setConfig({ ...config, reading_gap_minutes: e.target.value })}
                                    style={inputStyle}
                                />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Alert if no ATG reading received after this many minutes</div>
                            </div>
                            <div>
                                <label style={labelStyle}>Stabilisation Timeout (hours)</label>
                                <input
                                    type="number" step="1" min="1"
                                    value={config.stabilisation_timeout_hours}
                                    onChange={e => setConfig({ ...config, stabilisation_timeout_hours: e.target.value })}
                                    style={inputStyle}
                                />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Hours before delivery stabilisation fallback lock</div>
                            </div>
                            <div>
                                <label style={labelStyle}>Delivery Variance Tolerance (%)</label>
                                <input
                                    type="number" step="0.01" min="0"
                                    value={config.delivery_variance_tolerance_pct}
                                    onChange={e => setConfig({ ...config, delivery_variance_tolerance_pct: e.target.value })}
                                    style={inputStyle}
                                />
                                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Flag delivery if variance exceeds this %</div>
                            </div>
                        </div>
                    </div>

                    {/* Notification Contacts */}
                    <div style={sectionStyle}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>
                            📬 Notification Contacts
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div>
                                <label style={labelStyle}>Notification Email</label>
                                <input
                                    type="email"
                                    value={config.notify_email || ''}
                                    onChange={e => setConfig({ ...config, notify_email: e.target.value })}
                                    placeholder="e.g. manager@station.co.ke"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Notification Phone (SMS)</label>
                                <input
                                    type="text"
                                    value={config.notify_phone || ''}
                                    onChange={e => setConfig({ ...config, notify_phone: e.target.value })}
                                    placeholder="e.g. +254 700 000 000"
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        {/* Notification toggles */}
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '12px' }}>
                            Notify on:
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {[
                                { key: 'notify_on_low_stock', label: '⛽ Low stock warning' },
                                { key: 'notify_on_high_water', label: '💧 High water warning' },
                                { key: 'notify_on_reading_gap', label: '📡 Reading gap alert' },
                                { key: 'notify_on_delivery_flagged', label: '🚚 Delivery flagged' },
                            ].map(item => (
                                <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 14px', background: config[item.key] ? '#eafaf1' : '#f8f8f8', borderRadius: '8px', border: `1px solid ${config[item.key] ? '#a9dfbf' : '#e0e0e0'}` }}>
                                    <input
                                        type="checkbox"
                                        checked={config[item.key] || false}
                                        onChange={e => setConfig({ ...config, [item.key]: e.target.checked })}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '13px', color: '#1a1a2e' }}>{item.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Save button */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ padding: '11px 28px', background: saving ? '#888' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600' }}
                    >
                        {saving ? 'Saving...' : '💾 Save Alert Configuration'}
                    </button>
                </>
            )}

            {!selectedStation && !loading && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>No station selected</div>
                    <div style={{ fontSize: '13px', color: '#888' }}>Select a station above to configure its alerts.</div>
                </div>
            )}
        </div>
    );
}