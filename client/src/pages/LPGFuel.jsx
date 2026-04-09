import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';
import { HelpButton } from '../HelpModal';

// ─── Shared helpers ───────────────────────────────────────────────────────────
const fmt   = (v,d=2) => (v==null||isNaN(v)||v==='')?'—':Number(v).toFixed(d);
const fmt0  = v => (v==null||isNaN(v))?'—':Math.round(Number(v)).toLocaleString();
const fmtD  = d => d ? String(d).slice(0,10) : '—';
const n0    = v => (v==null||v==='')?0:Number(v)||0;

function StatCard({ label, value, sub, color='slate', onClick }) {
  const cols = { amber:'text-amber-300', green:'text-green-300', blue:'text-blue-300', red:'text-red-300', slate:'text-slate-100' };
  return (
    <div onClick={onClick} className={`rounded-lg p-4 border border-white/5 ${onClick?'cursor-pointer hover:border-amber-700/40':''}`}
      style={{background:'var(--card-bg)'}}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${cols[color]||cols.slate}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{
      position:'fixed', left:tip.x+12, top:tip.y-8, zIndex:9999,
      background:'rgba(15,23,42,0.95)', border:'1px solid rgba(255,255,255,0.12)',
      borderRadius:8, padding:'6px 10px', pointerEvents:'none',
      boxShadow:'0 4px 16px rgba(0,0,0,0.4)', minWidth:120
    }}>
      <div style={{color:'#94a3b8', fontSize:10, marginBottom:2}}>{tip.label}</div>
      <div style={{color:'#f1f5f9', fontSize:13, fontWeight:600}}>{tip.value}</div>
      {tip.sub && <div style={{color:'#64748b', fontSize:10, marginTop:1}}>{tip.sub}</div>}
    </div>
  );
}

// ─── SVG Charts ──────────────────────────────────────────────────────────────
function LineChart({ data, yKey, label, color='#3B82F6', warningLine, yUnit='', tooltipLabel }) {
  const [tip, setTip] = useState(null);
  if (!data?.length) return <div className="text-slate-500 text-xs text-center py-8">No data</div>;
  const W=560,H=160,PL=42,PR=12,PT=12,PB=36;
  const cW=W-PL-PR, cH=H-PT-PB;
  const vals = data.map(d=>parseFloat(d[yKey])||0);
  const maxV = Math.max(...vals, warningLine||0) * 1.15 || 10;
  const xp = i => PL + (data.length<2 ? cW/2 : (i/(data.length-1))*cW);
  const yp = v => PT + cH - (v/maxV)*cH;
  const path = vals.map((v,i)=>`${i===0?'M':'L'}${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');
  const ticks = 4;
  return (
    <>
      <Tooltip tip={tip}/>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible', cursor:'crosshair'}}>
        {Array.from({length:ticks+1},(_,i)=>i).map(i=>{
          const v = (maxV/ticks)*i;
          return <g key={i}>
            <line x1={PL} y1={yp(v)} x2={W-PR} y2={yp(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1}/>
            <text x={PL-4} y={yp(v)+4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="end">{v.toFixed(v<10?1:0)}{yUnit}</text>
          </g>;
        })}
        {warningLine && <><line x1={PL} y1={yp(warningLine)} x2={W-PR} y2={yp(warningLine)} stroke="#F59E0B" strokeWidth={1} strokeDasharray="4,2"/>
          <text x={W-PR+2} y={yp(warningLine)+4} fill="#F59E0B" fontSize={8}>warn</text></>}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round"/>
        {vals.map((v,i)=>(
          <circle key={i} cx={xp(i)} cy={yp(v)} r={5}
            fill={v>=(warningLine||Infinity)?'#EF4444':color}
            stroke="rgba(0,0,0,0.4)" strokeWidth={1}
            style={{cursor:'pointer'}}
            onMouseEnter={e=>setTip({x:e.clientX, y:e.clientY, label:data[i].month_label, value:`${fmt(v,2)}${yUnit}`, sub: tooltipLabel})}
            onMouseLeave={()=>setTip(null)}
          />
        ))}
        {data.map((d,i)=>i%(Math.ceil(data.length/6))===0&&<text key={i} x={xp(i)} y={H-4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="middle">{d.month_label}</text>)}
      </svg>
    </>
  );
}

function BarChart({ data, yKey, label, color='#B45309', yUnit='', tooltipLabel }) {
  const [tip, setTip] = useState(null);
  if (!data?.length) return <div className="text-slate-500 text-xs text-center py-8">No data</div>;
  const W=560,H=160,PL=42,PR=12,PT=12,PB=36;
  const cW=W-PL-PR, cH=H-PT-PB;
  const vals = data.map(d=>parseFloat(d[yKey])||0);
  const maxV = Math.max(...vals)*1.15||10;
  const bW = Math.max(4, (cW/data.length)*0.7);
  const gap = cW/data.length;
  const ticks = 4;
  return (
    <>
      <Tooltip tip={tip}/>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible'}}>
        {Array.from({length:ticks+1},(_,i)=>i).map(i=>{
          const v=(maxV/ticks)*i;
          return <g key={i}>
            <line x1={PL} y1={PT+cH-(v/maxV)*cH} x2={W-PR} y2={PT+cH-(v/maxV)*cH} stroke="rgba(255,255,255,0.04)" strokeWidth={1}/>
            <text x={PL-4} y={PT+cH-(v/maxV)*cH+4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="end">{v.toFixed(v<10?1:0)}{yUnit}</text>
          </g>;
        })}
        {vals.map((v,i)=>{
          const x = PL + i*gap + (gap-bW)/2;
          const bH = (v/maxV)*cH;
          return <rect key={i} x={x} y={PT+cH-bH} width={bW} height={bH} fill={color} rx={2} opacity={0.85}
            style={{cursor:'pointer'}}
            onMouseEnter={e=>setTip({x:e.clientX, y:e.clientY, label:data[i].month_label, value:`${fmt(v,2)}${yUnit}`, sub: tooltipLabel})}
            onMouseLeave={()=>setTip(null)}
          />;
        })}
        {data.map((d,i)=>i%(Math.ceil(data.length/6))===0&&<text key={i} x={PL+i*gap+gap/2} y={H-4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="middle">{d.month_label}</text>)}
      </svg>
    </>
  );
}

function CIIBadge({ rating, attained, required, context }) {
  const colors = { A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626' };
  const col = colors[rating]||'#94A3B8';
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/5" style={{background:'var(--card-bg)'}}>
      <div className="text-xs text-slate-500 mb-2">CII Rating (estimated)</div>
      <div className="text-6xl font-bold" style={{color:col}}>{rating}</div>
      <div className="text-xs text-slate-400 mt-2">Attained: <span style={{color:col}}>{fmt(attained,3)}</span></div>
      <div className="text-xs text-slate-500">Required: {fmt(required,3)}</div>
      {context && <div className="text-[10px] text-slate-600 mt-2 text-center px-2">{context}</div>}
      <div className="flex gap-1 mt-2">
        {['A','B','C','D','E'].map(l=>(
          <div key={l} className="px-2 py-0.5 rounded text-xs font-bold" style={{background:colors[l],color:'#fff',opacity:l===rating?1:0.3}}>{l}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared vessel selector ───────────────────────────────────────────────────
function useVesselSelector(vessels, user) {
  const isVesselUser = user?.role === 'vessel';
  const [vesselId, setVesselId] = useState('');

  useEffect(() => {
    if (!vessels.length) return;
    if (isVesselUser && user?.vessel_names?.length) {
      // Auto-match vessel by name (case-insensitive)
      const matched = vessels.find(v =>
        user.vessel_names.some(n => n.toLowerCase().includes(v.name.toLowerCase().replace('lpg ','')) ||
          v.name.toLowerCase().includes(n.toLowerCase().replace('lpg ','')))
      );
      if (matched) { setVesselId(String(matched.id)); return; }
    }
    if (!vesselId) setVesselId(String(vessels[0].id));
  }, [vessels]);

  return { vesselId, setVesselId, isVesselUser };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function LPGDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState('');
  const { vesselId, setVesselId, isVesselUser } = useVesselSelector(vessels, user);

  useEffect(() => {
    api.get('/api/lpg/vessels').then(r => setVessels(r)).catch(e => setFetchErr(e.message));
  }, []);

  useEffect(() => {
    if (!vesselId) return;
    setLoading(true); setFetchErr('');
    api.get(`/api/lpg/analytics?vessel_id=${vesselId}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setFetchErr(e.message || 'Failed to load analytics'); setLoading(false); });
  }, [vesselId, vessels.length]);

  const isAdmin = ['admin','manager','superintendent'].includes(user?.role);

  if (loading) return <div className="p-6 text-center text-slate-500 pt-20">Loading analytics…</div>;
  if (fetchErr) return (
    <div className="p-6 max-w-2xl mx-auto mt-12 rounded-xl border border-red-800/40 bg-red-900/10 text-red-300 text-sm space-y-2">
      <div className="font-semibold text-red-200 text-base">Analytics failed to load</div>
      <div className="font-mono text-xs bg-red-950/40 rounded p-3 break-all">{fetchErr}</div>
      <div className="text-slate-400 text-xs">This usually means a database column is missing. The schema migration should fix this on next deploy — try refreshing.</div>
    </div>
  );
  if (!data) return <div className="p-6 text-red-400">No data returned.</div>;

  const { monthly, totals, cii, anomalies } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">LPG Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Performance analytics — Alfred Temile</p>
        </div>
        <div className="flex gap-3 items-center">
          <HelpButton type="lpg" />
          {!isVesselUser && (
            <select value={vesselId} onChange={e=>setVesselId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
              {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <button onClick={()=>nav('/lpg/import')}
              className="px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm transition-colors">
              Import XLS
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Distance" value={`${fmt0(totals.total_dist)} NM`} color="blue"/>
        <StatCard label="Total VLSFO" value={`${fmt(totals.total_vlsfo)} MT`} color="amber"/>
        <StatCard label="Total CO₂" value={`${fmt(totals.total_co2)} MT`} color="red"/>
        <StatCard label="Sea Hours" value={`${fmt(totals.total_sea_hrs,0)} hrs`}/>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CIIBadge rating={cii.rating} attained={cii.attained} required={cii.ciiReq}
          context="IMO MEPC.339(76) — small coastal LPG carriers typically attain E under this framework"/>
        <div className="md:col-span-2 rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Alerts & Anomalies</h3>
            <span className={`px-2 py-0.5 text-xs rounded ${anomalies.length > 0 ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
              {anomalies.length > 0 ? `${anomalies.length} items` : '✓ Clear'}
            </span>
          </div>
          {anomalies.length === 0 ? (
            <div className="text-sm text-green-400 flex items-center gap-2"><span>✓</span> No anomalies detected</div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {anomalies.map((a,i)=>(
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-red-900/20 border border-red-700/20">
                  <span className="text-red-400 mt-0.5">⚠</span>
                  <div>
                    <span className="text-slate-300 font-mono">{fmtD(a.record_date)}</span>
                    {a.anomaly_type === 'high_slip' && <span className="ml-2 text-amber-300">Slip {fmt(a.slip)}% (sea passage) — possible hull fouling</span>}
                    {a.anomaly_type === 'neg_fuel' && <span className="ml-2 text-red-300">Negative VLSFO total ({fmt(a.vlsfo_total_cons)} MT) — check entry</span>}
                    {a.anomaly_type === 'flowmeter_anomaly' && <span className="ml-2 text-orange-300">Flow meter anomaly detected</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-200">Propeller Slip Trend</h3>
            <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>Monthly avg (sea passages only) — dashed = 6% hull fouling threshold</p>
          </div>
          <LineChart data={monthly} yKey="avg_slip" color="#3B82F6" warningLine={6} yUnit="%" tooltipLabel="Avg propeller slip"/>
        </div>
        <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-200">VLSFO Consumption</h3>
            <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>Monthly total (MT)</p>
          </div>
          <BarChart data={monthly} yKey="vlsfo_cons" color="#B45309" yUnit=" MT" tooltipLabel="VLSFO consumed"/>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-200">Cylinder Oil Consumption Rate</h3>
            <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>L per ME running hour</p>
          </div>
          <LineChart
            data={monthly.map(m=>({...m, cyl_rate: n0(m.me_running_hrs)>0 ? (n0(m.cyl_oil_cons)/n0(m.me_running_hrs)).toFixed(2) : 0}))}
            yKey="cyl_rate" color="#10B981" yUnit=" L/hr" tooltipLabel="Cyl oil rate (L/ME hr)"/>
        </div>
        <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-200">Average AE Load</h3>
            <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>Monthly avg generator load (kW)</p>
          </div>
          <LineChart data={monthly} yKey="avg_ae_kw" color="#A78BFA" yUnit=" kW" tooltipLabel="Avg AE load"/>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 overflow-hidden" style={{background:'var(--card-bg)'}}>
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-slate-200">Monthly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
                {['Month','Records','Sea Hrs','Dist NM','VLSFO MT','LSMGO MT','CO₂ MT','Avg Slip %','Cyl Oil L','ME Hrs','Cargo Plant Hrs'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.slice().reverse().map((m,i)=>(
                <tr key={m.month_key} onClick={()=>nav(`/lpg/history/${m.month_key}?vessel_id=${vesselId}`)}
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                  style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
                  <td className="px-3 py-2 font-medium text-amber-300">{m.month_label}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{m.records}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(m.sea_hrs,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt0(m.obs_dist)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-300">{fmt(m.vlsfo_cons)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(m.lsmgo_cons)}</td>
                  <td className="px-3 py-2 text-right text-red-300">{fmt(m.co2_mt)}</td>
                  <td className="px-3 py-2 text-right" style={{color:parseFloat(m.avg_slip)>6?'#EF4444':'#94a3b8'}}>{fmt(m.avg_slip)}</td>
                  <td className="px-3 py-2 text-right text-green-300">{fmt(m.cyl_oil_cons,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(m.me_running_hrs,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(m.rp_hrs,1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── History (monthly list) ───────────────────────────────────────────────────
export function LPGHistory() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [months, setMonths] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState('');
  const { vesselId, setVesselId, isVesselUser } = useVesselSelector(vessels, user);

  useEffect(() => {
    api.get('/api/lpg/vessels').then(r => setVessels(r)).catch(e => setFetchErr(e.message));
  }, []);

  useEffect(() => {
    if (!vesselId) return;
    setLoading(true); setFetchErr('');
    api.get(`/api/lpg/months?vessel_id=${vesselId}`)
      .then(r => { setMonths(r); setLoading(false); })
      .catch(e => { setFetchErr(e.message || 'Failed to load months'); setLoading(false); });
  }, [vesselId, vessels.length]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">History</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monthly noon log records</p>
        </div>
        <div className="flex gap-3 items-center">
          {!isVesselUser && (
            <select value={vesselId} onChange={e=>setVesselId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
              {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          <span className="text-sm text-slate-500">{months.length} months</span>
        </div>
      </div>

      {fetchErr ? (
        <div className="rounded-xl border border-red-800/40 bg-red-900/10 text-red-300 text-sm p-5 space-y-2">
          <div className="font-semibold text-red-200">Failed to load records</div>
          <div className="font-mono text-xs bg-red-950/40 rounded p-3 break-all">{fetchErr}</div>
          <div className="text-slate-400 text-xs">A database schema migration will run on next deploy. Try refreshing.</div>
        </div>
      ) : loading ? (
        <div className="text-center py-20 text-slate-500">Loading…</div>
      ) : months.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <div className="text-4xl mb-3">📋</div>
          <div>No records yet.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden" style={{background:'var(--card-bg)'}}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
                {['Month','Period','Records','Sea Hrs','Distance NM','VLSFO (MT)','LSMGO (MT)','CO₂ (MT)','Avg Slip %','VLSFO ROB'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-amber-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m,i)=>(
                <tr key={m.month_key}
                  onClick={()=>nav(`/lpg/history/${m.month_key}?vessel_id=${vesselId}`)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
                  <td className="px-4 py-3 font-semibold text-amber-300">{m.month_label}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{fmtD(m.start_date)} → {fmtD(m.end_date)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{m.record_count}</td>
                  <td className="px-4 py-3 text-right text-blue-300">{fmt(m.sea_hrs,1)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt0(m.dist_nm)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-300">{fmt(m.vlsfo_cons)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt(m.lsmgo_cons)}</td>
                  <td className="px-4 py-3 text-right text-red-300">{fmt(m.co2_mt)}</td>
                  <td className="px-4 py-3 text-right" style={{color:parseFloat(m.avg_slip)>6?'#EF4444':'#94a3b8'}}>{fmt(m.avg_slip)}</td>
                  <td className="px-4 py-3 text-right text-blue-300">{fmt(m.vlsfo_rob_eom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Month Detail (5-tab) ─────────────────────────────────────────────────────
export function LPGMonthDetail() {
  const { month_key } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const vessel_id = new URLSearchParams(location.search).get('vessel_id') || '';

  useEffect(() => {
    setLoading(true);
    const q = vessel_id ? `?vessel_id=${vessel_id}` : '';
    api.get(`/api/lpg/months/${month_key}${q}`)
      .then(r => { setRecords(r); setLoading(false); })
      .catch(e => { console.error('[LPGMonthDetail]', e); setLoading(false); });
  }, [month_key]);

  if (loading) return <div className="p-6 text-center text-slate-500">Loading…</div>;

  const last = records[records.length-1] || {};
  const sum  = f => records.reduce((s,r)=>s+(n0(r[f])),0);
  const TABS = ['overview','fuel','engine','running hrs','fresh water'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={()=>nav('/lpg/history'+(vessel_id?`?vessel_id=${vessel_id}`:''))}
          className="text-slate-400 hover:text-slate-200 text-sm">← History</button>
        <span className="text-slate-600">/</span>
        <span className="font-bold text-amber-300 text-lg">{month_key}</span>
        <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded">{records.length} records</span>
        {records[0] && <span className="text-slate-500 text-sm">{fmtD(records[0].record_date)} → {fmtD(last.record_date)}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Sea Hours"       value={fmt(sum('sea_stm_hrs'),1)} color="blue"/>
        <StatCard label="Distance NM"     value={fmt0(sum('obs_dist'))}/>
        <StatCard label="VLSFO Consumed"  value={`${fmt(sum('vlsfo_total_cons'))} MT`} color="amber"/>
        <StatCard label="LSMGO Consumed"  value={`${fmt(sum('lsmgo_cons_total'))} MT`}/>
        <StatCard label="Total CO₂"       value={`${fmt(sum('co2_emitted_mt'))} MT`} color="red"/>
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/5">
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${tab===t?'text-amber-300 border-b-2 border-amber-400':'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/5 overflow-x-auto" style={{background:'var(--card-bg)'}}>
        {tab==='overview' && (
          <table className="w-full text-xs"><thead><tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
            {['Date','Time','Mode','Status','Voyage','Sea Hrs','Anch','Manv','Tot Hrs','Dist NM','Obs Spd'].map(h=>(
              <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>{records.map((r,i)=>(
            <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
              <td className="px-3 py-2 text-amber-300 font-mono">{fmtD(r.record_date)}</td>
              <td className="px-3 py-2 text-slate-400">{r.record_time||'—'}</td>
              <td className="px-3 py-2 text-slate-300">{r.mode||'—'}</td>
              <td className="px-3 py-2 text-slate-400 max-w-xs truncate">{r.status||'—'}</td>
              <td className="px-3 py-2 text-slate-400 font-mono">{r.voyage_number||'—'}</td>
              <td className="px-3 py-2 text-right text-blue-300">{fmt(r.sea_stm_hrs,1)}</td>
              <td className="px-3 py-2 text-right text-slate-400">{fmt(r.anch_drift_hrs,1)}</td>
              <td className="px-3 py-2 text-right text-slate-400">{fmt(r.manv_hrs,1)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{fmt(r.total_hrs,1)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{fmt(r.obs_dist,1)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{fmt(r.obs_speed,2)}</td>
            </tr>
          ))}</tbody></table>
        )}
        {tab==='fuel' && (
          <table className="w-full text-xs"><thead><tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
            {['Date','VLSFO ME','VLSFO AE','VLSFO Blr','VLSFO Total','VLSFO ROB','Bunkered','LSMGO ME','LSMGO AE','LSMGO Tot','LSMGO ROB','CO₂ MT'].map(h=>(
              <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>
            {records.map((r,i)=>(
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
                <td className="px-3 py-2 text-amber-300 font-mono">{fmtD(r.record_date)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.vlsfo_cons_me)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.vlsfo_cons_ae)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.vlsfo_cons_blr)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-300">{fmt(r.vlsfo_total_cons)}</td>
                <td className="px-3 py-2 text-right text-blue-300">{fmt(r.vlsfo_rob)}</td>
                <td className="px-3 py-2 text-right text-green-300">{r.vlsfo_bunkered_qty>0?fmt(r.vlsfo_bunkered_qty):'—'}</td>
                <td className="px-3 py-2 text-right">{fmt(r.lsmgo_cons_me)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.lsmgo_cons_ae_ig_incn)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.lsmgo_cons_total)}</td>
                <td className="px-3 py-2 text-right text-blue-300">{fmt(r.lsmgo_rob)}</td>
                <td className="px-3 py-2 text-right text-red-300">{fmt(r.co2_emitted_mt)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-amber-700/50 font-semibold" style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
              <td className="px-3 py-2 text-amber-400">TOTALS</td>
              {['vlsfo_cons_me','vlsfo_cons_ae','vlsfo_cons_blr','vlsfo_total_cons'].map(f=>(
                <td key={f} className="px-3 py-2 text-right text-amber-300">{fmt(sum(f))}</td>
              ))}
              <td className="px-3 py-2 text-right text-blue-300">{fmt(last.vlsfo_rob)}</td>
              <td className="px-3 py-2 text-right text-green-300">{fmt(sum('vlsfo_bunkered_qty'))}</td>
              {['lsmgo_cons_me','lsmgo_cons_ae_ig_incn','lsmgo_cons_total'].map(f=>(
                <td key={f} className="px-3 py-2 text-right text-amber-300">{fmt(sum(f))}</td>
              ))}
              <td className="px-3 py-2 text-right text-blue-300">{fmt(last.lsmgo_rob)}</td>
              <td className="px-3 py-2 text-right text-red-300">{fmt(sum('co2_emitted_mt'))}</td>
            </tr>
          </tbody></table>
        )}
        {tab==='engine' && (
          <table className="w-full text-xs"><thead><tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
            {['Date','CTR','RPM','Eng Dist','Obs Spd','Obs Dist','Slip %','BHP','KW','FO Dens'].map(h=>(
              <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>{records.map((r,i)=>(
            <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
              <td className="px-3 py-2 text-amber-300 font-mono">{fmtD(r.record_date)}</td>
              <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmt0(r.me_counter)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{fmt(r.me_rpm,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.engine_dist,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.obs_speed,2)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.obs_dist,1)}</td>
              <td className="px-3 py-2 text-right" style={{color:parseFloat(r.slip)>6?'#EF4444':'#94a3b8'}}>{fmt(r.slip,2)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.me_bhp,0)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.me_kw,0)}</td>
              <td className="px-3 py-2 text-right text-slate-400">{fmt(r.fo_density_15c,4)}</td>
            </tr>
          ))}</tbody></table>
        )}
        {tab==='running hrs' && (
          <table className="w-full text-xs"><thead><tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
            {['Date','AE1 RHR','AE2 RHR','AE3 RHR','DG Total','AE Avg KW','Cargo Plant','RP1','RP2','RP3','RP Total','Cyl Oil L','Alexia70'].map(h=>(
              <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>{records.map((r,i)=>(
            <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
              <td className="px-3 py-2 text-amber-300 font-mono">{fmtD(r.record_date)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.ae1_rhr,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.ae2_rhr,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.ae3_rhr,1)}</td>
              <td className="px-3 py-2 text-right text-blue-300">{fmt(r.ae_total_dg_rhr,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.ae_avg_kw,0)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.cargo_plant_rhr,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.rp1_rhr,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.rp2_rhr,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.rp3_rhr,1)}</td>
              <td className="px-3 py-2 text-right text-amber-300">{fmt(r.rp_total_hrs,1)}</td>
              <td className="px-3 py-2 text-right text-green-300">{fmt(r.cyl_oil_cons,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.cyl_alexia70_rob,0)}</td>
            </tr>
          ))}</tbody></table>
        )}
        {tab==='fresh water' && (
          <table className="w-full text-xs"><thead><tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
            {['Date','FWG Counter','Dist Prod','Dist Cons','Dom Prod','Dom Cons','Total ROB','Port Tk','Stbd Tk'].map(h=>(
              <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>{records.map((r,i)=>(
            <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
              <td className="px-3 py-2 text-amber-300 font-mono">{fmtD(r.record_date)}</td>
              <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmt0(r.fw_fwg_counter)}</td>
              <td className="px-3 py-2 text-right text-green-300">{fmt(r.fw_distilled_prod,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.fw_distilled_cons,1)}</td>
              <td className="px-3 py-2 text-right text-green-300">{fmt(r.fw_dom_prod,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.fw_dom_cons,1)}</td>
              <td className="px-3 py-2 text-right text-blue-300">{fmt(r.fw_total_rob,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.fw_port_tk,1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.fw_stbd_tk,1)}</td>
            </tr>
          ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

// ─── Noon Form ────────────────────────────────────────────────────────────────
function Field({ label, name, value, onChange, type='number', required }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-0.5">{label}{required&&<span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} name={name} value={value??''} onChange={onChange}
        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200 text-sm focus:border-amber-600 focus:outline-none transition-colors"
        style={{appearance:'textfield'}}/>
    </div>
  );
}

function Section({ title, children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/5 overflow-hidden" style={{background:'var(--card-bg)'}}>
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-white/5 transition-colors">
        <span className="font-semibold text-sm text-slate-200">{title}</span>
        <span className="text-slate-400 text-xs">{open?'▲':'▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 pt-2 grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>}
    </div>
  );
}

export function LPGNoonForm() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [vessels, setVessels] = useState([]);
  const [form, setForm] = useState({
    vessel_id:'', record_date:new Date().toISOString().slice(0,10),
    record_time:'1200', mode:'Noon', status:'', voyage_number:'',
    berth_hrs:'', anch_drift_hrs:'', manv_hrs:'', sea_stm_hrs:'', total_hrs:'',
    me_running_hrs:'', me_counter:'', me_revs:'', me_rpm:'',
    engine_dist:'', obs_speed:'', obs_dist:'', dist_to_go:'', slip:'',
    me_bhp:'', me_kw:'',
    vlsfo_cons_me:'', vlsfo_cons_ae:'', vlsfo_cons_blr:'', vlsfo_total_cons:'', vlsfo_rob:'', vlsfo_bunkered_qty:'',
    lsmgo_cons_me:'', lsmgo_cons_ae_ig_incn:'', lsmgo_cons_total:'', lsmgo_rob:'', lsmgo_bunkered_qty:'',
    ae1_rhr:'', ae2_rhr:'', ae3_rhr:'', ae_total_dg_rhr:'', ae_avg_kw:'',
    cargo_plant_rhr:'', rp1_rhr:'', rp2_rhr:'', rp3_rhr:'', rp_total_hrs:'',
    cyl_oil_cons:'', cyl_alexia70_rob:'', cyl_melina30_rob:'',
    fw_fwg_counter:'', fw_distilled_prod:'', fw_distilled_cons:'',
    fw_dom_prod:'', fw_dom_cons:'', fw_total_rob:'', fw_port_tk:'', fw_stbd_tk:'',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const { vesselId: autoVesselId, isVesselUser } = useVesselSelector(vessels, user);

  useEffect(() => {
    api.get('/api/lpg/vessels').then(r => {
      setVessels(r);
      if (r.length) setForm(f => ({...f, vessel_id: String(r[0].id)}));
    });
  }, []);

  useEffect(() => {
    if (autoVesselId && isVesselUser) setForm(f => ({...f, vessel_id: autoVesselId}));
  }, [autoVesselId]);

  const chg = e => {
    const { name, value } = e.target;
    setForm(f => {
      const next = {...f, [name]: value};
      if (['sea_stm_hrs','anch_drift_hrs','manv_hrs','berth_hrs'].includes(name)) {
        const tot = n0(name==='sea_stm_hrs'?value:f.sea_stm_hrs) + n0(name==='anch_drift_hrs'?value:f.anch_drift_hrs) +
                    n0(name==='manv_hrs'?value:f.manv_hrs) + n0(name==='berth_hrs'?value:f.berth_hrs);
        if (tot > 0) next.total_hrs = tot.toFixed(1);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!form.vessel_id || !form.record_date) { setError('Vessel and date are required'); return; }
    setSaving(true); setError('');
    const payload = Object.fromEntries(Object.entries(form).map(([k,v])=>[k,v===''?null:v]));
    try {
      const res = await fetch('/api/lpg/noon', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+api.getToken()},
        body:JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'Save failed');
      setSaved(data);
    } catch(e) { setError(e.message); }
    setSaving(false);
  };

  if (saved) return (
    <div className="p-6 max-w-2xl mx-auto text-center pt-20">
      <div className="text-4xl mb-3">✅</div>
      <div className="text-green-300 font-bold text-lg mb-2">Record saved</div>
      <div className="text-slate-400 text-sm mb-6">{fmtD(saved.record_date)} — {saved.status||saved.mode}</div>
      <div className="flex gap-3 justify-center">
        <button onClick={()=>{setSaved(null);setForm(f=>({...f,record_date:new Date().toISOString().slice(0,10),status:''}))}}
          className="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium">Add Another</button>
        <button onClick={()=>nav('/lpg/history')} className="px-5 py-2 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5">View History</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Daily Noon Reading</h1>
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-900/30 text-red-300 text-sm">{error}</div>}
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-700/30 p-5" style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {!isVesselUser ? (
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">Vessel<span className="text-red-400 ml-0.5">*</span></label>
                <select name="vessel_id" value={form.vessel_id} onChange={chg}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
                  {vessels.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">Vessel</label>
                <div className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-white/5 text-slate-300 text-sm">
                  {vessels.find(v=>String(v.id)===String(form.vessel_id))?.name || '—'}
                </div>
              </div>
            )}
            <Field label="Date *"   name="record_date"  value={form.record_date}  onChange={chg} type="date" required/>
            <Field label="Time"     name="record_time"  value={form.record_time}  onChange={chg} type="text"/>
            <Field label="Mode"     name="mode"         value={form.mode}         onChange={chg} type="text"/>
            <div className="md:col-span-2">
              <Field label="Status / Position" name="status" value={form.status} onChange={chg} type="text"/>
            </div>
            <Field label="Voyage Ref" name="voyage_number" value={form.voyage_number} onChange={chg} type="text"/>
          </div>
        </div>
        <Section title="Hours Breakdown">
          <Field label="Sea Steam Hrs"    name="sea_stm_hrs"    value={form.sea_stm_hrs}    onChange={chg}/>
          <Field label="Anchor/Drift Hrs" name="anch_drift_hrs" value={form.anch_drift_hrs} onChange={chg}/>
          <Field label="Manoeuvring Hrs"  name="manv_hrs"       value={form.manv_hrs}        onChange={chg}/>
          <Field label="Berth Hrs"        name="berth_hrs"      value={form.berth_hrs}        onChange={chg}/>
          <Field label="Total Hrs"        name="total_hrs"      value={form.total_hrs}        onChange={chg}/>
        </Section>
        <Section title="Main Engine & Navigation">
          <Field label="ME Counter (CTR)" name="me_counter"  value={form.me_counter}  onChange={chg}/>
          <Field label="Revolutions"       name="me_revs"     value={form.me_revs}     onChange={chg}/>
          <Field label="RPM"               name="me_rpm"      value={form.me_rpm}      onChange={chg}/>
          <Field label="Engine Dist"       name="engine_dist" value={form.engine_dist} onChange={chg}/>
          <Field label="Obs Speed (kts)"   name="obs_speed"   value={form.obs_speed}   onChange={chg}/>
          <Field label="Obs Dist (NM)"     name="obs_dist"    value={form.obs_dist}    onChange={chg}/>
          <Field label="Dist to Go (NM)"   name="dist_to_go"  value={form.dist_to_go}  onChange={chg}/>
          <Field label="Slip (%)"          name="slip"        value={form.slip}        onChange={chg}/>
          <Field label="BHP"               name="me_bhp"      value={form.me_bhp}      onChange={chg}/>
          <Field label="KW"                name="me_kw"       value={form.me_kw}       onChange={chg}/>
          <Field label="ME Running Hrs"    name="me_running_hrs" value={form.me_running_hrs} onChange={chg}/>
        </Section>
        <Section title="Fuel — VLSFO">
          <Field label="ME Cons (MT)"     name="vlsfo_cons_me"    value={form.vlsfo_cons_me}    onChange={chg}/>
          <Field label="AE Cons (MT)"     name="vlsfo_cons_ae"    value={form.vlsfo_cons_ae}    onChange={chg}/>
          <Field label="Boiler Cons (MT)" name="vlsfo_cons_blr"   value={form.vlsfo_cons_blr}   onChange={chg}/>
          <Field label="Total Cons (MT)"  name="vlsfo_total_cons" value={form.vlsfo_total_cons} onChange={chg}/>
          <Field label="ROB (MT)"         name="vlsfo_rob"        value={form.vlsfo_rob}        onChange={chg}/>
          <Field label="Bunkered (MT)"    name="vlsfo_bunkered_qty" value={form.vlsfo_bunkered_qty} onChange={chg}/>
        </Section>
        <Section title="Fuel — LSMGO" defaultOpen={false}>
          <Field label="ME (MT)"         name="lsmgo_cons_me"        value={form.lsmgo_cons_me}        onChange={chg}/>
          <Field label="AE/IG/INCN (MT)" name="lsmgo_cons_ae_ig_incn" value={form.lsmgo_cons_ae_ig_incn} onChange={chg}/>
          <Field label="Total (MT)"      name="lsmgo_cons_total"     value={form.lsmgo_cons_total}     onChange={chg}/>
          <Field label="ROB (MT)"        name="lsmgo_rob"            value={form.lsmgo_rob}            onChange={chg}/>
          <Field label="Bunkered (MT)"   name="lsmgo_bunkered_qty"   value={form.lsmgo_bunkered_qty}   onChange={chg}/>
        </Section>
        <Section title="Running Hours" defaultOpen={false}>
          <Field label="AE No.1 RHR" name="ae1_rhr"       value={form.ae1_rhr}       onChange={chg}/>
          <Field label="AE No.2 RHR" name="ae2_rhr"       value={form.ae2_rhr}       onChange={chg}/>
          <Field label="AE No.3 RHR" name="ae3_rhr"       value={form.ae3_rhr}       onChange={chg}/>
          <Field label="Total DG Hrs" name="ae_total_dg_rhr" value={form.ae_total_dg_rhr} onChange={chg}/>
          <Field label="AE Avg Load (kW)" name="ae_avg_kw" value={form.ae_avg_kw} onChange={chg}/>
          <Field label="Cargo Plant RHR" name="cargo_plant_rhr" value={form.cargo_plant_rhr} onChange={chg}/>
          <Field label="RP1 Hrs" name="rp1_rhr" value={form.rp1_rhr} onChange={chg}/>
          <Field label="RP2 Hrs" name="rp2_rhr" value={form.rp2_rhr} onChange={chg}/>
          <Field label="RP3 Hrs" name="rp3_rhr" value={form.rp3_rhr} onChange={chg}/>
          <Field label="RP Total Hrs" name="rp_total_hrs" value={form.rp_total_hrs} onChange={chg}/>
        </Section>
        <Section title="Cylinder & Lube Oil" defaultOpen={false}>
          <Field label="Cyl Oil Consumption (L)" name="cyl_oil_cons"   value={form.cyl_oil_cons}   onChange={chg}/>
          <Field label="Alexia 70 ROB (L)"        name="cyl_alexia70_rob" value={form.cyl_alexia70_rob} onChange={chg}/>
          <Field label="Melina 30 ROB (L)"        name="cyl_melina30_rob" value={form.cyl_melina30_rob} onChange={chg}/>
        </Section>
        <Section title="Fresh Water" defaultOpen={false}>
          <Field label="FWG Counter"      name="fw_fwg_counter"   value={form.fw_fwg_counter}   onChange={chg}/>
          <Field label="Distilled Prod (T)" name="fw_distilled_prod" value={form.fw_distilled_prod} onChange={chg}/>
          <Field label="Distilled Cons (T)" name="fw_distilled_cons" value={form.fw_distilled_cons} onChange={chg}/>
          <Field label="Domestic Cons (T)"  name="fw_dom_cons"      value={form.fw_dom_cons}      onChange={chg}/>
          <Field label="Total ROB (T)"      name="fw_total_rob"     value={form.fw_total_rob}     onChange={chg}/>
          <Field label="Port Tank (T)"      name="fw_port_tk"       value={form.fw_port_tk}       onChange={chg}/>
          <Field label="Stbd Tank (T)"      name="fw_stbd_tk"       value={form.fw_stbd_tk}       onChange={chg}/>
        </Section>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={()=>nav('/lpg')} className="px-5 py-2.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5 transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
          className="flex-1 px-5 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
          {saving?'Saving…':'Save Noon Record'}
        </button>
      </div>
    </div>
  );
}

// ─── Import ───────────────────────────────────────────────────────────────────
export function LPGImport() {
  const nav = useNavigate();
  const fileRef = useRef();
  const [step, setStep] = useState('upload');
  const [preview, setPreview] = useState(null);
  const [vesselId, setVesselId] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async f => {
    if (!f) return;
    setFile(f); setBusy(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await api.upload('/api/lpg/import/preview', fd);
      setPreview(res);
      if (res.vessels?.length) setVesselId(String(res.vessels[0].id));
      setStep('preview');
    } catch(e) { setError(e.message); }
    setBusy(false);
  };

  const handleConfirm = async () => {
    if (!vesselId) { setError('Select a vessel'); return; }
    setBusy(true); setError(''); setStep('confirming');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('vessel_id', vesselId);
      const res = await api.upload('/api/lpg/import/confirm', fd);
      setResult(res); setStep('done');
    } catch(e) { setError(e.message); setStep('preview'); }
    setBusy(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={()=>nav('/lpg')} className="text-slate-400 hover:text-slate-200 text-sm">← Back</button>
        <h1 className="text-xl font-bold text-slate-100">Import Noon Log</h1>
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-900/30 text-red-300 text-sm">{error}</div>}
      {step==='upload' && (
        <div className="rounded-xl border-2 border-dashed border-white/10 p-12 text-center"
          onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}>
          <div className="text-4xl mb-3">📊</div>
          <div className="text-slate-300 font-medium mb-1">Drop Alfred Temile noon log XLS here</div>
          <div className="text-slate-500 text-sm mb-4">or click to browse</div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e=>handleFile(e.target.files[0])}/>
          <button onClick={()=>fileRef.current.click()} disabled={busy}
            className="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {busy?'Parsing…':'Browse File'}
          </button>
        </div>
      )}
      {step==='preview' && preview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 p-5" style={{background:'var(--card-bg)'}}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Records found</span><div className="text-amber-300 font-bold text-lg">{preview.total}</div></div>
              <div><span className="text-slate-500">Voyages</span><div className="text-slate-200 font-bold text-lg">{preview.voyages?.length||0}</div></div>
              <div><span className="text-slate-500">From</span><div className="text-slate-300">{preview.date_from}</div></div>
              <div><span className="text-slate-500">To</span><div className="text-slate-300">{preview.date_to}</div></div>
            </div>
          </div>
          <div className="rounded-xl border border-white/5 p-5" style={{background:'var(--card-bg)'}}>
            <label className="block text-sm text-slate-400 mb-2">Assign to vessel</label>
            <select value={vesselId} onChange={e=>setVesselId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
              {(preview.vessels||[]).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={()=>{setStep('upload');setPreview(null);setFile(null);}}
              className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5">Cancel</button>
            <button onClick={handleConfirm} disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-50">
              Import {preview.total} Records
            </button>
          </div>
        </div>
      )}
      {step==='confirming' && <div className="text-center py-20"><div className="text-4xl mb-3 animate-pulse">⚙️</div><div className="text-slate-300">Importing…</div></div>}
      {step==='done' && result && (
        <div className="rounded-xl border border-green-700/30 p-6 text-center" style={{background:'rgba(6,78,59,0.15)'}}>
          <div className="text-4xl mb-3">✅</div>
          <div className="text-green-300 font-bold text-lg mb-1">Import Complete</div>
          <div className="text-slate-400 text-sm space-y-1">
            <div>Total: <span className="text-slate-200">{result.total}</span></div>
            <div>Inserted: <span className="text-green-300">{result.inserted}</span></div>
            {result.errors>0&&<div>Errors: <span className="text-red-300">{result.errors}</span></div>}
          </div>
          <button onClick={()=>nav('/lpg')} className="mt-4 px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium">
            View Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
