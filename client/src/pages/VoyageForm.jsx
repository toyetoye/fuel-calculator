import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';

export default function VoyageForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [allVessels, setAllVessels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [priceSource, setPriceSource] = useState('');
  const [form, setForm] = useState({
    vessel_name: '', voyage_number: '', leg_type: 'BALLAST', discharge_port: '', loading_port: '',
    faop_time: '', faop_timezone: 'GMT', eosp_time: '', eosp_timezone: 'GMT',
    gauging_after_time: '', gauging_after_tz: 'GMT', gauging_before_time: '', gauging_before_tz: 'GMT',
    gauging_after_m3: '', gauging_before_m3: '', hfo_price: '', notes: ''
  });

  // Filter vessels by role
  const vessels = (user?.role === 'admin' || user?.role === 'manager')
    ? allVessels
    : allVessels.filter(v => (user?.vessel_names || []).includes(v.name));

  useEffect(() => {
    api.getVessels().then(setAllVessels);
    if (id) {
      api.getVoyage(id).then(v => {
        setForm({
          vessel_name: v.vessel_name || '', voyage_number: v.voyage_number || '', leg_type: v.leg_type || 'BALLAST',
          discharge_port: v.discharge_port || '', loading_port: v.loading_port || '',
          faop_time: v.faop_time ? v.faop_time.slice(0, 16) : '', faop_timezone: v.faop_timezone || 'GMT',
          eosp_time: v.eosp_time ? v.eosp_time.slice(0, 16) : '', eosp_timezone: v.eosp_timezone || 'GMT',
          gauging_after_time: v.gauging_after_time ? v.gauging_after_time.slice(0, 16) : '', gauging_after_tz: v.gauging_after_tz || 'GMT',
          gauging_before_time: v.gauging_before_time ? v.gauging_before_time.slice(0, 16) : '', gauging_before_tz: v.gauging_before_tz || 'GMT',
          gauging_after_m3: v.gauging_after_m3 || '', gauging_before_m3: v.gauging_before_m3 || '',
          hfo_price: v.hfo_price || '', notes: v.notes || ''
        });
      });
    }
  }, [id]);

  // Auto-fill HFO price from monthly reference when FAOP date changes
  useEffect(() => {
    if (!form.faop_time) return;
    const d = new Date(form.faop_time);
    if (isNaN(d.getTime())) return;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    api.lookupPrice(d.getFullYear(), d.getMonth() + 1, 'VLSFO').then(p => {
      if (p && p.price && p.price !== null) {
        // Auto-fill if empty, otherwise just show suggestion
        if (!form.hfo_price || form.hfo_price === '' || form.hfo_price === '0') {
          setForm(prev => ({ ...prev, hfo_price: p.price }));
        }
        setPriceSource(`${p.fuel_type || 'VLSFO'} reference: $${p.price}/MT for ${months[d.getMonth()]} ${d.getFullYear()} (${p.source || 'manual'})`);
      } else {
        setPriceSource(`No reference price set for ${months[d.getMonth()]} ${d.getFullYear()}. Admin can add one in Fuel Prices.`);
      }
    }).catch(() => { setPriceSource(''); });
  }, [form.faop_time]);

  const save = async () => {
    if (!form.vessel_name || !form.voyage_number) return alert('Vessel and Voyage Number required');
    setLoading(true);
    try {
      if (id) { await api.updateVoyage(id, form); nav(`/voyages/${id}`); }
      else { const v = await api.createVoyage(form); nav(`/voyages/${v.id}`); }
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  // Get selected vessel info for dynamic labels
  const selectedVessel = vessels.find(v => v.name === form.vessel_name);
  const isLaden = form.leg_type === 'LADEN';

  const inp = "w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600";
  const label = "block text-xs text-slate-400 mb-1 uppercase tracking-wider";
  const F = (l, children) => <div><label className={label}>{l}</label>{children}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold text-slate-100">{id ? 'Edit Voyage' : 'New Voyage'}</h1></div>

      <div className="rounded-xl p-5 border border-white/5 space-y-5" style={{ background: 'rgba(15,23,42,0.6)' }}>
        <h3 className="text-sm font-semibold text-amber-300">Voyage Details</h3>
        <div className="grid grid-cols-3 gap-4">
          {F('Vessel *', <select value={form.vessel_name} onChange={e => setForm({ ...form, vessel_name: e.target.value })} className={inp}>
            <option value="">Select vessel</option>{vessels.map(v => <option key={v.id} value={v.name}>{v.name} ({v.vessel_class})</option>)}
          </select>)}
          {F('Voyage Number *', <input value={form.voyage_number} onChange={e => setForm({ ...form, voyage_number: e.target.value })} className={inp} placeholder="e.g. NG/24/07B" />)}
          {F('Leg Type', <select value={form.leg_type} onChange={e => setForm({ ...form, leg_type: e.target.value })} className={inp}>
            <option value="BALLAST">BALLAST</option><option value="LADEN">LADEN</option>
          </select>)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {F('Discharge Port', <input value={form.discharge_port} onChange={e => setForm({ ...form, discharge_port: e.target.value })} className={inp} />)}
          {F('Loading Port', <input value={form.loading_port} onChange={e => setForm({ ...form, loading_port: e.target.value })} className={inp} />)}
        </div>
        {selectedVessel && <div className="text-xs text-slate-500 px-2 py-1 bg-white/[0.03] rounded">
          {selectedVessel.name} · {selectedVessel.vessel_class} Class · {parseFloat(selectedVessel.capacity_m3).toLocaleString()} m³ · Boil-off: {isLaden ? selectedVessel.laden_boiloff_pct : selectedVessel.ballast_boiloff_pct}%/day · FOE: {selectedVessel.foe_factor}
        </div>}
      </div>

      <div className="rounded-xl p-5 border border-white/5 space-y-5" style={{ background: 'rgba(15,23,42,0.6)' }}>
        <h3 className="text-sm font-semibold text-amber-300">Passage Times</h3>
        <div className="grid grid-cols-3 gap-4">
          {F(isLaden ? 'FAOP (Loading Port)' : 'FAOP (Discharge Port)', <input type="datetime-local" value={form.faop_time} onChange={e => setForm({ ...form, faop_time: e.target.value })} className={inp} />)}
          {F('FAOP Timezone', <input value={form.faop_timezone} onChange={e => setForm({ ...form, faop_timezone: e.target.value })} className={inp} placeholder="GMT+9" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {F(isLaden ? 'EOSP (Discharge Port)' : 'EOSP (Loading Port)', <input type="datetime-local" value={form.eosp_time} onChange={e => setForm({ ...form, eosp_time: e.target.value })} className={inp} />)}
          {F('EOSP Timezone', <input value={form.eosp_timezone} onChange={e => setForm({ ...form, eosp_timezone: e.target.value })} className={inp} placeholder="GMT+1" />)}
        </div>
      </div>

      <div className="rounded-xl p-5 border border-white/5 space-y-5" style={{ background: 'rgba(15,23,42,0.6)' }}>
        <h3 className="text-sm font-semibold text-amber-300">Gauging Data</h3>
        <div className="grid grid-cols-3 gap-4">
          {F(isLaden ? 'Gauging After Loading Time' : 'Gauging After Discharge Time', <input type="datetime-local" value={form.gauging_after_time} onChange={e => setForm({ ...form, gauging_after_time: e.target.value })} className={inp} />)}
          {F('Timezone', <input value={form.gauging_after_tz} onChange={e => setForm({ ...form, gauging_after_tz: e.target.value })} className={inp} />)}
          {F(isLaden ? 'Gauging After Loading (M³)' : 'Gauging After Discharge (M³)', <input type="number" step="0.001" value={form.gauging_after_m3} onChange={e => setForm({ ...form, gauging_after_m3: e.target.value })} className={inp} />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {F(isLaden ? 'Gauging Before Discharge Time' : 'Gauging Before Loading Time', <input type="datetime-local" value={form.gauging_before_time} onChange={e => setForm({ ...form, gauging_before_time: e.target.value })} className={inp} />)}
          {F('Timezone', <input value={form.gauging_before_tz} onChange={e => setForm({ ...form, gauging_before_tz: e.target.value })} className={inp} />)}
          {F(isLaden ? 'Gauging Before Discharge (M³)' : 'Gauging Before Loading (M³)', <input type="number" step="0.001" value={form.gauging_before_m3} onChange={e => setForm({ ...form, gauging_before_m3: e.target.value })} className={inp} />)}
        </div>
      </div>

      <div className="rounded-xl p-5 border border-white/5 space-y-5" style={{ background: 'rgba(15,23,42,0.6)' }}>
        <h3 className="text-sm font-semibold text-amber-300">Commercial</h3>
        <div className="grid grid-cols-2 gap-4">
          {F('HFO Price ($/MT)', <div><input type="number" value={form.hfo_price} onChange={e => { setForm({ ...form, hfo_price: e.target.value }); }} className={inp} />
            {priceSource && <div className={`text-[10px] mt-1 ${priceSource.includes('No reference') ? 'text-amber-400' : 'text-emerald-400'}`}>{priceSource}</div>}
          </div>)}
          {F('Notes', <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} />)}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={save} disabled={loading} className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>
          {loading ? 'Saving...' : id ? 'Update Voyage' : 'Create Voyage'}
        </button>
        <button onClick={() => nav(id ? `/voyages/${id}` : '/voyages')} className="px-4 py-2.5 rounded-lg text-sm text-slate-400">Cancel</button>
      </div>
    </div>
  );
}
