const express = require('express');
const { pool } = require('../db');
const { authenticate, canReview } = require('../auth');
const router = express.Router();

router.get('/vessels', authenticate, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM lng_vessels WHERE active=true ORDER BY name')).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/exclusions', authenticate, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM exclusion_items ORDER BY name')).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/curves/:vesselClass/:legType', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT speed, fuel FROM interpolation_curves WHERE vessel_class=$1 AND leg_type=$2 ORDER BY speed', [req.params.vesselClass, req.params.legType]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
