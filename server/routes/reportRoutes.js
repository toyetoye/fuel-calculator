const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../auth');
const router = express.Router();

// Helper: if NBO and/or FBO are provided, compute FOE as their sum.
// If only legacy foe_consumed is provided, keep it as-is and leave NBO/FBO null.
// This preserves backward-compatibility for historical imports where the split isn't known.
function resolveBoilOff(body) {
  const nbo = body.nbo_consumed;
  const fbo = body.fbo_consumed;
  const foe = body.foe_consumed;
  const hasNbo = nbo !== undefined && nbo !== null && nbo !== '';
  const hasFbo = fbo !== undefined && fbo !== null && fbo !== '';
  if (hasNbo || hasFbo) {
    const nboVal = hasNbo ? parseFloat(nbo) || 0 : 0;
    const fboVal = hasFbo ? parseFloat(fbo) || 0 : 0;
    return { nbo: nboVal, fbo: fboVal, foe: nboVal + fboVal };
  }
  return {
    nbo: null,
    fbo: null,
    foe: foe !== undefined && foe !== null && foe !== '' ? parseFloat(foe) || 0 : 0,
  };
}

// Get reports for a voyage
router.get('/:voyageId', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM noon_reports WHERE voyage_id=$1 ORDER BY day_number', [req.params.voyageId]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add/update a noon report
router.post('/:voyageId', authenticate, async (req, res) => {
  try {
    const vid = req.params.voyageId;
    const { day_number, report_date, steaming_hours, total_revs, distance_nm, hfo_consumed, weather_condition, remarks, excess_remarks } = req.body;
    const { nbo, fbo, foe } = resolveBoilOff(req.body);
    const r = await pool.query(`
      INSERT INTO noon_reports (voyage_id, day_number, report_date, steaming_hours, total_revs, distance_nm, hfo_consumed, foe_consumed, nbo_consumed, fbo_consumed, weather_condition, remarks, excess_remarks)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (voyage_id, day_number) DO UPDATE SET
        report_date=$3, steaming_hours=$4, total_revs=$5, distance_nm=$6, hfo_consumed=$7, foe_consumed=$8, nbo_consumed=$9, fbo_consumed=$10, weather_condition=$11, remarks=$12, excess_remarks=$13
      RETURNING *`,
      [vid, day_number, report_date, steaming_hours||0, total_revs||0, distance_nm||0, hfo_consumed||0, foe, nbo, fbo, weather_condition||null, remarks||null, excess_remarks||null]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk upsert noon reports
router.post('/:voyageId/bulk', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const vid = req.params.voyageId;
    const { reports } = req.body;
    await client.query('BEGIN');
    const results = [];
    for (const r of reports) {
      const { nbo, fbo, foe } = resolveBoilOff(r);
      const result = await client.query(`
        INSERT INTO noon_reports (voyage_id, day_number, report_date, steaming_hours, total_revs, distance_nm, hfo_consumed, foe_consumed, nbo_consumed, fbo_consumed, weather_condition, remarks, excess_remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (voyage_id, day_number) DO UPDATE SET
          report_date=$3, steaming_hours=$4, total_revs=$5, distance_nm=$6, hfo_consumed=$7, foe_consumed=$8, nbo_consumed=$9, fbo_consumed=$10, weather_condition=$11, remarks=$12, excess_remarks=$13
        RETURNING *`,
        [vid, r.day_number, r.report_date, r.steaming_hours||0, r.total_revs||0, r.distance_nm||0, r.hfo_consumed||0, foe, nbo, fbo, r.weather_condition||null, r.remarks||null, r.excess_remarks||null]);
      results.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.json(results);
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// Delete a noon report
router.delete('/:voyageId/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM noon_reports WHERE id=$1 AND voyage_id=$2', [req.params.id, req.params.voyageId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
