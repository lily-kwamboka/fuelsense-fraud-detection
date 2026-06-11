/**
 * FuelSense — Email Alerts via Resend + SMS via Africa's Talking
 * Sends professional HTML emails for critical events + SMS for urgent alerts:
 * - Low stock warning
 * - High water level
 * - Delivery flagged
 * - Daily reconciliation variance
 * - Reading gap (ATG offline)
 */

'use strict';

const { Resend } = require('resend');
const AfricasTalking = require('africastalking');

// ── Email Setup ──────────────────────────────────────────────────────────────
let resend = null;
let lastAlertSent = {};

// Initialize Resend if API key is available
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('[EMAIL] Resend initialized for alerts');
}

const FROM = process.env.ALERT_FROM_EMAIL || 'alerts@mafutasalama.co.ke';
const TO   = process.env.ALERT_TO_EMAIL   || process.env.ALERT_EMAIL || 'bernicewakarindi@gmail.com';

// ── SMS Setup (Africa's Talking) ────────────────────────────────────────────
let sms = null;

if (process.env.AT_API_KEY) {
  try {
    const africastalking = AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME || 'sandbox'
    });
    sms = africastalking.SMS;
    console.log('[SMS] Africa\'s Talking initialized');
  } catch (err) {
    console.error('[SMS] Failed to initialize:', err.message);
  }
} else {
  console.log('[SMS] AT_API_KEY not configured - SMS disabled');
}

/**
 * Send SMS via Africa's Talking
 * @param {string} phoneNumber - Kenyan phone number (e.g., 0712345678)
 * @param {string} message - SMS content (max 160 chars)
 */
async function sendSMS(phoneNumber, message) {
  if (!sms || !process.env.AT_API_KEY) {
    console.log('[SMS] Skipped - SMS not configured');
    return;
  }

  try {
    // Format Kenyan phone number to international format
    let formattedNumber = phoneNumber.replace(/\s/g, '');
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '+254' + formattedNumber.substring(1);
    } else if (formattedNumber.startsWith('254')) {
      formattedNumber = '+' + formattedNumber;
    } else if (!formattedNumber.startsWith('+')) {
      formattedNumber = '+254' + formattedNumber;
    }

    const truncatedMsg = message.substring(0, 160);
    
    const options = {
      to: [formattedNumber],
      message: truncatedMsg,
      enqueue: true,
      from: process.env.AT_SENDER_ID || 'FuelSense'
    };

    const response = await sms.send(options);
    console.log(`[SMS] Sent to ${formattedNumber}: ${truncatedMsg.substring(0, 50)}...`);
    return response;
  } catch (error) {
    console.error('[SMS] Failed to send:', error.message);
  }
}

// ── Helper Functions ──────────────────────────────────────────────────────────

function shouldSendAlert(alertKey, cooldownMinutes = 60) {
  const lastSent = lastAlertSent[alertKey];
  if (!lastSent) return true;
  const minutesSince = (Date.now() - lastSent) / (1000 * 60);
  return minutesSince >= cooldownMinutes;
}

function recordAlertSent(alertKey) {
  lastAlertSent[alertKey] = Date.now();
}

function getAlertEmail() {
  return TO;
}

/**
 * Send an email alert.
 * @param {string} subject
 * @param {string} htmlBody
 * @param {boolean} useCooldown
 * @param {string} alertKey
 */
async function sendAlert(subject, htmlBody, useCooldown = false, alertKey = null) {
  if (!TO) {
    console.warn('[EMAIL] Alert email not set — skipping email alert');
    return;
  }

  if (useCooldown && alertKey && !shouldSendAlert(alertKey)) {
    console.log(`[EMAIL] Skipping duplicate alert for key: ${alertKey}`);
    return;
  }

  if (!resend) {
    console.log(`[EMAIL] Would send alert: ${subject}`);
    if (useCooldown && alertKey) recordAlertSent(alertKey);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: TO.split(',').map(e => e.trim()),
      subject: `[FuelSense] ${subject}`,
      html: wrapHTML(subject, htmlBody),
    });

    if (error) {
      console.error('[EMAIL] Failed to send alert:', error);
    } else {
      console.log('[EMAIL] Alert sent:', subject, '→', data.id);
      if (useCooldown && alertKey) recordAlertSent(alertKey);
    }
  } catch (err) {
    console.error('[EMAIL] Error sending alert:', err.message);
  }
}

/**
 * Wrap content in a professional HTML email template.
 */
function wrapHTML(title, content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">⛽</div>
      <div style="color:#fff;font-size:20px;font-weight:700;">FuelSense</div>
      <div style="color:#4CAF50;font-size:12px;margin-top:4px;">Mafuta Salama · Nairobi, Kenya</div>
    </div>

    <!-- Content -->
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:18px;">${title}</h2>
      ${content}
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;">
      <p style="color:#999;font-size:12px;margin:0;">
        This is an automated alert from FuelSense. 
        Log in to your dashboard at 
        <a href="https://fuelsense-dashboard.vercel.app" style="color:#1a1a2e;">fuelsense-dashboard.vercel.app</a>
        to view details.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;color:#999;font-size:11px;">
      FuelSense · Mafuta Salama · © ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`;
}

// ── Alert types ──────────────────────────────────────────────────────────────

/**
 * Critical alert - sends BOTH email and SMS
 * For emergencies: low stock <10%, ATG offline, high water, flagged deliveries
 */
async function sendCriticalAlert(tankNumber, fuelType, fillPct, litres, alertType = 'low_stock') {
  const alertKey = `${alertType}_${tankNumber}`;
  
  // Send email
  await alertLowStock(tankNumber, fuelType, fillPct, litres);
  
  // Send SMS
  const smsMessage = `🚨 FUELSENSE: Tank ${tankNumber} ${fuelType} at ${fillPct}%! ${Math.round(litres)}L left. REFILL NOW!`;
  await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
}

/**
 * ATG Offline Alert (SMS + Email)
 */
async function sendOfflineAlert(tankNumber, minutesAgo) {
  const alertKey = `offline_${tankNumber}`;
  
  if (shouldSendAlert(alertKey, 60)) {
    const emailMessage = `Tank ${tankNumber} has not sent a reading for ${minutesAgo} minutes.`;
    const smsMessage = `🔴 FUELSENSE: Tank ${tankNumber} offline for ${minutesAgo} min! Check ATG connection.`;
    
    // Send email
    const content = `
      <div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <strong style="color:#721c24;">🔴 ATG probe is not sending readings</strong>
      </div>
      <p style="color:#1a1a2e;font-size:13px;">Tank ${tankNumber} has not sent a reading for ${minutesAgo} minutes.</p>
      <p style="color:#721c24;font-size:13px;margin-top:16px;">
        <strong>Action required:</strong> Check the ATG console, IoT gateway connection, and network connectivity.
      </p>
    `;
    
    await sendAlert(`🔴 ATG Offline — Tank ${tankNumber}`, content, false);
    
    // Send SMS
    await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
    recordAlertSent(alertKey);
  }
}

/**
 * Low stock alert — tank below threshold (default 20%)
 * Critical if below 10% - sends SMS
 */
async function alertLowStock(tankNumber, fuelType, fillPct, nsvLitres, stationName = 'Station') {
  const alertKey = `low_stock_${tankNumber}`;
  const isCritical = fillPct < 10;
  
  const content = `
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:#856404;">⚠️ Tank ${tankNumber} is running low</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Station</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${stationName}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Tank</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">Tank ${tankNumber} — ${fuelType?.toUpperCase() || 'Unknown'}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Current Level</td>
        <td style="padding:10px 0;color:#e74c3c;font-weight:700;font-size:16px;">${parseFloat(fillPct).toFixed(1)}%</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">NSV Remaining</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${parseFloat(nsvLitres).toFixed(0)} litres</td>
      </tr>
    </table>
    <p style="color:#856404;font-size:13px;margin-top:16px;">
      <strong>Action required:</strong> Schedule a fuel delivery immediately to avoid stock-out.
    </p>
  `;
  
  await sendAlert(`⚠️ Low Stock — Tank ${tankNumber} (${fuelType?.toUpperCase() || 'Unknown'})`, content, true, alertKey);
  
  // Send SMS for critical low stock (<10%)
  if (isCritical) {
    const smsMessage = `🚨 FUELSENSE CRITICAL: Tank ${tankNumber} ${fuelType} at ${fillPct}%! ${Math.round(nsvLitres)}L left. REFILL NOW!`;
    await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
  }
}

/**
 * High water alert — water level above threshold (default 50mm)
 */
async function alertHighWater(tankNumber, fuelType, waterMm, stationName = 'Station') {
  const alertKey = `high_water_${tankNumber}`;
  
  const content = `
    <div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:#721c24;">🚨 High water detected in Tank ${tankNumber}</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Station</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${stationName}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Tank</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">Tank ${tankNumber} — ${fuelType?.toUpperCase() || 'Unknown'}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Water Level</td>
        <td style="padding:10px 0;color:#e74c3c;font-weight:700;font-size:16px;">${parseFloat(waterMm).toFixed(1)} mm</td>
      </tr>
    </table>
    <p style="color:#721c24;font-size:13px;margin-top:16px;">
      <strong>Action required:</strong> Inspect the tank immediately. Water contamination can damage equipment and fuel quality.
    </p>
  `;
  
  await sendAlert(`🚨 High Water Level — Tank ${tankNumber}`, content, true, alertKey);
  
  // Send SMS for high water
  const smsMessage = `💧 FUELSENSE: Tank ${tankNumber} has ${waterMm}mm water! Inspect immediately.`;
  await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
}

/**
 * Delivery flagged alert
 */
async function alertFlaggedDelivery(bolNumber, variance, fuelType, stationName = 'Station') {
  const alertKey = `flagged_delivery_${bolNumber}`;
  const varianceLitres = parseFloat(variance || 0);
  const variancePct = Math.abs((varianceLitres / 100) * 100);
  
  const content = `
    <div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:#721c24;">🚨 Delivery variance exceeds tolerance</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Station</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${stationName}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">BOL Number</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${bolNumber}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Fuel Type</td>
        <td style="padding:10px 0;color:#1a1a2e;font-size:13px;">${fuelType?.toUpperCase() || 'Unknown'}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Variance</td>
        <td style="padding:10px 0;color:#e74c3c;font-weight:700;font-size:16px;">
          ${varianceLitres > 0 ? '+' : ''}${varianceLitres.toFixed(0)} L (${variancePct.toFixed(3)}%)
        </td>
      </tr>
    </table>
    <p style="color:#721c24;font-size:13px;margin-top:16px;">
      <strong>Action required:</strong> Review the delivery records and contact the supplier to dispute the variance.
    </p>
  `;
  
  await sendAlert(`🚨 Delivery Flagged — ${bolNumber}`, content, true, alertKey);
  
  // Send SMS for flagged delivery
  const smsMessage = `🚛 FUELSENSE: Delivery ${bolNumber} flagged! Variance: ${varianceLitres.toFixed(0)}L. Check dashboard.`;
  await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
}

/**
 * Reading gap alert — ATG offline
 */
async function alertReadingGap(message, stationName = 'Station') {
  const alertKey = `atg_offline_${stationName}`;
  
  const content = `
    <div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:#721c24;">🔴 ATG probe is not sending readings</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Station</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${stationName}</td>
      </tr>
    </table>
    <p style="color:#1a1a2e;font-size:13px;margin-top:16px;">${message}</p>
    <p style="color:#721c24;font-size:13px;margin-top:16px;">
      <strong>Action required:</strong> Check the ATG console, IoT gateway connection, and network connectivity at the station.
    </p>
  `;
  
  await sendAlert('🔴 ATG Offline — Reading Gap Detected', content, true, alertKey);
  
  // Send SMS for ATG offline
  const smsMessage = `🔴 FUELSENSE: ${message.substring(0, 140)}`;
  await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
}

/**
 * Daily reconciliation variance alert
 */
async function alertDailyVariance(tankNumber, fuelType, varianceLitres, date, stationName = 'Station') {
  const alertKey = `daily_variance_${tankNumber}_${date}`;
  const isNegative = varianceLitres < 0;
  
  const content = `
    <div style="background:${isNegative ? '#fdecea' : '#fff3cd'};border:1px solid ${isNegative ? '#f5c6cb' : '#ffc107'};border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:${isNegative ? '#721c24' : '#856404'};">
        ${isNegative ? '📉 Unaccounted fuel loss detected' : '📈 Unexpected fuel gain detected'}
      </strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Station</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">${stationName}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Date</td>
        <td style="padding:10px 0;color:#1a1a2e;font-size:13px;">${date}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Tank</td>
        <td style="padding:10px 0;color:#1a1a2e;font-weight:600;font-size:13px;">Tank ${tankNumber} — ${fuelType?.toUpperCase() || 'Unknown'}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#666;font-size:13px;">Daily Variance</td>
        <td style="padding:10px 0;font-weight:700;font-size:16px;color:${isNegative ? '#e74c3c' : '#f39c12'};">
          ${varianceLitres > 0 ? '+' : ''}${Math.abs(varianceLitres).toFixed(0)} L
        </td>
      </tr>
    </table>
    <p style="font-size:13px;margin-top:16px;color:${isNegative ? '#721c24' : '#856404'};">
      <strong>Action required:</strong> ${isNegative
        ? 'Investigate possible leak, theft, or meter fault.'
        : 'Verify pump sales figures and delivery records for this date.'}
    </p>
  `;
  
  await sendAlert(`📋 Daily Variance Alert — Tank ${tankNumber}`, content, true, alertKey);
  
  // Send SMS for variance
  const smsMessage = `📊 FUELSENSE: Tank ${tankNumber} variance ${varianceLitres > 0 ? '+' : ''}${Math.abs(varianceLitres).toFixed(0)}L. ${isNegative ? 'Possible loss!' : 'Check records.'}`;
  await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
}

/**
 * Test Alert (for debugging)
 */
async function sendTestAlert() {
  console.log('[EMAIL] Sending test alert...');
  
  if (!resend) {
    console.error('[EMAIL] Resend not configured. Add RESEND_API_KEY to environment variables.');
    return false;
  }

  const content = `
    <div style="background:#d4edda;border:1px solid #c3e6cb;border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:#155724;">✅ This is a test email from FuelSense</strong>
    </div>
    <p style="color:#1a1a2e;font-size:13px;">If you received this, email notifications are working correctly!</p>
    <p style="color:#1a1a2e;font-size:13px;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
  `;
  
  await sendAlert('🧪 Test Alert', content, false);
  console.log('[EMAIL] Test alert sent successfully');
  return true;
}

/**
 * Test SMS (for debugging)
 */
async function sendTestSMS() {
  if (!sms || !process.env.AT_API_KEY) {
    console.error('[SMS] SMS not configured. Add AT_API_KEY to environment variables.');
    return false;
  }
  
  const phoneNumber = process.env.ALERT_PHONE_NUMBER;
  if (!phoneNumber) {
    console.error('[SMS] ALERT_PHONE_NUMBER not set');
    return false;
  }
  
  const testMessage = "🧪 FUELSENSE TEST: This is a test SMS from your FuelSense alert system. If you receive this, SMS alerts are working!";
  await sendSMS(phoneNumber, testMessage);
  console.log('[SMS] Test SMS sent to', phoneNumber);
  return true;
}

// Export legacy function names for backward compatibility
async function alertDeliveryFlagged(delivery) {
  return alertFlaggedDelivery(delivery.bol_number, delivery.variance_litres, delivery.fuel_type);
}

module.exports = {
  // Email functions
  alertLowStock,
  alertHighWater,
  alertFlaggedDelivery,
  alertReadingGap,
  alertDailyVariance,
  sendTestAlert,
  sendTestSMS,
  // SMS functions
  sendSMS,
  sendCriticalAlert,
  sendOfflineAlert,
  // Legacy aliases
  alertDeliveryFlagged,
};