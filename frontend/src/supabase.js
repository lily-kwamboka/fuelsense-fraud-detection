import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Add debugging to check environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ Supabase credentials missing from environment variables');
  console.error('REACT_APP_SUPABASE_URL:', SUPABASE_URL ? '✓ Present' : '✗ Missing');
  console.error('REACT_APP_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✓ Present' : '✗ Missing');
  console.error('NODE_ENV:', process.env.NODE_ENV);
  
  // Show error on screen for debugging (only in production)
  if (process.env.NODE_ENV === 'production') {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.right = '0';
    errorDiv.style.background = '#dc2626';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '16px';
    errorDiv.style.zIndex = '99999';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.style.fontSize = '14px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    errorDiv.innerHTML = `
      <strong>🔧 Configuration Error</strong><br>
      Missing Supabase credentials. Please check Vercel environment variables.<br>
      <span style="opacity:0.8">REACT_APP_SUPABASE_URL: ${SUPABASE_URL ? '✅ Set' : '❌ Missing'}</span><br>
      <span style="opacity:0.8">REACT_APP_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}</span>
    `;
    document.body.prepend(errorDiv);
  }
} else {
  console.log('✅ Supabase credentials loaded successfully');
  console.log('REACT_APP_SUPABASE_URL:', SUPABASE_URL ? `${SUPABASE_URL.substring(0, 20)}...` : 'Missing');
  console.log('REACT_APP_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : 'Missing');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);