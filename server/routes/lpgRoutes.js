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

    // Seed LPG vessels if not present
    await client.query(`
      INSERT INTO lpg_vessels (name, imo, dwt, vessel_type) VALUES
        ('LPG Alfred Temile',    '9859882', 5400, 'FRPG'),
        ('LPG Alfred Temile 10', '9937127', 5400, 'FRPG')
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

module.exports = router;
