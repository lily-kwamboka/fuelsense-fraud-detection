'use strict';

require('dotenv').config();

const { Client } = require('pg');
const {
  alertLowStock,
  alertHighWater,
  alertDeliveryFlagged,
  alertDailyVariance,
} = require('./email-alerts');

const DATABASE_URL = process.env.DATABASE_URL;

async function runAlertCheck() {
  console.log('[ALERT-CHECK] Starting at', new Date().toISOString());

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    // 1. Check low stock — tanks below 20%
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

      // Low stock alert
      if (fillPct < 20 && fillPct > 0) {
        console.log('[ALERT-CHECK] Low stock on Tank', tank.tank_number, fillPct + '%');
        await alertLowStock(tank.tank_number, tank.fuel_type, fillPct, tank.nsv_litres);
      }

      // High water alert
      if (parseFloat(tank.water_mm) > 50) {
        console.log('[ALERT-CHECK] High water on Tank', tank.tank_number, tank.water_mm + 'mm');
        await alertHighWater(tank.tank_number, tank.fuel_type, tank.water_mm);
      }

      // Reading gap — last reading older than 10 minutes
      const lastReading = new Date(tank.recorded_at);
      const minutesAgo  = (Date.now() - lastReading.getTime()) / 60000;
      if (minutesAgo > 10) {
        console.log('[ALERT-CHECK] Reading gap on Tank', tank.tank_number, minutesAgo.toFixed(0) + ' minutes');
      }
    }

    // 2. Check flagged deliveries with automatic fallback
    let delivRes;
    try {
      // Try with delivery_date first
      delivRes = await db.query(`
        SELECT d.*, t.tank_number, t.fuel_type
          FROM deliveries d
          JOIN tanks t ON t.id = d.tank_id
         WHERE d.status = 'flagged'
           AND d.delivery_date > NOW() - INTERVAL '24 hours'
      `);
      console.log('[ALERT-CHECK] Using delivery_date column for filtering');
    } catch (err) {
      if (err.message.includes('column d.delivery_date does not exist')) {
        console.log('[ALERT-CHECK] delivery_date column not found, checking all flagged deliveries');
        // Fallback: check all flagged deliveries without date filter
        delivRes = await db.query(`
          SELECT d.*, t.tank_number, t.fuel_type
            FROM deliveries d
            JOIN tanks t ON t.id = d.tank_id
           WHERE d.status = 'flagged'
        `);
      } else {
        throw err;
      }
    }

    for (const delivery of delivRes.rows) {
      console.log('[ALERT-CHECK] Flagged delivery:', delivery.bol_number);
      await alertDeliveryFlagged(delivery);
    }

    // 3. Check daily variance > 500L
    const reconRes = await db.query(`
      SELECT r.*, t.tank_number, t.fuel_type
        FROM daily_reconciliation r
        JOIN tanks t ON t.id = r.tank_id
       WHERE r.recon_date = CURRENT_DATE
         AND ABS(r.variance_litres) > 500
    `);

    for (const recon of reconRes.rows) {
      console.log('[ALERT-CHECK] High daily variance on Tank', recon.tank_number, recon.variance_litres + 'L');
      await alertDailyVariance(
        recon.tank_number,
        recon.fuel_type,
        parseFloat(recon.variance_litres),
        recon.recon_date
      );
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