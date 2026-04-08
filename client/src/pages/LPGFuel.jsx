import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const BASE = '/api';
const tok  = () => localStorage.getItem('fuel_token');
const apiFetch = (path, opts={}) =>
  fetch(BASE + path, { ...opts, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tok()}`, ...opts.headers }}).then(r=>r.json());

const f2 = n => Number(n||0).toFixed(2);
const f1 = n => Number(n||0).toFixed(1);
const f0 = n => Math.round(Number(n||0)).toLocaleString();
const fMonthLong = ym => { try { return new Date(ym+'-15').toLocaleString('en-GB',{month:'long',year:'numeric'}); } catch { return ym||'—'; } };
const sum  = (arr,key) => arr.reduce((s,r)=>s+(parseFloat(r[key])||0),0);
const last = (arr,key) => arr.length ? (parseFloat(arr[arr.length-1][key])||0) : 0;

const CARD  = 'rounded-xl p-4 border border-white/5 bg-slate-900/60';
const BTN   = 'px-4 py-2 rounded-lg text-sm font-semibold';
const AMBER = { background:'linear-gradient(135deg,#B45309,#D97706)' };
const TT    = { backgroundColor:'#0F172A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 };
const AX    = { fill:'#64748B', fontSize:10 };
const rc    = r => ({A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626'}[r]||'#94A3B8');

// ── MONTHLY LIST ──────────────────────────────────────────────────────────────
export function LPGVoyageList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [months,   setMonths]   = useState([]);
  const [vessels,  setVessels]  = useState([]);
  const [vessel,   setVessel]   = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { apiFetch('/lpg/vessels').then(setVessels); }, []);
  useEffect(() => {
    setLoading(true);
    const qs = vessel ? `?vessel=${encodeURIComponent(vessel)}` : '';
    apiFetch(`/lpg/voyages${qs}`).then(v => { setMonths(v); setLoading(false); });
  }, [vessel]);

  const byYear = months.reduce((acc,m) => {
    const yr = (m.voyage_number||'').slice(0,4)||'—';
    (acc[yr]=acc[yr]||[]).push(m);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LPG Fuel Log</h1>
          <p className="text-sm text-slate-500 mt-1">Monthly engine & fuel records — Alfred Temile fleet</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/lpg/dashboard')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>📊 Dashboard</button>
          {user?.role==='admin' && <button onClick={() => nav('/lpg/import')} className={`${BTN} text-white`} style={AMBER}>⬆ Import Excel</button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', ...vessels.map(v=>v.name)].map(v => (
          <button key={v||'all'} onClick={() => setVessel(v)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${vessel===v?'border-amber-600 bg-amber-900/30 text-amber-300':'border-white/10 text-slate-400 hover:border-white/20'}`}>
            {v||'All Vessels'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[{l:'Monthly Periods',v:months.length,c:'#FBBF24'},{l:'Total Records',v:months.reduce((s,m)=>s+(m.record_count||0),0),c:'#67E8F9'},{l:'Active Vessels',v:new Set(months.map(m=>m.vessel_name)).size,c:'#34D399'}].map((k,i)=>(
          <div key={i} className={CARD}><div className="text-xs text-slate-500 uppercase">{k.l}</div><div className="text-2xl font-bold mt-1" style={{color:k.c}}>{k.v}</div></div>
        ))}
      </div>

      {loading ? <div className="text-slate-500 text-sm">Loading…</div> : (
        <div className="space-y-6">
          {Object.keys(byYear).sort().reverse().map(yr => (
            <div key={yr}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">{yr}</div>
              <div className="grid grid-cols-3 gap-3">
                {byYear[yr].map(m => (
                  <div key={m.id} onClick={() => nav(`/lpg/voyages/${m.id}`)}
                    className="rounded-xl px-4 py-3 border border-white/5 hover:border-amber-800/40 cursor-pointer transition-all bg-slate-900/60 space-y-1">
                    <div className="text-sm font-bold text-slate-100">{fMonthLong(m.voyage_number)}</div>
                    <div className="text-xs text-slate-500">{m.vessel_name}</div>
                    <div className="flex gap-3 text-xs font-mono">
                      <span className="text-emerald-400">{m.record_count} records</span>
                      <span className="text-slate-600">{m.start_date?.slice(0,10)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!months.length && <div className="text-slate-500 text-sm text-center py-10">No records found. Import an Excel file to get started.</div>}
        </div>
      )}
    </div>
  );
}

// ── MONTHLY DETAIL ────────────────────────────────────────────────────────────
export function LPGVoyageDetail() {
  const { id } = useParams();
  const nav    = useNavigate();
  const { user } = useAuth();
  const [data, setData]     = useState(null);
  const [tab,  setTab]      = useState('records');
  const [editId, setEditId] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => { setLoading(true); apiFetch(`/lpg/voyages/${id}`).then(d=>{setData(d);setLoading(false);}); };
  useEffect(load, [id]);

  const saveRecord = async r => {
    setSaving(true);
    try {
      if (r.id) await apiFetch(`/lpg/records/${r.id}`,{method:'PUT',body:JSON.stringify(r)});
      else      await apiFetch('/lpg/records',{method:'POST',body:JSON.stringify({...r,voyage_id:id,vessel_name:data.vessel_name})});
      setEditId(null); setNewRow(null); load();
    } catch(e){alert(e.message);} finally{setSaving(false);}
  };

  const delRecord = async rid => {
    if(!confirm('Delete?')) return;
    await apiFetch(`/lpg/records/${rid}`,{method:'DELETE'}); load();
  };

  const delMonth = async () => {
    if(!confirm(`Delete ${fMonthLong(data.voyage_number)}?`)) return;
    if(prompt('Type DELETE')!=='DELETE') return;
    await apiFetch(`/lpg/voyages/${id}`,{method:'DELETE'}); nav('/lpg');
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500">Loading…</div>;
  if (!data)   return null;

  const records = data.records||[];
  const cii     = data.cii;
  const TABS = [['records','Daily Records'],['fuel','Fuel'],['engine','Engine'],['aux','Aux & Water'],['cii','CII']];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{data.vessel_name} — {fMonthLong(data.voyage_number)}</h1>
          <div className="text-xs text-slate-500 mt-1">{data.start_date?.slice(0,10)} → {data.end_date?.slice(0,10)} · {records.length} records</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/lpg')} className={`${BTN} bg-slate-700/40 border border-white/10 text-slate-300 text-xs`}>← Back</button>
          <a href={`/api/lpg/voyages/${id}/pdf?token=${tok()}`} target="_blank" className={`${BTN} bg-slate-700/40 border border-white/10 text-slate-300 text-xs`}>📄 PDF</a>
          {user?.role==='admin' && <button onClick={delMonth} className={`${BTN} bg-red-900/20 border border-red-800/30 text-red-400 text-xs`}>Delete</button>}
        </div>
      </div>

      <div className="flex gap-1 rounded-lg p-1 mb-6 overflow-x-auto" style={{background:'rgba(255,255,255,0.04)'}}>
        {TABS.map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
            style={{background:tab===t?'rgba(180,83,9,0.3)':'transparent',color:tab===t?'#FBBF24':'#94A3B8',border:tab===t?'1px solid rgba(180,83,9,0.4)':'1px solid transparent'}}>
            {l}
          </button>
        ))}
      </div>

      {tab==='records' && (
        <div className="space-y-3">
          {user?.role==='admin' && (
            <div className="flex justify-end">
              <button onClick={() => setNewRow({record_date:'',time_utc:'1200',mode:'Noon',status:'AT SEA NOON',sea_hrs:24,total_hrs:24})}
                className={`${BTN} text-white text-sm`} style={AMBER}>+ Add Record</button>
            </div>
          )}
          <div className="rounded-xl border border-white/5 overflow-x-auto bg-slate-900/60">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-white/5">
                {['Date','Time','Status','Sea','Mnv','Anch','Dist NM','RPM','BHP','ULSFO ME','ULSFO AE','ULSFO BLR','ULSFO ROB','Bnkr U','LSMGO','LSMGO ROB','AE1 h','AE2 h','AE3 h','Cargo h','CO₂','FW ROB',''].map(h=>(
                  <th key={h} className="px-2 py-3 text-left text-[10px] text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {records.map((r,i) => editId===r.id
                  ? <LPGInlineEdit key={r.id} record={r} onSave={saveRecord} onCancel={()=>setEditId(null)} saving={saving}/>
                  : (
                  <tr key={r.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${parseFloat(r.sea_hrs)>0?'':'bg-slate-800/10'}`}>
                    <td className="px-2 py-1.5 font-mono text-amber-300 whitespace-nowrap">{r.record_date?.slice(0,10)}</td>
                    <td className="px-2 py-1.5 text-slate-500 text-[10px]">{r.time_utc}</td>
                    <td className="px-2 py-1.5 text-slate-400 max-w-[140px] truncate">{r.status}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-cyan-300">{parseFloat(r.sea_hrs)>0?f1(r.sea_hrs):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{parseFloat(r.manv_hrs)>0?f1(r.manv_hrs):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{parseFloat(r.anchor_hrs)>0?f1(r.anchor_hrs):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{parseFloat(r.obs_dist)>0?f1(r.obs_dist):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-400">{parseFloat(r.me_rpm)>0?f1(r.me_rpm):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{parseFloat(r.bhp)>0?f0(r.bhp):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{parseFloat(r.ulsfo_me)>0?f2(r.ulsfo_me):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{parseFloat(r.ulsfo_ae)>0?f2(r.ulsfo_ae):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{parseFloat(r.ulsfo_blr)>0?f2(r.ulsfo_blr):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-cyan-300 font-semibold">{f2(r.ulsfo_rob)}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-emerald-300">{parseFloat(r.ulsfo_bunkered)>0?f2(r.ulsfo_bunkered):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{parseFloat(r.lsmgo_total)>0?f2(r.lsmgo_total):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-cyan-300">{f2(r.lsmgo_rob)}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{f1(r.ae1_rhr)}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{f1(r.ae2_rhr)}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{f1(r.ae3_rhr)}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{parseFloat(r.cargo_plant_rhr)>0?f1(r.cargo_plant_rhr):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-slate-500">{parseFloat(r.co2_tonnes)>0?f2(r.co2_tonnes):''}</td>
                    <td className="px-2 py-1.5 font-mono text-right text-emerald-300">{parseFloat(r.fw_rob)>0?f0(r.fw_rob):''}</td>
                    <td className="px-2 py-1.5">
                      {user?.role==='admin' && <div className="flex gap-1">
                        <button onClick={()=>setEditId(r.id)} className="text-[10px] text-amber-400">Edit</button>
                        <button onClick={()=>delRecord(r.id)} className="text-[10px] text-red-500">Del</button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {newRow && <LPGInlineEdit key="new" record={newRow} onSave={saveRecord} onCancel={()=>setNewRow(null)} saving={saving} isNew/>}
              </tbody>
              <tfoot><tr className="border-t border-white/10 font-semibold text-xs">
                <td className="px-2 py-3 text-slate-400" colSpan={3}>Totals / Last ROB</td>
                <td className="px-2 py-3 font-mono text-right text-cyan-300">{f1(sum(records,'sea_hrs'))}</td>
                <td className="px-2 py-3 font-mono text-right">{f1(sum(records,'manv_hrs'))}</td>
                <td className="px-2 py-3 font-mono text-right">{f1(sum(records,'anchor_hrs'))}</td>
                <td className="px-2 py-3 font-mono text-right">{f0(sum(records,'obs_dist'))}</td>
                <td colSpan={2}></td>
                <td className="px-2 py-3 font-mono text-right text-amber-300">{f2(sum(records,'ulsfo_me'))}</td>
                <td className="px-2 py-3 font-mono text-right text-amber-300">{f2(sum(records,'ulsfo_ae'))}</td>
                <td className="px-2 py-3 font-mono text-right text-amber-300">{f2(sum(records,'ulsfo_blr'))}</td>
                <td className="px-2 py-3 font-mono text-right text-cyan-300">{f2(last(records,'ulsfo_rob'))}</td>
                <td className="px-2 py-3 font-mono text-right text-emerald-300">{f2(sum(records,'ulsfo_bunkered'))}</td>
                <td className="px-2 py-3 font-mono text-right text-amber-300">{f2(sum(records,'lsmgo_total'))}</td>
                <td className="px-2 py-3 font-mono text-right text-cyan-300">{f2(last(records,'lsmgo_rob'))}</td>
                <td colSpan={7}></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {tab==='fuel'   && <FuelTab   records={records}/>}
      {tab==='engine' && <EngineTab records={records}/>}
      {tab==='aux'    && <AuxTab    records={records}/>}
      {tab==='cii'    && <CiiTab    cii={cii}/>}
    </div>
  );
}

// ── FUEL TAB ──────────────────────────────────────────────────────────────────
function FuelTab({records}) {
  const byDate = {};
  records.forEach(r => {
    const d = r.record_date?.slice(0,10); if(!d) return;
    if(!byDate[d]) byDate[d]={label:d.slice(5),ulsfo_me:0,ulsfo_ae:0,ulsfo_blr:0,lsmgo_total:0,ulsfo_rob:0,lsmgo_rob:0,ulsfo_bunkered:0};
    byDate[d].ulsfo_me    += parseFloat(r.ulsfo_me)||0;
    byDate[d].ulsfo_ae    += parseFloat(r.ulsfo_ae)||0;
    byDate[d].ulsfo_blr   += parseFloat(r.ulsfo_blr)||0;
    byDate[d].lsmgo_total += parseFloat(r.lsmgo_total)||0;
    byDate[d].ulsfo_rob    = parseFloat(r.ulsfo_rob)||0;
    byDate[d].lsmgo_rob    = parseFloat(r.lsmgo_rob)||0;
    byDate[d].ulsfo_bunkered += parseFloat(r.ulsfo_bunkered)||0;
  });
  const cd = Object.values(byDate).sort((a,b)=>a.label.localeCompare(b.label));
  const totMe=sum(records,'ulsfo_me'), totAe=sum(records,'ulsfo_ae'), totBlr=sum(records,'ulsfo_blr');
  const totU=totMe+totAe+totBlr, totL=sum(records,'lsmgo_total');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[{l:'Total ULSFO',v:`${f2(totU)} MT`,c:'#FBBF24'},{l:'Total LSMGO',v:`${f2(totL)} MT`,c:'#67E8F9'},{l:'ULSFO ROB',v:`${f2(last(records,'ulsfo_rob'))} MT`,c:'#A78BFA'},{l:'LSMGO ROB',v:`${f2(last(records,'lsmgo_rob'))} MT`,c:'#34D399'}].map((k,i)=>(
          <div key={i} className={CARD}><div className="text-xs text-slate-500 uppercase">{k.l}</div><div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div></div>
        ))}
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily ULSFO Consumption — ME / AE / Boiler (MT)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cd} margin={{top:0,right:10,left:-10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
            <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
            <Bar dataKey="ulsfo_me"  name="ME"     stackId="u" fill="#F59E0B"/>
            <Bar dataKey="ulsfo_ae"  name="AE"     stackId="u" fill="#3B82F6"/>
            <Bar dataKey="ulsfo_blr" name="Boiler" stackId="u" fill="#8B5CF6" radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily LSMGO Consumption (MT)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cd} margin={{top:0,right:10,left:-10,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/>
              <Bar dataKey="lsmgo_total" name="LSMGO" fill="#67E8F9" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">ROB Trend — ULSFO & LSMGO (MT)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cd} margin={{top:0,right:10,left:-10,bottom:0}}>
              <defs>
                <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/><stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient>
                <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#67E8F9" stopOpacity={0.3}/><stop offset="95%" stopColor="#67E8F9" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
              <Area type="monotone" dataKey="ulsfo_rob" name="ULSFO ROB" stroke="#F59E0B" fill="url(#gU)" strokeWidth={2} dot={false}/>
              <Area type="monotone" dataKey="lsmgo_rob" name="LSMGO ROB" stroke="#67E8F9" fill="url(#gL)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-3">Fuel Summary</h3>
        <div className="grid grid-cols-2 gap-6 text-xs">
          <div className="space-y-2">
            {[['ME ULSFO',`${f2(totMe)} MT`],['AE ULSFO',`${f2(totAe)} MT`],['Boiler ULSFO',`${f2(totBlr)} MT`],['Total ULSFO',`${f2(totU)} MT`,'text-amber-300'],['Bunkered ULSFO',`${f2(sum(records,'ulsfo_bunkered'))} MT`,'text-emerald-300'],['ULSFO ROB (last)',`${f2(last(records,'ulsfo_rob'))} MT`,'text-cyan-300']].map(([l,v,c],i)=>(
              <div key={i} className="flex justify-between py-1 border-b border-white/[0.04]"><span className="text-slate-400">{l}</span><span className={`font-mono font-semibold ${c||'text-slate-200'}`}>{v}</span></div>
            ))}
          </div>
          <div className="space-y-2">
            {[['LSMGO Total',`${f2(totL)} MT`],['Bunkered LSMGO',`${f2(sum(records,'lsmgo_bunkered'))} MT`,'text-emerald-300'],['LSMGO ROB (last)',`${f2(last(records,'lsmgo_rob'))} MT`,'text-cyan-300'],['Sea days',records.filter(r=>parseFloat(r.sea_hrs)>0).length],['Sea hours',`${f1(sum(records,'sea_hrs'))} hrs`],['Total distance',`${f0(sum(records,'obs_dist'))} NM`]].map(([l,v,c],i)=>(
              <div key={i} className="flex justify-between py-1 border-b border-white/[0.04]"><span className="text-slate-400">{l}</span><span className={`font-mono font-semibold ${c||'text-slate-200'}`}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ENGINE TAB ────────────────────────────────────────────────────────────────
function EngineTab({records}) {
  const sea = records.filter(r=>parseFloat(r.sea_hrs)>0||parseFloat(r.obs_dist)>0);
  const cd  = sea.map(r=>({label:r.record_date?.slice(5)||'',rpm:parseFloat(r.me_rpm)||0,speed:parseFloat(r.obs_speed)||0,dist:parseFloat(r.obs_dist)||0,bhp:parseFloat(r.bhp)||0,kw:parseFloat(r.kw)||0}));
  const avgRpm = sea.length ? sea.reduce((s,r)=>s+(parseFloat(r.me_rpm)||0),0)/sea.length : 0;
  const avgSpd = sea.length ? sea.reduce((s,r)=>s+(parseFloat(r.obs_speed)||0),0)/sea.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[{l:'Total Distance',v:`${f0(sum(records,'obs_dist'))} NM`,c:'#A78BFA'},{l:'Avg Speed',v:`${f1(avgSpd)} kn`,c:'#67E8F9'},{l:'Avg RPM',v:f1(avgRpm),c:'#FBBF24'},{l:'Sea Hours',v:`${f1(sum(records,'sea_hrs'))} hrs`,c:'#34D399'}].map((k,i)=>(
          <div key={i} className={CARD}><div className="text-xs text-slate-500 uppercase">{k.l}</div><div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div></div>
        ))}
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-4">Speed & RPM (sea passages)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={cd} margin={{top:0,right:10,left:-10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
            <YAxis yAxisId="s" tick={AX}/><YAxis yAxisId="r" orientation="right" tick={AX}/>
            <Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
            <Line yAxisId="s" type="monotone" dataKey="speed" name="Speed (kn)" stroke="#67E8F9" strokeWidth={2} dot={false}/>
            <Line yAxisId="r" type="monotone" dataKey="rpm"   name="RPM"        stroke="#FBBF24" strokeWidth={2} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily Distance (NM)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cd} margin={{top:0,right:10,left:-10,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/>
              <Bar dataKey="dist" name="NM" fill="#A78BFA" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">BHP & KW</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={cd} margin={{top:0,right:10,left:-10,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
              <Line type="monotone" dataKey="bhp" name="BHP" stroke="#F97316" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="kw"  name="KW"  stroke="#6366F1" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── AUX & WATER TAB ───────────────────────────────────────────────────────────
function AuxTab({records}) {
  const wi = records.map((r,i) => {
    const prev = i>0?records[i-1]:null;
    return {
      label:    r.record_date?.slice(5)||'',
      ae1d: Math.max(0,(parseFloat(r.ae1_rhr)||0)-(prev?parseFloat(prev.ae1_rhr)||0:parseFloat(r.ae1_rhr)||0)),
      ae2d: Math.max(0,(parseFloat(r.ae2_rhr)||0)-(prev?parseFloat(prev.ae2_rhr)||0:parseFloat(r.ae2_rhr)||0)),
      ae3d: Math.max(0,(parseFloat(r.ae3_rhr)||0)-(prev?parseFloat(prev.ae3_rhr)||0:parseFloat(r.ae3_rhr)||0)),
      cargo:    parseFloat(r.cargo_plant_rhr)||0,
      fw_prod:  parseFloat(r.fw_produced)||0,
      fw_rob:   parseFloat(r.fw_rob)||0,
      cyl_cons: parseFloat(r.cyl_oil_cons)||0,
      cyl_rob:  parseFloat(r.cyl_oil_rob)||0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[{l:'AE1 RHR (last)',v:`${f1(last(records,'ae1_rhr'))} h`,c:'#67E8F9'},{l:'AE2 RHR (last)',v:`${f1(last(records,'ae2_rhr'))} h`,c:'#A78BFA'},{l:'AE3 RHR (last)',v:`${f1(last(records,'ae3_rhr'))} h`,c:'#F97316'},{l:'Cargo Plant',v:`${f1(sum(records,'cargo_plant_rhr'))} h`,c:'#34D399'}].map((k,i)=>(
          <div key={i} className={CARD}><div className="text-xs text-slate-500 uppercase">{k.l}</div><div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div></div>
        ))}
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily AE Running Hours (incremental)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={wi} margin={{top:0,right:10,left:-10,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
            <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
            <Bar dataKey="ae1d" name="AE1" stackId="a" fill="#67E8F9"/>
            <Bar dataKey="ae2d" name="AE2" stackId="a" fill="#A78BFA"/>
            <Bar dataKey="ae3d" name="AE3" stackId="a" fill="#F97316" radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Cargo Plant Running Hours</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={wi} margin={{top:0,right:10,left:-10,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/>
              <Bar dataKey="cargo" name="Cargo Plant hrs" fill="#34D399" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Fresh Water ROB & Daily Production (T)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={wi} margin={{top:0,right:10,left:-10,bottom:0}}>
              <defs><linearGradient id="gFW" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34D399" stopOpacity={0.3}/><stop offset="95%" stopColor="#34D399" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
              <Area type="monotone" dataKey="fw_rob"  name="FW ROB"      stroke="#34D399" fill="url(#gFW)" strokeWidth={2} dot={false}/>
              <Bar  dataKey="fw_prod" name="FW Produced" fill="#6EE7B7" radius={[2,2,0,0]}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Cylinder Oil ROB & Consumption (L)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={wi} margin={{top:0,right:10,left:-10,bottom:0}}>
              <defs><linearGradient id="gCyl" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/><stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="label" tick={AX} interval="preserveStartEnd"/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
              <Area type="monotone" dataKey="cyl_rob"  name="Cyl ROB"  stroke="#F59E0B" fill="url(#gCyl)" strokeWidth={2} dot={false}/>
              <Bar  dataKey="cyl_cons" name="Cyl Cons" fill="#FDE68A" radius={[2,2,0,0]}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-3">Auxiliary Summary</h3>
          <div className="space-y-2 text-xs">
            {[['AE1 RHR (last)',f1(last(records,'ae1_rhr'))+' hrs'],['AE2 RHR (last)',f1(last(records,'ae2_rhr'))+' hrs'],['AE3 RHR (last)',f1(last(records,'ae3_rhr'))+' hrs'],['Cargo Plant Total',f1(sum(records,'cargo_plant_rhr'))+' hrs'],['FW Produced',f2(sum(records,'fw_produced'))+' T'],['FW Consumed',f2(sum(records,'fw_consumed'))+' T'],['FW ROB (last)',f0(last(records,'fw_rob'))+' T'],['Cyl Oil Cons',f2(sum(records,'cyl_oil_cons'))+' L'],['Cyl Oil ROB (last)',f2(last(records,'cyl_oil_rob'))+' L']].map(([l,v],i)=>(
              <div key={i} className="flex justify-between py-1 border-b border-white/[0.04]"><span className="text-slate-400">{l}</span><span className="font-mono text-slate-200">{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CII TAB ───────────────────────────────────────────────────────────────────
function CiiTab({cii}) {
  if (!cii) return <div className={`${CARD} border-amber-800/30 bg-amber-900/10`}><p className="text-sm text-amber-300">CII data unavailable — vessel DWT not configured.</p></div>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[{l:'Attained CII',v:f2(cii.attained),c:rc(cii.rating)},{l:'CII Rating',v:cii.rating,c:rc(cii.rating)},{l:'Required CII',v:f2(cii.ciiRequired),c:'#94A3B8'},{l:'Total CO₂',v:`${f1(cii.totalCO2)} MT`,c:'#67E8F9'}].map((k,i)=>(
          <div key={i} className={CARD}><div className="text-xs text-slate-500 uppercase">{k.l}</div><div className="text-2xl font-bold mt-1" style={{color:k.c}}>{k.v}</div></div>
        ))}
      </div>
      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-3">Rating Boundaries — Gas Carrier · DWT {f0(cii.dwt)} MT</h3>
        <div className="flex h-7 rounded overflow-hidden mb-2">
          {[['A','#059669'],['B','#0891B2'],['C','#D97706'],['D','#EA580C'],['E','#DC2626']].map(([l,c])=>(
            <div key={l} className="flex-1 flex items-center justify-center text-xs font-bold text-white" style={{background:c}}>{l}</div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1 text-center text-[10px] mb-4">
          {[['A Superior',`≤${f2(cii.bounds.A)}`,'#059669'],['B Good',`≤${f2(cii.bounds.B)}`,'#0891B2'],['C Acceptable',`≤${f2(cii.bounds.C)}`,'#D97706'],['D Corrective',`≤${f2(cii.bounds.D)}`,'#EA580C'],['E Inferior',`>${f2(cii.bounds.D)}`,'#DC2626']].map(([l,v,c],i)=>(
            <div key={i}><span style={{color:c}} className="font-semibold">{l}</span><br/><span className="text-slate-500">{v}</span></div>
          ))}
        </div>
        <div className="relative h-8 rounded overflow-hidden bg-slate-800">
          <div className="h-full rounded" style={{width:`${Math.min((cii.attained/(cii.bounds.D*1.4||1))*100,100)}%`,background:rc(cii.rating)}}/>
          <div className="absolute inset-0 flex items-center px-3 text-xs font-bold text-white">Attained: {f2(cii.attained)} ({cii.rating}) — Required: {f2(cii.ciiRequired)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          {[['Type','Gas Carrier (LPG)'],['DWT',f0(cii.dwt)+' MT'],['Ref CII',f2(cii.ciiRef)],['Reduction',cii.Z+'%'],['CF ULSFO','3.114'],['CF LSMGO','3.206']].map(([l,v],i)=>(
            <div key={i}><span className="text-slate-500">{l}: </span><span className="font-mono text-slate-300">{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── INLINE EDIT ROW ───────────────────────────────────────────────────────────
function LPGInlineEdit({record,onSave,onCancel,saving}) {
  const [r,setR]=useState({...record});
  const s=(k,v)=>setR(p=>({...p,[k]:v}));
  const ni=(k,w='w-14')=><input type="number" step="0.01" value={r[k]||''} onChange={e=>s(k,e.target.value)} className={`px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs ${w} text-right focus:outline-none`}/>;
  return (
    <tr className="border-b border-amber-800/20 bg-amber-900/5">
      <td className="px-1 py-1"><input type="date" value={r.record_date?.slice(0,10)||''} onChange={e=>s('record_date',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs w-28 focus:outline-none"/></td>
      <td className="px-1 py-1"><input value={r.time_utc||''} onChange={e=>s('time_utc',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs w-14 focus:outline-none"/></td>
      <td className="px-1 py-1"><input value={r.status||''} onChange={e=>s('status',e.target.value)} className="px-1 py-0.5 rounded bg-slate-700 border border-white/10 text-slate-200 text-xs w-32 focus:outline-none"/></td>
      <td className="px-1 py-1">{ni('sea_hrs')}</td><td className="px-1 py-1">{ni('manv_hrs')}</td><td className="px-1 py-1">{ni('anchor_hrs')}</td>
      <td className="px-1 py-1">{ni('obs_dist')}</td><td className="px-1 py-1">{ni('me_rpm')}</td><td className="px-1 py-1">{ni('bhp','w-16')}</td>
      <td className="px-1 py-1">{ni('ulsfo_me')}</td><td className="px-1 py-1">{ni('ulsfo_ae')}</td><td className="px-1 py-1">{ni('ulsfo_blr')}</td>
      <td className="px-1 py-1">{ni('ulsfo_rob')}</td><td className="px-1 py-1">{ni('ulsfo_bunkered')}</td>
      <td className="px-1 py-1">{ni('lsmgo_total')}</td><td className="px-1 py-1">{ni('lsmgo_rob')}</td>
      <td className="px-1 py-1">{ni('ae1_rhr','w-16')}</td><td className="px-1 py-1">{ni('ae2_rhr','w-16')}</td><td className="px-1 py-1">{ni('ae3_rhr','w-16')}</td>
      <td className="px-1 py-1">{ni('cargo_plant_rhr')}</td><td className="px-1 py-1">{ni('co2_tonnes')}</td><td className="px-1 py-1">{ni('fw_rob')}</td>
      <td className="px-1 py-1 flex gap-1 pt-2">
        <button onClick={()=>onSave(r)} disabled={saving} className="px-2 py-0.5 rounded text-[10px] text-emerald-300 bg-emerald-900/30">{saving?'…':'✓'}</button>
        <button onClick={onCancel} className="px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800/30">✕</button>
      </td>
    </tr>
  );
}

// ── IMPORT PAGE ───────────────────────────────────────────────────────────────
export function LPGImport() {
  const nav=useNavigate();
  const [step,setStep]=useState('upload');
  const [file,setFile]=useState(null);
  const [parsed,setParsed]=useState(null);
  const [selected,setSelected]=useState([]);
  const [results,setResults]=useState([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const fileRef=useRef();

  const preview=async()=>{
    if(!file) return;
    setLoading(true); setError('');
    const fd=new FormData(); fd.append('file',file);
    const res=await fetch('/api/lpg/import/preview',{method:'POST',headers:{Authorization:`Bearer ${tok()}`},body:fd});
    const data=await res.json();
    if(!res.ok){setError(data.error||'Parse failed');setLoading(false);return;}
    setParsed(data); setSelected(data.voyages.map((_,i)=>i)); setStep('preview'); setLoading(false);
  };

  const confirm=async()=>{
    const toImport=parsed.voyages.filter((_,i)=>selected.includes(i));
    setLoading(true); setStep('importing');
    const res=await fetch('/api/lpg/import/confirm',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok()}`},body:JSON.stringify({voyages:toImport})});
    const data=await res.json();
    if(!res.ok){setError(data.error);setStep('preview');setLoading(false);return;}
    setResults(data.results); setStep('done'); setLoading(false);
  };

  const toggleSel=i=>setSelected(p=>p.includes(i)?p.filter(x=>x!==i):[...p,i]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Import LPG Noon Records</h1>
          <p className="text-sm text-slate-500 mt-1">All entries imported · grouped by month automatically</p>
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

      {error&&<div className="rounded-lg p-3 bg-red-900/30 border border-red-700/40 text-red-300 text-sm">{error}</div>}

      {step==='upload'&&(
        <div className={CARD}>
          <div className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center cursor-pointer hover:border-amber-700/50 transition-colors"
            onClick={()=>fileRef.current?.click()}
            onDrop={e=>{e.preventDefault();setFile(e.dataTransfer.files[0]);}}
            onDragOver={e=>e.preventDefault()}>
            <div className="text-4xl mb-3">📊</div>
            <div className="text-sm font-semibold text-slate-200">Drop .xls / .xlsx here or click to browse</div>
            <div className="text-xs text-slate-500 mt-2">Alfred Temile daily noon counter format · all entries captured · grouped by month</div>
            {file&&<div className="mt-4 text-xs font-mono text-amber-400">✓ {file.name} ({(file.size/1024/1024).toFixed(1)}MB)</div>}
          </div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e=>setFile(e.target.files[0])}/>
          <div className="mt-4 flex justify-end">
            <button onClick={preview} disabled={!file||loading} className={`${BTN} text-white`} style={AMBER}>{loading?'Parsing…':'Parse & Preview →'}</button>
          </div>
        </div>
      )}

      {step==='preview'&&parsed&&(
        <div className="space-y-4">
          <div className={`${CARD} text-sm text-slate-400`}>
            <span className="text-amber-400 font-bold">{parsed.vessel_name}</span> · <span className="text-amber-400 font-bold">{parsed.voyages.length}</span> months · <span className="text-emerald-400">{parsed.total_records}</span> total records
          </div>
          <div className="grid grid-cols-2 gap-3">
            {parsed.voyages.map((v,i)=>(
              <div key={i} className={`${CARD} ${selected.includes(i)?'border-amber-800/40':'opacity-50'} flex items-center gap-3`}>
                <input type="checkbox" checked={selected.includes(i)} onChange={()=>toggleSel(i)} className="accent-amber-500 w-4 h-4 cursor-pointer flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-100">{v.month_label||fMonthLong(v.voyage_number)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{v.start_date} → {v.end_date} · <span className="text-emerald-400">{v.record_count} records</span></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={()=>{setStep('upload');setFile(null);setParsed(null);}} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← Re-upload</button>
            <button onClick={confirm} disabled={!selected.length||loading} className={`${BTN} text-white`} style={AMBER}>Import {selected.length} month{selected.length!==1?'s':''} →</button>
          </div>
        </div>
      )}

      {step==='importing'&&<div className={`${CARD} text-center py-12`}><div className="text-3xl mb-4">⏳</div><div className="text-sm text-slate-400">Importing…</div></div>}

      {step==='done'&&(
        <div className="space-y-4">
          <div className={`${CARD} text-center py-8`}><div className="text-3xl mb-3">✅</div><div className="text-sm font-semibold text-slate-200">Import complete</div></div>
          {results.map((r,i)=>(
            <div key={i} className={`${CARD} flex items-center justify-between`}>
              <div><div className="text-sm font-semibold text-slate-200">{r.vessel_name} · {fMonthLong(r.voyage_number)}</div><div className="text-xs text-slate-500">{r.imported} records</div></div>
              <button onClick={()=>nav(`/lpg/voyages/${r.voyage_id}`)} className={`${BTN} text-xs text-white`} style={AMBER}>Open →</button>
            </div>
          ))}
          <div className="flex justify-end"><button onClick={()=>nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200`}>← All Months</button></div>
        </div>
      )}
    </div>
  );
}

// ── FLEET DASHBOARD ───────────────────────────────────────────────────────────
export function LPGDashboard() {
  const nav=useNavigate();
  const [data,setData]=useState(null);
  const [vessel,setVessel]=useState('');
  const [days,setDays]=useState(90);
  const [vessels,setVessels]=useState([]);

  useEffect(()=>{apiFetch('/lpg/vessels').then(setVessels);},[]);
  useEffect(()=>{
    const qs=`?days=${days}${vessel?`&vessel=${encodeURIComponent(vessel)}`:''}`;
    apiFetch(`/lpg/dashboard${qs}`).then(setData);
  },[vessel,days]);

  if(!data) return <div className="flex items-center justify-center h-screen text-slate-500">Loading…</div>;
  const {trend,summary}=data;
  const intv=Math.floor(trend.length/8)||1;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LPG Fleet Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Fuel, engine & auxiliary trends</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={vessel} onChange={e=>setVessel(e.target.value)} className="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none">
            <option value="">All Vessels</option>
            {vessels.map(v=><option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
          {[30,60,90,180,365].map(d=>(
            <button key={d} onClick={()=>setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs border ${days===d?'border-amber-600 text-amber-300 bg-amber-900/20':'border-white/10 text-slate-400'}`}>{d}d</button>
          ))}
          <button onClick={()=>nav('/lpg')} className={`${BTN} bg-slate-700/50 border border-white/10 text-slate-200 text-sm`}>← Logs</button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {[{l:'ULSFO Consumed',v:`${f1(summary.total_ulsfo_cons)} MT`,c:'#FBBF24'},{l:'LSMGO Consumed',v:`${f1(summary.total_lsmgo_cons)} MT`,c:'#67E8F9'},{l:'Total Distance',v:`${f0(summary.total_dist)} NM`,c:'#A78BFA'},{l:'Sea Days',v:summary.sea_days,c:'#34D399'},{l:'Records',v:summary.total_days,c:'#F97316'}].map((k,i)=>(
          <div key={i} className={CARD}><div className="text-xs text-slate-500 uppercase">{k.l}</div><div className="text-xl font-bold mt-1" style={{color:k.c}}>{k.v}</div></div>
        ))}
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily Fuel Consumption — ULSFO & LSMGO (MT)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trend} margin={{top:0,right:10,left:-10,bottom:0}}>
            <defs>
              <linearGradient id="gU2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4}/><stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient>
              <linearGradient id="gL2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#67E8F9" stopOpacity={0.4}/><stop offset="95%" stopColor="#67E8F9" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="date" tick={AX} interval={intv} tickFormatter={v=>v?.slice(5)||''}/>
            <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
            <Area type="monotone" dataKey="ulsfo_cons" name="ULSFO" stroke="#F59E0B" fill="url(#gU2)" strokeWidth={2} dot={false}/>
            <Area type="monotone" dataKey="lsmgo_cons" name="LSMGO" stroke="#67E8F9" fill="url(#gL2)" strokeWidth={2} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">ROB Trend (MT)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend} margin={{top:0,right:10,left:-10,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="date" tick={AX} interval={intv} tickFormatter={v=>v?.slice(5)||''}/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/><Legend wrapperStyle={{fontSize:11,color:'#94A3B8'}}/>
              <Line type="monotone" dataKey="ulsfo_rob" name="ULSFO ROB" stroke="#F59E0B" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="lsmgo_rob" name="LSMGO ROB" stroke="#67E8F9" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Daily Distance (NM)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend} margin={{top:0,right:10,left:-10,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="date" tick={AX} interval={intv} tickFormatter={v=>v?.slice(5)||''}/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/>
              <Bar dataKey="dist" name="NM" fill="#A78BFA" radius={[2,2,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">Fresh Water ROB (T)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trend} margin={{top:0,right:10,left:-10,bottom:0}}>
              <defs><linearGradient id="gFW2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34D399" stopOpacity={0.3}/><stop offset="95%" stopColor="#34D399" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
              <XAxis dataKey="date" tick={AX} interval={intv} tickFormatter={v=>v?.slice(5)||''}/>
              <YAxis tick={AX}/><Tooltip contentStyle={TT}/>
              <Area type="monotone" dataKey="fw_rob" name="FW ROB" stroke="#34D399" fill="url(#gFW2)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-amber-300 mb-3">Latest 10 Days</h3>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/5">{['Date','ULSFO','LSMGO','ULSFO ROB','NM'].map(h=><th key={h} className="pb-2 text-left text-[10px] text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {trend.slice(-10).reverse().map((t,i)=>(
                <tr key={i} className="border-b border-white/[0.03]">
                  <td className="py-1 font-mono text-amber-300 text-[10px]">{t.date}</td>
                  <td className="py-1 font-mono text-right text-[10px]">{f2(t.ulsfo_cons)}</td>
                  <td className="py-1 font-mono text-right text-[10px]">{f2(t.lsmgo_cons)}</td>
                  <td className="py-1 font-mono text-right text-cyan-300 text-[10px]">{f2(t.ulsfo_rob)}</td>
                  <td className="py-1 font-mono text-right text-[10px]">{f1(t.dist)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
