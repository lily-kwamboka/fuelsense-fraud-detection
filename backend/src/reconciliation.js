'use strict';

const TOLERANCE_PCT = 0.25;

// EPA AP-42 evaporation loss factors
const WORKING_LOSS_G_PER_LITRE = 0.88;
const TEMP_LOSS_FACTOR          = 0.00065;

async function reconcileDelivery (db, deliveryId) {
  // 1. Load the delivery record
  const delRes = await db.query(
    `SELECT d.*,
            o.nsv_litres  AS opening_nsv,
            o.temperature_c AS opening_temp,
            c.nsv_litres  AS closing_nsv,
            c.temperature_c AS closing_temp
       FROM deliveries d
       JOIN atg_readings o ON o.id = d.opening_reading_id
       JOIN atg_readings c ON c.id = d.closing_reading_id
      WHERE d.id = $1`,
    [deliveryId]
  );

  if (!delRes.rows.length) {
    throw new Error('Delivery not found: ' + deliveryId);
  }

  const delivery = delRes.rows[0];

  // 2. Get pump sales during the delivery window
  const salesRes = await db.query(
    `SELECT COALESCE(SUM(pump_sales_litres), 0) AS total_sales
       FROM daily_reconciliation
      WHERE tank_id = $1
        AND recon_date BETWEEN $2::date AND $3::date`,
    [
      delivery.tank_id,
      delivery.offload_started_at,
      delivery.stabilisation_at,
    ]
  );

  const pumpSales = parseFloat(salesRes.rows[0].total_sales) || 0;

  // 3. Calculate what the tank actually gained
  const openingNSV    = parseFloat(delivery.opening_nsv);
  const closingNSV    = parseFloat(delivery.closing_nsv);
  const receivedNSV   = (closingNSV - openingNSV) + pumpSales;

  // 4. Compare to BOL
  const bolNSV        = parseFloat(delivery.bol_nsv_litres);
  const varianceLitres = receivedNSV - bolNSV;
  const variancePct    = (varianceLitres / bolNSV) * 100;
  const tolerance      = parseFloat(delivery.tolerance_pct) || TOLERANCE_PCT;

  // 5. Evaporation model
  const deliveredTemp  = parseFloat(delivery.opening_temp);
  const tankTemp       = parseFloat(delivery.closing_temp);
  const workingLoss    = (bolNSV * WORKING_LOSS_G_PER_LITRE) / 1000;
  const tempLoss       = bolNSV * Math.abs(deliveredTemp - tankTemp) * TEMP_LOSS_FACTOR;
  const expectedLoss   = workingLoss + tempLoss;

  // 6. Classify the variance
  let classification;
  if (Math.abs(variancePct) <= tolerance) {
    classification = 'within_tolerance';
  } else if (Math.abs(varianceLitres) <= expectedLoss) {
    classification = 'within_expected_physical_loss';
  } else {
    classification = 'unexplained';
  }

  const status = classification === 'unexplained' ? 'flagged' : 'confirmed';

  // 7. Write results back to the delivery record
  await db.query(
    `UPDATE deliveries SET
        received_nsv_litres     = $1,
        variance_litres         = $2,
        variance_pct            = $3,
        expected_loss_litres    = $4,
        variance_classification = $5,
        status                  = $6
      WHERE id = $7`,
    [
      receivedNSV.toFixed(3),
      varianceLitres.toFixed(3),
      variancePct.toFixed(4),
      expectedLoss.toFixed(3),
      classification,
      status,
      deliveryId,
    ]
  );

  console.log('--------------------------------------------');
  console.log('[RECON] Delivery: ' + deliveryId);
  console.log('[RECON] Opening NSV:    ' + openingNSV.toFixed(1) + 'L');
  console.log('[RECON] Closing NSV:    ' + closingNSV.toFixed(1) + 'L');
  console.log('[RECON] Pump sales:     ' + pumpSales.toFixed(1) + 'L');
  console.log('[RECON] Received NSV:   ' + receivedNSV.toFixed(1) + 'L');
  console.log('[RECON] BOL NSV:        ' + bolNSV.toFixed(1) + 'L');
  console.log('[RECON] Variance:       ' + varianceLitres.toFixed(1) + 'L (' + variancePct.toFixed(3) + '%)');
  console.log('[RECON] Expected loss:  ' + expectedLoss.toFixed(1) + 'L');
  console.log('[RECON] Classification: ' + classification.toUpperCase());
  console.log('[RECON] Status:         ' + status.toUpperCase());
  console.log('--------------------------------------------');

  return {
    receivedNSV,
    bolNSV,
    varianceLitres,
    variancePct,
    expectedLoss,
    classification,
    status,
  };
}

module.exports = { reconcileDelivery };