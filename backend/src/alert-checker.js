'use strict';

require('dotenv').config();

const { Client } = require('pg');
const {
  alertLowStock,
  alertHighWater,
  alertDeliveryFlagged,
  alertDailyVariance,
  sendCriticalAlert,
  sendOfflineAlert,
  sendSMS
} = require('./email-alerts');

const DATABASE_URL = process.env.DATABASE_URL;

async function runAlertCheck() {
  console.log('[ALERT-CHECK] Starting at', new Date().toISOString());

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    // ── Cooldown helper ──────────────────────────────────────
    // Returns true if we should send the alert (not sent in last 60 min)
    async function shouldAlert(alertKey) {
      const res = await db.query(
        `SELECT created_at FROM audit_log
          WHERE action = $1
            AND created_at > NOW() - INTERVAL '60 minutes'
          LIMIT 1`,
        ['ALERT_' + alertKey]
      );
      return res.rows.length === 0;
    }

    async function markAlertSent(alertKey) {
      await db.query(
        `INSERT INTO audit_log (user_email, user_role, action, entity_type)
         VALUES ('system@fuelsense', 'system', $1, 'alert')`,
        ['ALERT_' + alertKey]
      );
    }

    // 1. Check tanks
    const tankRes = await db.query(`
      SELECT t.id, t.tank_number, t.fuel_type, t.capacity_litres,
             r.nsv_litres, r.water_mm, r.innage_mm, r.recorded_at,
             ROUND((r.nsv_litres / t.capacity_litres) * 100, 1) AS fill_pct
        FROM tanks t
        JOIN LATERAL (
          SELECT * FROM atg_readings
          WHERE tank_id = t.id
          ORDER BY recorded_at DESC
          LIMIT 1
        ) r ON TRUE
    `);

    for (const tank of tankRes.rows) {
      const fillPct = parseFloat(tank.fill_pct);

      // CRITICAL Low Stock (<10%) - Send SMS + Email
      if (fillPct < 10 && fillPct > 0) {
        const key = 'CRITICAL_LOW_STOCK_TANK_' + tank.tank_number;
        if (await shouldAlert(key)) {
          console.log('[ALERT-CHECK] CRITICAL low stock Tank', tank.tank_number, fillPct + '%');
          await sendCriticalAlert(tank.tank_number, tank.fuel_type, fillPct, tank.nsv_litres);
          await markAlertSent(key);
        } else {
          console.log('[ALERT-CHECK] Critical low stock cooldown active for Tank', tank.tank_number);
        }
      }
      // Warning Low Stock (10-20%) - Email only
      else if (fillPct < 20 && fillPct >= 10) {
        const key = 'LOW_STOCK_TANK_' + tank.tank_number;
        if (await shouldAlert(key)) {
          console.log('[ALERT-CHECK] Low stock Tank', tank.tank_number, fillPct + '%');
          await alertLowStock(tank.tank_number, tank.fuel_type, fillPct, tank.nsv_litres);
          await markAlertSent(key);
        } else {
          console.log('[ALERT-CHECK] Low stock cooldown active for Tank', tank.tank_number);
        }
      }

      // High water — Send SMS + Email (critical)
      if (parseFloat(tank.water_mm) > 50) {
        const key = 'HIGH_WATER_TANK_' + tank.tank_number;
        if (await shouldAlert(key)) {
          console.log('[ALERT-CHECK] High water Tank', tank.tank_number, tank.water_mm + 'mm');
          await alertHighWater(tank.tank_number, tank.fuel_type, tank.water_mm);
          await markAlertSent(key);
        } else {
          console.log('[ALERT-CHECK] High water cooldown active for Tank', tank.tank_number);
        }
      }

      // Reading gap — last reading older than 10 minutes (SMS + Email)
      const lastReading = new Date(tank.recorded_at);
      const minutesAgo  = (Date.now() - lastReading.getTime()) / 60000;
      if (minutesAgo > 10) {
        const key = 'READING_GAP_TANK_' + tank.tank_number;
        if (await shouldAlert(key)) {
          console.log('[ALERT-CHECK] Reading gap Tank', tank.tank_number, minutesAgo.toFixed(0) + ' min');
          await sendOfflineAlert(tank.tank_number, minutesAgo.toFixed(0));
          await markAlertSent(key);
        }
      }
    }

    // 2. Flagged deliveries — SMS + Email
    const delivRes = await db.query(`
      SELECT d.*, t.tank_number, t.fuel_type
        FROM deliveries d
        JOIN tanks t ON t.id = d.tank_id
       WHERE d.status = 'flagged'
    `);

    for (const delivery of delivRes.rows) {
      const key = 'FLAGGED_DELIVERY_' + delivery.id;
      if (await shouldAlert(key)) {
        console.log('[ALERT-CHECK] Flagged delivery:', delivery.bol_number);
        await alertDeliveryFlagged(delivery);
        // Send SMS for flagged delivery
        const smsMessage = `🚛 FUELSENSE: Delivery ${delivery.bol_number} flagged! Variance: ${delivery.variance_litres || 0}L. Check dashboard.`;
        await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
        await markAlertSent(key);
      }
    }

    // 3. High daily variance > 500L — SMS + Email
    const reconRes = await db.query(`
      SELECT r.*, t.tank_number, t.fuel_type
        FROM daily_reconciliation r
        JOIN tanks t ON t.id = r.tank_id
       WHERE r.recon_date = CURRENT_DATE
         AND ABS(r.variance_litres) > 500
    `);

    for (const recon of reconRes.rows) {
      const key = 'DAILY_VARIANCE_TANK_' + recon.tank_number + '_' + recon.recon_date;
      if (await shouldAlert(key)) {
        console.log('[ALERT-CHECK] High variance Tank', recon.tank_number, recon.variance_litres + 'L');
        await alertDailyVariance(
          recon.tank_number,
          recon.fuel_type,
          parseFloat(recon.variance_litres),
          recon.recon_date
        );
        // Send SMS for high variance
        const isNegative = parseFloat(recon.variance_litres) < 0;
        const smsMessage = `📊 FUELSENSE: Tank ${recon.tank_number} variance ${recon.variance_litres > 0 ? '+' : ''}${Math.abs(parseFloat(recon.variance_litres)).toFixed(0)}L. ${isNegative ? 'Possible loss!' : 'Check records.'}`;
        await sendSMS(process.env.ALERT_PHONE_NUMBER, smsMessage);
        await markAlertSent(key);
      }
    }

    console.log('[ALERT-CHECK] Complete.');
    process.exit(0);
  } catch (err) {
    console.error('[ALERT-CHECK] Fatal error:', err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

runAlertCheck();