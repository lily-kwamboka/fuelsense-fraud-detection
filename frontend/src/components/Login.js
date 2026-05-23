import React, { useState } from 'react';
import { supabase } from '../supabase';

function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleEmailLogin() {
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handlePasswordReset() {
    if (!email) { setError('Enter your email address first.'); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  if (resetSent) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>⛽</div>
          <div style={styles.title}>FuelSense</div>
          <div style={styles.successBox}>
            ✅ Password reset email sent. Check your inbox and follow the link to reset your password.
          </div>
          <button style={styles.linkBtn} onClick={() => { setResetSent(false); setResetMode(false); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (resetMode) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>⛽</div>
          <div style={styles.title}>FuelSense</div>
          <div style={styles.subtitle}>Reset your password</div>
          {error && <div style={styles.error}>{error}</div>}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={styles.input}
            />
          </div>
          <button
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handlePasswordReset}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Reset Email'}
          </button>
          <button style={styles.linkBtn} onClick={() => { setResetMode(false); setError(null); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo */}
        <div style={styles.logo}>⛽</div>
        <div style={styles.title}>FuelSense</div>
        <div style={styles.subtitle}>Fuel Inventory Management</div>

        {/* Notice */}
        <div style={styles.notice}>
          🔒 Access is by invitation only. Contact your administrator to request access.
        </div>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Email/Password */}
        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={styles.input}
            onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={styles.input}
            onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
          />
        </div>

        <button
          style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
          onClick={handleEmailLogin}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        {/* Forgot password */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <button style={styles.linkBtn} onClick={() => { setResetMode(true); setError(null); }}>
            Forgot your password?
          </button>
        </div>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Google */}
        <button
          style={styles.googleBtn}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 8 }}>
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/>
          </svg>
          Continue with Google
        </button>

        <div style={styles.footer}>
          FuelSense · Mafuta Salama · Nairobi, Kenya
        </div>

      </div>
    </div>
  );
}

const styles = {
  page:       { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  card:       { background: '#fff', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  logo:       { fontSize: '48px', textAlign: 'center', marginBottom: '8px' },
  title:      { fontSize: '24px', fontWeight: '700', textAlign: 'center', color: '#1a1a2e', marginBottom: '4px' },
  subtitle:   { fontSize: '13px', color: '#999', textAlign: 'center', marginBottom: '16px' },
  notice:     { background: '#f0f4ff', border: '1px solid #c7d7fd', color: '#3451b2', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', textAlign: 'center' },
  error:      { background: '#fdecea', color: '#e74c3c', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' },
  successBox: { background: '#eafaf1', border: '1px solid #a9dfbf', color: '#1e8449', padding: '14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' },
  field:      { marginBottom: '16px' },
  label:      { display: 'block', fontSize: '13px', fontWeight: '500', color: '#444', marginBottom: '6px' },
  input:      { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  btn:        { width: '100%', padding: '11px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' },
  linkBtn:    { background: 'none', border: 'none', color: '#1a1a2e', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', display: 'block', margin: '0 auto' },
  divider:    { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  dividerLine:{ flex: 1, height: '1px', background: '#e0e0e0' },
  dividerText:{ fontSize: '12px', color: '#999' },
  googleBtn:  { width: '100%', padding: '11px', background: '#fff', color: '#444', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' },
  footer:     { textAlign: 'center', fontSize: '11px', color: '#bbb' },
};

export default Login;