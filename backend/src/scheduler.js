require('dotenv').config();
'use strict';

const { Client } = require('pg');
const { fetchInventory, ping } = require('./atg-client');
const { calculateNSV } = require('./measurement-engine');
const { reconcileDelivery } = require('./reconciliation');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const DATABASE_URL = process.env.DATABASE_URL;

const prevReadings = {};
const deliveryState = {};

const RISE_THRESHOLD_MM = 50;
const STABLE_CYCLES_NEEDED = 10;
const STABLE_THRESHOLD_MM = 5;

let db = null;

async function getDb() {
  if (db) return db;
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log('[SCHEDULER] Database connected');
  return db;
}

function calcStdDev(values) {
  if (values.length < 2) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

async function runDeliveryDetection(client, tankId, r, readingId, volumes, timestamp) {
  const prev = prevReadings[tankId];
  if (!deliveryState[tankId]) {
    deliveryState[tankId] = { phase: 'idle', stableCycles: 0, tempWindow: [] };
  }
  const state = deliveryState[tankId];

  state.tempWindow.push(r.temperature_c);
  if (state.tempWindow.length > 30) {
    state.tempWindow.shift();
  }

  if (state.phase === 'idle') {
    if (!prev) return;
    const rise = r.innage_mm - prev.innage_mm;
    if (rise >= RISE_THRESHOLD_MM) {
      state.phase = 'in_progress';
      state.stableCycles = 0;
      state.openingReadingId = prev.readingId;

      await client.query(
        'UPDATE atg_readings SET is_locked = TRUE WHERE id = $1',
        [prev.readingId]
      );

      const delRes = await client.query(
        `INSERT INTO deliveries
           (tank_id, truck_arrived_at, offload_started_at, opening_reading_id,
            status, supplier_name, bol_number, bol_nsv_litres)
         VALUES ($1, $2, $3, $4, 'in_progress', 'Pending Entry', 'PENDING', 1)
         RETURNING id`,
        [tankId, timestamp, timestamp, prev.readingId]
      );

      state.deliveryId = delRes.rows[0].id;
      console.log('[SCHEDULER] Delivery STARTED on Tank ' + r.tankNumber + ' (+' + rise.toFixed(1) + 'mm). ID: ' + state.deliveryId);
    }

  } else if (state.phase === 'in_progress') {
    if (!prev) return;
    const change = Math.abs(r.innage_mm - prev.innage_mm);

    if (change < STABLE_THRESHOLD_MM) {
      state.stableCycles++;
    } else {
      state.stableCycles = 0;
    }

    if (state.stableCycles >= STABLE_CYCLES_NEEDED) {
      state.phase = 'awaiting_stabilisation';
      state.offloadEndedAt = timestamp;
      state.stableCycles = 0;
      state.tempWindow = [];

      await client.query(
        `UPDATE deliveries
            SET offload_ended_at = $1, status = 'awaiting_stabilisation'
          WHERE id = $2`,
        [timestamp, state.deliveryId]
      );
      console.log('[SCHEDULER] Offload complete - awaiting stabilisation. Delivery: ' + state.deliveryId);
    }

  } else if (state.phase === 'awaiting_stabilisation') {
    const stdDev = calcStdDev(state.tempWindow);
    const elapsed = (timestamp - state.offloadEndedAt) / 3600000;
    const stabilised = state.tempWindow.length >= 30 && stdDev < 0.3;
    const timedOut = elapsed >= 14;

    if (stabilised || timedOut) {
      if (timedOut && !stabilised) {
        console.warn('[SCHEDULER] Stabilisation timeout (14h) for delivery ' + state.deliveryId);
      } else {
        console.log('[SCHEDULER] Temperature stabilised (std dev ' + stdDev.toFixed(3) + 'C)');
      }

      await client.query(
        'UPDATE atg_readings SET is_locked = TRUE WHERE id = $1',
        [readingId]
      );

      await client.query(
        `UPDATE deliveries
            SET closing_reading_id = $1, stabilisation_at = $2, status = 'pending'
          WHERE id = $3`,
        [readingId, timestamp, state.deliveryId]
      );

      console.log('[SCHEDULER] Closing reading locked. Running reconciliation...');
      try {
        await reconcileDelivery(client, state.deliveryId);
      } catch (err) {
        console.error('[SCHEDULER] Reconciliation error:', err.message);
      }
      deliveryState[tankId] = { phase: 'idle', stableCycles: 0, tempWindow: [] };
    }
  }
}

async function processTankReading(client, r, timestamp) {
  const tankRes = await client.query(
    'SELECT id, fuel_density_at_15c FROM tanks WHERE atg_probe_id = $1 LIMIT 1',
    ['PROBE-00' + r.tankNumber]
  );

  if (!tankRes.rows.length) {
    console.warn('[SCHEDULER] No tank found for PROBE-00' + r.tankNumber);
    return;
  }

  const tankId = tankRes.rows[0].id;

  let volumes;
  try {
    volumes = await calculateNSV(client, tankId, r.innage_mm, r.water_mm, r.temperature_c);
  } catch (err) {
    console.error('[SCHEDULER] Measurement engine error (tank ' + r.tankNumber + '):', err.message);
    return;
  }

  const insertRes = await client.query(
    `INSERT INTO atg_readings
       (tank_id, recorded_at, innage_mm, water_mm, temperature_c,
        tov_litres, water_litres, gov_litres, vcf, nsv_litres)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      tankId, timestamp,
      r.innage_mm, r.water_mm, r.temperature_c,
      volumes.tov_litres, volumes.water_litres,
      volumes.gov_litres, volumes.vcf, volumes.nsv_litres,
    ]
  );

  const readingId = insertRes.rows[0].id;

  console.log(
    '[SCHEDULER] Tank ' + r.tankNumber + ' (' + r.product + ')' +
    ' | innage=' + r.innage_mm + 'mm' +
    ' | NSV=' + volumes.nsv_litres.toFixed(1) + 'L' +
    ' | temp=' + r.temperature_c + 'C' +
    ' | VCF=' + volumes.vcf
  );

  if (r.water_mm > 50) {
    console.warn('[ALERT] High water on Tank ' + r.tankNumber + ': ' + r.water_mm + 'mm');
  }

  await runDeliveryDetection(client, tankId, r, readingId, volumes, timestamp);

  prevReadings[tankId] = {
    innage_mm: r.innage_mm,
    nsv_litres: volumes.nsv_litres,
    recorded_at: timestamp,
    readingId: readingId,
  };
}

async function poll() {
  const client = await getDb();

  const alive = await ping();
  if (!alive) {
    console.error('[SCHEDULER] ATG unreachable - no reading written');
    return;
  }

  let result;
  try {
    result = await fetchInventory();
  } catch (err) {
    console.error('[SCHEDULER] fetchInventory failed:', err.message);
    return;
  }

  if (!result.readings.length) {
    console.warn('[SCHEDULER] Zero readings returned from ATG');
    return;
  }

  for (const r of result.readings) {
    await processTankReading(client, r, result.parsedAt);
  }
}

async function start() {
  if (!DATABASE_URL) {
    console.error('[SCHEDULER] DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('[SCHEDULER] Starting FuelSense scheduler...');
  console.log('[SCHEDULER] Poll interval: ' + (POLL_INTERVAL_MS / 1000) + 's');

  try {
    await poll();
  } catch (err) {
    console.error('[SCHEDULER] Initial poll error:', err.message);
  }

  setInterval(async function() {
    try {
      await poll();
    } catch (err) {
      console.error('[SCHEDULER] Poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);
}

start();