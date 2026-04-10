const BASE = '/api';
const getToken = () => localStorage.getItem('fuel_token');
const setToken = t => localStorage.setItem('fuel_token', t);
const getUser = () => { const u = localStorage.getItem('fuel_user'); return u ? JSON.parse(u) : null; };
const setUser = u => localStorage.setItem('fuel_user', JSON.stringify(u));

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers } });
  if (res.status === 401 && !path.includes('/auth/login')) { localStorage.removeItem('fuel_token'); localStorage.removeItem('fuel_user'); window.location.href = '/login'; throw new Error('Unauthorized'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const api = {
  login: async (u, p) => { const d = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }); setToken(d.token); setUser(d.user); return d; },
  logout: () => { localStorage.removeItem('fuel_token'); localStorage.removeItem('fuel_user'); window.location.href = '/login'; },
  getUser, getToken,

  // Users
  listUsers: () => apiFetch('/auth/users'),
  createUser: u => apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(u) }),
  updateUser: (id, u) => apiFetch(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(u) }),
  deleteUser: id => apiFetch(`/auth/users/${id}`, { method: 'DELETE' }),

  // Reference
  getVessels: () => apiFetch('/ref/vessels'),
  getExclusions: () => apiFetch('/ref/exclusions'),
  getCurves: (cls, leg) => apiFetch(`/ref/curves/${cls}/${leg}`),

  // LNG Vessel management
  listLngVessels: () => apiFetch('/lng-vessels'),
  createLngVessel: v => apiFetch('/lng-vessels', { method: 'POST', body: JSON.stringify(v) }),
  updateLngVessel: (id, v) => apiFetch(`/lng-vessels/${id}`, { method: 'PUT', body: JSON.stringify(v) }),
  deleteLngVessel: id => apiFetch(`/lng-vessels/${id}`, { method: 'DELETE' }),

  // Fuel prices
  listFuelPrices: () => apiFetch('/fuel-prices'),
  lookupPrice: (year, month, type) => apiFetch(`/fuel-prices/lookup?year=${year}&month=${month}&fuel_type=${type || 'VLSFO'}`),
  saveFuelPrice: p => apiFetch('/fuel-prices', { method: 'POST', body: JSON.stringify(p) }),
  deleteFuelPrice: id => apiFetch(`/fuel-prices/${id}`, { method: 'DELETE' }),
  fetchLivePrices: () => apiFetch('/fuel-prices/fetch-live'),

  // Voyages
  listVoyages: () => apiFetch('/voyages'),
  getVoyage: id => apiFetch(`/voyages/${id}`),
  createVoyage: v => apiFetch('/voyages', { method: 'POST', body: JSON.stringify(v) }),
  updateVoyage: (id, v) => apiFetch(`/voyages/${id}`, { method: 'PUT', body: JSON.stringify(v) }),
  finaliseVoyage: id => apiFetch(`/voyages/${id}/finalise`, { method: 'PUT' }),
  unfinaliseVoyage: id => apiFetch(`/voyages/${id}/unfinalise`, { method: 'PUT' }),
  deleteVoyage: id => apiFetch(`/voyages/${id}`, { method: 'DELETE' }),

  // Noon reports
  getReports: voyId => apiFetch(`/reports/${voyId}`),
  saveReport: (voyId, r) => apiFetch(`/reports/${voyId}`, { method: 'POST', body: JSON.stringify(r) }),
  bulkSaveReports: (voyId, reports) => apiFetch(`/reports/${voyId}/bulk`, { method: 'POST', body: JSON.stringify({ reports }) }),


  // Generic helpers used by LPG module
  get: path => apiFetch(path.startsWith('/api') ? path.slice(4) : path),
  upload: async (path, formData) => {
    const p = path.startsWith('/api') ? path.slice(4) : path;
    const token = getToken();
    const res = await fetch('/api' + p, {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: formData,
    });
    if (res.status === 401 && !path.includes('/auth/login')) { localStorage.removeItem('fuel_token'); localStorage.removeItem('fuel_user'); window.location.href = '/login'; throw new Error('Unauthorized'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Export
  getPdfUrl: voyId => `${BASE}/export/${voyId}/pdf?token=${getToken()}`,
};
export default api;
