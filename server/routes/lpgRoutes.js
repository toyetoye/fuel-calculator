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

// ── Schema ────────────────────────────────────────────────────────────────────
async function initLpgSchema() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO fuel, public');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lpg_vessels (
        id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL UNIQUE,
        imo VARCHAR(20), dwt DECIMAL(12,2) DEFAULT 0,
        vessel_type VARCHAR(50) DEFAULT 'FRPG', active BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS lpg_periods (
        id          SERIAL PRIMARY KEY,
        vessel_name VARCHAR(200) NOT NULL,
        period_key  VARCHAR(7) NOT NULL,        -- YYYY-MM
        period_label VARCHAR(30),               -- e.g. "March 2020"
        start_date  DATE,
        end_date    DATE,
        record_count INTEGER DEFAULT 0,
        created_by  INTEGER,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(vessel_name, period_key)
      );
      CREATE TABLE IF NOT EXISTS lpg_records (
        id              SERIAL PRIMARY KEY,
        period_id       INTEGER REFERENCES lpg_periods(id) ON DELETE CASCADE,
        vessel_name     VARCHAR(200) NOT NULL,
        record_date     DATE NOT NULL,
        time_utc        VARCHAR(10),
        mode            VARCHAR(50),
        status          VARCHAR(200),
        voyage_ref      VARCHAR(50),
        sea_hrs         DECIMAL(8,3) DEFAULT 0,
        manv_hrs        DECIMAL(8,3) DEFAULT 0,
        anchor_hrs      DECIMAL(8,3) DEFAULT 0,
        berth_hrs       DECIMAL(8,3) DEFAULT 0,
        total_hrs       DECIMAL(8,3) DEFAULT 0,
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
      CREATE INDEX IF NOT EXISTS lpg_rec_period_idx ON lpg_records(period_id);
      CREATE INDEX IF NOT EXISTS lpg_rec_date_idx   ON lpg_records(record_date);
      CREATE INDEX IF NOT EXISTS lpg_rec_vessel_idx ON lpg_records(vessel_name);
    `);

    // Seed lpg_vessels config
    await client.query(`
      INSERT INTO lpg_vessels (name, imo, dwt, vessel_type) VALUES
        ('LPG Alfred Temile',    '9859882', 5400, 'FRPG'),
        ('LPG Alfred Temile 10', '9937127', 5400, 'FRPG')
      ON CONFLICT (name) DO NOTHING
    `);
    // Seed into lng_vessels for user assignment UI
    await client.query(`
      INSERT INTO lng_vessels (name, capacity_m3, dwt, vessel_class, foe_factor,
        laden_boiloff_pct, ballast_boiloff_pct, cf_hfo, cf_foe, active)
      VALUES
        ('LPG Alfred Temile',    0, 5400, 'LPG', 0, 0, 0, 3.114, 3.206, true),
        ('LPG Alfred Temile 10', 0, 5400, 'LPG', 0, 0, 0, 3.114, 3.206, true)
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('[LPG] Schema ready');
  } catch(e) { console.error('[LPG] Schema error:', e.message); }
  finally { client.release(); }
}
initLpgSchema();

// ── Helpers ───────────────────────────────────────────────────────────────────
const n = v => (v === '' || v == null || (typeof v === 'string' && !v.trim())) ? 0 : parseFloat(v) || 0;

function xlDateToISO(serial) {
  if (!serial || typeof serial !== 'number' || serial < 30000) return null;
  return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function periodLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function parseRow(row, vesselName) {
  const dateStr = xlDateToISO(row[0]);
  if (!dateStr) return null;
  return {
    vessel_name:    vesselName,
    record_date:    dateStr,
    period_key:     dateStr.slice(0, 7),      // YYYY-MM
    time_utc:       String(row[1] || '').slice(0, 10),
    mode:           String(row[2] || '').slice(0, 50),
    status:         String(row[3] || '').slice(0, 200),
    voyage_ref:     String(row[4] || '').slice(0, 50),
    sea_hrs:        n(row[8]),
    manv_hrs:       n(row[7]),
    anchor_hrs:     n(row[6]),
    berth_hrs:      n(row[5]),
    total_hrs:      n(row[9]),
    me_revs:        n(row[13]),
    me_rpm:         n(row[14]),
    engine_dist:    n(row[15]),
    obs_dist:       n(row[18]),
    obs_speed:      n(row[20]),
    slip:           n(row[22]),
    bhp:            n(row[25]),
    kw:             n(row[24]),
    ulsfo_me:       n(row[53]),
    ulsfo_ae:       n(row[54]),
    ulsfo_blr:      n(row[55]),
    ulsfo_total:    n(row[56]) || (n(row[53]) + n(row[54]) + n(row[55])),
    ulsfo_rob:      n(row[57]),
    ulsfo_bunkered: n(row[67]),
    lsmgo_me:       n(row[69]),
    lsmgo_ae:       n(row[70]),
    lsmgo_blr:      n(row[61]),
    lsmgo_total:    n(row[71]) || n(row[62]),
    lsmgo_rob:      n(row[74]),
    lsmgo_bunkered: n(row[72]),
    ae1_rhr:        n(row[44]),
    ae2_rhr:        n(row[45]),
    ae3_rhr:        n(row[46]),
    cargo_plant_rhr:n(row[50]),
    co2_tonnes:     n(row[63]),
    nox:            n(row[64]),
    sox:            n(row[65]),
    fw_produced:    n(row[91]),
    fw_consumed:    n(row[92]),
    fw_rob:         n(row[95]),
    cyl_oil_cons:   n(row[76]),
    cyl_oil_rob:    n(row[77]),
    remarks:        String(row[3] || '').slice(0, 300),
  };
}

// ── CII ───────────────────────────────────────────────────────────────────────
function calcCII(records, dwt) {
  if (!dwt || dwt <= 0) return null;
  const CF_U = 3.114, CF_L = 3.206;
  const year = new Date().getFullYear();
  const Z    = ({2023:5,2024:5,2025:7,2026:9,2027:11,2028:11,2029:11,2030:11})[year] || 9;
  const ciiRef  = 1120 * Math.pow(dwt, -0.456);
  const ciiReq  = ciiRef * (1 - Z / 100);
  const bounds  = { A:ciiReq*0.82, B:ciiReq*0.93, C:ciiReq*1.14, D:ciiReq*1.34 };
  const rate    = v => v<=bounds.A?'A':v<=bounds.B?'B':v<=bounds.C?'C':v<=bounds.D?'D':'E';
  let cumCO2=0, cumDist=0;
  records.forEach(r => { cumCO2 += (n(r.ulsfo_me)+n(r.ulsfo_ae)+n(r.ulsfo_blr))*CF_U + (n(r.lsmgo_me)+n(r.lsmgo_ae)+n(r.lsmgo_blr))*CF_L; cumDist += n(r.obs_dist); });
  const attained = cumDist > 0 ? (cumCO2*1e6)/(dwt*cumDist) : 0;
  return { ciiRef, ciiReq, bounds, Z, attained, rating:rate(attained), totalCO2:cumCO2, totalDist:cumDist, dwt };
}

// ── LPG access middleware ─────────────────────────────────────────────────────
function lpgAccess(req, res, next) {
  const role = req.user?.role;
  const vns  = req.user?.vessel_names || [];
  if (['admin','manager'].includes(role) || vns.some(v => v.toLowerCase().includes('alfred temile'))) return next();
  return res.status(403).json({ error: 'LPG access not assigned' });
}

// ── IMPORT ────────────────────────────────────────────────────────────────────
router.post('/import/preview', authenticate, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb   = XLSX.read(req.file.buffer, { type:'buffer', cellDates:false });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

    const rawName    = String(rows[0]?.[0] || '');
    const vesselName = rawName.toLowerCase().includes('10') ? 'LPG Alfred Temile 10' : 'LPG Alfred Temile';

    // Parse all data rows
    const allRecords = [];
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || typeof r[0] !== 'number' || r[0] < 30000) continue;
      const parsed = parseRow(r, vesselName);
      if (parsed) allRecords.push(parsed);
    }
    if (!allRecords.length) return res.status(400).json({ error: 'No valid rows found' });

    // Group by YYYY-MM
    const byMonth = {};
    allRecords.forEach(r => {
      if (!byMonth[r.period_key]) byMonth[r.period_key] = [];
      byMonth[r.period_key].push(r);
    });

    const periods = Object.entries(byMonth).sort().map(([key, recs]) => ({
      vessel_name:  vesselName,
      period_key:   key,
      period_label: periodLabel(key),
      start_date:   recs[0].record_date,
      end_date:     recs[recs.length-1].record_date,
      record_count: recs.length,
      records:      recs,
      preview:      recs.slice(0, 3),
    }));

    res.json({ ok:true, vessel_name:vesselName, periods, total_records:allRecords.length });
  } catch(e) { console.error('[LPG import]', e); res.status(500).json({ error: e.message }); }
});

router.post('/import/confirm', authenticate, adminOnly, async (req, res) => {
  const { periods } = req.body;
  if (!Array.isArray(periods) || !periods.length) return res.status(400).json({ error: 'No periods' });
  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const p of periods) {
      // Upsert period
      const pr = await client.query(`
        INSERT INTO lpg_periods (vessel_name, period_key, period_label, start_date, end_date, record_count, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (vessel_name, period_key) DO UPDATE SET
          period_label=EXCLUDED.period_label, start_date=EXCLUDED.start_date,
          end_date=EXCLUDED.end_date, record_count=EXCLUDED.record_count
        RETURNING id`,
        [p.vessel_name, p.period_key, p.period_label, p.start_date, p.end_date, p.record_count, req.user.id]);
      const pid = pr.rows[0].id;

      // Delete existing records for this period to allow re-import
      await client.query('DELETE FROM lpg_records WHERE period_id=$1', [pid]);

      // Bulk insert
      let cnt = 0;
      for (const r of p.records) {
        await client.query(`
          INSERT INTO lpg_records (
            period_id, vessel_name, record_date, time_utc, mode, status, voyage_ref,
            sea_hrs, manv_hrs, anchor_hrs, berth_hrs, total_hrs,
            me_revs, me_rpm, engine_dist, obs_dist, obs_speed, slip, bhp, kw,
            ulsfo_me, ulsfo_ae, ulsfo_blr, ulsfo_total, ulsfo_rob, ulsfo_bunkered,
            lsmgo_me, lsmgo_ae, lsmgo_blr, lsmgo_total, lsmgo_rob, lsmgo_bunkered,
            ae1_rhr, ae2_rhr, ae3_rhr, cargo_plant_rhr,
            co2_tonnes, nox, sox, fw_produced, fw_consumed, fw_rob,
            cyl_oil_cons, cyl_oil_rob, remarks
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                   $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
                   $37,$38,$39,$40,$41,$42,$43,$44,$45)`,
          [pid, r.vessel_name, r.record_date, r.time_utc, r.mode, r.status, r.voyage_ref,
           r.sea_hrs, r.manv_hrs, r.anchor_hrs, r.berth_hrs, r.total_hrs,
           r.me_revs, r.me_rpm, r.engine_dist, r.obs_dist, r.obs_speed, r.slip, r.bhp, r.kw,
           r.ulsfo_me, r.ulsfo_ae, r.ulsfo_blr, r.ulsfo_total, r.ulsfo_rob, r.ulsfo_bunkered,
           r.lsmgo_me, r.lsmgo_ae, r.lsmgo_blr, r.lsmgo_total, r.lsmgo_rob, r.lsmgo_bunkered,
           r.ae1_rhr, r.ae2_rhr, r.ae3_rhr, r.cargo_plant_rhr,
           r.co2_tonnes, r.nox, r.sox, r.fw_produced, r.fw_consumed, r.fw_rob,
           r.cyl_oil_cons, r.cyl_oil_rob, r.remarks]);
        cnt++;
      }
      results.push({ period_id:pid, period_key:p.period_key, period_label:p.period_label, vessel_name:p.vessel_name, imported:cnt });
    }
    await client.query('COMMIT');
    res.json({ ok:true, results });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('[LPG confirm]', e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── PERIODS (LIST) ────────────────────────────────────────────────────────────
router.get('/periods', authenticate, lpgAccess, async (req, res) => {
  try {
    const { vessel } = req.query;
    const params = vessel ? [vessel] : [];
    const where  = vessel ? 'WHERE vessel_name=$1' : '';
    const { rows } = await pool.query(
      `SELECT * FROM lpg_periods ${where} ORDER BY period_key DESC`, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PERIOD DETAIL ─────────────────────────────────────────────────────────────
router.get('/periods/:id', authenticate, lpgAccess, async (req, res) => {
  try {
    const p  = await pool.query('SELECT * FROM lpg_periods WHERE id=$1', [req.params.id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Not found' });
    const records = (await pool.query(
      'SELECT * FROM lpg_records WHERE period_id=$1 ORDER BY record_date, time_utc', [req.params.id])).rows;
    const vessel  = (await pool.query('SELECT * FROM lpg_vessels WHERE name=$1', [p.rows[0].vessel_name])).rows[0];
    const cii     = vessel ? calcCII(records, parseFloat(vessel.dwt)) : null;
    res.json({ ...p.rows[0], records, cii });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/periods/:id', authenticate, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM lpg_records WHERE period_id=$1', [req.params.id]);
    await pool.query('DELETE FROM lpg_periods  WHERE id=$1', [req.params.id]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RECORD CRUD ───────────────────────────────────────────────────────────────
router.post('/records', authenticate, lpgAccess, async (req, res) => {
  try {
    const r = req.body;
    // Auto-create period if not exists
    const key   = r.record_date?.slice(0,7);
    const label = key ? periodLabel(key) : '';
    const pq = await pool.query(`
      INSERT INTO lpg_periods (vessel_name, period_key, period_label, start_date, end_date, record_count, created_by)
      VALUES ($1,$2,$3,$4,$4,0,$5) ON CONFLICT (vessel_name, period_key) DO NOTHING RETURNING id`,
      [r.vessel_name, key, label, r.record_date, req.user.id]);
    let pid = pq.rows[0]?.id;
    if (!pid) {
      const ex = await pool.query('SELECT id FROM lpg_periods WHERE vessel_name=$1 AND period_key=$2', [r.vessel_name, key]);
      pid = ex.rows[0]?.id;
    }
    const result = await pool.query(`
      INSERT INTO lpg_records (period_id,vessel_name,record_date,time_utc,mode,status,voyage_ref,
        sea_hrs,manv_hrs,anchor_hrs,berth_hrs,total_hrs,me_revs,me_rpm,engine_dist,obs_dist,
        obs_speed,slip,bhp,kw,ulsfo_me,ulsfo_ae,ulsfo_blr,ulsfo_total,ulsfo_rob,ulsfo_bunkered,
        lsmgo_me,lsmgo_ae,lsmgo_blr,lsmgo_total,lsmgo_rob,lsmgo_bunkered,ae1_rhr,ae2_rhr,ae3_rhr,
        cargo_plant_rhr,co2_tonnes,nox,sox,fw_produced,fw_consumed,fw_rob,cyl_oil_cons,cyl_oil_rob,remarks)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
              $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45)
      RETURNING *`,
      [pid,r.vessel_name,r.record_date,r.time_utc||'1200',r.mode||'Noon',r.status,r.voyage_ref,
       r.sea_hrs||0,r.manv_hrs||0,r.anchor_hrs||0,r.berth_hrs||0,r.total_hrs||24,
       r.me_revs||0,r.me_rpm||0,r.engine_dist||0,r.obs_dist||0,r.obs_speed||0,r.slip||0,r.bhp||0,r.kw||0,
       r.ulsfo_me||0,r.ulsfo_ae||0,r.ulsfo_blr||0,r.ulsfo_total||0,r.ulsfo_rob||0,r.ulsfo_bunkered||0,
       r.lsmgo_me||0,r.lsmgo_ae||0,r.lsmgo_blr||0,r.lsmgo_total||0,r.lsmgo_rob||0,r.lsmgo_bunkered||0,
       r.ae1_rhr||0,r.ae2_rhr||0,r.ae3_rhr||0,r.cargo_plant_rhr||0,
       r.co2_tonnes||0,r.nox||0,r.sox||0,r.fw_produced||0,r.fw_consumed||0,r.fw_rob||0,
       r.cyl_oil_cons||0,r.cyl_oil_rob||0,r.remarks]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/records/:id', authenticate, lpgAccess, async (req, res) => {
  try {
    const r = req.body;
    const result = await pool.query(`
      UPDATE lpg_records SET record_date=$1,time_utc=$2,mode=$3,status=$4,voyage_ref=$5,
        sea_hrs=$6,manv_hrs=$7,anchor_hrs=$8,berth_hrs=$9,total_hrs=$10,
        me_revs=$11,me_rpm=$12,engine_dist=$13,obs_dist=$14,obs_speed=$15,slip=$16,bhp=$17,kw=$18,
        ulsfo_me=$19,ulsfo_ae=$20,ulsfo_blr=$21,ulsfo_total=$22,ulsfo_rob=$23,ulsfo_bunkered=$24,
        lsmgo_me=$25,lsmgo_ae=$26,lsmgo_blr=$27,lsmgo_total=$28,lsmgo_rob=$29,lsmgo_bunkered=$30,
        ae1_rhr=$31,ae2_rhr=$32,ae3_rhr=$33,cargo_plant_rhr=$34,
        co2_tonnes=$35,nox=$36,sox=$37,fw_produced=$38,fw_consumed=$39,fw_rob=$40,
        cyl_oil_cons=$41,cyl_oil_rob=$42,remarks=$43
      WHERE id=$44 RETURNING *`,
      [r.record_date,r.time_utc,r.mode,r.status,r.voyage_ref,
       r.sea_hrs||0,r.manv_hrs||0,r.anchor_hrs||0,r.berth_hrs||0,r.total_hrs||24,
       r.me_revs||0,r.me_rpm||0,r.engine_dist||0,r.obs_dist||0,r.obs_speed||0,r.slip||0,r.bhp||0,r.kw||0,
       r.ulsfo_me||0,r.ulsfo_ae||0,r.ulsfo_blr||0,r.ulsfo_total||0,r.ulsfo_rob||0,r.ulsfo_bunkered||0,
       r.lsmgo_me||0,r.lsmgo_ae||0,r.lsmgo_blr||0,r.lsmgo_total||0,r.lsmgo_rob||0,r.lsmgo_bunkered||0,
       r.ae1_rhr||0,r.ae2_rhr||0,r.ae3_rhr||0,r.cargo_plant_rhr||0,
       r.co2_tonnes||0,r.nox||0,r.sox||0,r.fw_produced||0,r.fw_consumed||0,r.fw_rob||0,
       r.cyl_oil_cons||0,r.cyl_oil_rob||0,r.remarks,req.params.id]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/records/:id', authenticate, adminOnly, async (req, res) => {
  try { await pool.query('DELETE FROM lpg_records WHERE id=$1', [req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MONTHLY SUMMARY (for charts) ─────────────────────────────────────────────
router.get('/monthly', authenticate, lpgAccess, async (req, res) => {
  try {
    const { vessel } = req.query;
    if (!vessel) return res.status(400).json({ error: 'vessel required' });
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(record_date,'YYYY-MM')                       AS period_key,
        TO_CHAR(record_date,'Mon YY')                        AS label,
        SUM(ulsfo_me)::float                                 AS ulsfo_me,
        SUM(ulsfo_ae)::float                                 AS ulsfo_ae,
        SUM(ulsfo_blr)::float                                AS ulsfo_blr,
        SUM(ulsfo_me+ulsfo_ae+ulsfo_blr)::float             AS ulsfo_total,
        SUM(lsmgo_me)::float                                 AS lsmgo_me,
        SUM(lsmgo_ae)::float                                 AS lsmgo_ae,
        SUM(lsmgo_total)::float                              AS lsmgo_total,
        SUM(ulsfo_bunkered)::float                           AS ulsfo_bunkered,
        SUM(lsmgo_bunkered)::float                           AS lsmgo_bunkered,
        MAX(ulsfo_rob)::float                                AS ulsfo_rob,
        MAX(lsmgo_rob)::float                                AS lsmgo_rob,
        SUM(obs_dist)::float                                 AS total_dist,
        SUM(sea_hrs)::float                                  AS sea_hrs,
        SUM(anchor_hrs)::float                               AS anchor_hrs,
        SUM(manv_hrs)::float                                 AS manv_hrs,
        SUM(berth_hrs)::float                                AS berth_hrs,
        SUM(fw_produced)::float                              AS fw_produced,
        SUM(fw_consumed)::float                              AS fw_consumed,
        MAX(fw_rob)::float                                   AS fw_rob,
        SUM(cyl_oil_cons)::float                             AS cyl_oil_cons,
        MAX(cyl_oil_rob)::float                              AS cyl_oil_rob,
        MAX(ae1_rhr)::float                                  AS ae1_rhr,
        MAX(ae2_rhr)::float                                  AS ae2_rhr,
        MAX(ae3_rhr)::float                                  AS ae3_rhr,
        SUM(cargo_plant_rhr)::float                          AS cargo_plant_rhr,
        SUM(co2_tonnes)::float                               AS co2_tonnes,
        COUNT(*)::int                                        AS record_count
      FROM lpg_records
      WHERE vessel_name=$1
      GROUP BY TO_CHAR(record_date,'YYYY-MM'), TO_CHAR(record_date,'Mon YY')
      ORDER BY period_key`, [vessel]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── VESSELS ───────────────────────────────────────────────────────────────────
router.get('/vessels', authenticate, lpgAccess, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM lpg_vessels WHERE active=true ORDER BY name')).rows); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PDF EXPORT ────────────────────────────────────────────────────────────────
function authFromQuery(req, res, next) {
  const token = req.query.token || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error:'No token' });
  try { req.user = require('jsonwebtoken').verify(token, process.env.JWT_SECRET||'fleet-budget-secret-change-me'); next(); }
  catch { return res.status(401).json({ error:'Invalid token' }); }
}

router.get('/periods/:id/pdf', authFromQuery, async (req, res) => {
  try {
    const pq = await pool.query('SELECT * FROM lpg_periods WHERE id=$1', [req.params.id]);
    if (!pq.rows.length) return res.status(404).json({ error:'Not found' });
    const period  = pq.rows[0];
    const records = (await pool.query('SELECT * FROM lpg_records WHERE period_id=$1 ORDER BY record_date,time_utc', [req.params.id])).rows;
    const vessel  = (await pool.query('SELECT * FROM lpg_vessels WHERE name=$1', [period.vessel_name])).rows[0];
    const cii     = vessel ? calcCII(records, parseFloat(vessel.dwt)) : null;

    const PAGE_W=842,PAGE_H=595,M=30,CONTENT=782,BOTTOM=540;
    const f=(v,d=2)=>Number(v||0).toFixed(d);
    const f0=v=>Math.round(Number(v||0)).toLocaleString();
    const doc = new PDFDocument({margin:M,size:'A4',layout:'landscape',autoFirstPage:false});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename=LPG_${period.period_key}_${period.vessel_name.replace(/\s/g,'_')}.pdf`);
    doc.pipe(res);

    const ROWS_PER_PAGE = 32;
    let pageNum = 0;
    const totalPages = Math.ceil(records.length/ROWS_PER_PAGE) + 1 + (cii?1:0);

    function hdr(label) {
      pageNum++;
      doc.addPage();
      doc.fill('#1E293B').rect(0,0,PAGE_W,48).fill();
      doc.fill('#F59E0B').fontSize(8).font('Helvetica-Bold').text('FORCAP',M+4,M-10,{lineBreak:false});
      doc.fill('#E2E8F0').fontSize(10).font('Helvetica-Bold')
         .text(`${period.vessel_name}  ·  ${period.period_label}  ·  LPG Fuel Log`,M+60,M-8,{width:550,align:'center',lineBreak:false});
      doc.fill('#64748B').fontSize(7).font('Helvetica').text(label,M+60,M+5,{width:550,align:'center',lineBreak:false});
      try { const lp=path.join(__dirname,'../assets/nsml_logo.jpg'); if(fs.existsSync(lp)) doc.image(lp,PAGE_W-M-70,M-12,{height:30,fit:[70,30]}); } catch(e){}
      doc.fill('#E2E8F0').rect(M,PAGE_H-M-11,CONTENT,0.5).fill();
      doc.fill('#64748B').fontSize(6).font('Helvetica')
         .text('FORCAP\xAE 2026  \u2014  Confidential',M,PAGE_H-M-6,{lineBreak:false})
         .text(`Page ${pageNum} of ${totalPages}`,M,PAGE_H-M-6,{width:CONTENT,align:'right',lineBreak:false});
      return 55;
    }

    const cols=[
      {h:'Date',w:52,a:'left'},{h:'Time',w:26,a:'center'},{h:'Status',w:104,a:'left'},
      {h:'Sea',w:22,a:'right'},{h:'Anch',w:22,a:'right'},{h:'Mnv',w:22,a:'right'},
      {h:'Dist',w:28,a:'right'},{h:'RPM',w:26,a:'right'},
      {h:'ULSFO ME',w:36,a:'right'},{h:'ULSFO AE',w:36,a:'right'},{h:'ULSFO BLR',w:36,a:'right'},{h:'ULSFO ROB',w:38,a:'right'},
      {h:'LSMGO',w:32,a:'right'},{h:'LSMGO ROB',w:36,a:'right'},
      {h:'Bnkr U',w:30,a:'right'},{h:'CrgPlt',w:28,a:'right'},{h:'FW ROB',w:30,a:'right'},
    ];
    let y = hdr('DAILY RECORDS');
    function tblHdr(y){
      doc.fill('#0F172A').rect(M,y,CONTENT,12).fill();
      let x=M+2; doc.fill('#F59E0B').fontSize(5.5).font('Helvetica-Bold');
      cols.forEach(c=>{doc.text(c.h,x,y+3,{width:c.w,align:c.a,lineBreak:false});x+=c.w+1;});
      return y+13;
    }
    y=tblHdr(y);
    records.forEach((r,ri)=>{
      if(y+10>BOTTOM){y=hdr('DAILY RECORDS (continued)');y=tblHdr(y);}
      doc.fill(ri%2===0?'#0F172A':'#141E2E').rect(M,y,CONTENT,10).fill();
      const vals=[
        r.record_date?.slice(0,10)||'',r.time_utc||'',(r.status||'').slice(0,28),
        f(r.sea_hrs,1),f(r.anchor_hrs,1),f(r.manv_hrs,1),
        f(r.obs_dist,1),f(r.me_rpm,1),
        f(r.ulsfo_me),f(r.ulsfo_ae),f(r.ulsfo_blr),f(r.ulsfo_rob),
        f(r.lsmgo_total),f(r.lsmgo_rob),
        parseFloat(r.ulsfo_bunkered)>0?f(r.ulsfo_bunkered):'',f(r.cargo_plant_rhr,1),f(r.fw_rob,1),
      ];
      let x=M+2;
      vals.forEach((v,vi)=>{
        const c=vi===11||vi===13?'#67E8F9':vi===0?'#FBBF24':'#CBD5E1';
        doc.fill(c).fontSize(5.5).font('Helvetica').text(String(v),x,y+2,{width:cols[vi].w,align:cols[vi].a,lineBreak:false});
        x+=cols[vi].w+1;
      });
      y+=10;
    });
    // Summary totals row
    doc.fill('#1E293B').rect(M,y,CONTENT,12).fill();
    const tv=['',' ','TOTALS',
      f(records.reduce((s,r)=>s+n(r.sea_hrs),0),1),f(records.reduce((s,r)=>s+n(r.anchor_hrs),0),1),f(records.reduce((s,r)=>s+n(r.manv_hrs),0),1),
      f0(records.reduce((s,r)=>s+n(r.obs_dist),0)),'',
      f(records.reduce((s,r)=>s+n(r.ulsfo_me),0)),f(records.reduce((s,r)=>s+n(r.ulsfo_ae),0)),
      f(records.reduce((s,r)=>s+n(r.ulsfo_blr),0)),'',
      f(records.reduce((s,r)=>s+n(r.lsmgo_total),0)),'',
      f(records.reduce((s,r)=>s+n(r.ulsfo_bunkered),0)),'','',
    ];
    let x2=M+2; doc.fill('#F59E0B').fontSize(6).font('Helvetica-Bold');
    tv.forEach((v,vi)=>{doc.text(String(v),x2,y+3,{width:cols[vi].w,align:cols[vi].a,lineBreak:false});x2+=cols[vi].w+1;});

    // ── Summary page ──
    y=hdr('MONTHLY SUMMARY');
    const W2=(CONTENT-10)/2;
    const box=(bx,by,title,rows)=>{
      const bh=14+rows.length*12;
      doc.fill('#1E293B').rect(bx,by,W2,bh).fill();
      doc.fill('#F59E0B').fontSize(7).font('Helvetica-Bold').text(title,bx+5,by+4,{lineBreak:false});
      rows.forEach(([l,v,c],i)=>{
        const ry=by+17+i*12;
        doc.fill('#64748B').fontSize(6).font('Helvetica').text(l,bx+5,ry,{width:W2*.6,lineBreak:false});
        doc.fill(c||'#E2E8F0').fontSize(6).font('Helvetica-Bold').text(v,bx+W2*.6,ry,{width:W2*.36,align:'right',lineBreak:false});
      });
      return bh;
    };
    const last=records.length?records[records.length-1]:{};
    const bh=box(M,y,'ULSFO CONSUMPTION',[
      ['ME',f(records.reduce((s,r)=>s+n(r.ulsfo_me),0))+' MT'],
      ['AE',f(records.reduce((s,r)=>s+n(r.ulsfo_ae),0))+' MT'],
      ['Boiler',f(records.reduce((s,r)=>s+n(r.ulsfo_blr),0))+' MT'],
      ['Total ULSFO',f(records.reduce((s,r)=>s+n(r.ulsfo_me)+n(r.ulsfo_ae)+n(r.ulsfo_blr),0))+' MT','#FBBF24'],
      ['Bunkered',f(records.reduce((s,r)=>s+n(r.ulsfo_bunkered),0))+' MT','#34D399'],
      ['Period End ROB',f(last.ulsfo_rob)+' MT','#67E8F9'],
    ]);
    box(M+W2+10,y,'LSMGO & HOURS',[
      ['LSMGO Total',f(records.reduce((s,r)=>s+n(r.lsmgo_total),0))+' MT'],
      ['LSMGO Bunkered',f(records.reduce((s,r)=>s+n(r.lsmgo_bunkered),0))+' MT','#34D399'],
      ['LSMGO ROB',f(last.lsmgo_rob)+' MT','#67E8F9'],
      ['Sea Hours',f(records.reduce((s,r)=>s+n(r.sea_hrs),0),1)+' hrs'],
      ['Anchor Hours',f(records.reduce((s,r)=>s+n(r.anchor_hrs),0),1)+' hrs'],
      ['Total Distance',f0(records.reduce((s,r)=>s+n(r.obs_dist),0))+' NM','#A78BFA'],
    ]);
    y+=bh+8;
    box(M,y,'RUNNING HOURS',[
      ['AE1 (period end)',f(last.ae1_rhr,1)+' hrs'],
      ['AE2 (period end)',f(last.ae2_rhr,1)+' hrs'],
      ['AE3 (period end)',f(last.ae3_rhr,1)+' hrs'],
      ['Cargo Plant',f(records.reduce((s,r)=>s+n(r.cargo_plant_rhr),0),1)+' hrs'],
    ]);
    box(M+W2+10,y,'FRESH WATER & LUBE OIL',[
      ['FW Produced',f(records.reduce((s,r)=>s+n(r.fw_produced),0))+' T'],
      ['FW Consumed',f(records.reduce((s,r)=>s+n(r.fw_consumed),0))+' T'],
      ['FW ROB',f(last.fw_rob)+' T','#67E8F9'],
      ['Cyl Oil Cons',f(records.reduce((s,r)=>s+n(r.cyl_oil_cons),0),3)+' L'],
      ['Cyl Oil ROB',f(last.cyl_oil_rob,3)+' L'],
    ]);

    // ── CII page ──
    if(cii){
      y=hdr('CII — CARBON INTENSITY INDICATOR');
      const rC={A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626'}[cii.rating]||'#94A3B8';
      const kW=CONTENT/4;
      [{l:'Attained CII',v:f(cii.attained),c:rC},{l:'Rating',v:cii.rating,c:rC},{l:'Required CII',v:f(cii.ciiReq),c:'#94A3B8'},{l:'Total CO\u2082',v:f(cii.totalCO2,1)+' MT',c:'#67E8F9'}].forEach((k,i)=>{
        const kx=M+i*kW;
        doc.fill('#1E293B').rect(kx,y,kW-4,40).fill();
        doc.fill('#64748B').fontSize(6).font('Helvetica').text(k.l,kx+5,y+7,{lineBreak:false});
        doc.fill(k.c).fontSize(16).font('Helvetica-Bold').text(k.v,kx+5,y+16,{lineBreak:false});
      });
      y+=48;
      const bw=CONTENT/5;
      ['A','B','C','D','E'].forEach((l,i)=>{
        const c={A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626'}[l];
        doc.fill(c).rect(M+i*bw,y,bw,16).fill();
        doc.fill('#FFF').fontSize(8).font('Helvetica-Bold').text(l,M+i*bw,y+5,{width:bw,align:'center',lineBreak:false});
      });
    }
    doc.end();
  } catch(err){
    console.error('[LPG PDF]',err);
    if(!res.headersSent) res.status(500).json({error:err.message});
  }
});

module.exports = router;
