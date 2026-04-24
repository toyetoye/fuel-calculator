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

// ── LNG Analytics endpoint (for dashboard) ────────────────────────────────────
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const { vessel_name } = req.query;
    const params = []; const clauses = [];
    if (vessel_name) { params.push(vessel_name); clauses.push(`v.vessel_name = $${params.length}`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    // Monthly aggregates
    const monthly = (await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', nr.report_date), 'YYYY-MM') AS month_key,
        TO_CHAR(DATE_TRUNC('month', nr.report_date), 'Mon YY') AS month_label,
        COUNT(DISTINCT v.id)::int                               AS voyage_count,
        ROUND(SUM(COALESCE(nr.steaming_hours,0))::numeric,1)   AS steaming_hrs,
        ROUND(SUM(COALESCE(nr.distance_nm,0))::numeric,1)       AS distance_nm,
        ROUND(SUM(COALESCE(nr.hfo_consumed,0))::numeric,2)      AS hfo_consumed,
        ROUND(SUM(COALESCE(nr.foe_consumed,0))::numeric,4)      AS foe_consumed,
        -- NBO/FBO split (SUM ignores NULLs naturally; returns NULL if no rows have the split)
        ROUND(SUM(nr.nbo_consumed)::numeric,4)                  AS nbo_consumed,
        ROUND(SUM(nr.fbo_consumed)::numeric,4)                  AS fbo_consumed,
        COUNT(nr.nbo_consumed)::int + COUNT(nr.fbo_consumed)::int AS split_field_count,
        -- Monthly attained CII data
        ROUND(((SUM(COALESCE(nr.hfo_consumed,0))*3.114 + SUM(COALESCE(nr.foe_consumed,0))*2.750)*1e6 /
          NULLIF(SUM(COALESCE(lv.dwt,79581)*nr.distance_nm),0))::numeric,3) AS attained_cii,
        0::float                                                  AS net_excess,
        ROUND(SUM(COALESCE(lv.dwt,79581) * nr.distance_nm)::numeric,0) AS transport_work
      FROM noon_reports nr
      JOIN voyages v ON v.id = nr.voyage_id
      LEFT JOIN lng_vessels lv ON lv.name = v.vessel_name
      ${where}
      GROUP BY month_key, month_label
      ORDER BY month_key ASC
    `, params)).rows;

    // Totals — uses per-vessel DWT for proper CII transport work calculation
    const totals = (await pool.query(`
      SELECT
        COALESCE(SUM(nr.distance_nm),0)::float                     AS total_dist,
        COALESCE(SUM(nr.hfo_consumed),0)::float                    AS total_hfo,
        COALESCE(SUM(nr.foe_consumed),0)::float                    AS total_foe,
        SUM(nr.nbo_consumed)::float                                AS total_nbo,
        SUM(nr.fbo_consumed)::float                                AS total_fbo,
        (COUNT(nr.nbo_consumed) + COUNT(nr.fbo_consumed))::int     AS split_field_count,
        COUNT(*)::int                                               AS total_reports,
        COUNT(DISTINCT v.id)::int                                   AS voyage_count,
        0::float                                                     AS net_excess,
        -- CII transport work: Σ(DWT × dist) per noon report, using vessel-specific DWT
        COALESCE(SUM(COALESCE(lv.dwt,79581) * nr.distance_nm),0)::float AS transport_work
      FROM noon_reports nr
      JOIN voyages v ON v.id = nr.voyage_id
      LEFT JOIN lng_vessels lv ON lv.name = v.vessel_name
      ${where}
    `, params)).rows[0];

    // Aggregate attained CII (gCO2/t·NM) — MEPC.339(76) LNG Carrier
    // CO2 = HFO × CF_HFO + FOE × CF_FOE  (boil-off is a major LNG carrier CII factor)
    // Attained CII = (total CO2 in t × 10^6) / transport_work(t·NM)
    const ciiRef  = 9.827;   // LNG Carrier reference line (constant, DWT-independent)
    const year    = new Date().getFullYear();
    const Z       = ({2023:5,2024:5,2025:7,2026:9,2027:11})[year] || 9;
    const ciiReq  = ciiRef * (1 - Z/100);
    const dd = [0.82, 0.93, 1.14, 1.34];
    const bounds  = { A: ciiReq*dd[0], B: ciiReq*dd[1], C: ciiReq*dd[2], D: ciiReq*dd[3] };

    const CF_HFO = 3.114;   // CO2 factor for HFO (t CO2/t fuel)
    const CF_FOE = 2.750;   // CO2 factor for LNG boil-off (FOE)
    const co2  = (parseFloat(totals.total_hfo) * CF_HFO) + (parseFloat(totals.total_foe) * CF_FOE);
    const tw   = parseFloat(totals.transport_work) || 0;
    const attained = tw > 0 ? (co2 * 1e6) / tw : 0;
    const rating = attained<=bounds.A?'A':attained<=bounds.B?'B':attained<=bounds.C?'C':attained<=bounds.D?'D':'E';

    // Anomalies — voyages with high HFO (basic check)
    const anomalies = (await pool.query(`
      SELECT v.voyage_number, v.vessel_name,
             ROUND(SUM(nr.hfo_consumed)::numeric,2) AS total_hfo,
             COUNT(nr.id)::int AS report_count
      FROM voyages v
      JOIN noon_reports nr ON nr.voyage_id = v.id
      ${where}
      GROUP BY v.id, v.voyage_number, v.vessel_name
      HAVING SUM(nr.hfo_consumed) > 500
      ORDER BY total_hfo DESC LIMIT 10
    `, params)).rows.map(a=>({
      ...a, message: `High HFO consumption: ${a.total_hfo} MT over ${a.report_count} days`
    }));

    res.json({ monthly, totals, cii: { ciiRef, ciiReq, bounds, attained, rating, Z }, anomalies });
  } catch(e) { console.error('[LNG analytics]',e); res.status(500).json({ error: e.message }); }
});


module.exports = router;
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

// Finalise voyage (admin, superintendent, vessel)
router.put('/:id/finalise', authenticate, async (req, res) => {
  try {
    const r = await pool.query('UPDATE voyages SET status=$1, reviewed_by=$2, updated_at=NOW() WHERE id=$3 RETURNING *', ['finalised', req.user.id, req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Unfinalise voyage (admin, superintendent only)
router.put('/:id/unfinalise', authenticate, canReview, async (req, res) => {
  try {
    const r = await pool.query('UPDATE voyages SET status=$1, reviewed_by=NULL, updated_at=NOW() WHERE id=$2 RETURNING *', ['draft', req.params.id]);
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
  let totalNBO = 0, totalFBO = 0;
  let nboFboDaysSeen = 0; // days where NBO or FBO was actually provided
  let totalGuaranteed = 0;
  let exclTime = 0, exclHFO = 0, exclFO = 0, exclDistance = 0, exclGuaranteed = 0;

  const processedReports = reports.map(r => {
    const hours = parseFloat(r.steaming_hours) || 0;
    const distance = parseFloat(r.distance_nm) || 0;
    const hfo = parseFloat(r.hfo_consumed) || 0;
    const foe = parseFloat(r.foe_consumed) || 0;
    const hasNbo = r.nbo_consumed !== null && r.nbo_consumed !== undefined;
    const hasFbo = r.fbo_consumed !== null && r.fbo_consumed !== undefined;
    const nbo = hasNbo ? (parseFloat(r.nbo_consumed) || 0) : 0;
    const fbo = hasFbo ? (parseFloat(r.fbo_consumed) || 0) : 0;
    if (hasNbo || hasFbo) nboFboDaysSeen += 1;
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
    totalNBO += nbo;
    totalFBO += fbo;
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
    total_nbo: nboFboDaysSeen > 0 ? totalNBO : null,
    total_fbo: nboFboDaysSeen > 0 ? totalFBO : null,
    nbo_fbo_days_seen: nboFboDaysSeen,
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

    // CII calculation
    ...calculateCII(vessel, processedReports, totalDistance),

    // Processed reports
    reports: processedReports,
  };
}

// CII Calculation per IMO MEPC.352(78) / MEPC.339(76) for LNG Carriers
function calculateCII(vessel, reports, totalDistance) {
  const dwt = vessel ? parseFloat(vessel.dwt) || 0 : 0;
  if (!dwt || dwt === 0) return { cii_error: 'DWT not set for vessel', cii_daily: [], cii_attained: 0, cii_required: 0, cii_rating: 'N/A' };

  const cfHfo = vessel ? parseFloat(vessel.cf_hfo) || 3.114 : 3.114;  // t-CO2/t-fuel for HFO
  const cfFoe = vessel ? parseFloat(vessel.cf_foe) || 2.750 : 2.750;  // t-CO2/t-fuel for LNG

  // IMO reference line for LNG carriers: CII_ref = 9.827 (constant)
  // Per MEPC.339(76) Annex I - LNG carrier category
  const ciiRef = 9.827;

  // Reduction factors by year (MEPC.338(76))
  const reductionFactors = { 2023: 5, 2024: 5, 2025: 7, 2026: 9, 2027: 11, 2028: 11, 2029: 11, 2030: 11 };
  const year = new Date().getFullYear();
  const Z = reductionFactors[year] || 9;
  const ciiRequired = ciiRef * (1 - Z / 100);

  // Rating boundaries (dd vectors for LNG carriers, MEPC.354(78))
  const d1 = 0.82, d2 = 0.93, d3 = 1.14, d4 = 1.34;
  const bounds = {
    A: ciiRequired * d1,
    B: ciiRequired * d2,
    C: ciiRequired * d3,
    D: ciiRequired * d4,
  };

  function getRating(cii) {
    if (cii <= bounds.A) return 'A';
    if (cii <= bounds.B) return 'B';
    if (cii <= bounds.C) return 'C';
    if (cii <= bounds.D) return 'D';
    return 'E';
  }

  // Calculate daily and cumulative CII
  let cumCO2 = 0, cumDist = 0;
  const ciiDaily = reports.map(r => {
    const hfo = parseFloat(r.hfo_consumed) || parseFloat(r.hfo) || 0;
    const foe = parseFloat(r.foe_consumed) || parseFloat(r.foe) || 0;
    const dist = parseFloat(r.distance_nm) || parseFloat(r.dist) || 0;

    const dailyCO2 = (hfo * cfHfo) + (foe * cfFoe);
    const dailyCII = dist > 0 ? (dailyCO2 * 1000000) / (dwt * dist) : 0;  // g-CO2/dwt·nm

    cumCO2 += dailyCO2;
    cumDist += dist;
    const runningCII = cumDist > 0 ? (cumCO2 * 1000000) / (dwt * cumDist) : 0;

    return {
      day: r.day_number,
      date: r.report_date,
      hfo, foe, dist,
      daily_co2: dailyCO2,
      daily_cii: dailyCII,
      cum_co2: cumCO2,
      cum_dist: cumDist,
      running_cii: runningCII,
      running_rating: getRating(runningCII),
    };
  });

  // Voyage attained CII
  const attainedCII = cumDist > 0 ? (cumCO2 * 1000000) / (dwt * cumDist) : 0;

  return {
    cii_dwt: dwt,
    cii_cf_hfo: cfHfo,
    cii_cf_foe: cfFoe,
    cii_ref: ciiRef,
    cii_reduction_pct: Z,
    cii_required: ciiRequired,
    cii_bounds: bounds,
    cii_attained: attainedCII,
    cii_rating: getRating(attainedCII),
    cii_total_co2: cumCO2,
    cii_total_dist: cumDist,
    cii_daily: ciiDaily,
  };
}



