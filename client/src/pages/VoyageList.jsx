import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';

export default function VoyageList() {
  const [voyages, setVoyages] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const nav = useNavigate();
  const { user } = useAuth();
  const canReview = ['admin','superintendent'].includes(user?.role);

  useEffect(() => { api.listVoyages().then(setVoyages).finally(() => setLoading(false)); }, []);

  const filtered = voyages.filter(v => !search ||
    v.vessel_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.voyage_number?.toLowerCase().includes(search.toLowerCase()) ||
    v.discharge_port?.toLowerCase().includes(search.toLowerCase())
  );

  const statusCls = { draft: 'bg-amber-900/30 text-amber-300 border-amber-700/40', finalised: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40' };
  const inp = "px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600";

  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 text-sm">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-100">Voyages</h1><p className="text-sm text-slate-500 mt-1">Excess fuel calculation records</p></div>
        <button onClick={() => nav('/voyages/new')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>+ New Voyage</button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vessel, voyage, port..." className={`${inp} w-full max-w-sm`} />

      <div className="grid grid-cols-3 gap-4 mb-2">
        {[{ l: 'Total Voyages', v: voyages.length, c: '#FBBF24' }, { l: 'Draft', v: voyages.filter(v => v.status === 'draft').length, c: '#F59E0B' }, { l: 'Finalised', v: voyages.filter(v => v.status === 'finalised').length, c: '#34D399' }].map((k, i) => (
          <div key={i} className="rounded-xl p-4 border border-white/5" style={{ background: 'rgba(15,23,42,0.6)' }}>
            <div className="text-xs text-slate-500 uppercase">{k.l}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(v => (
          <div key={v.id} onClick={() => nav(`/voyages/${v.id}`)} className="rounded-xl p-5 border border-white/5 hover:border-amber-800/30 cursor-pointer transition-all" style={{ background: 'rgba(15,23,42,0.6)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-100">{v.vessel_name}</span>
                  <span className="text-xs text-slate-500">Voy: {v.voyage_number}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${v.leg_type === 'LADEN' ? 'bg-blue-900/30 text-blue-300 border-blue-700/40' : 'bg-slate-700/30 text-slate-300 border-slate-600/40'}`}>{v.leg_type}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusCls[v.status] || statusCls.draft}`}>{v.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {v.discharge_port || v.loading_port || 'No port specified'} · {v.faop_time ? new Date(v.faop_time).toLocaleDateString() : 'No date'} → {v.eosp_time ? new Date(v.eosp_time).toLocaleDateString() : ''}
                </div>
              </div>
              <span className="text-xs text-slate-600">→</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-16 text-slate-600 text-sm">{voyages.length ? 'No matching voyages' : 'No voyages yet. Create your first one.'}</div>}
      </div>
    </div>
  );
}
