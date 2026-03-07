const express = require('express');
const { pool } = require('../db');
const { authenticate, canReview } = require('../auth');
const router = express.Router();

// Helper: get vessel names assigned to a user
async function getUserVesselNames(userId) {
  const r = await pool.query(
    `SELECT lv.name FROM fuel_user_vessels fuv
     JOIN lng_vessels lv ON lv.id = fuv.lng_vessel_id
     WHERE fuv.user_id = $1 AND lv.active = true`, [userId]);
  return r.rows.map(v => v.name);
}

// List voyages — scoped by role
router.get('/', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    let r;
    if (role === 'admin' || role === 'manager') {
      // Admin and manager see all
      r = await pool.query('SELECT * FROM voyages ORDER BY created_at DESC');
    } else {
      // Superintendent and vessel see only assigned vessels
      const names = await getUserVesselNames(req.user.id);
      if (!names.length) return res.json([]);
      const placeholders = names.map((_, i) => `$${i + 1}`).join(',');
      r = await pool.query(`SELECT * FROM voyages WHERE vessel_name IN (${placeholders}) ORDER BY created_at DESC`, names);
    }
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single voyage with reports and calculation
router.get('/:id', authenticate, async (req, res) => {
  try {
    const voy = await pool.query('SELECT * FROM voyages WHERE id=$1', [req.params.id]);
    if (!voy.rows.length) return res.status(404).json({ error: 'Not found' });
    const reports = await pool.query('SELECT * FROM noon_reports WHERE voyage_id=$1 ORDER BY day_number', [req.params.id]);
    
    const voyage = voy.rows[0];
    const calc = await calculateExcess(voyage, reports.rows);
    
    res.json({ ...voyage, reports: reports.rows, calculation: calc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create voyage
router.post('/', authenticate, async (req, res) => {
  try {
    const { vessel_name, voyage_number, leg_type, discharge_port, loading_port, faop_time, faop_timezone, eosp_time, eosp_timezone, gauging_after_time, gauging_after_tz, gauging_before_time, gauging_before_tz, gauging_after_m3, gauging_before_m3, hfo_price, notes } = req.body;
    const r = await pool.query(`
      INSERT INTO voyages (vessel_name, voyage_number, leg_type, discharge_port, loading_port, faop_time, faop_timezone, eosp_time, eosp_timezone, gauging_after_time, gauging_after_tz, gauging_before_time, gauging_before_tz, gauging_after_m3, gauging_before_m3, hfo_price, notes, created_by, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'draft') RETURNING *`,
      [vessel_name, voyage_number, leg_type||'BALLAST', discharge_port, loading_port, faop_time||null, faop_timezone, eosp_time||null, eosp_timezone, gauging_after_time||null, gauging_after_tz, gauging_before_time||null, gauging_before_tz, gauging_after_m3||0, gauging_before_m3||0, hfo_price||0, notes, req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update voyage
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { vessel_name, voyage_number, leg_type, discharge_port, loading_port, faop_time, faop_timezone, eosp_time, eosp_timezone, gauging_after_time, gauging_after_tz, gauging_before_time, gauging_before_tz, gauging_after_m3, gauging_before_m3, hfo_price, notes, status } = req.body;
    const r = await pool.query(`
      UPDATE voyages SET vessel_name=$1, voyage_number=$2, leg_type=$3, discharge_port=$4, loading_port=$5, faop_time=$6, faop_timezone=$7, eosp_time=$8, eosp_timezone=$9, gauging_after_time=$10, gauging_after_tz=$11, gauging_before_time=$12, gauging_before_tz=$13, gauging_after_m3=$14, gauging_before_m3=$15, hfo_price=$16, notes=$17, status=$18, updated_at=NOW()
      WHERE id=$19 RETURNING *`,
      [vessel_name, voyage_number, leg_type, discharge_port, loading_port, faop_time||null, faop_timezone, eosp_time||null, eosp_timezone, gauging_after_time||null, gauging_after_tz, gauging_before_time||null, gauging_before_tz, gauging_after_m3||0, gauging_before_m3||0, hfo_price||0, notes, status||'draft', req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Finalise voyage (superintendent only)
router.put('/:id/finalise', authenticate, canReview, async (req, res) => {
  try {
    const r = await pool.query('UPDATE voyages SET status=$1, reviewed_by=$2, updated_at=NOW() WHERE id=$3 RETURNING *', ['finalised', req.user.id, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete voyage
router.delete('/:id', authenticate, canReview, async (req, res) => {
  try {
    await pool.query('DELETE FROM noon_reports WHERE voyage_id=$1', [req.params.id]);
    await pool.query('DELETE FROM voyages WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Calculation Engine ──
async function calculateExcess(voyage, reports) {
  // Get vessel specs
  const vesselR = await pool.query('SELECT * FROM lng_vessels WHERE name=$1', [voyage.vessel_name]);
  const vessel = vesselR.rows[0];
  if (!vessel) return { error: 'Vessel not found in LNG specs' };

  // Get interpolation curve
  const legType = (voyage.leg_type || 'BALLAST').toUpperCase();
  const curveR = await pool.query('SELECT speed, fuel FROM interpolation_curves WHERE vessel_class=$1 AND leg_type=$2 ORDER BY speed', [vessel.vessel_class, legType]);
  const curve = curveR.rows.map(r => ({ speed: parseFloat(r.speed), fuel: parseFloat(r.fuel) }));
  if (!curve.length) return { error: 'No interpolation curve found' };

  // Get exclusion items
  const exclR = await pool.query('SELECT name, excluded FROM exclusion_items');
  const exclMap = {};
  exclR.rows.forEach(e => { exclMap[e.name.toUpperCase()] = e.excluded; });

  // Interpolation function (LOOKUP equivalent - finds largest speed <= target)
  function interpolateFuel(speed) {
    if (!speed || speed <= 0) return 0;
    let result = 0;
    for (const point of curve) {
      if (point.speed <= speed) result = point.fuel;
      else break;
    }
    return result;
  }

  // Process each noon report
  let totalHours = 0, totalDistance = 0, totalHFO = 0, totalFOE = 0, totalFO = 0;
  let totalGuaranteed = 0;
  let exclTime = 0, exclHFO = 0, exclFO = 0, exclDistance = 0, exclGuaranteed = 0;

  const processedReports = reports.map(r => {
    const hours = parseFloat(r.steaming_hours) || 0;
    const distance = parseFloat(r.distance_nm) || 0;
    const hfo = parseFloat(r.hfo_consumed) || 0;
    const foe = parseFloat(r.foe_consumed) || 0;
    const totalFuel = hfo + foe;
    const avgSpeed = hours > 0 ? distance / hours : 0;
    const interpolated = interpolateFuel(avgSpeed);
    const difference = interpolated - totalFuel;
    const revs = parseInt(r.total_revs) || 0;
    const slip = vessel.pitch && hours > 0 ? (((revs * parseFloat(vessel.pitch)) / 1800) - distance) / 100 : 0;

    // Check weather exclusion
    const weatherKey = (r.weather_condition || '').toUpperCase().trim();
    const isExcluded = exclMap[weatherKey] || false;

    totalHours += hours;
    totalDistance += distance;
    totalHFO += hfo;
    totalFOE += foe;
    totalFO += totalFuel;
    totalGuaranteed += interpolated;

    if (isExcluded) {
      exclTime += hours;
      exclHFO += hfo;
      exclFO += totalFuel;
      exclDistance += distance;
      exclGuaranteed += interpolated;
    }

    return {
      ...r,
      total_fuel: totalFuel,
      avg_speed: avgSpeed,
      interpolated_fuel: interpolated,
      difference,
      status: difference,
      is_excluded: isExcluded,
      slip,
      excl_time: isExcluded ? hours : 0,
      excl_hfo: isExcluded ? hfo : 0,
      excl_fo: isExcluded ? totalFuel : 0,
      excl_distance: isExcluded ? distance : 0,
      excl_guaranteed: isExcluded ? interpolated : 0,
    };
  });

  // Passage duration
  const faop = voyage.faop_time ? new Date(voyage.faop_time) : null;
  const eosp = voyage.eosp_time ? new Date(voyage.eosp_time) : null;
  const passageDays = faop && eosp ? (eosp - faop) / (1000 * 60 * 60 * 24) : 0;
  const passageHours = passageDays * 24;

  // FOE (Boil-off) calculation
  const boiloffRate = legType === 'LADEN' ? parseFloat(vessel.laden_boiloff_pct) / 100 : parseFloat(vessel.ballast_boiloff_pct) / 100;
  const capacity = parseFloat(vessel.capacity_m3);
  const foeFactor = parseFloat(vessel.foe_factor);
  const dailyBoiloffM3 = boiloffRate * capacity;
  const dailyFOE = dailyBoiloffM3 * foeFactor;

  // Gauging
  const gaugingAfter = voyage.gauging_after_time ? new Date(voyage.gauging_after_time) : null;
  const gaugingBefore = voyage.gauging_before_time ? new Date(voyage.gauging_before_time) : null;
  const gaugingDays = gaugingAfter && gaugingBefore ? (gaugingBefore - gaugingAfter) / (1000 * 60 * 60 * 24) : passageDays;
  const guaranteedTotalFOE = gaugingDays * dailyFOE;

  const gaugingAfterM3 = parseFloat(voyage.gauging_after_m3) || 0;
  const gaugingBeforeM3 = parseFloat(voyage.gauging_before_m3) || 0;
  const boiloffConsumedM3 = gaugingAfterM3 - gaugingBeforeM3;
  const nitrogenComp = boiloffConsumedM3 * 0.005;
  const netBoiloffM3 = boiloffConsumedM3 - nitrogenComp;
  const passageFOE = netBoiloffM3 * foeFactor;
  const actualDailyFOE = gaugingDays > 0 ? passageFOE / gaugingDays : 0;

  // Harbour periods
  const harbourBefore = faop && gaugingAfter ? (faop - gaugingAfter) / (1000 * 60 * 60 * 24) : 0;
  const harbourAfter = eosp && gaugingBefore ? (gaugingBefore - eosp) / (1000 * 60 * 60 * 24) : 0;
  const totalHarbourDays = Math.abs(harbourBefore) + Math.abs(harbourAfter);
  const totalExclusionDays = (exclTime / 24) + totalHarbourDays;

  // Net passage (less exclusions)
  const netHours = totalHours - exclTime;
  const netDistance = totalDistance - exclDistance;
  const netHFO = totalHFO - exclHFO;
  const netFOE = passageFOE - (totalExclusionDays * actualDailyFOE);
  const netTotalFuel = netHFO + netFOE;

  // Speed-based evaluation
  const avgSpeed = netHours > 0 ? netDistance / netHours : 0;
  const guaranteedDaily = interpolateFuel(avgSpeed);
  const guaranteedPassageFuel = guaranteedDaily * (netHours / 24);
  const excessFuel = netTotalFuel - guaranteedPassageFuel;
  const reimbursableExcess = excessFuel;
  const excessCost = reimbursableExcess * (parseFloat(voyage.hfo_price) || 0);

  // Simple comparison
  const simpleExcess = totalFO - totalGuaranteed;
  const simpleExclFO = exclFO - exclGuaranteed;
  const simpleReimbursable = simpleExcess - simpleExclFO;
  const simpleReimbursableCost = simpleReimbursable * (parseFloat(voyage.hfo_price) || 0);

  return {
    // Passage overview
    passage_days: passageDays,
    passage_hours: passageHours,
    total_distance: totalDistance,
    total_hfo: totalHFO,
    total_foe: totalFOE,
    total_fo: totalFO,

    // FOE/Boil-off
    vessel_capacity: capacity,
    foe_factor: foeFactor,
    boiloff_rate_pct: boiloffRate * 100,
    daily_boiloff_m3: dailyBoiloffM3,
    daily_foe: dailyFOE,
    gauging_days: gaugingDays,
    guaranteed_total_foe: guaranteedTotalFOE,
    gauging_after_m3: gaugingAfterM3,
    gauging_before_m3: gaugingBeforeM3,
    boiloff_consumed_m3: boiloffConsumedM3,
    nitrogen_comp: nitrogenComp,
    net_boiloff_m3: netBoiloffM3,
    passage_foe: passageFOE,
    actual_daily_foe: actualDailyFOE,

    // Exclusions
    harbour_days: totalHarbourDays,
    excluded_time_hrs: exclTime,
    excluded_hfo: exclHFO,
    excluded_fo: exclFO,
    excluded_distance: exclDistance,
    total_exclusion_days: totalExclusionDays,

    // Net passage
    net_hours: netHours,
    net_distance: netDistance,
    net_hfo: netHFO,
    net_foe: netFOE,
    net_total_fuel: netTotalFuel,

    // Evaluation
    avg_speed: avgSpeed,
    guaranteed_daily: guaranteedDaily,
    guaranteed_passage_fuel: guaranteedPassageFuel,
    excess_fuel: excessFuel,
    reimbursable_excess: reimbursableExcess,
    hfo_price: parseFloat(voyage.hfo_price) || 0,
    excess_cost: excessCost,

    // Simple comparison
    simple_actual: totalFO,
    simple_guaranteed: totalGuaranteed,
    simple_excess: simpleExcess,
    simple_excl_fo: simpleExclFO,
    simple_reimbursable: simpleReimbursable,
    simple_cost: simpleReimbursableCost,

    // Processed reports
    reports: processedReports,
  };
}

module.exports = router;
