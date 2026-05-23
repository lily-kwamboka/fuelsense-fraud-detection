import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Login from './components/Login';
import TankCard from './components/TankCard';
import DeliveryForm from './components/DeliveryForm';
import DeliveryList from './components/DeliveryList';
import ReconciliationTable from './components/ReconciliationTable';
import PumpSalesForm from './components/PumpSalesForm';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [session,        setSession]       = useState(null);
  const [authLoading,    setAuthLoading]   = useState(true);
  const [tanks,          setTanks]         = useState([]);
  const [deliveries,     setDeliveries]    = useState([]);
  const [reconciliation, setRecon]         = useState([]);
  const [activeTab,      setActiveTab]     = useState('dashboard');
  const [lastUpdated,    setLastUpdated]   = useState(null);
  const [showForm,       setShowForm]      = useState(false);
  const [darkMode,       setDarkMode]      = useState(false);

  // Auth listener
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
    bg:        darkMode ? '#0f0f1a' : '#f0f2f5',
    header:    darkMode ? '#1a1a2e' : '#1a1a2e',
    card:      darkMode ? '#1e1e2e' : '#ffffff',
    text:      darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext:   darkMode ? '#888' : '#666',
    border:    darkMode ? '#2a2a3e' : '#e0e0e0',
    tabBg:     darkMode ? '#1a1a2e' : '#ffffff',
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
        <div style={{ color: '#fff', fontSize: '18px' }}>⛽ Loading FuelSense...</div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div style={{ ...styles.app, background: colors.bg }}>

      {/* Header */}
      <div style={{ ...styles.header, background: colors.header }}>
        <div>
          <div style={styles.headerTitle}>⛽ FuelSense</div>
          <div style={styles.headerSub}>FuelSense Demo Station — Nairobi</div>
        </div>
        <div style={styles.headerRight}>
          {lastUpdated && <span style={styles.updated}>Updated {lastUpdated}</span>}
          <button style={styles.iconBtn} onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button style={styles.refreshBtn} onClick={loadData}>↻ Refresh</button>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>
              {session.user.email[0].toUpperCase()}
            </div>
            <button style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ ...styles.tabs, background: colors.tabBg, borderBottom: `1px solid ${colors.border}` }}>
        {['dashboard', 'deliveries', 'reconciliation'].map(tab => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              color: activeTab === tab ? colors.text : colors.subtext,
              borderBottom: activeTab === tab ? `2px solid #1a1a2e` : '2px solid transparent',
              fontWeight: activeTab === tab ? '600' : '400',
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'dashboard'      && '📊 '}
            {tab === 'deliveries'     && '🚚 '}
            {tab === 'reconciliation' && '📋 '}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>

        {activeTab === 'dashboard' && (
          <div>
            {tanks.filter(t => parseFloat(t.fill_pct) < 20).map(t => (
              <div key={t.id} style={styles.alertBanner}>
                🚨 <strong>Tank {t.tank_number} ({t.fuel_type.toUpperCase()})</strong> is low —
                only {parseFloat(t.fill_pct).toFixed(1)}% remaining
                ({parseFloat(t.nsv_litres).toFixed(0)}L). Order fuel immediately.
              </div>
            ))}
            {tanks.filter(t => parseFloat(t.water_mm) > 50).map(t => (
              <div key={t.id} style={styles.alertBannerWater}>
                ⚠️ <strong>Tank {t.tank_number} ({t.fuel_type.toUpperCase()})</strong> has
                high water level — {t.water_mm}mm. Inspect immediately.
              </div>
            ))}
            <div style={{ ...styles.sectionTitle, color: colors.text }}>Live Tank Levels</div>
            <div style={styles.tankGrid}>
              {tanks.map(tank => (
                <TankCard key={tank.id} tank={tank} darkMode={darkMode} />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'deliveries' && (
          <div>
            <div style={styles.rowBetween}>
              <div style={{ ...styles.sectionTitle, color: colors.text }}>Deliveries</div>
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

        {activeTab === 'reconciliation' && (
          <div>
            <div style={{ ...styles.sectionTitle, color: colors.text }}>Daily Reconciliation</div>
            <PumpSalesForm tanks={tanks} api={API} onSuccess={loadData} />
            <ReconciliationTable data={reconciliation} />
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  app:              { fontFamily: 'system-ui, sans-serif', minHeight: '100vh' },
  header:           { color: '#fff', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:      { fontSize: '20px', fontWeight: '700' },
  headerSub:        { fontSize: '12px', color: '#aaa', marginTop: '2px' },
  headerRight:      { display: 'flex', alignItems: 'center', gap: '10px' },
  updated:          { fontSize: '11px', color: '#aaa' },
  iconBtn:          { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' },
  refreshBtn:       { background: '#2d2d4e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  userInfo:         { display: 'flex', alignItems: 'center', gap: '8px' },
  userAvatar:       { width: '32px', height: '32px', borderRadius: '50%', background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' },
  signOutBtn:       { background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  tabs:             { padding: '0 24px', display: 'flex', gap: '4px' },
  tab:              { padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' },
  content:          { padding: '24px' },
  sectionTitle:     { fontSize: '16px', fontWeight: '600', marginBottom: '16px' },
  tankGrid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  rowBetween:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  newBtn:           { background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  alertBanner:      { background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
  alertBannerWater: { background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
};

export default App;
