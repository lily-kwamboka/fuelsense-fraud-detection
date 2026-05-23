/**
 * FuelSense - Database Setup
 * Phase 1 - Schema & Seed Data
 *
 * Creates all 6 tables, indexes, and constraints.
 * Then seeds: 1 station, 2 tanks, and a synthetic strapping table.
 *
 * Usage:
 *   node db-setup.js
 *
 * WARNING: Drops and recreates all tables on each run.
 * Do NOT run this against a production database.
 */

require('dotenv').config();

const { Pool } = require('pg');

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const SCHEMA = `

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop in reverse dependency order
DROP TABLE IF EXISTS daily_reconciliation   CASCADE;
DROP TABLE IF EXISTS deliveries             CASCADE;
DROP TABLE IF EXISTS atg_readings           CASCADE;
DROP TABLE IF EXISTS strapping_table_entries CASCADE;
DROP TABLE IF EXISTS tanks                  CASCADE;
DROP TABLE IF EXISTS stations              CASCADE;

-- ----------------------------
-- Table 1: stations
-- ----------------------------
CREATE TABLE stations (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200)  NOT NULL,
  location    VARCHAR(300),
  timezone    VARCHAR(50)   NOT NULL DEFAULT 'UTC',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ----------------------------
-- Table 2: tanks
-- ----------------------------
CREATE TABLE tanks (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id           UUID          NOT NULL REFERENCES stations(id),
  tank_number          INTEGER       NOT NULL,
  fuel_type            VARCHAR(50)   NOT NULL,
  capacity_litres      NUMERIC(10,2) NOT NULL,
  fuel_density_at_15c  NUMERIC(8,4)  NOT NULL,
  deadwood_litres      NUMERIC(10,2) NOT NULL DEFAULT 0,
  atg_probe_id         VARCHAR(100),
  UNIQUE (station_id, tank_number)
);

-- ----------------------------
-- Table 3: strapping_table_entries
-- ----------------------------
CREATE TABLE strapping_table_entries (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id        UUID           NOT NULL REFERENCES tanks(id),
  depth_mm       INTEGER        NOT NULL,
  volume_litres  NUMERIC(12,3)  NOT NULL,
  UNIQUE (tank_id, depth_mm)
);

CREATE INDEX idx_strapping_tank_depth
  ON strapping_table_entries (tank_id, depth_mm);

-- ----------------------------
-- Table 4: atg_readings
-- ----------------------------
CREATE TABLE atg_readings (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id        UUID           NOT NULL REFERENCES tanks(id),
  recorded_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  innage_mm      NUMERIC(8,1)   NOT NULL,
  water_mm       NUMERIC(8,1)   NOT NULL DEFAULT 0,
  temperature_c  NUMERIC(6,2)   NOT NULL,
  tov_litres     NUMERIC(12,3)  NOT NULL DEFAULT 0,
  water_litres   NUMERIC(12,3)  NOT NULL DEFAULT 0,
  gov_litres     NUMERIC(12,3)  NOT NULL DEFAULT 0,
  vcf            NUMERIC(10,6)  NOT NULL DEFAULT 1.0,
  nsv_litres     NUMERIC(12,3)  NOT NULL DEFAULT 0,
  is_locked      BOOLEAN        NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_readings_tank_time
  ON atg_readings (tank_id, recorded_at DESC);

-- ----------------------------
-- Table 5: deliveries
-- ----------------------------
CREATE TABLE deliveries (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id              UUID           NOT NULL REFERENCES tanks(id),
  supplier_name        VARCHAR(200),
  bol_number           VARCHAR(100),
  bol_nsv_litres       NUMERIC(12,3),
  bol_entered_at       TIMESTAMPTZ,
  truck_arrived_at     TIMESTAMPTZ,
  offload_started_at   TIMESTAMPTZ,
  offload_ended_at     TIMESTAMPTZ,
  opening_reading_id   UUID           REFERENCES atg_readings(id),
  closing_reading_id   UUID           REFERENCES atg_readings(id),
  received_nsv_litres  NUMERIC(12,3),
  variance_litres      NUMERIC(12,3),
  variance_pct         NUMERIC(8,4),
  tolerance_pct        NUMERIC(8,4)   NOT NULL DEFAULT 0.25,
  status               VARCHAR(30)    NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_deliveries_tank
  ON deliveries (tank_id, offload_started_at DESC);

-- ----------------------------
-- Table 6: daily_reconciliation
-- ----------------------------
CREATE TABLE daily_reconciliation (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id             UUID           NOT NULL REFERENCES tanks(id),
  date                DATE           NOT NULL,
  opening_nsv         NUMERIC(12,3),
  closing_nsv         NUMERIC(12,3),
  deliveries_nsv      NUMERIC(12,3)  NOT NULL DEFAULT 0,
  pump_sales_litres   NUMERIC(12,3)  NOT NULL DEFAULT 0,
  theoretical_closing NUMERIC(12,3),
  variance_litres     NUMERIC(12,3),
  UNIQUE (tank_id, date)
);

`;

// ---------------------------------------------------------------------------
// Synthetic strapping table generator
// ---------------------------------------------------------------------------
function generateStrappingTable(tankId, radiusMm = 1000, lengthMm = 5000) {
    const rows = [];
    const R = radiusMm;
    const L = lengthMm;

    for (let d = 0; d <= 2 * R; d++) {
        let volumeMm3;
        if (d <= 0) {
            volumeMm3 = 0;
        } else if (d >= 2 * R) {
            volumeMm3 = Math.PI * R * R * L;
        } else {
            const term1 = R * R * Math.acos((R - d) / R);
            const term2 = (R - d) * Math.sqrt(2 * R * d - d * d);
            volumeMm3 = L * (term1 - term2);
        }
        const volumeLitres = volumeMm3 / 1_000_000;
        rows.push({ tankId, depthMm: d, volumeLitres: +volumeLitres.toFixed(3) });
    }

    return rows;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
async function seed(stationId, tank1Id, tank2Id) {
    await db.query(
        `INSERT INTO stations (id, name, location, timezone)
     VALUES ($1, $2, $3, $4)`,
        [stationId, 'FuelSense Dev Station', '1 Test Road, Dev City', 'Africa/Nairobi']
    );
    console.log('[setup] Station created:', stationId);

    await db.query(
        `INSERT INTO tanks
       (id, station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, atg_probe_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tank1Id, stationId, 1, 'petrol', 30000, 0.740, 'PROBE-001']
    );
    console.log('[setup] Tank 1 (Petrol) created:', tank1Id);

    await db.query(
        `INSERT INTO tanks
       (id, station_id, tank_number, fuel_type, capacity_litres, fuel_density_at_15c, atg_probe_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tank2Id, stationId, 2, 'diesel', 30000, 0.835, 'PROBE-002']
    );
    console.log('[setup] Tank 2 (Diesel) created:', tank2Id);

    console.log('[setup] Generating strapping table for Tank 1 (2001 rows)...');
    const tank1Strapping = generateStrappingTable(tank1Id);

    console.log('[setup] Generating strapping table for Tank 2 (2001 rows)...');
    const tank2Strapping = generateStrappingTable(tank2Id);

    async function bulkInsertStrapping(rows) {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const values = batch.map((r, idx) => {
                const base = idx * 3;
                return `($${base + 1}, $${base + 2}, $${base + 3})`;
            }).join(', ');
            const params = batch.flatMap(r => [r.tankId, r.depthMm, r.volumeLitres]);
            await db.query(
                `INSERT INTO strapping_table_entries (tank_id, depth_mm, volume_litres)
         VALUES ${values}
         ON CONFLICT (tank_id, depth_mm) DO NOTHING`,
                params
            );
            process.stdout.write('.');
        }
        process.stdout.write('\n');
    }

    await bulkInsertStrapping(tank1Strapping);
    console.log('[setup] Tank 1 strapping table inserted (' + tank1Strapping.length + ' rows)');

    await bulkInsertStrapping(tank2Strapping);
    console.log('[setup] Tank 2 strapping table inserted (' + tank2Strapping.length + ' rows)');

    const check = await db.query(
        `SELECT depth_mm, volume_litres
     FROM strapping_table_entries
     WHERE tank_id = $1 AND depth_mm IN (0, 500, 1000, 1500, 2000)
     ORDER BY depth_mm`,
        [tank1Id]
    );
    console.log('');
    console.log('[setup] Strapping table spot check (Tank 1):');
    console.log('  depth_mm | volume_litres');
    console.log('  ---------|---------------');
    for (const row of check.rows) {
        console.log('  ' + String(row.depth_mm).padStart(8) + ' | ' + row.volume_litres);
    }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
(async () => {
    console.log('');
    console.log('================================================');
    console.log('  FuelSense Database Setup');
    console.log('  DB: ' + process.env.DATABASE_URL);
    console.log('================================================');
    console.log('');

    try {
        await db.query('SELECT 1');
        console.log('[setup] Database connection OK');
    } catch (err) {
        console.error('[setup] Cannot connect to database:', err.message);
        process.exit(1);
    }

    try {
        console.log('[setup] Creating schema...');
        await db.query(SCHEMA);
        console.log('[setup] Schema created (6 tables)');
        console.log('');

        const stationId = 'a0000000-0000-0000-0000-000000000001';
        const tank1Id   = 'b0000000-0000-0000-0000-000000000001';
        const tank2Id   = 'b0000000-0000-0000-0000-000000000002';

        console.log('[setup] Seeding data...');
        await seed(stationId, tank1Id, tank2Id);

        console.log('');
        console.log('================================================');
        console.log('  Setup complete. Ready to run:');
        console.log('  node ingestion-scheduler.js');
        console.log('================================================');
        console.log('');
    } catch (err) {
        console.error('[setup] Setup failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await db.end();
    }
})();
