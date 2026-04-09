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
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200) NOT NULL UNIQUE,
        imo         VARCHAR(20),
        dwt         DECIMAL(12,2) DEFAULT 0,
        vessel_type VARCHAR(50)  DEFAULT 'FRPG',
        flag        VARCHAR(50),
        active      BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS lpg_noon_logs (
        id          SERIAL PRIMARY KEY,
        vessel_id   INTEGER REFERENCES lpg_vessels(id) ON DELETE CASCADE,
        record_date DATE NOT NULL,
        record_time VARCHAR(20),
        mode        VARCHAR(80),
        status      TEXT,
        voyage_number VARCHAR(30),
        vessel_position_status TEXT,
        berth_hrs NUMERIC(6,2), anch_drift_hrs NUMERIC(6,2), manv_hrs NUMERIC(6,2),
        sea_stm_hrs NUMERIC(6,2), total_hrs NUMERIC(6,2),
        me_running_hrs NUMERIC(8,2), me_total_running_hrs NUMERIC(10,2),
        me_counter NUMERIC(12,1), me_revs NUMERIC(10,1), me_rpm NUMERIC(6,2),
        engine_dist NUMERIC(8,2), engine_mnvrg_dist NUMERIC(8,2),
        obs_speed NUMERIC(6,2), obs_dist NUMERIC(8,2), dist_to_go NUMERIC(8,2),
        speed NUMERIC(6,2), speed_manually_adjusted NUMERIC(6,2), slip NUMERIC(6,2),
        me_g_kw_hr NUMERIC(8,4), me_kw NUMERIC(8,2), me_bhp NUMERIC(8,2),
        me_torque NUMERIC(10,2), me_calc_con_day NUMERIC(8,4),
        fo_density_15c NUMERIC(6,4),
        ulsfo_me_flmr NUMERIC(12,1), ulsfo_me_temp NUMERIC(6,1),
        ulsfo_me_cons_accum NUMERIC(12,1), ulsfo_cons_me NUMERIC(8,4),
        ulsfo_ae_in NUMERIC(12,1), ulsfo_ae_out NUMERIC(12,1), ulsfo_ae_temp NUMERIC(6,1),
        ulsfo_ae_flow NUMERIC(10,2), ulsfo_cons_ae_flow NUMERIC(8,4),
        ulsfo_blr_flmr NUMERIC(12,1), ulsfo_blr_temp NUMERIC(6,1),
        ulsfo_blr_flow NUMERIC(10,2), ulsfo_cons_blr NUMERIC(8,4),
        ae1_rhr NUMERIC(8,2), ae2_rhr NUMERIC(8,2), ae3_rhr NUMERIC(8,2),
        ae_total_dg_rhr NUMERIC(8,2), ae_avg_kw NUMERIC(8,2), ae_cons_load_calc NUMERIC(8,4),
        cargo_plant_rhr NUMERIC(8,2), cargo_comp_extra_load_kw_rhr NUMERIC(8,2), cargo_comp_extra_kw NUMERIC(8,2),
        vlsfo_cons_me NUMERIC(8,4), vlsfo_cons_ae NUMERIC(8,4), vlsfo_cons_blr NUMERIC(8,4),
        vlsfo_cons_total NUMERIC(8,4), vlsfo_rob NUMERIC(10,3),
        vlsfo_cons_me_b NUMERIC(8,4), vlsfo_cargo_plant_ae_cons NUMERIC(8,4),
        vlsfo_total_dg_cons NUMERIC(8,4), vlsfo_cons_blr_b NUMERIC(8,4), vlsfo_total_cons NUMERIC(8,4),
        co2_emitted_mt NUMERIC(8,4), nox_emitted NUMERIC(8,4),
        sox_emitted NUMERIC(8,4), combustible NUMERIC(8,4),
        vlsfo_bunkered_qty NUMERIC(8,3), vlsfo_rob_bunker NUMERIC(10,3),
        lsmgo_cons_me NUMERIC(8,4), lsmgo_cons_ae_ig_incn NUMERIC(8,4),
        lsmgo_cons_total NUMERIC(8,4), lsmgo_bunkered_qty NUMERIC(8,3),
        lsmgo_co2_emitted NUMERIC(8,4), lsmgo_rob NUMERIC(10,3),
        cyl_oil_flmr NUMERIC(10,1), cyl_oil_cons NUMERIC(8,4),
        cyl_alexia70_rob NUMERIC(8,1), cyl_alexia40 NUMERIC(8,1),
        cyl_cons_mecc NUMERIC(8,4), cyl_melina30_rob NUMERIC(8,1), cyl_argina_s240_bunkered NUMERIC(8,1),
        aecc_ae1 NUMERIC(8,4), aecc_ae2 NUMERIC(8,4), aecc_ae3 NUMERIC(8,4), aecc_rob NUMERIC(8,1),
        rp1_rhr NUMERIC(8,2), rp2_rhr NUMERIC(8,2), rp3_rhr NUMERIC(8,2), rp_total_hrs NUMERIC(8,2),
        fw_fwg_counter NUMERIC(12,1), fw_distilled_prod NUMERIC(8,2), fw_distilled_cons NUMERIC(8,2),
        fw_dom_prod NUMERIC(8,2), fw_dom_cons NUMERIC(8,2), fw_total_rob NUMERIC(8,2),
        fw_port_tk NUMERIC(8,2), fw_stbd_tk NUMERIC(8,2),
        fw_distilled_rob NUMERIC(8,2), fw_shore_water NUMERIC(8,2),
        imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(vessel_id, record_date, record_time, status)
      );
      CREATE INDEX IF NOT EXISTS idx_lpg_noon_vessel_date ON lpg_noon_logs(vessel_id, record_date);
      CREATE INDEX IF NOT EXISTS idx_lpg_noon_voyage      ON lpg_noon_logs(vessel_id, voyage_number);
    `);
    // Seed Alfred Temile
    await client.query(`
      INSERT INTO lpg_vessels (name, imo, dwt, vessel_type)
      VALUES ('Alfred Temile', '9859882', 5400, 'FRPG')
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('[LPG] Schema ready');
  } catch(e) { console.error('[LPG] Schema error:', e.message); }
  finally { client.release(); }
}
initLpgSchema();

// ── Helpers ───────────────────────────────────────────────────────────────────
const n = v => (v === '' || v == null || (typeof v === 'string' && !v.trim())) ? null : (isNaN(Number(v)) ? null : Number(v));
const s = v => (v === '' || v == null) ? null : String(v).trim();

// Excel column → DB field (original sheet column indices, 0-based)
const COL_MAP = {
  0:'record_date', 1:'record_time', 2:'mode', 3:'status', 4:'voyage_number',
  5:'berth_hrs', 6:'anch_drift_hrs', 7:'manv_hrs', 8:'sea_stm_hrs', 9:'total_hrs',
  10:'me_running_hrs', 11:'me_total_running_hrs', 12:'me_counter', 13:'me_revs', 14:'me_rpm',
  15:'engine_dist', 16:'engine_mnvrg_dist', 17:'obs_speed', 18:'obs_dist', 19:'dist_to_go',
  20:'speed', 21:'speed_manually_adjusted', 22:'slip',
  23:'me_g_kw_hr', 24:'me_kw', 25:'me_bhp', 26:'me_torque', 27:'me_calc_con_day',
  28:'fo_density_15c',
  29:'ulsfo_me_flmr', 30:'ulsfo_me_temp', 32:'ulsfo_me_cons_accum', 33:'ulsfo_cons_me',
  34:'ulsfo_ae_in', 35:'ulsfo_ae_out', 36:'ulsfo_ae_temp', 38:'ulsfo_ae_flow', 39:'ulsfo_cons_ae_flow',
  40:'ulsfo_blr_flmr', 41:'ulsfo_blr_temp', 42:'ulsfo_blr_flow', 43:'ulsfo_cons_blr',
  44:'ae1_rhr', 45:'ae2_rhr', 46:'ae3_rhr', 47:'ae_total_dg_rhr', 48:'ae_avg_kw', 49:'ae_cons_load_calc',
  50:'cargo_plant_rhr', 51:'cargo_comp_extra_load_kw_rhr', 52:'cargo_comp_extra_kw',
  53:'vlsfo_cons_me', 54:'vlsfo_cons_ae', 55:'vlsfo_cons_blr', 56:'vlsfo_cons_total', 57:'vlsfo_rob',
  58:'vlsfo_cons_me_b', 59:'vlsfo_cargo_plant_ae_cons', 60:'vlsfo_total_dg_cons',
  61:'vlsfo_cons_blr_b', 62:'vlsfo_total_cons',
  63:'co2_emitted_mt', 64:'nox_emitted', 65:'sox_emitted', 66:'combustible',
  67:'vlsfo_bunkered_qty', 68:'vlsfo_rob_bunker',
  69:'lsmgo_cons_me', 70:'lsmgo_cons_ae_ig_incn', 71:'lsmgo_cons_total',
  72:'lsmgo_bunkered_qty', 73:'lsmgo_co2_emitted', 74:'lsmgo_rob',
  75:'cyl_oil_flmr', 76:'cyl_oil_cons', 77:'cyl_alexia70_rob', 78:'cyl_alexia40',
  79:'cyl_cons_mecc', 80:'cyl_melina30_rob', 81:'cyl_argina_s240_bunkered',
  82:'aecc_ae1', 83:'aecc_ae2', 84:'aecc_ae3', 85:'aecc_rob',
  86:'rp1_rhr', 87:'rp2_rhr', 88:'rp3_rhr', 89:'rp_total_hrs',
  90:'fw_fwg_counter', 91:'fw_distilled_prod', 92:'fw_distilled_cons',
  93:'fw_dom_prod', 94:'fw_dom_cons', 95:'fw_total_rob',
  96:'fw_port_tk', 97:'fw_stbd_tk',
  167:'fw_distilled_rob', 168:'fw_shore_water', 169:'vessel_position_status',
};
const STR_FIELDS  = new Set(['record_date','record_time','mode','status','voyage_number','vessel_position_status']);
const ALL_FIELDS  = ['vessel_id','record_date','record_time','mode','status','voyage_number',
  'vessel_position_status','berth_hrs','anch_drift_hrs','manv_hrs','sea_stm_hrs','total_hrs',
  'me_running_hrs','me_total_running_hrs','me_counter','me_revs','me_rpm','engine_dist','engine_mnvrg_dist',
  'obs_speed','obs_dist','dist_to_go','speed','speed_manually_adjusted','slip',
  'me_g_kw_hr','me_kw','me_bhp','me_torque','me_calc_con_day','fo_density_15c',
  'ulsfo_me_flmr','ulsfo_me_temp','ulsfo_me_cons_accum','ulsfo_cons_me',
  'ulsfo_ae_in','ulsfo_ae_out','ulsfo_ae_temp','ulsfo_ae_flow','ulsfo_cons_ae_flow',
  'ulsfo_blr_flmr','ulsfo_blr_temp','ulsfo_blr_flow','ulsfo_cons_blr',
  'ae1_rhr','ae2_rhr','ae3_rhr','ae_total_dg_rhr','ae_avg_kw','ae_cons_load_calc',
  'cargo_plant_rhr','cargo_comp_extra_load_kw_rhr','cargo_comp_extra_kw',
  'vlsfo_cons_me','vlsfo_cons_ae','vlsfo_cons_blr','vlsfo_cons_total','vlsfo_rob',
  'vlsfo_cons_me_b','vlsfo_cargo_plant_ae_cons','vlsfo_total_dg_cons','vlsfo_cons_blr_b','vlsfo_total_cons',
  'co2_emitted_mt','nox_emitted','sox_emitted','combustible',
  'vlsfo_bunkered_qty','vlsfo_rob_bunker',
  'lsmgo_cons_me','lsmgo_cons_ae_ig_incn','lsmgo_cons_total','lsmgo_bunkered_qty','lsmgo_co2_emitted','lsmgo_rob',
  'cyl_oil_flmr','cyl_oil_cons','cyl_alexia70_rob','cyl_alexia40','cyl_cons_mecc','cyl_melina30_rob','cyl_argina_s240_bunkered',
  'aecc_ae1','aecc_ae2','aecc_ae3','aecc_rob',
  'rp1_rhr','rp2_rhr','rp3_rhr','rp_total_hrs',
  'fw_fwg_counter','fw_distilled_prod','fw_distilled_cons','fw_dom_prod','fw_dom_cons',
  'fw_total_rob','fw_port_tk','fw_stbd_tk','fw_distilled_rob','fw_shore_water'];

function xlDateToISO(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  if (typeof v === 'number' && v > 30000) return new Date((v-25569)*86400000).toISOString().slice(0,10);
  const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0,10);
}

function parseRow(rawRow) {
  const rec = {};
  for (const [ci, field] of Object.entries(COL_MAP)) {
    const val = rawRow[parseInt(ci)];
    if (field === 'record_date') rec[field] = xlDateToISO(val);
    else if (STR_FIELDS.has(field)) rec[field] = s(val);
    else rec[field] = n(val);
  }
  return rec;
}

// LPG access
function lpgAccess(req, res, next) {
  const role = req.user?.role;
  const vns  = req.user?.vessel_names || [];
  if (['admin','manager'].includes(role) || vns.some(v => v.toLowerCase().includes('alfred temile'))) return next();
  return res.status(403).json({ error: 'LPG access not assigned' });
}

// ── Vessels ───────────────────────────────────────────────────────────────────
router.get('/vessels', authenticate, lpgAccess, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM lpg_vessels WHERE active=true ORDER BY name');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Voyage list (derived from noon logs) ─────────────────────────────────────
router.get('/voyages', authenticate, lpgAccess, async (req, res) => {
  try {
    const { vessel_id } = req.query;
    const params = []; const clauses = [];
    if (vessel_id) { params.push(vessel_id); clauses.push(`l.vessel_id=$${params.length}`); }
    const where = clauses.length ? 'WHERE '+clauses.join(' AND ') : '';
    const { rows } = await pool.query(`
      SELECT
        l.vessel_id, v.name AS vessel_name, l.voyage_number,
        MIN(l.record_date) AS start_date, MAX(l.record_date) AS end_date,
        COUNT(*)::int AS record_count,
        ROUND(SUM(COALESCE(l.sea_stm_hrs,0))::numeric,1)      AS total_sea_hrs,
        ROUND(SUM(COALESCE(l.vlsfo_total_cons,0))::numeric,2)  AS total_vlsfo_cons,
        ROUND(SUM(COALESCE(l.lsmgo_cons_total,0))::numeric,2)  AS total_lsmgo_cons,
        ROUND(SUM(COALESCE(l.co2_emitted_mt,0))::numeric,2)    AS total_co2,
        ROUND(SUM(COALESCE(l.obs_dist,0))::numeric,1)          AS total_dist_nm,
        MAX(l.vlsfo_rob)::float                                  AS latest_vlsfo_rob,
        MAX(l.lsmgo_rob)::float                                  AS latest_lsmgo_rob
      FROM lpg_noon_logs l
      JOIN lpg_vessels v ON v.id = l.vessel_id
      ${where}
      GROUP BY l.vessel_id, v.name, l.voyage_number
      ORDER BY MIN(l.record_date) DESC
    `, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Voyage detail (all daily records for a voyage) ────────────────────────────
router.get('/voyages/:voyage_number', authenticate, lpgAccess, async (req, res) => {
  try {
    const { vessel_id } = req.query;
    const params = [req.params.voyage_number]; const clauses = ['voyage_number=$1'];
    if (vessel_id) { params.push(vessel_id); clauses.push(`vessel_id=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT * FROM lpg_noon_logs WHERE ${clauses.join(' AND ')} ORDER BY record_date ASC, record_time ASC`,
      params
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Date-range log query ───────────────────────────────────────────────────────
router.get('/logs', authenticate, lpgAccess, async (req, res) => {
  try {
    const { vessel_id, from, to, voyage_number } = req.query;
    const params = []; const clauses = [];
    if (vessel_id)     { params.push(vessel_id);      clauses.push(`vessel_id=$${params.length}`); }
    if (from)          { params.push(from);            clauses.push(`record_date>=$${params.length}`); }
    if (to)            { params.push(to);              clauses.push(`record_date<=$${params.length}`); }
    if (voyage_number) { params.push(voyage_number);   clauses.push(`voyage_number=$${params.length}`); }
    const where = clauses.length ? 'WHERE '+clauses.join(' AND ') : '';
    const { rows } = await pool.query(
      `SELECT * FROM lpg_noon_logs ${where} ORDER BY record_date ASC, record_time ASC LIMIT 5000`,
      params
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Monthly dashboard aggregates ──────────────────────────────────────────────
router.get('/dashboard', authenticate, lpgAccess, async (req, res) => {
  try {
    const { vessel_id, year } = req.query;
    const params = []; const clauses = [];
    if (vessel_id) { params.push(vessel_id); clauses.push(`vessel_id=$${params.length}`); }
    if (year)      { params.push(year);      clauses.push(`EXTRACT(YEAR FROM record_date)=$${params.length}`); }
    const where = clauses.length ? 'WHERE '+clauses.join(' AND ') : '';
    const { rows } = await pool.query(`
      SELECT
        EXTRACT(YEAR FROM record_date)::int  AS year,
        EXTRACT(MONTH FROM record_date)::int AS month,
        TO_CHAR(record_date,'Mon YYYY')      AS label,
        COUNT(*)::int                        AS records,
        ROUND(SUM(sea_stm_hrs)::numeric,1)            AS sea_hrs,
        ROUND(SUM(obs_dist)::numeric,1)               AS distance_nm,
        ROUND(SUM(vlsfo_total_cons)::numeric,2)       AS vlsfo_cons,
        ROUND(SUM(lsmgo_cons_total)::numeric,2)       AS lsmgo_cons,
        ROUND(SUM(co2_emitted_mt)::numeric,2)         AS co2_mt,
        ROUND(AVG(NULLIF(speed,0))::numeric,2)        AS avg_speed,
        ROUND(AVG(NULLIF(me_rpm,0))::numeric,1)       AS avg_rpm,
        ROUND(SUM(vlsfo_bunkered_qty)::numeric,2)     AS vlsfo_bunkered,
        ROUND(SUM(lsmgo_bunkered_qty)::numeric,2)     AS lsmgo_bunkered,
        MAX(vlsfo_rob)::float                          AS vlsfo_rob_eom,
        MAX(lsmgo_rob)::float                          AS lsmgo_rob_eom,
        ROUND(SUM(rp_total_hrs)::numeric,1)           AS cargo_plant_hrs,
        ROUND(SUM(fw_distilled_prod)::numeric,1)      AS fw_produced
      FROM lpg_noon_logs ${where}
      GROUP BY year, month, TO_CHAR(record_date,'Mon YYYY')
      ORDER BY year DESC, month DESC
    `, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Import preview ────────────────────────────────────────────────────────────
router.post('/import/preview', authenticate, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb   = XLSX.read(req.file.buffer, { type:'buffer', cellDates:false });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
    const dataRows = rows.slice(3).filter(r => r && r[0] != null && r[0] !== '');
    const parsed = dataRows.map(parseRow).filter(r => r.record_date);
    if (!parsed.length) return res.status(400).json({ error: 'No valid rows found (expected Date in col A from row 4)' });
    const vessels = (await pool.query('SELECT id, name FROM lpg_vessels WHERE active=true ORDER BY name')).rows;
    const voyages = [...new Set(parsed.map(r => r.voyage_number).filter(Boolean))].sort();
    res.json({
      total: parsed.length,
      vessels,
      date_from: parsed[0].record_date,
      date_to: parsed[parsed.length-1].record_date,
      voyages,
      sample: parsed.slice(0,3),
    });
  } catch(e) { console.error('[LPG preview]',e); res.status(500).json({ error: e.message }); }
});

// ── Import confirm (bulk upsert) ──────────────────────────────────────────────
router.post('/import/confirm', authenticate, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const vessel_id = parseInt(req.body.vessel_id);
    if (!vessel_id) return res.status(400).json({ error: 'vessel_id required' });

    const wb   = XLSX.read(req.file.buffer, { type:'buffer', cellDates:false });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
    const parsed = rows.slice(3)
      .filter(r => r && r[0] != null && r[0] !== '')
      .map(parseRow)
      .filter(r => r.record_date);

    const updateFields = ALL_FIELDS.filter(f => !['vessel_id','record_date','record_time','status'].includes(f));
    const placeholders = ALL_FIELDS.map((_,i) => `$${i+1}`).join(',');
    const sql = `
      INSERT INTO lpg_noon_logs (${ALL_FIELDS.join(',')})
      VALUES (${placeholders})
      ON CONFLICT (vessel_id, record_date, record_time, status) DO UPDATE SET
        ${updateFields.map(f => `${f}=EXCLUDED.${f}`).join(',\n        ')}
    `;

    let inserted=0, updated=0, errors=0, firstError=null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO fuel, public');
      for (const rec of parsed) {
        const vals = ALL_FIELDS.map(f => f === 'vessel_id' ? vessel_id : (rec[f] ?? null));
        try {
          const r = await client.query(sql, vals);
          r.rowCount > 0 ? inserted++ : updated++;
        } catch(e) { errors++; if(!firstError) firstError = {row: parsed.indexOf(rec), msg: e.message, vals_sample: vals.slice(0,5)}; }
      }
      await client.query('COMMIT');
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ success:true, total:parsed.length, inserted, updated, errors, firstError });
  } catch(e) { console.error('[LPG confirm]',e); res.status(500).json({ error: e.message }); }
});

// ── Delete single record ──────────────────────────────────────────────────────
router.delete('/logs/:id', authenticate, adminOnly, async (req, res) => {
  try { await pool.query('DELETE FROM lpg_noon_logs WHERE id=$1', [req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Delete all records for a voyage ──────────────────────────────────────────
router.delete('/voyages/:voyage_number', authenticate, adminOnly, async (req, res) => {
  try {
    const { vessel_id } = req.query;
    const params = [req.params.voyage_number]; const clauses = ['voyage_number=$1'];
    if (vessel_id) { params.push(vessel_id); clauses.push(`vessel_id=$${params.length}`); }
    const r = await pool.query(`DELETE FROM lpg_noon_logs WHERE ${clauses.join(' AND ')}`, params);
    res.json({ ok:true, deleted: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
