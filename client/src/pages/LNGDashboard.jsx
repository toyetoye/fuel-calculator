import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';
import { HelpButton } from '../HelpModal';

const fmt  = (v,d=2) => (v==null||isNaN(v)||v==='')?'—':Number(v).toFixed(d);
const fmt0 = v => (v==null||isNaN(v))?'—':Math.round(Number(v)).toLocaleString();

function StatCard({ label, value, sub, color='slate' }) {
  const cols = { amber:'text-amber-300', green:'text-green-300', blue:'text-blue-300', red:'text-red-300', teal:'text-teal-300', slate:'text-slate-100' };
  return (
    <div className="rounded-lg p-4 border border-white/5" style={{background:'var(--card-bg)'}}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${cols[color]||cols.slate}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{
      position:'fixed', left:tip.x+14, top:tip.y-10, zIndex:9999,
      background:'rgba(15,23,42,0.97)', border:'1px solid rgba(255,255,255,0.12)',
      borderRadius:8, padding:'7px 12px', pointerEvents:'none',
      boxShadow:'0 4px 20px rgba(0,0,0,0.5)', minWidth:130
    }}>
      <div style={{color:'#94a3b8',fontSize:10,marginBottom:2}}>{tip.label}</div>
      <div style={{color:'#f1f5f9',fontSize:14,fontWeight:700}}>{tip.value}</div>
      {tip.sub && <div style={{color:'#64748b',fontSize:10,marginTop:2}}>{tip.sub}</div>}
    </div>
  );
}

function LineChart({ data, yKey, color='#3B82F6', warningLine, yUnit='', tooltipLabel }) {
  const [tip, setTip] = useState(null);
  if (!data?.length) return <div className="text-slate-600 text-xs text-center py-8 italic">No voyage data recorded yet</div>;
  const W=560,H=160,PL=46,PR=16,PT=12,PB=36;
  const cW=W-PL-PR, cH=H-PT-PB;
  const vals = data.map(d=>parseFloat(d[yKey])||0);
  const maxV = Math.max(...vals, warningLine||0)*1.15||10;
  const xp = i => PL + (data.length<2?cW/2:(i/(data.length-1))*cW);
  const yp = v => PT + cH - (v/maxV)*cH;
  const path = vals.map((v,i)=>`${i===0?'M':'L'}${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');
  return (
    <>
      <Tooltip tip={tip}/>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible',cursor:'crosshair'}}>
        {[0,1,2,3,4].map(i=>{
          const v=(maxV/4)*i;
          return <g key={i}>
            <line x1={PL} y1={yp(v)} x2={W-PR} y2={yp(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1}/>
            <text x={PL-4} y={yp(v)+4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="end">{v<1000?v.toFixed(v<10?1:0):Math.round(v/1000)+'k'}{yUnit}</text>
          </g>;
        })}
        {warningLine!=null&&<><line x1={PL} y1={yp(warningLine)} x2={W-PR} y2={yp(warningLine)} stroke="#F59E0B" strokeWidth={1} strokeDasharray="4,2"/>
          <text x={W-PR+2} y={yp(warningLine)+4} fill="#F59E0B" fontSize={8}>0</text></>}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round"/>
        {vals.map((v,i)=>(
          <circle key={i} cx={xp(i)} cy={yp(v)} r={5}
            fill={warningLine!=null&&v>warningLine?'#EF4444':color} stroke="rgba(0,0,0,0.4)" strokeWidth={1}
            style={{cursor:'pointer'}}
            onMouseEnter={e=>setTip({x:e.clientX,y:e.clientY,label:data[i].month_label,value:`${fmt(v,2)}${yUnit}`,sub:tooltipLabel})}
            onMouseLeave={()=>setTip(null)}
          />
        ))}
        {data.map((d,i)=>i%(Math.ceil(data.length/6))===0&&(
          <text key={i} x={xp(i)} y={H-4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="middle">{d.month_label}</text>
        ))}
      </svg>
    </>
  );
}

function BarChart({ data, yKey, color='#0F766E', yUnit='', tooltipLabel }) {
  const [tip, setTip] = useState(null);
  if (!data?.length) return <div className="text-slate-600 text-xs text-center py-8 italic">No voyage data recorded yet</div>;
  const W=560,H=160,PL=46,PR=16,PT=12,PB=36;
  const cW=W-PL-PR, cH=H-PT-PB;
  const vals = data.map(d=>parseFloat(d[yKey])||0);
  const maxV = Math.max(...vals)*1.15||10;
  const gap = cW/data.length;
  const bW = Math.max(4,(cW/data.length)*0.7);
  return (
    <>
      <Tooltip tip={tip}/>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible'}}>
        {[0,1,2,3,4].map(i=>{
          const v=(maxV/4)*i;
          return <g key={i}>
            <line x1={PL} y1={PT+cH-(v/maxV)*cH} x2={W-PR} y2={PT+cH-(v/maxV)*cH} stroke="rgba(255,255,255,0.04)" strokeWidth={1}/>
            <text x={PL-4} y={PT+cH-(v/maxV)*cH+4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="end">{v<1000?v.toFixed(v<10?1:0):Math.round(v/1000)+'k'}{yUnit}</text>
          </g>;
        })}
        {vals.map((v,i)=>{
          const x=PL+i*gap+(gap-bW)/2, bH=(v/maxV)*cH;
          return <rect key={i} x={x} y={PT+cH-bH} width={bW} height={bH} fill={color} rx={2} opacity={0.85}
            style={{cursor:'pointer'}}
            onMouseEnter={e=>setTip({x:e.clientX,y:e.clientY,label:data[i].month_label,value:`${fmt(v,2)}${yUnit}`,sub:tooltipLabel})}
            onMouseLeave={()=>setTip(null)}
          />;
        })}
        {data.map((d,i)=>i%(Math.ceil(data.length/6))===0&&(
          <text key={i} x={PL+i*gap+gap/2} y={H-4} fill="var(--chart-label,#94a3b8)" fontSize={9} textAnchor="middle">{d.month_label}</text>
        ))}
      </svg>
    </>
  );
}

function CIIBadge({ rating, attained, required }) {
  const colors = { A:'#059669',B:'#0891B2',C:'#D97706',D:'#EA580C',E:'#DC2626' };
  const col = colors[rating]||'#94A3B8';
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/5" style={{background:'var(--card-bg)'}}>
      <div className="text-xs text-slate-500 mb-2">CII Rating (estimated)</div>
      <div className="text-6xl font-bold" style={{color:col}}>{rating||'—'}</div>
      <div className="text-xs text-slate-400 mt-2">Attained: <span style={{color:col}}>{fmt(attained,3)}</span></div>
      <div className="text-xs text-slate-500">Required: {fmt(required,3)}</div>
      <div className="text-[10px] text-slate-500 mt-1 text-center">LNG Carrier — MEPC.339(76)</div>
      <div className="text-[10px] text-slate-600 mt-0.5 text-center px-2">CO₂ = HFO×3.114 + FOE×2.750 (t/NM)</div>
      <div className="flex gap-1 mt-2">
        {['A','B','C','D','E'].map(l=>(
          <div key={l} className="px-2 py-0.5 rounded text-xs font-bold" style={{background:colors[l],color:'#fff',opacity:l===rating?1:0.3}}>{l}</div>
        ))}
      </div>
    </div>
  );
}

const FLEET_KEY = '__fleet__';

export default function LNGDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [vessels, setVessels] = useState([]);
  const [selected, setSelected] = useState(FLEET_KEY); // Default: fleet view
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin    = ['admin','manager','superintendent'].includes(user?.role);
  const isVessel   = user?.role === 'vessel';

  // Load vessel list
  useEffect(() => {
    api.get('/api/ref/vessels').then(r => {
      setVessels(r);
      if (isVessel && user?.vessel_names?.length) {
        const match = r.find(v => user.vessel_names.includes(v.name));
        if (match) setSelected(match.name);
      }
      // Admin/sup defaults to fleet view (already FLEET_KEY)
    }).catch(() => {});
  }, []);

  // Load analytics when selection changes
  useEffect(() => {
    setLoading(true); setError('');
    const qs = selected === FLEET_KEY ? '' : `?vessel_name=${encodeURIComponent(selected)}`;
    api.get(`/api/voyages/analytics${qs}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selected]);

  const title = selected === FLEET_KEY ? 'LNG Fleet — All Vessels' : selected;
  const { monthly=[], totals={}, cii={}, anomalies=[] } = data || {};
  const hasData = monthly.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">LNG Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">{title}</p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Vessel selector — hidden for vessel users */}
          {!isVessel && (
            <select value={selected} onChange={e=>setSelected(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
              <option value={FLEET_KEY}>All Vessels (Fleet)</option>
              {vessels.map(v=><option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          )}
          {isVessel && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-white/5 text-slate-300 text-sm">{selected}</div>
          )}
          <HelpButton type="lng" />
          <button onClick={()=>nav('/voyages')}
            className="px-4 py-1.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5 transition-colors">
            Voyages →
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-900/30 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading analytics…</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Distance"  value={`${fmt0(totals.total_dist)} NM`} color="blue"/>
            <StatCard label="Total HFO Cons"  value={`${fmt(totals.total_hfo)} MT`} color="amber"/>
            <StatCard label="Net Excess Fuel"
              value={hasData ? `${fmt(totals.net_excess)} MT` : '—'}
              color={parseFloat(totals.net_excess)>0?'red':'green'}
              sub={hasData ? (parseFloat(totals.net_excess)>0?'above charter allowance':'within allowance') : 'No voyages yet'}/>
            <StatCard label="Voyages" value={fmt0(totals.voyage_count)}/>
          </div>

          {/* CII + Anomalies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CIIBadge rating={hasData ? cii.rating : '—'} attained={cii.attained} required={cii.ciiReq}/>
            <div className="md:col-span-2 rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200">Alerts & Anomalies</h3>
                <span className={`px-2 py-0.5 text-xs rounded ${anomalies.length>0?'bg-amber-900/40 text-amber-300':'bg-green-900/40 text-green-300'}`}>
                  {anomalies.length>0?`${anomalies.length} items`:'✓ Clear'}
                </span>
              </div>
              {!hasData ? (
                <div className="text-sm text-slate-500 italic">
                  {selected === FLEET_KEY
                    ? 'No voyages have been entered yet. Use the Voyages page to create your first voyage and noon reports.'
                    : `No voyages recorded for ${selected}. Select a different vessel or use All Vessels view.`}
                </div>
              ) : anomalies.length === 0 ? (
                <div className="text-sm text-green-400 flex items-center gap-2"><span>✓</span> No anomalies detected</div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {anomalies.map((a,i)=>(
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-amber-900/20 border border-amber-700/20">
                      <span className="text-amber-400 mt-0.5">⚠</span>
                      <div>
                        <span className="text-slate-300 font-mono mr-2">{a.vessel_name} — {a.voyage_number}</span>
                        <span className="text-amber-300">{a.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-200">HFO Consumption</h3>
                <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>Monthly total (MT)</p>
              </div>
              <BarChart data={monthly} yKey="hfo_consumed" color="#B45309" yUnit=" MT" tooltipLabel="HFO consumed"/>
            </div>
            <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-200">Net Excess Fuel Trend</h3>
                <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>vs charter party allowance (MT) — above 0 = chargeable</p>
              </div>
              <LineChart data={monthly} yKey="net_excess" color="#EF4444" yUnit=" MT" warningLine={0} tooltipLabel="Net excess fuel (MT)"/>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-200">Distance Steamed</h3>
                <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>Monthly total (NM)</p>
              </div>
              <BarChart data={monthly} yKey="distance_nm" color="#0F766E" yUnit=" NM" tooltipLabel="Distance steamed"/>
            </div>
            <div className="rounded-xl border border-white/5 p-4" style={{background:'var(--card-bg)'}}>
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-200">Sea Steam Hours</h3>
                <p className="text-xs" style={{color:"var(--text-muted,#94a3b8)"}}>Monthly total (hrs)</p>
              </div>
              <LineChart data={monthly} yKey="steaming_hrs" color="#A78BFA" yUnit=" hrs" tooltipLabel="Sea steaming hours"/>
            </div>
          </div>

          {/* Monthly summary table */}
          {hasData && (
            <div className="rounded-xl border border-white/5 overflow-hidden" style={{background:'var(--card-bg)'}}>
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Monthly Summary</h3>
                {selected===FLEET_KEY && <span className="text-xs text-slate-500">All vessels combined</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr style={{background:'var(--table-head-bg,rgba(15,23,42,0.9))'}}>
                    {['Month','Voyages','Sea Hrs','Distance NM','HFO (MT)','FOE (MT)','Att. CII','Net Excess','Status'].map(h=>(
                      <th key={h} className="px-3 py-2.5 text-left text-teal-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {monthly.slice().reverse().map((m,i)=>{
                      const excess=parseFloat(m.net_excess)||0;
                      return (
                        <tr key={m.month_key} className="border-t border-white/5 hover:bg-white/5"
                          style={{background:i%2===0?'var(--table-row-bg,rgba(15,23,42,0.3))':'transparent'}}>
                          <td className="px-3 py-2 font-medium text-teal-300">{m.month_label}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{m.voyage_count}</td>
                          <td className="px-3 py-2 text-right text-blue-300">{fmt(m.steaming_hrs,1)}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{fmt0(m.distance_nm)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-amber-300">{fmt(m.hfo_consumed)}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{fmt(m.foe_consumed,3)}</td>
                          <td className="px-3 py-2 text-right text-xs font-mono"
                            style={{color:parseFloat(m.attained_cii)>8.943?'#EF4444':parseFloat(m.attained_cii)>0?'#22C55E':'#475569'}}>
                            {m.attained_cii||'—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold" style={{color:excess>0?'#EF4444':'#22C55E'}}>{fmt(excess)}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${excess>0?'bg-red-900/40 text-red-300':'bg-green-900/40 text-green-300'}`}>
                              {excess>0?'Excess':'Within'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state CTA */}
          {!hasData && (
            <div className="rounded-xl border border-white/5 p-10 text-center" style={{background:'var(--table-row-bg,rgba(15,23,42,0.3))'}}>
              <div className="text-4xl mb-3">🚢</div>
              <div className="text-slate-300 font-semibold mb-2">
                {selected === FLEET_KEY ? 'No voyage data in the system yet' : `No voyage data for ${selected}`}
              </div>
              <p className="text-slate-500 text-sm mb-5 max-w-md mx-auto">
                {selected === FLEET_KEY
                  ? 'Start by creating a voyage and entering noon reports. All charts will populate automatically.'
                  : 'This vessel has no recorded voyages. Try switching to a different vessel or the fleet view.'}
              </p>
              <div className="flex gap-3 justify-center">
                {selected !== FLEET_KEY && (
                  <button onClick={()=>setSelected(FLEET_KEY)}
                    className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5 transition-colors">
                    View Fleet Data
                  </button>
                )}
                <button onClick={()=>nav('/voyages/new')}
                  className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-sm font-medium transition-colors">
                  Create New Voyage
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
