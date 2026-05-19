'use strict';

const ASTM_REFERENCE_TEMP = 15.0;

const ASTM_PRODUCTS = {
  petrol:   { K0: 613.9723e-6, K1: 0.0,       densityMin: 0.6110, densityMax: 0.7700 },
  diesel:   { K0: 186.9764e-6, K1: 0.4862e-3, densityMin: 0.8300, densityMax: 0.9660 },
  kerosene: { K0: 330.3010e-6, K1: 0.0,       densityMin: 0.7800, densityMax: 0.8300 },
};

async function lookupStrappingTable (db, tankId, depthMm) {
  if (depthMm <= 0) return 0;

  const floorMm  = Math.floor(depthMm);
  const ceilMm   = floorMm + 1;
  const fraction = depthMm - floorMm;

  const res = await db.query(
    `SELECT depth_mm, volume_litres
       FROM strapping_table_entries
      WHERE tank_id = $1
        AND depth_mm IN ($2, $3)
      ORDER BY depth_mm ASC`,
    [tankId, floorMm, ceilMm]
  );

  if (res.rows.length === 0) {
    throw new Error(`No strapping table entries for tank ${tankId} at depth ${depthMm}mm`);
  }

  const floorRow = res.rows.find(r => parseInt(r.depth_mm) === floorMm);
  const ceilRow  = res.rows.find(r => parseInt(r.depth_mm) === ceilMm);

  if (!floorRow) return 0;

  const floorVol = parseFloat(floorRow.volume_litres);
  if (!ceilRow || fraction === 0) return floorVol;

  const ceilVol = parseFloat(ceilRow.volume_litres);
  return +(floorVol + fraction * (ceilVol - floorVol)).toFixed(3);
}

async function calculateTOVandWater (db, tankId, innage_mm, water_mm) {
  const safeWater = Math.min(water_mm, innage_mm);

  const [tov_litres, water_litres] = await Promise.all([
    lookupStrappingTable(db, tankId, innage_mm),
    lookupStrappingTable(db, tankId, safeWater),
  ]);

  const gov_litres = Math.max(0, tov_litres - water_litres);

  return {
    tov_litres:   +tov_litres.toFixed(3),
    water_litres: +water_litres.toFixed(3),
    gov_litres:   +gov_litres.toFixed(3),
  };
}

function calculateVCF (temperatureC, densityAt15C, fuelType = 'petrol') {
  const product = ASTM_PRODUCTS[fuelType];
  if (!product) throw new Error(`Unknown fuel type: ${fuelType}`);

  const { K0, K1 } = product;
  const alpha    = K0 / (densityAt15C * densityAt15C) + K1 / densityAt15C;
  const deltaT   = temperatureC - ASTM_REFERENCE_TEMP;
  const exponent = -alpha * deltaT * (1 + 0.8 * alpha * deltaT);
  return +Math.exp(exponent).toFixed(6);
}

async function calculateNSV (db, tankId, innage_mm, water_mm, temperature_c) {
  const tankRes = await db.query(
    `SELECT fuel_type, fuel_density_at_15c FROM tanks WHERE id = $1`,
    [tankId]
  );
  if (!tankRes.rows.length) throw new Error(`Tank not found: ${tankId}`);

  const { fuel_type, fuel_density_at_15c } = tankRes.rows[0];
  const density = parseFloat(fuel_density_at_15c);

  const volumes    = await calculateTOVandWater(db, tankId, innage_mm, water_mm);
  const vcf        = calculateVCF(temperature_c, density, fuel_type);
  const nsv_litres = +(volumes.gov_litres * vcf).toFixed(3);

  return { ...volumes, vcf, nsv_litres };
}

module.exports = {
  calculateNSV,
  calculateVCF,
  calculateTOVandWater,
  lookupStrappingTable,
  ASTM_REFERENCE_TEMP,
  ASTM_PRODUCTS,
};