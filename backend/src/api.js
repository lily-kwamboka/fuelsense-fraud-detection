require('dotenv').config();
'use strict';

const express    = require('express');
const cors       = require('cors');
const { Client } = require('pg');
const { getAlerts, acknowledgeAlert, checkHighWaterAlert, checkLowStockAlert } = require('./alerts');
const { openShift, closeShift, getAllShifts, getShifts } = require('./shift-manager');

const app          = express();
const PORT         = process.env.API_PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;

app.use(cors());
app.use(express.json());

let db = null;

async function getDb() {
  if (db) return db;
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log('[API] Database connected');
  return db;
}

// ── GET /api/tanks ────────────────────────────────────────────────────────
app.get('/api/tanks', async (req, res) => {
  try {
    const client      = await getDb();
    const stationId   = req.query.station_id;
    const supabaseUid = req.query.uid;

    let query = `
      SELECT
         t.id,
         t.tank_number,
         t.fuel_type,
         t.capacity_litres,
         t.fuel_density_at_15c,
         t.low_stock_threshold_pct,
         s.name AS station_name,
         s.id   AS station_id,
         r.innage_mm,
         r.water_mm,
         r.temperature_c,
         r.nsv_litres,
         r.vcf,
         r.recorded_at,
         ROUND((r.nsv_litres / t.capacity_litres) * 100, 1) AS fill_pct
       FROM tanks t
       JOIN stations s ON s.id = t.station_id
       LEFT JOIN LATERAL (
         SELECT * FROM atg_readings
         WHERE tank_id = t.id
         ORDER BY recorded_at DESC
         LIMIT 1
       ) r ON TRUE`;

    const params = [];

    if (stationId) {
      params.push(stationId);
      query += ` WHERE t.station_id = $${params.length}`;
    } else if (supabaseUid) {
      const userRes = await client.query(
        `SELECT role, station_id FROM user_profiles WHERE supabase_uid = $1`,
        [supabaseUid]
      );
      if (userRes.rows.length && userRes.rows[0].role === 'manager' && userRes.rows[0].station_id) {
        params.push(userRes.rows[0].station_id);
        query += ` WHERE t.station_id = $${params.length}`;
      }
    }

    query += ` ORDER BY s.name, t.tank_number`;

    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[API] /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stations ─────────────────────────────────────────────────────
app.get('/api/stations', async (req, res) => {
  try {
    const client      = await getDb();
    const supabaseUid = req.query.uid;

    let query  = `SELECT id, name, location FROM stations ORDER BY name`;
    let params = [];

    if (supabaseUid) {
      const userRes = await client.query(
        `SELECT role, station_id FROM user_profiles WHERE supabase_uid = $1`,
        [supabaseUid]
      );
      if (userRes.rows.length && userRes.rows[0].role === 'manager' && userRes.rows[0].station_id) {
        params.push(userRes.rows[0].station_id);
        query = `SELECT id, name, location FROM stations WHERE id = $1`;
      }
    }

    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/user-profile ─────────────────────────────────────────────────
app.get('/api/user-profile', async (req, res) => {
  try {
    const client      = await getDb();
    const supabaseUid = req.query.uid;

    if (!supabaseUid) return res.status(400).json({ error: 'uid required' });

    const result = await client.query(
      `SELECT u.*, s.name AS station_name
         FROM user_profiles u
         LEFT JOIN stations s ON s.id = u.station_id
        WHERE u.supabase_uid = $1`,
      [supabaseUid]
    );

    if (!result.rows.length) {
      return res.json({ role: 'manager', station_id: null });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tanks/:id/readings ───────────────────────────────────────────
app.get('/api/tanks/:id/readings', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT innage_mm, nsv_litres, temperature_c, water_mm, vcf, recorded_at
         FROM atg_readings
        WHERE tank_id = $1
        ORDER BY recorded_at DESC
        LIMIT 60`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries ───────────────────────────────────────────────────
app.get('/api/deliveries', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT
         d.id,
         d.status,
         d.supplier_name,
         d.bol_number,
         d.bol_nsv_litres,
         d.received_nsv_litres,
         d.variance_litres,
         d.variance_pct,
         d.variance_classification,
         d.tolerance_pct,
         d.truck_arrived_at,
         d.stabilisation_at,
         t.tank_number,
         t.fuel_type
       FROM deliveries d
       JOIN tanks t ON t.id = d.tank_id
       ORDER BY d.truck_arrived_at DESC NULLS LAST
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries/:id ───────────────────────────────────────────────
app.get('/api/deliveries/:id', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT
         d.*,
         t.tank_number,
         t.fuel_type,
         o.innage_mm     AS opening_innage_mm,
         o.temperature_c AS opening_temp,
         o.nsv_litres    AS opening_nsv,
         o.recorded_at   AS opening_recorded_at,
         c.innage_mm     AS closing_innage_mm,
         c.temperature_c AS closing_temp,
         c.nsv_litres    AS closing_nsv,
         c.recorded_at   AS closing_recorded_at
       FROM deliveries d
       JOIN tanks t             ON t.id = d.tank_id
       LEFT JOIN atg_readings o ON o.id = d.opening_reading_id
       LEFT JOIN atg_readings c ON c.id = d.closing_reading_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Delivery not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] GET /api/deliveries/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deliveries ──────────────────────────────────────────────────
app.post('/api/deliveries', async (req, res) => {
  const { tank_id, supplier_name, bol_number, bol_nsv_litres } = req.body;
  if (!tank_id || !supplier_name || !bol_number || !bol_nsv_litres) {
    return res.status(400).json({ error: 'Missing required fields: tank_id, supplier_name, bol_number, bol_nsv_litres' });
  }
  try {
    const client     = await getDb();
    const readingRes = await client.query(
      `SELECT id, nsv_litres FROM atg_readings WHERE tank_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [tank_id]
    );
    if (!readingRes.rows.length) return res.status(400).json({ error: 'No ATG readings found for this tank' });

    const openingReading = readingRes.rows[0];
    await client.query('UPDATE atg_readings SET is_locked = TRUE WHERE id = $1', [openingReading.id]);

    const delRes = await client.query(
      `INSERT INTO deliveries (tank_id, supplier_name, bol_number, bol_nsv_litres, truck_arrived_at, opening_reading_id, status)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'in_progress') RETURNING id`,
      [tank_id, supplier_name, bol_number, bol_nsv_litres, openingReading.id]
    );
    console.log('[API] Delivery created:', delRes.rows[0].id);
    res.status(201).json({ delivery_id: delRes.rows[0].id, opening_nsv: openingReading.nsv_litres, message: 'Delivery created. Opening reading locked.' });
  } catch (err) {
    console.error('[API] POST /api/deliveries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reconciliation ───────────────────────────────────────────────
app.get('/api/reconciliation', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT
         r.recon_date,
         r.opening_nsv,
         r.closing_nsv,
         r.deliveries_nsv,
         r.pump_sales_litres,
         r.theoretical_closing,
         r.variance_litres,
         t.tank_number,
         t.fuel_type
       FROM daily_reconciliation r
       JOIN tanks t ON t.id = r.tank_id
       ORDER BY r.recon_date DESC, t.tank_number
       LIMIT 60`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/reconciliation/pump-sales ──────────────────────────────────
app.post('/api/reconciliation/pump-sales', async (req, res) => {
  const { tank_id, recon_date, pump_sales_litres } = req.body;
  if (!tank_id || !recon_date || pump_sales_litres === undefined) {
    return res.status(400).json({ error: 'Missing required fields: tank_id, recon_date, pump_sales_litres' });
  }
  try {
    const client   = await getDb();
    const openRes  = await client.query(`SELECT nsv_litres FROM atg_readings WHERE tank_id = $1 AND recorded_at::date = $2::date ORDER BY recorded_at ASC  LIMIT 1`, [tank_id, recon_date]);
    const closeRes = await client.query(`SELECT nsv_litres FROM atg_readings WHERE tank_id = $1 AND recorded_at::date = $2::date ORDER BY recorded_at DESC LIMIT 1`, [tank_id, recon_date]);

    if (!openRes.rows.length || !closeRes.rows.length) {
      return res.status(400).json({ error: 'No readings found for this tank on this date' });
    }

    const openingNSV         = parseFloat(openRes.rows[0].nsv_litres);
    const closingNSV         = parseFloat(closeRes.rows[0].nsv_litres);
    const delivRes           = await client.query(
      `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total FROM deliveries WHERE tank_id = $1 AND status IN ('confirmed','flagged') AND stabilisation_at::date = $2::date`,
      [tank_id, recon_date]
    );
    const deliveriesNSV      = parseFloat(delivRes.rows[0].total) || 0;
    const sales              = parseFloat(pump_sales_litres);
    const theoreticalClosing = openingNSV + deliveriesNSV - sales;
    const varianceLitres     = closingNSV - theoreticalClosing;

    await client.query(
      `INSERT INTO daily_reconciliation (tank_id, recon_date, opening_nsv, closing_nsv, deliveries_nsv, pump_sales_litres, theoretical_closing, variance_litres)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tank_id, recon_date) DO UPDATE SET
          pump_sales_litres   = EXCLUDED.pump_sales_litres,
          theoretical_closing = EXCLUDED.theoretical_closing,
          variance_litres     = EXCLUDED.variance_litres`,
      [tank_id, recon_date, openingNSV.toFixed(3), closingNSV.toFixed(3), deliveriesNSV.toFixed(3), sales.toFixed(3), theoreticalClosing.toFixed(3), varianceLitres.toFixed(3)]
    );

    res.json({ ok: true, opening_nsv: openingNSV.toFixed(1), closing_nsv: closingNSV.toFixed(1), deliveries_nsv: deliveriesNSV.toFixed(1), pump_sales_litres: sales.toFixed(1), theoretical_closing: theoreticalClosing.toFixed(1), variance_litres: varianceLitres.toFixed(1) });
  } catch (err) {
    console.error('[API] pump-sales error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts ───────────────────────────────────────────────────────
app.get('/api/alerts', async (req, res) => {
  try {
    const client = await getDb();
    const status = req.query.status || null;
    const limit  = parseInt(req.query.limit) || 50;
    const alerts = await getAlerts(client, { status, limit });
    res.json(alerts);
  } catch (err) {
    console.error('[API] GET /api/alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts/summary ───────────────────────────────────────────────
app.get('/api/alerts/summary', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT severity, COUNT(*) AS count
         FROM alerts
        WHERE status = 'open'
        GROUP BY severity`
    );
    const summary = { critical: 0, warning: 0, info: 0 };
    for (const row of result.rows) {
      summary[row.severity] = parseInt(row.count);
    }
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/:id/acknowledge ─────────────────────────────────────
app.post('/api/alerts/:id/acknowledge', async (req, res) => {
  const { acknowledged_by } = req.body;
  if (!acknowledged_by) return res.status(400).json({ error: 'acknowledged_by is required' });
  try {
    const client = await getDb();
    await acknowledgeAlert(client, req.params.id, acknowledged_by);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] acknowledge alert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shifts ───────────────────────────────────────────────────────
app.get('/api/shifts', async (req, res) => {
  try {
    const client = await getDb();
    const shifts = await getAllShifts(client, parseInt(req.query.limit) || 50);
    res.json(shifts);
  } catch (err) {
    console.error('[API] GET /api/shifts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shifts/tank/:tankId ──────────────────────────────────────────
app.get('/api/shifts/tank/:tankId', async (req, res) => {
  try {
    const client = await getDb();
    const shifts = await getShifts(client, req.params.tankId);
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/shifts/open ─────────────────────────────────────────────────
app.post('/api/shifts/open', async (req, res) => {
  const { tank_id, attendant_name } = req.body;
  if (!tank_id) return res.status(400).json({ error: 'tank_id is required' });
  try {
    const client = await getDb();
    const result = await openShift(client, tank_id, attendant_name);
    res.status(201).json(result);
  } catch (err) {
    console.error('[API] POST /api/shifts/open error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/shifts/:id/close ────────────────────────────────────────────
app.post('/api/shifts/:id/close', async (req, res) => {
  const { pump_meter_opening, pump_meter_closing, notes } = req.body;
  try {
    const client = await getDb();
    const result = await closeShift(client, req.params.id, {
      pumpMeterOpening: pump_meter_opening,
      pumpMeterClosing: pump_meter_closing,
      notes,
    });
    res.json(result);
  } catch (err) {
    console.error('[API] POST /api/shifts/:id/close error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pump-vs-dip ──────────────────────────────────────────────────
app.get('/api/pump-vs-dip', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT
         s.id,
         s.shift_name,
         s.shift_date,
         s.opening_nsv,
         s.closing_nsv,
         s.pump_meter_sales,
         s.dip_sales,
         s.variance_litres,
         s.variance_pct,
         s.status,
         s.attendant_name,
         t.tank_number,
         t.fuel_type
       FROM shifts s
       JOIN tanks t ON t.id = s.tank_id
       WHERE s.status IN ('closed', 'flagged')
         AND s.dip_sales IS NOT NULL
       ORDER BY s.shift_date DESC, s.started_at DESC
       LIMIT 60`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/audit-log ─────────────────────────────────────────────────────
app.post('/api/audit-log', async (req, res) => {
  const { user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value } = req.body;
  if (!user_email || !action || !entity_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const client = await getDb();
    await client.query(
      `INSERT INTO audit_log
         (user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        user_email, user_role || null, action, entity_type,
        entity_id || null, station_id || null,
        old_value ? JSON.stringify(old_value) : null,
        new_value ? JSON.stringify(new_value) : null,
        req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] audit-log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/audit-log ──────────────────────────────────────────────────────
app.get('/api/audit-log', async (req, res) => {
  try {
    const client    = await getDb();
    const stationId = req.query.station_id;
    const limit     = parseInt(req.query.limit || '50');
    let query  = `SELECT id, user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address, created_at FROM audit_log`;
    const params = [];
    if (stationId) {
      params.push(stationId);
      query += ` WHERE station_id = $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('[API] FuelSense API running on port ' + PORT);
});

// ── Ingestion Scheduler ───────────────────────────────────────────────────
setTimeout(async () => {
  try {
    const { getInventory } = require('../atg-client');
    const { calculateNSV } = require('../measurement-engine');

    const tankState = {};
    const DELIVERY_RISE_THRESHOLD = 50;
    const STABLE_CYCLES_REQUIRED  = 10;

    async function pollCycle() {
      console.log('[scheduler] Poll cycle started at ' + new Date().toISOString());
      let readings;
      try {
        readings = await getInventory();
      } catch (err) {
        console.error('[scheduler] ATG error:', err.message);
        return;
      }

      const client = await getDb();

      for (const reading of readings) {
        try {
          const tankRes = await client.query(
            'SELECT * FROM tanks WHERE tank_number = $1 LIMIT 1',
            [reading.tankNumber]
          );
          if (!tankRes.rows[0]) { console.warn('[scheduler] No tank for probe ' + reading.tankNumber); continue; }
          const t = tankRes.rows[0];

          const volumes = await calculateNSV(client, t.id, reading.innageMm, reading.waterMm, reading.tempC);

          await client.query(
            `INSERT INTO atg_readings (id, tank_id, recorded_at, innage_mm, water_mm, temperature_c, tov_litres, water_litres, gov_litres, vcf, nsv_litres, is_locked)
             VALUES (gen_random_uuid(), $1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, FALSE)`,
            [t.id, reading.innageMm, reading.waterMm, reading.tempC, volumes.tov_litres, volumes.water_litres, volumes.gov_litres, volumes.vcf, volumes.nsv_litres]
          );

          console.log('[scheduler] Saved | tank ' + t.tank_number + ' (' + reading.product + ') | innage: ' + reading.innageMm + 'mm | nsv: ' + volumes.nsv_litres + 'L');

          // Run alert checks
          const fillPct = (volumes.nsv_litres / parseFloat(t.capacity_litres)) * 100;
          await checkHighWaterAlert(client, t.id, t.tank_number, reading.waterMm);
          await checkLowStockAlert(client, t.id, t.tank_number, t.fuel_type, fillPct, parseFloat(t.low_stock_threshold_pct));

          // Delivery detection
          const state = tankState[t.id];
          if (!state) {
            tankState[t.id] = { lastInnageMm: reading.innageMm, stableCycles: 0, deliveryId: null, deliveryStatus: 'none' };
            continue;
          }
          const delta = reading.innageMm - state.lastInnageMm;
          if (delta > DELIVERY_RISE_THRESHOLD) {
            state.stableCycles = 0;
            if (state.deliveryStatus === 'none') {
              const dRes = await client.query(
                `INSERT INTO deliveries (id, tank_id, status, offload_started_at) VALUES (gen_random_uuid(), $1, 'in_progress', NOW()) RETURNING id`,
                [t.id]
              );
              state.deliveryId     = dRes.rows[0].id;
              state.deliveryStatus = 'in_progress';
              console.log('[scheduler] DELIVERY STARTED tank ' + t.tank_number + ' rise: +' + delta.toFixed(1) + 'mm');
            }
          } else if (state.deliveryStatus === 'in_progress') {
            state.stableCycles++;
            if (state.stableCycles >= STABLE_CYCLES_REQUIRED) {
              await client.query(
                `UPDATE deliveries SET offload_ended_at = NOW(), status = 'awaiting_stabilisation' WHERE id = $1`,
                [state.deliveryId]
              );
              state.deliveryStatus = 'awaiting_stabilisation';
              state.stableCycles   = 0;
              console.log('[scheduler] OFFLOAD ENDED delivery ' + state.deliveryId);
            }
          }
          state.lastInnageMm = reading.innageMm;
        } catch (err) {
          console.error('[scheduler] Error processing tank ' + reading.tankNumber + ':', err.message);
        }
      }
      console.log('[scheduler] Poll cycle complete\n');
    }

    await pollCycle();
    setInterval(pollCycle, 60000);
    console.log('[scheduler] Started inside API process ✓');
  } catch (err) {
    console.error('[scheduler] Failed to start:', err.message);
  }
}, 3000);

module.exports = app;