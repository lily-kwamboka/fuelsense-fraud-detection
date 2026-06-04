import React from 'react';

function AccessDenied({ darkMode, stationName }) {
  const colors = {
    text: darkMode ? '#e0e0e0' : '#1a1a2e',
    subtext: darkMode ? '#888' : '#666',
    card: darkMode ? '#1e1e2e' : '#ffffff',
  };

  return (
    <div style={{
      maxWidth: '500px',
      margin: '100px auto',
      padding: '40px',
      background: colors.card,
      borderRadius: '16px',
      textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔒</div>
      <h2 style={{ color: '#e74c3c', marginBottom: '10px' }}>Access Denied</h2>
      <p style={{ color: colors.text, marginBottom: '5px' }}>
        Your subscription for <strong>{stationName}</strong> has expired.
      </p>
      <p style={{ color: colors.subtext, fontSize: '14px', marginBottom: '20px' }}>
        Please renew your subscription to continue using FuelSense features.
      </p>
      <button
        onClick={() => window.location.href = '/?tab=pricing'}
        style={{
          background: '#4CAF50',
          color: '#fff',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600'
        }}
      >
        Renew Subscription
      </button>
    </div>
  );
}

export default AccessDenied;