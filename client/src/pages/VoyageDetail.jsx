import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = n => fmt(n, 0);
const fmtUsd = n => '$' + fmt(n, 0);

export default function VoyageDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canReview = ['admin', 'superintendent'].includes(user?.role);
  const isManager = user?.role === 'manager';

  const [voyage, setVoyage] = useState(null);
  const [reports, setReports] = useState([]);
  const [calc, setCalc] = useState(null);
  const [exclusions, setExclusions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('reports');
  const [editRow, setEditRow] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); api.getExclusions().then(setExclusions); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const data = await api.getVoyage(id);
      setVoyage(data);
      setReports(data.reports || []);
      setCalc(data.calculation || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const weatherOptions = exclusions.map(e => e.name);

  const saveReport = async (report) => {
    setSaving(true);
    try {
      await api.saveReport(id, report);
      setEditRow(null); setNewRow(null);
      await loadAll();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const nextDayNum = reports.length > 0 ? Math.max(...reports.map(r => r.day_number)) + 1 : 1;
  const nextDate = reports.length > 0 ? (() => { const d = new Date(reports[reports.length - 1].report_date); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() : '';

  const startNewRow = () => {
    setNewRow({ day_number: nextDayNum, report_date: nextDate, steaming_hours: 24, total_revs: 0, distance_nm: 0, hfo_consumed: 0, foe_consumed: 0, weather_condition: '', remarks: '', excess_remarks: '' });
  };

  const calcError = calc?.error || null;
  const isFinalised = voyage?.status === 'finalised';
  const canEdit = !isManager && !isFinalised;
  const inp = "px-2 py-1 rounded bg-slate-800/50 border border-white/10 text-slate-200 text-xs text-right font-mono focus:outline-none focus:border-amber-600";
  const selInp = "px-2 py-1 rounded bg-slate-800/50 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-amber-600";

  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">Loading...</div>;
  if (!voyage) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">Voyage not found</div>;

  // Use calc-enriched reports if available, fall back to raw DB reports
  const processedReports = (calc?.reports?.length > 0) ? calc.reports : reports.map(r => ({
    ...r,
    total_fuel: (parseFloat(r.hfo_consumed)||0) + (parseFloat(r.foe_consumed)||0),
    avg_speed: (parseFloat(r.steaming_hours)||0) > 0 ? (parseFloat(r.distance_nm)||0) / (parseFloat(r.steaming_hours)||0) : 0,
    interpolated_fuel: 0,
    difference: 0,
    is_excluded: false,
    slip: 0,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{voyage.vessel_name} — {voyage.voyage_number}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${voyage.leg_type === 'LADEN' ? 'bg-blue-900/30 text-blue-300 border-blue-700/40' : 'bg-slate-700/30 text-slate-300 border-slate-600/40'}`}>{voyage.leg_type}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${isFinalised ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40' : 'bg-amber-900/30 text-amber-300 border-amber-700/40'}`}>{voyage.status}</span>
            <span className="text-xs text-slate-500">{voyage.discharge_port || voyage.loading_port}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <button onClick={() => nav(`/voyages/${id}/edit`)} className="px-3 py-1.5 rounded-lg text-xs text-amber-300 bg-amber-900/20 border border-amber-800/30">Edit Voyage</button>}
          {!isManager && !isFinalised && <button onClick={async () => { if (confirm('Finalise this voyage? This locks the calculation.')) { await api.finaliseVoyage(id); loadAll(); } }} className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800/30">Finalise</button>}
          {canReview && isFinalised && <button onClick={async () => { if (confirm('Unfinalise this voyage? This reopens it for editing.')) { await api.unfinaliseVoyage(id); loadAll(); } }} className="px-3 py-1.5 rounded-lg text-xs text-amber-300 bg-amber-900/20 border border-amber-800/30">Unfinalise</button>}
          {user?.role === 'admin' && <button onClick={async () => { if (!confirm(`Delete voyage ${voyage.voyage_number}? This removes all noon reports.`)) return; if (prompt('Type DELETE to confirm:') !== 'DELETE') return; try { await api.deleteVoyage(id); nav('/voyages'); } catch(e) { alert(e.message); } }} className="px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-900/20 border border-red-800/30">Delete</button>}
          <a href={api.getPdfUrl(id)} target="_blank" className="px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800/50 border border-white/10">📄 Export PDF</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1 mb-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {['reports', 'summary', 'foe', 'cii'].map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider"
            style={{ background: tab === t ? 'rgba(180,83,9,0.3)' : 'transparent', color: tab === t ? '#FBBF24' : '#94A3B8', border: tab === t ? '1px solid rgba(180,83,9,0.4)' : '1px solid transparent' }}>
            {t === 'reports' ? 'Noon Reports' : t === 'summary' ? 'Excess Fuel Summary' : t === 'foe' ? 'FOE / Boil-Off' : 'CII'}
          </button>
        ))}
      </div>

      {/* Calc error banner */}
      {calcError && (
        <div className="rounded-lg p-3 mb-4 bg-amber-900/20 border border-amber-700/40 text-amber-300 text-sm">
          ⚠ Calculation error: {calcError}. Noon reports shown without interpolation. Check vessel name matches LNG Vessels settings.
        </div>
      )}

      {/* NOON REPORTS TAB */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {canEdit && <div className="flex justify-end"><button onClick={startNewRow} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>+ Add Day</button></div>}

          <div className="rounded-xl border border-white/5 overflow-x-auto" style={{ background: 'var(--card-bg)' }}>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-white/6">
                {['Day', 'Date', 'Hrs', 'Revs', 'Dist (NM)', 'HFO (MT)', 'FOE (MT)', 'Total FO', 'Speed (kn)', 'Guar. FO', 'Diff', 'Status', 'Weather', 'Slip %', 'Remarks', ''].map(h => (
                  <th key={h} className="px-2 py-3 text-left text-[10px] text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {processedReports.map((r, i) => {
                  const isEditing = editRow === r.id;
                  const diffColor = r.difference > 0 ? '#34D399' : r.difference < -5 ? '#F87171' : '#FBBF24';
                  return (
                    <tr key={r.id || i} className={`border-b border-white/[0.03] ${r.is_excluded ? 'bg-red-900/5' : 'hover:bg-white/[0.02]'}`}>
                      <td className="px-2 py-2 font-mono text-amber-300">{r.day_number}</td>
                      <td className="px-2 py-2 text-slate-400">{r.report_date ? new Date(r.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</td>
                      <td className="px-2 py-2 font-mono text-right">{fmt(r.steaming_hours, 1)}</td>
                      <td className="px-2 py-2 font-mono text-right text-slate-500">{fmt0(r.total_revs)}</td>
                      <td className="px-2 py-2 font-mono text-right">{fmt0(r.distance_nm)}</td>
                      <td className="px-2 py-2 font-mono text-right">{fmt(r.hfo_consumed, 1)}</td>
                      <td className="px-2 py-2 font-mono text-right">{fmt(r.foe_consumed)}</td>
                      <td className="px-2 py-2 font-mono text-right font-semibold">{fmt(r.total_fuel)}</td>
                      <td className="px-2 py-2 font-mono text-right text-cyan-300">{fmt(r.avg_speed, 1)}</td>
                      <td className="px-2 py-2 font-mono text-right text-slate-500">{fmt(r.interpolated_fuel)}</td>
                      <td className="px-2 py-2 font-mono text-right font-semibold" style={{ color: diffColor }}>{r.difference > 0 ? '+' : ''}{fmt(r.difference)}</td>
                      <td className="px-2 py-2">{r.is_excluded ? <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-900/30 text-red-300">EXCL</span> : <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-900/30 text-emerald-300">OK</span>}</td>
                      <td className="px-2 py-2 text-[10px] text-slate-500 max-w-[80px] truncate">{r.weather_condition || ''}</td>
                      <td className="px-2 py-2 font-mono text-right text-slate-500">{fmt(r.slip)}</td>
                      <td className="px-2 py-2 text-[10px] text-slate-600 max-w-[100px] truncate">{r.remarks}</td>
                      <td className="px-2 py-2">{canEdit && <button onClick={() => setEditRow(editRow === r.id ? null : r.id)} className="text-[10px] text-amber-400">Edit</button>}</td>
                    </tr>
                  );
                })}
                {/* Inline edit row */}
                {editRow && (() => {
                  const r = reports.find(x => x.id === editRow);
                  if (!r) return null;
                  return <InlineEdit key="edit" report={r} weatherOptions={weatherOptions} inp={inp} selInp={selInp} saving={saving} onSave={saveReport} onCancel={() => setEditRow(null)} />;
                })()}
                {/* New row */}
                {newRow && <InlineEdit key="new" report={newRow} weatherOptions={weatherOptions} inp={inp} selInp={selInp} saving={saving} onSave={saveReport} onCancel={() => setNewRow(null)} isNew />}
              </tbody>
              <tfoot><tr className="border-t border-white/10 font-semibold">
                <td className="px-2 py-3" colSpan={2}>Totals</td>
                <td className="px-2 py-3 font-mono text-right">{fmt(calc?.passage_hours, 1)}</td>
                <td></td>
                <td className="px-2 py-3 font-mono text-right">{fmt0(calc?.total_distance)}</td>
                <td className="px-2 py-3 font-mono text-right">{fmt(calc?.total_hfo, 1)}</td>
                <td className="px-2 py-3 font-mono text-right">{fmt(calc?.total_foe)}</td>
                <td className="px-2 py-3 font-mono text-right text-amber-300">{fmt(calc?.total_fo)}</td>
                <td></td>
                <td className="px-2 py-3 font-mono text-right text-slate-500">{fmt(calc?.simple_guaranteed)}</td>
                <td className="px-2 py-3 font-mono text-right" style={{ color: (calc?.simple_excess || 0) > 0 ? '#F87171' : '#34D399' }}>{fmt(calc?.simple_excess)}</td>
                <td colSpan={5}></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {/* SUMMARY TAB */}
      {tab === 'summary' && calc && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { l: 'Passage Distance', v: `${fmt0(calc.total_distance)} NM`, c: '#67E8F9' },
              { l: 'Net Passage Fuel', v: `${fmt(calc.net_total_fuel)} MT`, c: '#FBBF24' },
              { l: 'Guaranteed Fuel', v: `${fmt(calc.guaranteed_passage_fuel)} MT`, c: '#34D399' },
              { l: 'Excess Fuel', v: `${fmt(calc.excess_fuel)} MT`, c: calc.excess_fuel > 0 ? '#F87171' : '#34D399' },
            ].map((k, i) => (
              <div key={i} className="rounded-xl p-5 border border-white/5" style={{ background: 'linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.7))' }}>
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">{k.l}</div>
                <div className="text-xl font-bold" style={{ color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Passage Evaluation */}
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-xl p-5 border border-white/5 space-y-3" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-sm font-semibold text-amber-300">Passage Data</h3>
              {[
                ['Passage Duration (Days)', fmt(calc.passage_days)],
                ['Passage Duration (Hrs)', fmt(calc.passage_hours, 1)],
                ['Total Distance (NM)', fmt0(calc.total_distance)],
                ['Total HFO (MT)', fmt(calc.total_hfo, 1)],
                ['Total FOE (MT)', fmt(calc.total_foe)],
                ['Total FO (MT)', fmt(calc.total_fo)],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
              ))}
            </div>

            <div className="rounded-xl p-5 border border-white/5 space-y-3" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-sm font-semibold text-amber-300">Exclusions</h3>
              {[
                ['Harbour Period (Days)', fmt(calc.harbour_days, 3)],
                ['Excluded Time (Hrs)', fmt(calc.excluded_time_hrs, 1)],
                ['Excluded HFO (MT)', fmt(calc.excluded_hfo, 1)],
                ['Excluded FO (MT)', fmt(calc.excluded_fo)],
                ['Excluded Distance (NM)', fmt0(calc.excluded_distance)],
                ['Total Exclusion (Days)', fmt(calc.total_exclusion_days, 3)],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
              ))}
            </div>
          </div>

          {/* Net passage and evaluation */}
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-xl p-5 border border-white/5 space-y-3" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-sm font-semibold text-amber-300">Net Passage (Less Exclusions)</h3>
              {[
                ['Net Duration (Hrs)', fmt(calc.net_hours, 1)],
                ['Net Distance (NM)', fmt0(calc.net_distance)],
                ['Net HFO (MT)', fmt(calc.net_hfo, 1)],
                ['Net FOE (MT)', fmt(calc.net_foe)],
                ['Net Total Fuel (MT)', fmt(calc.net_total_fuel)],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200 font-semibold">{v}</span></div>
              ))}
            </div>

            <div className="rounded-xl p-5 border border-amber-800/30 space-y-3" style={{ background: 'rgba(180,83,9,0.05)' }}>
              <h3 className="text-sm font-semibold text-amber-300">Passage Evaluation</h3>
              {[
                ['Average Speed (Knots)', fmt(calc.avg_speed, 2)],
                ['Guaranteed Daily Fuel (MT)', fmt(calc.guaranteed_daily)],
                ['Guaranteed Passage Fuel (MT)', fmt(calc.guaranteed_passage_fuel)],
                ['Calculated Excess Fuel (MT)', { v: fmt(calc.excess_fuel), c: calc.excess_fuel > 0 ? '#F87171' : '#34D399' }],
                ['Reimbursable Excess (MT)', { v: fmt(calc.reimbursable_excess), c: calc.reimbursable_excess > 0 ? '#F87171' : '#34D399' }],
                ['HFO Price ($/MT)', fmtUsd(calc.hfo_price)],
                ['Excess Cost', { v: fmtUsd(calc.excess_cost), c: calc.excess_cost > 0 ? '#F87171' : '#34D399' }],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-400">{l}</span>
                  {typeof v === 'object' ? <span className="font-mono font-bold" style={{ color: v.c }}>{v.v}</span> : <span className="font-mono text-slate-200 font-semibold">{v}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Simple comparison */}
          <div className="rounded-xl p-5 border border-white/5 space-y-3" style={{ background: 'var(--card-bg)' }}>
            <h3 className="text-sm font-semibold text-amber-300">Simple Comparison (Actual vs Interpolated)</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                ['Actual Consumed', fmt(calc.simple_actual) + ' MT', '#FBBF24'],
                ['Guaranteed Consumption', fmt(calc.simple_guaranteed) + ' MT', '#34D399'],
                ['Excess Fuel', fmt(calc.simple_excess) + ' MT', calc.simple_excess > 0 ? '#F87171' : '#34D399'],
              ].map(([l, v, c], i) => (
                <div key={i} className="rounded-lg p-3 bg-white/[0.03]">
                  <div className="text-[10px] text-slate-500 uppercase">{l}</div>
                  <div className="text-lg font-bold mt-1" style={{ color: c }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                ['Excluded FO', fmt(calc.simple_excl_fo) + ' MT', '#F59E0B'],
                ['Reimbursable Excess', fmt(calc.simple_reimbursable) + ' MT', calc.simple_reimbursable > 0 ? '#F87171' : '#34D399'],
                ['Reimbursable Cost', fmtUsd(calc.simple_cost), calc.simple_cost > 0 ? '#F87171' : '#34D399'],
              ].map(([l, v, c], i) => (
                <div key={i} className="rounded-lg p-3 bg-white/[0.03]">
                  <div className="text-[10px] text-slate-500 uppercase">{l}</div>
                  <div className="text-lg font-bold mt-1" style={{ color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FOE TAB */}
      {tab === 'foe' && calc && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-xl p-5 border border-white/5 space-y-3" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-sm font-semibold text-amber-300">Guaranteed FOE</h3>
              {[
                ['Vessel Capacity (M³)', fmt0(calc.vessel_capacity)],
                ['FOE Factor', fmt(calc.foe_factor, 3)],
                ['Boil-off Rate (%/day)', fmt(calc.boiloff_rate_pct, 2) + '%'],
                ['Daily Boil-off (M³)', fmt(calc.daily_boiloff_m3)],
                ['Daily FOE (MT)', fmt(calc.daily_foe)],
                ['Time Between Gaugings (Days)', fmt(calc.gauging_days, 3)],
                ['Guaranteed Total FOE (MT)', fmt(calc.guaranteed_total_foe)],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
              ))}
            </div>
            <div className="rounded-xl p-5 border border-white/5 space-y-3" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-sm font-semibold text-amber-300">Actual FOE (Boil-Off)</h3>
              {[
                ['Gauging After (M³)', fmt(calc.gauging_after_m3, 3)],
                ['Gauging Before (M³)', fmt(calc.gauging_before_m3, 3)],
                ['Boil-Off Consumed (M³)', fmt(calc.boiloff_consumed_m3, 3)],
                ['Nitrogen Compensation (M³)', fmt(calc.nitrogen_comp, 3)],
                ['Net Boil-Off (M³)', fmt(calc.net_boiloff_m3, 3)],
                ['Passage FOE (MT)', fmt(calc.passage_foe)],
                ['Actual Daily FOE (MT)', fmt(calc.actual_daily_foe)],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CII TAB */}
      {tab === 'cii' && calc && (
        <div className="space-y-6">
          {(calc.cii_error || !calc.cii_bounds) ? (
            <div className="rounded-xl p-5 border border-amber-800/30 bg-amber-900/10">
              <p className="text-sm text-amber-300">{calc.cii_error || calc.error || 'CII data unavailable'}</p>
              <p className="text-xs text-slate-500 mt-2">Ensure the vessel exists in LNG Vessels settings with DWT set, then re-open this voyage.</p>
            </div>
          ) : (
            <>
              {/* CII KPI Cards */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { l: 'Attained CII', v: fmt(calc.cii_attained, 2), c: calc.cii_rating === 'A' ? '#34D399' : calc.cii_rating === 'B' ? '#67E8F9' : calc.cii_rating === 'C' ? '#FBBF24' : calc.cii_rating === 'D' ? '#F97316' : '#F87171' },
                  { l: 'CII Rating', v: calc.cii_rating, c: calc.cii_rating === 'A' ? '#34D399' : calc.cii_rating === 'B' ? '#67E8F9' : calc.cii_rating === 'C' ? '#FBBF24' : calc.cii_rating === 'D' ? '#F97316' : '#F87171' },
                  { l: 'Required CII', v: fmt(calc.cii_required, 2), c: '#94A3B8' },
                  { l: 'Total CO₂ (MT)', v: fmt(calc.cii_total_co2, 1), c: '#67E8F9' },
                ].map((k, i) => (
                  <div key={i} className="rounded-xl p-5 border border-white/5" style={{ background: 'linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.7))' }}>
                    <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">{k.l}</div>
                    <div className="text-2xl font-bold" style={{ color: k.c }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* Rating Scale */}
              <div className="rounded-xl p-5 border border-white/5" style={{ background: 'var(--card-bg)' }}>
                <h3 className="text-sm font-semibold text-amber-300 mb-3">CII Rating Boundaries ({new Date().getFullYear()}, Reduction: {calc.cii_reduction_pct}%)</h3>
                <div className="flex gap-1 h-8 rounded-lg overflow-hidden mb-3">
                  {[
                    { l: 'A', c: '#059669', w: calc.cii_bounds.A },
                    { l: 'B', c: '#0891B2', w: calc.cii_bounds.B - calc.cii_bounds.A },
                    { l: 'C', c: '#D97706', w: calc.cii_bounds.C - calc.cii_bounds.B },
                    { l: 'D', c: '#EA580C', w: calc.cii_bounds.D - calc.cii_bounds.C },
                    { l: 'E', c: '#DC2626', w: 2 },
                  ].map((b, i) => (
                    <div key={i} className="flex items-center justify-center text-xs font-bold text-white" style={{ background: b.c, flex: 1 }}>{b.l}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {[
                    { l: 'A (Superior)', v: `\u2264 ${fmt(calc.cii_bounds.A, 2)}`, c: '#059669' },
                    { l: 'B (Good)', v: `\u2264 ${fmt(calc.cii_bounds.B, 2)}`, c: '#0891B2' },
                    { l: 'C (Acceptable)', v: `\u2264 ${fmt(calc.cii_bounds.C, 2)}`, c: '#D97706' },
                    { l: 'D (Corrective Plan)', v: `\u2264 ${fmt(calc.cii_bounds.D, 2)}`, c: '#EA580C' },
                    { l: 'E (Inferior)', v: `> ${fmt(calc.cii_bounds.D, 2)}`, c: '#DC2626' },
                  ].map((b, i) => (
                    <div key={i} className="text-[10px]"><span style={{ color: b.c }} className="font-semibold">{b.l}</span><br/><span className="text-slate-500">{b.v}</span></div>
                  ))}
                </div>
                <div className="flex justify-between mt-3 text-xs">
                  {[
                    ['Ship Type', 'LNG Carrier'],
                    ['DWT', fmt0(calc.cii_dwt) + ' MT'],
                    ['Reference CII', fmt(calc.cii_ref, 3)],
                    ['CF (HFO)', calc.cii_cf_hfo],
                    ['CF (LNG/FOE)', calc.cii_cf_foe],
                    ['Total Distance', fmt0(calc.cii_total_dist) + ' NM'],
                  ].map(([l, v], i) => (
                    <div key={i}><span className="text-slate-500">{l}: </span><span className="text-slate-300 font-mono">{v}</span></div>
                  ))}
                </div>
              </div>

              {/* Daily CII Table */}
              <div className="rounded-xl border border-white/5 overflow-x-auto" style={{ background: 'var(--card-bg)' }}>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-white/6">
                    {['Day', 'Date', 'HFO (MT)', 'FOE (MT)', 'Dist (NM)', 'Daily CO₂', 'Daily CII', 'Cum CO₂', 'Cum Dist', 'Running CII', 'Rating'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(calc.cii_daily || []).map((r, i) => {
                      const ratingColor = { A: '#34D399', B: '#67E8F9', C: '#FBBF24', D: '#F97316', E: '#F87171' };
                      return (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-3 py-2 font-mono text-amber-300">{r.day}</td>
                          <td className="px-3 py-2 text-slate-200">{r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</td>
                          <td className="px-3 py-2 font-mono text-right">{fmt(r.hfo, 1)}</td>
                          <td className="px-3 py-2 font-mono text-right">{fmt(r.foe)}</td>
                          <td className="px-3 py-2 font-mono text-right">{fmt0(r.dist)}</td>
                          <td className="px-3 py-2 font-mono text-right text-slate-400">{fmt(r.daily_co2, 1)}</td>
                          <td className="px-3 py-2 font-mono text-right">{fmt(r.daily_cii, 2)}</td>
                          <td className="px-3 py-2 font-mono text-right text-slate-500">{fmt(r.cum_co2, 1)}</td>
                          <td className="px-3 py-2 font-mono text-right text-slate-500">{fmt0(r.cum_dist)}</td>
                          <td className="px-3 py-2 font-mono text-right font-semibold" style={{ color: ratingColor[r.running_rating] || '#94A3B8' }}>{fmt(r.running_cii, 2)}</td>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ color: ratingColor[r.running_rating], background: ratingColor[r.running_rating] + '20' }}>{r.running_rating}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="border-t border-white/10 font-semibold">
                    <td className="px-3 py-3" colSpan={2}>Voyage Total</td>
                    <td className="px-3 py-3 font-mono text-right">{fmt(calc.total_hfo, 1)}</td>
                    <td className="px-3 py-3 font-mono text-right">{fmt(calc.total_foe)}</td>
                    <td className="px-3 py-3 font-mono text-right">{fmt0(calc.cii_total_dist)}</td>
                    <td className="px-3 py-3 font-mono text-right text-amber-300">{fmt(calc.cii_total_co2, 1)}</td>
                    <td colSpan={3}></td>
                    <td className="px-3 py-3 font-mono text-right font-bold" style={{ color: { A: '#34D399', B: '#67E8F9', C: '#FBBF24', D: '#F97316', E: '#F87171' }[calc.cii_rating] }}>{fmt(calc.cii_attained, 2)}</td>
                    <td className="px-3 py-3"><span className="px-2 py-1 rounded text-xs font-bold" style={{ color: { A: '#34D399', B: '#67E8F9', C: '#FBBF24', D: '#F97316', E: '#F87171' }[calc.cii_rating], background: ({ A: '#34D399', B: '#67E8F9', C: '#FBBF24', D: '#F97316', E: '#F87171' }[calc.cii_rating] || '') + '20' }}>{calc.cii_rating}</span></td>
                  </tr></tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Inline edit component for noon report rows
function InlineEdit({ report, weatherOptions, inp, selInp, saving, onSave, onCancel, isNew }) {
  const [r, setR] = useState({ ...report });
  const set = (k, v) => setR(prev => ({ ...prev, [k]: v }));
  return (
    <tr className="border-b border-amber-800/20 bg-amber-900/5">
      <td className="px-2 py-2"><input type="number" value={r.day_number} onChange={e => set('day_number', parseInt(e.target.value))} className={`${inp} w-10`} /></td>
      <td className="px-2 py-2"><input type="date" value={r.report_date?.slice?.(0, 10) || r.report_date} onChange={e => set('report_date', e.target.value)} className={`${selInp} w-28`} /></td>
      <td className="px-2 py-2"><input type="number" step="0.1" value={r.steaming_hours} onChange={e => set('steaming_hours', e.target.value)} className={`${inp} w-14`} /></td>
      <td className="px-2 py-2"><input type="number" value={r.total_revs} onChange={e => set('total_revs', e.target.value)} className={`${inp} w-16`} /></td>
      <td className="px-2 py-2"><input type="number" step="0.1" value={r.distance_nm} onChange={e => set('distance_nm', e.target.value)} className={`${inp} w-14`} /></td>
      <td className="px-2 py-2"><input type="number" step="0.1" value={r.hfo_consumed} onChange={e => set('hfo_consumed', e.target.value)} className={`${inp} w-14`} /></td>
      <td className="px-2 py-2"><input type="number" step="0.01" value={r.foe_consumed} onChange={e => set('foe_consumed', e.target.value)} className={`${inp} w-16`} /></td>
      <td colSpan={4}></td>
      <td className="px-2 py-2"><select value={r.weather_condition || ''} onChange={e => set('weather_condition', e.target.value)} className={`${selInp} w-32`}>
        <option value="">None</option>{weatherOptions.map(w => <option key={w} value={w}>{w}</option>)}
      </select></td>
      <td></td>
      <td className="px-2 py-2"><input value={r.remarks || ''} onChange={e => set('remarks', e.target.value)} className={`${selInp} w-24`} placeholder="Remarks" /></td>
      <td className="px-2 py-2 flex gap-1">
        <button onClick={() => onSave(r)} disabled={saving} className="px-2 py-0.5 rounded text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-800/30">{saving ? '...' : '✓'}</button>
        <button onClick={onCancel} className="px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800/30 border border-white/10">✕</button>
      </td>
    </tr>
  );
}
