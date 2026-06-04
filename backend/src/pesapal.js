'use strict';

const fetch = require('node-fetch');

const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
const IS_SANDBOX      = process.env.PESAPAL_ENV !== 'live';

const BASE_URL = IS_SANDBOX
  ? 'https://cybqa.pesapal.com/pesapalv3'
  : 'https://pay.pesapal.com/v3';

console.log('[PESAPAL] Environment:', IS_SANDBOX ? 'SANDBOX' : 'LIVE', '| Base URL:', BASE_URL);

// Always get a fresh token - no caching
async function getToken() {
  console.log('[PESAPAL] Requesting fresh token...');
  
  const res = await fetch(BASE_URL + '/api/Auth/RequestToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      consumer_key: CONSUMER_KEY,
      consumer_secret: CONSUMER_SECRET,
    }),
  });

  const data = await res.json();

  if (!data.token) {
    console.error('[PESAPAL] Auth failed:', JSON.stringify(data));
    throw new Error('Pesapal auth failed: ' + JSON.stringify(data));
  }

  console.log('[PESAPAL] Token obtained successfully');
  return data.token;
}

async function registerIPN(callbackUrl) {
  const token = await getToken();
  console.log('[PESAPAL] Registering IPN for URL:', callbackUrl);

  const res = await fetch(BASE_URL + '/api/URLSetup/RegisterIPN', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: callbackUrl,
      ipn_notification_type: 'GET',
    }),
  });

  const data = await res.json();
  console.log('[PESAPAL] IPN registered:', data.ipn_id);
  return data.ipn_id;
}

async function submitOrder(order) {
  const token = await getToken(); // Always get fresh token
  console.log('[PESAPAL] Got fresh token, length:', token.length);
  console.log('[PESAPAL] Submitting order:', JSON.stringify(order));

  const payload = {
    ...order,
    amount: parseFloat(order.amount).toFixed(2)
  };

  const url = `${BASE_URL}/api/Transactions/SubmitOrderRequest`;
  console.log('[PESAPAL] Request URL:', url);
  console.log('[PESAPAL] Authorization: Bearer', token.substring(0, 20) + '...');

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

  const text = await res.text();
  console.log('[PESAPAL] Raw response (first 500 chars):', text.substring(0, 500));

  if (res.status === 401) {
    throw new Error('Pesapal authentication failed on SubmitOrder. Check that your API key has SubmitOrder permission.');
  }

  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error(`Pesapal returned HTML (status ${res.status})`);
  }

  const data = JSON.parse(text);

  if (!data.redirect_url) {
    throw new Error('Pesapal order failed: ' + JSON.stringify(data));
  }

  console.log('[PESAPAL] Order submitted successfully, redirect URL:', data.redirect_url);
  return data;
}

async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();
  console.log('[PESAPAL] Getting transaction status for:', orderTrackingId);

  const res = await fetch(
    BASE_URL + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + orderTrackingId,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  const text = await res.text();
  
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    console.error('[PESAPAL] Received HTML for transaction status');
    throw new Error('Pesapal returned HTML for transaction status');
  }

  const data = JSON.parse(text);
  console.log('[PESAPAL] Transaction status:', data.payment_status_description);
  return data;
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus };