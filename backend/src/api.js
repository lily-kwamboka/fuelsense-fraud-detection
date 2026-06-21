require('dotenv').config();
'use strict';

const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const { getAlerts, acknowledgeAlert, checkHighWaterAlert, checkLowStockAlert } = require('./alerts');
const { openShift, closeShift, getAllShifts, getShifts } = require('./shift-manager');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.API_PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://fuelsense-dashboard.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://fuelsense-fraud-detection.onrender.com'
];

app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all — tighten after domain verified
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400,
}));

app.use(express.json());

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── DB ────────────────────────────────────────────────────────────────────────
let db = null;
async function getDb() {
  if (db) return db;
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log('[API] Database connected');
  return db;
}

// ── Role access levels ────────────────────────────────────────────────────────
function getRoleAccessLevel(role) {
  return {
    owner: 100, headquarters: 80, supervisor: 70, compliance_officer: 65,
    station_manager: 50, shift_supervisor: 30, attendant: 10
  }[role] || 0;
}

// ── Multi-tenant: resolve caller's organization_id from supabase_uid ─────────
// Returns { orgId, role, stationId, accessLevel } or null if not found
async function resolveUser(db, supabaseUid) {
  if (!supabaseUid) return null;
  const res = await db.query(
    `SELECT role, station_id, organization_id FROM user_profiles WHERE supabase_uid = $1`,
    [supabaseUid]
  );
  if (!res.rows.length) return null;
  const { role, station_id, organization_id } = res.rows[0];
  return { orgId: organization_id, role, stationId: station_id, accessLevel: getRoleAccessLevel(role) };
}

// ── Super admin check ─────────────────────────────────────────────────────────
async function isSuperAdmin(db, email) {
  if (!email) return false;
  const res = await db.query(`SELECT id FROM super_admins WHERE email = $1`, [email]);
  return res.rows.length > 0;
}

// ── Utility endpoints ─────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ message: 'pong', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── GET /api/user-profile ─────────────────────────────────────────────────────
app.get('/api/user-profile', async (req, res) => {
  try {
    const client = await getDb();
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    const result = await client.query(
      `SELECT u.*, s.name AS station_name, o.name AS organization_name
         FROM user_profiles u
         LEFT JOIN stations s ON s.id = u.station_id
         LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.supabase_uid = $1`,
      [uid]
    );
    if (!result.rows.length) return res.json({ role: 'attendant', station_id: null });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stations ─────────────────────────────────────────────────────────
// Returns stations scoped to the caller's organization only
app.get('/api/stations', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);

    if (!user || !user.orgId) return res.json([]);

    let query = `SELECT id, name, location FROM stations WHERE organization_id = $1`;
    const params = [user.orgId];

    // Station-scoped roles: only see their assigned station
    if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      query += ` AND id = $2`;
    }

    query += ` ORDER BY name`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tanks ────────────────────────────────────────────────────────────
app.get('/api/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);
    const stationId = req.query.station_id;

    if (!user || !user.orgId) return res.json([]);

    const params = [user.orgId];
    let where = `s.organization_id = $1`;

    // Further filter by specific station if requested
    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    } else if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT
         t.id, t.tank_number, t.fuel_type, t.capacity_litres,
         t.fuel_density_at_15c, t.low_stock_threshold_pct,
         s.name AS station_name, s.id AS station_id,
         r.innage_mm, r.water_mm, r.temperature_c, r.nsv_litres,
         r.vcf, r.recorded_at,
         ROUND((r.nsv_litres / t.capacity_litres) * 100, 1) AS fill_pct
       FROM tanks t
       JOIN stations s ON s.id = t.station_id
       LEFT JOIN LATERAL (
         SELECT * FROM atg_readings WHERE tank_id = t.id
         ORDER BY recorded_at DESC LIMIT 1
       ) r ON TRUE
       WHERE ${where}
       ORDER BY s.name, t.tank_number`, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[API] /api/tanks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tanks/:id/readings ───────────────────────────────────────────────
app.get('/api/tanks/:id/readings', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT innage_mm, nsv_litres, temperature_c, water_mm, vcf, recorded_at
         FROM atg_readings WHERE tank_id = $1
         ORDER BY recorded_at DESC LIMIT 60`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries ───────────────────────────────────────────────────────
app.get('/api/deliveries', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);
    const stationId = req.query.station_id;

    if (!user || !user.orgId) return res.json([]);

    const params = [user.orgId];
    let where = `s.organization_id = $1`;

    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    } else if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT d.id, d.status, d.supplier_name, d.bol_number, d.bol_nsv_litres,
             d.received_nsv_litres, d.variance_litres, d.variance_pct,
             d.variance_classification, d.tolerance_pct, d.truck_arrived_at,
             d.stabilisation_at, t.tank_number, t.fuel_type
        FROM deliveries d
        JOIN tanks t ON t.id = d.tank_id
        JOIN stations s ON s.id = t.station_id
       WHERE ${where}
       ORDER BY d.truck_arrived_at DESC NULLS LAST
       LIMIT 20`, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deliveries/:id ───────────────────────────────────────────────────
app.get('/api/deliveries/:id', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT d.*, t.tank_number, t.fuel_type,
              o.innage_mm AS opening_innage_mm, o.temperature_c AS opening_temp,
              o.nsv_litres AS opening_nsv, o.recorded_at AS opening_recorded_at,
              c.innage_mm AS closing_innage_mm, c.temperature_c AS closing_temp,
              c.nsv_litres AS closing_nsv, c.recorded_at AS closing_recorded_at
         FROM deliveries d
         JOIN tanks t ON t.id = d.tank_id
         LEFT JOIN atg_readings o ON o.id = d.opening_reading_id
         LEFT JOIN atg_readings c ON c.id = d.closing_reading_id
        WHERE d.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Delivery not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deliveries ──────────────────────────────────────────────────────
app.post('/api/deliveries', async (req, res) => {
  const { tank_id, supplier_name, bol_number, bol_nsv_litres } = req.body;
  if (!tank_id || !supplier_name || !bol_number || !bol_nsv_litres)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    const readingRes = await client.query(
      `SELECT id, nsv_litres FROM atg_readings WHERE tank_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [tank_id]
    );
    if (!readingRes.rows.length) return res.status(400).json({ error: 'No ATG readings found for this tank' });

    const opening = readingRes.rows[0];
    await client.query('UPDATE atg_readings SET is_locked = TRUE WHERE id = $1', [opening.id]);

    const delRes = await client.query(
      `INSERT INTO deliveries (tank_id, supplier_name, bol_number, bol_nsv_litres, truck_arrived_at, opening_reading_id, status)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'in_progress') RETURNING id`,
      [tank_id, supplier_name, bol_number, bol_nsv_litres, opening.id]
    );
    res.status(201).json({ delivery_id: delRes.rows[0].id, opening_nsv: opening.nsv_litres });
  } catch (err) {
    console.error('[API] POST /api/deliveries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reconciliation ───────────────────────────────────────────────────
app.get('/api/reconciliation', async (req, res) => {
  try {
    const client = await getDb();
    const user = await resolveUser(client, req.query.uid);
    const stationId = req.query.station_id;

    if (!user || !user.orgId) return res.json([]);

    const params = [user.orgId];
    let where = `s.organization_id = $1`;

    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    } else if (user.accessLevel < 65 && user.stationId) {
      params.push(user.stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT r.recon_date, r.opening_nsv, r.closing_nsv, r.deliveries_nsv,
             r.pump_sales_litres, r.theoretical_closing, r.variance_litres,
             t.tank_number, t.fuel_type
        FROM daily_reconciliation r
        JOIN tanks t ON t.id = r.tank_id
        JOIN stations s ON s.id = t.station_id
       WHERE ${where}
       ORDER BY r.recon_date DESC, t.tank_number
       LIMIT 60`, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/reconciliation/pump-sales ──────────────────────────────────────
app.post('/api/reconciliation/pump-sales', async (req, res) => {
  const { tank_id, recon_date, pump_sales_litres } = req.body;
  if (!tank_id || !recon_date || pump_sales_litres === undefined)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    const openRes = await client.query(
      `SELECT nsv_litres FROM atg_readings WHERE tank_id=$1 AND recorded_at::date=$2::date ORDER BY recorded_at ASC  LIMIT 1`, [tank_id, recon_date]);
    const closeRes = await client.query(
      `SELECT nsv_litres FROM atg_readings WHERE tank_id=$1 AND recorded_at::date=$2::date ORDER BY recorded_at DESC LIMIT 1`, [tank_id, recon_date]);

    if (!openRes.rows.length || !closeRes.rows.length)
      return res.status(400).json({ error: 'No readings found for this tank on this date' });

    const openNSV = parseFloat(openRes.rows[0].nsv_litres);
    const closeNSV = parseFloat(closeRes.rows[0].nsv_litres);
    const delivRes = await client.query(
      `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total FROM deliveries
        WHERE tank_id=$1 AND status IN ('confirmed','flagged') AND stabilisation_at::date=$2::date`,
      [tank_id, recon_date]
    );
    const delivNSV = parseFloat(delivRes.rows[0].total) || 0;
    const sales = parseFloat(pump_sales_litres);
    const theoCl = openNSV + delivNSV - sales;
    const variance = closeNSV - theoCl;

    await client.query(
      `INSERT INTO daily_reconciliation (tank_id, recon_date, opening_nsv, closing_nsv, deliveries_nsv, pump_sales_litres, theoretical_closing, variance_litres)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tank_id, recon_date) DO UPDATE SET
         pump_sales_litres=EXCLUDED.pump_sales_litres,
         theoretical_closing=EXCLUDED.theoretical_closing,
         variance_litres=EXCLUDED.variance_litres`,
      [tank_id, recon_date, openNSV.toFixed(3), closeNSV.toFixed(3), delivNSV.toFixed(3), sales.toFixed(3), theoCl.toFixed(3), variance.toFixed(3)]
    );

    res.json({ ok: true, variance_litres: variance.toFixed(1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts ───────────────────────────────────────────────────────────
app.get('/api/alerts', async (req, res) => {
  try {
    const client = await getDb();
    const alerts = await getAlerts(client, { status: req.query.status || null, limit: parseInt(req.query.limit) || 50 });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts/summary ───────────────────────────────────────────────────
app.get('/api/alerts/summary', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT severity, COUNT(*) AS count FROM alerts WHERE status='open' GROUP BY severity`
    );
    const summary = { critical: 0, warning: 0, info: 0 };
    for (const row of result.rows) summary[row.severity] = parseInt(row.count);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/:id/acknowledge ─────────────────────────────────────────
app.post('/api/alerts/:id/acknowledge', async (req, res) => {
  if (!req.body.acknowledged_by) return res.status(400).json({ error: 'acknowledged_by is required' });
  try {
    const client = await getDb();
    await acknowledgeAlert(client, req.params.id, req.body.acknowledged_by);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/test ─────────────────────────────────────────────────────
app.post('/api/alerts/test', async (req, res) => {
  const { sendTestAlert } = require('./email-alerts');
  const success = await sendTestAlert();
  success
    ? res.json({ message: 'Test alert sent' })
    : res.status(500).json({ error: 'Failed to send test alert' });
});

// ── Shifts ────────────────────────────────────────────────────────────────────
app.get('/api/shifts', async (req, res) => {
  try {
    const client = await getDb();
    res.json(await getAllShifts(client, parseInt(req.query.limit) || 50));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/shifts/tank/:tankId', async (req, res) => {
  try {
    const client = await getDb();
    res.json(await getShifts(client, req.params.tankId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shifts/open', async (req, res) => {
  if (!req.body.tank_id) return res.status(400).json({ error: 'tank_id is required' });
  try {
    const client = await getDb();
    res.status(201).json(await openShift(client, req.body.tank_id, req.body.attendant_name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shifts/:id/close', async (req, res) => {
  try {
    const client = await getDb();
    res.json(await closeShift(client, req.params.id, {
      pumpMeterOpening: req.body.pump_meter_opening,
      pumpMeterClosing: req.body.pump_meter_closing,
      notes: req.body.notes,
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/pump-vs-dip ──────────────────────────────────────────────────────
app.get('/api/pump-vs-dip', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT s.id, s.shift_name, s.shift_date, s.opening_nsv, s.closing_nsv,
              s.pump_meter_sales, s.dip_sales, s.variance_litres, s.variance_pct,
              s.status, s.attendant_name, t.tank_number, t.fuel_type
         FROM shifts s JOIN tanks t ON t.id = s.tank_id
        WHERE s.status IN ('closed','flagged') AND s.dip_sales IS NOT NULL
        ORDER BY s.shift_date DESC, s.started_at DESC LIMIT 60`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Audit log ─────────────────────────────────────────────────────────────────
app.post('/api/audit-log', async (req, res) => {
  const { user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value } = req.body;
  if (!user_email || !action || !entity_type) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    await client.query(
      `INSERT INTO audit_log (user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user_email, user_role || null, action, entity_type, entity_id || null, station_id || null,
        old_value ? JSON.stringify(old_value) : null,
        new_value ? JSON.stringify(new_value) : null,
        req.headers['x-forwarded-for'] || req.socket.remoteAddress || null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/audit-log', async (req, res) => {
  try {
    const client = await getDb();
    const params = [];
    let where = '';
    if (req.query.station_id) { params.push(req.query.station_id); where = `WHERE station_id = $${params.length}`; }
    params.push(parseInt(req.query.limit || '50'));
    const result = await client.query(
      `SELECT id, user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address, created_at
         FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Subscription plans ────────────────────────────────────────────────────────
app.get('/api/plans', async (req, res) => {
  try {
    const client = await getDb();
    res.json((await client.query(`SELECT * FROM subscription_plans ORDER BY price_monthly ASC`)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/subscription ─────────────────────────────────────────────────────
// Now org-scoped: pass uid to resolve org, or station_id for backwards compat
app.get('/api/subscription', async (req, res) => {
  try {
    const client = await getDb();
    const uid = req.query.uid;
    const stationId = req.query.station_id;

    let orgId = null;

    if (uid) {
      const user = await resolveUser(client, uid);
      orgId = user?.orgId || null;
    } else if (stationId) {
      const stRes = await client.query(`SELECT organization_id FROM stations WHERE id=$1`, [stationId]);
      orgId = stRes.rows[0]?.organization_id || null;
    }

    if (!orgId) return res.json(null);

    // First try org-level subscription
    const orgSub = await client.query(
      `SELECT s.*, p.name AS plan_name, p.price_monthly, p.price_annual, p.max_stations, p.max_tanks, p.features
         FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.organization_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [orgId]
    );
    if (orgSub.rows.length) return res.json(orgSub.rows[0]);

    // Fall back to station-level subscription for backwards compat
    if (stationId) {
      const stSub = await client.query(
        `SELECT s.*, p.name AS plan_name, p.price_monthly, p.price_annual, p.max_stations, p.max_tanks, p.features
           FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
          WHERE s.station_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
        [stationId]
      );
      if (stSub.rows.length) return res.json(stSub.rows[0]);
    }

    // Check org trial status
    const org = await client.query(`SELECT * FROM organizations WHERE id=$1`, [orgId]);
    if (org.rows.length) {
      const o = org.rows[0];
      return res.json({
        status: o.subscription_status,
        trial_ends_at: o.trial_ends_at,
        plan_name: 'Trial',
        organization_id: orgId,
      });
    }

    res.json(null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Payments ──────────────────────────────────────────────────────────────────
app.post('/api/payments/initiate', async (req, res) => {
  const { station_id, plan_id, billing_cycle, user_email, user_name, phone, test_amount } = req.body;
  if (!station_id || !plan_id || !billing_cycle || !user_email)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const client = await getDb();
    const pesapal = require('./pesapal');
    let plan, amount, isTest = false;

    if (test_amount) {
      isTest = true; amount = parseFloat(test_amount); plan = { name: 'TEST_PAYMENT', id: 'test' };
    } else {
      const planRes = await client.query(`SELECT * FROM subscription_plans WHERE id=$1`, [plan_id]);
      if (!planRes.rows.length) return res.status(404).json({ error: 'Plan not found' });
      plan = planRes.rows[0];
      amount = billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly;
    }

    // Get org_id from station
    const stRes = await client.query(`SELECT organization_id FROM stations WHERE id=$1`, [station_id]);
    const orgId = stRes.rows[0]?.organization_id || null;

    const payRes = await client.query(
      `INSERT INTO payments (station_id, organization_id, amount_kes, billing_cycle, plan_name, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
      [station_id, orgId, amount, billing_cycle, plan.name]
    );
    const paymentId = payRes.rows[0].id;
    const ipnId = 'ae69c243-c3a9-4717-8932-da50bb3db92b';

    const order = {
      id: paymentId, currency: 'KES', amount: parseFloat(amount),
      description: isTest ? 'FuelSense Test Payment' : `FuelSense ${plan.name} - ${billing_cycle}`,
      callback_url: process.env.FRONTEND_URL + '/payment-success',
      notification_id: ipnId,
      billing_address: {
        email_address: user_email, phone_number: phone || '', country_code: 'KE',
        first_name: user_name?.split(' ')[0] || 'Customer', last_name: user_name?.split(' ')[1] || '',
      },
    };

    const pesapalRes = await pesapal.submitOrder(order);
    await client.query(`UPDATE payments SET pesapal_order_id=$1 WHERE id=$2`, [pesapalRes.order_tracking_id, paymentId]);
    res.json({ payment_id: paymentId, redirect_url: pesapalRes.redirect_url, amount, plan_name: plan.name, billing_cycle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payments/callback', async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;
  try {
    const client = await getDb();
    const pesapal = require('./pesapal');
    const status = await pesapal.getTransactionStatus(OrderTrackingId);

    if (status.payment_status_description === 'Completed') {
      await client.query(
        `UPDATE payments SET status='completed', pesapal_tracking_id=$1 WHERE id=$2`,
        [OrderTrackingId, OrderMerchantReference]
      );
      const payRes = await client.query(`SELECT * FROM payments WHERE id=$1`, [OrderMerchantReference]);
      const payment = payRes.rows[0];

      if (payment && payment.plan_name !== 'TEST_PAYMENT') {
        const planRes = await client.query(`SELECT * FROM subscription_plans WHERE name=$1`, [payment.plan_name]);
        const plan = planRes.rows[0];
        if (plan) {
          const now = new Date(), end = new Date(now);
          payment.billing_cycle === 'annual' ? end.setFullYear(end.getFullYear() + 1) : end.setMonth(end.getMonth() + 1);

          const orgId = payment.organization_id;
          if (orgId) {
            // Org-level subscription (new model)
            await client.query(
              `INSERT INTO subscriptions (station_id, organization_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
               VALUES ($1,$2,$3,$4,'active',$5,$6)
               ON CONFLICT (station_id, plan_id) DO UPDATE SET
                 status='active', organization_id=EXCLUDED.organization_id,
                 current_period_start=EXCLUDED.current_period_start, current_period_end=EXCLUDED.current_period_end`,
              [payment.station_id, orgId, plan.id, payment.billing_cycle, now, end]
            );
            // Update org subscription status
            await client.query(
              `UPDATE organizations SET subscription_status='active', plan_id=$1 WHERE id=$2`,
              [plan.id, orgId]
            );
          }
        }
      }
    }

    const redirectUrl = `${process.env.FRONTEND_URL}/?tab=payment-result&status=${encodeURIComponent(status.payment_status_description)}&OrderTrackingId=${OrderTrackingId}`;
    res.redirect(redirectUrl);
  } catch (err) {
    const errorRedirectUrl = `${process.env.FRONTEND_URL}/?tab=payment-result&status=Error&error=${encodeURIComponent(err.message)}`;
    res.redirect(errorRedirectUrl);
  }
});

app.get('/api/payments/history', async (req, res) => {
  try {
    const client = await getDb();
    const { station_id, uid } = req.query;
    const user = uid ? await resolveUser(client, uid) : null;
    const params = [];
    let where = '';

    if (user?.orgId) {
      params.push(user.orgId);
      where = `WHERE organization_id = $${params.length}`;
    } else if (station_id) {
      params.push(station_id);
      where = `WHERE station_id = $${params.length}`;
    } else {
      return res.status(400).json({ error: 'station_id or uid required' });
    }
    params.push(20);
    const result = await client.query(
      `SELECT * FROM payments ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/payments/test ───────────────────────────────────────────────────
app.post('/api/payments/test', async (req, res) => {
  const { station_id, amount, user_email, user_name, phone } = req.body;
  if (!amount || !user_email) return res.status(400).json({ error: 'Missing required fields: amount, user_email' });
  try {
    const client = await getDb();
    const pesapal = require('./pesapal');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let realStationId = station_id;
    if (!station_id || !uuidRegex.test(station_id)) {
      const stRes = await client.query(`SELECT id FROM stations LIMIT 1`);
      realStationId = stRes.rows[0]?.id;
      if (!realStationId) return res.status(400).json({ error: 'No stations found' });
    }
    const stRes = await client.query(`SELECT organization_id FROM stations WHERE id=$1`, [realStationId]);
    const orgId = stRes.rows[0]?.organization_id || null;
    const payRes = await client.query(
      `INSERT INTO payments (station_id, organization_id, amount_kes, billing_cycle, plan_name, status)
       VALUES ($1,$2,$3,'monthly','TEST_PAYMENT','pending') RETURNING id`,
      [realStationId, orgId, amount]
    );
    const paymentId = payRes.rows[0].id;
    const ipnId = 'ae69c243-c3a9-4717-8932-da50bb3db92b';
    const pesapalRes = await pesapal.submitOrder({
      id: paymentId, currency: 'KES', amount: parseFloat(amount),
      description: `FuelSense Test Payment - KES ${amount}`,
      callback_url: process.env.FRONTEND_URL + '/payment-success',
      notification_id: ipnId,
      billing_address: {
        email_address: user_email, phone_number: phone || '', country_code: 'KE',
        first_name: user_name?.split(' ')[0] || 'Customer', last_name: user_name?.split(' ')[1] || ''
      },
    });
    await client.query(`UPDATE payments SET pesapal_order_id=$1 WHERE id=$2`, [pesapalRes.order_tracking_id, paymentId]);
    res.json({ payment_id: paymentId, redirect_url: pesapalRes.redirect_url, amount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/debug-pesapal ────────────────────────────────────────────────────
app.get('/api/debug-pesapal', (req, res) => {
  const IS_SANDBOX = process.env.PESAPAL_ENV !== 'live';
  res.json({
    pesapal_env: process.env.PESAPAL_ENV, is_sandbox: IS_SANDBOX,
    base_url: IS_SANDBOX ? 'https://cybqa.pesapal.com/pesapalv3' : 'https://pay.pesapal.com/v3',
    consumer_key_exists: !!process.env.PESAPAL_CONSUMER_KEY,
    consumer_secret_exists: !!process.env.PESAPAL_CONSUMER_SECRET,
  });
});

// ── SUPER ADMIN: manage organizations ────────────────────────────────────────
// POST /api/admin/organizations — create new client org + invite owner
app.post('/api/admin/organizations', async (req, res) => {
  const { admin_email, name, slug, owner_email, plan_id, max_stations, max_tanks } = req.body;
  if (!admin_email || !name || !owner_email)
    return res.status(400).json({ error: 'admin_email, name, owner_email required' });
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });

    // Resolve plan limits
    let maxSt = max_stations || 1, maxTk = max_tanks || 5;
    if (plan_id) {
      const planRes = await client.query(`SELECT max_stations, max_tanks FROM subscription_plans WHERE id=$1`, [plan_id]);
      if (planRes.rows.length) { maxSt = planRes.rows[0].max_stations; maxTk = planRes.rows[0].max_tanks; }
    }

    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug, owner_email, plan_id, max_stations, max_tanks, subscription_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'trial',$7) RETURNING *`,
      [name, slug || name.toLowerCase().replace(/\s+/g, '-'), owner_email, plan_id || null, maxSt, maxTk, admin_email]
    );
    const org = orgRes.rows[0];
    console.log('[SUPER-ADMIN] Created org:', org.name, '| owner:', owner_email);
    res.status(201).json({ ok: true, organization: org, message: `Organization "${name}" created. Invite ${owner_email} via Supabase Auth to complete setup.` });
  } catch (err) {
    console.error('[SUPER-ADMIN] Create org error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/organizations — list all orgs (super admin only)
app.get('/api/admin/organizations', async (req, res) => {
  const { admin_email } = req.query;
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });

    const result = await client.query(`
      SELECT o.*,
             COUNT(DISTINCT s.id)  AS station_count,
             COUNT(DISTINCT u.id)  AS user_count
        FROM organizations o
        LEFT JOIN stations s ON s.organization_id = o.id
        LEFT JOIN user_profiles u ON u.organization_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/organizations/:id — single org details
app.get('/api/admin/organizations/:id', async (req, res) => {
  const { admin_email } = req.query;
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });

    const [orgRes, stationsRes, usersRes] = await Promise.all([
      client.query(`SELECT o.*, p.name AS plan_name FROM organizations o LEFT JOIN subscription_plans p ON p.id=o.plan_id WHERE o.id=$1`, [req.params.id]),
      client.query(`SELECT id, name, location, created_at FROM stations WHERE organization_id=$1 ORDER BY name`, [req.params.id]),
      client.query(`SELECT supabase_uid, email, full_name, role, station_id, created_at FROM user_profiles WHERE organization_id=$1 ORDER BY role`, [req.params.id]),
    ]);
    if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
    res.json({ organization: orgRes.rows[0], stations: stationsRes.rows, users: usersRes.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/user-profiles/:uid — update a user's role or station
app.put('/api/admin/user-profiles/:uid', async (req, res) => {
  const { admin_email, role, station_id } = req.body;
  try {
    const client = await getDb();
    const isAdmin = await isSuperAdmin(client, admin_email);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: super admin only' });
    if (!role) return res.status(400).json({ error: 'role required' });

    await client.query(
      `UPDATE user_profiles SET role=$1, station_id=$2 WHERE supabase_uid=$3`,
      [role, station_id || null, req.params.uid]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Owner: add a station to their org ────────────────────────────────────────
app.post('/api/stations', async (req, res) => {
  const { uid, name, location, timezone } = req.body;
  if (!uid || !name) return res.status(400).json({ error: 'uid and name required' });
  try {
    const client = await getDb();
    const user = await resolveUser(client, uid);
    if (!user || user.accessLevel < 100) return res.status(403).json({ error: 'Owner access required' });

    // Check station limit
    const org = await client.query(`SELECT max_stations FROM organizations WHERE id=$1`, [user.orgId]);
    const countRes = await client.query(`SELECT COUNT(*) AS count FROM stations WHERE organization_id=$1`, [user.orgId]);
    const current = parseInt(countRes.rows[0].count);
    const maxSt = org.rows[0]?.max_stations || 1;
    if (maxSt !== -1 && current >= maxSt)
      return res.status(403).json({ error: `Station limit reached (${maxSt}). Upgrade your plan to add more stations.` });

    const result = await client.query(
      `INSERT INTO stations (name, location, timezone, organization_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, location || '', timezone || 'Africa/Nairobi', user.orgId]
    );
    console.log('[API] Station created:', result.rows[0].name, '| org:', user.orgId);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[API] POST /api/stations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN PORTAL ENDPOINTS — used by the separate admin/ Vite app
// (Stations.js, Tanks.js, Users.js, Suppliers.js)
// Access to the admin portal itself is gated client-side by ALLOWED_ROLES
// in admin/src/App.js; these endpoints trust that gate and additionally
// scope every read/write through resolveAdminOrg() below.
// ════════════════════════════════════════════════════════════════════════════

// Resolve which organization an admin-portal request should operate on.
// Accepts uid (preferred) so multi-tenant scoping holds; falls back to the
// single seed org if uid is absent (keeps older/admin-only flows working).
async function resolveAdminOrg(db, uid) {
  if (uid) {
    const user = await resolveUser(db, uid);
    if (user?.orgId) return user.orgId;
  }
  // Fallback: the original Mafuta Salama org (back-compat for admin tools
  // that haven't been updated to pass uid yet)
  const res = await db.query(`SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1`);
  return res.rows[0]?.id || null;
}

// ── STATIONS (admin CRUD) ─────────────────────────────────────────────────────
app.get('/api/admin/stations', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, req.query.uid);
    if (!orgId) return res.json([]);

    const result = await client.query(`
      SELECT s.id, s.name, s.location,
             COUNT(t.id) AS tank_count
        FROM stations s
        LEFT JOIN tanks t ON t.station_id = s.id
       WHERE s.organization_id = $1
       GROUP BY s.id
       ORDER BY s.name`, [orgId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/stations', async (req, res) => {
  const { name, location, uid } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required.' });
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, uid);
    if (!orgId) return res.status(400).json({ error: 'No organization found for this user.' });

    const countRes = await client.query(`SELECT COUNT(*) AS count FROM stations WHERE organization_id=$1`, [orgId]);
    const orgRes = await client.query(`SELECT max_stations FROM organizations WHERE id=$1`, [orgId]);
    const maxSt = orgRes.rows[0]?.max_stations ?? 1;
    if (maxSt !== -1 && parseInt(countRes.rows[0].count) >= maxSt) {
      return res.status(403).json({ error: `Station limit reached (${maxSt}). Upgrade your plan to add more stations.` });
    }

    const result = await client.query(
      `INSERT INTO stations (name, location, organization_id) VALUES ($1,$2,$3) RETURNING *`,
      [name, location || '', orgId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/stations/:id', async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required.' });
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE stations SET name=$1, location=$2 WHERE id=$3 RETURNING *`,
      [name, location || '', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Station not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/stations/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM stations WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TANKS (admin CRUD) ────────────────────────────────────────────────────────
app.get('/api/admin/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, req.query.uid);
    const stationId = req.query.station_id;
    if (!orgId) return res.json([]);

    const params = [orgId];
    let where = `s.organization_id = $1`;
    if (stationId) {
      params.push(stationId);
      where += ` AND t.station_id = $${params.length}`;
    }

    const result = await client.query(`
      SELECT t.id, t.tank_number, t.fuel_type, t.capacity_litres,
             t.fuel_density_at_15c, t.low_stock_threshold_pct,
             t.station_id, s.name AS station_name
        FROM tanks t
        JOIN stations s ON s.id = t.station_id
       WHERE ${where}
       ORDER BY s.name, t.tank_number`, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/tanks', async (req, res) => {
  const { station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct } = req.body;
  if (!station_id || !tank_number || !fuel_type || !capacity_litres)
    return res.status(400).json({ error: 'station_id, tank_number, fuel_type and capacity_litres are required.' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO tanks (station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c || 0.835, low_stock_threshold_pct || 20]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tanks/:id', async (req, res) => {
  const { tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE tanks SET tank_number=$1, fuel_type=$2, capacity_litres=$3, fuel_density_at_15c=$4, low_stock_threshold_pct=$5
       WHERE id=$6 RETURNING *`,
      [tank_number, fuel_type, capacity_litres, fuel_density_at_15c || 0.835, low_stock_threshold_pct || 20, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tank not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/tanks/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM tanks WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── USERS (admin CRUD) ────────────────────────────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, req.query.uid);
    if (!orgId) return res.json([]);

    const result = await client.query(`
      SELECT u.id, u.supabase_uid, u.email, u.full_name, u.role, u.station_id,
             s.name AS station_name
        FROM user_profiles u
        LEFT JOIN stations s ON s.id = u.station_id
       WHERE u.organization_id = $1
       ORDER BY u.role, u.email`, [orgId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  const { supabase_uid, email, full_name, role, station_id, uid } = req.body;
  if (!supabase_uid || !email || !role)
    return res.status(400).json({ error: 'Supabase UID, email and role are required.' });
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, uid);
    if (!orgId) return res.status(400).json({ error: 'No organization found for this user.' });

    const result = await client.query(
      `INSERT INTO user_profiles (supabase_uid, email, full_name, role, station_id, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [supabase_uid, email, full_name || null, role, station_id || null, orgId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with this Supabase UID already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  const { email, full_name, role, station_id } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE user_profiles SET email=$1, full_name=$2, role=$3, station_id=$4 WHERE id=$5 RETURNING *`,
      [email, full_name || null, role, station_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM user_profiles WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUPPLIERS (admin CRUD) ────────────────────────────────────────────────────
app.get('/api/admin/suppliers', async (req, res) => {
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, req.query.uid);
    if (!orgId) return res.json([]);

    const result = await client.query(
      `SELECT * FROM suppliers WHERE organization_id = $1 ORDER BY name`, [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    // suppliers table may not exist yet on older deployments — fail soft
    if (err.message.includes('does not exist')) return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/suppliers', async (req, res) => {
  const { name, contact_name, phone, email, address, tolerance_pct, uid } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
  try {
    const client = await getDb();
    const orgId = await resolveAdminOrg(client, uid);
    if (!orgId) return res.status(400).json({ error: 'No organization found for this user.' });

    const result = await client.query(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, tolerance_pct, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, contact_name || null, phone || null, email || null, address || null, tolerance_pct || 0.25, orgId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/suppliers/:id', async (req, res) => {
  const { name, contact_name, phone, email, address, tolerance_pct } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE suppliers SET name=$1, contact_name=$2, phone=$3, email=$4, address=$5, tolerance_pct=$6 WHERE id=$7 RETURNING *`,
      [name, contact_name || null, phone || null, email || null, address || null, tolerance_pct || 0.25, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM suppliers WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('[API] FuelSense API running on port ' + PORT);
  console.log('[API] Multi-tenant mode: enabled');
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────
async function checkExpiredSubscriptions() {
  try {
    const client = await getDb();
    const tank = await client.query('SELECT id FROM tanks WHERE id = $1', [tankId]);
    if (!tank.rows.length) return res.status(404).json({ error: 'Tank not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csvParser())
        .on('data', (row) => {
          const depth = parseInt(row.depth_mm || row.Depth_mm || row.depth);
          const volume = parseFloat(row.volume_litres || row.Volume_litres || row.litres);
          if (!isNaN(depth) && !isNaN(volume)) rows.push({ depth_mm: depth, volume_litres: volume });
        })
        .on('end', resolve)
        .on('error', reject);
    });
    if (rows.length === 0) return res.status(400).json({ error: 'No valid rows found. CSV must have columns: depth_mm, volume_litres' });
    await client.query('DELETE FROM strapping_table_entries WHERE tank_id = $1', [tankId]);
    await client.query('BEGIN');
    try {
      for (const row of rows) {
        await client.query(`INSERT INTO strapping_table_entries (id, tank_id, depth_mm, volume_litres) VALUES (gen_random_uuid(), $1, $2, $3)`, [tankId, row.depth_mm, row.volume_litres]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.log(`[API] Strapping table uploaded for tank ${tankId}: ${rows.length} rows`);
    res.json({ ok: true, tank_id: tankId, rows_inserted: rows.length, message: `Successfully uploaded ${rows.length} calibration rows` });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('[API] strapping upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;