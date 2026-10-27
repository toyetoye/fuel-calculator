const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
// Isolate Fuel tables in their own schema on the consolidated DB
pool.on('connect', client => { client.query('SET search_path TO fuel, public'); });

const initDB = async () => {
  const client = await pool.connect();
  try {
    // Ensure fuel schema exists
    await client.query('CREATE SCHEMA IF NOT EXISTS fuel');
    await client.query('SET search_path TO fuel, public');

    await client.query(`
      -- Users table (fuel calculator auth)
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'vessel',
        display_name VARCHAR(200),
        vessel_id INTEGER,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- LNG vessel specifications
      CREATE TABLE IF NOT EXISTS lng_vessels (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        capacity_m3 DECIMAL(12,2) NOT NULL,
        dwt DECIMAL(12,2) DEFAULT 0,
        foe_factor DECIMAL(8,4) DEFAULT 0.484,
        pitch DECIMAL(8,4),
        vessel_class VARCHAR(50) DEFAULT 'Rivers',
        laden_boiloff_pct DECIMAL(8,4) DEFAULT 0.15,
        ballast_boiloff_pct DECIMAL(8,4) DEFAULT 0.10,
        cf_hfo DECIMAL(8,4) DEFAULT 3.114,
        cf_foe DECIMAL(8,4) DEFAULT 2.750,
        active BOOLEAN DEFAULT true
      );

      -- Speed-fuel interpolation curves
      CREATE TABLE IF NOT EXISTS interpolation_curves (
        id SERIAL PRIMARY KEY,
        vessel_class VARCHAR(50) NOT NULL,
        leg_type VARCHAR(10) NOT NULL,
        speed DECIMAL(8,4) NOT NULL,
        fuel DECIMAL(10,4) NOT NULL,
        UNIQUE(vessel_class, leg_type, speed)
      );

      -- Weather/exclusion lookup
      CREATE TABLE IF NOT EXISTS exclusion_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        excluded BOOLEAN DEFAULT false
      );

      -- Voyages
      CREATE TABLE IF NOT EXISTS voyages (
        id SERIAL PRIMARY KEY,
        vessel_name VARCHAR(200) NOT NULL,
        voyage_number VARCHAR(50) NOT NULL,
        leg_type VARCHAR(10) NOT NULL DEFAULT 'BALLAST',
        discharge_port VARCHAR(200),
        loading_port VARCHAR(200),
        faop_time TIMESTAMP,
        faop_timezone VARCHAR(20),
        eosp_time TIMESTAMP,
        eosp_timezone VARCHAR(20),
        gauging_after_time TIMESTAMP,
        gauging_after_tz VARCHAR(20),
        gauging_before_time TIMESTAMP,
        gauging_before_tz VARCHAR(20),
        gauging_after_m3 DECIMAL(12,4),
        gauging_before_m3 DECIMAL(12,4),
        hfo_price DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'draft',
        created_by INTEGER,
        reviewed_by INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Daily noon reports
      CREATE TABLE IF NOT EXISTS noon_reports (
        id SERIAL PRIMARY KEY,
        voyage_id INTEGER REFERENCES voyages(id) ON DELETE CASCADE,
        day_number INTEGER NOT NULL,
        report_date DATE NOT NULL,
        steaming_hours DECIMAL(6,2) DEFAULT 0,
        total_revs INTEGER DEFAULT 0,
        distance_nm DECIMAL(8,2) DEFAULT 0,
        hfo_consumed DECIMAL(8,2) DEFAULT 0,
        foe_consumed DECIMAL(10,4) DEFAULT 0,
        nbo_consumed DECIMAL(10,4),
        fbo_consumed DECIMAL(10,4),
        weather_condition VARCHAR(100),
        remarks VARCHAR(500),
        excess_remarks VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(voyage_id, day_number)
      );

      -- User-vessel assignments for fuel calculator
      CREATE TABLE IF NOT EXISTS fuel_user_vessels (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        lng_vessel_id INTEGER REFERENCES lng_vessels(id) ON DELETE CASCADE,
        UNIQUE(user_id, lng_vessel_id)
      );

      -- Monthly fuel prices reference
      CREATE TABLE IF NOT EXISTS fuel_prices (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        fuel_type VARCHAR(20) DEFAULT 'VLSFO',
        price DECIMAL(10,2) NOT NULL,
        source VARCHAR(100) DEFAULT 'manual',
        updated_by INTEGER,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(year, month, fuel_type)
      );
    `);
    console.log('Fuel calculator tables initialized');

    // ── Migration: add NBO/FBO columns to noon_reports on existing deployments ──
    await client.query(`
      ALTER TABLE noon_reports ADD COLUMN IF NOT EXISTS nbo_consumed DECIMAL(10,4);
      ALTER TABLE noon_reports ADD COLUMN IF NOT EXISTS fbo_consumed DECIMAL(10,4);
    `);
    console.log('[Schema] NBO/FBO columns ensured on noon_reports');

    // ── Fuel curve correction migration (one-shot, idempotent) ──
    // Historical state: DB "Rivers" curves held Rivers Plus values; DB "Rivers Plus LADEN"
    // was truncated at 12.6 kt (only 36 points), pegging lookups above 12.6 at 82.256 MT.
    // Vessel class assignments were also inverted vs physical hull dimensions.
    // Fingerprint: Rivers LADEN at speed 16.1 kt should be 126.59 MT in corrected state
    // (was 126.352 MT in broken state — those were Rivers Plus values).
    const fp = await client.query(
      "SELECT fuel FROM interpolation_curves WHERE vessel_class='Rivers' AND leg_type='LADEN' AND speed = 16.1"
    );
    const corrected = fp.rows.length && Math.abs(parseFloat(fp.rows[0].fuel) - 126.59) < 0.05;
    if (!corrected) {
      console.log('[Migration] Applying fuel curve correction (NSML charter-party curves)…');
      const CURVES = require('./data/corrected-fuel-curves');
      await client.query('BEGIN');
      try {
        // 1. Wipe existing Rivers and Rivers Plus curves (any other classes are left alone)
        await client.query(
          "DELETE FROM interpolation_curves WHERE vessel_class IN ('Rivers', 'Rivers Plus')"
        );
        // 2. Reload all four curves from the authoritative data file
        for (const key of Object.keys(CURVES)) {
          const [cls, leg] = key.split(/_(?=LADEN$|BALLAST$)/);
          const points = CURVES[key];
          // Chunk inserts to keep parameter count under PG limits
          const CHUNK = 500;
          for (let i = 0; i < points.length; i += CHUNK) {
            const slice = points.slice(i, i + CHUNK);
            const values = slice.map((_, j) =>
              `($1, $2, $${3 + j*2}, $${4 + j*2})`
            ).join(',');
            const params = [cls, leg];
            for (const [s, f] of slice) params.push(s, f);
            await client.query(
              `INSERT INTO interpolation_curves (vessel_class, leg_type, speed, fuel) VALUES ${values}`,
              params
            );
          }
          console.log(`[Migration]   ${cls} ${leg}: ${points.length} points loaded`);
        }
        // 3. Fix vessel class assignments by physical hull size
        //    137,100 m³ (pitch 7.52)  → Rivers class
        //    141,090 m³ (pitch 7.8329) → Rivers Plus class
        const rc = await client.query(
          "UPDATE lng_vessels SET vessel_class='Rivers' WHERE capacity_m3 = 137100"
        );
        const rpc = await client.query(
          "UPDATE lng_vessels SET vessel_class='Rivers Plus' WHERE capacity_m3 = 141090"
        );
        console.log(`[Migration]   Vessels reassigned: ${rc.rowCount} to Rivers, ${rpc.rowCount} to Rivers Plus`);
        await client.query('COMMIT');
        console.log('[Migration] ✓ Fuel curve correction applied');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[Migration] ✗ Fuel curve correction FAILED, rolled back:', e.message);
        throw e;
      }
    } else {
      console.log('[Migration] Fuel curves already in corrected state (fingerprint matched)');
    }

    // Add columns if missing (for upgrades)
    const cols = [
      ['lng_vessels', 'dwt', 'DECIMAL(12,2) DEFAULT 0'],
      ['lng_vessels', 'cf_hfo', 'DECIMAL(8,4) DEFAULT 3.114'],
      ['lng_vessels', 'cf_foe', 'DECIMAL(8,4) DEFAULT 2.750'],
    ];
    for (const [tbl, col, def] of cols) {
      try { await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def}`); }
      catch (e) { /* column might exist */ }
    }

    // Seed default admin if no users exist
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const adminPass = process.env.ADMIN_PASSWORD || 'Forcap@2025!';
      const hash = await bcrypt.hash(adminPass, 10);
      await client.query(
        'INSERT INTO users (username, password, role, display_name) VALUES ($1, $2, $3, $4)',
        ['admin', hash, 'admin', 'System Administrator']
      );
      console.log('Default admin user seeded. Username: admin  Password:', adminPass);
    }

  } finally { client.release(); }
};

module.exports = { pool, initDB };
