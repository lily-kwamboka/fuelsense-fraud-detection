[200~import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Login from './pages/Login';
import Stations from './pages/Stations';
import Tanks from './pages/Tanks';
import Users from './pages/Users';
import Suppliers from './pages/Suppliers';
import Organizations from './pages/Organizations';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export { API };

// Super admins get the Organizations tab
const SUPER_ADMINS = ['bernicewakarindi@gmail.com', 'berwak18@gmail.com'];

const BASE_NAV = [
  { id: 'stations',      icon: '🏪', label: 'Stations' },
  { id: 'tanks',         icon: '🛢', label: 'Tanks' },
  { id: 'users',         icon: '👥', label: 'Users' },
  { id: 'suppliers',     icon: '🚚', label: 'Suppliers' },
];

const SUPER_ADMIN_NAV = [
  { id: 'organizations', icon: '🏢', label: 'Organizations' },
];

const ALLOWED_ROLES = ['admin', 'owner', 'headquarters', 'station_manager'];

export default function App() {
  const [session,      setSession]      = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [activeTab,    setActiveTab]    = useState('stations');
  const [userProfile,  setUserProfile]  = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

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
    const email = session.user?.email || '';
    setIsSuperAdmin(SUPER_ADMINS.includes(email));

    fetch(`${API}/api/user-profile?uid=${session.user.id}`)
      .then(r => r.json())
      .then(profile => {
        setUserProfile(profile);
        // Super admins always get access regardless of role
        if (!SUPER_ADMINS.includes(email) && !ALLOWED_ROLES.includes(profile.role)) {
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

  const navItems = isSuperAdmin
    ? [...SUPER_ADMIN_NAV, ...BASE_NAV]
    : BASE_NAV;

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
          <button onClick={handleSignOut} style={{ padding: '10px 24px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
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
            <div style={{ color: '#e74c3c', fontSize: '11px' }}>
              {isSuperAdmin ? 'Super Admin' : 'Admin Portal'}
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 8px' }}>
          {/* Super Admin section */}
          {isSuperAdmin && (
            <>
              <div style={{ fontSize: '10px', color: '#555', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 12px 4px' }}>
                Super Admin
              </div>
              {SUPER_ADMIN_NAV.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '11px 12px', border: 'none', borderRadius: '8px',
                    cursor: 'pointer', marginBottom: '4px',
                    background: activeTab === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                    borderLeft: activeTab === item.id ? '3px solid #4CAF50' : '3px solid transparent',
                  }}
                >
                  <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                  <span style={{ color: activeTab === item.id ? '#4CAF50' : '#ccc', fontSize: '13px', fontWeight: '500' }}>{item.label}</span>
                </button>
              ))}
              <div style={{ fontSize: '10px', color: '#555', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 12px 4px', marginTop: '8px' }}>
                Station Management
              </div>
            </>
          )}

          {/* Regular nav items */}
          {BASE_NAV.map(item => (
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
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isSuperAdmin ? '#4CAF50' : '#e74c3c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
              {session.user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.user?.email?.split('@')[0]}
              </div>
              <div style={{ color: isSuperAdmin ? '#4CAF50' : '#e74c3c', fontSize: '10px' }}>
                {isSuperAdmin ? 'SUPER ADMIN' : (userProfile?.role?.toUpperCase() || 'ADMIN')}
              </div>
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
              {[...BASE_NAV, ...SUPER_ADMIN_NAV].find(n => n.id === activeTab)?.icon}{' '}
              {[...BASE_NAV, ...SUPER_ADMIN_NAV].find(n => n.id === activeTab)?.label}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>FuelSense Admin Portal</div>
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {activeTab === 'organizations' && isSuperAdmin && <Organizations api={API} session={session} />}
        {activeTab === 'stations'      && <Stations      api={API} session={session} />}
        {activeTab === 'tanks'         && <Tanks         api={API} session={session} />}
        {activeTab === 'users'         && <Users         api={API} session={session} />}
        {activeTab === 'suppliers'     && <Suppliers     api={API} session={session} />}
      </div>
    </div>
  );
}~EOF
