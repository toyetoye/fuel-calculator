import React, { useState, useEffect } from 'react';
import api from '../api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FUEL_TYPES = ['VLSFO', 'HSFO', 'LSFO', 'MGO'];

export default function FuelPrices() {
  const [prices, setPrices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [liveData, setLiveData] = useState(null);
  const now = new Date();
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, fuel_type: 'VLSFO', price: '', source: 'manual' });

  useEffect(() => { load(); }, []);
  const load = () => api.listFuelPrices().then(setPrices).catch(console.error);

  const save = async () => {
    if (!form.price) return alert('Price required');
    try { await api.saveFuelPrice(form); setShowForm(false); setForm({ ...form, price: '', source: 'manual' }); load(); }
    catch (e) { alert(e.message); }
  };

  const del = async (p) => {
    if (!confirm(`Delete ${p.fuel_type} price for ${MONTHS[p.month-1]} ${p.year}?`)) return;
    try { await api.deleteFuelPrice(p.id); load(); } catch (e) { alert(e.message); }
  };

  const fetchLive = async () => {
    setFetching(true);
    try {
      const data = await api.fetchLivePrices();
      setLiveData(data);
      if (data.suggested_vlsfo) setForm(prev => ({ ...prev, price: data.suggested_vlsfo, source: 'Ship & Bunker (auto)' }));
    } catch (e) { alert(e.message); }
    finally { setFetching(false); }
  };

  const inp = "w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600";

  // Group by year
  const grouped = {};
  prices.forEach(p => { const k = p.year; if (!grouped[k]) grouped[k] = []; grouped[k].push(p); });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Fuel Prices</h1>
          <p className="text-sm text-slate-500 mt-1">Monthly reference prices for excess fuel cost calculation</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLive} disabled={fetching} className="px-4 py-2 rounded-lg text-sm text-cyan-300 bg-cyan-900/20 border border-cyan-800/30 disabled:opacity-50">
            {fetching ? 'Fetching...' : '⟳ Fetch Live Prices'}
          </button>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>+ Set Price</button>
        </div>
      </div>

      {liveData && (
        <div className="rounded-xl p-4 border border-cyan-800/30 bg-cyan-900/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-cyan-300">Live Market Data (Ship & Bunker)</span>
            <button onClick={() => setLiveData(null)} className="text-xs text-slate-500">Dismiss</button>
          </div>
          {liveData.suggested_vlsfo && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Suggested VLSFO:</span>
              <span className="text-lg font-bold text-cyan-300">${liveData.suggested_vlsfo}/MT</span>
              <button onClick={() => { setForm(prev => ({ ...prev, fuel_type: 'VLSFO', price: liveData.suggested_vlsfo, source: 'Ship & Bunker (auto)' })); setShowForm(true); }}
                className="px-2 py-1 rounded text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-800/30">Use for this month</button>
            </div>
          )}
          {liveData.suggested_hsfo && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Suggested HSFO:</span>
              <span className="text-lg font-bold text-cyan-300">${liveData.suggested_hsfo}/MT</span>
              <button onClick={() => { setForm(prev => ({ ...prev, fuel_type: 'HSFO', price: liveData.suggested_hsfo, source: 'Ship & Bunker (auto)' })); setShowForm(true); }}
                className="px-2 py-1 rounded text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-800/30">Use for this month</button>
            </div>
          )}
          <p className="text-[10px] text-slate-600 italic">{liveData.note} · Fetched: {liveData.timestamp?.slice(0, 16)}</p>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl p-5 border border-amber-800/30" style={{ background: 'rgba(180,83,9,0.05)' }}>
          <h3 className="text-sm font-semibold text-amber-300 mb-3">Set Monthly Price</h3>
          <div className="grid grid-cols-5 gap-3">
            <div><label className="block text-xs text-slate-400 mb-1">Year</label>
              <select value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value) })} className={inp}>
                {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y} value={y}>{y}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Month</label>
              <select value={form.month} onChange={e => setForm({ ...form, month: parseInt(e.target.value) })} className={inp}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Fuel Type</label>
              <select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })} className={inp}>
                {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Price ($/MT)</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={inp} placeholder="650" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Source</label>
              <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className={inp} /></div>
          </div>
          <div className="flex gap-3 mt-3">
            <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#B45309' }}>Save</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400">Cancel</button>
          </div>
        </div>
      )}

      {Object.keys(grouped).sort((a,b) => b-a).map(year => (
        <div key={year}>
          <h3 className="text-sm font-semibold text-slate-300 mb-2">{year}</h3>
          <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'rgba(15,23,42,0.6)' }}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/5">
                {['Month', 'Fuel Type', 'Price ($/MT)', 'Source', 'Updated', ''].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody>{grouped[year].map(p => (
                <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-slate-200">{MONTHS[p.month - 1]}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded text-xs bg-blue-900/30 text-blue-300">{p.fuel_type}</span></td>
                  <td className="px-4 py-2.5 font-mono font-bold text-amber-300">${Number(p.price).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{p.source}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ''}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => del(p)} className="text-xs text-red-400">Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}
      {prices.length === 0 && <div className="text-center py-12 text-slate-600 text-sm">No fuel prices set. Add your first price above or fetch live prices.</div>}
    </div>
  );
}
