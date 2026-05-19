import React, { useState, useEffect } from 'react';
import TankCard from './components/TankCard';
import DeliveryForm from './components/DeliveryForm';
import DeliveryList from './components/DeliveryList';
import ReconciliationTable from './components/ReconciliationTable';
import PumpSalesForm from './components/PumpSalesForm';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [tanks, setTanks]               = useState([]);
  const [deliveries, setDeliveries]     = useState([]);
  const [reconciliation, setRecon]      = useState([]);
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [showForm, setShowForm]         = useState(false);

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
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>⛽ FuelSense</div>
          <div style={styles.headerSub}>FuelSense Demo Station — Nairobi</div>
        </div>
        <div style={styles.headerRight}>
          {lastUpdated && <span style={styles.updated}>Updated {lastUpdated}</span>}
          <button style={styles.refreshBtn} onClick={loadData}>↻ Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['dashboard', 'deliveries', 'reconciliation'].map(tab => (
          <button
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>

        {activeTab === 'dashboard' && (
          <div>
            {/* Low stock alerts */}
            {tanks.filter(t => parseFloat(t.fill_pct) < 20).map(t => (
              <div key={t.id} style={styles.alertBanner}>
                🚨 <strong>Tank {t.tank_number} ({t.fuel_type.toUpperCase()})</strong> is low —
                only {parseFloat(t.fill_pct).toFixed(1)}% remaining
                ({parseFloat(t.nsv_litres).toFixed(0)}L). Order fuel immediately.
              </div>
            ))}

            {/* High water alerts */}
            {tanks.filter(t => parseFloat(t.water_mm) > 50).map(t => (
              <div key={t.id} style={styles.alertBannerWater}>
                ⚠️ <strong>Tank {t.tank_number} ({t.fuel_type.toUpperCase()})</strong> has
                high water level — {t.water_mm}mm. Inspect immediately.
              </div>
            ))}

            <div style={styles.sectionTitle}>Live Tank Levels</div>
            <div style={styles.tankGrid}>
              {tanks.map(tank => (
                <TankCard key={tank.id} tank={tank} />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'deliveries' && (
          <div>
            <div style={styles.rowBetween}>
              <div style={styles.sectionTitle}>Deliveries</div>
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
            <div style={styles.sectionTitle}>Daily Reconciliation</div>
            <PumpSalesForm
              tanks={tanks}
              api={API}
              onSuccess={loadData}
            />
            <ReconciliationTable data={reconciliation} />
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  app:          { fontFamily: 'system-ui, sans-serif', background: '#f0f2f5', minHeight: '100vh' },
  header:       { background: '#1a1a2e', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:  { fontSize: '22px', fontWeight: '600' },
  headerSub:    { fontSize: '13px', color: '#aaa', marginTop: '2px' },
  headerRight:  { display: 'flex', alignItems: 'center', gap: '12px' },
  updated:      { fontSize: '12px', color: '#aaa' },
  refreshBtn:   { background: '#2d2d4e', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  tabs:         { background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '0 24px', display: 'flex', gap: '4px' },
  tab:          { padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: '#666', borderBottom: '2px solid transparent' },
  tabActive:    { color: '#1a1a2e', borderBottom: '2px solid #1a1a2e', fontWeight: '600' },
  content:      { padding: '24px' },
  sectionTitle: { fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' },
  tankGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  rowBetween:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  newBtn:          { background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  alertBanner:     { background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
  alertBannerWater:{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '12px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' },
};

export default App;
