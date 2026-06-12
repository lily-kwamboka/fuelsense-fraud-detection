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

app.use(cors());
app.use(express.json());

// Initialize Resend for email notifications (if API key is set)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── Role-Based Access Control Helper ────────────────────────────────────────
function getRoleAccessLevel(role) {
  const accessLevels = {
    'owner': 100,              // Full system access
    'headquarters': 80,       // View all stations, no user management
    'supervisor': 70,         // Manage multiple stations
    'compliance_officer': 65, // Audit all stations (read-only)
    'station_manager': 50,    // Single station full access
    'shift_supervisor': 30,   // View only, can manage shifts
    'attendant': 10           // Basic read-only
  };
  return accessLevels[role] || 0;
}

// ── Simple test endpoint for deployment verification ────────────────────────
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// ── Debug endpoint to check Pesapal configuration ───────────────────────────
app.get('/api/debug-pesapal', (req, res) => {
  const IS_SANDBOX = process.env.PESAPAL_ENV !== 'live';
  const BASE_URL = IS_SANDBOX
    ? 'https://cybqa.pesapal.com/pesapalv3'
    : 'https://pay.pesapal.com/v3';
  res.json({
    pesapal_env: process.env.PESAPAL_ENV,
    is_sandbox: IS_SANDBOX,
    base_url: BASE_URL,
    consumer_key_exists: !!process.env.PESAPAL_CONSUMER_KEY,
    consumer_secret_exists: !!process.env.PESAPAL_CONSUMER_SECRET,
    api_base_url: process.env.API_BASE_URL,
    frontend_url: process.env.FRONTEND_URL,
    email_notifications: !!resend
  });
});

// ── POST /api/alerts/test ────────────────────────────────────────────────────
app.post('/api/alerts/test', async (req, res) => {
  const { sendTestAlert } = require('./email-alerts');

  const success = await sendTestAlert();

  if (success) {
    res.json({ message: 'Test alert sent successfully', email: process.env.ALERT_EMAIL || 'bernicewakarindi@gmail.com' });
  } else {
    res.status(500).json({ error: 'Failed to send test alert. Check RESEND_API_KEY configuration.' });
  }
});

let db = null;

async function getDb() {
  if (db) return db;
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log('[API] Database connected');
  return db;
}

// ── Send renewal reminder email ─────────────────────────────────────────────
async function sendRenewalReminder(stationId, daysLeft, userEmail, planName) {
  console.log(`[EMAIL REMINDER] Station: ${stationId} | Email: ${userEmail} | Plan: ${planName} | Renews in: ${daysLeft} days`);

  if (resend) {
    try {
      await resend.emails.send({
        from: 'FuelSense <noreply@fuelsense.com>',
        to: userEmail,
        subject: `Your ${planName} plan renews in ${daysLeft} days`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 20px; text-align: center;">
              <h1 style="color: #4CAF50; margin: 0;">⛽ FuelSense</h1>
              <p style="color: #fff; margin: 5px 0 0;">Mafuta Salama</p>
            </div>
            <div style="padding: 20px; border: 1px solid #e0e0e0;">
              <h2>Subscription Renewal Reminder</h2>
              <p>Your <strong>${planName}</strong> plan will renew in <strong>${daysLeft} days</strong>.</p>
              <p>To manage your subscription or update payment method, please visit your billing page.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/?tab=pricing" style="background: #4CAF50; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Manage Subscription</a>
              </div>
              <p style="font-size: 12px; color: #666;">If you have any questions, please contact our support team.</p>
            </div>
            <div style="background: #f5f5f5; padding: 10px; text-align: center; font-size: 11px; color: #666;">
              &copy; 2026 FuelSense. All rights reserved.
            </div>
          </div>
        `
      });
      console.log(`[EMAIL] Sent renewal reminder to ${userEmail}`);
    } catch (err) {
      console.error(`[EMAIL] Failed to send renewal reminder to ${userEmail}:`, err.message);
    }
  } else {
    console.log(`[EMAIL] Resend not configured - would have sent reminder to ${userEmail}`);
  }
}

// ── Check for upcoming renewals and send reminders ──────────────────────────
async function checkUpcomingRenewals() {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT s.id, s.station_id, s.plan_id, s.billing_cycle, s.current_period_end,
              st.name as station_name, up.email as user_email, p.name as plan_name
       FROM subscriptions s
       JOIN stations st ON st.id = s.station_id
       JOIN user_profiles up ON up.station_id = s.station_id
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.status = 'active'
         AND s.current_period_end > NOW()
         AND s.current_period_end < NOW() + INTERVAL '7 days'
       ORDER BY s.current_period_end ASC`
    );

    if (result.rows.length) {
      console.log(`[CRON] Found ${result.rows.length} subscription(s) renewing soon:`);
      for (const sub of result.rows) {
        const daysLeft = Math.ceil((new Date(sub.current_period_end) - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`  - Station: ${sub.station_name} (${sub.plan_name}) | Days left: ${daysLeft} | Email: ${sub.user_email}`);
        await sendRenewalReminder(sub.station_id, daysLeft, sub.user_email, sub.plan_name);
      }
    }
  } catch (err) {
    console.error('[CRON] Error checking upcoming renewals:', err.message);
  }
}

// ── Auto-expire subscriptions cron job ──────────────────────────────────────
async function checkExpiredSubscriptions() {
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE subscriptions 
       SET status = 'expired' 
       WHERE status = 'active' 
         AND current_period_end < NOW()
       RETURNING station_id`
    );

    if (result.rows.length) {
      console.log(`[CRON] Expired ${result.rows.length} subscription(s):`);
      result.rows.forEach(row => {
        console.log(`  - Station ID: ${row.station_id}`);
      });
    }
  } catch (err) {
    console.error('[CRON] Error checking expired subscriptions:', err.message);
  }
}

// ── GET /api/tanks ────────────────────────────────────────────────────────
app.get('/api/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const stationId = req.query.station_id;
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

      if (userRes.rows.length) {
        const role = userRes.rows[0].role;
        const accessLevel = getRoleAccessLevel(role);
        const assignedStation = userRes.rows[0].station_id;

        // Owner, Headquarters, Supervisor, Compliance Officer see all stations
        if (accessLevel >= 65) {
          // No station filter - see everything
        }
        // Others see only their assigned station
        else if (assignedStation) {
          params.push(assignedStation);
          query += ` WHERE t.station_id = $${params.length}`;
        }
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
    const client = await getDb();
    const supabaseUid = req.query.uid;

    let query = `SELECT id, name, location FROM stations ORDER BY name`;
    let params = [];

    if (supabaseUid) {
      const userRes = await client.query(
        `SELECT role, station_id FROM user_profiles WHERE supabase_uid = $1`,
        [supabaseUid]
      );

      if (userRes.rows.length) {
        const role = userRes.rows[0].role;
        const accessLevel = getRoleAccessLevel(role);
        const assignedStation = userRes.rows[0].station_id;

        // Owner, Headquarters, Supervisor, Compliance Officer see all stations
        if (accessLevel >= 65) {
          // No station filter - see all stations
        }
        // Others see only their assigned station
        else if (assignedStation) {
          params.push(assignedStation);
          query = `SELECT id, name, location FROM stations WHERE id = $1`;
        }
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
    const client = await getDb();
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
      return res.json({ role: 'attendant', station_id: null });
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
    const client = await getDb();
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
    const client = await getDb();
    const openRes = await client.query(`SELECT nsv_litres FROM atg_readings WHERE tank_id = $1 AND recorded_at::date = $2::date ORDER BY recorded_at ASC  LIMIT 1`, [tank_id, recon_date]);
    const closeRes = await client.query(`SELECT nsv_litres FROM atg_readings WHERE tank_id = $1 AND recorded_at::date = $2::date ORDER BY recorded_at DESC LIMIT 1`, [tank_id, recon_date]);

    if (!openRes.rows.length || !closeRes.rows.length) {
      return res.status(400).json({ error: 'No readings found for this tank on this date' });
    }

    const openingNSV = parseFloat(openRes.rows[0].nsv_litres);
    const closingNSV = parseFloat(closeRes.rows[0].nsv_litres);
    const delivRes = await client.query(
      `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total FROM deliveries WHERE tank_id = $1 AND status IN ('confirmed','flagged') AND stabilisation_at::date = $2::date`,
      [tank_id, recon_date]
    );
    const deliveriesNSV = parseFloat(delivRes.rows[0].total) || 0;
    const sales = parseFloat(pump_sales_litres);
    const theoreticalClosing = openingNSV + deliveriesNSV - sales;
    const varianceLitres = closingNSV - theoreticalClosing;

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
    const limit = parseInt(req.query.limit) || 50;
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
    const client = await getDb();
    const stationId = req.query.station_id;
    const limit = parseInt(req.query.limit || '50');
    let query = `SELECT id, user_email, user_role, action, entity_type, entity_id, station_id, old_value, new_value, ip_address, created_at FROM audit_log`;
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

// ── GET /api/plans ──────────────────────────────────────────────────────────
app.get('/api/plans', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT * FROM subscription_plans ORDER BY price_monthly ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/subscription ───────────────────────────────────────────────────
app.get('/api/subscription', async (req, res) => {
  try {
    const client = await getDb();
    const stationId = req.query.station_id;
    if (!stationId) return res.status(400).json({ error: 'station_id required' });

    const result = await client.query(
      `SELECT s.*, p.name AS plan_name, p.price_monthly, p.price_annual,
              p.max_stations, p.max_tanks, p.features
         FROM subscriptions s
         JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.station_id = $1
        ORDER BY s.created_at DESC
        LIMIT 1`,
      [stationId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/initiate ─────────────────────────────────────────────
app.post('/api/payments/initiate', async (req, res) => {
  const { station_id, plan_id, billing_cycle, user_email, user_name, phone, test_amount } = req.body;

  if (!station_id || !plan_id || !billing_cycle || !user_email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const client = await getDb();
    const pesapal = require('./pesapal');

    let plan;
    let amount;
    let isTest = false;

    // Check if this is a test payment
    if (test_amount) {
      isTest = true;
      amount = parseFloat(test_amount);
      plan = { name: 'TEST_PAYMENT', id: 'test' };
    } else {
      // Get plan details from database
      const planRes = await client.query(
        `SELECT * FROM subscription_plans WHERE id = $1`, [plan_id]
      );
      if (!planRes.rows.length) return res.status(404).json({ error: 'Plan not found' });
      plan = planRes.rows[0];
      amount = billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly;
    }

    console.log('[PAYMENT]', isTest ? 'TEST PAYMENT' : 'LIVE PAYMENT', 'Amount:', amount);

    // Create payment record
    const payRes = await client.query(
      `INSERT INTO payments (station_id, amount_kes, billing_cycle, plan_name, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [station_id, amount, billing_cycle, plan.name]
    );
    const paymentId = payRes.rows[0].id;

    // Use registered IPN ID
    const ipnId = 'ae69c243-c3a9-4717-8932-da50bb3db92b';
    console.log('[PAYMENT] Using registered IPN ID:', ipnId);

    // Submit order to Pesapal
    const order = {
      id: paymentId,
      currency: 'KES',
      amount: parseFloat(amount),
      description: isTest ? 'FuelSense Test Payment' : `FuelSense ${plan.name} - ${billing_cycle} subscription`,
      callback_url: process.env.FRONTEND_URL + '/payment-success',
      notification_id: ipnId,
      billing_address: {
        email_address: user_email,
        phone_number: phone || '',
        country_code: 'KE',
        first_name: user_name?.split(' ')[0] || 'Customer',
        last_name: user_name?.split(' ')[1] || '',
      },
    };

    const pesapalRes = await pesapal.submitOrder(order);

    // Update payment with Pesapal order ID
    await client.query(
      `UPDATE payments SET pesapal_order_id = $1 WHERE id = $2`,
      [pesapalRes.order_tracking_id, paymentId]
    );

    res.json({
      payment_id: paymentId,
      redirect_url: pesapalRes.redirect_url,
      amount,
      plan_name: plan.name,
      billing_cycle,
      is_test: isTest,
    });

  } catch (err) {
    console.error('[API] payment initiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/test ─────────────────────────────────────────────────
app.post('/api/payments/test', async (req, res) => {
  const { station_id, amount, user_email, user_name, phone } = req.body;

  if (!amount || !user_email) {
    return res.status(400).json({ error: 'Missing required fields: amount, user_email' });
  }

  try {
    const client = await getDb();
    const pesapal = require('./pesapal');

    // Get a valid station ID
    let realStationId = station_id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!station_id || station_id === 'test' || !uuidRegex.test(station_id)) {
      const stationRes = await client.query(`SELECT id FROM stations LIMIT 1`);
      if (stationRes.rows.length) {
        realStationId = stationRes.rows[0].id;
        console.log('[TEST PAYMENT] Using fallback station ID:', realStationId);
      } else {
        return res.status(400).json({ error: 'No stations found in database' });
      }
    }

    console.log('[TEST PAYMENT] Amount:', amount, 'for station:', realStationId);

    // Create payment record
    const payRes = await client.query(
      `INSERT INTO payments (station_id, amount_kes, billing_cycle, plan_name, status)
       VALUES ($1, $2, 'monthly', 'TEST_PAYMENT', 'pending') RETURNING id`,
      [realStationId, amount]
    );
    const paymentId = payRes.rows[0].id;

    // Use registered IPN ID
    const ipnId = 'ae69c243-c3a9-4717-8932-da50bb3db92b';
    console.log('[TEST PAYMENT] Using registered IPN ID:', ipnId);

    // Submit order to Pesapal
    const order = {
      id: paymentId,
      currency: 'KES',
      amount: parseFloat(amount),
      description: `FuelSense Test Payment - KES ${amount}`,
      callback_url: process.env.FRONTEND_URL + '/payment-success',
      notification_id: ipnId,
      billing_address: {
        email_address: user_email,
        phone_number: phone || '',
        country_code: 'KE',
        first_name: user_name?.split(' ')[0] || 'Customer',
        last_name: user_name?.split(' ')[1] || '',
      },
    };

    const pesapalRes = await pesapal.submitOrder(order);

    await client.query(
      `UPDATE payments SET pesapal_order_id = $1 WHERE id = $2`,
      [pesapalRes.order_tracking_id, paymentId]
    );

    res.json({
      payment_id: paymentId,
      redirect_url: pesapalRes.redirect_url,
      amount,
    });

  } catch (err) {
    console.error('[TEST PAYMENT] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/callback ──────────────────────────────────────────────
app.get('/api/payments/callback', async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;

  try {
    const client = await getDb();
    const pesapal = require('./pesapal');

    const status = await pesapal.getTransactionStatus(OrderTrackingId);

    if (status.payment_status_description === 'Completed') {
      // Update payment
      await client.query(
        `UPDATE payments SET status = 'completed', pesapal_tracking_id = $1 WHERE id = $2`,
        [OrderTrackingId, OrderMerchantReference]
      );

      // Get payment details
      const payRes = await client.query(
        `SELECT * FROM payments WHERE id = $1`, [OrderMerchantReference]
      );
      const payment = payRes.rows[0];

      if (payment && payment.plan_name !== 'TEST_PAYMENT') {
        // Get plan
        const planRes = await client.query(
          `SELECT * FROM subscription_plans WHERE name = $1`, [payment.plan_name]
        );
        const plan = planRes.rows[0];

        if (plan) {
          // Calculate period
          const now = new Date();
          const end = new Date(now);
          if (payment.billing_cycle === 'annual') {
            end.setFullYear(end.getFullYear() + 1);
          } else {
            end.setMonth(end.getMonth() + 1);
          }

          // Upsert subscription
          await client.query(
            `INSERT INTO subscriptions
               (station_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
             VALUES ($1, $2, $3, 'active', $4, $5)
             ON CONFLICT (station_id, plan_id) DO UPDATE SET
               status = 'active',
               current_period_start = EXCLUDED.current_period_start,
               current_period_end = EXCLUDED.current_period_end`,
            [payment.station_id, plan.id, payment.billing_cycle, now, end]
          );
        }
      }

      console.log('[PESAPAL] Payment completed for station:', payment?.station_id);
    }

    // Redirect to frontend with tab=payment-result parameter
    const redirectUrl = `${process.env.FRONTEND_URL}/?tab=payment-result&status=${encodeURIComponent(status.payment_status_description)}&OrderTrackingId=${OrderTrackingId}`;
    res.redirect(redirectUrl);

  } catch (err) {
    console.error('[API] payment callback error:', err.message);
    const errorRedirectUrl = `${process.env.FRONTEND_URL}/?tab=payment-result&status=Error&error=${encodeURIComponent(err.message)}`;
    res.redirect(errorRedirectUrl);
  }
});

// ── GET /api/payments/history ───────────────────────────────────────────────
app.get('/api/payments/history', async (req, res) => {
  try {
    const client = await getDb();
    const stationId = req.query.station_id;
    if (!stationId) return res.status(400).json({ error: 'station_id required' });

    const result = await client.query(
      `SELECT * FROM payments WHERE station_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [stationId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────

// GET /api/admin/stations
app.get('/api/admin/stations', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT s.*, COUNT(t.id)::text AS tank_count 
       FROM stations s 
       LEFT JOIN tanks t ON t.station_id = s.id 
       GROUP BY s.id 
       ORDER BY s.name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/stations
app.post('/api/admin/stations', async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO stations (id, name, location) VALUES (gen_random_uuid(), $1, $2) RETURNING *`,
      [name, location || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/stations/:id
app.put('/api/admin/stations/:id', async (req, res) => {
  const { name, location } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE stations SET name=$1, location=$2 WHERE id=$3 RETURNING *`,
      [name, location || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Station not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/stations/:id
app.delete('/api/admin/stations/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM stations WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/tanks
app.get('/api/admin/tanks', async (req, res) => {
  try {
    const client = await getDb();
    const stationId = req.query.station_id;
    let query = `SELECT t.*, s.name AS station_name FROM tanks t JOIN stations s ON s.id = t.station_id`;
    const params = [];
    if (stationId) { params.push(stationId); query += ` WHERE t.station_id = $1`; }
    query += ` ORDER BY s.name, t.tank_number`;
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tanks
app.post('/api/admin/tanks', async (req, res) => {
  const { station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct } = req.body;
  if (!station_id || !tank_number || !fuel_type || !capacity_litres) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO tanks (id, station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING *`,
      [station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c || 0.835, low_stock_threshold_pct || 20]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/tanks/:id
app.put('/api/admin/tanks/:id', async (req, res) => {
  const { station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE tanks SET station_id=$1, tank_number=$2, fuel_type=$3, capacity_litres=$4, fuel_density_at_15c=$5, low_stock_threshold_pct=$6 WHERE id=$7 RETURNING *`,
      [station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, low_stock_threshold_pct, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tank not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/tanks/:id
app.delete('/api/admin/tanks/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM tanks WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
app.get('/api/admin/users', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(
      `SELECT u.*, s.name AS station_name FROM user_profiles u LEFT JOIN stations s ON s.id = u.station_id ORDER BY u.email`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
app.post('/api/admin/users', async (req, res) => {
  const { supabase_uid, email, full_name, role, station_id } = req.body;
  if (!supabase_uid || !email) return res.status(400).json({ error: 'supabase_uid and email are required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO user_profiles (supabase_uid, email, full_name, role, station_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [supabase_uid, email, full_name || null, role || 'manager', station_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id
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

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM user_profiles WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/suppliers
app.get('/api/admin/suppliers', async (req, res) => {
  try {
    const client = await getDb();
    const result = await client.query(`SELECT * FROM suppliers ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/suppliers
app.post('/api/admin/suppliers', async (req, res) => {
  const { name, contact_name, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });
  try {
    const client = await getDb();
    const result = await client.query(
      `INSERT INTO suppliers (id, name, contact_name, phone, email, address, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true) RETURNING *`,
      [name, contact_name || null, phone || null, email || null, address || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/suppliers/:id
app.put('/api/admin/suppliers/:id', async (req, res) => {
  const { name, contact_name, phone, email, address, is_active } = req.body;
  try {
    const client = await getDb();
    const result = await client.query(
      `UPDATE suppliers SET name=$1, contact_name=$2, phone=$3, email=$4, address=$5, is_active=$6 WHERE id=$7 RETURNING *`,
      [name, contact_name || null, phone || null, email || null, address || null, is_active !== undefined ? is_active : true, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/suppliers/:id
app.delete('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const client = await getDb();
    await client.query(`DELETE FROM suppliers WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');

// ── POST /api/tanks/:tankId/strapping-upload ──────────────────────────────
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.post('/api/tanks/:tankId/strapping-upload', upload.single('file'), async (req, res) => {
  const { tankId } = req.params;
  const rows = [];

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
          if (!isNaN(depth) && !isNaN(volume)) {
            rows.push({ depth_mm: depth, volume_litres: volume });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid rows found. CSV must have columns: depth_mm, volume_litres' });
    }

    await client.query('DELETE FROM strapping_table WHERE tank_id = $1', [tankId]);

    await client.query('BEGIN');
    try {
      for (const row of rows) {
        await client.query(
          `INSERT INTO strapping_table (id, tank_id, depth_mm, volume_litres) VALUES (gen_random_uuid(), $1, $2, $3)`,
          [tankId, row.depth_mm, row.volume_litres]
        );
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

// ── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('[API] FuelSense API running on port ' + PORT);
});

// ── Auto-expire subscriptions cron job (runs every hour) ───────────────────
setInterval(async () => {
  await checkExpiredSubscriptions();
}, 60 * 60 * 1000);

// ── Check upcoming renewals and send reminders (runs every 6 hours) ─────────
setInterval(async () => {
  await checkUpcomingRenewals();
}, 6 * 60 * 60 * 1000);

// Run once on startup
setTimeout(async () => {
  await checkExpiredSubscriptions();
  await checkUpcomingRenewals();
}, 5000);

// ── Ingestion Scheduler ───────────────────────────────────────────────────
setTimeout(async () => {
  try {
    const { getInventory } = require('./atg-client');
    const { calculateNSV } = require('./measurement-engine');


    const tankState = {};
    const DELIVERY_RISE_THRESHOLD = 50;
    const STABLE_CYCLES_REQUIRED = 10;

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

          const fillPct = (volumes.nsv_litres / parseFloat(t.capacity_litres)) * 100;
          await checkHighWaterAlert(client, t.id, t.tank_number, reading.waterMm);
          await checkLowStockAlert(client, t.id, t.tank_number, t.fuel_type, fillPct, parseFloat(t.low_stock_threshold_pct));

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
              state.deliveryId = dRes.rows[0].id;
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
              state.stableCycles = 0;
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