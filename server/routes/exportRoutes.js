const express = require('express');
const { pool } = require('../db');
const PDFDocument = require('pdfkit');
const https = require('https');
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

const fmt  = (n, d = 2) => Number(n || 0).toFixed(d);
const fmt0 = n => fmt(n, 0);
const fmtC = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// ── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W  = 842;         // A4 landscape width (pt)
const PAGE_H  = 595;         // A4 landscape height (pt)
const MARGIN  = 30;
const CONTENT = PAGE_W - MARGIN * 2;  // 782
const FOOTER_H = 20;
const CONTENT_BOTTOM = PAGE_H - MARGIN - FOOTER_H;  // 545 — safe bottom

// ── Header / Footer helpers ───────────────────────────────────────────────────
function drawPageHeader(doc, voyageName, pageLabel) {
  // Dark bar
  doc.fill('#1E293B').rect(MARGIN, MARGIN, CONTENT, 36).fill();
  // FORCAP brand left
  doc.fill('#F59E0B').fontSize(9).font('Helvetica-Bold')
     .text('FORCAP', MARGIN + 8, MARGIN + 6, { lineBreak: false });
  doc.fill('#94A3B8').fontSize(6).font('Helvetica')
     .text('Fleet Operations, Risk, Compliance & Audit Platform', MARGIN + 8, MARGIN + 18, { lineBreak: false });
  // Voyage info centre
  doc.fill('#E2E8F0').fontSize(8).font('Helvetica-Bold')
     .text(voyageName, MARGIN + 200, MARGIN + 8, { width: 340, align: 'center', lineBreak: false });
  doc.fill('#94A3B8').fontSize(6).font('Helvetica')
     .text(pageLabel, MARGIN + 200, MARGIN + 20, { width: 340, align: 'center', lineBreak: false });
  // NSML logo — embed from server assets
  try {
    const path = require('path');
    const fs = require('fs');
    const logoPath = path.join(__dirname, '../assets/nsml_logo.jpg');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, PAGE_W - MARGIN - 70, MARGIN + 2, { height: 32, fit: [70, 32] });
    }
  } catch(e) {
    // fallback text if image fails
    doc.fill('#003087').rect(PAGE_W - MARGIN - 70, MARGIN + 2, 66, 32).fill();
    doc.fill('#FFFFFF').fontSize(11).font('Helvetica-Bold')
       .text('NSML', PAGE_W - MARGIN - 66, MARGIN + 10, { width: 58, align: 'center', lineBreak: false });
  }
}

function drawPageFooter(doc, pageNum, totalPages) {
  const fy = PAGE_H - MARGIN - 12;
  doc.fill('#E2E8F0').rect(MARGIN, fy, CONTENT, 0.5).fill();
  // Left: FORCAP® 2026
  doc.fill('#64748B').fontSize(6).font('Helvetica')
     .text('FORCAP\xAE 2026  \u2014  Confidential \u2014 For Internal Use Only', MARGIN, fy + 4, { lineBreak: false });
  // Right: page number
  doc.fill('#64748B').fontSize(6).font('Helvetica')
     .text(`Page ${pageNum} of ${totalPages}`, MARGIN, fy + 4, { width: CONTENT, align: 'right', lineBreak: false });
}

router.get('/:voyageId/pdf', authFromQuery, async (req, res) => {
  try {
    const voy = await pool.query('SELECT * FROM voyages WHERE id=$1', [req.params.voyageId]);
    if (!voy.rows.length) return res.status(404).json({ error: 'Not found' });
    const voyage = voy.rows[0];
    const reports = (await pool.query('SELECT * FROM noon_reports WHERE voyage_id=$1 ORDER BY day_number', [req.params.voyageId])).rows;

    const vesselR = await pool.query('SELECT * FROM lng_vessels WHERE name=$1', [voyage.vessel_name]);
    const vessel  = vesselR.rows[0];

    const legType = (voyage.leg_type || 'BALLAST').toUpperCase();
    let curve = [];
    if (vessel) {
      const curveR = await pool.query('SELECT speed, fuel FROM interpolation_curves WHERE vessel_class=$1 AND leg_type=$2 ORDER BY speed', [vessel.vessel_class, legType]);
      curve = curveR.rows.map(r => ({ speed: parseFloat(r.speed), fuel: parseFloat(r.fuel) }));
    }

    const exclR = await pool.query('SELECT name, excluded FROM exclusion_items');
    const exclMap = {};
    exclR.rows.forEach(e => { exclMap[e.name.toUpperCase()] = e.excluded; });

    // ── Process reports ───────────────────────────────────────────────────────
    let totHrs=0, totDist=0, totHFO=0, totFOE=0, totFO=0, totGuar=0;
    let exclTime=0, exclHFO=0, exclFO=0, exclDist=0;
    const processed = reports.map(r => {
      const hrs   = parseFloat(r.steaming_hours) || 0;
      const dist  = parseFloat(r.distance_nm)    || 0;
      const hfo   = parseFloat(r.hfo_consumed)   || 0;
      const foe   = parseFloat(r.foe_consumed)   || 0;
      const total = hfo + foe;
      const speed = hrs > 0 ? dist / hrs : 0;
      const guar  = interpolateFuel(curve, speed);
      const diff  = guar - total;
      const wKey  = (r.weather_condition || '').toUpperCase().trim();
      const excl  = exclMap[wKey] || false;
      totHrs+=hrs; totDist+=dist; totHFO+=hfo; totFOE+=foe; totFO+=total; totGuar+=guar;
      if (excl) { exclTime+=hrs; exclHFO+=hfo; exclFO+=total; exclDist+=dist; }
      return { ...r, hrs, dist, hfo, foe, total, speed, guar, diff, excl };
    });

    // ── Passage calcs ─────────────────────────────────────────────────────────
    const faop     = voyage.faop_time ? new Date(voyage.faop_time) : null;
    const eosp     = voyage.eosp_time ? new Date(voyage.eosp_time) : null;
    const passDays = faop && eosp ? (eosp - faop) / (1000*60*60*24) : 0;
    const passHrs  = passDays * 24;

    const capacity  = vessel ? parseFloat(vessel.capacity_m3) : 0;
    const foeFactor = vessel ? parseFloat(vessel.foe_factor)  : 0.484;
    const boilRate  = vessel ? (legType==='LADEN' ? parseFloat(vessel.laden_boiloff_pct) : parseFloat(vessel.ballast_boiloff_pct)) / 100 : 0;
    const gaugAfterM3  = parseFloat(voyage.gauging_after_m3)  || 0;
    const gaugBeforeM3 = parseFloat(voyage.gauging_before_m3) || 0;
    const boilConsumed = gaugAfterM3 - gaugBeforeM3;
    const passFOE      = (boilConsumed - boilConsumed * 0.005) * foeFactor;

    const netHrs      = totHrs - exclTime;
    const netDist     = totDist - exclDist;
    const netHFO      = totHFO - exclHFO;
    const avgSpeed    = netHrs > 0 ? netDist / netHrs : 0;
    const guarDaily   = interpolateFuel(curve, avgSpeed);
    const guarPassFuel= guarDaily * (netHrs / 24);

    const harbourBefore  = faop && voyage.gauging_after_time  ? Math.abs((faop - new Date(voyage.gauging_after_time))  / (1000*60*60*24)) : 0;
    const harbourAfter   = eosp && voyage.gauging_before_time ? Math.abs((new Date(voyage.gauging_before_time) - eosp) / (1000*60*60*24)) : 0;
    const totalHarbour   = harbourBefore + harbourAfter;
    const totalExclDays  = (exclTime / 24) + totalHarbour;
    const actualDailyFOE = passDays > 0 ? passFOE / passDays : 0;
    const netFOE         = passFOE - (totalExclDays * actualDailyFOE);
    const netTotal       = netHFO + netFOE;
    const excess         = netTotal - guarPassFuel;
    const hfoPrice       = parseFloat(voyage.hfo_price) || 0;
    const excessCost     = excess * hfoPrice;

    const simpleExcess  = totFO - totGuar;
    const simpleExclFO  = exclFO - processed.filter(r=>r.excl).reduce((s,r)=>s+r.guar,0);
    const simpleReimb   = simpleExcess - simpleExclFO;
    const simpleCost    = simpleReimb * hfoPrice;

    // ── CII calc ──────────────────────────────────────────────────────────────
    const ciiDwt   = vessel ? parseFloat(vessel.dwt) || 0 : 0;
    const ciiCfHfo = vessel ? parseFloat(vessel.cf_hfo) || 3.114 : 3.114;
    const ciiCfFoe = vessel ? parseFloat(vessel.cf_foe) || 2.750 : 2.750;
    const ciiRef   = 9.827;
    const ciiYear  = new Date().getFullYear();
    const ciiZ     = ({2023:5,2024:5,2025:7,2026:9,2027:11,2028:11,2029:11,2030:11})[ciiYear] || 9;
    const ciiRequired = ciiRef * (1 - ciiZ / 100);
    const ciiBounds   = { A: ciiRequired*0.82, B: ciiRequired*0.93, C: ciiRequired*1.14, D: ciiRequired*1.34 };
    const getCiiRating = v => v<=ciiBounds.A?'A':v<=ciiBounds.B?'B':v<=ciiBounds.C?'C':v<=ciiBounds.D?'D':'E';

    let cumCO2=0, cumDist2=0;
    processed.forEach(r => { cumCO2 += (r.hfo*ciiCfHfo)+(r.foe*ciiCfFoe); cumDist2 += r.dist; });
    const ciiAttained = cumDist2>0 ? (cumCO2*1000000)/(ciiDwt*cumDist2) : 0;
    const ciiRating   = getCiiRating(ciiAttained);

    // ── Page count estimate (reports per page) ────────────────────────────────
    const REPORT_START_Y  = 100;  // y after header + voyage info
    const ROW_H           = 12;
    const TABLE_HDR_H     = 16;
    const ROWS_PER_PAGE   = Math.floor((CONTENT_BOTTOM - REPORT_START_Y - TABLE_HDR_H) / ROW_H); // ~36
    const reportPages     = Math.ceil(processed.length / ROWS_PER_PAGE);
    const summaryPages    = 1;
    const ciiPages        = ciiDwt > 0 ? 1 : 0;
    const totalPages      = reportPages + summaryPages + ciiPages;

    const voyageName = `${voyage.vessel_name}  ·  Voy ${voyage.voyage_number}  ·  ${legType}`;

    // ── Build PDF ─────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', layout: 'landscape', autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Excess_Fuel_${voyage.voyage_number.replace(/\//g,'_')}.pdf`);
    doc.pipe(res);

    let currentPage = 0;
    function newPage(label) {
      currentPage++;
      doc.addPage();
      drawPageHeader(doc, voyageName, label);
      drawPageFooter(doc, currentPage, totalPages);
      return REPORT_START_Y; // return starting y for content
    }

    // ── PAGE 1+: NOON REPORTS ─────────────────────────────────────────────────
    const cols = [
      { h:'Day',   w:26, a:'right'  },
      { h:'Date',  w:54, a:'left'   },
      { h:'Hrs',   w:30, a:'right'  },
      { h:'Revs',  w:40, a:'right'  },
      { h:'Dist',  w:34, a:'right'  },
      { h:'HFO',   w:32, a:'right'  },
      { h:'FOE',   w:40, a:'right'  },
      { h:'Total', w:42, a:'right'  },
      { h:'Speed', w:34, a:'right'  },
      { h:'Guar.', w:38, a:'right'  },
      { h:'Diff',  w:38, a:'right'  },
      { h:'X',     w:16, a:'center' },
      { h:'Weather / Remarks', w:186, a:'left' },
      { h:'Slip',  w:34, a:'right'  },
    ];

    let y = newPage('NOON REPORTS — Excess Fuel Calculation');

    // Table header
    doc.fill('#1E293B').rect(MARGIN, y, CONTENT, TABLE_HDR_H).fill();
    let x = MARGIN + 4;
    doc.fill('#F59E0B').fontSize(6).font('Helvetica-Bold');
    cols.forEach(c => {
      doc.text(c.h, x, y + 5, { width: c.w, align: c.a, lineBreak: false });
      x += c.w + 1;
    });
    y += TABLE_HDR_H;

    // Data rows
    processed.forEach((r, i) => {
      if (y + ROW_H > CONTENT_BOTTOM) {
        y = newPage('NOON REPORTS (continued)');
        // Repeat table header
        doc.fill('#1E293B').rect(MARGIN, y, CONTENT, TABLE_HDR_H).fill();
        x = MARGIN + 4;
        doc.fill('#F59E0B').fontSize(6).font('Helvetica-Bold');
        cols.forEach(c => { doc.text(c.h, x, y + 5, { width: c.w, align: c.a, lineBreak: false }); x += c.w + 1; });
        y += TABLE_HDR_H;
      }
      const bg = r.excl ? '#FEF2F2' : (i % 2 === 0 ? '#F8FAFC' : '#FFFFFF');
      doc.fill(bg).rect(MARGIN, y, CONTENT, ROW_H).fill();

      const slip = vessel?.pitch && r.hrs > 0 ? (((r.total_revs * parseFloat(vessel.pitch)) / 1800) - r.dist) / 100 : 0;
      const weatherRem = [r.weather_condition, r.remarks].filter(Boolean).join(' — ').slice(0, 55);
      const vals = [
        r.day_number,
        r.report_date ? new Date(r.report_date).toISOString().slice(0,10) : '',
        fmt(r.hrs, 1), fmt0(r.total_revs), fmt0(r.dist),
        fmt(r.hfo, 1), fmt(r.foe), fmt(r.total),
        fmt(r.speed, 1), fmt(r.guar),
        (r.diff >= 0 ? '+' : '') + fmt(r.diff),
        r.excl ? 'X' : '',
        weatherRem,
        fmt(slip, 2),
      ];

      x = MARGIN + 4;
      doc.fontSize(6).font('Helvetica');
      vals.forEach((v, vi) => {
        const isExcl  = vi === 11 && r.excl;
        const isDiff  = vi === 10;
        const color   = isDiff ? (r.diff >= 0 ? '#16A34A' : '#DC2626') : isExcl ? '#DC2626' : '#334155';
        doc.fill(color).text(String(v), x, y + 3, { width: cols[vi].w, align: cols[vi].a, lineBreak: false });
        x += cols[vi].w + 1;
      });
      y += ROW_H;
    });

    // Totals row
    doc.fill('#1E293B').rect(MARGIN, y, CONTENT, 14).fill();
    const totVals = ['', 'TOTALS', fmt(totHrs,1), '', fmt0(totDist), fmt(totHFO,1), fmt(totFOE), fmt(totFO), '', fmt(totGuar), (totFO-totGuar>=0?'+':'')+fmt(totFO-totGuar), '', '', ''];
    x = MARGIN + 4;
    doc.fill('#F59E0B').fontSize(6).font('Helvetica-Bold');
    totVals.forEach((v, vi) => { doc.text(String(v), x, y + 4, { width: cols[vi].w, align: cols[vi].a, lineBreak: false }); x += cols[vi].w + 1; });
    y += 18;

    // ── SUMMARY PAGE ─────────────────────────────────────────────────────────
    y = newPage('VOYAGE SUMMARY — FOE / Boil-Off & Passage Evaluation');

    // Three info boxes row 1
    const boxW = (CONTENT - 16) / 3;
    const drawBox = (bx, by, title, rows, accentColor) => {
      const bh = 14 + rows.length * 13;
      doc.fill('#F8FAFC').rect(bx, by, boxW, bh).fill();
      doc.fill(accentColor || '#1E293B').rect(bx, by, boxW, 14).fill();
      doc.fill('#FBBF24').fontSize(7).font('Helvetica-Bold')
         .text(title, bx+5, by+4, { width: boxW-10, lineBreak: false });
      rows.forEach((r, i) => {
        const ry = by + 17 + i * 13;
        doc.fill('#475569').fontSize(6.5).font('Helvetica')
           .text(r[0], bx+5, ry, { width: boxW*0.58, lineBreak: false });
        doc.fill(r[2] || '#1E293B').fontSize(6.5).font('Helvetica-Bold')
           .text(r[1], bx + boxW*0.58, ry, { width: boxW*0.38, align:'right', lineBreak: false });
      });
      return bh;
    };

    const bh1 = drawBox(MARGIN,          y, 'PASSAGE DATA', [
      ['Passage Duration (Days)', fmt(passDays)],
      ['Passage Hours',           fmt(passHrs,1)],
      ['Total Distance (NM)',     fmt0(totDist)],
      ['Total HFO (MT)',          fmt(totHFO,1)],
      ['Total FOE (MT)',          fmt(totFOE)],
      ['Total FO (MT)',           fmt(totFO)],
    ]);
    drawBox(MARGIN + boxW + 8,  y, 'EXCLUSIONS', [
      ['Harbour Period (Days)',   fmt(totalHarbour,3)],
      ['Excluded Time (Hrs)',     fmt(exclTime,1)],
      ['Excluded HFO (MT)',       fmt(exclHFO,1)],
      ['Excluded FO (MT)',        fmt(exclFO)],
      ['Excluded Distance (NM)', fmt0(totDist - netDist)],
      ['Total Excl. (Days)',      fmt(totalExclDays,3)],
    ]);
    drawBox(MARGIN + (boxW+8)*2, y, 'FOE / BOIL-OFF', [
      ['Capacity (M³)',           fmt0(capacity)],
      ['Boil-off Rate (%/day)',   fmt(boilRate*100,2)+'%'],
      ['Gauging After (M³)',      fmt(gaugAfterM3,3)],
      ['Gauging Before (M³)',     fmt(gaugBeforeM3,3)],
      ['Boil-off Consumed (M³)', fmt(boilConsumed,3)],
      ['Passage FOE (MT)',        fmt(passFOE)],
    ]);
    y += bh1 + 12;

    // Evaluation boxes row 2
    const evalW = (CONTENT - 8) / 2;
    const drawEvalBox = (bx, by, title, rows, accent) => {
      const bh = 14 + rows.length * 14;
      doc.fill('#FFFBEB').rect(bx, by, evalW, bh).fill();
      doc.fill(accent || '#92400E').rect(bx, by, evalW, 14).fill();
      doc.fill('#FDE68A').fontSize(7.5).font('Helvetica-Bold')
         .text(title, bx+6, by+4, { width: evalW-12, lineBreak: false });
      rows.forEach((r, i) => {
        const ry = by + 18 + i * 14;
        doc.fill('#334155').fontSize(7).font('Helvetica')
           .text(r[0], bx+6, ry, { width: evalW*0.6, lineBreak: false });
        doc.fill(r[2] || '#334155').font('Helvetica-Bold')
           .text(r[1], bx + evalW*0.6, ry, { width: evalW*0.36, align:'right', lineBreak: false });
      });
      return bh;
    };

    const red='#DC2626', grn='#16A34A';
    drawEvalBox(MARGIN, y, 'PASSAGE EVALUATION (Speed-Based)', [
      ['Average Speed (Knots)',          fmt(avgSpeed,2)],
      ['Guaranteed Daily Fuel (MT/day)', fmt(guarDaily)],
      ['Net Duration (Hrs)',             fmt(netHrs,1)],
      ['Guaranteed Passage Fuel (MT)',   fmt(guarPassFuel)],
      ['Net Passage Fuel (MT)',          fmt(netTotal)],
      ['Excess Fuel (MT)',               fmt(excess),   excess>0?red:grn],
      ['Reimbursable Excess (MT)',       fmt(excess),   excess>0?red:grn],
      ['HFO Price ($/MT)',               hfoPrice>0?'$'+hfoPrice+'/MT':'Not set'],
      ['Excess Cost',                    fmtC(excessCost), excessCost>0?red:grn],
    ]);
    drawEvalBox(MARGIN + evalW + 8, y, 'SIMPLE COMPARISON (Actual vs Guaranteed)', [
      ['Actual FO Consumed (MT)',   fmt(totFO)],
      ['Guaranteed FO (MT)',        fmt(totGuar)],
      ['Simple Excess (MT)',        fmt(simpleExcess),  simpleExcess>0?red:grn],
      ['Excluded FO (MT)',          fmt(exclFO)],
      ['Excl. Guaranteed (MT)',     fmt(exclFO - simpleExclFO - simpleExclFO + exclFO)],
      ['Reimbursable Excess (MT)', fmt(simpleReimb),   simpleReimb>0?red:grn],
      ['HFO Price ($/MT)',          hfoPrice>0?'$'+hfoPrice+'/MT':'Not set'],
      ['',                          ''],
      ['Reimbursable Cost',         fmtC(simpleCost),   simpleCost>0?red:grn],
    ]);

    // ── CII PAGE ──────────────────────────────────────────────────────────────
    if (ciiDwt > 0) {
      y = newPage('CII — Carbon Intensity Indicator  ·  IMO MEPC.352(78)');

      const ratingColors = { A:'#059669', B:'#0891B2', C:'#D97706', D:'#EA580C', E:'#DC2626' };
      const rColor = ratingColors[ciiRating] || '#94A3B8';

      // KPI cards
      const kpiW = (CONTENT) / 4;
      const kpis = [
        { l:'Attained CII',    v:Number(ciiAttained).toFixed(2), c:rColor    },
        { l:'CII Rating',      v:ciiRating,                      c:rColor    },
        { l:'Required CII',    v:Number(ciiRequired).toFixed(2), c:'#94A3B8' },
        { l:`Total CO${'\u2082'} (MT)`, v:Number(cumCO2).toFixed(1), c:'#0891B2' },
      ];
      kpis.forEach((k, i) => {
        const kx = MARGIN + i * kpiW;
        doc.fill('#1E293B').rect(kx, y, kpiW - 4, 48).fill();
        doc.fill('#64748B').fontSize(6).font('Helvetica')
           .text(k.l.toUpperCase(), kx+6, y+8, { width: kpiW-14, lineBreak: false });
        doc.fill(k.c).fontSize(18).font('Helvetica-Bold')
           .text(k.v, kx+6, y+18, { width: kpiW-14, lineBreak: false });
      });
      y += 56;

      // Rating band bar
      const bw = CONTENT / 5;
      ['A','B','C','D','E'].forEach((l, i) => {
        const bc = { A:'#059669', B:'#0891B2', C:'#D97706', D:'#EA580C', E:'#DC2626' }[l];
        doc.fill(bc).rect(MARGIN + i*bw, y, bw, 20).fill();
        doc.fill('#FFFFFF').fontSize(9).font('Helvetica-Bold')
           .text(l, MARGIN + i*bw, y+6, { width: bw, align:'center', lineBreak: false });
      });
      y += 22;

      // Boundary labels
      const bLabels = [
        `\u2264 ${ciiBounds.A.toFixed(2)}`,
        `\u2264 ${ciiBounds.B.toFixed(2)}`,
        `\u2264 ${ciiBounds.C.toFixed(2)}`,
        `\u2264 ${ciiBounds.D.toFixed(2)}`,
        `> ${ciiBounds.D.toFixed(2)}`,
      ];
      bLabels.forEach((l, i) => {
        doc.fill('#64748B').fontSize(6).font('Helvetica')
           .text(l, MARGIN + i*bw, y, { width: bw, align:'center', lineBreak: false });
      });
      y += 16;

      // Parameter grid (2 columns, 4 rows)
      const paramHalfW = (CONTENT - 8) / 2;
      const params = [
        ['Ship Type',       'LNG Carrier'],
        ['DWT',             Number(ciiDwt).toLocaleString() + ' MT'],
        ['Reference CII',   Number(ciiRef).toFixed(3)],
        ['Reduction Factor', ciiZ + '%'],
        ['Required CII',    Number(ciiRequired).toFixed(3)],
        ['CF (HFO)',         String(ciiCfHfo)],
        ['CF (LNG/FOE)',     String(ciiCfFoe)],
        ['Total Distance',  Number(cumDist2).toLocaleString() + ' NM'],
      ];
      params.forEach((row, i) => {
        const col = i % 2;
        const px  = MARGIN + col * (paramHalfW + 8);
        if (col === 0 && i > 0) y += 13;
        doc.fill('#1E293B').rect(px, y, paramHalfW, 12).fill();
        doc.fill('#64748B').fontSize(6.5).font('Helvetica')
           .text(row[0], px+5, y+3, { width: paramHalfW*0.55, lineBreak: false });
        doc.fill('#E2E8F0').fontSize(6.5).font('Helvetica-Bold')
           .text(row[1], px + paramHalfW*0.55, y+3, { width: paramHalfW*0.42, align:'right', lineBreak: false });
      });
      y += 22;

      // Attained CII indicator line on the band
      const ciiRange  = ciiBounds.D * 1.5;
      const ciiPct    = Math.min(ciiAttained / ciiRange, 0.98);
      const indicatorX = MARGIN + ciiPct * CONTENT;
      doc.fill('#FFFFFF').rect(MARGIN, y, CONTENT, 12).fill();
      doc.fill(rColor).rect(MARGIN, y, CONTENT * ciiPct, 12).fill();
      doc.fill('#FFFFFF').fontSize(6).font('Helvetica-Bold')
         .text(`Attained: ${Number(ciiAttained).toFixed(2)}  (${ciiRating})`, MARGIN+4, y+3, { lineBreak: false });
      doc.fill('#64748B').fontSize(6).font('Helvetica')
         .text(`Required: ${Number(ciiRequired).toFixed(2)}`, MARGIN + CONTENT - 100, y+3, { lineBreak: false });
      y += 18;

      // Generated timestamp
      doc.fill('#94A3B8').fontSize(6).font('Helvetica')
         .text(`Generated: ${new Date().toISOString().slice(0,19)} UTC`, MARGIN, y+4, { lineBreak: false });
    }

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
