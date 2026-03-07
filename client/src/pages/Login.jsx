import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';

export default function Login() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const nav = useNavigate(); const { setUser } = useAuth();
  const go = async () => {
    setError(''); setLoading(true);
    try { const d = await api.login(username, password); setUser(d.user); nav('/voyages'); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  const inp = "w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600";
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg,#0B1120,#0F172A,#111827)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>FC</div>
          <h1 className="text-2xl font-bold text-slate-100">Fuel Calculator</h1>
          <p className="text-sm text-slate-500 mt-1">LNG Excess Fuel Consumption</p>
        </div>
        <div className="rounded-2xl p-6 border border-white/5" style={{ background: 'rgba(15,23,42,0.7)' }}>
          {error && <div className="mb-4 px-4 py-2.5 rounded-lg text-sm text-red-300 bg-red-900/20 border border-red-800/30">{error}</div>}
          <div className="space-y-4">
            <div><label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Username</label><input value={username} onChange={e=>setUsername(e.target.value)} className={inp} /></div>
            <div><label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} className={inp} onKeyDown={e=>e.key==='Enter'&&go()} /></div>
            <button onClick={go} disabled={loading} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>{loading?'Signing in...':'Sign In'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
