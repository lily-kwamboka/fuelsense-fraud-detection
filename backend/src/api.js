require('dotenv').config();
'use strict';

const express    = require('express');
const cors       = require('cors');
const { Client } = require('pg');

const app        = express();
const PORT       = process.env.API_PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;

app.use(cors());
app.use(express.json());

let db = null;

async function getDb () {
  if (db) return db;
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log('[API] Database connected');
  return db;
}

// ── GET /api/tanks ──────────────────────────────────────────
// Returns all tanks with their latest reading
app.get('/api/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT
         t.id,
         t.tank_number,
         t.fuel_type,
         t.capacity_litres,
         t.fuel_density_at_15c,
         s.name AS station_name,
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
       ) r ON TRUE
       ORDER BY t.tank_number`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[API] /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tanks/:id/readings ─────────────────────────────
// Returns last 60 readings for a tank (1 hour of data)
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

// ── GET /api/deliveries ─────────────────────────────────────
// Returns last 20 deliveries across all tanks
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
       ORDER BY d.truck_arrived_at DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries/:id ─────────────────────────────────
// Returns full delivery detail with opening/closing readings
app.get('/api/deliveries/:id', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT
         d.*,
         t.tank_number,
         t.fuel_type,
         o.innage_mm        AS opening_innage_mm,
         o.temperature_c    AS opening_temp,
         o.nsv_litres       AS opening_nsv,
         o.recorded_at      AS opening_recorded_at,
         c.innage_mm        AS closing_innage_mm,
         c.temperature_c    AS closing_temp,
         c.nsv_litres       AS closing_nsv,
         c.recorded_at      AS closing_recorded_at
       FROM deliveries d
       JOIN tanks t             ON t.id = d.tank_id
       LEFT JOIN atg_readings o ON o.id = d.opening_reading_id
       LEFT JOIN atg_readings c ON c.id = d.closing_reading_id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] GET /api/deliveries/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deliveries ────────────────────────────────────
// Creates a new delivery and locks the opening reading
app.post('/api/deliveries', async (req, res) => {
  const { tank_id, supplier_name, bol_number, bol_nsv_litres } = req.body;

  if (!tank_id || !supplier_name || !bol_number || !bol_nsv_litres) {
    return res.status(400).json({ error: 'Missing required fields: tank_id, supplier_name, bol_number, bol_nsv_litres' });
  }

  try {
    const client = await getDb();

    const readingRes = await client.query(
      `SELECT id, nsv_litres FROM atg_readings
        WHERE tank_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [tank_id]
    );

    if (!readingRes.rows.length) {
      return res.status(400).json({ error: 'No ATG readings found for this tank' });
    }

    const openingReading = readingRes.rows[0];

    await client.query(
      'UPDATE atg_readings SET is_locked = TRUE WHERE id = $1',
      [openingReading.id]
    );

    const now = new Date();
    const delRes = await client.query(
      `INSERT INTO deliveries
         (tank_id, supplier_name, bol_number, bol_nsv_litres,
          truck_arrived_at, opening_reading_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'in_progress')
       RETURNING id`,
      [tank_id, supplier_name, bol_number, bol_nsv_litres, now, openingReading.id]
    );

    console.log('[API] Delivery created:', delRes.rows[0].id);
    res.status(201).json({
      delivery_id:  delRes.rows[0].id,
      opening_nsv:  openingReading.nsv_litres,
      message:      'Delivery created. Opening reading locked.',
    });
  } catch (err) {
    console.error('[API] POST /api/deliveries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reconciliation ─────────────────────────────────
// Returns last 60 daily reconciliation rows across all tanks
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

// ── POST /api/reconciliation/pump-sales ─────────────────────
// Update pump sales for a tank on a specific date
app.post('/api/reconciliation/pump-sales', async (req, res) => {
  const { tank_id, recon_date, pump_sales_litres } = req.body;

  if (!tank_id || !recon_date || pump_sales_litres === undefined) {
    return res.status(400).json({ error: 'Missing required fields: tank_id, recon_date, pump_sales_litres' });
  }

  try {
    const client = await getDb();

    const openRes = await client.query(
      `SELECT nsv_litres FROM atg_readings
        WHERE tank_id = $1 AND recorded_at::date = $2::date
        ORDER BY recorded_at ASC LIMIT 1`,
      [tank_id, recon_date]
    );

    const closeRes = await client.query(
      `SELECT nsv_litres FROM atg_readings
        WHERE tank_id = $1 AND recorded_at::date = $2::date
        ORDER BY recorded_at DESC LIMIT 1`,
      [tank_id, recon_date]
    );

    if (!openRes.rows.length || !closeRes.rows.length) {
      return res.status(400).json({ error: 'No readings found for this tank on this date' });
    }

    const openingNSV  = parseFloat(openRes.rows[0].nsv_litres);
    const closingNSV  = parseFloat(closeRes.rows[0].nsv_litres);

    const delivRes = await client.query(
      `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total
         FROM deliveries
        WHERE tank_id = $1
          AND status IN ('confirmed', 'flagged')
          AND stabilisation_at::date = $2::date`,
      [tank_id, recon_date]
    );

    const deliveriesNSV      = parseFloat(delivRes.rows[0].total) || 0;
    const sales              = parseFloat(pump_sales_litres);
    const theoreticalClosing = openingNSV + deliveriesNSV - sales;
    const varianceLitres     = closingNSV - theoreticalClosing;

    await client.query(
      `INSERT INTO daily_reconciliation
         (tank_id, recon_date, opening_nsv, closing_nsv,
          deliveries_nsv, pump_sales_litres,
          theoretical_closing, variance_litres)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tank_id, recon_date)
       DO UPDATE SET
          pump_sales_litres   = EXCLUDED.pump_sales_litres,
          theoretical_closing = EXCLUDED.theoretical_closing,
          variance_litres     = EXCLUDED.variance_litres`,
      [
        tank_id, recon_date,
        openingNSV.toFixed(3), closingNSV.toFixed(3),
        deliveriesNSV.toFixed(3), sales.toFixed(3),
        theoreticalClosing.toFixed(3), varianceLitres.toFixed(3),
      ]
    );

    res.json({
      ok:                  true,
      opening_nsv:         openingNSV.toFixed(1),
      closing_nsv:         closingNSV.toFixed(1),
      deliveries_nsv:      deliveriesNSV.toFixed(1),
      pump_sales_litres:   sales.toFixed(1),
      theoretical_closing: theoreticalClosing.toFixed(1),
      variance_litres:     varianceLitres.toFixed(1),
    });

  } catch (err) {
    console.error('[API] pump-sales error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('[API] FuelSense API running on port ' + PORT);
});

module.exports = app;