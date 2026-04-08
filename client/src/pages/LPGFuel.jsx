import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';

const BASE = '/api';
const tok  = () => localStorage.getItem('fuel_token');
const apiFetch = (path, opts={}) =>
  fetch(BASE + path, { ...opts, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tok()}`, ...opts.headers } })
    .then(r => r.json());

const f2  = n => Number(n||0).toFixed(2);
const f1  = n => Number(n||0).toFixed(1);
const f0  = n => Math.round(Number(n||0)).toLocaleString();
const fmt = (n,d=2) => Number(n||0).toFixed(d);

const CARD  = 'rounded-xl p-4 border border-white/5 bg-slate-900/60';
const BTN   = 'px-4 py-2 rounded-lg text-sm font-semibold';
const AMBER = { background:'linear-gradient(135deg,#B45309,#D97706)' };
const INP   = 'px-2 py-1.5 rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600 w-full';

const RATING_COLOR = { A:'#059669', B:'0891B2', C:'#D97706', D:'#EA580C', E:'#DC2626' };
const rc = r => ({ A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626' }[r]||'#94A3B8');

// ── VOYAGE LIST ───────────────────────────────────────────────────────────────
export function LPGVoyageList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [voyages, setVoyages] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [vessel, setVessel]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/lpg/vessels').then(setVessels);
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = vessel ? `?vessel=${encodeURIComponent(vessel)}` : '';
    apiFetch(`/lpg/voyages${qs}`).then(v => { setVoyages(v); setLoading(false); });
  }, [vessel]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LPG Fuel Log</h1>
          <p className="text-sm text-slate-500 mt-1">Daily noon records — Alfred Temile fleet</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/lpg/dashboard')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>📊 Dashboard</button>
          {user?.role==='admin' && <button onClick={() => nav('/lpg/import')} className={`${BTN} text-white`} style={AMBER}>⬆ Import Excel</button>}
        </div>
      </div>

      {/* Vessel filter */}
      <div className="flex gap-2 flex-wrap">
        {['', ...vessels.map(v=>v.name)].map(v => (
          <button key={v||'all'} onClick={() => setVessel(v)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${vessel===v?'border-amber-600 bg-amber-900/30 text-amber-300':'border-white/10 text-slate-400 hover:border-white/20'}`}>
            {v||'All Vessels'}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { l:'Total Voyages', v:voyages.length, c:'#FBBF24' },
          { l:'Total Records', v:voyages.reduce((s,v)=>s+(v.record_count||0),0), c:'#67E8F9' },
          { l:'Vessels Active', v:new Set(voyages.map(v=>v.vessel_name)).size, c:'#34D399' },
        ].map((k,i) => (
          <div key={i} className={CARD}>
            <div className="text-xs text-slate-500 uppercase">{k.l}</div>
            <div className="text-2xl font-bold mt-1" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Voyage list */}
      {loading ? <div className="text-slate-500 text-sm">Loading...</div> : (
        <div className="space-y-2">
          {voyages.map(v => (
            <div key={v.id} onClick={() => nav(`/lpg/voyages/${v.id}`)}
              className="rounded-xl px-5 py-4 border border-white/5 hover:border-amber-800/30 cursor-pointer transition-all bg-slate-900/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-100">{v.vessel_name}</span>
                    <span className="text-xs font-mono text-amber-400">{v.voyage_number||'—'}</span>
                    <span className="text-xs font-mono text-emerald-400">{v.record_count} records</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {v.start_date?.slice(0,10)||'—'} → {v.end_date?.slice(0,10)||'—'}
                  </div>
                </div>
                <span className="text-xs text-slate-600">→</span>
              </div>
            </div>
          ))}
          {!voyages.length && <div className="text-slate-500 text-sm text-center py-8">No voyages found. Import an Excel file to get started.</div>}
        </div>
      )}
    </div>
  );
}

// ── VOYAGE DETAIL ─────────────────────────────────────────────────────────────
export function LPGVoyageDetail() {
  const { id } = useParams();
  const nav    = useNavigate();
  const { user } = useAuth();
  const [data, setData]   = useState(null);
  const [tab, setTab]     = useState('records');
  const [editId, setEditId] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiFetch(`/lpg/voyages/${id}`).then(d => { setData(d); setLoading(false); });
  };
  useEffect(load, [id]);

  const saveRecord = async (r) => {
    setSaving(true);
    try {
      if (r.id) { await apiFetch(`/lpg/records/${r.id}`, { method:'PUT', body:JSON.stringify(r) }); }
      else { await apiFetch('/lpg/records', { method:'POST', body:JSON.stringify({ ...r, voyage_id: id, vessel_name: data.vessel_name }) }); }
      setEditId(null); setNewRow(null); load();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const deleteRecord = async (rid) => {
    if (!confirm('Delete this record?')) return;
    await apiFetch(`/lpg/records/${rid}`, { method:'DELETE' });
    load();
  };

  const deleteVoyage = async () => {
    if (!confirm(`Delete entire voyage ${data.voyage_number}? This removes all ${data.records?.length} records.`)) return;
    if (prompt('Type DELETE to confirm') !== 'DELETE') return;
    await apiFetch(`/lpg/voyages/${id}`, { method:'DELETE' });
    nav('/lpg');
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">Loading...</div>;
  if (!data) return null;

  const records = data.records || [];
  const cii     = data.cii;
  const TABS    = ['records','fuel','cii'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{data.vessel_name} — {data.voyage_number||'No Voyage No.'}</h1>
          <div className="text-xs text-slate-500 mt-1">{data.start_date?.slice(0,10)} → {data.end_date?.slice(0,10)} · {records.length} records</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/lpg')} className={`${BTN} bg-slate-700/40 border border-white/10 text-slate-300 text-xs`}>← Back</button>
          <a href={`/api/lpg/voyages/${id}/pdf?token=${tok()}`} target="_blank"
            className={`${BTN} bg-slate-700/40 border border-white/10 text-slate-300 text-xs`}>📄 PDF</a>
          {user?.role==='admin' && <button onClick={deleteVoyage} className={`${BTN} bg-red-900/20 border border-red-800/30 text-red-400 text-xs`}>Delete</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1 mb-6" style={{background:'rgba(255,255,255,0.04)'}}>
        {[['records','Daily Records'],['fuel','Fuel Summary'],['cii','CII']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider"
            style={{background:tab===t?'rgba(180,83,9,0.3)':'transparent',color:tab===t?'#FBBF24':'#94A3B8',border:tab===t?'1px solid rgba(180,83,9,0.4)':'1px solid transparent'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── DAILY RECORDS TAB ── */}
      {tab==='records' && (
        <div className="space-y-3">
          {user?.role==='admin' && (
            <div className="flex justify-end">
              <button onClick={() => setNewRow({ record_date:'', time_utc:'1200', mode:'Noon', status:'AT SEA NOON', sea_hrs:24, total_hrs:24, ulsfo_me:0, ulsfo_ae:0, ulsfo_rob:0, lsmgo_total:0, lsmgo_rob:0, obs_dist:0, me_rpm:0 })}
                className={`${BTN} text-white text-sm`} style={AMBER}>+ Add Record</button>
            </div>
          )}
          <div className="rounded-xl border border-white/5 overflow-x-auto bg-slate-900/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  {['Date','Time','Status','Sea Hrs','Dist NM','RPM','ULSFO ME','ULSFO AE','ULSFO Tot','ULSFO ROB','LSMGO Tot','LSMGO ROB','Bnkr U','Cargo Hrs','Remarks',''].map(h => (
                    <th key={h} className="px-2 py-3 text-left text-[10px] text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r,i) => editId===r.id
                  ? <LPGInlineEdit key={r.id} record={r} onSave={saveRecord} onCancel={() => setEditId(null)} saving={saving}/>
                  : (
                  <tr key={r.id} className={`border-b border-white/[0.03] ${parseFloat(r.sea_hrs)>12?'':'bg-slate-800/20'} hover:bg-white/[0.02]`}>
                    <td className="px-2 py-2 font-mono text-amber-300 whitespace-nowrap">{r.record_date?.slice(0,10)}</td>
                    <td className="px-2 py-2 text-slate-500">{r.time_utc}</td>
                    <td className="px-2 py-2 text-slate-400 max-w-[120px] truncate">{r.status}</td>
                    <td className="px-2 py-2 font-mono text-right">{f1(r.sea_hrs)}</td>
                    <td className="px-2 py-2 font-mono text-right">{f1(r.obs_dist)}</td>
                    <td className="px-2 py-2 font-mono text-right text-slate-400">{f1(r.me_rpm)}</td>
                    <td className="px-2 py-2 font-mono text-right">{f2(r.ulsfo_me)}</td>
                    <td className="px-2 py-2 font-mono text-right">{f2(r.ulsfo_ae)}</td>
                    <td className="px-2 py-2 font-mono text-right font-semibold text-amber-300">{f2(parseFloat(r.ulsfo_me)+parseFloat(r.ulsfo_ae)+(parseFloat(r.ulsfo_blr)||0))}</td>
                    <td className="px-2 py-2 font-mono text-right text-cyan-300">{f2(r.ulsfo_rob)}</td>
                    <td className="px-2 py-2 font-mono text-right">{f2(r.lsmgo_total)}</td>
                    <td className="px-2 py-2 font-mono text-right text-cyan-300">{f2(r.lsmgo_rob)}</td>
                    <td className="px-2 py-2 font-mono text-right text-emerald-300">{parseFloat(r.ulsfo_bunkered)>0?f2(r.ulsfo_bunkered):''}</td>
                    <td className="px-2 py-2 font-mono text-right">{f1(r.cargo_plant_rhr)}</td>
                    <td className="px-2 py-2 text-[10px] text-slate-600 max-w-[100px] truncate">{r.status}</td>
                    <td className="px-2 py-2">
                      {user?.role==='admin' && (
                        <div className="flex gap-1">
                          <button onClick={() => setEditId(r.id)} className="text-[10px] text-amber-400">Edit</button>
                          <button onClick={() => deleteRecord(r.id)} className="text-[10px] text-red-500">Del</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {newRow && <LPGInlineEdit key="new" record={newRow} onSave={saveRecord} onCancel={() => setNewRow(null)} saving={saving} isNew/>}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 font-semibold text-xs">
                  <td className="px-2 py-3" colSpan={3}>Totals</td>
                  <td className="px-2 py-3 font-mono text-right">{f1(records.reduce((s,r)=>s+parseFloat(r.sea_hrs||0),0))}</td>
                  <td className="px-2 py-3 font-mono text-right">{f0(records.reduce((s,r)=>s+parseFloat(r.obs_dist||0),0))}</td>
                  <td></td>
                  <td className="px-2 py-3 font-mono text-right">{f2(records.reduce((s,r)=>s+parseFloat(r.ulsfo_me||0),0))}</td>
                  <td className="px-2 py-3 font-mono text-right">{f2(records.reduce((s,r)=>s+parseFloat(r.ulsfo_ae||0),0))}</td>
                  <td className="px-2 py-3 font-mono text-right text-amber-300">{f2(records.reduce((s,r)=>s+(parseFloat(r.ulsfo_me||0)+parseFloat(r.ulsfo_ae||0)+parseFloat(r.ulsfo_blr||0)),0))}</td>
                  <td></td>
                  <td className="px-2 py-3 font-mono text-right">{f2(records.reduce((s,r)=>s+parseFloat(r.lsmgo_total||0),0))}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── FUEL SUMMARY TAB ── */}
      {tab==='fuel' && (
        <div className="space-y-6">
          {/* KPI cards */}
          {(() => {
            const totUlsfoMe = records.reduce((s,r)=>s+parseFloat(r.ulsfo_me||0),0);
            const totUlsfoAe = records.reduce((s,r)=>s+parseFloat(r.ulsfo_ae||0),0);
            const totUlsfoBlr= records.reduce((s,r)=>s+parseFloat(r.ulsfo_blr||0),0);
            const totUlsfo   = totUlsfoMe + totUlsfoAe + totUlsfoBlr;
            const totLsmgo   = records.reduce((s,r)=>s+parseFloat(r.lsmgo_total||0),0);
            const totDist    = records.reduce((s,r)=>s+parseFloat(r.obs_dist||0),0);
            const seaDays    = records.filter(r=>parseFloat(r.sea_hrs)>12).length;
            const bnkrU      = records.reduce((s,r)=>s+parseFloat(r.ulsfo_bunkered||0),0);
            const bnkrL      = records.reduce((s,r)=>s+parseFloat(r.lsmgo_bunkered||0),0);
            const lastRob    = records.length ? records[records.length-1] : null;
            return (
              <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { l:'Total ULSFO', v:`${f2(totUlsfo)} MT`, c:'#FBBF24' },
                    { l:'Total LSMGO', v:`${f2(totLsmgo)} MT`, c:'#67E8F9' },
                    { l:'Total Distance', v:`${f0(totDist)} NM`, c:'#A78BFA' },
                    { l:'Sea Days', v:seaDays, c:'#34D399' },
                  ].map((k,i) => (
                    <div key={i} className={CARD}>
                      <div className="text-xs text-slate-500 uppercase">{k.l}</div>
                      <div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className={`${CARD} space-y-3`}>
                    <h3 className="text-sm font-semibold text-amber-300">ULSFO Breakdown</h3>
                    {[['ME Consumption',`${f2(totUlsfoMe)} MT`],['AE Consumption',`${f2(totUlsfoAe)} MT`],['Boiler Consumption',`${f2(totUlsfoBlr)} MT`],['Total ULSFO',`${f2(totUlsfo)} MT`],['Bunkered',`${f2(bnkrU)} MT`],['Latest ROB',`${f2(lastRob?.ulsfo_rob)} MT`]].map(([l,v],i) => (
                      <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
                    ))}
                  </div>
                  <div className={`${CARD} space-y-3`}>
                    <h3 className="text-sm font-semibold text-amber-300">LSMGO Breakdown</h3>
                    {[['ME LSMGO',`${f2(records.reduce((s,r)=>s+parseFloat(r.lsmgo_me||0),0))} MT`],['AE/IG LSMGO',`${f2(records.reduce((s,r)=>s+parseFloat(r.lsmgo_ae||0),0))} MT`],['Boiler LSMGO',`${f2(records.reduce((s,r)=>s+parseFloat(r.lsmgo_blr||0),0))} MT`],['Total LSMGO',`${f2(totLsmgo)} MT`],['Bunkered',`${f2(bnkrL)} MT`],['Latest ROB',`${f2(lastRob?.lsmgo_rob)} MT`]].map(([l,v],i) => (
                      <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
                    ))}
                  </div>
                  <div className={`${CARD} space-y-3`}>
                    <h3 className="text-sm font-semibold text-amber-300">Running Hours</h3>
                    {[['AE1 Running Hrs',`${f1(lastRob?.ae1_rhr)} hrs`],['AE2 Running Hrs',`${f1(lastRob?.ae2_rhr)} hrs`],['AE3 Running Hrs',`${f1(lastRob?.ae3_rhr)} hrs`],['Cargo Plant',`${f1(records.reduce((s,r)=>s+parseFloat(r.cargo_plant_rhr||0),0))} hrs`],['Sea Hours Total',`${f1(records.reduce((s,r)=>s+parseFloat(r.sea_hrs||0),0))} hrs`]].map(([l,v],i) => (
                      <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
                    ))}
                  </div>
                  <div className={`${CARD} space-y-3`}>
                    <h3 className="text-sm font-semibold text-amber-300">Fresh Water</h3>
                    {[['Total Produced',`${f2(records.reduce((s,r)=>s+parseFloat(r.fw_produced||0),0))} T`],['Total Consumed',`${f2(records.reduce((s,r)=>s+parseFloat(r.fw_consumed||0),0))} T`],['Latest ROB',`${f2(lastRob?.fw_rob)} T`],['Cyl Oil Cons',`${f2(records.reduce((s,r)=>s+parseFloat(r.cyl_oil_cons||0),0))} L`],['Cyl Oil ROB',`${f2(lastRob?.cyl_oil_rob)} L`]].map(([l,v],i) => (
                      <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── CII TAB ── */}
      {tab==='cii' && (
        <div className="space-y-6">
          {!cii ? (
            <div className={`${CARD} border-amber-800/30 bg-amber-900/10`}>
              <p className="text-sm text-amber-300">CII data unavailable — vessel DWT not configured.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { l:'Attained CII', v:f2(cii.attained), c:rc(cii.rating) },
                  { l:'CII Rating',   v:cii.rating,       c:rc(cii.rating) },
                  { l:'Required CII', v:f2(cii.ciiRequired), c:'#94A3B8' },
                  { l:'Total CO₂',   v:`${f1(cii.totalCO2)} MT`, c:'#67E8F9' },
                ].map((k,i) => (
                  <div key={i} className={CARD}>
                    <div className="text-xs text-slate-500 uppercase">{k.l}</div>
                    <div className="text-2xl font-bold mt-1" style={{color:k.c}}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* Rating band */}
              <div className={CARD}>
                <h3 className="text-sm font-semibold text-amber-300 mb-3">Rating Boundaries — Gas Carrier · DWT {f0(cii.dwt)} MT · Reduction {cii.Z}%</h3>
                <div className="flex gap-0 h-7 rounded overflow-hidden mb-2">
                  {[['A','#059669'],['B','#0891B2'],['C','#D97706'],['D','#EA580C'],['E','#DC2626']].map(([l,c]) => (
                    <div key={l} className="flex-1 flex items-center justify-center text-xs font-bold text-white" style={{background:c}}>{l}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1 text-center text-[10px] mb-4">
                  {[['A Superior',`≤ ${f2(cii.bounds.A)}`,'#059669'],['B Good',`≤ ${f2(cii.bounds.B)}`,'#0891B2'],['C Acceptable',`≤ ${f2(cii.bounds.C)}`,'#D97706'],['D Corrective',`≤ ${f2(cii.bounds.D)}`,'#EA580C'],['E Inferior',`> ${f2(cii.bounds.D)}`,'#DC2626']].map(([l,v,c],i) => (
                    <div key={i}><span style={{color:c}} className="font-semibold">{l}</span><br/><span className="text-slate-500">{v}</span></div>
                  ))}
                </div>
                <div className="flex justify-between text-xs flex-wrap gap-2">
                  {[['Ship Type','Gas Carrier'],['DWT',f0(cii.dwt)+' MT'],['Ref CII',f2(cii.ciiRef)],['CF ULSFO','3.114'],['CF LSMGO','3.206'],['Total Dist',f0(cii.totalDist)+' NM']].map(([l,v],i) => (
                    <div key={i}><span className="text-slate-500">{l}: </span><span className="text-slate-300 font-mono">{v}</span></div>
                  ))}
                </div>
              </div>

              {/* Attained CII progress bar */}
              <div className={CARD}>
                <h3 className="text-sm font-semibold text-amber-300 mb-3">Attained CII vs Required</h3>
                <div className="relative h-8 rounded overflow-hidden bg-slate-800">
                  <div className="h-full rounded transition-all" style={{width:`${Math.min((cii.attained/cii.bounds.D)*100,100)}%`, background:rc(cii.rating)}}></div>
                  <div className="absolute inset-0 flex items-center px-3 text-xs font-bold text-white">
                    Attained: {f2(cii.attained)} ({cii.rating}) — Required: {f2(cii.ciiRequired)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Inline edit row for daily records
function LPGInlineEdit({ record, onSave, onCancel, saving, isNew }) {
  const [r, setR] = useState({ ...record });
  const s = (k,v) => setR(p => ({ ...p, [k]: v }));
  const ni = (k) => <input type="number" step="0.01" value={r[k]||''} onChange={e=>s(k,e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs w-14 text-right focus:outline-none"/>;
  return (
    <tr className="border-b border-amber-800/20 bg-amber-900/5">
      <td className="px-2 py-1"><input type="date" value={r.record_date?.slice(0,10)||''} onChange={e=>s('record_date',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs focus:outline-none w-28"/></td>
      <td className="px-2 py-1"><input value={r.time_utc||''} onChange={e=>s('time_utc',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs focus:outline-none w-14"/></td>
      <td className="px-2 py-1"><input value={r.status||''} onChange={e=>s('status',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs focus:outline-none w-32"/></td>
      <td className="px-2 py-1">{ni('sea_hrs')}</td>
      <td className="px-2 py-1">{ni('obs_dist')}</td>
      <td className="px-2 py-1">{ni('me_rpm')}</td>
      <td className="px-2 py-1">{ni('ulsfo_me')}</td>
      <td className="px-2 py-1">{ni('ulsfo_ae')}</td>
      <td></td>
      <td className="px-2 py-1">{ni('ulsfo_rob')}</td>
      <td className="px-2 py-1">{ni('lsmgo_total')}</td>
      <td className="px-2 py-1">{ni('lsmgo_rob')}</td>
      <td className="px-2 py-1">{ni('ulsfo_bunkered')}</td>
      <td className="px-2 py-1">{ni('cargo_plant_rhr')}</td>
      <td></td>
      <td className="px-2 py-1 flex gap-1">
        <button onClick={() => onSave(r)} disabled={saving} className="px-2 py-0.5 rounded text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-800/30">{saving?'…':'✓'}</button>
        <button onClick={onCancel} className="px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800/30 border border-white/10">✕</button>
      </td>
    </tr>
  );
}

// ── IMPORT PAGE ───────────────────────────────────────────────────────────────
export function LPGImport() {
  const nav = useNavigate();
  const [step, setStep]   = useState('upload');
  const [file, setFile]   = useState(null);
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState([]);
  const [results, setResults]   = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const preview = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/lpg/import/preview', { method:'POST', headers:{ Authorization:`Bearer ${tok()}` }, body:fd });
    const data = await res.json();
    if (!res.ok) { setError(data.error||'Parse failed'); setLoading(false); return; }
    setParsed(data);
    setSelected(data.voyages.map((_,i)=>i));
    setStep('preview'); setLoading(false);
  };

  const confirm = async () => {
    const toImport = parsed.voyages.filter((_,i)=>selected.includes(i));
    setLoading(true); setStep('importing');
    const res = await fetch('/api/lpg/import/confirm', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${tok()}` }, body: JSON.stringify({ voyages: toImport }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setStep('preview'); setLoading(false); return; }
    setResults(data.results); setStep('done'); setLoading(false);
  };

  const toggleSel = i => setSelected(p => p.includes(i)?p.filter(x=>x!==i):[...p,i]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Import LPG Noon Records</h1>
          <p className="text-sm text-slate-500 mt-1">Upload Alfred Temile daily noon counter Excel sheet</p>
        </div>
        <button onClick={() => nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← Back</button>
      </div>

      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
        {['UPLOAD','PREVIEW','IMPORT','DONE'].map((s,i) => (
          <React.Fragment key={s}>
            <span className={['upload','preview','importing','done'].indexOf(step)>=i?'text-amber-400 font-bold':'text-slate-600'}>{s}</span>
            {i<3 && <span className="text-slate-700">→</span>}
          </React.Fragment>
        ))}
      </div>

      {error && <div className="rounded-lg p-3 bg-red-900/30 border border-red-700/40 text-red-300 text-sm">{error}</div>}

      {step==='upload' && (
        <div className={CARD}>
          <div className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center cursor-pointer hover:border-amber-700/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={e=>{e.preventDefault();setFile(e.dataTransfer.files[0]);}}
            onDragOver={e=>e.preventDefault()}>
            <div className="text-4xl mb-3">📊</div>
            <div className="text-sm font-semibold text-slate-200">Drop .xls / .xlsx file here or click to browse</div>
            <div className="text-xs text-slate-500 mt-2">Alfred Temile daily noon counter format</div>
            {file && <div className="mt-4 text-xs font-mono text-amber-400">✓ {file.name} ({(file.size/1024/1024).toFixed(1)}MB)</div>}
          </div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e=>setFile(e.target.files[0])}/>
          <div className="mt-4 flex justify-end">
            <button onClick={preview} disabled={!file||loading} className={`${BTN} text-white`} style={AMBER}>{loading?'Parsing…':'Parse & Preview →'}</button>
          </div>
        </div>
      )}

      {step==='preview' && parsed && (
        <div className="space-y-4">
          <div className={`${CARD} text-sm text-slate-400`}>
            Vessel: <span className="text-amber-400 font-bold">{parsed.vessel_name}</span> · Found <span className="text-amber-400 font-bold">{parsed.voyages.length}</span> voyage{parsed.voyages.length!==1?'s':''} · <span className="text-emerald-400">{parsed.total_records}</span> total records
          </div>
          {parsed.voyages.map((v,i) => (
            <div key={i} className={`${CARD} ${selected.includes(i)?'border-amber-800/40':'opacity-50'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected.includes(i)} onChange={()=>toggleSel(i)} className="mt-1 accent-amber-500 w-4 h-4 cursor-pointer"/>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-slate-100">{v.vessel_name}</span>
                    <span className="text-xs font-mono text-amber-400">{v.voyage_number||'No Voy No.'}</span>
                    <span className="text-xs font-mono text-emerald-400">{v.record_count} records</span>
                    <span className="text-xs text-slate-500">{v.start_date} → {v.end_date}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead><tr className="text-slate-500">{['Date','Status','Sea Hrs','ULSFO ME','ULSFO AE','ULSFO ROB','LSMGO Tot','LSMGO ROB'].map(h=><th key={h} className="text-left pr-3 pb-1 font-normal">{h}</th>)}</tr></thead>
                      <tbody>
                        {v.preview.map((r,j) => (
                          <tr key={j} className="text-slate-300">
                            <td className="pr-3 pb-0.5">{r.record_date}</td>
                            <td className="pr-3 pb-0.5 max-w-[120px] truncate">{r.status}</td>
                            <td className="pr-3 pb-0.5">{f1(r.sea_hrs)}</td>
                            <td className="pr-3 pb-0.5">{f2(r.ulsfo_me)}</td>
                            <td className="pr-3 pb-0.5">{f2(r.ulsfo_ae)}</td>
                            <td className="pr-3 pb-0.5 text-cyan-300">{f2(r.ulsfo_rob)}</td>
                            <td className="pr-3 pb-0.5">{f2(r.lsmgo_total)}</td>
                            <td className="pr-3 pb-0.5 text-cyan-300">{f2(r.lsmgo_rob)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {v.record_count>3 && <div className="text-xs text-slate-600 mt-1">… and {v.record_count-3} more</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <button onClick={() => { setStep('upload'); setFile(null); setParsed(null); }} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← Re-upload</button>
            <button onClick={confirm} disabled={!selected.length||loading} className={`${BTN} text-white`} style={AMBER}>Import {selected.length} voyage{selected.length!==1?'s':''} →</button>
          </div>
        </div>
      )}

      {step==='importing' && <div className={`${CARD} text-center py-12`}><div className="text-3xl mb-4">⏳</div><div className="text-sm text-slate-400">Importing records…</div></div>}

      {step==='done' && (
        <div className="space-y-4">
          <div className={`${CARD} text-center py-8`}><div className="text-3xl mb-3">✅</div><div className="text-sm font-semibold text-slate-200">Import complete</div></div>
          {results.map((r,i) => (
            <div key={i} className={`${CARD} flex items-center justify-between`}>
              <div><div className="text-sm font-semibold text-slate-200">{r.vessel_name} · {r.voyage_number}</div><div className="text-xs text-slate-500">{r.imported} records imported</div></div>
              <button onClick={() => nav(`/lpg/voyages/${r.voyage_id}`)} className={`${BTN} text-xs text-white`} style={AMBER}>Open →</button>
            </div>
          ))}
          <div className="flex justify-end"><button onClick={() => nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← All Voyages</button></div>
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export function LPGDashboard() {
  const nav = useNavigate();
  const [data, setData]   = useState(null);
  const [vessel, setVessel] = useState('');
  const [days, setDays]   = useState(90);
  const [vessels, setVessels] = useState([]);

  useEffect(() => { apiFetch('/lpg/vessels').then(setVessels); }, []);
  useEffect(() => {
    const qs = `?days=${days}${vessel?`&vessel=${encodeURIComponent(vessel)}`:''}`;
    apiFetch(`/lpg/dashboard${qs}`).then(setData);
  }, [vessel, days]);

  if (!data) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">Loading dashboard…</div>;

  const { trend, summary } = data;

  // Simple SVG sparkline
  const Sparkline = ({ values, color, height=40 }) => {
    if (!values.length) return null;
    const max = Math.max(...values, 1);
    const w = 400, h = height;
    const pts = values.map((v,i) => `${(i/(values.length-1||1))*w},${h-(v/max)*h}`).join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{height}}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LPG Fleet Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Fuel consumption & ROB trends</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={vessel} onChange={e=>setVessel(e.target.value)} className="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none">
            <option value="">All Vessels</option>
            {vessels.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
          {[30,60,90,180].map(d => (
            <button key={d} onClick={()=>setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs border ${days===d?'border-amber-600 text-amber-300 bg-amber-900/20':'border-white/10 text-slate-400'}`}>{d}d</button>
          ))}
          <button onClick={() => nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200 text-sm`}>← Voyages</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { l:'ULSFO Consumed', v:`${f1(summary.total_ulsfo_cons)} MT`, c:'#FBBF24' },
          { l:'LSMGO Consumed', v:`${f1(summary.total_lsmgo_cons)} MT`, c:'#67E8F9' },
          { l:'Total Distance', v:`${f0(summary.total_dist)} NM`, c:'#A78BFA' },
          { l:'Sea Days', v:summary.sea_days, c:'#34D399' },
        ].map((k,i) => (
          <div key={i} className={CARD}>
            <div className="text-xs text-slate-500 uppercase">{k.l}</div>
            <div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ROB Trend */}
      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-4">ULSFO ROB Trend</h3>
        <Sparkline values={trend.map(t=>t.ulsfo_rob)} color="#FBBF24" height={60}/>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>{trend[0]?.date}</span><span>{trend[trend.length-1]?.date}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">LSMGO ROB Trend</h3>
          <Sparkline values={trend.map(t=>t.lsmgo_rob)} color="#67E8F9" height={50}/>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily ULSFO Consumption</h3>
          <Sparkline values={trend.map(t=>t.ulsfo_cons)} color="#F97316" height={50}/>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Fresh Water ROB</h3>
          <Sparkline values={trend.map(t=>t.fw_rob)} color="#34D399" height={50}/>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily Distance (NM)</h3>
          <Sparkline values={trend.map(t=>t.dist)} color="#A78BFA" height={50}/>
        </div>
      </div>

      {/* Recent data table */}
      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-3">Recent Daily Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/5">
              {['Date','ULSFO Cons','LSMGO Cons','ULSFO ROB','LSMGO ROB','Distance','FW ROB'].map(h => (
                <th key={h} className="px-2 py-2 text-left text-[10px] text-slate-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {trend.slice(-15).reverse().map((t,i) => (
                <tr key={i} className="border-b border-white/[0.03]">
                  <td className="px-2 py-1.5 font-mono text-amber-300">{t.date}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(t.ulsfo_cons)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(t.lsmgo_cons)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-cyan-300">{f2(t.ulsfo_rob)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-cyan-300">{f2(t.lsmgo_rob)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f1(t.dist)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-emerald-300">{f2(t.fw_rob)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
