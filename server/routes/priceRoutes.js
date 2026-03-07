const express = require('express');
const { pool } = require('../db');
const { authenticate, adminOnly } = require('../auth');
const router = express.Router();

// Get all fuel prices
router.get('/', authenticate, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM fuel_prices ORDER BY year DESC, month DESC, fuel_type')).rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Get price for a specific month/year
router.get('/lookup', authenticate, async (req, res) => {
  try {
    const { year, month, fuel_type } = req.query;
    const ft = fuel_type || 'VLSFO';
    const r = await pool.query('SELECT * FROM fuel_prices WHERE year=$1 AND month=$2 AND fuel_type=$3', [year, month, ft]);
    res.json(r.rows.length ? r.rows[0] : { price: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Set/update a monthly price (admin only)
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { year, month, fuel_type, price, source } = req.body;
    const r = await pool.query(
      `INSERT INTO fuel_prices (year, month, fuel_type, price, source, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (year, month, fuel_type) DO UPDATE SET price=$4, source=$5, updated_by=$6, updated_at=NOW()
       RETURNING *`,
      [year, month, fuel_type || 'VLSFO', price, source || 'manual', req.user.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try { await pool.query('DELETE FROM fuel_prices WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Fetch live bunker prices from Ship & Bunker
router.get('/fetch-live', authenticate, adminOnly, async (req, res) => {
  try {
    const https = require('https');
    const html = await new Promise((resolve, reject) => {
      https.get('https://shipandbunker.com/prices', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }, r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d));
      }).on('error', reject);
    });

    // Ship & Bunker prices page structure:
    // Section 1 = VLSFO, Section 2 = MGO, Section 3 = IFO380 (HSFO)
    // Port prices appear as: "Singapore\n695.5037.00" (price + change concatenated)
    // Table rows: "Global 4 Ports Average ... 650.50 ... +19.00"

    // Split by tabs to isolate VLSFO section (first) and IFO380 section (third)
    const sections = html.split('bg_overview_map');

    let vlsfo = null;
    let hsfo = null;

    // Extract Global 4 Ports Average from VLSFO table (first table section)
    const g4Match = html.match(/Global 4 Ports Average[\s\S]*?(\d{3,4}\.\d{2})/i);
    if (g4Match) vlsfo = parseFloat(g4Match[1]);

    // If that fails, try Singapore VLSFO from the port links
    if (!vlsfo) {
      const sgMatch = html.match(/Singapore\s*(\d{3,4}\.\d{2})/);
      if (sgMatch) vlsfo = parseFloat(sgMatch[1]);
    }

    // For HSFO, look in the IFO380 section - it appears after the second map
    // Port prices in IFO380 section have a different pattern
    // Try to find Rotterdam or Singapore IFO380 prices
    if (sections.length >= 3) {
      // Third section contains IFO380 prices
      const ifo380Section = sections[2] || '';
      // Look for Singapore IFO380 pattern
      const sgHsfo = ifo380Section.match(/Singapore\s*(\d{3,4}\.\d{2})/);
      if (sgHsfo) hsfo = parseFloat(sgHsfo[1]);

      // Or try Global 4 Ports Average in IFO380 table
      const g4Hsfo = ifo380Section.match(/Global 4 Ports Average[\s\S]*?(\d{3,4}\.\d{2})/i);
      if (g4Hsfo) hsfo = parseFloat(g4Hsfo[1]);
    }

    // Sanity check - VLSFO should be 400-1200, HSFO should be 300-800
    if (vlsfo && (vlsfo < 200 || vlsfo > 1500)) vlsfo = null;
    if (hsfo && (hsfo < 150 || hsfo > 1000)) hsfo = null;

    res.json({
      fetched: true,
      timestamp: new Date().toISOString(),
      suggested_vlsfo: vlsfo,
      suggested_hsfo: hsfo,
      note: 'Prices sourced from Ship & Bunker Global 4 Ports Average. Verify before saving.',
    });
  } catch (err) {
    res.json({ fetched: false, error: err.message, note: 'Could not fetch live prices. Enter manually.' });
  }
});

module.exports = router;
