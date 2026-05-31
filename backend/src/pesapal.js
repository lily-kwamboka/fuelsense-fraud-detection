'use strict';

const fetch = require('node-fetch');

const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
const IS_SANDBOX      = process.env.PESAPAL_ENV !== 'live';

const BASE_URL = IS_SANDBOX
  ? 'https://cybqa.pesapal.com/pesapalv3'
  : 'https://pay.pesapal.com/v3';

let cachedToken     = null;
let tokenExpiry     = null;

// ── Get OAuth Token ──────────────────────────────────────────
async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

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

  const res = await fetch(BASE_URL + '/api/Transactions/SubmitOrderRequest', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify(order),
  });

  const data = await res.json();

  if (!data.redirect_url) {
    throw new Error('Pesapal order failed: ' + JSON.stringify(data));
  }

  return data;
}

// ── Get Transaction Status ───────────────────────────────────
async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();

  const res = await fetch(
    BASE_URL + '/api/Transactions/GetTransactionStatus?orderTrackingId=' + orderTrackingId,
    {
      headers: {
        'Accept':        'application/json',
        'Authorization': 'Bearer ' + token,
      },
    }
  );

  return await res.json();
}

module.exports = { getToken, registerIPN, submitOrder, getTransactionStatus };