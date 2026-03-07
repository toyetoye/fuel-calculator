const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authenticate, adminOnly, SECRET } = require('../auth');
const router = express.Router();

function generateToken(user, vesselNames) {
  return jwt.sign({
    id: user.id, username: user.username, role: user.role,
    vessel_id: user.vessel_id, display_name: user.display_name,
    vessel_names: vesselNames || []
  }, SECRET, { expiresIn: '24h' });
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE username = $1 AND active = true', [username]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = r.rows[0];
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });

    // Get assigned vessel names
    const vr = await pool.query(
      `SELECT lv.name FROM fuel_user_vessels fuv
       JOIN lng_vessels lv ON lv.id = fuv.lng_vessel_id
       WHERE fuv.user_id = $1 AND lv.active = true ORDER BY lv.name`, [user.id]);
    const vesselNames = vr.rows.map(v => v.name);

    const token = generateToken(user, vesselNames);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, vessel_id: user.vessel_id, display_name: user.display_name, vessel_names: vesselNames } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authenticate, async (req, res) => {
  const vr = await pool.query(
    `SELECT lv.name FROM fuel_user_vessels fuv JOIN lng_vessels lv ON lv.id = fuv.lng_vessel_id WHERE fuv.user_id = $1 AND lv.active = true`, [req.user.id]);
  res.json({ ...req.user, vessel_names: vr.rows.map(v => v.name) });
});

// ── User CRUD (admin only) ──

router.get('/users', authenticate, adminOnly, async (req, res) => {
  try {
    const users = (await pool.query('SELECT id, username, role, vessel_id, display_name, active, created_at FROM users ORDER BY role, display_name')).rows;
    // Get vessel assignments for each user
    for (const u of users) {
      const vr = await pool.query(
        `SELECT fuv.lng_vessel_id, lv.name FROM fuel_user_vessels fuv
         JOIN lng_vessels lv ON lv.id = fuv.lng_vessel_id
         WHERE fuv.user_id = $1 AND lv.active = true ORDER BY lv.name`, [u.id]);
      u.assigned_vessels = vr.rows;
    }
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', authenticate, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, role, display_name, vessel_ids } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const hash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');
    const r = await client.query(
      'INSERT INTO users (username,password,role,display_name) VALUES ($1,$2,$3,$4) RETURNING id,username,role,display_name',
      [username, hash, role || 'vessel', display_name || username]);
    const user = r.rows[0];

    // Assign vessels
    if (vessel_ids?.length) {
      for (const vid of vessel_ids) {
        await client.query('INSERT INTO fuel_user_vessels (user_id, lng_vessel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, vid]);
      }
    }
    await client.query('COMMIT');

    const vr = await pool.query(`SELECT fuv.lng_vessel_id, lv.name FROM fuel_user_vessels fuv JOIN lng_vessels lv ON lv.id=fuv.lng_vessel_id WHERE fuv.user_id=$1`, [user.id]);
    res.status(201).json({ ...user, assigned_vessels: vr.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'Username exists' });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.put('/users/:id', authenticate, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, role, display_name, active, vessel_ids } = req.body;
    await client.query('BEGIN');

    let q, p;
    if (password) {
      const h = await bcrypt.hash(password, 10);
      q = 'UPDATE users SET username=$1,password=$2,role=$3,display_name=$4,active=$5 WHERE id=$6 RETURNING id,username,role,display_name,active';
      p = [username, h, role, display_name, active !== false, req.params.id];
    } else {
      q = 'UPDATE users SET username=$1,role=$2,display_name=$3,active=$4 WHERE id=$5 RETURNING id,username,role,display_name,active';
      p = [username, role, display_name, active !== false, req.params.id];
    }
    const r = await client.query(q, p);

    // Update vessel assignments
    await client.query('DELETE FROM fuel_user_vessels WHERE user_id = $1', [req.params.id]);
    if (vessel_ids?.length) {
      for (const vid of vessel_ids) {
        await client.query('INSERT INTO fuel_user_vessels (user_id, lng_vessel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, vid]);
      }
    }
    await client.query('COMMIT');

    const vr = await pool.query(`SELECT fuv.lng_vessel_id, lv.name FROM fuel_user_vessels fuv JOIN lng_vessels lv ON lv.id=fuv.lng_vessel_id WHERE fuv.user_id=$1`, [req.params.id]);
    res.json({ ...r.rows[0], assigned_vessels: vr.rows });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

router.delete('/users/:id', authenticate, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    await pool.query('DELETE FROM fuel_user_vessels WHERE user_id=$1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
