/**
 * FuelSense - Measurement Engine
 * Phase 3
 *
 * Converts raw ATG probe readings into Net Standard Volume (NSV) at 15C.
 * Implements the full TOV -> GOV -> NSV calculation chain.
 *
 * Functions:
 *   lookupStrappingTable(tankId, depthMm)              -> litres
 *   calculateTOVandWater(tankId, innageMm, waterMm)    -> { tov, water, gov }
 *   calculateVCF(temperatureC, densityAt15C)           -> vcf
 *   calculateNSV(tankId, innageMm, waterMm, tempC)     -> full volume object
 *
 * Usage (standalone test):
 *   node measurement-engine.js
 *
 * Usage (as a module):
 *   const { calculateNSV } = require('./measurement-engine');
 */

require('dotenv').config();

const { Pool } = require('pg');

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// ASTM D1250 VCF constants per fuel type
// alpha = K0/density^2 + K1/density
// ---------------------------------------------------------------------------
const VCF_CONSTANTS = {
    petrol: { K0: 613.9723e-6, K1: 0.0 },
    diesel: { K0: 613.9723e-6, K1: 0.0 },
    kerosene: { K0: 613.9723e-6, K1: 0.0 },
};

// ---------------------------------------------------------------------------
// In-memory strapping table cache
// ---------------------------------------------------------------------------
const strappingCache = {};

/**
 * Load and cache the full strapping table for a tank.
 */
async function loadStrappingTable(tankId) {
    if (strappingCache[tankId]) return strappingCache[tankId];

    const result = await db.query(
        `SELECT depth_mm, volume_litres
     FROM strapping_table_entries
     WHERE tank_id = $1
     ORDER BY depth_mm ASC`,
        [tankId]
    );

    if (result.rows.length === 0) {
        throw new Error('No strapping table entries found for tank ' + tankId);
    }

    strappingCache[tankId] = result.rows;
    console.log('[measurement] Strapping table cached for tank ' + tankId + ' (' + result.rows.length + ' rows)');
    return strappingCache[tankId];
}

// ---------------------------------------------------------------------------
// Function 1: lookupStrappingTable
// ---------------------------------------------------------------------------
async function lookupStrappingTable(tankId, depthMm) {
    if (depthMm < 0) depthMm = 0;

    const table = await loadStrappingTable(tankId);

    const floorMm = Math.floor(depthMm);
    const ceilMm = Math.ceil(depthMm);
    const fraction = depthMm - floorMm;

    const floorRow = table.find(r => r.depth_mm === floorMm);
    if (!floorRow) {
        throw new Error(
            'Strapping table lookup failed: depth ' + floorMm + 'mm not found for tank ' + tankId
        );
    }

    if (fraction === 0 || floorMm === ceilMm) {
        return parseFloat(floorRow.volume_litres);
    }

    const ceilRow = table.find(r => r.depth_mm === ceilMm);
    if (!ceilRow) {
        return parseFloat(floorRow.volume_litres);
    }

    const floorVol = parseFloat(floorRow.volume_litres);
    const ceilVol = parseFloat(ceilRow.volume_litres);

    const interpolated = floorVol + fraction * (ceilVol - floorVol);
    return +interpolated.toFixed(3);
}

// ---------------------------------------------------------------------------
// Function 2: calculateTOVandWater
// ---------------------------------------------------------------------------
async function calculateTOVandWater(tankId, innageMm, waterMm) {
    const tov_litres = await lookupStrappingTable(tankId, innageMm);
    const water_litres = await lookupStrappingTable(tankId, waterMm);
    const gov_litres = +(tov_litres - water_litres).toFixed(3);

    return { tov_litres, water_litres, gov_litres };
}

// ---------------------------------------------------------------------------
// Function 3: calculateVCF
// ---------------------------------------------------------------------------
function calculateVCF(temperatureC, densityAt15C, fuelType = 'petrol') {
    const constants = VCF_CONSTANTS[fuelType] || VCF_CONSTANTS.petrol;
    const { K0, K1 } = constants;

    const alpha = K0 / (densityAt15C * densityAt15C) + K1 / densityAt15C;
    const deltaT = temperatureC - 15.0;

    const vcf = Math.exp(-alpha * deltaT * (1 + 0.8 * alpha * deltaT));

    return +vcf.toFixed(6);
}

// ---------------------------------------------------------------------------
// Function 4: calculateNSV
// ---------------------------------------------------------------------------
async function calculateNSV(tankId, innageMm, waterMm, temperatureC) {
    const tankResult = await db.query(
        'SELECT fuel_type, fuel_density_at_15c FROM tanks WHERE id = $1',
        [tankId]
    );

    if (tankResult.rows.length === 0) {
        throw new Error('Tank not found: ' + tankId);
    }

    const { fuel_type, fuel_density_at_15c } = tankResult.rows[0];
    const density = parseFloat(fuel_density_at_15c);

    const { tov_litres, water_litres, gov_litres } = await calculateTOVandWater(
        tankId, innageMm, waterMm
    );

    const vcf = calculateVCF(temperatureC, density, fuel_type);
    const nsv_litres = +(gov_litres * vcf).toFixed(3);

    return {
        tov_litres,
        water_litres,
        gov_litres,
        vcf,
        nsv_litres,
    };
}

// ---------------------------------------------------------------------------
// Export for use as a module
// ---------------------------------------------------------------------------
module.exports = {
    lookupStrappingTable,
    calculateTOVandWater,
    calculateVCF,
    calculateNSV,
};

// ---------------------------------------------------------------------------
// Standalone test - runs when called directly: node measurement-engine.js
// ---------------------------------------------------------------------------
if (require.main === module) {
    (async () => {
        console.log('');
        console.log('================================================');
        console.log('  FuelSense Measurement Engine - Unit Tests');
        console.log('================================================');
        console.log('');

        let passed = 0;
        let failed = 0;

        function assert(label, actual, expected, tolerance = 0.001) {
            const ok = Math.abs(actual - expected) <= tolerance;
            if (ok) {
                console.log('  PASS | ' + label);
                console.log('         got: ' + actual);
                passed++;
            } else {
                console.log('  FAIL | ' + label);
                console.log('         expected: ' + expected + ' +/- ' + tolerance);
                console.log('         got:      ' + actual);
                failed++;
            }
        }

        console.log('--- VCF Tests ---');

        assert(
            'VCF = 1.0 at exactly 15C (petrol, density 0.740)',
            calculateVCF(15.0, 0.740, 'petrol'),
            1.0,
            0.000001
        );

        assert(
            'VCF ~= 0.989 at 25C (petrol, density 0.740)',
            calculateVCF(25.0, 0.740, 'petrol'),
            0.989,
            0.001
        );

        assert(
            'VCF = 1.0 at exactly 15C (diesel, density 0.835)',
            calculateVCF(15.0, 0.835, 'diesel'),
            1.0,
            0.000001
        );

        const vcfCold = calculateVCF(5.0, 0.740, 'petrol');
        assert(
            'VCF > 1.0 when temp < 15C',
            vcfCold > 1.0 ? 1 : 0,
            1,
            0
        );

        console.log('');
        console.log('--- Strapping Table & NSV Tests ---');

        const tank1Id = 'b0000000-0000-0000-0000-000000000001';

        try {
            const vol0 = await lookupStrappingTable(tank1Id, 0);
            assert('Volume at 0mm = 0L', vol0, 0, 0.01);

            const vol1000 = await lookupStrappingTable(tank1Id, 1000);
            assert('Volume at 1000mm ~= 7854L (half tank)', vol1000, 7853.982, 1.0);

            const vol2000 = await lookupStrappingTable(tank1Id, 2000);
            assert('Volume at 2000mm ~= 15708L (full tank)', vol2000, 15707.963, 1.0);

            const vol500 = await lookupStrappingTable(tank1Id, 500);
            const vol501 = await lookupStrappingTable(tank1Id, 501);
            const vol500_5 = await lookupStrappingTable(tank1Id, 500.5);
            const midpoint = (vol500 + vol501) / 2;
            assert('Linear interpolation at 500.5mm', vol500_5, midpoint, 0.01);

            console.log('');
            console.log('--- Full NSV Calculation (Tank 1) ---');
            const result = await calculateNSV(tank1Id, 1450, 12, 18.5);
            console.log('  innage:      1450mm');
            console.log('  water:       12mm');
            console.log('  temperature: 18.5C');
            console.log('  tov_litres:  ' + result.tov_litres);
            console.log('  water_litres:' + result.water_litres);
            console.log('  gov_litres:  ' + result.gov_litres);
            console.log('  vcf:         ' + result.vcf);
            console.log('  nsv_litres:  ' + result.nsv_litres);

        } catch (err) {
            console.error('  ERROR:', err.message);
            console.error('  Make sure the database is running and db-setup.js has been run.');
            failed++;
        }

        console.log('');
        console.log('================================================');
        console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
        console.log('================================================');
        console.log('');

        await db.end();
        process.exit(failed > 0 ? 1 : 0);
    })();
}
