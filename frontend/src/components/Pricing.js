import React, { useState, useEffect } from 'react';

function Pricing({ api, activeStation, session, darkMode }) {
  const [plans,        setPlans]        = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [billing,      setBilling]      = useState('monthly');
  const [loading,      setLoading]      = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [error,        setError]        = useState(null);

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
      
      if (isTest) {
        payload.test_amount = plan.price_monthly;
        payload.billing_cycle = 'monthly';
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

  const statusColor = {
    trial:     '#f39c12',
    active:    '#27ae60',
    expired:   '#e74c3c',
    cancelled: '#95a5a6',
  };

  const statusText = {
    trial:     'Trial Period',
    active:    'Active',
    expired:   'Expired',
    cancelled: 'Cancelled',
  };

  // Calculate days remaining
  const getDaysRemaining = () => {
    if (!subscription || !subscription.current_period_end) return null;
    const endDate = new Date(subscription.current_period_end);
    const today = new Date();
    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysRemaining = getDaysRemaining();

  return (
    <div>
      {/* Error display */}
      {error && (
        <div style={{ ...styles.errorBox, marginBottom: '20px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Current subscription - Enhanced Display */}
      {subscription && (
        <div style={{ ...styles.subCard, background: bg, borderLeft: `4px solid ${statusColor[subscription.status] || '#999'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', color: sub, marginBottom: '4px' }}>Current Plan</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: text }}>
                {subscription.plan_name}
              </div>
              <div style={{ fontSize: '12px', color: sub, marginTop: '4px' }}>
                {subscription.billing_cycle === 'monthly' ? 'Monthly billing' : 'Annual billing'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                padding: '6px 16px',
                borderRadius: '99px',
                fontSize: '13px',
                fontWeight: '600',
                background: (statusColor[subscription.status] || '#999') + '20',
                color: statusColor[subscription.status] || '#999',
              }}>
                {statusText[subscription.status] || subscription.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Subscription details */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${darkMode ? '#2a2a3e' : '#e0e0e0'}` }}>
            {subscription.trial_ends_at && subscription.status === 'trial' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>🎁</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: text }}>Trial Period Active</div>
                  <div style={{ fontSize: '12px', color: sub }}>
                    Trial ends: {new Date(subscription.trial_ends_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}

            {subscription.current_period_end && subscription.status === 'active' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>📅</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: text }}>Next Billing Date</div>
                  <div style={{ fontSize: '12px', color: sub }}>
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                    {daysRemaining !== null && daysRemaining > 0 && (
                      <span style={{ marginLeft: '8px', color: daysRemaining <= 7 ? '#e74c3c' : '#27ae60' }}>
                        ({daysRemaining} days remaining)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {subscription.status === 'expired' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: text }}>Subscription Expired</div>
                  <div style={{ fontSize: '12px', color: sub }}>
                    Please renew your subscription to continue using premium features.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show upgrade prompt if subscription exists */}
      {subscription && subscription.status === 'active' && (
        <div style={{ ...styles.infoBox, marginBottom: '20px', background: darkMode ? '#1a2a1a' : '#e8f5e9' }}>
          <span style={{ fontSize: '16px' }}>✅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#27ae60' }}>Your subscription is active</div>
            <div style={{ fontSize: '12px', color: sub }}>Need to upgrade or change your plan? Contact support.</div>
          </div>
        </div>
      )}

      {/* Billing toggle - only show if no active subscription or subscription is expired/cancelled */}
      {(!subscription || subscription.status === 'expired' || subscription.status === 'cancelled') && (
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
      )}

      {/* Plans grid - only show if no active subscription */}
      {(!subscription || subscription.status === 'expired' || subscription.status === 'cancelled') && (
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
      )}

      {/* If subscription is active, show a message instead of plans */}
      {subscription && subscription.status === 'active' && (
        <div style={{ ...styles.subCard, background: bg, textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: text, marginBottom: '8px' }}>
            You're all set!
          </div>
          <div style={{ fontSize: '14px', color: sub, marginBottom: '16px' }}>
            Your {subscription.plan_name} plan is active until{' '}
            <strong>{new Date(subscription.current_period_end).toLocaleDateString()}</strong>
          </div>
          <div style={{ fontSize: '12px', color: sub }}>
            Need to upgrade or make changes? Please contact our support team.
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: '12px', color: sub, marginTop: '24px' }}>
        All plans include a 14-day free trial. Cancel anytime. Setup fee KES 25,000 applies.
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
  infoBox:      { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px' },
};

export default Pricing;