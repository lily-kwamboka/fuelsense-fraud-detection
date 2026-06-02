import React, { useState, useEffect } from 'react';

function Pricing({ api, activeStation, session, darkMode }) {
  const [plans,        setPlans]        = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [billing,      setBilling]      = useState('monthly');
  const [loading,      setLoading]      = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [error,        setError]        = useState(null);
  const [testLoading,  setTestLoading]  = useState(false);

  const bg   = darkMode ? '#1e1e2e' : '#fff';
  const text = darkMode ? '#e0e0e0' : '#1a1a2e';
  const sub  = darkMode ? '#888'    : '#666';

  useEffect(() => {
    fetch(api + '/api/plans').then(r => r.json()).then(setPlans).catch(console.error);
    if (activeStation) {
      fetch(api + '/api/subscription?station_id=' + activeStation)
        .then(r => r.json()).then(setSubscription).catch(console.error);
    }
  }, [api, activeStation]);

  async function handleSubscribe(plan, isTest = false) {
    setLoading(true);
    setSelected(plan.id);
    setError(null);
    
    try {
      const payload = {
        station_id:    activeStation,
        plan_id:       plan.id,
        billing_cycle: billing,
        user_email:    session?.user?.email,
        user_name:     session?.user?.email?.split('@')[0],
      };
      
      // For test payment, override amount and force monthly billing
      if (isTest) {
        payload.test_amount = plan.price_monthly;
        payload.billing_cycle = 'monthly'; // Force monthly for test payments
      }
      
      console.log('[PRICING] Sending payload:', payload);
      
      const res = await fetch(api + '/api/payments/initiate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Payment initiation failed');
      }
      
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        alert('Payment error: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message);
      alert('Payment error: ' + err.message);
    }
    setLoading(false);
    setSelected(null);
  }

  // Direct test payment handler - UPDATED with real station ID
  async function handleDirectTest() {
    setTestLoading(true);
    setError(null);
    try {
      console.log('[PRICING] Sending direct test payment for KES 100');
      
      // Use the real station ID from your database
      const REAL_STATION_ID = "a0000000-0000-0000-0000-000000000001";
      
      const res = await fetch(api + '/api/payments/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: REAL_STATION_ID,  // Use real UUID from your database
          amount: 100,
          user_email: session?.user?.email,
          user_name: session?.user?.email?.split('@')[0],
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Direct test payment failed');
      }
      
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        alert('Error: ' + JSON.stringify(data));
      }
    } catch (err) {
      console.error('Direct test error:', err);
      setError(err.message);
      alert('Payment error: ' + err.message);
    }
    setTestLoading(false);
  }

  const statusColor = {
    trial:     '#f39c12',
    active:    '#27ae60',
    expired:   '#e74c3c',
    cancelled: '#95a5a6',
  };

  return (
    <div>
      {/* Error display */}
      {error && (
        <div style={{ ...styles.errorBox, marginBottom: '20px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Current subscription */}
      {subscription && (
        <div style={{ ...styles.subCard, background: bg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', color: sub }}>Current Plan</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: text, marginTop: '4px' }}>
                {subscription.plan_name}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: '600',
                background: (statusColor[subscription.status] || '#999') + '20',
                color: statusColor[subscription.status] || '#999',
              }}>
                {subscription.status.toUpperCase()}
              </span>
              {subscription.trial_ends_at && subscription.status === 'trial' && (
                <div style={{ fontSize: '12px', color: sub, marginTop: '6px' }}>
                  Trial ends: {new Date(subscription.trial_ends_at).toLocaleDateString()}
                </div>
              )}
              {subscription.current_period_end && subscription.status === 'active' && (
                <div style={{ fontSize: '12px', color: sub, marginTop: '6px' }}>
                  Renews: {new Date(subscription.current_period_end).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Billing toggle */}
      <div style={styles.toggleRow}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: text }}>Choose a Plan</div>
        <div style={styles.toggle}>
          <button
            style={{ ...styles.toggleBtn, background: billing === 'monthly' ? '#1a1a2e' : 'transparent', color: billing === 'monthly' ? '#fff' : sub }}
            onClick={() => setBilling('monthly')}
          >Monthly</button>
          <button
            style={{ ...styles.toggleBtn, background: billing === 'annual' ? '#1a1a2e' : 'transparent', color: billing === 'annual' ? '#fff' : sub }}
            onClick={() => setBilling('annual')}
          >
            Annual <span style={{ fontSize: '10px', color: '#4CAF50', fontWeight: '700' }}>SAVE 2 MONTHS</span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div style={styles.grid}>
        {plans.map((plan, i) => {
          const price    = billing === 'annual' ? plan.price_annual : plan.price_monthly;
          const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features;
          const isPopular = i === 1;

          return (
            <div key={plan.id} style={{
              ...styles.planCard,
              background:  bg,
              border:      isPopular ? '2px solid #4CAF50' : `1px solid ${darkMode ? '#2a2a3e' : '#e0e0e0'}`,
              position:    'relative',
            }}>
              {isPopular && (
                <div style={styles.popularBadge}>⭐ MOST POPULAR</div>
              )}

              <div style={{ fontSize: '18px', fontWeight: '700', color: text, marginBottom: '8px' }}>
                {plan.name}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '32px', fontWeight: '800', color: isPopular ? '#4CAF50' : text }}>
                  KES {parseInt(price).toLocaleString()}
                </span>
                <span style={{ fontSize: '13px', color: sub }}>
                  /{billing === 'annual' ? 'year' : 'month'}
                </span>
                {billing === 'annual' && (
                  <div style={{ fontSize: '12px', color: '#4CAF50', marginTop: '4px' }}>
                    KES {parseInt(plan.price_monthly * 10).toLocaleString()}/mo equivalent
                  </div>
                )}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', }}>
                {features?.map((f, fi) => (
                  <li key={fi} style={{ fontSize: '13px', color: sub, padding: '6px 0', borderBottom: `1px solid ${darkMode ? '#2a2a3e' : '#f0f0f0'}`, display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#4CAF50' }}>✓</span> {f}
                  </li>
                ))}
              </ul>

              <button
                style={{
                  ...styles.subscribeBtn,
                  background:  isPopular ? '#4CAF50' : '#1a1a2e',
                  opacity:     loading && selected === plan.id ? 0.7 : 1,
                }}
                onClick={() => handleSubscribe(plan, false)}
                disabled={loading}
              >
                {loading && selected === plan.id ? 'Redirecting...' : 'Subscribe — Pay with M-Pesa'}
              </button>

              <div style={{ fontSize: '11px', color: sub, textAlign: 'center', marginTop: '8px' }}>
                Visa · Mastercard · M-Pesa · Airtel Money
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', fontSize: '12px', color: sub, marginTop: '24px' }}>
        All plans include a 14-day free trial. Cancel anytime. Setup fee KES 25,000 applies.
      </div>

      {/* Test payment button — remove in production */}
      <div style={{ marginTop: '24px', padding: '16px', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#856404', marginBottom: '8px' }}>🧪 Test Payment (KES 100)</div>
        <div style={{ fontSize: '12px', color: '#856404', marginBottom: '12px' }}>
          Use this to verify the payment flow works end to end.
        </div>
        <button
          style={{ ...styles.subscribeBtn, background: '#f39c12', width: 'auto', padding: '8px 20px' }}
          onClick={() => {
            if (plans && plans.length > 0) {
              // Use the actual plan ID from the first plan, not "test"
              const testPlan = { 
                ...plans[0], 
                id: plans[0].id,  // Use real UUID from database
                price_monthly: '100', 
                price_annual: '100' 
              };
              handleSubscribe(testPlan, true);
            } else {
              alert('Please wait for plans to load before testing');
            }
          }}
          disabled={loading || !plans || plans.length === 0}
        >
          Test Pay KES 100
        </button>
      </div>

      {/* DIRECT TEST payment button — bypass plan system */}
      <div style={{ marginTop: '16px', padding: '16px', background: '#d1ecf1', borderRadius: '8px', border: '1px solid #bee5eb' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0c5460', marginBottom: '8px' }}>🔧 DIRECT TEST (Bypasses Plan System)</div>
        <div style={{ fontSize: '12px', color: '#0c5460', marginBottom: '12px' }}>
          This button calls /api/payments/test directly with KES 100 using real station ID.
        </div>
        <button
          style={{ ...styles.subscribeBtn, background: '#17a2b8', width: 'auto', padding: '8px 20px' }}
          onClick={handleDirectTest}
          disabled={testLoading || !activeStation}
        >
          {testLoading ? 'Processing...' : '🔧 DIRECT Test Pay KES 100'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  subCard:      { borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  toggleRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  toggle:       { display: 'flex', background: '#f0f2f5', borderRadius: '8px', padding: '4px' },
  toggleBtn:    { padding: '6px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
  planCard:     { borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  popularBadge: { position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#4CAF50', color: '#fff', padding: '3px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' },
  subscribeBtn: { width: '100%', padding: '12px', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  errorBox:     { background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' },
};

export default Pricing;