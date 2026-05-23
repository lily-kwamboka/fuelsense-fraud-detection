require('dotenv').config();
'use strict';

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function runDailyRecon (db, reconDate) {
  // Default to yesterday if no date provided
  const date = reconDate || new Date(Date.now() - 86400000).toISOString().split('T')[0];

  console.log('[DAILY-RECON] Running for date: ' + date);

  // Get all tanks
  const tanksRes = await db.query('SELECT id, tank_number, fuel_type FROM tanks');

  for (const tank of tanksRes.rows) {
    await reconTank(db, tank, date);
  }

  console.log('[DAILY-RECON] Complete for ' + date);
}

async function reconTank (db, tank, date) {
  // 1. Opening NSV — first reading of the day
  const openRes = await db.query(
    `SELECT nsv_litres FROM atg_readings
      WHERE tank_id = $1
        AND recorded_at::date = $2::date
      ORDER BY recorded_at ASC
      LIMIT 1`,
    [tank.id, date]
  );

  // 2. Closing NSV — last reading of the day
  const closeRes = await db.query(
    `SELECT nsv_litres FROM atg_readings
      WHERE tank_id = $1
        AND recorded_at::date = $2::date
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [tank.id, date]
  );

  if (!openRes.rows.length || !closeRes.rows.length) {
    console.warn('[DAILY-RECON] No readings found for tank ' + tank.tank_number + ' on ' + date);
    return;
  }

  const openingNSV = parseFloat(openRes.rows[0].nsv_litres);
  const closingNSV = parseFloat(closeRes.rows[0].nsv_litres);

  // 3. Total deliveries received today
  const delivRes = await db.query(
    `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total
       FROM deliveries
      WHERE tank_id = $1
        AND status IN ('confirmed', 'flagged')
        AND stabilisation_at::date = $2::date`,
    [tank.id, date]
  );

  const deliveriesNSV = parseFloat(delivRes.rows[0].total) || 0;

  // 4. Pump sales — manually updated via dashboard until POS integration in Phase 5
  const pumpSales = 0;

  // 5. Theoretical closing stock
  const theoreticalClosing = openingNSV + deliveriesNSV - pumpSales;

  // 6. Daily variance
  const varianceLitres = closingNSV - theoreticalClosing;

  // 7. Write to daily_reconciliation
  await db.query(
    `INSERT INTO daily_reconciliation
       (tank_id, recon_date, opening_nsv, closing_nsv,
        deliveries_nsv, pump_sales_litres,
        theoretical_closing, variance_litres)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tank_id, recon_date)
     DO UPDATE SET
        opening_nsv          = EXCLUDED.opening_nsv,
        closing_nsv          = EXCLUDED.closing_nsv,
        deliveries_nsv       = EXCLUDED.deliveries_nsv,
        pump_sales_litres    = EXCLUDED.pump_sales_litres,
        theoretical_closing  = EXCLUDED.theoretical_closing,
        variance_litres      = EXCLUDED.variance_litres`,
    [
      tank.id, date,
      openingNSV.toFixed(3),
      closingNSV.toFixed(3),
      deliveriesNSV.toFixed(3),
      pumpSales,
      theoreticalClosing.toFixed(3),
      varianceLitres.toFixed(3),
    ]
  );

  console.log('[DAILY-RECON] Tank ' + tank.tank_number + ' (' + tank.fuel_type + ')');
  console.log('  Opening NSV:         ' + openingNSV.toFixed(1) + 'L');
  console.log('  Deliveries received: ' + deliveriesNSV.toFixed(1) + 'L');
  console.log('  Pump sales:          ' + pumpSales.toFixed(1) + 'L');
  console.log('  Theoretical closing: ' + theoreticalClosing.toFixed(1) + 'L');
  console.log('  Actual closing:      ' + closingNSV.toFixed(1) + 'L');
  console.log('  Daily variance:      ' + varianceLitres.toFixed(1) + 'L');
}

// Run directly: node src/daily-recon.js
// Or pass a date: node src/daily-recon.js 2026-05-18
async function main () {
  if (!DATABASE_URL) {
    console.error('[DAILY-RECON] DATABASE_URL not set');
    process.exit(1);
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const date = process.argv[2] || null;

  try {
    await runDailyRecon(db, date);
  } catch (err) {
    console.error('[DAILY-RECON] Error:', err.message);
  } finally {
    await db.end();
  }
}

module.exports = { runDailyRecon };

if (require.main === module) main();