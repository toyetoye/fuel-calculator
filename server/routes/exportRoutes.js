const express = require('express');
const { pool } = require('../db');
const PDFDocument = require('pdfkit');
const router = express.Router();

// Auth via query param
function authFromQuery(req, res, next) {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const jwt = require('jsonwebtoken');
  const SECRET = process.env.JWT_SECRET || 'fleet-budget-secret-change-me';
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// Interpolation lookup
function interpolateFuel(curve, speed) {
  if (!speed || speed <= 0 || !curve.length) return 0;
  let result = 0;
  for (const p of curve) { if (p.speed <= speed) result = p.fuel; else break; }
  return result;
}

router.get('/:voyageId/pdf', authFromQuery, async (req, res) => {
  try {
    const voy = await pool.query('SELECT * FROM voyages WHERE id=$1', [req.params.voyageId]);
    if (!voy.rows.length) return res.status(404).json({ error: 'Not found' });
    const voyage = voy.rows[0];
    const reports = (await pool.query('SELECT * FROM noon_reports WHERE voyage_id=$1 ORDER BY day_number', [req.params.voyageId])).rows;

    // Get vessel specs
    const vesselR = await pool.query('SELECT * FROM lng_vessels WHERE name=$1', [voyage.vessel_name]);
    const vessel = vesselR.rows[0];

    // Get curve
    const legType = (voyage.leg_type || 'BALLAST').toUpperCase();
    let curve = [];
    if (vessel) {
      const curveR = await pool.query('SELECT speed, fuel FROM interpolation_curves WHERE vessel_class=$1 AND leg_type=$2 ORDER BY speed', [vessel.vessel_class, legType]);
      curve = curveR.rows.map(r => ({ speed: parseFloat(r.speed), fuel: parseFloat(r.fuel) }));
    }

    // Get exclusions
    const exclR = await pool.query('SELECT name, excluded FROM exclusion_items');
    const exclMap = {};
    exclR.rows.forEach(e => { exclMap[e.name.toUpperCase()] = e.excluded; });

    // Process reports
    let totHrs = 0, totDist = 0, totHFO = 0, totFOE = 0, totFO = 0, totGuar = 0;
    let exclTime = 0, exclHFO = 0, exclFO = 0, exclDist = 0;
    const processed = reports.map(r => {
      const hrs = parseFloat(r.steaming_hours) || 0;
      const dist = parseFloat(r.distance_nm) || 0;
      const hfo = parseFloat(r.hfo_consumed) || 0;
      const foe = parseFloat(r.foe_consumed) || 0;
      const total = hfo + foe;
      const speed = hrs > 0 ? dist / hrs : 0;
      const guar = interpolateFuel(curve, speed);
      const diff = guar - total;
      const wKey = (r.weather_condition || '').toUpperCase().trim();
      const excl = exclMap[wKey] || false;
      totHrs += hrs; totDist += dist; totHFO += hfo; totFOE += foe; totFO += total; totGuar += guar;
      if (excl) { exclTime += hrs; exclHFO += hfo; exclFO += total; exclDist += dist; }
      return { ...r, hrs, dist, hfo, foe, total, speed, guar, diff, excl };
    });

    // Passage calcs
    const faop = voyage.faop_time ? new Date(voyage.faop_time) : null;
    const eosp = voyage.eosp_time ? new Date(voyage.eosp_time) : null;
    const passDays = faop && eosp ? (eosp - faop) / (1000*60*60*24) : 0;
    const passHrs = passDays * 24;

    // FOE calcs
    const capacity = vessel ? parseFloat(vessel.capacity_m3) : 0;
    const foeFactor = vessel ? parseFloat(vessel.foe_factor) : 0.484;
    const boilRate = vessel ? (legType === 'LADEN' ? parseFloat(vessel.laden_boiloff_pct) : parseFloat(vessel.ballast_boiloff_pct)) / 100 : 0;
    const dailyBoilM3 = boilRate * capacity;
    const dailyFOE = dailyBoilM3 * foeFactor;

    const gaugAfterM3 = parseFloat(voyage.gauging_after_m3) || 0;
    const gaugBeforeM3 = parseFloat(voyage.gauging_before_m3) || 0;
    const boilConsumed = gaugAfterM3 - gaugBeforeM3;
    const n2Comp = boilConsumed * 0.005;
    const netBoil = boilConsumed - n2Comp;
    const passFOE = netBoil * foeFactor;

    // Net passage
    const netHrs = totHrs - exclTime;
    const netDist = totDist - exclDist;
    const netHFO = totHFO - exclHFO;
    const avgSpeed = netHrs > 0 ? netDist / netHrs : 0;
    const guarDaily = interpolateFuel(curve, avgSpeed);
    const guarPassFuel = guarDaily * (netHrs / 24);

    const harbourBefore = faop && voyage.gauging_after_time ? Math.abs((faop - new Date(voyage.gauging_after_time)) / (1000*60*60*24)) : 0;
    const harbourAfter = eosp && voyage.gauging_before_time ? Math.abs((new Date(voyage.gauging_before_time) - eosp) / (1000*60*60*24)) : 0;
    const totalHarbour = harbourBefore + harbourAfter;
    const totalExclDays = (exclTime / 24) + totalHarbour;
    const actualDailyFOE = passDays > 0 ? passFOE / passDays : 0;
    const netFOE = passFOE - (totalExclDays * actualDailyFOE);
    const netTotal = netHFO + netFOE;
    const excess = netTotal - guarPassFuel;
    const hfoPrice = parseFloat(voyage.hfo_price) || 0;
    const excessCost = excess * hfoPrice;

    // Simple comparison
    const simpleExcess = totFO - totGuar;
    const simpleExclFO = exclFO - processed.filter(r => r.excl).reduce((s, r) => s + r.guar, 0);
    const simpleReimb = simpleExcess - simpleExclFO;
    const simpleCost = simpleReimb * hfoPrice;

    // ── BUILD PDF ──
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Excess_Fuel_${voyage.voyage_number.replace(/\//g, '_')}.pdf`);
    doc.pipe(res);

    const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
    const fmt0 = n => fmt(n, 0);
    const fmtC = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const pageW = 842 - 60; // A4 landscape minus margins

    // ── HEADER ──
    doc.rect(30, 30, pageW, 45).fill('#1E293B');
    doc.fill('#F59E0B').fontSize(14).font('Helvetica-Bold').text('EXCESS FUEL CALCULATION REPORT', 40, 42, { width: pageW - 20 });
    doc.fill('#94A3B8').fontSize(8).text(`${voyage.vessel_name} — Voy: ${voyage.voyage_number} — ${voyage.leg_type}`, 40, 60, { width: pageW - 20 });
    doc.fill('#000000');

    // ── VOYAGE INFO BOX ──
    let y = 85;
    doc.rect(30, y, pageW, 55).fill('#F8FAFC').stroke('#E2E8F0');
    doc.fill('#334155').fontSize(7).font('Helvetica');
    const info = [
      [`Vessel: ${voyage.vessel_name}`, `Voyage: ${voyage.voyage_number}`, `Leg: ${voyage.leg_type}`, `Status: ${voyage.status.toUpperCase()}`],
      [`Discharge Port: ${voyage.discharge_port || '—'}`, `Loading Port: ${voyage.loading_port || '—'}`, `HFO Price: ${hfoPrice > 0 ? '$' + hfoPrice + '/MT' : 'Not set'}`, `Class: ${vessel?.vessel_class || '—'}`],
      [`FAOP: ${faop ? faop.toISOString().slice(0, 16).replace('T', ' ') : '—'} ${voyage.faop_timezone || ''}`, `EOSP: ${eosp ? eosp.toISOString().slice(0, 16).replace('T', ' ') : '—'} ${voyage.eosp_timezone || ''}`, `Passage: ${fmt(passDays, 1)} days (${fmt0(passHrs)} hrs)`, `Distance: ${fmt0(totDist)} NM`],
    ];
    info.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        doc.text(cell, 40 + ci * 195, y + 5 + ri * 16, { width: 190 });
      });
    });

    // ── NOON REPORTS TABLE ──
    y = 150;
    doc.rect(30, y, pageW, 16).fill('#1E293B');
    const cols = [
      { h: 'Day', w: 28, a: 'right' }, { h: 'Date', w: 58, a: 'left' }, { h: 'Hrs', w: 32, a: 'right' },
      { h: 'Revs', w: 42, a: 'right' }, { h: 'Dist', w: 36, a: 'right' }, { h: 'HFO', w: 34, a: 'right' },
      { h: 'FOE', w: 42, a: 'right' }, { h: 'Total FO', w: 44, a: 'right' }, { h: 'Speed', w: 36, a: 'right' },
      { h: 'Guar.', w: 40, a: 'right' }, { h: 'Diff', w: 40, a: 'right' }, { h: 'Excl', w: 28, a: 'center' },
      { h: 'Weather / Remarks', w: 190, a: 'left' }, { h: 'Slip', w: 36, a: 'right' },
    ];

    doc.fill('#F59E0B').fontSize(6).font('Helvetica-Bold');
    let x = 35;
    cols.forEach(c => { doc.text(c.h, x, y + 4, { width: c.w, align: c.a }); x += c.w + 2; });
    y += 16;

    // Data rows
    doc.font('Helvetica').fontSize(6);
    processed.forEach((r, i) => {
      if (y > 530) { doc.addPage(); y = 40; }
      if (r.excl) doc.rect(30, y, pageW, 13).fill('#FEF2F2');
      else if (i % 2 === 0) doc.rect(30, y, pageW, 13).fill('#F8FAFC');
      else doc.rect(30, y, pageW, 13).fill('#FFFFFF');

      doc.fill('#334155');
      const slip = vessel?.pitch && r.hrs > 0 ? (((r.total_revs * parseFloat(vessel.pitch)) / 1800) - r.dist) / 100 : 0;
      const weatherRem = [r.weather_condition, r.remarks].filter(Boolean).join(' — ');
      const vals = [
        r.day_number, r.report_date ? new Date(r.report_date).toISOString().slice(0, 10) : '',
        fmt(r.hrs, 1), fmt0(r.total_revs), fmt0(r.dist), fmt(r.hfo, 1), fmt(r.foe), fmt(r.total),
        fmt(r.speed, 1), fmt(r.guar), (r.diff >= 0 ? '+' : '') + fmt(r.diff), r.excl ? 'YES' : '',
        weatherRem.slice(0, 50), fmt(slip, 2)
      ];

      x = 35;
      vals.forEach((v, vi) => {
        if (vi === 10) { // Diff column - color code
          doc.fill(r.diff >= 0 ? '#16A34A' : '#DC2626');
        } else if (vi === 11 && r.excl) {
          doc.fill('#DC2626');
        } else {
          doc.fill('#334155');
        }
        doc.text(String(v), x, y + 3, { width: cols[vi].w, align: cols[vi].a });
        x += cols[vi].w + 2;
      });
      y += 13;
    });

    // Totals row
    doc.rect(30, y, pageW, 15).fill('#1E293B');
    doc.fill('#F59E0B').font('Helvetica-Bold').fontSize(6);
    x = 35;
    const totVals = ['', 'TOTALS', fmt(totHrs, 1), '', fmt0(totDist), fmt(totHFO, 1), fmt(totFOE), fmt(totFO), '', fmt(totGuar), (totFO - totGuar >= 0 ? '+' : '') + fmt(totFO - totGuar), '', '', ''];
    totVals.forEach((v, vi) => { doc.text(String(v), x, y + 4, { width: cols[vi].w, align: cols[vi].a }); x += cols[vi].w + 2; });
    y += 20;

    // ── SUMMARY SECTIONS ──
    if (y > 430) { doc.addPage(); y = 40; }

    const boxW = (pageW - 20) / 3;
    const drawBox = (bx, by, title, rows) => {
      doc.rect(bx, by, boxW, 14 + rows.length * 12).fill('#F8FAFC').stroke('#E2E8F0');
      doc.rect(bx, by, boxW, 14).fill('#1E293B');
      doc.fill('#F59E0B').fontSize(7).font('Helvetica-Bold').text(title, bx + 5, by + 3, { width: boxW - 10 });
      doc.font('Helvetica').fontSize(6).fill('#334155');
      rows.forEach((r, i) => {
        const ry = by + 18 + i * 12;
        doc.text(r[0], bx + 5, ry, { width: boxW * 0.6 });
        const color = r[2] || '#334155';
        doc.fill(color).font('Helvetica-Bold').text(r[1], bx + boxW * 0.6, ry, { width: boxW * 0.35, align: 'right' });
        doc.fill('#334155').font('Helvetica');
      });
    };

    // Passage data
    drawBox(30, y, 'PASSAGE DATA', [
      ['Passage Duration (Days)', fmt(passDays, 2)],
      ['Passage Duration (Hrs)', fmt0(passHrs)],
      ['Total Distance (NM)', fmt0(totDist)],
      ['Total HFO (MT)', fmt(totHFO, 1)],
      ['Total FOE (MT)', fmt(totFOE)],
      ['Total FO (MT)', fmt(totFO)],
    ]);

    // Exclusions
    drawBox(30 + boxW + 10, y, 'EXCLUSIONS', [
      ['Harbour Period (Days)', fmt(totalHarbour, 3)],
      ['Excluded Time (Hrs)', fmt(exclTime, 1)],
      ['Excluded HFO (MT)', fmt(exclHFO, 1)],
      ['Excluded FO (MT)', fmt(exclFO)],
      ['Excluded Distance (NM)', fmt0(exclDist)],
      ['Total Exclusion (Days)', fmt(totalExclDays, 3)],
    ]);

    // FOE
    drawBox(30 + (boxW + 10) * 2, y, 'FOE / BOIL-OFF', [
      ['Capacity (M³)', fmt0(capacity)],
      ['Boil-off Rate (%/day)', fmt(boilRate * 100, 2) + '%'],
      ['Gauging After (M³)', fmt(gaugAfterM3, 3)],
      ['Gauging Before (M³)', fmt(gaugBeforeM3, 3)],
      ['Boil-off (M³)', fmt(boilConsumed, 3)],
      ['Passage FOE (MT)', fmt(passFOE)],
    ]);

    y += 14 + 6 * 12 + 15;
    if (y > 480) { doc.addPage(); y = 40; }

    // Evaluation boxes
    const evalW = (pageW - 10) / 2;
    // Speed-based
    doc.rect(30, y, evalW, 14 + 7 * 13).fill('#FFFBEB').stroke('#FDE68A');
    doc.rect(30, y, evalW, 14).fill('#92400E');
    doc.fill('#FDE68A').fontSize(8).font('Helvetica-Bold').text('PASSAGE EVALUATION (Speed-Based)', 35, y + 3, { width: evalW - 10 });
    doc.font('Helvetica').fontSize(7).fill('#334155');
    const evalRows = [
      ['Average Speed (Knots)', fmt(avgSpeed, 2)],
      ['Guaranteed Daily Fuel (MT/day)', fmt(guarDaily)],
      ['Net Duration (Hrs)', fmt(netHrs, 1)],
      ['Guaranteed Passage Fuel (MT)', fmt(guarPassFuel)],
      ['Net Passage Fuel (MT)', fmt(netTotal)],
      ['Excess Fuel (MT)', fmt(excess), excess > 0 ? '#DC2626' : '#16A34A'],
      ['Excess Cost ($)', fmtC(excessCost), excessCost > 0 ? '#DC2626' : '#16A34A'],
    ];
    evalRows.forEach((r, i) => {
      const ry = y + 18 + i * 13;
      doc.fill('#334155').font('Helvetica').text(r[0], 35, ry, { width: evalW * 0.6 });
      doc.fill(r[2] || '#334155').font('Helvetica-Bold').text(r[1], 35 + evalW * 0.55, ry, { width: evalW * 0.35, align: 'right' });
    });

    // Simple comparison
    doc.rect(30 + evalW + 10, y, evalW, 14 + 7 * 13).fill('#FFFBEB').stroke('#FDE68A');
    doc.rect(30 + evalW + 10, y, evalW, 14).fill('#92400E');
    doc.fill('#FDE68A').fontSize(8).font('Helvetica-Bold').text('SIMPLE COMPARISON (Actual vs Interpolated)', 35 + evalW + 10, y + 3, { width: evalW - 10 });
    doc.font('Helvetica').fontSize(7).fill('#334155');
    const simpRows = [
      ['Actual Consumed (MT)', fmt(totFO)],
      ['Guaranteed Consumption (MT)', fmt(totGuar)],
      ['Excess (MT)', fmt(simpleExcess), simpleExcess > 0 ? '#DC2626' : '#16A34A'],
      ['Excluded FO Adjustment (MT)', fmt(simpleExclFO)],
      ['Reimbursable Excess (MT)', fmt(simpleReimb), simpleReimb > 0 ? '#DC2626' : '#16A34A'],
      ['HFO Price ($/MT)', hfoPrice > 0 ? '$' + hfoPrice : 'Not set'],
      ['Reimbursable Cost ($)', fmtC(simpleCost), simpleCost > 0 ? '#DC2626' : '#16A34A'],
    ];
    simpRows.forEach((r, i) => {
      const ry = y + 18 + i * 13;
      doc.fill('#334155').font('Helvetica').text(r[0], 35 + evalW + 10, ry, { width: evalW * 0.6 });
      doc.fill(r[2] || '#334155').font('Helvetica-Bold').text(r[1], 35 + evalW + 10 + evalW * 0.55, ry, { width: evalW * 0.35, align: 'right' });
    });

    // ── CII Section ──────────────────────────────────────────────────────────
    if (calc.cii_attained && calc.cii_required && calc.cii_bounds) {
      doc.addPage();
      y = 30;
      const ratingColors = { A: '#059669', B: '#0891B2', C: '#D97706', D: '#EA580C', E: '#DC2626' };
      const rColor = ratingColors[calc.cii_rating] || '#94A3B8';

      // CII Header
      doc.fill('#0F172A').rect(0, 0, pageW + 60, 50).fill();
      doc.fill('#F8FAFC').fontSize(13).font('Helvetica-Bold').text('CII — Carbon Intensity Indicator', 30, 18);
      doc.fill('#94A3B8').fontSize(7).font('Helvetica').text(`IMO MEPC.352(78) · ${voyage.vessel_name} · ${voyage.voyage_number}`, 30, 35);
      y = 65;

      // CII KPI row
      const kpiW = (pageW - 30) / 4;
      const kpis = [
        { l: 'Attained CII', v: Number(calc.cii_attained).toFixed(2), c: rColor },
        { l: 'CII Rating', v: calc.cii_rating, c: rColor },
        { l: 'Required CII', v: Number(calc.cii_required).toFixed(2), c: '#94A3B8' },
        { l: 'Total CO₂ (MT)', v: Number(calc.cii_total_co2).toFixed(1), c: '#67E8F9' },
      ];
      kpis.forEach((k, i) => {
        const kx = 30 + i * kpiW;
        doc.fill('#1E293B').rect(kx, y, kpiW - 6, 45).fill();
        doc.fill('#64748B').fontSize(6).font('Helvetica').text(k.l.toUpperCase(), kx + 6, y + 8, { width: kpiW - 12 });
        doc.fill(k.c).fontSize(14).font('Helvetica-Bold').text(k.v, kx + 6, y + 19, { width: kpiW - 12 });
      });
      y += 55;

      // Rating boundaries
      doc.fill('#1E293B').rect(30, y, pageW - 30, 18).fill();
      const bands = [
        { l: 'A', c: '#059669' }, { l: 'B', c: '#0891B2' }, { l: 'C', c: '#D97706' },
        { l: 'D', c: '#EA580C' }, { l: 'E', c: '#DC2626' }
      ];
      const bw = (pageW - 30) / 5;
      bands.forEach((b, i) => {
        doc.fill(b.c).rect(30 + i * bw, y, bw, 18).fill();
        doc.fill('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(b.l, 30 + i * bw + bw / 2 - 3, y + 5);
      });
      y += 26;

      // Boundary labels
      const boundVals = [
        `≤ ${Number(calc.cii_bounds.A).toFixed(2)}`,
        `≤ ${Number(calc.cii_bounds.B).toFixed(2)}`,
        `≤ ${Number(calc.cii_bounds.C).toFixed(2)}`,
        `≤ ${Number(calc.cii_bounds.D).toFixed(2)}`,
        `> ${Number(calc.cii_bounds.D).toFixed(2)}`
      ];
      boundVals.forEach((v, i) => {
        doc.fill('#64748B').fontSize(6).font('Helvetica').text(v, 30 + i * bw, y, { width: bw, align: 'center' });
      });
      y += 18;

      // CII parameters
      const paramRows = [
        ['Ship Type', 'LNG Carrier'],
        ['DWT', Number(calc.cii_dwt).toLocaleString() + ' MT'],
        ['Reference CII', Number(calc.cii_ref).toFixed(3)],
        ['Reduction Factor', calc.cii_reduction_pct + '%'],
        ['Required CII', Number(calc.cii_required).toFixed(3)],
        ['CF (HFO)', String(calc.cii_cf_hfo)],
        ['CF (LNG/FOE)', String(calc.cii_cf_foe)],
        ['Total Distance', Number(calc.cii_total_dist).toLocaleString() + ' NM'],
      ];
      const halfW = (pageW - 30) / 2 - 6;
      paramRows.forEach((row, i) => {
        const col = i % 2;
        const px = 30 + col * (halfW + 12);
        if (col === 0 && i > 0) y += 13;
        doc.fill('#1E293B').rect(px, y, halfW, 12).fill();
        doc.fill('#64748B').fontSize(6.5).font('Helvetica').text(row[0], px + 5, y + 3, { width: halfW * 0.55 });
        doc.fill('#E2E8F0').fontSize(6.5).font('Helvetica-Bold').text(row[1], px + halfW * 0.55, y + 3, { width: halfW * 0.42, align: 'right' });
      });
      y += 22;

      // Daily CII table
      if (calc.cii_daily && calc.cii_daily.length > 0) {
        doc.fill('#0F172A').rect(30, y, pageW - 30, 13).fill();
        const ciiCols = [
          { h: 'Day', w: 22, align: 'center' },
          { h: 'Date', w: 42, align: 'left' },
          { h: 'HFO', w: 30, align: 'right' },
          { h: 'FOE', w: 30, align: 'right' },
          { h: 'Dist NM', w: 35, align: 'right' },
          { h: 'Daily CO2', w: 40, align: 'right' },
          { h: 'Daily CII', w: 35, align: 'right' },
          { h: 'Cum CO2', w: 40, align: 'right' },
          { h: 'Run CII', w: 35, align: 'right' },
          { h: 'Rating', w: 28, align: 'center' },
        ];
        let cx = 32;
        ciiCols.forEach(col => {
          doc.fill('#94A3B8').fontSize(6).font('Helvetica-Bold').text(col.h, cx, y + 4, { width: col.w, align: col.align });
          cx += col.w;
        });
        y += 14;

        calc.cii_daily.forEach((r, ri) => {
          if (y > 740) { doc.addPage(); y = 30; }
          const rc = ri % 2 === 0 ? '#0F172A' : '#141E2E';
          doc.fill(rc).rect(30, y, pageW - 30, 11).fill();
          cx = 32;
          const ratingColor = ratingColors[r.running_rating] || '#94A3B8';
          const rowData = [
            { v: String(r.day), align: 'center', c: '#FBBF24' },
            { v: r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '', align: 'left', c: '#94A3B8' },
            { v: Number(r.hfo||0).toFixed(1), align: 'right', c: '#CBD5E1' },
            { v: Number(r.foe||0).toFixed(2), align: 'right', c: '#CBD5E1' },
            { v: Math.round(r.dist||0).toString(), align: 'right', c: '#CBD5E1' },
            { v: Number(r.daily_co2||0).toFixed(1), align: 'right', c: '#94A3B8' },
            { v: Number(r.daily_cii||0).toFixed(2), align: 'right', c: '#CBD5E1' },
            { v: Number(r.cum_co2||0).toFixed(1), align: 'right', c: '#64748B' },
            { v: Number(r.running_cii||0).toFixed(2), align: 'right', c: ratingColor },
            { v: r.running_rating || '', align: 'center', c: ratingColor },
          ];
          rowData.forEach((cell, ci) => {
            doc.fill(cell.c).fontSize(6).font(ci === 9 ? 'Helvetica-Bold' : 'Helvetica')
               .text(cell.v, cx, y + 3, { width: ciiCols[ci].w, align: cell.align });
            cx += ciiCols[ci].w;
          });
          y += 11;
        });

        // CII totals row
        doc.fill('#1E293B').rect(30, y, pageW - 30, 13).fill();
        const totData = [
          { v: 'TOTAL', align: 'center', c: '#94A3B8', w: 22 },
          { v: '', align: 'left', c: '#94A3B8', w: 42 },
          { v: Number(calc.total_hfo||0).toFixed(1), align: 'right', c: '#FBBF24', w: 30 },
          { v: Number(calc.total_foe||0).toFixed(2), align: 'right', c: '#FBBF24', w: 30 },
          { v: Math.round(calc.cii_total_dist||0).toString(), align: 'right', c: '#FBBF24', w: 35 },
          { v: Number(calc.cii_total_co2||0).toFixed(1), align: 'right', c: '#FBBF24', w: 40 },
          { v: '', align: 'right', c: '#94A3B8', w: 35 },
          { v: '', align: 'right', c: '#94A3B8', w: 40 },
          { v: Number(calc.cii_attained||0).toFixed(2), align: 'right', c: rColor, w: 35 },
          { v: calc.cii_rating, align: 'center', c: rColor, w: 28 },
        ];
        cx = 32;
        totData.forEach(cell => {
          doc.fill(cell.c).fontSize(6.5).font('Helvetica-Bold').text(cell.v, cx, y + 4, { width: cell.w, align: cell.align });
          cx += cell.w;
        });
        y += 20;
      }
    }

    // Footer
    y += 14 + 7 * 13 + 15;
    doc.fill('#94A3B8').fontSize(6).font('Helvetica').text(`Generated: ${new Date().toISOString().slice(0, 19)} · FORCAP Fleet Management System`, 30, Math.min(y, 555), { width: pageW, align: 'center' });

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
