'use strict';

const { Pesapal } = require('pesapal-v3');

// Determine environment - 'production' for live, 'sandbox' for testing
const mode = process.env.PESAPAL_ENV === 'live' ? 'production' : 'sandbox';

// Log which environment we're using
console.log('[PESAPAL] Environment:', mode === 'production' ? 'LIVE' : 'SANDBOX');

// Initialize the Pesapal client once
const pesapal = new Pesapal({
    consumerKey: process.env.PESAPAL_CONSUMER_KEY,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
    mode: mode,
});

let cachedIpnId = null;

// ── Get or Register IPN ──────────────────────────────────────────
async function getIpnId(callbackUrl) {
    if (cachedIpnId) {
        console.log('[PESAPAL] Using cached IPN ID:', cachedIpnId);
        return cachedIpnId;
    }

    try {
        // Try to find existing IPN for this URL
        const ipnList = await pesapal.getIpnList();
        const existingIpn = ipnList.find(ipn => ipn.url === callbackUrl);
        if (existingIpn) {
            console.log('[PESAPAL] Found existing IPN:', existingIpn.ipn_id);
            cachedIpnId = existingIpn.ipn_id;
            return cachedIpnId;
        }
    } catch (error) {
        console.warn('[PESAPAL] Could not fetch IPN list, registering new one:', error.message);
    }

    // Register new IPN
    const ipnId = await pesapal.registerIpnUrl({
        url: callbackUrl,
        ipnNotificationType: 'GET'
    });
    
    console.log('[PESAPAL] Registered new IPN:', ipnId);
    cachedIpnId = ipnId;
    return ipnId;
}

// ── Register IPN (alias for getIpnId to maintain compatibility) ──
async function registerIPN(callbackUrl) {
    return await getIpnId(callbackUrl);
}

// ── Submit Order ────────────────────────────────────────────────
async function submitOrder(orderData) {
    console.log('[PESAPAL] Submitting order:', JSON.stringify(orderData));
    
    try {
        const response = await pesapal.submitOrderRequest(orderData);
        console.log('[PESAPAL] Order submitted successfully, redirect URL:', response.redirect_url);
        return {
            redirect_url: response.redirect_url,
            order_tracking_id: response.order_tracking_id
        };
    } catch (error) {
        console.error('[PESAPAL] Submit order error:', error.message);
        throw error;
    }
}

// ── Get Transaction Status ──────────────────────────────────────
async function getTransactionStatus(orderTrackingId) {
    console.log('[PESAPAL] Getting transaction status for:', orderTrackingId);
    
    try {
        const status = await pesapal.getTransactionStatus(orderTrackingId);
        console.log('[PESAPAL] Transaction status:', status.payment_status_description);
        return status;
    } catch (error) {
        console.error('[PESAPAL] Get transaction status error:', error.message);
        throw error;
    }
}

// Export all functions
module.exports = {
    pesapalClient: pesapal,
    getIpnId,
    registerIPN,
    submitOrder,
    getTransactionStatus
};