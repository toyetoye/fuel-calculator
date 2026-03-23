import React, { useState, useEffect } from 'react';
import api from '../api';

export default function UserManage() {
  const [users, setUsers] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'vessel', display_name: '', vessel_ids: [] });

  useEffect(() => { loadUsers(); api.listLngVessels().then(setVessels); }, []);
  const loadUsers = () => api.listUsers().then(setUsers).catch(console.error);

  const toggleVessel = (vid) => {
    setForm(prev => ({
      ...prev,
      vessel_ids: prev.vessel_ids.includes(vid) ? prev.vessel_ids.filter(id => id !== vid) : [...prev.vessel_ids, vid]
    }));
  };

  const save = async () => {
    try {
      const p = { ...form };
      if (editing) { if (!p.password) delete p.password; await api.updateUser(editing.id, p); }
      else { if (!p.password) return alert('Password required'); await api.createUser(p); }
      setShowForm(false); setEditing(null);
      setForm({ username: '', password: '', role: 'vessel', display_name: '', vessel_ids: [] });
      loadUsers();
    } catch (e) { alert(e.message); }
  };

  const del = async (u) => {
    if (!confirm(`Delete user "${u.display_name || u.username}"?`)) return;
    if (prompt('Type DELETE to confirm:') !== 'DELETE') return;
    try { await api.deleteUser(u.id); loadUsers(); } catch (e) { alert(e.message); }
  };

  const inp = "w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600";
  const roleCls = { admin: 'bg-violet-900/30 text-violet-300', superintendent: 'bg-amber-900/30 text-amber-300', manager: 'bg-teal-900/30 text-teal-300', vessel: 'bg-blue-900/30 text-blue-300' };

  const showVesselAssign = ['vessel', 'superintendent'].includes(form.role);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage users and vessel assignments</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ username: '', password: '', role: 'vessel', display_name: '', vessel_ids: [] }); setShowForm(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>+ Add User</button>
      </div>

      {showForm && (
        <div className="rounded-xl p-5 border border-amber-800/30 space-y-4" style={{ background: 'rgba(180,83,9,0.05)' }}>
          <h3 className="text-sm font-semibold text-amber-300">{editing ? 'Edit User' : 'New User'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1 uppercase">Username *</label><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className={inp} /></div>
            <div><label className="block text-xs text-slate-400 mb-1 uppercase">Password {editing ? '(blank = keep)' : '*'}</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={inp} /></div>
            <div><label className="block text-xs text-slate-400 mb-1 uppercase">Display Name</label><input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className={inp} /></div>
            <div><label className="block text-xs text-slate-400 mb-1 uppercase">Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inp}>
                <option value="admin">Admin</option><option value="superintendent">Superintendent</option><option value="manager">Manager</option><option value="vessel">Vessel User</option>
              </select></div>
          </div>

          {showVesselAssign && (
            <div>
              <label className="block text-xs text-slate-400 mb-2 uppercase">Assign Vessels {form.role === 'vessel' ? '(select one)' : '(select one or more)'}</label>
              <div className="grid grid-cols-3 gap-2">
                {vessels.map(v => (
                  <label key={v.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-all ${form.vessel_ids.includes(v.id) ? 'bg-amber-900/20 border-amber-700/50 text-amber-200' : 'bg-slate-800/30 border-white/5 text-slate-400 hover:border-white/10'}`}>
                    <input type="checkbox" checked={form.vessel_ids.includes(v.id)} onChange={() => toggleVessel(v.id)} className="rounded" />
                    {v.name}
                    <span className="text-[10px] text-slate-600">({v.vessel_class})</span>
                  </label>
                ))}
              </div>
              {vessels.length === 0 && <p className="text-xs text-slate-600">No LNG vessels configured yet. Add vessels first.</p>}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#B45309' }}>{editing ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm text-slate-400">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'rgba(15,23,42,0.6)' }}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/5">
            {['User', 'Role', 'Assigned Vessels', 'Status', ''].map(h => <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}
          </tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
              <td className="px-5 py-3"><div className="text-sm text-slate-200">{u.display_name || u.username}</div><div className="text-xs text-slate-500">{u.username}</div></td>
              <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${roleCls[u.role] || ''}`}>{u.role}</span></td>
              <td className="px-5 py-3">
                {u.assigned_vessels?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {u.assigned_vessels.map(v => <span key={v.lng_vessel_id} className="px-2 py-0.5 rounded text-[10px] bg-blue-900/20 text-blue-300 border border-blue-800/30">{v.name}</span>)}
                  </div>
                ) : <span className="text-xs text-slate-600">{['admin', 'manager'].includes(u.role) ? 'All vessels' : 'None'}</span>}
              </td>
              <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded text-xs ${u.active !== false ? 'bg-emerald-900/30 text-emerald-300' : 'bg-red-900/30 text-red-300'}`}>{u.active !== false ? 'Active' : 'Inactive'}</span></td>
              <td className="px-5 py-3 flex gap-2">
                <button onClick={() => { setEditing(u); setForm({ username: u.username, password: '', role: u.role, display_name: u.display_name || '', vessel_ids: (u.assigned_vessels || []).map(v => v.lng_vessel_id) }); setShowForm(true); }} className="text-xs text-amber-400">Edit</button>
                <button onClick={() => del(u)} className="text-xs text-red-400">Delete</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
