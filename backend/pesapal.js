'use strict';

const fetch = require('node-fetch');

const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
const IS_SANDBOX      = process.env.PESAPAL_ENV !== 'live';

const BASE_URL = IS_SANDBOX
  ? 'https://cybqa.pesapal.com/pesapalv3'
  : 'https://pay.pesapal.com/v3';

// Log which environment we're using
console.log('[PESAPAL] Environment:', IS_SANDBOX ? 'SANDBOX' : 'LIVE', '| Base URL:', BASE_URL);

let cachedToken     = null;
let tokenExpiry     = null;

// ── Get OAuth Token ──────────────────────────────────────────
async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  console.log('[PESAPAL] Requesting new token...');
  
  const res = await fetch(BASE_URL + '/api/Auth/RequestToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({
      consumer_key:    CONSUMER_KEY,
      consumer_secret: CONSUMER_SECRET,
    }),
  });

  const data = await res.json();

  if (!data.token) {
    console.error('[PESAPAL] Auth failed:', JSON.stringify(data));
    throw new Error('Pesapal auth failed: ' + JSON.stringify(data));
  }

  cachedToken  = data.token;
  tokenExpiry  = Date.now() + (4 * 60 * 60 * 1000); // 4 hours
  console.log('[PESAPAL] Token obtained successfully');
  return cachedToken;
}

// ── Register IPN ─────────────────────────────────────────────
async function registerIPN(callbackUrl) {
  const token = await getToken();

  console.log('[PESAPAL] Registering IPN for URL:', callbackUrl);

  const res = await fetch(BASE_URL + '/api/URLSetup/RegisterIPN', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({
      url:          callbackUrl,
      ipn_notification_type: 'GET',
    }),
  });

  const data = await res.json();
  console.log('[PESAPAL] IPN registered:', data.ipn_id);
  return data.ipn_id;
}

// ── Submit Order ─────────────────────────────────────────────
async function submitOrder(order) {
  const token = await getToken();
  console.log('[PESAPAL] Submitting order:', JSON.stringify(order));
  console.log('[PESAPAL] Using token:', token ? token.substring(0, 20) + '...' : 'No token');

  // Ensure amount is a number with 2 decimal places
  const payload = {
    ...order,
    amount: parseFloat(order.amount).toFixed(2)
  };

  const url = `${BASE_URL}/api/Transactions/SubmitOrderRequest`;
  console.log('[PESAPAL] Request URL:', url);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('[PESAPAL] Response status:', res.status);
    console.log('[PESAPAL] Response status text:', res.statusText);

    // Get response as text first to handle HTML errors
    const text = await res.text();
    console.log('[PESAPAL] Raw response (first 500 chars):', text.substring(0, 500));

    // Check if response is HTML (starts with <!DOCTYPE or <html)
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.error('[PESAPAL] Received HTML instead of JSON. This usually means:');
      console.error('  1. Invalid API endpoint URL');
      console.error('  2. Missing or invalid authentication');
      console.error('  3. Wrong HTTP method');
      throw new Error(`Pesapal returned HTML (status ${res.status}). Check API configuration.`);
    }

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('[PESAPAL] Failed to parse JSON:', e.message);
      throw new Error(`Invalid JSON response from Pesapal: ${text.substring(0, 200)}`);
    }

    if (!data.redirect_url) {
      console.error('[PESAPAL] Order failed:', JSON.stringify(data));
      throw new Error('Pesapal order failed: ' + JSON.stringify(data));
    }

    console.log('[PESAPAL] Order submitted successfully, redirect URL:', data.redirect_url);
    return data;
  } catch (err) {
    console.error('[PESAPAL] Submit order error:', err.message);
    throw err;
  }
}

// ── Get Transaction Status ───────────────────────────────────
async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();

  console.log('[PESAPAL] Getting transaction status for:', orderTrackingId);

  const res = await fetch(
    BASE_URL + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + orderTrackingId,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    }
  );

  const text = await res.text();
  
  // Check if response is HTML
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    console.error('[PESAPAL] Received HTML for transaction status');
    throw new Error('Pesapal returned HTML for transaction status');
  }

  const data = JSON.parse(text);
  console.log('[PESAPAL] Transaction status retrieved for:', orderTrackingId, '| Status:', data.payment_status_description);
  return data;
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus };