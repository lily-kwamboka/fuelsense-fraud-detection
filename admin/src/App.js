import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Login from './pages/Login';
import Stations from './pages/Stations';
import Tanks from './pages/Tanks';
import Users from './pages/Users';
import Suppliers from './pages/Suppliers';
import AlertConfig from './pages/AlertConfig';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* Nothing */

export { API };

const navItems = [
  { id: 'stations', icon: '🏪', label: 'Stations' },
  { id: 'tanks', icon: '🛢', label: 'Tanks' },
  { id: 'users', icon: '👥', label: 'Users' },
  { id: 'suppliers', icon: '🚚', label: 'Suppliers' },
  { id: 'alertconfig', icon: '🔔', label: 'Alerts' }
];

const ALLOWED_ROLES = ['admin', 'owner', 'headquarters', 'station_manager'];

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stations');
  const [userProfile, setUserProfile] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

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

  useEffect(() => {
    if (!session) return;
    fetch(`${API}/api/user-profile?uid=${session.user.id}`)
      .then(r => r.json())
      .then(profile => {
        setUserProfile(profile);
        if (!ALLOWED_ROLES.includes(profile.role)) {
          setAccessDenied(true);
        }
      })
      .catch(err => console.error('Failed to load profile:', err));
  }, [session]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⛽</div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>Loading FuelSense Admin...</div>
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Access Denied</div>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '24px' }}>You need admin privileges to access this portal.</div>
          <button
            onClick={handleSignOut}
            style={{ padding: '10px 24px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f5', fontFamily: 'system-ui, sans-serif' }}>

      {/* Sidebar */}
      <div style={{ width: '220px', minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, bottom: 0 }}>
        <div style={{ padding: '24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>⛽</span>
          <div>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>FuelSense</div>
            <div style={{ color: '#e74c3c', fontSize: '11px' }}>Admin Portal</div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 8px' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '11px 12px', border: 'none', borderRadius: '8px',
                cursor: 'pointer', marginBottom: '4px',
                background: activeTab === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                borderLeft: activeTab === item.id ? '3px solid #e74c3c' : '3px solid transparent',
              }}
            >
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
              <span style={{ color: '#ccc', fontSize: '13px', fontWeight: '500' }}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e74c3c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
              {session.user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.user?.email?.split('@')[0]}
              </div>
              <div style={{ color: '#e74c3c', fontSize: '10px' }}>{userProfile?.role?.toUpperCase() || 'ADMIN'}</div>
            </div>
            <button onClick={handleSignOut} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }} title="Sign out">⏻</button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '220px', flex: 1, padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>
              {navItems.find(n => n.id === activeTab)?.icon} {navItems.find(n => n.id === activeTab)?.label}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>FuelSense Admin Portal</div>
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {activeTab === 'stations' && <Stations api={API} />}
        {activeTab === 'tanks' && <Tanks api={API} />}
        {activeTab === 'users' && <Users api={API} />}
        {activeTab === 'suppliers' && <Suppliers api={API} />}
        {activeTab === 'alertconfig' && <AlertConfig api={API} />}
      </div>
    </div>
  );
}
