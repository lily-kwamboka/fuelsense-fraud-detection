import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import TankGauge from './components/TankGauge';
import TankChart from './components/TankChart';
import DeliveryForm from './components/DeliveryForm';
import DeliveryTimeline from './components/DeliveryTimeline';
import DeliveryList from './components/DeliveryList';
import ReconciliationTable from './components/ReconciliationTable';
import PumpSalesForm from './components/PumpSalesForm';
import Reports from './components/Reports';
import useIsMobile from './useIsMobile';
import { useToast } from './Toast';

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
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const [stations,       setStations]      = useState([]);
  const [activeStation,  setActiveStation] = useState(null);
  const [userProfile,    setUserProfile]   = useState(null);

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

  async function loadUserProfile() {
    if (!session) return;
    try {
      const res = await fetch(API + '/api/user-profile?uid=' + session.user.id);
      const profile = await res.json();
      setUserProfile(profile);
      return profile;
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  }

  async function loadStations(profile) {
    try {
      const uid = session?.user?.id || '';
      const res = await fetch(API + '/api/stations?uid=' + uid);
      const data = await res.json();
      setStations(data);
      if (data.length > 0 && !activeStation) {
        setActiveStation(data[0].id);
      }
      return data;
    } catch (err) {
      console.error('Failed to load stations:', err);
    }
  }

  async function loadData() {
    try {
      const uid = session?.user?.id || '';
      const stationParam = activeStation ? '?station_id=' + activeStation + '&uid=' + uid : '?uid=' + uid;

      const [t, d, r] = await Promise.all([
        fetch(API + '/api/tanks' + stationParam).then(res => res.json()),
        fetch(API + '/api/deliveries' + stationParam).then(res => res.json()),
        fetch(API + '/api/reconciliation' + stationParam).then(res => res.json()),
      ]);
      
      setTanks(Array.isArray(t) ? t : []);
      setDeliveries(Array.isArray(d) ? d : []);
      setRecon(Array.isArray(r) ? r : []);
      setLastUpdated(new Date().toLocaleTimeString());

      // Alerts for low stock
      if (Array.isArray(t)) {
        t.filter(tank => parseFloat(tank.fill_pct) < 20).forEach(tank => {
          addToast(`Tank ${tank.tank_number} (${tank.fuel_type?.toUpperCase() || 'Unknown'}) is critically low — ${parseFloat(tank.fill_pct).toFixed(1)}%`, 'warning', 6000);
        });
        
        // Alerts for high water
        t.filter(tank => parseFloat(tank.water_mm) > 50).forEach(tank => {
          addToast(`Tank ${tank.tank_number} has high water — ${tank.water_mm}mm`, 'error', 6000);
        });
      }
      
      // Alerts for flagged deliveries
      if (Array.isArray(d)) {
        d.filter(del => del.status === 'flagged').forEach(del => {
          addToast(`Delivery ${del.bol_number} is flagged — variance exceeds tolerance.`, 'error', 6000);
        });
      }

    } catch (err) {
      console.error('Failed to load data:', err);
      addToast('Failed to load data. Check your connection.', 'error', 5000);
    }
  }

  // Initialize user profile and stations when session loads
  useEffect(() => {
    if (session) {
      const init = async () => {
        const profile = await loadUserProfile();
        await loadStations(profile);
      };
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Load data when session and activeStation are available
  useEffect(() => {
    if (session && activeStation) {
      loadData();
      const interval = setInterval(loadData, 60000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeStation]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const colors = {
    bg:      darkMode ? '#0f0f1a' : '#f0f2f5',
    card:    darkMode ? '#1e1e2e' : '#ffffff',
    text:    darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888'    : '#666',
    border:  darkMode ? '#2a2a3e' : '#e0e0e0',
  };

  const mainStyle = {
    marginLeft:    isMobile ? '0' : '220px',
    flex:          1,
    minHeight:     '100vh',
    paddingBottom: isMobile ? '70px' : '0',
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

      {/* Sidebar — desktop only */}
      {!isMobile && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          user={session.user}
          onSignOut={handleSignOut}
        />
      )}

      {/* Bottom nav — mobile only */}
      {isMobile && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          darkMode={darkMode}
        />
      )}

      {/* Main content */}
      <div style={mainStyle}>

        {/* Top bar */}
        <div style={{ ...styles.topBar, background: colors.card, borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ ...styles.pageTitle, color: colors.text, fontSize: isMobile ? '16px' : '18px' }}>
              {activeTab === 'dashboard'      && '📊 Live Dashboard'}
              {activeTab === 'deliveries'     && '🚚 Deliveries'}
              {activeTab === 'reconciliation' && '📋 Reconciliation'}
              {activeTab === 'reports'        && '📈 Reports'}
            </div>
            {!isMobile && stations.length > 1 && (
              <select
                value={activeStation || ''}
                onChange={e => setActiveStation(e.target.value)}
                style={{ fontSize: '12px', color: colors.subtext, background: 'transparent', border: 'none', cursor: 'pointer', marginTop: '4px', outline: 'none' }}
              >
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {!isMobile && stations.length === 1 && (
              <div style={{ fontSize: '12px', color: colors.subtext, marginTop: '2px' }}>
                {stations[0]?.name} — Nairobi
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {lastUpdated && !isMobile && (
              <div style={{ fontSize: '12px', color: colors.subtext }}>
                Updated {lastUpdated}
              </div>
            )}
            {userProfile && (
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '99px',
                background: userProfile.role === 'admin' ? '#e8f4fd' : '#eafaf1',
                color: userProfile.role === 'admin' ? '#1a5276' : '#1e8449',
                fontWeight: '600',
              }}>
                {userProfile.role?.toUpperCase()}
              </span>
            )}
            <button
              style={{ ...styles.refreshBtn, background: darkMode ? '#2a2a3e' : '#f0f2f5', color: colors.text }}
              onClick={loadData}
            >
              ↻
            </button>
            {isMobile && (
              <button
                style={{ ...styles.refreshBtn, background: darkMode ? '#2a2a3e' : '#f0f2f5', color: colors.text }}
                onClick={handleSignOut}
              >
                ⏻
              </button>
            )}
          </div>
        </div>

        {/* Page content */}
        <div style={{ ...styles.content, padding: isMobile ? '12px' : '24px' }}>

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <div>
              {Array.isArray(tanks) && tanks.filter(t => parseFloat(t.fill_pct) < 20).map(t => (
                <div key={t.id} style={styles.alertRed}>
                  🚨 <strong>Tank {t.tank_number}</strong> critically low — {parseFloat(t.fill_pct).toFixed(1)}%
                </div>
              ))}
              {Array.isArray(tanks) && tanks.filter(t => parseFloat(t.water_mm) > 50).map(t => (
                <div key={t.id} style={styles.alertAmber}>
                  ⚠️ <strong>Tank {t.tank_number}</strong> high water — {t.water_mm}mm
                </div>
              ))}

              {/* Summary cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: isMobile ? '8px' : '16px',
                marginBottom: '24px',
              }}>
                <SummaryCard label="Total NSV"       value={Array.isArray(tanks) ? tanks.reduce((s, t) => s + parseFloat(t.nsv_litres || 0), 0).toFixed(0) + ' L' : '0 L'} icon="⛽" color="#4CAF50" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
                <SummaryCard label="Active Tanks"    value={Array.isArray(tanks) ? tanks.length + ' tanks' : '0 tanks'} icon="🛢" color="#3498db" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
                <SummaryCard label="Deliveries"      value={(Array.isArray(deliveries) ? deliveries.length : 0) + ' total'} icon="🚚" color="#f39c12" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
                <SummaryCard label="Avg Temp"        value={Array.isArray(tanks) && tanks.length ? (tanks.reduce((s, t) => s + parseFloat(t.temperature_c || 0), 0) / tanks.length).toFixed(1) + ' °C' : '—'} icon="🌡" color="#e74c3c" bg={colors.card} text={colors.text} sub={colors.subtext} mobile={isMobile} />
              </div>

              {/* Tank gauges */}
              <div style={{ ...styles.sectionHeader }}>
                <div style={{ ...styles.sectionTitle, color: colors.text }}>Live Tank Levels</div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
              }}>
                {Array.isArray(tanks) && tanks.map(tank => (
                  <TankGauge key={tank.id} tank={tank} darkMode={darkMode} />
                ))}
              </div>

              {/* Charts */}
              {!isMobile && Array.isArray(tanks) && tanks.length > 0 && (
                <>
                  <div style={{ ...styles.sectionHeader, marginTop: '24px' }}>
                    <div style={{ ...styles.sectionTitle, color: colors.text }}>NSV Trends — Last Hour</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
                    {tanks.map(tank => (
                      <TankChart key={tank.id} tank={tank} api={API} darkMode={darkMode} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── DELIVERIES ── */}
          {activeTab === 'deliveries' && (
            <div>
              <div style={styles.rowBetween}>
                <div style={{ ...styles.sectionTitle, color: colors.text }}>Delivery Records</div>
                <button style={styles.newBtn} onClick={() => setShowForm(!showForm)}>
                  {showForm ? '✕' : '+ New'}
                </button>
              </div>
              {showForm && (
                <DeliveryForm
                  tanks={tanks}
                  onSuccess={() => { setShowForm(false); loadData(); }}
                  api={API}
                  stationId={activeStation}
                />
              )}

              {Array.isArray(deliveries) && deliveries.filter(d => !['confirmed', 'flagged'].includes(d.status)).length > 0 && (
                <div>
                  <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '12px' }}>
                    🔄 Active Deliveries
                  </div>
                  {deliveries
                    .filter(d => !['confirmed', 'flagged'].includes(d.status))
                    .map(d => (
                      <DeliveryTimeline key={d.id} delivery={d} darkMode={darkMode} />
                    ))}
                </div>
              )}

              <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '12px', marginTop: '24px' }}>
                📋 Delivery History
              </div>
              {Array.isArray(deliveries) && deliveries.filter(d => ['confirmed', 'flagged'].includes(d.status)).length > 0 ? (
                deliveries
                  .filter(d => ['confirmed', 'flagged'].includes(d.status))
                  .map(d => (
                    <DeliveryTimeline key={d.id} delivery={d} darkMode={darkMode} />
                  ))
              ) : (
                <DeliveryList deliveries={deliveries} />
              )}
            </div>
          )}

          {/* ── RECONCILIATION ── */}
          {activeTab === 'reconciliation' && (
            <div>
              <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '16px' }}>Daily Reconciliation</div>
              <PumpSalesForm tanks={tanks} api={API} onSuccess={loadData} stationId={activeStation} />
              <ReconciliationTable data={reconciliation} />
            </div>
          )}

          {/* ── REPORTS ── */}
          {activeTab === 'reports' && (
            <div>
              <div style={{ ...styles.sectionTitle, color: colors.text, marginBottom: '16px' }}>📈 Reports & Exports</div>
              <Reports
                deliveries={deliveries}
                reconciliation={reconciliation}
                tanks={tanks}
                darkMode={darkMode}
                stationId={activeStation}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color, bg, text, sub, mobile }) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: mobile ? '14px' : '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: mobile ? '11px' : '13px', color: sub, marginBottom: '6px' }}>{label}</div>
          <div style={{ fontSize: mobile ? '16px' : '22px', fontWeight: '700', color }}>{value}</div>
        </div>
        <div style={{ fontSize: mobile ? '20px' : '28px' }}>{icon}</div>
      </div>
    </div>
  );
}

const styles = {
  topBar:       { padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 },
  pageTitle:    { fontSize: '18px', fontWeight: '700' },
  refreshBtn:   { padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  content:      { padding: '24px' },
  sectionHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '15px', fontWeight: '600' },
  rowBetween:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  newBtn:       { background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  alertRed:     { background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px' },
  alertAmber:   { background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '10px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px' },
  emptyState:   { borderRadius: '12px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
};

export default App;