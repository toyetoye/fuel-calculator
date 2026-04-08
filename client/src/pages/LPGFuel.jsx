import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const BASE = '/api';
const tok  = () => localStorage.getItem('fuel_token');
const apiFetch = (path, opts={}) =>
  fetch(BASE + path, { ...opts, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tok()}`, ...opts.headers } })
    .then(r => r.json());

const f2  = n => Number(n||0).toFixed(2);
const f1  = n => Number(n||0).toFixed(1);
const f0  = n => Math.round(Number(n||0)).toLocaleString();
const f3  = n => Number(n||0).toFixed(3);

const CARD  = 'rounded-xl border border-white/5 bg-slate-900/60';
const BTN   = 'px-4 py-2 rounded-lg text-sm font-semibold';
const AMBER = { background:'linear-gradient(135deg,#B45309,#D97706)' };
const INP   = 'px-2 py-1.5 rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600 w-full';

const CHART_COLORS = {
  ulsfo_me:'#FBBF24', ulsfo_ae:'#F97316', ulsfo_blr:'#EF4444',
  lsmgo:'#67E8F9', sea:'#34D399', anchor:'#94A3B8', manv:'#A78BFA', berth:'#F472B6',
  fw_prod:'#34D399', fw_cons:'#F87171', fw_rob:'#67E8F9',
  ulsfo_rob:'#FBBF24', lsmgo_rob:'#67E8F9',
  ae1:'#6EE7B7', ae2:'#93C5FD', ae3:'#DDD6FE',
};

const ttStyle = { background:'rgba(15,23,42,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', fontSize:'11px', color:'#E2E8F0' };

// ── PERIOD LIST ───────────────────────────────────────────────────────────────
export function LPGVoyageList() {
  const { user }  = useAuth();
  const nav       = useNavigate();
  const [periods, setPeriods]   = useState([]);
  const [vessels, setVessels]   = useState([]);
  const [vessel, setVessel]     = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => { apiFetch('/lpg/vessels').then(v => { setVessels(v); if(v.length) setVessel(v[0].name); }); }, []);
  useEffect(() => {
    if (!vessel) return;
    setLoading(true);
    apiFetch(`/lpg/periods?vessel=${encodeURIComponent(vessel)}`).then(p => { setPeriods(p); setLoading(false); });
  }, [vessel]);

  const totalRecs = periods.reduce((s,p)=>s+(p.record_count||0),0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LPG Fuel Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monthly fuel records — Alfred Temile fleet</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/lpg/dashboard')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>📊 Dashboard</button>
          {user?.role==='admin' && <button onClick={() => nav('/lpg/import')} className={`${BTN} text-white`} style={AMBER}>⬆ Import Excel</button>}
        </div>
      </div>

      {/* Vessel tabs */}
      <div className="flex gap-2">
        {vessels.map(v => (
          <button key={v.name} onClick={() => setVessel(v.name)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${vessel===v.name?'border-amber-600 bg-amber-900/30 text-amber-300':'border-white/10 text-slate-400 hover:border-white/20'}`}>
            {v.name}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { l:'Monthly Periods', v:periods.length,  c:'#FBBF24' },
          { l:'Total Records',   v:totalRecs,        c:'#67E8F9' },
          { l:'Date Range',      v: periods.length ? `${periods[periods.length-1]?.period_key} → ${periods[0]?.period_key}` : '—', c:'#34D399' },
        ].map((k,i) => (
          <div key={i} className={`${CARD} p-4`}>
            <div className="text-xs text-slate-500 uppercase">{k.l}</div>
            <div className="text-lg font-bold mt-1" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Period list */}
      {loading ? <div className="text-slate-500 text-sm">Loading…</div> : (
        <div className="space-y-2">
          {periods.map(p => (
            <div key={p.id} onClick={() => nav(`/lpg/periods/${p.id}`)}
              className={`${CARD} px-5 py-3 hover:border-amber-800/30 cursor-pointer transition-all`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-100">{p.period_label}</span>
                    <span className="text-xs font-mono text-slate-500">{p.period_key}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-300 bg-emerald-900/20 border border-emerald-800/30">{p.record_count} entries</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{p.start_date?.slice(0,10)} → {p.end_date?.slice(0,10)}</div>
                </div>
                <span className="text-slate-600 text-xs">→</span>
              </div>
            </div>
          ))}
          {!periods.length && (
            <div className="text-center py-12 text-slate-500 text-sm">
              No records yet. <button onClick={() => nav('/lpg/import')} className="text-amber-400 underline">Import Excel</button> to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PERIOD DETAIL ─────────────────────────────────────────────────────────────
export function LPGVoyageDetail() {
  const { id }    = useParams();
  const nav       = useNavigate();
  const { user }  = useAuth();
  const [data, setData]     = useState(null);
  const [tab, setTab]       = useState('records');
  const [editId, setEditId] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch(`/lpg/periods/${id}`).then(setData);
  useEffect(load, [id]);

  const saveRecord = async (r) => {
    setSaving(true);
    try {
      if (r.id) await apiFetch(`/lpg/records/${r.id}`, { method:'PUT', body:JSON.stringify(r) });
      else      await apiFetch('/lpg/records', { method:'POST', body:JSON.stringify({ ...r, vessel_name:data.vessel_name }) });
      setEditId(null); setNewRow(null); load();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const delRecord = async rid => { if(confirm('Delete?')) { await apiFetch(`/lpg/records/${rid}`,{method:'DELETE'}); load(); }};
  const delPeriod = async () => {
    if(!confirm(`Delete ${data.period_label}? Removes all ${data.records?.length} entries.`)) return;
    if(prompt('Type DELETE to confirm')!=='DELETE') return;
    await apiFetch(`/lpg/periods/${id}`,{method:'DELETE'}); nav('/lpg');
  };

  if (!data) return <div className="flex items-center justify-center h-screen text-slate-500">Loading…</div>;

  const recs = data.records || [];
  const cii  = data.cii;

  // Summary stats
  const totUlsfoMe  = recs.reduce((s,r)=>s+parseFloat(r.ulsfo_me||0),0);
  const totUlsfoAe  = recs.reduce((s,r)=>s+parseFloat(r.ulsfo_ae||0),0);
  const totUlsfoBlr = recs.reduce((s,r)=>s+parseFloat(r.ulsfo_blr||0),0);
  const totUlsfo    = totUlsfoMe+totUlsfoAe+totUlsfoBlr;
  const totLsmgo    = recs.reduce((s,r)=>s+parseFloat(r.lsmgo_total||0),0);
  const totDist     = recs.reduce((s,r)=>s+parseFloat(r.obs_dist||0),0);
  const last        = recs.length ? recs[recs.length-1] : {};

  // Daily chart data
  const dailyChart = recs.map(r => ({
    date:       r.record_date?.slice(5), // MM-DD
    ulsfo_me:   parseFloat(r.ulsfo_me||0),
    ulsfo_ae:   parseFloat(r.ulsfo_ae||0),
    lsmgo:      parseFloat(r.lsmgo_total||0),
    ulsfo_rob:  parseFloat(r.ulsfo_rob||0),
    lsmgo_rob:  parseFloat(r.lsmgo_rob||0),
    sea_hrs:    parseFloat(r.sea_hrs||0),
    fw_rob:     parseFloat(r.fw_rob||0),
  }));

  const rc = r => ({A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626'}[r]||'#94A3B8');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{data.vessel_name} — {data.period_label}</h1>
          <div className="text-xs text-slate-500 mt-0.5">{data.start_date?.slice(0,10)} → {data.end_date?.slice(0,10)} · {recs.length} entries</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/lpg')} className={`${BTN} bg-slate-700/40 border border-white/10 text-slate-300 text-xs`}>← Back</button>
          <a href={`/api/lpg/periods/${id}/pdf?token=${tok()}`} target="_blank" className={`${BTN} bg-slate-700/40 border border-white/10 text-slate-300 text-xs`}>📄 PDF</a>
          {user?.role==='admin' && <button onClick={delPeriod} className={`${BTN} bg-red-900/20 border border-red-800/30 text-red-400 text-xs`}>Delete</button>}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { l:'ULSFO Total',   v:`${f2(totUlsfo)} MT`,    c:'#FBBF24' },
          { l:'LSMGO Total',   v:`${f2(totLsmgo)} MT`,    c:'#67E8F9' },
          { l:'Distance',      v:`${f0(totDist)} NM`,     c:'#A78BFA' },
          { l:'ULSFO ROB',     v:`${f2(last.ulsfo_rob)} MT`, c:'#34D399' },
          { l:'LSMGO ROB',     v:`${f2(last.lsmgo_rob)} MT`, c:'#34D399' },
        ].map((k,i) => (
          <div key={i} className={`${CARD} p-3`}>
            <div className="text-[10px] text-slate-500 uppercase">{k.l}</div>
            <div className="text-base font-bold mt-0.5" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1 mb-5" style={{background:'rgba(255,255,255,0.04)'}}>
        {[['records','Daily Entries'],['insights','Insights'],['cii','CII']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider"
            style={{background:tab===t?'rgba(180,83,9,0.3)':'transparent',color:tab===t?'#FBBF24':'#94A3B8',border:tab===t?'1px solid rgba(180,83,9,0.4)':'1px solid transparent'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── DAILY ENTRIES ── */}
      {tab==='records' && (
        <div className="space-y-3">
          {user?.role==='admin' && (
            <div className="flex justify-end">
              <button onClick={() => setNewRow({record_date:'',time_utc:'1200',mode:'Noon',status:'AT SEA NOON',sea_hrs:24,total_hrs:24,ulsfo_me:0,ulsfo_ae:0,ulsfo_rob:0,lsmgo_total:0,lsmgo_rob:0,obs_dist:0,me_rpm:0})}
                className={`${BTN} text-white text-sm`} style={AMBER}>+ Add Entry</button>
            </div>
          )}
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  {['Date','Time','Status','Sea','Anch','Mnv','Dist','RPM','ULSFO ME','AE','BLR','ULSFO ROB','LSMGO','LSMGO ROB','Bnkr','CrgPlt','AE1','AE2','AE3','FW Prod','FW ROB','Cyl Oil',''].map(h => (
                    <th key={h} className="px-1.5 py-2.5 text-left text-[9px] text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recs.map((r,i) => editId===r.id
                  ? <LPGInlineEdit key={r.id} record={r} onSave={saveRecord} onCancel={()=>setEditId(null)} saving={saving}/>
                  : (
                  <tr key={r.id} className={`border-b border-white/[0.03] ${parseFloat(r.sea_hrs)>0?'':'bg-slate-800/30'} hover:bg-white/[0.015]`}>
                    <td className="px-1.5 py-1.5 font-mono text-amber-300 whitespace-nowrap text-[10px]">{r.record_date?.slice(0,10)}</td>
                    <td className="px-1.5 py-1.5 text-slate-500 text-[10px]">{r.time_utc}</td>
                    <td className="px-1.5 py-1.5 text-slate-400 max-w-[120px] truncate text-[10px]">{r.status}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f1(r.sea_hrs)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-500">{f1(r.anchor_hrs)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-500">{f1(r.manv_hrs)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f1(r.obs_dist)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-400">{f1(r.me_rpm)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f2(r.ulsfo_me)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f2(r.ulsfo_ae)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-500">{f2(r.ulsfo_blr)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-cyan-300">{f2(r.ulsfo_rob)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f2(r.lsmgo_total)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-cyan-300">{f2(r.lsmgo_rob)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-emerald-300">{parseFloat(r.ulsfo_bunkered)>0?f2(r.ulsfo_bunkered):''}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f1(r.cargo_plant_rhr)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-400">{f1(r.ae1_rhr)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-400">{f1(r.ae2_rhr)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-slate-400">{f1(r.ae3_rhr)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f2(r.fw_produced)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px] text-cyan-300">{f2(r.fw_rob)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-right text-[10px]">{f3(r.cyl_oil_cons)}</td>
                    <td className="px-1.5 py-1.5">
                      {user?.role==='admin' && <div className="flex gap-1"><button onClick={()=>setEditId(r.id)} className="text-[9px] text-amber-400">Edit</button><button onClick={()=>delRecord(r.id)} className="text-[9px] text-red-500">Del</button></div>}
                    </td>
                  </tr>
                ))}
                {newRow && <LPGInlineEdit key="new" record={newRow} onSave={saveRecord} onCancel={()=>setNewRow(null)} saving={saving} isNew/>}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 text-[10px] font-semibold">
                  <td className="px-1.5 py-2" colSpan={3}>Totals</td>
                  <td className="px-1.5 py-2 font-mono text-right">{f1(recs.reduce((s,r)=>s+parseFloat(r.sea_hrs||0),0))}</td>
                  <td className="px-1.5 py-2 font-mono text-right">{f1(recs.reduce((s,r)=>s+parseFloat(r.anchor_hrs||0),0))}</td>
                  <td className="px-1.5 py-2 font-mono text-right">{f1(recs.reduce((s,r)=>s+parseFloat(r.manv_hrs||0),0))}</td>
                  <td className="px-1.5 py-2 font-mono text-right">{f0(totDist)}</td>
                  <td></td>
                  <td className="px-1.5 py-2 font-mono text-right text-amber-300">{f2(totUlsfoMe)}</td>
                  <td className="px-1.5 py-2 font-mono text-right text-amber-300">{f2(totUlsfoAe)}</td>
                  <td className="px-1.5 py-2 font-mono text-right">{f2(totUlsfoBlr)}</td>
                  <td></td>
                  <td className="px-1.5 py-2 font-mono text-right text-amber-300">{f2(totLsmgo)}</td>
                  <td colSpan={8}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── INSIGHTS TAB ── */}
      {tab==='insights' && (
        <div className="space-y-6">
          {/* Fuel consumption breakdown boxes */}
          <div className="grid grid-cols-3 gap-4">
            <div className={`${CARD} p-4 space-y-2`}>
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-3">ULSFO Breakdown</div>
              {[['ME Consumption',f2(totUlsfoMe)+' MT','#FBBF24'],['AE Consumption',f2(totUlsfoAe)+' MT','#F97316'],['Boiler Consumption',f2(totUlsfoBlr)+' MT','#EF4444'],['Total ULSFO',f2(totUlsfo)+' MT','#FBBF24'],['Bunkered',f2(recs.reduce((s,r)=>s+parseFloat(r.ulsfo_bunkered||0),0))+' MT','#34D399'],['Period-End ROB',f2(last.ulsfo_rob)+' MT','#67E8F9']].map(([l,v,c],i)=>(
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono font-semibold" style={{color:c}}>{v}</span></div>
              ))}
            </div>
            <div className={`${CARD} p-4 space-y-2`}>
              <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-3">LSMGO Breakdown</div>
              {[['ME LSMGO',f2(recs.reduce((s,r)=>s+parseFloat(r.lsmgo_me||0),0))+' MT'],['AE/IG LSMGO',f2(recs.reduce((s,r)=>s+parseFloat(r.lsmgo_ae||0),0))+' MT'],['Boiler LSMGO',f2(recs.reduce((s,r)=>s+parseFloat(r.lsmgo_blr||0),0))+' MT'],['Total LSMGO',f2(totLsmgo)+' MT','#67E8F9'],['Bunkered',f2(recs.reduce((s,r)=>s+parseFloat(r.lsmgo_bunkered||0),0))+' MT','#34D399'],['Period-End ROB',f2(last.lsmgo_rob)+' MT','#67E8F9']].map(([l,v,c],i)=>(
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono font-semibold" style={{color:c||'#CBD5E1'}}>{v}</span></div>
              ))}
            </div>
            <div className={`${CARD} p-4 space-y-2`}>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-3">Operations & Utilities</div>
              {[['Sea Hours',f1(recs.reduce((s,r)=>s+parseFloat(r.sea_hrs||0),0))+' hrs','#34D399'],['Anchor Hours',f1(recs.reduce((s,r)=>s+parseFloat(r.anchor_hrs||0),0))+' hrs'],['Manoeuvring',f1(recs.reduce((s,r)=>s+parseFloat(r.manv_hrs||0),0))+' hrs'],['Cargo Plant',f1(recs.reduce((s,r)=>s+parseFloat(r.cargo_plant_rhr||0),0))+' hrs','#A78BFA'],['FW Produced',f2(recs.reduce((s,r)=>s+parseFloat(r.fw_produced||0),0))+' T'],['Cyl Oil Cons',f3(recs.reduce((s,r)=>s+parseFloat(r.cyl_oil_cons||0),0))+' L']].map(([l,v,c],i)=>(
                <div key={i} className="flex justify-between text-xs"><span className="text-slate-400">{l}</span><span className="font-mono font-semibold" style={{color:c||'#CBD5E1'}}>{v}</span></div>
              ))}
            </div>
          </div>

          {/* Daily ULSFO consumption chart */}
          <div className={`${CARD} p-5`}>
            <div className="text-sm font-semibold text-amber-300 mb-4">Daily Fuel Consumption — ULSFO (MT)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyChart} margin={{top:0,right:8,left:-20,bottom:0}} barSize={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:9}} interval="preserveStartEnd"/>
                <YAxis tick={{fill:'#64748B',fontSize:9}}/>
                <Tooltip contentStyle={ttStyle}/>
                <Legend wrapperStyle={{fontSize:'11px'}}/>
                <Bar dataKey="ulsfo_me"  name="ME"     fill={CHART_COLORS.ulsfo_me}  stackId="u"/>
                <Bar dataKey="ulsfo_ae"  name="AE"     fill={CHART_COLORS.ulsfo_ae}  stackId="u"/>
                <Bar dataKey="lsmgo"     name="LSMGO"  fill={CHART_COLORS.lsmgo}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ROB trends */}
          <div className={`${CARD} p-5`}>
            <div className="text-sm font-semibold text-cyan-300 mb-4">ROB Trends — ULSFO & LSMGO (MT)</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dailyChart} margin={{top:0,right:8,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:9}} interval="preserveStartEnd"/>
                <YAxis tick={{fill:'#64748B',fontSize:9}}/>
                <Tooltip contentStyle={ttStyle}/>
                <Legend wrapperStyle={{fontSize:'11px'}}/>
                <Line dataKey="ulsfo_rob" name="ULSFO ROB" stroke={CHART_COLORS.ulsfo_rob} dot={false} strokeWidth={2}/>
                <Line dataKey="lsmgo_rob" name="LSMGO ROB" stroke={CHART_COLORS.lsmgo_rob} dot={false} strokeWidth={2}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Hours breakdown */}
            <div className={`${CARD} p-5`}>
              <div className="text-sm font-semibold text-green-300 mb-4">Daily Hours Breakdown</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={dailyChart} margin={{top:0,right:4,left:-20,bottom:0}} barSize={5}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:9}} interval="preserveStartEnd"/>
                  <YAxis tick={{fill:'#64748B',fontSize:9}}/>
                  <Tooltip contentStyle={ttStyle}/>
                  <Legend wrapperStyle={{fontSize:'11px'}}/>
                  <Bar dataKey="sea_hrs" name="Sea" fill={CHART_COLORS.sea} stackId="h"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Fresh water ROB */}
            <div className={`${CARD} p-5`}>
              <div className="text-sm font-semibold text-emerald-300 mb-4">Fresh Water ROB Trend (T)</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={dailyChart} margin={{top:0,right:4,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:9}} interval="preserveStartEnd"/>
                  <YAxis tick={{fill:'#64748B',fontSize:9}}/>
                  <Tooltip contentStyle={ttStyle}/>
                  <Line dataKey="fw_rob" name="FW ROB" stroke={CHART_COLORS.fw_rob} dot={false} strokeWidth={2}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── CII TAB ── */}
      {tab==='cii' && (
        <div className="space-y-5">
          {!cii ? (
            <div className={`${CARD} p-5 border-amber-800/30 bg-amber-900/10`}>
              <p className="text-sm text-amber-300">CII data unavailable — vessel DWT not configured.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                {[{l:'Attained CII',v:f2(cii.attained),c:rc(cii.rating)},{l:'Rating',v:cii.rating,c:rc(cii.rating)},{l:'Required CII',v:f2(cii.ciiReq),c:'#94A3B8'},{l:`Total CO\u2082`,v:`${f1(cii.totalCO2)} MT`,c:'#67E8F9'}].map((k,i)=>(
                  <div key={i} className={`${CARD} p-4`}>
                    <div className="text-xs text-slate-500 uppercase">{k.l}</div>
                    <div className="text-2xl font-bold mt-1" style={{color:k.c}}>{k.v}</div>
                  </div>
                ))}
              </div>
              <div className={`${CARD} p-5`}>
                <div className="flex gap-0 h-7 rounded overflow-hidden mb-2">
                  {[['A','#059669'],['B','#0891B2'],['C','#D97706'],['D','#EA580C'],['E','#DC2626']].map(([l,c])=>(
                    <div key={l} className="flex-1 flex items-center justify-center text-xs font-bold text-white" style={{background:c}}>{l}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1 text-center text-[10px] mb-3">
                  {[['A Superior',`≤ ${f2(cii.bounds.A)}`,'#059669'],['B Good',`≤ ${f2(cii.bounds.B)}`,'#0891B2'],['C Acceptable',`≤ ${f2(cii.bounds.C)}`,'#D97706'],['D Corrective',`≤ ${f2(cii.bounds.D)}`,'#EA580C'],['E Inferior',`> ${f2(cii.bounds.D)}`,'#DC2626']].map(([l,v,c],i)=>(
                    <div key={i}><span style={{color:c}} className="font-semibold">{l}</span><br/><span className="text-slate-500">{v}</span></div>
                  ))}
                </div>
                <div className="relative h-7 rounded overflow-hidden bg-slate-800">
                  <div className="h-full rounded" style={{width:`${Math.min((cii.attained/cii.bounds.D)*100,98)}%`,background:rc(cii.rating)}}></div>
                  <div className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-white">
                    Attained: {f2(cii.attained)} ({cii.rating}) — Required: {f2(cii.ciiReq)}
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

// ── Inline edit ───────────────────────────────────────────────────────────────
function LPGInlineEdit({ record, onSave, onCancel, saving, isNew }) {
  const [r, setR] = useState({...record});
  const s = (k,v) => setR(p=>({...p,[k]:v}));
  const ni = (k,w='w-12') => <input type="number" step="0.01" value={r[k]??''} onChange={e=>s(k,e.target.value)} className={`px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-[10px] ${w} text-right focus:outline-none`}/>;
  const colSpan = 22;
  return (
    <tr className="border-b border-amber-800/20 bg-amber-900/5">
      <td className="px-1 py-1"><input type="date" value={r.record_date?.slice(0,10)||''} onChange={e=>s('record_date',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-[10px] text-slate-200 focus:outline-none w-24"/></td>
      <td className="px-1 py-1"><input value={r.time_utc||''} onChange={e=>s('time_utc',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-[10px] text-slate-200 focus:outline-none w-12"/></td>
      <td className="px-1 py-1"><input value={r.status||''} onChange={e=>s('status',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-[10px] text-slate-200 focus:outline-none w-28"/></td>
      <td className="px-1 py-1">{ni('sea_hrs')}</td>
      <td className="px-1 py-1">{ni('anchor_hrs')}</td>
      <td className="px-1 py-1">{ni('manv_hrs')}</td>
      <td className="px-1 py-1">{ni('obs_dist')}</td>
      <td className="px-1 py-1">{ni('me_rpm')}</td>
      <td className="px-1 py-1">{ni('ulsfo_me')}</td>
      <td className="px-1 py-1">{ni('ulsfo_ae')}</td>
      <td className="px-1 py-1">{ni('ulsfo_blr')}</td>
      <td className="px-1 py-1">{ni('ulsfo_rob')}</td>
      <td className="px-1 py-1">{ni('lsmgo_total')}</td>
      <td className="px-1 py-1">{ni('lsmgo_rob')}</td>
      <td className="px-1 py-1">{ni('ulsfo_bunkered')}</td>
      <td className="px-1 py-1">{ni('cargo_plant_rhr')}</td>
      <td colSpan={5}></td>
      <td className="px-1 py-1">{ni('fw_rob')}</td>
      <td colSpan={1}></td>
      <td className="px-1 py-1 flex gap-1 pt-2">
        <button onClick={()=>onSave(r)} disabled={saving} className="px-1.5 py-0.5 rounded text-[9px] text-emerald-300 bg-emerald-900/30 border border-emerald-800/30">{saving?'…':'✓'}</button>
        <button onClick={onCancel} className="px-1.5 py-0.5 rounded text-[9px] text-slate-400 bg-slate-800/30 border border-white/10">✕</button>
      </td>
    </tr>
  );
}

// ── IMPORT PAGE ───────────────────────────────────────────────────────────────
export function LPGImport() {
  const nav = useNavigate();
  const [step, setStep]     = useState('upload');
  const [file, setFile]     = useState(null);
  const [parsed, setParsed] = useState(null);
  const [selected, setSel]  = useState([]);
  const [results, setRes]   = useState([]);
  const [error, setError]   = useState('');
  const [loading, setLoad]  = useState(false);
  const fileRef = useRef();

  const preview = async () => {
    if (!file) return;
    setLoad(true); setError('');
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/lpg/import/preview', { method:'POST', headers:{Authorization:`Bearer ${tok()}`}, body:fd });
    const data = await res.json();
    if (!res.ok) { setError(data.error||'Parse failed'); setLoad(false); return; }
    setParsed(data); setSel(data.periods.map((_,i)=>i)); setStep('preview'); setLoad(false);
  };

  const confirm = async () => {
    const toImport = parsed.periods.filter((_,i)=>selected.includes(i));
    setLoad(true); setStep('importing');
    const res = await fetch('/api/lpg/import/confirm',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok()}`},body:JSON.stringify({periods:toImport})});
    const data = await res.json();
    if (!res.ok) { setError(data.error); setStep('preview'); setLoad(false); return; }
    setRes(data.results); setStep('done'); setLoad(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Import LPG Records</h1>
          <p className="text-sm text-slate-500 mt-1">Alfred Temile daily noon counter — records grouped by month</p>
        </div>
        <button onClick={()=>nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← Back</button>
      </div>

      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
        {['UPLOAD','PREVIEW','IMPORT','DONE'].map((s,i)=>(
          <React.Fragment key={s}>
            <span className={['upload','preview','importing','done'].indexOf(step)>=i?'text-amber-400 font-bold':'text-slate-600'}>{s}</span>
            {i<3&&<span className="text-slate-700">→</span>}
          </React.Fragment>
        ))}
      </div>

      {error && <div className="rounded-lg p-3 bg-red-900/30 border border-red-700/40 text-red-300 text-sm">{error}</div>}

      {step==='upload' && (
        <div className={`${CARD} p-5`}>
          <div className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center cursor-pointer hover:border-amber-700/50 transition-colors"
            onClick={()=>fileRef.current?.click()} onDrop={e=>{e.preventDefault();setFile(e.dataTransfer.files[0]);}} onDragOver={e=>e.preventDefault()}>
            <div className="text-4xl mb-3">📊</div>
            <div className="text-sm font-semibold text-slate-200">Drop .xls/.xlsx here or click to browse</div>
            <div className="text-xs text-slate-500 mt-2">Alfred Temile daily noon counter format · Records grouped by calendar month</div>
            {file && <div className="mt-4 text-xs font-mono text-amber-400">✓ {file.name} ({(file.size/1024/1024).toFixed(1)}MB)</div>}
          </div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e=>setFile(e.target.files[0])}/>
          <div className="mt-4 flex justify-end">
            <button onClick={preview} disabled={!file||loading} className={`${BTN} text-white`} style={AMBER}>{loading?'Parsing…':'Parse & Preview →'}</button>
          </div>
        </div>
      )}

      {step==='preview' && parsed && (
        <div className="space-y-3">
          <div className={`${CARD} p-4 text-sm text-slate-400`}>
            <span className="text-amber-400 font-bold">{parsed.vessel_name}</span> · <span className="text-amber-400 font-bold">{parsed.periods.length}</span> monthly periods · <span className="text-emerald-400">{parsed.total_records}</span> total entries
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {parsed.periods.map((p,i)=>(
              <div key={i} className={`${CARD} px-4 py-3 ${selected.includes(i)?'border-amber-800/40':'opacity-50'}`}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selected.includes(i)} onChange={()=>setSel(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i])} className="accent-amber-500 w-4 h-4"/>
                  <span className="text-sm font-bold text-slate-100">{p.period_label}</span>
                  <span className="text-xs font-mono text-slate-500">{p.period_key}</span>
                  <span className="text-xs font-mono text-emerald-400">{p.record_count} entries</span>
                  <span className="text-xs text-slate-600">{p.start_date} → {p.end_date}</span>
                </div>
                {p.preview.length>0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="text-[10px] w-full">
                      <thead><tr className="text-slate-500">{['Date','Time','Status','Sea Hrs','ULSFO ME','AE','ULSFO ROB','LSMGO','LSMGO ROB'].map(h=><th key={h} className="text-left pr-3 pb-0.5 font-normal">{h}</th>)}</tr></thead>
                      <tbody>{p.preview.map((r,j)=>(
                        <tr key={j} className="text-slate-300">
                          <td className="pr-3">{r.record_date}</td><td className="pr-3">{r.time_utc}</td>
                          <td className="pr-3 max-w-[120px] truncate">{r.status}</td>
                          <td className="pr-3">{f1(r.sea_hrs)}</td><td className="pr-3">{f2(r.ulsfo_me)}</td>
                          <td className="pr-3">{f2(r.ulsfo_ae)}</td><td className="pr-3 text-cyan-300">{f2(r.ulsfo_rob)}</td>
                          <td className="pr-3">{f2(r.lsmgo_total)}</td><td className="pr-3 text-cyan-300">{f2(r.lsmgo_rob)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {p.record_count>3&&<div className="text-[10px] text-slate-600 mt-0.5">…and {p.record_count-3} more entries</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={()=>{setStep('upload');setFile(null);setParsed(null);}} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← Re-upload</button>
            <button onClick={confirm} disabled={!selected.length||loading} className={`${BTN} text-white`} style={AMBER}>Import {selected.length} month{selected.length!==1?'s':''} →</button>
          </div>
        </div>
      )}

      {step==='importing' && <div className={`${CARD} p-5 text-center py-12`}><div className="text-3xl mb-4">⏳</div><div className="text-sm text-slate-400">Importing records…</div></div>}

      {step==='done' && (
        <div className="space-y-3">
          <div className={`${CARD} p-5 text-center py-8`}><div className="text-3xl mb-3">✅</div><div className="text-sm font-semibold text-slate-200">Import complete — {results.length} months imported</div></div>
          {results.slice(0,5).map((r,i)=>(
            <div key={i} className={`${CARD} px-4 py-3 flex items-center justify-between`}>
              <div><div className="text-sm font-semibold text-slate-200">{r.period_label} · {r.vessel_name}</div><div className="text-xs text-slate-500">{r.imported} entries</div></div>
              <button onClick={()=>nav(`/lpg/periods/${r.period_id}`)} className={`${BTN} text-xs text-white`} style={AMBER}>Open →</button>
            </div>
          ))}
          {results.length>5&&<div className="text-xs text-slate-500 text-center">…and {results.length-5} more months</div>}
          <div className="flex justify-end"><button onClick={()=>nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← All Periods</button></div>
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export function LPGDashboard() {
  const nav = useNavigate();
  const [monthly, setMonthly] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [vessel, setVessel]   = useState('');

  useEffect(() => { apiFetch('/lpg/vessels').then(v => { setVessels(v); if(v.length) setVessel(v[0].name); }); }, []);
  useEffect(() => {
    if (!vessel) return;
    apiFetch(`/lpg/monthly?vessel=${encodeURIComponent(vessel)}`).then(setMonthly);
  }, [vessel]);

  if (!monthly.length && vessel) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">No data yet. Import Excel records first.</div>;

  const last  = monthly.length ? monthly[monthly.length-1] : {};
  const totU  = monthly.reduce((s,m)=>s+(m.ulsfo_total||0),0);
  const totL  = monthly.reduce((s,m)=>s+(m.lsmgo_total||0),0);
  const totD  = monthly.reduce((s,m)=>s+(m.total_dist||0),0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LPG Fleet Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monthly fuel & operations intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {vessels.map(v=>(
              <button key={v.name} onClick={()=>setVessel(v.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${vessel===v.name?'border-amber-600 bg-amber-900/30 text-amber-300':'border-white/10 text-slate-400'}`}>
                {v.name}
              </button>
            ))}
          </div>
          <button onClick={()=>nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← Periods</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { l:'All-Time ULSFO', v:`${Math.round(totU)} MT`,   c:'#FBBF24' },
          { l:'All-Time LSMGO', v:`${Math.round(totL)} MT`,   c:'#67E8F9' },
          { l:'Total Distance', v:`${Math.round(totD).toLocaleString()} NM`, c:'#A78BFA' },
          { l:'Latest ULSFO ROB', v:`${f2(last.ulsfo_rob)} MT`, c:'#34D399' },
        ].map((k,i)=>(
          <div key={i} className={`${CARD} p-4`}>
            <div className="text-xs text-slate-500 uppercase">{k.l}</div>
            <div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Monthly fuel consumption */}
      <div className={`${CARD} p-5`}>
        <div className="text-sm font-semibold text-amber-300 mb-4">Monthly Fuel Consumption (MT) — ULSFO & LSMGO</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} margin={{top:0,right:8,left:-10,bottom:0}} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:9}}/>
            <YAxis tick={{fill:'#64748B',fontSize:9}}/>
            <Tooltip contentStyle={ttStyle}/>
            <Legend wrapperStyle={{fontSize:'11px'}}/>
            <Bar dataKey="ulsfo_me"    name="ULSFO ME"    fill={CHART_COLORS.ulsfo_me}  stackId="a"/>
            <Bar dataKey="ulsfo_ae"    name="ULSFO AE"    fill={CHART_COLORS.ulsfo_ae}  stackId="a"/>
            <Bar dataKey="ulsfo_blr"   name="ULSFO BLR"   fill={CHART_COLORS.ulsfo_blr} stackId="a"/>
            <Bar dataKey="lsmgo_total" name="LSMGO"       fill={CHART_COLORS.lsmgo}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ROB trends */}
      <div className={`${CARD} p-5`}>
        <div className="text-sm font-semibold text-cyan-300 mb-4">ROB Trends — ULSFO & LSMGO (MT)</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={monthly} margin={{top:0,right:8,left:-10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:9}}/>
            <YAxis tick={{fill:'#64748B',fontSize:9}}/>
            <Tooltip contentStyle={ttStyle}/>
            <Legend wrapperStyle={{fontSize:'11px'}}/>
            <Line dataKey="ulsfo_rob" name="ULSFO ROB" stroke={CHART_COLORS.ulsfo_rob} dot={false} strokeWidth={2}/>
            <Line dataKey="lsmgo_rob" name="LSMGO ROB" stroke={CHART_COLORS.lsmgo_rob} dot={false} strokeWidth={2}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Hours breakdown */}
        <div className={`${CARD} p-5`}>
          <div className="text-sm font-semibold text-green-300 mb-4">Monthly Hours Breakdown</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly} margin={{top:0,right:4,left:-15,bottom:0}} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:9}}/>
              <YAxis tick={{fill:'#64748B',fontSize:9}}/>
              <Tooltip contentStyle={ttStyle}/>
              <Legend wrapperStyle={{fontSize:'11px'}}/>
              <Bar dataKey="sea_hrs"    name="Sea"    fill={CHART_COLORS.sea}   stackId="h"/>
              <Bar dataKey="anchor_hrs" name="Anchor" fill={CHART_COLORS.anchor} stackId="h"/>
              <Bar dataKey="manv_hrs"   name="Manv"   fill={CHART_COLORS.manv}  stackId="h"/>
              <Bar dataKey="berth_hrs"  name="Berth"  fill={CHART_COLORS.berth} stackId="h"/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Fresh water */}
        <div className={`${CARD} p-5`}>
          <div className="text-sm font-semibold text-emerald-300 mb-4">Fresh Water — Produced / Consumed / ROB (T)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={monthly} margin={{top:0,right:4,left:-15,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:9}}/>
              <YAxis tick={{fill:'#64748B',fontSize:9}}/>
              <Tooltip contentStyle={ttStyle}/>
              <Legend wrapperStyle={{fontSize:'11px'}}/>
              <Line dataKey="fw_produced" name="Produced" stroke={CHART_COLORS.fw_prod} dot={false} strokeWidth={2}/>
              <Line dataKey="fw_consumed" name="Consumed" stroke={CHART_COLORS.fw_cons} dot={false} strokeWidth={2}/>
              <Line dataKey="fw_rob"      name="ROB"      stroke={CHART_COLORS.fw_rob}  dot={false} strokeWidth={2}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* AE running hours */}
        <div className={`${CARD} p-5`}>
          <div className="text-sm font-semibold text-purple-300 mb-4">Auxiliary Engine Running Hours (Cumulative)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={monthly} margin={{top:0,right:4,left:-15,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:9}}/>
              <YAxis tick={{fill:'#64748B',fontSize:9}}/>
              <Tooltip contentStyle={ttStyle}/>
              <Legend wrapperStyle={{fontSize:'11px'}}/>
              <Line dataKey="ae1_rhr" name="AE1" stroke={CHART_COLORS.ae1} dot={false} strokeWidth={2}/>
              <Line dataKey="ae2_rhr" name="AE2" stroke={CHART_COLORS.ae2} dot={false} strokeWidth={2}/>
              <Line dataKey="ae3_rhr" name="AE3" stroke={CHART_COLORS.ae3} dot={false} strokeWidth={2}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cargo plant + bunkering */}
        <div className={`${CARD} p-5`}>
          <div className="text-sm font-semibold text-pink-300 mb-4">Cargo Plant Hours & Bunkering</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly} margin={{top:0,right:4,left:-15,bottom:0}} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:9}}/>
              <YAxis tick={{fill:'#64748B',fontSize:9}}/>
              <Tooltip contentStyle={ttStyle}/>
              <Legend wrapperStyle={{fontSize:'11px'}}/>
              <Bar dataKey="cargo_plant_rhr" name="Cargo Plant (hrs)" fill="#F472B6"/>
              <Bar dataKey="ulsfo_bunkered"  name="ULSFO Bunkered (MT)" fill="#34D399"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly summary table */}
      <div className={`${CARD} p-5`}>
        <div className="text-sm font-semibold text-amber-300 mb-3">Monthly Summary Table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/5">
              {['Month','ULSFO ME','ULSFO AE','ULSFO Tot','LSMGO','ULSFO ROB','LSMGO ROB','Bnkr U','Bnkr L','Sea Hrs','Dist NM','FW Prod','FW ROB'].map(h=>(
                <th key={h} className="px-2 py-2 text-left text-[9px] text-slate-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...monthly].reverse().map((m,i)=>(
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-2 py-1.5 font-mono text-amber-300 font-semibold">{m.label}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(m.ulsfo_me)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(m.ulsfo_ae)}</td>
                  <td className="px-2 py-1.5 font-mono text-right font-semibold text-amber-300">{f2(m.ulsfo_total)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(m.lsmgo_total)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-cyan-300">{f2(m.ulsfo_rob)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-cyan-300">{f2(m.lsmgo_rob)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-emerald-300">{m.ulsfo_bunkered>0?f2(m.ulsfo_bunkered):''}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-emerald-300">{m.lsmgo_bunkered>0?f2(m.lsmgo_bunkered):''}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f1(m.sea_hrs)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f0(m.total_dist)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(m.fw_produced)}</td>
                  <td className="px-2 py-1.5 font-mono text-right">{f2(m.fw_rob)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
