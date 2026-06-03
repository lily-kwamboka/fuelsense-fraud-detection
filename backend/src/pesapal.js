'use strict';

const fetch = require('node-fetch');

const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;

// Hardcoded BASE_URL for LIVE environment
const BASE_URL = 'https://pay.pesapal.com/v3';

console.log('[PESAPAL] Environment: LIVE | Base URL:', BASE_URL);

let cachedToken     = null;
let tokenExpiry     = null;

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
  tokenExpiry  = Date.now() + (4 * 60 * 60 * 1000);
  console.log('[PESAPAL] Token obtained successfully');
  return cachedToken;
}

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

async function submitOrder(order) {
  const token = await getToken();
  console.log('[PESAPAL] Submitting order:', JSON.stringify(order));

  const payload = {
    ...order,
    amount: parseFloat(order.amount).toFixed(2)
  };

  const url = `${BASE_URL}/api/Transactions/SubmitOrderRequest`;
  console.log('[PESAPAL] Request URL:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('[PESAPAL] Raw response:', text.substring(0, 500));

  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error(`Pesapal returned HTML (status ${res.status})`);
  }

  const data = JSON.parse(text);

  if (!data.redirect_url) {
    throw new Error('Pesapal order failed: ' + JSON.stringify(data));
  }

  return data;
}

async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();
  const res = await fetch(
    BASE_URL + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + orderTrackingId,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    }
  );
  return await res.json();
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus };