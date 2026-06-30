import React, { useState, useEffect } from 'react';

const STATUS_COLORS = {
  active:  { bg: '#eafaf1', text: '#1e8449' },
  trial:   { bg: '#fef9e7', text: '#7d6608' },
  expired: { bg: '#fdecea', text: '#922b21' },
};

export default function Organizations({ api, session }) {
  const [orgs,    setOrgs]    = useState([]);
  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm,setShowForm]= useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [detail,  setDetail]  = useState(null);
  const [form,    setForm]    = useState({
    name: '', slug: '', owner_email: '', plan_id: '', max_stations: 1, max_tanks: 5,
  });

  const adminEmail = session?.user?.email || '';

  async function loadOrgs() {
    setLoading(true);
    try {
      const [orgsRes, plansRes] = await Promise.all([
        fetch(`${api}/api/admin/organizations?admin_email=${encodeURIComponent(adminEmail)}`),
        fetch(`${api}/api/plans`),
      ]);
      const orgsData  = await orgsRes.json();
      const plansData = await plansRes.json();
      setOrgs(Array.isArray(orgsData)  ? orgsData  : []);
      setPlans(Array.isArray(plansData) ? plansData : []);
    } catch (err) {
      console.error('Failed to load orgs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(orgId) {
    try {
      const res  = await fetch(`${api}/api/admin/organizations/${orgId}?admin_email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error('Failed to load org detail:', err);
    }
  }

  useEffect(() => { if (adminEmail) loadOrgs(); }, [adminEmail]);

  function openAdd() {
    setForm({ name: '', slug: '', owner_email: '', plan_id: plans[0]?.id || '', max_stations: 1, max_tanks: 5 });
    setError('');
    setShowForm(true);
  }

  function handlePlanChange(planId) {
    const plan = plans.find(p => p.id === planId);
    setForm(f => ({ ...f, plan_id: planId, max_stations: plan?.max_stations ?? 1, max_tanks: plan?.max_tanks ?? 5 }));
  }

  async function handleCreate() {
    if (!form.name.trim())        { setError('Organization name is required.'); return; }
    if (!form.owner_email.trim()) { setError('Owner email is required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${api}/api/admin/organizations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, admin_email: adminEmail }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setShowForm(false);
      loadOrgs();
      alert(`✅ ${data.message}`);
    } catch (err) {
      setError('Failed to create organization.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#f8f8f8' };
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (detail) {
    const { organization: org, stations, users } = detail;
    return (
      <div>
        <button onClick={() => setDetail(null)} style={{ marginBottom: '20px', background: 'none', border: 'none', color: '#1a1a2e', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          ← Back to Organizations
        </button>
        <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '24px', marginBottom: '20px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>🏢 {org.name}</div>
              <div style={{ fontSize: '13px', color: '#aaa' }}>{org.owner_email}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>ID: {org.id}</div>
            </div>
            <span style={{ ...(STATUS_COLORS[org.subscription_status] || STATUS_COLORS.trial), padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
              {org.subscription_status?.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '20px' }}>
            {[
              { label: 'Plan',         value: org.plan_name || 'Trial' },
              { label: 'Max Stations', value: org.max_stations === -1 ? 'Unlimited' : org.max_stations },
              { label: 'Max Tanks',    value: org.max_tanks    === -1 ? 'Unlimited' : org.max_tanks },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#4CAF50' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '14px' }}>🏪 Stations ({stations?.length || 0})</div>
          {!stations?.length ? <div style={{ fontSize: '13px', color: '#888' }}>No stations yet.</div> :
            stations.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{s.name}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{s.location || 'No location'}</div>
                </div>
                <div style={{ fontSize: '11px', color: '#bbb', alignSelf: 'center' }}>{s.id?.substring(0, 8)}...</div>
              </div>
            ))
          }
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '14px' }}>👥 Users ({users?.length || 0})</div>
          {!users?.length ? <div style={{ fontSize: '13px', color: '#888' }}>No users yet.</div> :
            users.map(u => (
              <div key={u.supabase_uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{u.full_name || u.email}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{u.email}</div>
                </div>
                <span style={{ background: '#f0f0f0', color: '#555', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                  {u.role?.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
            ))
          }
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', color: '#666' }}>{orgs.length} organization{orgs.length !== 1 ? 's' : ''}</div>
        <button onClick={openAdd} style={{ padding: '9px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          + Onboard Client
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>🏢 Onboard New Client Organization</div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Creates the org. Invite the owner via Supabase Auth separately.</div>
          {error && <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Organization Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rubis Energy Kenya" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Owner Email *</label>
              <input type="email" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} placeholder="e.g. ceo@rubisenergy.co.ke" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Slug</label>
              <input type="text" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="e.g. rubis-energy" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Plan</label>
              <select value={form.plan_id} onChange={e => handlePlanChange(e.target.value)} style={inputStyle}>
                <option value="">Trial (no plan)</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} — KES {p.price_monthly}/mo</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max Stations</label>
              <input type="number" value={form.max_stations} onChange={e => setForm({ ...form, max_stations: parseInt(e.target.value) })} min="1" style={inputStyle} />
            </div>
          </div>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#0369a1', marginBottom: '16px' }}>
            ℹ️ After creating the org, go to <strong>Supabase Auth → Invite User</strong> and invite the owner email. Then update their <code>user_profiles</code> row: set <code>role = 'owner'</code> and <code>organization_id</code> to the new org's ID.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleCreate} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#888' : '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
              {saving ? 'Creating...' : 'Create Organization'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading organizations...</div>
      ) : orgs.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a1a2e', marginBottom: '8px' }}>No client organizations yet</div>
          <div style={{ fontSize: '13px', color: '#888' }}>Click "Onboard Client" to add your first paying customer.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orgs.map(org => {
            const sc = STATUS_COLORS[org.subscription_status] || STATUS_COLORS.trial;
            return (
              <div key={org.id} onClick={() => loadDetail(org.id)}
                style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                onMouseOut={e  => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>🏢 {org.name}</div>
                    <span style={{ ...sc, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                      {org.subscription_status?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#888' }}>
                    {org.owner_email} &nbsp;·&nbsp;
                    <span style={{ color: '#3498db' }}>{org.station_count || 0} stations</span> &nbsp;·&nbsp;
                    <span style={{ color: '#8e44ad' }}>{org.user_count || 0} users</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#bbb', marginTop: '4px' }}>
                    Created {new Date(org.created_at).toLocaleDateString('en-KE')} · ID: {org.id?.substring(0, 8)}...
                  </div>
                </div>
                <div style={{ color: '#888', fontSize: '18px' }}>→</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
