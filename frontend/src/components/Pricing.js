import React, { useState, useEffect } from 'react';

function Pricing({ api, activeStation, session, darkMode }) {
  const [plans,          setPlans]          = useState([]);
  const [subscription,   setSubscription]   = useState(null);
  const [billing,        setBilling]        = useState('monthly');
  const [loading,        setLoading]        = useState(false);
  const [selected,       setSelected]       = useState(null);
  const [error,          setError]          = useState(null);
  const [showContact,    setShowContact]    = useState(false);
  const [contactForm,    setContactForm]    = useState({
    name: '', email: session?.user?.email || '',
    phone: '', company: '', stations: '1', message: '',
  });
  const [contactSending, setContactSending] = useState(false);
  const [contactSent,    setContactSent]    = useState(false);
  const [contactError,   setContactError]   = useState(null);

  const bg     = darkMode ? '#1e1e2e' : '#fff';
  const text   = darkMode ? '#e0e0e0' : '#1a1a2e';
  const sub    = darkMode ? '#888'    : '#666';
  const border = darkMode ? '#2a2a3e' : '#e0e0e0';

  useEffect(() => {
    fetch(api + '/api/plans').then(r => r.json()).then(setPlans).catch(console.error);
    if (activeStation) {
      fetch(api + '/api/subscription?station_id=' + activeStation + '&uid=' + (session?.user?.id || ''))
        .then(r => r.json()).then(setSubscription).catch(console.error);
    }
  }, [api, activeStation]);

  async function handleSubscribe(plan) {
    if (plan.name?.toLowerCase().includes('enterprise')) {
      setContactForm(f => ({ ...f, email: session?.user?.email || '' }));
      setContactSent(false);
      setContactError(null);
      setShowContact(true);
      return;
    }
    setLoading(true);
    setSelected(plan.id);
    setError(null);
    try {
      const res = await fetch(api + '/api/payments/initiate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          station_id:    activeStation,
          plan_id:       plan.id,
          billing_cycle: billing,
          user_email:    session?.user?.email,
          user_name:     session?.user?.email?.split('@')[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment initiation failed');
      if (data.redirect_url) window.location.href = data.redirect_url;
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
    setSelected(null);
  }

  async function handleContactSubmit() {
    if (!contactForm.name.trim())    { setContactError('Name is required.');    return; }
    if (!contactForm.email.trim())   { setContactError('Email is required.');   return; }
    if (!contactForm.company.trim()) { setContactError('Company is required.'); return; }
    setContactSending(true);
    setContactError(null);
    try {
      const res = await fetch(api + '/api/contact/enterprise', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(contactForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send enquiry');
      setContactSent(true);
    } catch (err) {
      setContactError(err.message);
    }
    setContactSending(false);
  }

  const statusColor = { trial: '#f39c12', active: '#27ae60', expired: '#e74c3c', cancelled: '#95a5a6' };
  const statusText  = { trial: 'Trial',   active: 'Active',  expired: 'Expired', cancelled: 'Cancelled' };

  const getDaysRemaining = () => {
    if (!subscription) return null;
    const endDate = subscription.trial_ends_at
      ? new Date(subscription.trial_ends_at)
      : subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    if (!endDate) return null;
    return Math.ceil((endDate - new Date()) / 86400000);
  };

  const daysRemaining = getDaysRemaining();
  const isCurrentPlan = (plan) => plan.name === subscription?.plan_name;
  const isEnterprise  = (plan) => plan.name?.toLowerCase().includes('enterprise');

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
    borderRadius: '8px', border: `1px solid ${border}`,
    background: darkMode ? '#2a2a3e' : '#f8f9fa',
    color: text, fontSize: '13px', outline: 'none',
  };
  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: '600',
    color: sub, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px',
  };

  return (
    <div>
      {/* Enterprise Contact Form Modal */}
      {showContact && (
        <div
          onClick={() => setShowContact(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: bg, borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Modal header */}
            <div style={{ background: '#1a1a2e', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>🏢 Enterprise Plan Enquiry</div>
                <div style={{ fontSize: '12px', color: '#4CAF50', marginTop: '2px' }}>Mafuta Salama · FuelSense</div>
              </div>
              <button onClick={() => setShowContact(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ padding: '24px' }}>
              {contactSent ? (
                /* Success state */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: text, marginBottom: '8px' }}>Enquiry Sent!</div>
                  <div style={{ fontSize: '13px', color: sub, marginBottom: '24px', lineHeight: '1.6' }}>
                    Thank you! Our team will contact you at <strong>{contactForm.email}</strong> within 24 hours to discuss your Enterprise plan.
                  </div>
                  <button
                    onClick={() => setShowContact(false)}
                    style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '13px', color: sub, marginTop: 0, marginBottom: '20px', lineHeight: '1.6' }}>
                    Enterprise plans are custom-priced for large networks. Fill in your details and our team will reach out within 24 hours.
                  </p>

                  {contactError && (
                    <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                      ⚠️ {contactError}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={labelStyle}>Full Name *</label>
                      <input type="text" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="John Kamau" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email *</label>
                      <input type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.co.ke" style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={labelStyle}>Company *</label>
                      <input type="text" value={contactForm.company} onChange={e => setContactForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Rubis Energy Kenya" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input type="tel" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="0712 345 678" style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>Number of Stations</label>
                    <select value={contactForm.stations} onChange={e => setContactForm(f => ({ ...f, stations: e.target.value }))} style={inputStyle}>
                      <option value="6-10">6 – 10 stations</option>
                      <option value="11-20">11 – 20 stations</option>
                      <option value="21-50">21 – 50 stations</option>
                      <option value="50+">50+ stations</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Message (optional)</label>
                    <textarea
                      value={contactForm.message}
                      onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Tell us about your network, integration needs, or any specific requirements..."
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setShowContact(false)} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1px solid ${border}`, background: 'transparent', color: sub, fontSize: '14px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button
                      onClick={handleContactSubmit}
                      disabled={contactSending}
                      style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', background: contactSending ? '#888' : '#1a1a2e', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: contactSending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      {contactSending ? (
                        <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Sending...</>
                      ) : '📩 Send Enquiry'}
                    </button>
                  </div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px', borderTop: `1px solid ${border}`, fontSize: '11px', color: sub, textAlign: 'center' }}>
              We typically respond within 24 hours · hello@mafutasalama.co.ke
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Current subscription status bar */}
      {subscription && (
        <div style={{
          background: bg, borderRadius: '12px', padding: '20px 24px',
          marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          borderLeft: `4px solid ${statusColor[subscription.status] || '#999'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
        }}>
          <div>
            <div style={{ fontSize: '12px', color: sub, marginBottom: '2px' }}>Current Plan</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: text }}>{subscription.plan_name}</div>
            <div style={{ fontSize: '12px', color: sub, marginTop: '2px' }}>
              {subscription.billing_cycle === 'annual' ? 'Annual billing' : 'Monthly billing'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              padding: '6px 16px', borderRadius: '99px', fontSize: '13px', fontWeight: '600',
              background: (statusColor[subscription.status] || '#999') + '22',
              color: statusColor[subscription.status] || '#999',
            }}>
              {statusText[subscription.status] || subscription.status}
            </span>
            {daysRemaining !== null && daysRemaining > 0 && (
              <div style={{ fontSize: '12px', color: daysRemaining <= 7 ? '#e74c3c' : sub, marginTop: '6px' }}>
                📅 {subscription.status === 'trial' ? 'Trial ends' : 'Next billing'} in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trial expiry warning */}
      {subscription?.status === 'trial' && daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div style={{ color: '#856404', fontSize: '13px' }}>
            <strong>Trial ends in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}!</strong> Subscribe below to avoid service interruption.
          </div>
        </div>
      )}

      {/* Expired warning */}
      {subscription?.status === 'expired' && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>🔴</span>
          <div style={{ color: '#721c24', fontSize: '13px' }}>
            <strong>Your subscription has expired.</strong> Choose a plan below to restore access.
          </div>
        </div>
      )}

      {/* Billing toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: text }}>
          {subscription?.status === 'active' ? 'All Plans' : 'Choose a Plan'}
        </div>
        <div style={{ display: 'flex', background: darkMode ? '#2a2a3e' : '#f0f2f5', borderRadius: '8px', padding: '4px' }}>
          {['monthly', 'annual'].map(b => (
            <button key={b} onClick={() => setBilling(b)} style={{
              padding: '6px 16px', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontSize: '13px', fontWeight: '500',
              background: billing === b ? '#1a1a2e' : 'transparent',
              color:      billing === b ? '#fff' : sub,
            }}>
              {b === 'monthly' ? 'Monthly' : (
                <span>Annual <span style={{ fontSize: '10px', color: '#4CAF50', fontWeight: '700' }}>SAVE 2 MONTHS</span></span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Full plan grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {plans.map((plan, i) => {
          const price    = billing === 'annual' ? plan.price_annual : plan.price_monthly;
          const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);
          const isPopular     = i === 1;
          const isCurrent     = isCurrentPlan(plan);
          const isEnterprisePlan = isEnterprise(plan);

          return (
            <div key={plan.id}
              style={{
                background: bg, borderRadius: '12px', padding: '24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                border: isCurrent ? '2px solid #27ae60' : isPopular ? '2px solid #4CAF50' : `1px solid ${border}`,
                position: 'relative', transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
              onMouseOut={e  => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; }}
            >
              {isCurrent && (
                <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#27ae60', color: '#fff', padding: '3px 14px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                  ✓ CURRENT PLAN
                </div>
              )}
              {!isCurrent && isPopular && (
                <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#4CAF50', color: '#fff', padding: '3px 14px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                  ⭐ MOST POPULAR
                </div>
              )}

              <div style={{ fontSize: '18px', fontWeight: '700', color: text, marginBottom: '6px' }}>{plan.name}</div>
              <div style={{ fontSize: '12px', color: sub, marginBottom: '16px' }}>
                {plan.max_stations === -1 ? 'Unlimited stations' : `Up to ${plan.max_stations} station${plan.max_stations !== 1 ? 's' : ''}`}
                {' · '}
                {plan.max_tanks === -1 ? 'Unlimited tanks' : `${plan.max_tanks} tanks`}
              </div>

              {isEnterprisePlan ? (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: text }}>Custom</div>
                  <div style={{ fontSize: '13px', color: sub }}>Contact us for pricing</div>
                </div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  <span style={{ fontSize: '30px', fontWeight: '800', color: isCurrent ? '#27ae60' : isPopular ? '#4CAF50' : text }}>
                    KES {parseInt(price).toLocaleString()}
                  </span>
                  <span style={{ fontSize: '13px', color: sub }}>/{billing === 'annual' ? 'year' : 'month'}</span>
                  {billing === 'annual' && (
                    <div style={{ fontSize: '12px', color: '#4CAF50', marginTop: '2px' }}>≈ KES {parseInt(price / 12).toLocaleString()}/mo</div>
                  )}
                </div>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
                {features.map((f, fi) => (
                  <li key={fi} style={{ fontSize: '13px', color: sub, padding: '6px 0', borderBottom: `1px solid ${darkMode ? '#2a2a3e' : '#f5f5f5'}`, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#4CAF50', flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div style={{ width: '100%', padding: '12px', borderRadius: '8px', boxSizing: 'border-box', background: '#eafaf1', color: '#27ae60', fontSize: '14px', fontWeight: '600', textAlign: 'center', border: '1px solid #a9dfbf' }}>
                  ✓ Your Current Plan
                </div>
              ) : isEnterprisePlan ? (
                <button onClick={() => handleSubscribe(plan)} style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '8px', background: '#1a1a2e', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                  Contact Us →
                </button>
              ) : (
                <button onClick={() => handleSubscribe(plan)} disabled={loading} style={{
                  width: '100%', padding: '12px', border: 'none', borderRadius: '8px',
                  background: isPopular ? '#4CAF50' : '#1a1a2e', color: '#fff',
                  fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading && selected === plan.id ? 0.7 : 1,
                }}>
                  {loading && selected === plan.id ? 'Redirecting...'
                    : subscription?.status === 'active'
                      ? (parseInt(price) > parseInt(billing === 'annual' ? subscription?.price_annual : subscription?.price_monthly) ? '⬆ Upgrade' : '⬇ Downgrade')
                      : 'Subscribe — Pay with M-Pesa'}
                </button>
              )}

              {!isEnterprisePlan && !isCurrent && (
                <div style={{ fontSize: '11px', color: sub, textAlign: 'center', marginTop: '8px' }}>
                  Visa · Mastercard · M-Pesa · Airtel Money
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', fontSize: '12px', color: sub, marginTop: '8px' }}>
        All plans include a 14-day free trial. Cancel anytime. Setup fee KES 25,000 applies.
      </div>
    </div>
  );
}

export default Pricing;