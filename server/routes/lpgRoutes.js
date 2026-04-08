// lpgRoutes.js — LPG Fuel Reporting Module
// Covers: Alfred Temile (9859882) & Alfred Temile 10 (9937127)
// Handles: Excel import, CRUD, dashboard stats, CII, PDF export

'use strict';
const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const PDFDocument = require('pdfkit');
const path     = require('path');
const fs       = require('fs');
const { pool } = require('../db');
const { authenticate, adminOnly } = require('../auth');
const router   = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ── Schema bootstrap ─────────────────────────────────────────────────────────
async function initLpgSchema() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO fuel, public');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lpg_vessels (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200) NOT NULL UNIQUE,
        imo         VARCHAR(20),
        dwt         DECIMAL(12,2) DEFAULT 0,
        vessel_type VARCHAR(50) DEFAULT 'FRPG',
        active      BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS lpg_voyages (
        id           SERIAL PRIMARY KEY,
        vessel_name  VARCHAR(200) NOT NULL,
        voyage_number VARCHAR(50),
        start_date   DATE,
        end_date     DATE,
        status       VARCHAR(20) DEFAULT 'active',
        created_by   INTEGER,
        created_at   TIMESTAMP DEFAULT NOW(),
        notes        TEXT
      );

      CREATE TABLE IF NOT EXISTS lpg_records (
        id              SERIAL PRIMARY KEY,
        voyage_id       INTEGER REFERENCES lpg_voyages(id) ON DELETE CASCADE,
        vessel_name     VARCHAR(200) NOT NULL,
        record_date     DATE NOT NULL,
        time_utc        VARCHAR(10),
        mode            VARCHAR(50),
        status          VARCHAR(200),
        voyage_number   VARCHAR(50),
        sea_hrs         DECIMAL(8,4) DEFAULT 0,
        manv_hrs        DECIMAL(8,4) DEFAULT 0,
        anchor_hrs      DECIMAL(8,4) DEFAULT 0,
        berth_hrs       DECIMAL(8,4) DEFAULT 0,
        total_hrs       DECIMAL(8,4) DEFAULT 0,
        me_revs         DECIMAL(12,2) DEFAULT 0,
        me_rpm          DECIMAL(8,3) DEFAULT 0,
        engine_dist     DECIMAL(10,3) DEFAULT 0,
        obs_dist        DECIMAL(10,3) DEFAULT 0,
        obs_speed       DECIMAL(8,3) DEFAULT 0,
        slip            DECIMAL(8,3) DEFAULT 0,
        bhp             DECIMAL(10,2) DEFAULT 0,
        kw              DECIMAL(10,2) DEFAULT 0,
        ulsfo_me        DECIMAL(10,4) DEFAULT 0,
        ulsfo_ae        DECIMAL(10,4) DEFAULT 0,
        ulsfo_blr       DECIMAL(10,4) DEFAULT 0,
        ulsfo_total     DECIMAL(10,4) DEFAULT 0,
        ulsfo_rob       DECIMAL(10,4) DEFAULT 0,
        ulsfo_bunkered  DECIMAL(10,4) DEFAULT 0,
        lsmgo_me        DECIMAL(10,4) DEFAULT 0,
        lsmgo_ae        DECIMAL(10,4) DEFAULT 0,
        lsmgo_blr       DECIMAL(10,4) DEFAULT 0,
        lsmgo_total     DECIMAL(10,4) DEFAULT 0,
        lsmgo_rob       DECIMAL(10,4) DEFAULT 0,
        lsmgo_bunkered  DECIMAL(10,4) DEFAULT 0,
        ae1_rhr         DECIMAL(10,2) DEFAULT 0,
        ae2_rhr         DECIMAL(10,2) DEFAULT 0,
        ae3_rhr         DECIMAL(10,2) DEFAULT 0,
        cargo_plant_rhr DECIMAL(10,2) DEFAULT 0,
        co2_tonnes      DECIMAL(10,4) DEFAULT 0,
        nox             DECIMAL(10,4) DEFAULT 0,
        sox             DECIMAL(10,4) DEFAULT 0,
        fw_produced     DECIMAL(10,3) DEFAULT 0,
        fw_consumed     DECIMAL(10,3) DEFAULT 0,
        fw_rob          DECIMAL(10,3) DEFAULT 0,
        cyl_oil_cons    DECIMAL(10,4) DEFAULT 0,
        cyl_oil_rob     DECIMAL(10,4) DEFAULT 0,
        remarks         TEXT,
        created_at      TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS lpg_records_voyage_idx ON lpg_records(voyage_id);
      CREATE INDEX IF NOT EXISTS lpg_records_date_idx   ON lpg_records(record_date);
      CREATE INDEX IF NOT EXISTS lpg_records_vessel_idx ON lpg_records(vessel_name);
    `);

    // Seed LPG vessels config table
    await client.query(`
      INSERT INTO lpg_vessels (name, imo, dwt, vessel_type) VALUES
        ('LPG Alfred Temile',    '9859882', 5400, 'FRPG'),
        ('LPG Alfred Temile 10', '9937127', 5400, 'FRPG')
      ON CONFLICT (name) DO NOTHING
    `);
    // Also seed into lng_vessels so they appear in user management / vessel assignment
    await client.query(`
      INSERT INTO lng_vessels (name, capacity_m3, dwt, vessel_class, foe_factor,
        laden_boiloff_pct, ballast_boiloff_pct, cf_hfo, cf_foe, active)
      VALUES
        ('LPG Alfred Temile',    0, 5400, 'LPG', 0, 0, 0, 3.114, 3.206, true),
        ('LPG Alfred Temile 10', 0, 5400, 'LPG', 0, 0, 0, 3.114, 3.206, true)
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('[LPG] Schema ready');
  } catch(e) {
    console.error('[LPG] Schema init error:', e.message);
  } finally { client.release(); }
}

// Boot on startup
initLpgSchema();

// ── Helpers ───────────────────────────────────────────────────────────────────
const n = v => (v === '' || v === null || v === undefined || (typeof v === 'string' && !v.trim())) ? 0 : parseFloat(v) || 0;

function xlDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().slice(0, 10);
}

function parseRow(row, vesselName) {
  return {
    vessel_name:     vesselName,
    record_date:     xlDateToISO(row[0]),
    time_utc:        String(row[1] || '').slice(0, 10),
    mode:            String(row[2] || '').slice(0, 50),
    status:          String(row[3] || '').slice(0, 200),
    voyage_number:   String(row[4] || '').slice(0, 50),
    sea_hrs:         n(row[8]),
    manv_hrs:        n(row[7]),
    anchor_hrs:      n(row[6]),
    berth_hrs:       n(row[5]),
    total_hrs:       n(row[9]),
    me_revs:         n(row[13]),
    me_rpm:          n(row[14]),
    engine_dist:     n(row[15]),
    obs_dist:        n(row[18]),
    obs_speed:       n(row[20]),
    slip:            n(row[22]),
    bhp:             n(row[25]),
    kw:              n(row[24]),
    ulsfo_me:        n(row[53]),
    ulsfo_ae:        n(row[54]),
    ulsfo_blr:       n(row[55]),
    ulsfo_total:     n(row[56]) || (n(row[53]) + n(row[54]) + n(row[55])),
    ulsfo_rob:       n(row[57]),
    ulsfo_bunkered:  n(row[67]),
    lsmgo_me:        n(row[69]),
    lsmgo_ae:        n(row[70]),
    lsmgo_blr:       n(row[61]),
    lsmgo_total:     n(row[71]) || n(row[62]),
    lsmgo_rob:       n(row[74]),
    lsmgo_bunkered:  n(row[72]),
    ae1_rhr:         n(row[44]),
    ae2_rhr:         n(row[45]),
    ae3_rhr:         n(row[46]),
    cargo_plant_rhr: n(row[50]),
    co2_tonnes:      n(row[63]),
    nox:             n(row[64]),
    sox:             n(row[65]),
    fw_produced:     n(row[91]),
    fw_consumed:     n(row[92]),
    fw_rob:          n(row[95]),
    cyl_oil_cons:    n(row[76]),
    cyl_oil_rob:     n(row[77]),
    remarks:         String(row[169] || row[3] || '').slice(0, 500),
  };
}

// ── CII calculation for gas carriers ─────────────────────────────────────────
function calcCII(records, dwt) {
  if (!dwt || dwt <= 0) return null;
  const CF_ULSFO = 3.114;
  const CF_LSMGO = 3.206;
  const year  = new Date().getFullYear();
  const Z     = ({2023:5,2024:5,2025:7,2026:9,2027:11,2028:11,2029:11,2030:11})[year] || 9;
  // Gas carrier reference line: 1120 × DWT^(-0.456)
  const ciiRef      = 1120 * Math.pow(dwt, -0.456);
  const ciiRequired = ciiRef * (1 - Z / 100);
  const bounds      = { A: ciiRequired*0.82, B: ciiRequired*0.93, C: ciiRequired*1.14, D: ciiRequired*1.34 };
  const getRating   = v => v<=bounds.A?'A':v<=bounds.B?'B':v<=bounds.C?'C':v<=bounds.D?'D':'E';

  let cumCO2=0, cumDist=0;
  const daily = records.map(r => {
    const co2 = (n(r.ulsfo_me)+n(r.ulsfo_ae)+n(r.ulsfo_blr)) * CF_ULSFO
              + (n(r.lsmgo_me)+n(r.lsmgo_ae)+n(r.lsmgo_blr)) * CF_LSMGO;
    const dist = n(r.obs_dist);
    cumCO2 += co2; cumDist += dist;
    const runCII = cumDist>0 ? (cumCO2*1e6)/(dwt*cumDist) : 0;
    return { date: r.record_date, co2, dist, cumCO2, cumDist, runCII, rating: getRating(runCII) };
  });
  const attained = cumDist>0 ? (cumCO2*1e6)/(dwt*cumDist) : 0;
  return { ciiRef, ciiRequired, bounds, Z, attained, rating: getRating(attained), totalCO2: cumCO2, totalDist: cumDist, daily, dwt };
}

// ── IMPORT ROUTES ─────────────────────────────────────────────────────────────

// Preview — parse Excel, return records without saving
router.post('/import/preview', authenticate, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Vessel name from row 1 col 0
    const vesselName = String(rows[0]?.[0] || '').replace('LPG/C', 'LPG').trim() || 'LPG Alfred Temile';

    // Detect named vessel
    let matchedVessel = 'LPG Alfred Temile';
    if (vesselName.toLowerCase().includes('10') || vesselName.toLowerCase().includes('at10')) {
      matchedVessel = 'LPG Alfred Temile 10';
    }

    const records = [];
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || typeof row[0] !== 'number' || row[0] < 40000) continue;
      const parsed = parseRow(row, matchedVessel);
      if (!parsed.record_date) continue;
      records.push(parsed);
    }

    if (!records.length) return res.status(400).json({ error: 'No valid data rows found' });

    // Group by voyage
    const voyages = {};
    records.forEach(r => {
      const key = r.voyage_number || 'UNASSIGNED';
      if (!voyages[key]) voyages[key] = { voyage_number: key, records: [], vessel_name: matchedVessel };
      voyages[key].records.push(r);
    });

    const voyageList = Object.values(voyages).map(v => ({
      ...v,
      start_date:   v.records[0]?.record_date,
      end_date:     v.records[v.records.length-1]?.record_date,
      record_count: v.records.length,
      preview:      v.records.slice(0, 3),
    }));

    res.json({ ok: true, vessel_name: matchedVessel, voyages: voyageList, total_records: records.length });
  } catch(e) {
    console.error('[LPG Import] preview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Confirm — save selected voyages
router.post('/import/confirm', authenticate, adminOnly, async (req, res) => {
  const { voyages } = req.body;
  if (!Array.isArray(voyages) || !voyages.length) return res.status(400).json({ error: 'No voyages' });

  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const v of voyages) {
      // Upsert voyage
      const vr = await client.query(`
        INSERT INTO lpg_voyages (vessel_name, voyage_number, start_date, end_date, created_by)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING
        RETURNING id`,
        [v.vessel_name, v.voyage_number, v.start_date, v.end_date, req.user.id]);

      let voyageId;
      if (vr.rows.length) {
        voyageId = vr.rows[0].id;
      } else {
        const ex = await client.query(
          'SELECT id FROM lpg_voyages WHERE vessel_name=$1 AND voyage_number=$2',
          [v.vessel_name, v.voyage_number]);
        voyageId = ex.rows[0]?.id;
        if (!voyageId) throw new Error('Could not create or find voyage');
      }

      let imported = 0;
      for (const r of v.records) {
        await client.query(`
          INSERT INTO lpg_records (
            voyage_id, vessel_name, record_date, time_utc, mode, status, voyage_number,
            sea_hrs, manv_hrs, anchor_hrs, berth_hrs, total_hrs,
            me_revs, me_rpm, engine_dist, obs_dist, obs_speed, slip, bhp, kw,
            ulsfo_me, ulsfo_ae, ulsfo_blr, ulsfo_total, ulsfo_rob, ulsfo_bunkered,
            lsmgo_me, lsmgo_ae, lsmgo_blr, lsmgo_total, lsmgo_rob, lsmgo_bunkered,
            ae1_rhr, ae2_rhr, ae3_rhr, cargo_plant_rhr,
            co2_tonnes, nox, sox, fw_produced, fw_consumed, fw_rob,
            cyl_oil_cons, cyl_oil_rob, remarks
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
            $37,$38,$39,$40,$41,$42,$43,$44,$45
          ) ON CONFLICT DO NOTHING`,
          [voyageId, r.vessel_name, r.record_date, r.time_utc, r.mode, r.status, r.voyage_number,
           r.sea_hrs, r.manv_hrs, r.anchor_hrs, r.berth_hrs, r.total_hrs,
           r.me_revs, r.me_rpm, r.engine_dist, r.obs_dist, r.obs_speed, r.slip, r.bhp, r.kw,
           r.ulsfo_me, r.ulsfo_ae, r.ulsfo_blr, r.ulsfo_total, r.ulsfo_rob, r.ulsfo_bunkered,
           r.lsmgo_me, r.lsmgo_ae, r.lsmgo_blr, r.lsmgo_total, r.lsmgo_rob, r.lsmgo_bunkered,
           r.ae1_rhr, r.ae2_rhr, r.ae3_rhr, r.cargo_plant_rhr,
           r.co2_tonnes, r.nox, r.sox, r.fw_produced, r.fw_consumed, r.fw_rob,
           r.cyl_oil_cons, r.cyl_oil_rob, r.remarks]);
        imported++;
      }
      results.push({ voyage_id: voyageId, voyage_number: v.voyage_number, vessel_name: v.vessel_name, imported });
    }
    await client.query('COMMIT');
    res.json({ ok: true, results });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('[LPG Import] confirm error:', e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── VOYAGE ROUTES ─────────────────────────────────────────────────────────────

router.get('/voyages', authenticate, async (req, res) => {
  try {
    const { vessel } = req.query;
    let q = 'SELECT v.*, COUNT(r.id)::int as record_count FROM lpg_voyages v LEFT JOIN lpg_records r ON r.voyage_id=v.id';
    const params = [];
    if (vessel) { q += ' WHERE v.vessel_name=$1'; params.push(vessel); }
    q += ' GROUP BY v.id ORDER BY v.start_date DESC NULLS LAST';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/voyages/:id', authenticate, async (req, res) => {
  try {
    const voy = await pool.query('SELECT * FROM lpg_voyages WHERE id=$1', [req.params.id]);
    if (!voy.rows.length) return res.status(404).json({ error: 'Not found' });
    const records = (await pool.query('SELECT * FROM lpg_records WHERE voyage_id=$1 ORDER BY record_date,time_utc', [req.params.id])).rows;
    const vessel  = (await pool.query('SELECT * FROM lpg_vessels WHERE name=$1', [voy.rows[0].vessel_name])).rows[0];
    const cii     = vessel ? calcCII(records, parseFloat(vessel.dwt)) : null;
    res.json({ ...voy.rows[0], records, cii });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/voyages/:id', authenticate, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM lpg_records WHERE voyage_id=$1', [req.params.id]);
    await pool.query('DELETE FROM lpg_voyages WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RECORD CRUD ───────────────────────────────────────────────────────────────

router.post('/records', authenticate, async (req, res) => {
  try {
    const r = req.body;
    const result = await pool.query(`
      INSERT INTO lpg_records (
        voyage_id, vessel_name, record_date, time_utc, mode, status, voyage_number,
        sea_hrs, manv_hrs, anchor_hrs, berth_hrs, total_hrs,
        me_revs, me_rpm, engine_dist, obs_dist, obs_speed, slip, bhp, kw,
        ulsfo_me, ulsfo_ae, ulsfo_blr, ulsfo_total, ulsfo_rob, ulsfo_bunkered,
        lsmgo_me, lsmgo_ae, lsmgo_blr, lsmgo_total, lsmgo_rob, lsmgo_bunkered,
        ae1_rhr, ae2_rhr, ae3_rhr, cargo_plant_rhr,
        co2_tonnes, nox, sox, fw_produced, fw_consumed, fw_rob,
        cyl_oil_cons, cyl_oil_rob, remarks
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
        $37,$38,$39,$40,$41,$42,$43,$44,$45
      ) RETURNING *`,
      [r.voyage_id, r.vessel_name, r.record_date, r.time_utc||'1200', r.mode||'Noon', r.status, r.voyage_number,
       r.sea_hrs||0, r.manv_hrs||0, r.anchor_hrs||0, r.berth_hrs||0, r.total_hrs||24,
       r.me_revs||0, r.me_rpm||0, r.engine_dist||0, r.obs_dist||0, r.obs_speed||0, r.slip||0, r.bhp||0, r.kw||0,
       r.ulsfo_me||0, r.ulsfo_ae||0, r.ulsfo_blr||0, r.ulsfo_total||0, r.ulsfo_rob||0, r.ulsfo_bunkered||0,
       r.lsmgo_me||0, r.lsmgo_ae||0, r.lsmgo_blr||0, r.lsmgo_total||0, r.lsmgo_rob||0, r.lsmgo_bunkered||0,
       r.ae1_rhr||0, r.ae2_rhr||0, r.ae3_rhr||0, r.cargo_plant_rhr||0,
       r.co2_tonnes||0, r.nox||0, r.sox||0, r.fw_produced||0, r.fw_consumed||0, r.fw_rob||0,
       r.cyl_oil_cons||0, r.cyl_oil_rob||0, r.remarks]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/records/:id', authenticate, async (req, res) => {
  try {
    const r = req.body;
    const result = await pool.query(`
      UPDATE lpg_records SET
        record_date=$1, time_utc=$2, mode=$3, status=$4, voyage_number=$5,
        sea_hrs=$6, manv_hrs=$7, anchor_hrs=$8, berth_hrs=$9, total_hrs=$10,
        me_revs=$11, me_rpm=$12, engine_dist=$13, obs_dist=$14, obs_speed=$15, slip=$16, bhp=$17, kw=$18,
        ulsfo_me=$19, ulsfo_ae=$20, ulsfo_blr=$21, ulsfo_total=$22, ulsfo_rob=$23, ulsfo_bunkered=$24,
        lsmgo_me=$25, lsmgo_ae=$26, lsmgo_blr=$27, lsmgo_total=$28, lsmgo_rob=$29, lsmgo_bunkered=$30,
        ae1_rhr=$31, ae2_rhr=$32, ae3_rhr=$33, cargo_plant_rhr=$34,
        co2_tonnes=$35, nox=$36, sox=$37, fw_produced=$38, fw_consumed=$39, fw_rob=$40,
        cyl_oil_cons=$41, cyl_oil_rob=$42, remarks=$43
      WHERE id=$44 RETURNING *`,
      [r.record_date, r.time_utc, r.mode, r.status, r.voyage_number,
       r.sea_hrs||0, r.manv_hrs||0, r.anchor_hrs||0, r.berth_hrs||0, r.total_hrs||24,
       r.me_revs||0, r.me_rpm||0, r.engine_dist||0, r.obs_dist||0, r.obs_speed||0, r.slip||0, r.bhp||0, r.kw||0,
       r.ulsfo_me||0, r.ulsfo_ae||0, r.ulsfo_blr||0, r.ulsfo_total||0, r.ulsfo_rob||0, r.ulsfo_bunkered||0,
       r.lsmgo_me||0, r.lsmgo_ae||0, r.lsmgo_blr||0, r.lsmgo_total||0, r.lsmgo_rob||0, r.lsmgo_bunkered||0,
       r.ae1_rhr||0, r.ae2_rhr||0, r.ae3_rhr||0, r.cargo_plant_rhr||0,
       r.co2_tonnes||0, r.nox||0, r.sox||0, r.fw_produced||0, r.fw_consumed||0, r.fw_rob||0,
       r.cyl_oil_cons||0, r.cyl_oil_rob||0, r.remarks, req.params.id]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/records/:id', authenticate, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM lpg_records WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const { vessel, days = 90 } = req.query;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
    const params = vessel ? [vessel, since] : [since];
    const where  = vessel ? 'WHERE vessel_name=$1 AND record_date >= $2' : 'WHERE record_date >= $1';

    const { rows } = await pool.query(`
      SELECT record_date, vessel_name, mode,
        sea_hrs, total_hrs,
        ulsfo_me, ulsfo_ae, ulsfo_blr, ulsfo_total, ulsfo_rob, ulsfo_bunkered,
        lsmgo_total, lsmgo_rob, lsmgo_bunkered,
        obs_dist, me_rpm, obs_speed,
        ae1_rhr, ae2_rhr, ae3_rhr, cargo_plant_rhr,
        co2_tonnes, fw_rob
      FROM lpg_records ${where}
      ORDER BY record_date`, params);

    // Group by date (take last entry per date for ROB trend)
    const byDate = {};
    rows.forEach(r => {
      const k = r.record_date?.toString().slice(0,10);
      if (!byDate[k]) byDate[k] = [];
      byDate[k].push(r);
    });

    const trend = Object.entries(byDate).sort().map(([d, recs]) => {
      const last = recs[recs.length - 1];
      const totalUlsfo = recs.reduce((s,r) => s + parseFloat(r.ulsfo_total)||0, 0);
      const totalLsmgo = recs.reduce((s,r) => s + parseFloat(r.lsmgo_total)||0, 0);
      const totalDist  = recs.reduce((s,r) => s + parseFloat(r.obs_dist)||0, 0);
      return {
        date: d,
        ulsfo_rob:   parseFloat(last.ulsfo_rob)||0,
        lsmgo_rob:   parseFloat(last.lsmgo_rob)||0,
        ulsfo_cons:  totalUlsfo,
        lsmgo_cons:  totalLsmgo,
        dist:        totalDist,
        fw_rob:      parseFloat(last.fw_rob)||0,
      };
    });

    const summary = {
      total_ulsfo_cons: rows.reduce((s,r) => s + (parseFloat(r.ulsfo_total)||0), 0),
      total_lsmgo_cons: rows.reduce((s,r) => s + (parseFloat(r.lsmgo_total)||0), 0),
      total_dist:       rows.reduce((s,r) => s + (parseFloat(r.obs_dist)||0), 0),
      total_days:       rows.length,
      sea_days:         rows.filter(r => parseFloat(r.sea_hrs) > 12).length,
    };

    res.json({ trend, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── LIST VESSELS ──────────────────────────────────────────────────────────────
router.get('/vessels', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM lpg_vessels WHERE active=true ORDER BY name');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── PDF EXPORT ────────────────────────────────────────────────────────────────
function authFromQuery(req, res, next) {
  const token = req.query.token || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error:'No token' });
  const jwt = require('jsonwebtoken');
  const SECRET = process.env.JWT_SECRET || 'fleet-budget-secret-change-me';
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ error:'Invalid token' }); }
}

router.get('/voyages/:id/pdf', authFromQuery, async (req, res) => {
  try {
    const voy = await pool.query('SELECT * FROM lpg_voyages WHERE id=$1', [req.params.id]);
    if (!voy.rows.length) return res.status(404).json({ error:'Not found' });
    const voyage  = voy.rows[0];
    const records = (await pool.query('SELECT * FROM lpg_records WHERE voyage_id=$1 ORDER BY record_date,time_utc', [req.params.id])).rows;
    const vessel  = (await pool.query('SELECT * FROM lpg_vessels WHERE name=$1', [voyage.vessel_name])).rows[0];
    const cii     = vessel ? calcCII(records, parseFloat(vessel.dwt)) : null;

    const PAGE_W=842, PAGE_H=595, M=30, CONTENT=782, BOTTOM=545;
    const f = (v,d=2) => Number(v||0).toFixed(d);
    const f0 = v => Math.round(Number(v||0)).toLocaleString();

    const doc = new PDFDocument({ margin:M, size:'A4', layout:'landscape', autoFirstPage:false });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=LPG_Fuel_${(voyage.voyage_number||'report').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    doc.pipe(res);

    let pageNum = 0;
    const ROWS_PER_PAGE = 34;
    const totalPages = Math.ceil(records.length / ROWS_PER_PAGE) + 1 + (cii ? 1 : 0);

    function drawHeader(label) {
      pageNum++;
      doc.addPage();
      doc.fill('#1E293B').rect(0,0,PAGE_W,50).fill();
      doc.fill('#F59E0B').fontSize(9).font('Helvetica-Bold').text('FORCAP', M+4, M-12, {lineBreak:false});
      doc.fill('#E2E8F0').fontSize(10).font('Helvetica-Bold').text(`${voyage.vessel_name}  ·  ${voyage.voyage_number||'—'}  ·  LPG Fuel Log`, M+60, M-10, {width:550,align:'center',lineBreak:false});
      doc.fill('#64748B').fontSize(7).font('Helvetica').text(label, M+60, M+4, {width:550,align:'center',lineBreak:false});
      try {
        const logoPath = path.join(__dirname,'../assets/nsml_logo.jpg');
        if (fs.existsSync(logoPath)) doc.image(logoPath, PAGE_W-M-70, M-14, {height:32,fit:[70,32]});
      } catch(e) {}
      // Footer
      doc.fill('#E2E8F0').rect(M, PAGE_H-M-12, CONTENT, 0.5).fill();
      doc.fill('#64748B').fontSize(6).font('Helvetica')
         .text('FORCAP\xAE 2026  \u2014  Confidential', M, PAGE_H-M-7, {lineBreak:false})
         .text(`Page ${pageNum} of ${totalPages}`, M, PAGE_H-M-7, {width:CONTENT,align:'right',lineBreak:false});
      return 60;
    }

    // ── RECORDS PAGES ──
    const recCols = [
      {h:'Date',w:54,a:'left'},{h:'Time',w:28,a:'center'},{h:'Status',w:110,a:'left'},
      {h:'Sea',w:26,a:'right'},{h:'Dist',w:30,a:'right'},{h:'RPM',w:28,a:'right'},
      {h:'ME ULSFO',w:40,a:'right'},{h:'AE ULSFO',w:40,a:'right'},{h:'ULSFO ROB',w:42,a:'right'},
      {h:'LSMGO',w:36,a:'right'},{h:'LSMGO ROB',w:42,a:'right'},
      {h:'Bnkr U',w:34,a:'right'},{h:'CrgPlt',w:32,a:'right'},
    ];

    let y = drawHeader('DAILY NOON RECORDS');

    function drawTableHeader(y) {
      doc.fill('#1E293B').rect(M,y,CONTENT,13).fill();
      let x = M+2;
      doc.fill('#F59E0B').fontSize(5.5).font('Helvetica-Bold');
      recCols.forEach(c => { doc.text(c.h,x,y+4,{width:c.w,align:c.a,lineBreak:false}); x+=c.w+1; });
      return y+14;
    }

    y = drawTableHeader(y);

    records.forEach((r, ri) => {
      if (y+11 > BOTTOM) { y = drawHeader('DAILY NOON RECORDS (continued)'); y = drawTableHeader(y); }
      const bg = ri%2===0?'#0F172A':'#1A2535';
      doc.fill(parseFloat(r.sea_hrs)>12 ? bg : '#1A1F2E').rect(M,y,CONTENT,11).fill();
      let x = M+2;
      const vals = [
        r.record_date?.slice(0,10)||'',
        r.time_utc||'',
        (r.status||'').slice(0,30),
        f(r.sea_hrs,1), f(r.obs_dist,0), f(r.me_rpm,1),
        f(r.ulsfo_me), f(r.ulsfo_ae), f(r.ulsfo_rob),
        f(r.lsmgo_total), f(r.lsmgo_rob),
        parseFloat(r.ulsfo_bunkered)>0 ? f(r.ulsfo_bunkered) : '',
        f(r.cargo_plant_rhr,1),
      ];
      vals.forEach((v,vi) => {
        const c = vi===8||vi===10?'#67E8F9':vi===0?'#FBBF24':'#CBD5E1';
        doc.fill(c).fontSize(6).font('Helvetica').text(String(v),x,y+3,{width:recCols[vi].w,align:recCols[vi].a,lineBreak:false});
        x+=recCols[vi].w+1;
      });
      y+=11;
    });

    // Totals
    doc.fill('#1E293B').rect(M,y,CONTENT,13).fill();
    const tots = ['','','TOTALS',
      f(records.reduce((s,r)=>s+parseFloat(r.sea_hrs||0),0),1),
      f0(records.reduce((s,r)=>s+parseFloat(r.obs_dist||0),0)), '',
      f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_me||0),0)),
      f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_ae||0),0)), '',
      f(records.reduce((s,r)=>s+parseFloat(r.lsmgo_total||0),0)), '',
      f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_bunkered||0),0)), '',
    ];
    let x2 = M+2;
    doc.fill('#F59E0B').fontSize(6).font('Helvetica-Bold');
    tots.forEach((v,vi) => { doc.text(String(v),x2,y+4,{width:recCols[vi].w,align:recCols[vi].a,lineBreak:false}); x2+=recCols[vi].w+1; });

    // ── SUMMARY PAGE ──
    y = drawHeader('FUEL SUMMARY');
    const totU = records.reduce((s,r)=>s+parseFloat(r.ulsfo_me||0)+parseFloat(r.ulsfo_ae||0)+parseFloat(r.ulsfo_blr||0),0);
    const totL = records.reduce((s,r)=>s+parseFloat(r.lsmgo_total||0),0);
    const totD = records.reduce((s,r)=>s+parseFloat(r.obs_dist||0),0);
    const last = records.length ? records[records.length-1] : {};
    const W2   = (CONTENT-10)/2;

    const drawSumBox = (bx,by,title,rows) => {
      const bh = 14 + rows.length*12;
      doc.fill('#1E293B').rect(bx,by,W2,bh).fill();
      doc.fill('#F59E0B').fontSize(7).font('Helvetica-Bold').text(title,bx+5,by+4,{lineBreak:false});
      rows.forEach(([l,v,c],i) => {
        const ry=by+17+i*12;
        doc.fill('#64748B').fontSize(6.5).font('Helvetica').text(l,bx+5,ry,{width:W2*0.6,lineBreak:false});
        doc.fill(c||'#E2E8F0').fontSize(6.5).font('Helvetica-Bold').text(v,bx+W2*0.6,ry,{width:W2*0.35,align:'right',lineBreak:false});
      });
      return bh;
    };

    const bh = drawSumBox(M, y, 'ULSFO CONSUMPTION', [
      ['ME Consumption', f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_me||0),0))+' MT'],
      ['AE Consumption', f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_ae||0),0))+' MT'],
      ['Boiler Consumption', f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_blr||0),0))+' MT'],
      ['Total ULSFO', f(totU)+' MT', '#FBBF24'],
      ['Bunkered', f(records.reduce((s,r)=>s+parseFloat(r.ulsfo_bunkered||0),0))+' MT', '#34D399'],
      ['Latest ROB', f(last.ulsfo_rob)+' MT', '#67E8F9'],
    ]);
    drawSumBox(M+W2+10, y, 'LSMGO CONSUMPTION', [
      ['ME LSMGO', f(records.reduce((s,r)=>s+parseFloat(r.lsmgo_me||0),0))+' MT'],
      ['AE/IG LSMGO', f(records.reduce((s,r)=>s+parseFloat(r.lsmgo_ae||0),0))+' MT'],
      ['Total LSMGO', f(totL)+' MT', '#67E8F9'],
      ['Bunkered', f(records.reduce((s,r)=>s+parseFloat(r.lsmgo_bunkered||0),0))+' MT', '#34D399'],
      ['Latest ROB', f(last.lsmgo_rob)+' MT', '#67E8F9'],
      ['Total Distance', f0(totD)+' NM', '#A78BFA'],
    ]);
    y += bh + 10;
    drawSumBox(M, y, 'RUNNING HOURS', [
      ['AE1 (cumulative)', f(last.ae1_rhr,1)+' hrs'],
      ['AE2 (cumulative)', f(last.ae2_rhr,1)+' hrs'],
      ['AE3 (cumulative)', f(last.ae3_rhr,1)+' hrs'],
      ['Cargo Plant (total)', f(records.reduce((s,r)=>s+parseFloat(r.cargo_plant_rhr||0),0),1)+' hrs'],
      ['Sea Hours', f(records.reduce((s,r)=>s+parseFloat(r.sea_hrs||0),0),1)+' hrs'],
    ]);
    drawSumBox(M+W2+10, y, 'FRESH WATER & LUBE', [
      ['FW Produced', f(records.reduce((s,r)=>s+parseFloat(r.fw_produced||0),0))+' T'],
      ['FW Consumed', f(records.reduce((s,r)=>s+parseFloat(r.fw_consumed||0),0))+' T'],
      ['FW ROB', f(last.fw_rob)+' T'],
      ['Cyl Oil Cons', f(records.reduce((s,r)=>s+parseFloat(r.cyl_oil_cons||0),0))+' L'],
      ['Cyl Oil ROB', f(last.cyl_oil_rob)+' L'],
    ]);

    // ── CII PAGE ──
    if (cii) {
      y = drawHeader('CII — CARBON INTENSITY INDICATOR  ·  Gas Carrier  ·  IMO MEPC.352(78)');
      const rCol = {A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626'}[cii.rating]||'#94A3B8';
      const kpiW = CONTENT/4;
      [{l:'Attained CII',v:f(cii.attained),c:rCol},{l:'CII Rating',v:cii.rating,c:rCol},{l:'Required CII',v:f(cii.ciiRequired),c:'#94A3B8'},{l:'Total CO\u2082 (MT)',v:f(cii.totalCO2,1),c:'#67E8F9'}].forEach((k,i) => {
        const kx=M+i*kpiW;
        doc.fill('#1E293B').rect(kx,y,kpiW-4,40).fill();
        doc.fill('#64748B').fontSize(6).font('Helvetica').text(k.l,kx+5,y+7,{lineBreak:false});
        doc.fill(k.c).fontSize(16).font('Helvetica-Bold').text(k.v,kx+5,y+16,{lineBreak:false});
      });
      y+=48;
      const bw=CONTENT/5;
      ['A','B','C','D','E'].forEach((l,i) => {
        const c={A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626'}[l];
        doc.fill(c).rect(M+i*bw,y,bw,16).fill();
        doc.fill('#FFF').fontSize(8).font('Helvetica-Bold').text(l,M+i*bw,y+5,{width:bw,align:'center',lineBreak:false});
      });
      y+=20;
      [`\u2264 ${f(cii.bounds.A)}`,`\u2264 ${f(cii.bounds.B)}`,`\u2264 ${f(cii.bounds.C)}`,`\u2264 ${f(cii.bounds.D)}`,`> ${f(cii.bounds.D)}`].forEach((l,i) => {
        doc.fill('#64748B').fontSize(6).font('Helvetica').text(l,M+i*bw,y,{width:bw,align:'center',lineBreak:false});
      });
      y+=16;
      const pw=(CONTENT-8)/2;
      [['Ship Type','Gas Carrier (LPG)'],['DWT',f0(cii.dwt)+' MT'],['Reference CII',f(cii.ciiRef)],['Reduction Factor',cii.Z+'%'],['Required CII',f(cii.ciiRequired)],['CF (ULSFO)','3.114'],['CF (LSMGO)','3.206'],['Total Distance',f0(cii.totalDist)+' NM']].forEach((row,i) => {
        const col=i%2; const px=M+col*(pw+8);
        if(col===0&&i>0) y+=12;
        doc.fill('#1E293B').rect(px,y,pw,11).fill();
        doc.fill('#64748B').fontSize(6.5).font('Helvetica').text(row[0],px+4,y+2,{width:pw*0.55,lineBreak:false});
        doc.fill('#E2E8F0').fontSize(6.5).font('Helvetica-Bold').text(row[1],px+pw*0.55,y+2,{width:pw*0.42,align:'right',lineBreak:false});
      });
      y+=20;
      const pct=Math.min((cii.attained/(cii.bounds.D*1.3))*CONTENT,CONTENT);
      doc.fill('#FFFFFF').rect(M,y,CONTENT,14).fill();
      doc.fill(rCol).rect(M,y,pct,14).fill();
      doc.fill('#FFFFFF').fontSize(7).font('Helvetica-Bold').text(`Attained CII: ${f(cii.attained)} (${cii.rating})  |  Required: ${f(cii.ciiRequired)}`,M+6,y+4,{lineBreak:false});
    }

    doc.end();
  } catch(err) {
    console.error('[LPG PDF]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;

