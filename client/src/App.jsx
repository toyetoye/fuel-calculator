import React, { useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import api from './api';
import Login from './pages/Login';
import VoyageList from './pages/VoyageList';
import VoyageForm from './pages/VoyageForm';
import VoyageDetail from './pages/VoyageDetail';
import VoyageImport from './pages/VoyageImport';
import VesselManage from './pages/VesselManage';
import UserManage from './pages/UserManage';
import FuelPrices from './pages/FuelPrices';
import { LPGDashboard, LPGHistory, LPGMonthDetail, LPGNoonForm, LPGImport } from './pages/LPGFuel';
import LNGDashboard from './pages/LNGDashboard';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return children;
}

function Sidebar() {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const r = user?.role;

  const isAdmin = r === 'admin';
  const isManager = r === 'manager';
  const isSup = r === 'superintendent';
  const isVessel = r === 'vessel';

  const vesselNames = user?.vessel_names || [];
  const hasLpg = vesselNames.some(v => v.toLowerCase().includes('alfred temile'));
  const hasLng = vesselNames.some(v => !v.toLowerCase().includes('alfred temile')) || isAdmin || isManager || isSup;
  const lpgOnly = isVessel && hasLpg && !hasLng;
  const lngOnly = isVessel && hasLng && !hasLpg;

  const active = (path) => loc.pathname === path || loc.pathname.startsWith(path + '/');

  const btn = (path, label, icon) => (
    <button key={path} onClick={() => nav(path)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active(path) ? 'bg-amber-900/30 text-amber-300' : 'text-slate-400 hover:bg-white/5'}`}>
      <span className="text-base">{icon}</span>{label}
    </button>
  );

  return (
    <div className="w-56 min-h-screen flex flex-col border-r border-white/5 sticky top-0 h-screen overflow-y-auto" style={{ background: 'rgba(8,15,30,0.95)' }}>
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>FC</div>
          <div>
            <div className="text-sm font-bold text-slate-100">FORCAP</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">{user?.role}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {/* Pure LPG vessel user */}
        {lpgOnly && (
          <>
            {btn('/lpg',         'Dashboard',  '◈')}
            {btn('/lpg/noon',    'Daily Noon', '✏️')}
            {btn('/lpg/history', 'History',    '📋')}
          </>
        )}

        {/* Pure LNG vessel user */}
        {lngOnly && (
          <>
            {btn('/lng/dashboard', 'Dashboard', '◈')}
            {btn('/voyages',       'Voyages',   '⊞')}
          </>
        )}

        {/* Admin / Superintendent / Manager — full nav */}
        {(isAdmin || isManager || isSup) && (
          <>
            {/* LNG section */}
            <div className="text-[10px] text-slate-600 uppercase tracking-widest px-3 pt-2 pb-1">LNG Fleet</div>
            {btn('/lng/dashboard', 'Dashboard',   '◈')}
            {btn('/voyages',       'Voyages',      '⊞')}
            {(isAdmin || isSup) && btn('/voyages/new', 'New Voyage', '⊕')}

            {/* LPG section */}
            <div className="text-[10px] text-slate-600 uppercase tracking-widest px-3 pt-3 pb-1">LPG Fleet</div>
            {btn('/lpg',         'Dashboard',  '◈')}
            {btn('/lpg/noon',    'Daily Noon', '✏️')}
            {btn('/lpg/history', 'History',    '📋')}
            {isAdmin && btn('/lpg/import', 'Import XLS', '📊')}

            {/* Admin tools */}
            {isAdmin && (
              <>
                <div className="text-[10px] text-slate-600 uppercase tracking-widest px-3 pt-3 pb-1">Admin</div>
                {btn('/vessels',     'LNG Vessels', '⚓')}
                {btn('/fuel-prices', 'Fuel Prices', '⊙')}
                {btn('/users',       'Users',       '◈')}
              </>
            )}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="text-xs text-slate-500 mb-1">{user?.display_name}</div>
        <button onClick={api.logout} className="text-xs text-red-400 hover:text-red-300">Sign Out</button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(api.getUser());
  const loc = useLocation();
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <div className="flex min-h-screen font-sans text-slate-200" style={{ background: 'linear-gradient(180deg,#0B1120 0%,#0F172A 40%,#111827 100%)' }}>
        {user && loc.pathname !== '/login' && <Sidebar />}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/login"             element={<Login />} />
            <Route path="/voyages"           element={<ProtectedRoute><VoyageList /></ProtectedRoute>} />
            <Route path="/voyages/new"       element={<ProtectedRoute><VoyageForm /></ProtectedRoute>} />
            <Route path="/voyages/:id/edit"  element={<ProtectedRoute><VoyageForm /></ProtectedRoute>} />
            <Route path="/voyages/import"    element={<VoyageImport />} />
            <Route path="/voyages/:id"       element={<ProtectedRoute><VoyageDetail /></ProtectedRoute>} />
            <Route path="/lng/dashboard"     element={<ProtectedRoute><LNGDashboard /></ProtectedRoute>} />
            <Route path="/lpg"               element={<ProtectedRoute><LPGDashboard /></ProtectedRoute>} />
            <Route path="/lpg/noon"          element={<ProtectedRoute><LPGNoonForm /></ProtectedRoute>} />
            <Route path="/lpg/history"       element={<ProtectedRoute><LPGHistory /></ProtectedRoute>} />
            <Route path="/lpg/history/:month_key" element={<ProtectedRoute><LPGMonthDetail /></ProtectedRoute>} />
            <Route path="/lpg/import"        element={<ProtectedRoute><LPGImport /></ProtectedRoute>} />
            <Route path="/vessels"           element={<ProtectedRoute><VesselManage /></ProtectedRoute>} />
            <Route path="/fuel-prices"       element={<ProtectedRoute><FuelPrices /></ProtectedRoute>} />
            <Route path="/users"             element={<ProtectedRoute><UserManage /></ProtectedRoute>} />
            <Route path="*"                  element={<Navigate to={user ? '/lpg' : '/login'} />} />
          </Routes>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
