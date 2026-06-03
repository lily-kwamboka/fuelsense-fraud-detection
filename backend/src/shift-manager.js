'use strict';

// ---------------------------------------------------------------------------
// FuelSense - Shift Manager
// Phase 5
//
// Manages shift opening/closing, dip vs pump comparison,
// and per-shift stock reconciliation.
//
// Shifts: morning (06:00-14:00), afternoon (14:00-22:00), night (22:00-06:00)
// ---------------------------------------------------------------------------

const { checkPumpVsDip } = require('./alerts');

const SHIFTS = [
  { name: 'morning',   start: 6,  end: 14 },
  { name: 'afternoon', start: 14, end: 22 },
  { name: 'night',     start: 22, end: 6  },
];

// ---------------------------------------------------------------------------
// Get current shift name based on hour
// ---------------------------------------------------------------------------
function getCurrentShiftName(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6  && hour < 14) return 'morning';
  if (hour >= 14 && hour < 22) return 'afternoon';
  return 'night';
}

// ---------------------------------------------------------------------------
// Get shift date — night shift belongs to the day it started
// ---------------------------------------------------------------------------
function getShiftDate(date = new Date()) {
  const hour = date.getHours();
  // Night shift after midnight belongs to previous day
  if (hour < 6) {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    return prev.toISOString().split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Open a shift for a tank
// Creates the shift record and locks the opening reading
// ---------------------------------------------------------------------------
async function openShift(db, tankId, attendantName = null) {
  const now       = new Date();
  const shiftName = getCurrentShiftName(now);
  const shiftDate = getShiftDate(now);

  // Check if shift already open
  const existing = await db.query(
    `SELECT id FROM shifts
      WHERE tank_id = $1
        AND shift_date = $2
        AND shift_name = $3
        AND status = 'open'
      LIMIT 1`,
    [tankId, shiftDate, shiftName]
  );

  if (existing.rows.length) {
    return { alreadyOpen: true, shiftId: existing.rows[0].id };
  }

  // Get latest reading as opening reading
  const readingRes = await db.query(
    `SELECT id, nsv_litres FROM atg_readings
      WHERE tank_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [tankId]
  );

  if (!readingRes.rows.length) {
    throw new Error('No readings available to open shift for tank ' + tankId);
  }

  const openingReading = readingRes.rows[0];

  // Lock the opening reading
  await db.query(
    'UPDATE atg_readings SET is_locked = TRUE WHERE id = $1',
    [openingReading.id]
  );

  const result = await db.query(
    `INSERT INTO shifts
       (tank_id, shift_name, shift_date, started_at,
        opening_reading_id, opening_nsv,
        status, attendant_name)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
     RETURNING id`,
    [
      tankId, shiftName, shiftDate, now,
      openingReading.id, openingReading.nsv_litres,
      attendantName,
    ]
  );

  console.log('[SHIFTS] Shift opened: ' + shiftName + ' ' + shiftDate + ' | tank: ' + tankId);

  return {
    alreadyOpen:  false,
    shiftId:      result.rows[0].id,
    shiftName,
    shiftDate,
    openingNSV:   parseFloat(openingReading.nsv_litres),
  };
}

// ---------------------------------------------------------------------------
// Close a shift for a tank
// Calculates dip sales, compares to pump meter, flags discrepancies
// ---------------------------------------------------------------------------
async function closeShift(db, shiftId, { pumpMeterOpening, pumpMeterClosing, notes } = {}) {
  // Load shift
  const shiftRes = await db.query(
    `SELECT s.*, t.tank_number, t.fuel_type
       FROM shifts s
       JOIN tanks t ON t.id = s.tank_id
      WHERE s.id = $1`,
    [shiftId]
  );

  if (!shiftRes.rows.length) throw new Error('Shift not found: ' + shiftId);

  const shift = shiftRes.rows[0];

  if (shift.status !== 'open') {
    throw new Error('Shift ' + shiftId + ' is already ' + shift.status);
  }

  // Get latest reading as closing reading
  const readingRes = await db.query(
    `SELECT id, nsv_litres FROM atg_readings
      WHERE tank_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [shift.tank_id]
  );

  if (!readingRes.rows.length) throw new Error('No closing reading available');

  const closingReading = readingRes.rows[0];

  // Lock closing reading
  await db.query(
    'UPDATE atg_readings SET is_locked = TRUE WHERE id = $1',
    [closingReading.id]
  );

  const openingNSV = parseFloat(shift.opening_nsv);
  const closingNSV = parseFloat(closingReading.nsv_litres);

  // Get deliveries during this shift
  const delivRes = await db.query(
    `SELECT COALESCE(SUM(received_nsv_litres), 0) AS total
       FROM deliveries
      WHERE tank_id = $1
        AND status IN ('confirmed', 'flagged')
        AND stabilisation_at BETWEEN $2 AND NOW()`,
    [shift.tank_id, shift.started_at]
  );

  const deliveriesNSV = parseFloat(delivRes.rows[0].total) || 0;

  // Dip sales = opening + deliveries - closing
  const dipSales = openingNSV + deliveriesNSV - closingNSV;

  // Pump meter sales
  let pumpSales = null;
  if (pumpMeterOpening != null && pumpMeterClosing != null) {
    pumpSales = pumpMeterClosing - pumpMeterOpening;
  }

  // Variance between pump and dip
  let varianceLitres = null;
  let variancePct    = null;
  let status         = 'closed';

  if (pumpSales !== null && dipSales > 0) {
    varianceLitres = pumpSales - dipSales;
    variancePct    = (varianceLitres / dipSales) * 100;

    if (Math.abs(variancePct) > 0.5) {
      status = 'flagged';
      await checkPumpVsDip(
        db, shiftId,
        shift.tank_id, shift.tank_number, shift.fuel_type,
        pumpSales, dipSales
      );
    }
  }

  // Update shift record
  await db.query(
    `UPDATE shifts SET
        ended_at             = NOW(),
        closing_reading_id   = $1,
        closing_nsv          = $2,
        pump_meter_opening   = $3,
        pump_meter_closing   = $4,
        pump_meter_sales     = $5,
        dip_sales            = $6,
        variance_litres      = $7,
        variance_pct         = $8,
        status               = $9,
        notes                = $10
      WHERE id = $11`,
    [
      closingReading.id,
      closingNSV.toFixed(3),
      pumpMeterOpening,
      pumpMeterClosing,
      pumpSales !== null ? pumpSales.toFixed(3) : null,
      dipSales.toFixed(3),
      varianceLitres !== null ? varianceLitres.toFixed(3) : null,
      variancePct    !== null ? variancePct.toFixed(4)    : null,
      status,
      notes,
      shiftId,
    ]
  );

  console.log('[SHIFTS] Shift closed: ' + shift.shift_name + ' ' + shift.shift_date);
  console.log('  Opening NSV:   ' + openingNSV.toFixed(1) + 'L');
  console.log('  Closing NSV:   ' + closingNSV.toFixed(1) + 'L');
  console.log('  Deliveries:    ' + deliveriesNSV.toFixed(1) + 'L');
  console.log('  Dip sales:     ' + dipSales.toFixed(1) + 'L');
  if (pumpSales !== null) {
    console.log('  Pump sales:    ' + pumpSales.toFixed(1) + 'L');
    console.log('  Variance:      ' + varianceLitres.toFixed(1) + 'L (' + variancePct.toFixed(3) + '%)');
  }
  console.log('  Status:        ' + status.toUpperCase());

  return {
    shiftId,
    openingNSV,
    closingNSV,
    deliveriesNSV,
    dipSales,
    pumpSales,
    varianceLitres,
    variancePct,
    status,
  };
}

// ---------------------------------------------------------------------------
// Get shifts for a tank
// ---------------------------------------------------------------------------
async function getShifts(db, tankId, limit = 30) {
  const result = await db.query(
    `SELECT
       s.*,
       t.tank_number,
       t.fuel_type,
       o.recorded_at AS opening_recorded_at,
       c.recorded_at AS closing_recorded_at
     FROM shifts s
     JOIN tanks t             ON t.id = s.tank_id
     LEFT JOIN atg_readings o ON o.id = s.opening_reading_id
     LEFT JOIN atg_readings c ON c.id = s.closing_reading_id
     WHERE s.tank_id = $1
     ORDER BY s.shift_date DESC, s.started_at DESC
     LIMIT $2`,
    [tankId, limit]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Get all shifts across all tanks (for dashboard)
// ---------------------------------------------------------------------------
async function getAllShifts(db, limit = 50) {
  const result = await db.query(
    `SELECT
       s.*,
       t.tank_number,
       t.fuel_type
     FROM shifts s
     JOIN tanks t ON t.id = s.tank_id
     ORDER BY s.shift_date DESC, s.started_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = {
  openShift,
  closeShift,
  getShifts,
  getAllShifts,
  getCurrentShiftName,
  getShiftDate,
  SHIFTS,
};