import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';

const fmt  = (v, d=2) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d);
const fmt0 = v => (v == null || isNaN(v)) ? '—' : Math.round(Number(v)).toLocaleString();
const fmtDate = d => d ? d.slice(0,10) : '—';

function Badge({ children, color='slate' }) {
  const styles = {
    slate:  'bg-slate-800 text-slate-300',
    amber:  'bg-amber-900/40 text-amber-300',
    green:  'bg-green-900/40 text-green-300',
    blue:   'bg-blue-900/40 text-blue-300',
    red:    'bg-red-900/40 text-red-300',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[color]||styles.slate}`}>{children}</span>;
}

function StatCard({ label, value, sub, color='slate' }) {
  return (
    <div className="rounded-lg p-4 border border-white/5" style={{background:'rgba(15,23,42,0.7)'}}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color==='amber'?'text-amber-300':color==='green'?'text-green-300':color==='blue'?'text-blue-300':'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Voyage List ──────────────────────────────────────────────────────────────
export function LPGVoyageList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [voyages, setVoyages] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [vesselId, setVesselId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/lpg/vessels').then(r => {
      setVessels(r);
      if (r.length > 0 && !vesselId) setVesselId(String(r[0].id));
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!vesselId) return;
    setLoading(true);
    api.get(`/api/lpg/voyages?vessel_id=${vesselId}`)
      .then(r => { setVoyages(r); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [vesselId]);

  const isAdmin = ['admin','manager'].includes(user?.role);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">LPG Fuel Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">Daily noon records by voyage — Alfred Temile</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <button onClick={() => nav('/lpg/import')}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-700 hover:bg-amber-600 text-white transition-colors">
              Import XLS
            </button>
          )}
          <button onClick={() => nav('/lpg/dashboard')}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-300 hover:bg-white/5 transition-colors">
            Dashboard
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-900/30 text-red-300 text-sm">{error}</div>}

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-slate-400">Vessel</label>
        <select value={vesselId} onChange={e => setVesselId(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
          {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <span className="text-sm text-slate-500">{voyages.length} voyages</span>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading voyages…</div>
      ) : voyages.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <div className="text-4xl mb-3">⛽</div>
          <div>No records yet. Import the noon log Excel to get started.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden" style={{background:'rgba(8,15,30,0.8)'}}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5" style={{background:'rgba(15,23,42,0.9)'}}>
                <th className="text-left px-4 py-3 text-xs font-semibold text-amber-400 uppercase tracking-wider">Voyage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Records</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Sea Hrs</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Distance NM</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-amber-400 uppercase tracking-wider">VLSFO (MT)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">LSMGO (MT)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">CO₂ (MT)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-blue-400 uppercase tracking-wider">VLSFO ROB</th>
              </tr>
            </thead>
            <tbody>
              {voyages.map((v, i) => (
                <tr key={`${v.voyage_number}-${i}`}
                  onClick={() => nav(`/lpg/voyages/${encodeURIComponent(v.voyage_number)}?vessel_id=${vesselId}`)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  style={{background: i%2===0 ? 'rgba(15,23,42,0.4)' : 'transparent'}}>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-amber-300">{v.voyage_number || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {fmtDate(v.start_date)} → {fmtDate(v.end_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">{v.record_count}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt(v.total_sea_hrs, 1)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt0(v.total_dist_nm)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-300">{fmt(v.total_vlsfo_cons)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt(v.total_lsmgo_cons)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt(v.total_co2)}</td>
                  <td className="px-4 py-3 text-right text-blue-300">{fmt(v.latest_vlsfo_rob)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Voyage Detail ────────────────────────────────────────────────────────────
export function LPGVoyageDetail() {
  const { voyage_number } = useParams();
  const nav = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  const vn = decodeURIComponent(voyage_number);
  const params = new URLSearchParams(window.location.search);
  const vessel_id = params.get('vessel_id') || '';

  useEffect(() => {
    setLoading(true);
    const q = vessel_id ? `?vessel_id=${vessel_id}` : '';
    api.get(`/api/lpg/voyages/${encodeURIComponent(vn)}${q}`)
      .then(r => { setRecords(r); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [vn]);

  if (loading) return <div className="p-6 text-center text-slate-500">Loading…</div>;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  const totVLSFO = records.reduce((s,r) => s + (Number(r.vlsfo_total_cons)||0), 0);
  const totLSMGO = records.reduce((s,r) => s + (Number(r.lsmgo_cons_total)||0), 0);
  const totCO2   = records.reduce((s,r) => s + (Number(r.co2_emitted_mt)||0), 0);
  const totDist  = records.reduce((s,r) => s + (Number(r.obs_dist)||0), 0);
  const totSea   = records.reduce((s,r) => s + (Number(r.sea_stm_hrs)||0), 0);
  const lastRec  = records[records.length-1] || {};

  const TABS = ['overview','fuel','engine','running hrs','fresh water'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => nav('/lpg')} className="text-slate-400 hover:text-slate-200 text-sm">← Voyages</button>
        <span className="text-slate-600">/</span>
        <span className="font-mono font-bold text-amber-300 text-lg">{vn}</span>
        <Badge color="blue">{records.length} records</Badge>
        <span className="text-slate-500 text-sm">{fmtDate(records[0]?.record_date)} → {fmtDate(lastRec.record_date)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Sea Hours" value={fmt(totSea,1)} color="blue" />
        <StatCard label="Distance NM" value={fmt0(totDist)} />
        <StatCard label="VLSFO Consumed" value={`${fmt(totVLSFO)} MT`} color="amber" />
        <StatCard label="LSMGO Consumed" value={`${fmt(totLSMGO)} MT`} />
        <StatCard label="Total CO₂" value={`${fmt(totCO2)} MT`} color="red" />
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${tab===t ? 'text-amber-300 border-b-2 border-amber-400' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/5 overflow-x-auto" style={{background:'rgba(8,15,30,0.8)'}}>
        {tab === 'overview' && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{background:'rgba(15,23,42,0.9)'}}>
                {['Date','Time','Mode','Status','Voyage','Sea Hrs','Anch','Manv','Tot Hrs','Dist NM','Obs Spd'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'rgba(15,23,42,0.3)':'transparent'}}>
                  <td className="px-3 py-2 text-amber-300 font-mono whitespace-nowrap">{fmtDate(r.record_date)}</td>
                  <td className="px-3 py-2 text-slate-400">{r.record_time || '—'}</td>
                  <td className="px-3 py-2 text-slate-300">{r.mode || '—'}</td>
                  <td className="px-3 py-2 text-slate-400 max-w-xs truncate">{r.status || '—'}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono">{r.voyage_number || '—'}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(r.sea_stm_hrs,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.anch_drift_hrs,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.manv_hrs,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.total_hrs,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.obs_dist,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.obs_speed,2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'fuel' && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{background:'rgba(15,23,42,0.9)'}}>
                {['Date','VLSFO ME','VLSFO AE','VLSFO Blr','VLSFO Total','VLSFO ROB','Bnkrd','LSMGO ME','LSMGO AE','LSMGO Tot','LSMGO ROB','CO₂ MT'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'rgba(15,23,42,0.3)':'transparent'}}>
                  <td className="px-3 py-2 text-amber-300 font-mono">{fmtDate(r.record_date)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.vlsfo_cons_me)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.vlsfo_cons_ae)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.vlsfo_cons_blr)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-300">{fmt(r.vlsfo_total_cons)}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(r.vlsfo_rob)}</td>
                  <td className="px-3 py-2 text-right text-green-300">{r.vlsfo_bunkered_qty > 0 ? fmt(r.vlsfo_bunkered_qty) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.lsmgo_cons_me)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.lsmgo_cons_ae_ig_incn)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.lsmgo_cons_total)}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(r.lsmgo_rob)}</td>
                  <td className="px-3 py-2 text-right text-red-300">{fmt(r.co2_emitted_mt)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-amber-700/50 font-semibold" style={{background:'rgba(15,23,42,0.9)'}}>
                <td className="px-3 py-2 text-amber-400">TOTALS</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(records.reduce((s,r)=>s+(Number(r.vlsfo_cons_me)||0),0))}</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(records.reduce((s,r)=>s+(Number(r.vlsfo_cons_ae)||0),0))}</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(records.reduce((s,r)=>s+(Number(r.vlsfo_cons_blr)||0),0))}</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(totVLSFO)}</td>
                <td className="px-3 py-2 text-right text-blue-300">{fmt(lastRec.vlsfo_rob)}</td>
                <td className="px-3 py-2 text-right text-green-300">{fmt(records.reduce((s,r)=>s+(Number(r.vlsfo_bunkered_qty)||0),0))}</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(records.reduce((s,r)=>s+(Number(r.lsmgo_cons_me)||0),0))}</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(records.reduce((s,r)=>s+(Number(r.lsmgo_cons_ae_ig_incn)||0),0))}</td>
                <td className="px-3 py-2 text-right text-amber-300">{fmt(totLSMGO)}</td>
                <td className="px-3 py-2 text-right text-blue-300">{fmt(lastRec.lsmgo_rob)}</td>
                <td className="px-3 py-2 text-right text-red-300">{fmt(totCO2)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {tab === 'engine' && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{background:'rgba(15,23,42,0.9)'}}>
                {['Date','CTR','RPM','Eng Dist','Obs Spd','Obs Dist','Slip %','BHP','KW','FO Dens'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'rgba(15,23,42,0.3)':'transparent'}}>
                  <td className="px-3 py-2 text-amber-300 font-mono">{fmtDate(r.record_date)}</td>
                  <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmt0(r.me_counter)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.me_rpm,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.engine_dist,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.obs_speed,2)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.obs_dist,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.slip,2)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.me_bhp,0)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.me_kw,0)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.fo_density_15c,4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'running hrs' && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{background:'rgba(15,23,42,0.9)'}}>
                {['Date','AE1 RHR','AE2 RHR','AE3 RHR','DG Total','AE Avg KW','Cargo Plant','RP1','RP2','RP3','RP Total'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'rgba(15,23,42,0.3)':'transparent'}}>
                  <td className="px-3 py-2 text-amber-300 font-mono">{fmtDate(r.record_date)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.ae1_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.ae2_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.ae3_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(r.ae_total_dg_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.ae_avg_kw,0)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.cargo_plant_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.rp1_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.rp2_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.rp3_rhr,1)}</td>
                  <td className="px-3 py-2 text-right text-amber-300">{fmt(r.rp_total_hrs,1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'fresh water' && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{background:'rgba(15,23,42,0.9)'}}>
                {['Date','FWG Counter','Dist Prod','Dist Cons','Dom Prod','Dom Cons','Total ROB','Port Tk','Stbd Tk','Shore Water'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-amber-400 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'rgba(15,23,42,0.3)':'transparent'}}>
                  <td className="px-3 py-2 text-amber-300 font-mono">{fmtDate(r.record_date)}</td>
                  <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmt0(r.fw_fwg_counter)}</td>
                  <td className="px-3 py-2 text-right text-green-300">{fmt(r.fw_distilled_prod,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.fw_distilled_cons,1)}</td>
                  <td className="px-3 py-2 text-right text-green-300">{fmt(r.fw_dom_prod,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(r.fw_dom_cons,1)}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(r.fw_total_rob,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.fw_port_tk,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.fw_stbd_tk,1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(r.fw_shore_water,1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Import ───────────────────────────────────────────────────────────────────
export function LPGImport() {
  const nav = useNavigate();
  const fileRef = useRef();
  const [step, setStep] = useState('upload'); // upload | preview | confirming | done
  const [preview, setPreview] = useState(null);
  const [vesselId, setVesselId] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f); setBusy(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await api.upload('/api/lpg/import/preview', fd);
      setPreview(res);
      if (res.vessels?.length > 0) setVesselId(String(res.vessels[0].id));
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
        <button onClick={() => nav('/lpg')} className="text-slate-400 hover:text-slate-200 text-sm">← Back</button>
        <h1 className="text-xl font-bold text-slate-100">Import Noon Log</h1>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-900/30 text-red-300 text-sm">{error}</div>}

      {step === 'upload' && (
        <div className="rounded-xl border-2 border-dashed border-white/10 p-12 text-center"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
          <div className="text-4xl mb-3">📊</div>
          <div className="text-slate-300 font-medium mb-1">Drop Alfred Temile noon log XLS here</div>
          <div className="text-slate-500 text-sm mb-4">or click to browse</div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          <button onClick={() => fileRef.current.click()}
            disabled={busy}
            className="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {busy ? 'Parsing…' : 'Browse File'}
          </button>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 p-5" style={{background:'rgba(8,15,30,0.8)'}}>
            <h2 className="font-semibold text-slate-200 mb-3">Import Summary</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Records found</span><div className="text-amber-300 font-bold text-lg">{preview.total}</div></div>
              <div><span className="text-slate-500">Voyages</span><div className="text-slate-200 font-bold text-lg">{preview.voyages?.length || 0}</div></div>
              <div><span className="text-slate-500">From</span><div className="text-slate-300">{preview.date_from}</div></div>
              <div><span className="text-slate-500">To</span><div className="text-slate-300">{preview.date_to}</div></div>
            </div>
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">Voyages found:</div>
              <div className="flex flex-wrap gap-1">
                {(preview.voyages||[]).map(v => <Badge key={v} color="amber">{v}</Badge>)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 p-5" style={{background:'rgba(8,15,30,0.8)'}}>
            <label className="block text-sm text-slate-400 mb-2">Assign to vessel</label>
            <select value={vesselId} onChange={e => setVesselId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
              {(preview.vessels||[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); setPreview(null); setFile(null); }}
              className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5 transition-colors">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              Import {preview.total} Records
            </button>
          </div>
        </div>
      )}

      {step === 'confirming' && (
        <div className="text-center py-20">
          <div className="text-4xl mb-3 animate-pulse">⚙️</div>
          <div className="text-slate-300">Importing records…</div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="rounded-xl border border-green-700/30 p-6 text-center" style={{background:'rgba(6,78,59,0.15)'}}>
          <div className="text-4xl mb-3">✅</div>
          <div className="text-green-300 font-bold text-lg mb-1">Import Complete</div>
          <div className="text-slate-400 text-sm space-y-1">
            <div>Total processed: <span className="text-slate-200">{result.total}</span></div>
            <div>Inserted: <span className="text-green-300">{result.inserted}</span></div>
            <div>Updated: <span className="text-blue-300">{result.updated}</span></div>
            {result.errors > 0 && <div>Errors: <span className="text-red-300">{result.errors}</span></div>}
          </div>
          <button onClick={() => nav('/lpg')} className="mt-4 px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium">
            View Voyages
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function LPGDashboard() {
  const nav = useNavigate();
  const [data, setData] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [vesselId, setVesselId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/lpg/vessels').then(r => {
      setVessels(r);
      if (r.length > 0) setVesselId(String(r[0].id));
    });
  }, []);

  useEffect(() => {
    if (!vesselId) return;
    setLoading(true);
    api.get(`/api/lpg/dashboard?vessel_id=${vesselId}`)
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [vesselId]);

  const totals = data.reduce((acc, m) => ({
    vlsfo: acc.vlsfo + (Number(m.vlsfo_cons)||0),
    lsmgo: acc.lsmgo + (Number(m.lsmgo_cons)||0),
    co2:   acc.co2   + (Number(m.co2_mt)||0),
    dist:  acc.dist  + (Number(m.distance_nm)||0),
    sea:   acc.sea   + (Number(m.sea_hrs)||0),
  }), { vlsfo:0, lsmgo:0, co2:0, dist:0, sea:0 });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">LPG Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monthly aggregated performance</p>
        </div>
        <div className="flex gap-3">
          <select value={vesselId} onChange={e => setVesselId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-200 text-sm">
            {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button onClick={() => nav('/lpg')} className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5 transition-colors">
            ← Voyages
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total VLSFO"   value={`${fmt(totals.vlsfo)} MT`} color="amber" />
        <StatCard label="Total LSMGO"   value={`${fmt(totals.lsmgo)} MT`} />
        <StatCard label="Total CO₂"     value={`${fmt(totals.co2)} MT`} color="red" />
        <StatCard label="Total Distance" value={`${fmt0(totals.dist)} NM`} color="blue" />
        <StatCard label="Sea Hours"     value={`${fmt(totals.sea,1)} hrs`} />
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading…</div>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden" style={{background:'rgba(8,15,30,0.8)'}}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{background:'rgba(15,23,42,0.9)'}}>
                {['Month','Records','Sea Hrs','Distance NM','VLSFO MT','LSMGO MT','CO₂ MT','Avg Speed','Avg RPM','VLSFO ROB','LSMGO ROB','Cargo Plant Hrs','FW Prod'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-amber-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((m,i) => (
                <tr key={`${m.year}-${m.month}`} className="border-t border-white/5 hover:bg-white/5" style={{background:i%2===0?'rgba(15,23,42,0.3)':'transparent'}}>
                  <td className="px-3 py-2.5 font-medium text-amber-300">{m.label}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">{m.records}</td>
                  <td className="px-3 py-2.5 text-right text-blue-300">{fmt(m.sea_hrs,1)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{fmt0(m.distance_nm)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-amber-300">{fmt(m.vlsfo_cons)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{fmt(m.lsmgo_cons)}</td>
                  <td className="px-3 py-2.5 text-right text-red-300">{fmt(m.co2_mt)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{fmt(m.avg_speed,2)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{fmt(m.avg_rpm,1)}</td>
                  <td className="px-3 py-2.5 text-right text-blue-300">{fmt(m.vlsfo_rob_eom)}</td>
                  <td className="px-3 py-2.5 text-right text-blue-300">{fmt(m.lsmgo_rob_eom)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">{fmt(m.cargo_plant_hrs,1)}</td>
                  <td className="px-3 py-2.5 text-right text-green-300">{fmt(m.fw_produced,1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
