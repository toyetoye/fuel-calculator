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

    // ── Curve migration: seed Rivers Plus BALLAST from Rivers BALLAST if empty ──
    const rpBallastCount = await client.query(
      "SELECT COUNT(*) FROM interpolation_curves WHERE vessel_class='Rivers Plus' AND leg_type='BALLAST'"
    );
    if (parseInt(rpBallastCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO interpolation_curves (vessel_class, leg_type, speed, fuel)
        SELECT 'Rivers Plus', leg_type, speed, fuel
        FROM interpolation_curves
        WHERE vessel_class = 'Rivers' AND leg_type = 'BALLAST'
        ON CONFLICT DO NOTHING
      `);
      console.log('[DB] Seeded Rivers Plus BALLAST curves from Rivers BALLAST');
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
