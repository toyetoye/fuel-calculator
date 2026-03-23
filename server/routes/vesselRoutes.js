const express = require('express');
const { pool } = require('../db');
const { authenticate, adminOnly } = require('../auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM lng_vessels WHERE active=true ORDER BY name')).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, capacity_m3, dwt, foe_factor, pitch, vessel_class, laden_boiloff_pct, ballast_boiloff_pct, cf_hfo, cf_foe } = req.body;
    const r = await pool.query(
      'INSERT INTO lng_vessels (name, capacity_m3, dwt, foe_factor, pitch, vessel_class, laden_boiloff_pct, ballast_boiloff_pct, cf_hfo, cf_foe) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [name, capacity_m3, dwt || 0, foe_factor || 0.484, pitch || null, vessel_class || 'Rivers', laden_boiloff_pct || 0.15, ballast_boiloff_pct || 0.10, cf_hfo || 3.114, cf_foe || 2.750]);
    res.status(201).json(r.rows[0]);
  } catch (err) { if (err.code === '23505') return res.status(400).json({ error: 'Vessel already exists' }); res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, capacity_m3, dwt, foe_factor, pitch, vessel_class, laden_boiloff_pct, ballast_boiloff_pct, cf_hfo, cf_foe } = req.body;
    const r = await pool.query(
      'UPDATE lng_vessels SET name=$1, capacity_m3=$2, dwt=$3, foe_factor=$4, pitch=$5, vessel_class=$6, laden_boiloff_pct=$7, ballast_boiloff_pct=$8, cf_hfo=$9, cf_foe=$10 WHERE id=$11 RETURNING *',
      [name, capacity_m3, dwt || 0, foe_factor, pitch, vessel_class, laden_boiloff_pct, ballast_boiloff_pct, cf_hfo || 3.114, cf_foe || 2.750, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try { await pool.query('UPDATE lng_vessels SET active=false WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
