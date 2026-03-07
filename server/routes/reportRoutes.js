const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../auth');
const router = express.Router();

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
    const { day_number, report_date, steaming_hours, total_revs, distance_nm, hfo_consumed, foe_consumed, weather_condition, remarks, excess_remarks } = req.body;
    const r = await pool.query(`
      INSERT INTO noon_reports (voyage_id, day_number, report_date, steaming_hours, total_revs, distance_nm, hfo_consumed, foe_consumed, weather_condition, remarks, excess_remarks)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (voyage_id, day_number) DO UPDATE SET
        report_date=$3, steaming_hours=$4, total_revs=$5, distance_nm=$6, hfo_consumed=$7, foe_consumed=$8, weather_condition=$9, remarks=$10, excess_remarks=$11
      RETURNING *`,
      [vid, day_number, report_date, steaming_hours||0, total_revs||0, distance_nm||0, hfo_consumed||0, foe_consumed||0, weather_condition||null, remarks||null, excess_remarks||null]);
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
      const result = await client.query(`
        INSERT INTO noon_reports (voyage_id, day_number, report_date, steaming_hours, total_revs, distance_nm, hfo_consumed, foe_consumed, weather_condition, remarks, excess_remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (voyage_id, day_number) DO UPDATE SET
          report_date=$3, steaming_hours=$4, total_revs=$5, distance_nm=$6, hfo_consumed=$7, foe_consumed=$8, weather_condition=$9, remarks=$10, excess_remarks=$11
        RETURNING *`,
        [vid, r.day_number, r.report_date, r.steaming_hours||0, r.total_revs||0, r.distance_nm||0, r.hfo_consumed||0, r.foe_consumed||0, r.weather_condition||null, r.remarks||null, r.excess_remarks||null]);
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
