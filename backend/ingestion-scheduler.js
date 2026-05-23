/**
 * FuelSense - Ingestion Scheduler
 * Phase 2, Step 4 & 5 + Phase 3 wired in
 *
 * Runs every 60 seconds:
 *   1. Polls the ATG client for live tank readings
 *   2. Looks up each tank in the database by probe ID
 *   3. Calls the measurement engine to compute TOV, GOV, VCF, NSV
 *   4. Writes a new row to atg_readings
 *   5. Runs delivery detection logic (Step 5)
 *
 * Usage:
 *   node ingestion-scheduler.js
 *
 * Requires:
 *   npm install pg dotenv
 */

require('dotenv').config();

const { getInventory } = require('./atg-client');
const { calculateNSV } = require('./measurement-engine');

// ---------------------------------------------------------------------------
// Database client (PostgreSQL)
// ---------------------------------------------------------------------------
const { Pool } = require('pg');

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 60_000;
const DELIVERY_RISE_THRESHOLD = 50;
const STABLE_CYCLES_REQUIRED = 10;
const READING_GAP_ALERT_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// In-memory state for delivery detection
// Keyed by tankId (UUID from DB)
// ---------------------------------------------------------------------------
const tankState = {};

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function getTankByProbeNumber(probeNumber) {
    const result = await db.query(
        'SELECT * FROM tanks WHERE tank_number = $1 LIMIT 1',
        [probeNumber]
    );
    return result.rows[0] || null;
}

async function insertReading(tankId, reading, volumes) {
    const sql = `
    INSERT INTO atg_readings (
      id, tank_id, recorded_at,
      innage_mm, water_mm, temperature_c,
      tov_litres, water_litres, gov_litres, vcf, nsv_litres,
      is_locked
    ) VALUES (
      gen_random_uuid(), $1, NOW(),
      $2, $3, $4,
      $5, $6, $7, $8, $9,
      FALSE
    )
    RETURNING id
  `;
    const values = [
        tankId,
        reading.innageMm,
        reading.waterMm,
        reading.tempC,
        volumes.tov_litres,
        volumes.water_litres,
        volumes.gov_litres,
        volumes.vcf,
        volumes.nsv_litres,
    ];
    const result = await db.query(sql, values);
    return result.rows[0].id;
}

async function createDelivery(tankId) {
    const sql = `
    INSERT INTO deliveries (
      id, tank_id, status, offload_started_at
    ) VALUES (
      gen_random_uuid(), $1, 'in_progress', NOW()
    )
    RETURNING id
  `;
    const result = await db.query(sql, [tankId]);
    return result.rows[0].id;
}

async function markOffloadEnded(deliveryId) {
    await db.query(
        `UPDATE deliveries
     SET offload_ended_at = NOW(), status = 'awaiting_stabilisation'
     WHERE id = $1`,
        [deliveryId]
    );
}

// ---------------------------------------------------------------------------
// Delivery detection (Step 5)
// ---------------------------------------------------------------------------
async function runDeliveryDetection(tankId, currentInnageMm, readingId) {
    if (!tankState[tankId]) {
        tankState[tankId] = {
            lastInnageMm: currentInnageMm,
            lastReadingAt: new Date(),
            risingCycles: 0,
            stableCycles: 0,
            deliveryId: null,
            deliveryStatus: 'none',
        };
        return;
    }

    const state = tankState[tankId];
    const delta = currentInnageMm - state.lastInnageMm;

    if (delta > DELIVERY_RISE_THRESHOLD) {
        state.stableCycles = 0;

        if (state.deliveryStatus === 'none') {
            const deliveryId = await createDelivery(tankId);
            state.deliveryId = deliveryId;
            state.deliveryStatus = 'in_progress';
            console.log(
                '[scheduler] DELIVERY STARTED - tank ' + tankId +
                ' | rise: +' + delta.toFixed(1) + 'mm' +
                ' | delivery: ' + deliveryId
            );
        } else {
            state.risingCycles++;
            console.log(
                '[scheduler] Delivery in progress - tank ' + tankId +
                ' | rise: +' + delta.toFixed(1) + 'mm' +
                ' | cycle: ' + state.risingCycles
            );
        }

    } else if (state.deliveryStatus === 'in_progress') {
        state.stableCycles++;
        console.log(
            '[scheduler] Level stabilising - tank ' + tankId +
            ' | stable cycles: ' + state.stableCycles + '/' + STABLE_CYCLES_REQUIRED
        );

        if (state.stableCycles >= STABLE_CYCLES_REQUIRED) {
            await markOffloadEnded(state.deliveryId);
            state.deliveryStatus = 'awaiting_stabilisation';
            state.risingCycles = 0;
            state.stableCycles = 0;
            console.log(
                '[scheduler] OFFLOAD ENDED - tank ' + tankId +
                ' | delivery: ' + state.deliveryId +
                ' | now awaiting temperature stabilisation'
            );
        }
    }

    state.lastInnageMm = currentInnageMm;
    state.lastReadingAt = new Date();
}

// ---------------------------------------------------------------------------
// Alert helpers (Phase 5 will wire in real SMS/push)
// ---------------------------------------------------------------------------
function sendReadingGapAlert(tankId, gapMs) {
    console.warn(
        '[ALERT] No reading received for tank ' + tankId +
        ' in ' + Math.round(gapMs / 60000) + ' minutes'
    );
}

function sendHighWaterAlert(tankId, waterMm) {
    console.warn(
        '[ALERT] High water level on tank ' + tankId +
        ': ' + waterMm + 'mm (threshold: 50mm)'
    );
}

// ---------------------------------------------------------------------------
// One poll cycle
// ---------------------------------------------------------------------------
async function runPollCycle() {
    const cycleStart = new Date();
    console.log('[scheduler] Poll cycle started at ' + cycleStart.toISOString());

    let readings;
    try {
        readings = await getInventory();
    } catch (err) {
        console.error('[scheduler] Failed to get inventory from ATG:', err.message);
        for (const [tankId, state] of Object.entries(tankState)) {
            const gapMs = Date.now() - state.lastReadingAt.getTime();
            if (gapMs > READING_GAP_ALERT_MS) sendReadingGapAlert(tankId, gapMs);
        }
        return;
    }

    for (const reading of readings) {
        let tank;
        try {
            tank = await getTankByProbeNumber(reading.tankNumber);
        } catch (err) {
            console.error('[scheduler] DB error looking up tank ' + reading.tankNumber + ':', err.message);
            continue;
        }

        if (!tank) {
            console.warn('[scheduler] No tank found in DB for probe number ' + reading.tankNumber + ' - skipping');
            continue;
        }

        let volumes;
        try {
            volumes = await calculateNSV(
                tank.id,
                reading.innageMm,
                reading.waterMm,
                reading.tempC
            );
        } catch (err) {
            console.error('[scheduler] Volume calculation failed for tank ' + tank.id + ':', err.message);
            continue;
        }

        let readingId;
        try {
            readingId = await insertReading(tank.id, reading, volumes);
            console.log(
                '[scheduler] Reading saved' +
                ' | tank: ' + tank.tank_number +
                ' (' + reading.product + ')' +
                ' | innage: ' + reading.innageMm + 'mm' +
                ' | temp: ' + reading.tempC + 'C' +
                ' | water: ' + reading.waterMm + 'mm' +
                ' | nsv: ' + volumes.nsv_litres + 'L' +
                ' | id: ' + readingId
            );
        } catch (err) {
            console.error('[scheduler] Failed to insert reading for tank ' + tank.id + ':', err.message);
            continue;
        }

        if (reading.waterMm > 50) sendHighWaterAlert(tank.id, reading.waterMm);

        try {
            await runDeliveryDetection(tank.id, reading.innageMm, readingId);
        } catch (err) {
            console.error('[scheduler] Delivery detection error for tank ' + tank.id + ':', err.message);
        }
    }

    const elapsed = Date.now() - cycleStart.getTime();
    console.log('[scheduler] Poll cycle complete in ' + elapsed + 'ms');
    console.log('');
}

// ---------------------------------------------------------------------------
// Start the scheduler
// ---------------------------------------------------------------------------
async function start() {
    console.log('');
    console.log('================================================');
    console.log('  FuelSense Ingestion Scheduler');
    console.log('  Poll interval: ' + (POLL_INTERVAL_MS / 1000) + 's');
    console.log('  DB: ' + process.env.DATABASE_URL);
    console.log('================================================');
    console.log('');

    try {
        await db.query('SELECT 1');
        console.log('[scheduler] Database connection OK');
    } catch (err) {
        console.error('[scheduler] Database connection FAILED:', err.message);
        console.error('[scheduler] Continuing anyway - readings will fail until DB is available.');
    }

    await runPollCycle();
    setInterval(runPollCycle, POLL_INTERVAL_MS);
}

start().catch((err) => {
    console.error('[scheduler] Fatal error:', err.message);
    process.exit(1);
});
