const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const { pool } = require('../db');
const { authenticate, adminOnly } = require('../auth');
const router  = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Excel parser ──────────────────────────────────────────────────────────────
// Reads metadata from the left-column label/value pairs and daily noon reports
// from the numbered rows (col E = S/N integer)

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Build a label → value map from left columns (A=label, B=value, C=tz)
  const meta = {};
  for (const row of rows) {
    const label = row[0];
    const val   = row[1];
    const tz    = row[2];
    if (typeof label === 'string' && label.trim()) {
      meta[label.trim()] = { val, tz };
    }
  }

  // Extract voyage header fields
  const vessel      = meta['VESSEL']?.val || null;
  const voyageNo    = rows[1]?.[1] || null;       // row 2 col B
  const legType     = rows[1]?.[2] || 'BALLAST';  // row 2 col C
  const dischargePort = meta['DISCHARGE PORT']?.val || null;

  function toISO(v) {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'number') {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(v);
      return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0).toISOString();
    }
    return null;
  }

  const faop_time         = toISO(meta['FAOP (Discharge Port)']?.val);
  const faop_timezone     = meta['FAOP (Discharge Port)']?.tz || 'UTC';
  const eosp_time         = toISO(meta['EOSP (Loading Port)']?.val);
  const eosp_timezone     = meta['EOSP (Loading Port)']?.tz || 'UTC';
  const gauging_after_time= toISO(meta['Time For Gauging After Discharge']?.val);
  const gauging_after_tz  = meta['Time For Gauging After Discharge']?.tz || 'UTC';
  const gauging_before_time = toISO(meta['Time For Gauging Before Loading']?.val);
  const gauging_before_tz = meta['Time For Gauging Before Loading']?.tz || 'UTC';
  const gauging_after_m3  = parseFloat(meta['Guaging After Discharge (M3)']?.val) || 0;
  const gauging_before_m3 = parseFloat(meta['Guaging Before Loading (M3)']?.val) || 0;

  // Parse daily noon reports — rows where col E (index 4) is a positive integer
  const reports = [];
  for (const row of rows) {
    const sn = row[4];
    if (typeof sn !== 'number' || !Number.isInteger(sn) || sn < 1) continue;
    const dateVal = row[5];
    if (!dateVal) continue;

    reports.push({
      day_number      : sn,
      report_date     : toISO(dateVal)?.substring(0, 10) || null,
      steaming_hours  : parseFloat(row[6])  || 0,
      total_revs      : parseInt(row[7])    || 0,
      distance_nm     : parseFloat(row[8])  || 0,
      hfo_consumed    : parseFloat(row[9])  || 0,
      foe_consumed    : parseFloat(row[10]) || 0,
      weather_condition: row[23] || null,   // bad weather remarks
      remarks         : row[24] || null,    // excess consumption remarks
      excess_remarks  : row[16] === 'YES' || row[16] === 1 ? 'EXCLUDED' : null,
    });
  }

  return {
    vessel_name       : typeof vessel === 'string' ? vessel.trim() : null,
    voyage_number     : typeof voyageNo === 'string' ? voyageNo.trim() : null,
    leg_type          : typeof legType === 'string' ? legType.trim().toUpperCase() : 'BALLAST',
    discharge_port    : typeof dischargePort === 'string' ? dischargePort.trim() : null,
    faop_time, faop_timezone,
    eosp_time, eosp_timezone,
    gauging_after_time, gauging_after_tz,
    gauging_before_time, gauging_before_tz,
    gauging_after_m3, gauging_before_m3,
    reports,
    report_count: reports.length,
  };
}

// ── POST /api/import/preview ──────────────────────────────────────────────────
// Parses the uploaded Excel and returns the extracted voyages for review.
// Does NOT save anything.
router.post('/preview', authenticate, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

    // Skip utility sheets
    const SKIP = ['Interpolation Table', 'Form'];
    const voyages = [];

    for (const sheetName of wb.SheetNames) {
      if (SKIP.includes(sheetName)) continue;
      const ws = wb.Sheets[sheetName];
      const parsed = parseSheet(ws);
      if (parsed.vessel_name && parsed.voyage_number) {
        voyages.push({ ...parsed, sheet_name: sheetName });
      }
    }

    if (!voyages.length) {
      return res.status(400).json({ error: 'No valid voyage sheets found in this file.' });
    }

    res.json({ ok: true, voyages });
  } catch (e) {
    console.error('[Import] Preview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/import/confirm ──────────────────────────────────────────────────
// Saves one or more parsed voyages + their noon reports to the database.
// Expects { voyages: [...] } in the body (the parsed preview data).
router.post('/confirm', authenticate, adminOnly, async (req, res) => {
  const { voyages } = req.body;
  if (!Array.isArray(voyages) || !voyages.length) {
    return res.status(400).json({ error: 'No voyages to import' });
  }

  const client = await pool.connect();
  const results = [];

  try {
    await client.query('BEGIN');

    for (const v of voyages) {
      // Insert voyage
      const vr = await client.query(`
        INSERT INTO voyages (
          vessel_name, voyage_number, leg_type, discharge_port,
          faop_time, faop_timezone, eosp_time, eosp_timezone,
          gauging_after_time, gauging_after_tz,
          gauging_before_time, gauging_before_tz,
          gauging_after_m3, gauging_before_m3,
          hfo_price, status, created_by, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,'draft',$15,'Imported from Excel')
        RETURNING id, voyage_number, vessel_name
      `, [
        v.vessel_name, v.voyage_number, v.leg_type, v.discharge_port,
        v.faop_time || null, v.faop_timezone,
        v.eosp_time || null, v.eosp_timezone,
        v.gauging_after_time || null, v.gauging_after_tz,
        v.gauging_before_time || null, v.gauging_before_tz,
        v.gauging_after_m3 || 0, v.gauging_before_m3 || 0,
        req.user.id
      ]);

      const voyageId = vr.rows[0].id;

      // Insert noon reports
      let reportCount = 0;
      for (const r of (v.reports || [])) {
        if (!r.report_date) continue;
        await client.query(`
          INSERT INTO noon_reports (
            voyage_id, day_number, report_date,
            steaming_hours, total_revs, distance_nm,
            hfo_consumed, foe_consumed,
            weather_condition, remarks, excess_remarks
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (voyage_id, day_number) DO NOTHING
        `, [
          voyageId, r.day_number, r.report_date,
          r.steaming_hours || 0, r.total_revs || 0, r.distance_nm || 0,
          r.hfo_consumed || 0, r.foe_consumed || 0,
          r.weather_condition, r.remarks, r.excess_remarks
        ]);
        reportCount++;
      }

      results.push({
        voyage_id: voyageId,
        voyage_number: vr.rows[0].voyage_number,
        vessel_name: vr.rows[0].vessel_name,
        reports_imported: reportCount,
      });
    }

    await client.query('COMMIT');
    res.json({ ok: true, imported: results });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[Import] Confirm error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
