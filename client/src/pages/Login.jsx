import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { setUser } = useAuth();

  const go = async () => {
    setError(''); setLoading(true);
    try {
      const d = await api.login(username, password);
      setUser(d.user);
      window.location.replace('/');
    } catch (e) {
      setError(e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:border-amber-500 text-white";

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg,#0B1120,#0F172A,#111827)' }}>
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>FC</div>
          <h1 className="text-2xl font-bold text-white">Fuel Calculator</h1>
          <p className="text-sm text-gray-400 mt-1">FORCAP Fleet Intelligence</p>
        </div>
        <div className="rounded-2xl p-6 border border-gray-700" style={{ background: 'rgba(15,23,42,0.9)' }}>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm font-semibold text-white" style={{background:'#7f1d1d'}}>
              ⚠️ {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                className={inp} style={{background:'#1e293b',borderColor:'#374151'}}
                autoCapitalize="none" autoCorrect="off" autoComplete="username" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className={inp} style={{background:'#1e293b',borderColor:'#374151'}}
                autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && go()} />
            </div>
            <button onClick={go} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#B45309,#D97706)', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
