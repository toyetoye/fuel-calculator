import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import api from '../api';

export default function VesselManage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', capacity_m3: '', foe_factor: '0.484', pitch: '', vessel_class: 'Rivers',
    laden_boiloff_pct: '0.15', ballast_boiloff_pct: '0.10'
  });

  useEffect(() => { loadVessels(); }, []);
  const loadVessels = () => { setLoading(true); api.listLngVessels().then(setVessels).finally(() => setLoading(false)); };

  const save = async () => {
    if (!form.name || !form.capacity_m3) return alert('Name and Capacity required');
    try {
      const payload = {
        ...form,
        capacity_m3: parseFloat(form.capacity_m3) || 0,
        foe_factor: parseFloat(form.foe_factor) || 0.484,
        pitch: parseFloat(form.pitch) || null,
        laden_boiloff_pct: parseFloat(form.laden_boiloff_pct) || 0.15,
        ballast_boiloff_pct: parseFloat(form.ballast_boiloff_pct) || 0.10,
      };
      if (editing) await api.updateLngVessel(editing.id, payload);
      else await api.createLngVessel(payload);
      setShowForm(false); setEditing(null);
      setForm({ name: '', capacity_m3: '', foe_factor: '0.484', pitch: '', vessel_class: 'Rivers', laden_boiloff_pct: '0.15', ballast_boiloff_pct: '0.10' });
      loadVessels();
    } catch (e) { alert(e.message); }
  };

  const startEdit = (v) => {
    setEditing(v);
    setForm({
      name: v.name, capacity_m3: v.capacity_m3, foe_factor: v.foe_factor, pitch: v.pitch || '',
      vessel_class: v.vessel_class || 'Rivers', laden_boiloff_pct: v.laden_boiloff_pct, ballast_boiloff_pct: v.ballast_boiloff_pct
    });
    setShowForm(true);
  };

  const deleteVessel = async (v) => {
    if (!confirm(`Remove ${v.name} from the LNG fleet?`)) return;
    try { await api.deleteLngVessel(v.id); loadVessels(); } catch (e) { alert(e.message); }
  };

  const inp = "w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600";
  const label = "block text-xs text-slate-400 mb-1 uppercase tracking-wider";

  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LNG Vessels</h1>
          <p className="text-sm text-slate-500 mt-1">Manage vessel specifications for fuel calculations</p>
        </div>
        {canEdit && <button onClick={() => { setEditing(null); setForm({ name: '', capacity_m3: '', foe_factor: '0.484', pitch: '', vessel_class: 'Rivers', laden_boiloff_pct: '0.15', ballast_boiloff_pct: '0.10' }); setShowForm(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>+ Add Vessel</button>}
      </div>

      {showForm && canEdit && (
        <div className="rounded-xl p-5 border border-amber-800/30" style={{ background: 'rgba(180,83,9,0.05)' }}>
          <h3 className="text-sm font-semibold text-amber-300 mb-4">{editing ? 'Edit Vessel' : 'New Vessel'}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={label}>Vessel Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="e.g. LNG ADAMAWA" /></div>
            <div><label className={label}>Capacity (M³) *</label><input type="number" value={form.capacity_m3} onChange={e => setForm({ ...form, capacity_m3: e.target.value })} className={inp} placeholder="141090" /></div>
            <div><label className={label}>Vessel Class</label>
              <select value={form.vessel_class} onChange={e => setForm({ ...form, vessel_class: e.target.value })} className={inp}>
                <option value="Rivers">Rivers</option><option value="Rivers Plus">Rivers Plus</option>
              </select></div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-3">
            <div><label className={label}>FOE Factor</label><input type="number" step="0.001" value={form.foe_factor} onChange={e => setForm({ ...form, foe_factor: e.target.value })} className={inp} /></div>
            <div><label className={label}>Pitch</label><input type="number" step="0.0001" value={form.pitch} onChange={e => setForm({ ...form, pitch: e.target.value })} className={inp} placeholder="7.8329" /></div>
            <div><label className={label}>Laden Boil-off (%)</label><input type="number" step="0.01" value={form.laden_boiloff_pct} onChange={e => setForm({ ...form, laden_boiloff_pct: e.target.value })} className={inp} /></div>
            <div><label className={label}>Ballast Boil-off (%)</label><input type="number" step="0.01" value={form.ballast_boiloff_pct} onChange={e => setForm({ ...form, ballast_boiloff_pct: e.target.value })} className={inp} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#B45309' }}>{editing ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-lg text-sm text-slate-400">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'rgba(15,23,42,0.6)' }}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/5">
            {['Vessel', 'Class', 'Capacity (M³)', 'FOE Factor', 'Pitch', 'Laden B/O', 'Ballast B/O', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>{vessels.map(v => (
            <tr key={v.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <div className="text-sm font-semibold text-slate-200">{v.name}</div>
              </td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${v.vessel_class === 'Rivers' ? 'bg-blue-900/30 text-blue-300' : 'bg-purple-900/30 text-purple-300'}`}>{v.vessel_class}</span></td>
              <td className="px-4 py-3 font-mono text-xs text-slate-300">{Number(v.capacity_m3).toLocaleString()}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.foe_factor}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.pitch || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.laden_boiloff_pct}%</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.ballast_boiloff_pct}%</td>
              <td className="px-4 py-3">
                {canEdit && <div className="flex gap-2">
                  <button onClick={() => startEdit(v)} className="text-xs text-amber-400">Edit</button>
                  <button onClick={() => deleteVessel(v)} className="text-xs text-red-400">Remove</button>
                </div>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {vessels.length === 0 && <div className="text-center py-12 text-slate-600 text-sm">No LNG vessels configured. Add your first vessel above.</div>}
      </div>
    </div>
  );
}
