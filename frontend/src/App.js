import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import TankGauge from './components/TankGauge';
import TankChart from './components/TankChart';
import DeliveryForm from './components/DeliveryForm';
import DeliveryList from './components/DeliveryList';
import ReconciliationTable from './components/ReconciliationTable';
import PumpSalesForm from './components/PumpSalesForm';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [session,        setSession]     = useState(null);
  const [authLoading,    setAuthLoading] = useState(true);
  const [tanks,          setTanks]       = useState([]);
  const [deliveries,     setDeliveries]  = useState([]);
  const [reconciliation, setRecon]       = useState([]);
  const [activeTab,      setActiveTab]   = useState('dashboard');
  const [lastUpdated,    setLastUpdated] = useState(null);
  const [showForm,       setShowForm]    = useState(false);
  const [darkMode,       setDarkMode]    = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadData() {
    try {
      const [t, d, r] = await Promise.all([
        fetch(API + '/api/tanks').then(r => r.json()),
        fetch(API + '/api/deliveries').then(r => r.json()),
        fetch(API + '/api/reconciliation').then(r => r.json()),
      ]);
      setTanks(t);
      setDeliveries(d);
      setRecon(r);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  useEffect(() => {
    if (session) {
      loadData();
      const interval = setInterval(loadData, 60000);
      return () => clearInterval(interval);
    }
  }, [session]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const colors = {
    bg:       darkMode ? '#0f0f1a' : '#f0f2f5',
    card:     darkMode ? '#1e1e2e' : '#ffffff',
    text:     darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext:  darkMode ? '#888'    : '#666',
    border:   darkMode ? '#2a2a3e' : '#e0e0e0',
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⛽</div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>Loading FuelSense...</div>
          <div style={{ color: '#4CAF50', fontSize: '12px', marginTop: '8px' }}>Mafuta Salama</div>
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg, fontFamily: 'system-ui, sans-serif' }}>

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        user={session.user}
        onSignOut={handleSignOut}
      />

      {/* Main content */}
      <div style={{ marginLeft: '220px', flex: 1, minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{ ...styles.topBar, background: colors.card, borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ ...styles.pageTitle, color: colors.text }}>
              {activeTab === 'dashboard'      && '📊 Live Dashboard'}
              {activeTab === 'deliveries'     && '🚚 Deliveries'}
              {activeTab === 'reconciliation' && '📋 Reconciliation'}
              {activeTab === 'reports'        && '📈 Reports'}
            </div>
            <div style={{ fontSize: '12px', color: colors.subtext, marginTop: '2px' }}>
              FuelSense Demo Station — Nairobi
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lastUpdated && (
              <div style={{ fontSize: '12px', color: colors.subtext }}>
                Updated {lastUpdated}
              </div>
            )}
            <button
              style={{ ...styles.refreshBtn, background: darkMode ? '#2a2a3e' : '#f0f2f5', color: colors.text }}
              onClick={loadData}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={styles.content}>

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Alerts */}
              {tanks.filter(t => parseFloat(t.fill_pct) < 20).map(t => (
                <div key={t.id} style={styles.alertRed}>
                  🚨 <strong>Tank {t.tank_number} ({t.fuel_type.toUpperCase()})</strong> is critically low —
                  {parseFloat(t.fill_pct).toFixed(1)}% remaining ({parseFloat(t.nsv_litres).toFixed(0)}L). Order fuel immediately.
                </div>
              ))}
              {tanks.filter(t => parseFloat(t.water_mm) > 50).map(t => (
                <div key={t.id} style={styles.alertAmber}>
                  ⚠️ <strong>Tank {t.tank_number}</strong> has high water — {t.water_mm}mm. Inspect immediately.
                </div>
              ))}

              {/* Summary cards */}
              <div style={styles.summaryGrid}>
                <SummaryCard
                  label="Total NSV"
                  value={tanks.reduce((s, t) => s + parseFloat(t.nsv_litres || 0), 0).toFixed(0) + ' L'}
                  icon="⛽"
                  color="#4CAF50"
                  bg={colors.card}
                  text={colors.text}
                  sub={colors.subtext}
                />
                <SummaryCard
                  label="Active Tanks"
                  value={tanks.length + ' tanks'}
                  icon="🛢"
                  color="#3498db"
                  bg={colors.card}
                  text={colors.text}
                  sub={colors.subtext}
                />
                <SummaryCard
                  label="Deliveries"
                  value={(Array.isArray(deliveries) ? deliveries.length : 0) + ' total'}
                  icon="🚚"
                  color="#f39c12"
                  bg={colors.card}
                  text={colors.text}
                  sub={colors.subtext}
                />
                <SummaryCard
                  label="Avg Temperature"
                  value={tanks.length
                    ? (tanks.reduce((s, t) => s + parseFloat(t.temperature_c || 0), 0) / tanks.length).toFixed(1) + ' °C'
                    : '—'}
                  icon="🌡"
                  color="#e74c3c"
                  bg={colors.card}
                  text={colors.text}
                  sub={colors.subtext}
                />
              </div>

              {/* Tank gauges */}
              <div style={styles.sectionHeader}>
                <div style={{ ...styles.sectionTitle, color: colors.text }}>Live Tank Levels</div>
              </div>
              <div style={styles.gaugeGrid}>
                {tanks.map(tank => (
                  <TankGauge key={tank.id} tank={tank} darkMode={darkMode} />
                ))}
              </div>

              {/* Charts */}
              <div style={{ ...styles.sectionHeader, marginTop: '24px' }}>
                <div style={{ ...styles.sectionTitle, color: colors.text }}>NSV Trends — Last Hour</div>
              </div>
              <div style={styles.chartGrid}>
                {tanks.map(tank => (
                  <TankChart key={tank.id} tank={tank} api={API} darkMode={darkMode} />
                ))}
              </div>
            </div>
          )}

          {/* ── DELIVERIES ── */}
          {activeTab === 'deliveries' && (
            <div>
              <div style={styles.rowBetween}>
                <div style={{ ...styles.sectionTitle, color: colors.text }}>Delivery Records</div>
                <button style={styles.newBtn} onClick={() => setShowForm(!showForm)}>
                  {showForm ? '✕ Cancel' : '+ New Delivery'}
                </button>
              </div>
              {showForm && (
                <DeliveryForm
                  tanks={tanks}
                  onSuccess={() => { setShowForm(false); loadData(); }}
                  api={API}
                />
              )}
              <DeliveryList deliveries={deliveries} />
            </div>
          )}

          {/* ── RECONCILIATION ── */}
          {activeTab === 'reconciliation' && (
            <div>
              <div style={{ ...styles.sectionTitle, color: colors.text }}>Daily Reconciliation</div>
              <PumpSalesForm tanks={tanks} api={API} onSuccess={loadData} />
              <ReconciliationTable data={reconciliation} />
            </div>
          )}

          {/* ── REPORTS ── */}
          {activeTab === 'reports' && (
            <div>
              <div style={{ ...styles.sectionTitle, color: colors.text }}>Reports</div>
              <div style={{ ...styles.emptyState, background: colors.card, color: colors.subtext }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
                <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>Reports Coming Soon</div>
                <div style={{ fontSize: '13px' }}>Export delivery history, variance analysis, and stock reports to PDF and CSV.</div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color, bg, text, sub }) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', color: sub, marginBottom: '8px' }}>{label}</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color }}>{value}</div>
        </div>
        <div style={{ fontSize: '28px' }}>{icon}</div>
      </div>
    </div>
  );
}

const styles = {
  topBar:       { padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 },
  pageTitle:    { fontSize: '18px', fontWeight: '700' },
  refreshBtn:   { padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  content:      { padding: '24px' },
  summaryGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' },
  gaugeGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  chartGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' },
  sectionHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '15px', fontWeight: '600' },
  rowBetween:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  newBtn:       { background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  alertRed:     { background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
  alertAmber:   { background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
  emptyState:   { borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
};

export default App;
