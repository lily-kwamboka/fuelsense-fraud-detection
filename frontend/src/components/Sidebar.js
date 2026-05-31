import React from 'react';

const navItems = [
  { id: 'dashboard',      icon: '📊', label: 'Dashboard' },
  { id: 'deliveries',     icon: '🚚', label: 'Deliveries' },
  { id: 'reconciliation', icon: '📋', label: 'Reconciliation' },
  { id: 'reports',        icon: '📈', label: 'Reports' },
  { id: 'audit',          icon: '🔍', label: 'Audit Log' },
  { id: 'shifts',      icon: '⏱',  label: 'Shifts' },
  { id: 'pump-vs-dip', icon: '🔢', label: 'Pump vs Dip' },
  { id: 'alerts',      icon: '🔔', label: 'Alerts' },
  { id: 'pricing',        icon: '💳', label: 'Billing' },
];

function Sidebar({ activeTab, setActiveTab, darkMode, setDarkMode, user, onSignOut }) {
  return (
    <div style={{ ...styles.sidebar, background: darkMode ? '#0f0f1a' : '#1a1a2e' }}>

      {/* Logo */}
      <div style={styles.logoSection}>
        <div style={styles.logoIcon}>⛽</div>
        <div>
          <div style={styles.logoTitle}>FuelSense</div>
          <div style={styles.logoSub}>Mafuta Salama</div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={styles.nav}>
        {navItems.map(item => (
          <button
            key={item.id}
            style={{
              ...styles.navItem,
              background: activeTab === item.id
                ? 'rgba(255,255,255,0.12)'
                : 'transparent',
              borderLeft: activeTab === item.id
                ? '3px solid #4CAF50'
                : '3px solid transparent',
            }}
            onClick={() => setActiveTab(item.id)}
          >
            <span style={styles.navIcon}>{item.icon}</span>
            <span style={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={styles.bottom}>
        {/* Dark mode toggle */}
        <button
          style={styles.themeBtn}
          onClick={() => setDarkMode(!darkMode)}
        >
          <span>{darkMode ? '☀️' : '🌙'}</span>
          <span style={styles.navLabel}>{darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* User info */}
        <div style={styles.userSection}>
          <div style={styles.avatar}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={styles.userInfo}>
            <div style={styles.userEmail}>{user?.email?.split('@')[0]}</div>
            <div style={styles.userRole}>Station Admin</div>
          </div>
          <button style={{ ...styles.signOutBtn, fontSize: '18px', padding: '6px' }} onClick={onSignOut} title="Sign out">
            ⏻
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  sidebar:     { width: '220px', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100 },
  logoSection: { display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  logoIcon:    { fontSize: '28px' },
  logoTitle:   { color: '#fff', fontSize: '16px', fontWeight: '700' },
  logoSub:     { color: '#4CAF50', fontSize: '11px', marginTop: '1px' },
  nav:         { flex: 1, padding: '16px 8px' },
  navItem:     { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', transition: 'all 0.2s' },
  navIcon:     { fontSize: '16px', width: '20px', textAlign: 'center' },
  navLabel:    { color: '#ccc', fontSize: '13px', fontWeight: '500' },
  bottom:      { padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' },
  themeBtn:    { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: '8px', cursor: 'pointer', marginBottom: '12px' },
  userSection: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' },
  avatar:      { width: '32px', height: '32px', borderRadius: '50%', background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 },
  userInfo:    { flex: 1, overflow: 'hidden' },
  userEmail:   { color: '#fff', fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userRole:    { color: '#888', fontSize: '10px', marginTop: '1px' },
  signOutBtn:  { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', padding: '4px' },
};

export default Sidebar;