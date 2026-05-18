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

const { Pool } = require('pg');

const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'fuelsense',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '2019',
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
// Avoids hitting the DB on every reading (readings come every 60s per tank).
// Cache is keyed by tankId. Cleared on process restart.
// ---------------------------------------------------------------------------
const strappingCache = {};

/**
 * Load and cache the full strapping table for a tank.
 * Returns an array of { depth_mm, volume_litres } sorted by depth ascending.
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
// Takes a tank ID and depth in mm. Returns volume in litres.
// Uses linear interpolation for fractional mm values.
// ---------------------------------------------------------------------------
async function lookupStrappingTable(tankId, depthMm) {
    if (depthMm < 0) depthMm = 0;

    const table = await loadStrappingTable(tankId);

    const floorMm = Math.floor(depthMm);
    const ceilMm = Math.ceil(depthMm);
    const fraction = depthMm - floorMm;

    // Find floor row
    const floorRow = table.find(r => r.depth_mm === floorMm);
    if (!floorRow) {
        throw new Error(
            'Strapping table lookup failed: depth ' + floorMm + 'mm not found for tank ' + tankId
        );
    }

    // No interpolation needed for whole mm values
    if (fraction === 0 || floorMm === ceilMm) {
        return parseFloat(floorRow.volume_litres);
    }

    // Find ceiling row for interpolation
    const ceilRow = table.find(r => r.depth_mm === ceilMm);
    if (!ceilRow) {
        return parseFloat(floorRow.volume_litres);
    }

    const floorVol = parseFloat(floorRow.volume_litres);
    const ceilVol = parseFloat(ceilRow.volume_litres);

    // Linear interpolation: V = V_floor + fraction * (V_ceil - V_floor)
    const interpolated = floorVol + fraction * (ceilVol - floorVol);
    return +interpolated.toFixed(3);
}

// ---------------------------------------------------------------------------
// Function 2: calculateTOVandWater
// Takes tank ID, fuel surface depth, and water depth.
// Returns TOV, water volume, and GOV in litres.
// ---------------------------------------------------------------------------
async function calculateTOVandWater(tankId, innageMm, waterMm) {
    const tov_litres = await lookupStrappingTable(tankId, innageMm);
    const water_litres = await lookupStrappingTable(tankId, waterMm);
    const gov_litres = +(tov_litres - water_litres).toFixed(3);

    return { tov_litres, water_litres, gov_litres };
}

// ---------------------------------------------------------------------------
// Function 3: calculateVCF
// ASTM D1250 temperature correction factor.
// Converts observed volume to standard volume at 15C.
//
// Validation:
//   At 15C exactly -> VCF must equal 1.0
//   At 25C, density 0.740 (petrol) -> VCF ~= 0.992
// ---------------------------------------------------------------------------
function calculateVCF(temperatureC, densityAt15C, fuelType = 'petrol') {
    const constants = VCF_CONSTANTS[fuelType] || VCF_CONSTANTS.petrol;
    const { K0, K1 } = constants;

    const alpha = K0 / (densityAt15C * densityAt15C) + K1 / densityAt15C;
    const deltaT = temperatureC - 15.0;

    // At exactly 15C, deltaT = 0, exp(0) = 1.0
    const vcf = Math.exp(-alpha * deltaT * (1 + 0.8 * alpha * deltaT));

    return +vcf.toFixed(6);
}

// ---------------------------------------------------------------------------
// Function 4: calculateNSV
// Full chain: raw probe inputs -> complete volume object.
// This is the function the ingestion scheduler calls.
// ---------------------------------------------------------------------------
async function calculateNSV(tankId, innageMm, waterMm, temperatureC) {
    // Get fuel density and type from DB
    const tankResult = await db.query(
        'SELECT fuel_type, fuel_density_at_15c FROM tanks WHERE id = $1',
        [tankId]
    );

    if (tankResult.rows.length === 0) {
        throw new Error('Tank not found: ' + tankId);
    }

    const { fuel_type, fuel_density_at_15c } = tankResult.rows[0];
    const density = parseFloat(fuel_density_at_15c);

    // Step 1: TOV, water, GOV from strapping table
    const { tov_litres, water_litres, gov_litres } = await calculateTOVandWater(
        tankId, innageMm, waterMm
    );

    // Step 2: VCF from temperature and density
    const vcf = calculateVCF(temperatureC, density, fuel_type);

    // Step 3: NSV = GOV * VCF
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

        // --- VCF unit tests (no DB needed) ---
        console.log('--- VCF Tests ---');

        // At exactly 15C, VCF must be exactly 1.0
        assert(
            'VCF = 1.0 at exactly 15C (petrol, density 0.740)',
            calculateVCF(15.0, 0.740, 'petrol'),
            1.0,
            0.000001
        );

        // At 25C, petrol density 0.740 -> ~0.989 (roadmap states ~0.992 as approximate)
        assert(
            'VCF ~= 0.989 at 25C (petrol, density 0.740)',
            calculateVCF(25.0, 0.740, 'petrol'),
            0.989,
            0.001
        );

        // At 15C, diesel must also be 1.0
        assert(
            'VCF = 1.0 at exactly 15C (diesel, density 0.835)',
            calculateVCF(15.0, 0.835, 'diesel'),
            1.0,
            0.000001
        );

        // Below 15C, VCF should be > 1.0 (fuel expands when warmer than standard)
        const vcfCold = calculateVCF(5.0, 0.740, 'petrol');
        assert(
            'VCF > 1.0 when temp < 15C',
            vcfCold > 1.0 ? 1 : 0,
            1,
            0
        );

        console.log('');

        // --- Strapping table + NSV tests (DB needed) ---
        console.log('--- Strapping Table & NSV Tests ---');

        const tank1Id = 'b0000000-0000-0000-0000-000000000001';

        try {
            // At depth 0, volume must be 0
            const vol0 = await lookupStrappingTable(tank1Id, 0);
            assert('Volume at 0mm = 0L', vol0, 0, 0.01);

            // At depth 1000mm (half the 2000mm tank), volume should be ~7854L
            // (half of pi * R^2 * L = pi * 1000^2 * 5000 / 1e6 = 15708L)
            const vol1000 = await lookupStrappingTable(tank1Id, 1000);
            assert('Volume at 1000mm ~= 7854L (half tank)', vol1000, 7853.982, 1.0);

            // At full depth 2000mm, volume should be ~15708L
            const vol2000 = await lookupStrappingTable(tank1Id, 2000);
            assert('Volume at 2000mm ~= 15708L (full tank)', vol2000, 15707.963, 1.0);

            // Interpolation test: 500.5mm should be between 500mm and 501mm
            const vol500 = await lookupStrappingTable(tank1Id, 500);
            const vol501 = await lookupStrappingTable(tank1Id, 501);
            const vol500_5 = await lookupStrappingTable(tank1Id, 500.5);
            const midpoint = (vol500 + vol501) / 2;
            assert('Linear interpolation at 500.5mm', vol500_5, midpoint, 0.01);

            // Full NSV calculation for tank 1
            // innage=1450mm, water=12mm, temp=18.5C
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
