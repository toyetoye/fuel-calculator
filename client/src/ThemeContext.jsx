// ThemeContext.jsx — shared theme provider + switcher for FORCAP
import React, { createContext, useContext, useState, useEffect } from 'react';

export const themes = {
  dark: {
    label: 'Dark',
    icon: '🌑',
    bg:        'linear-gradient(180deg,#0B1120 0%,#0F172A 40%,#111827 100%)',
    sidebar:   'rgba(8,15,30,0.95)',
    card:      'rgba(15,23,42,0.7)',
    cardBorder:'rgba(255,255,255,0.05)',
    table:     'rgba(8,15,30,0.8)',
    tableRow:  'rgba(15,23,42,0.4)',
    text:        '#f1f5f9',   // slate-100 — high contrast on dark bg
    textMuted:   '#94a3b8',   // slate-400 — readable secondary text
    textSubtle:  '#64748b',   // slate-500 — chart labels
    chartLabel:  '#94a3b8',   // specific override for SVG chart axis labels
    input:     '#1e293b',
  },
  dim: {
    label: 'Dim',
    icon: '🌗',
    bg:        'linear-gradient(180deg,#1e2d40 0%,#1a2a3a 40%,#1c2e3e 100%)',
    sidebar:   'rgba(18,28,45,0.97)',
    card:      'rgba(24,38,58,0.85)',
    cardBorder:'rgba(255,255,255,0.08)',
    table:     'rgba(15,25,40,0.9)',
    tableRow:  'rgba(22,34,52,0.6)',
    text:        '#f8fafc',   // slate-50 — near-white, high contrast
    textMuted:   '#94a3b8',   // slate-400 — readable secondary text
    textSubtle:  '#64748b',   // slate-500
    chartLabel:  '#94a3b8',   // chart axis labels
    input:     '#1e3048',
  },
  light: {
    label: 'Light',
    icon: '☀️',
    bg:        'linear-gradient(180deg,#f0f4f8 0%,#e8eef4 40%,#edf2f7 100%)',
    sidebar:   'rgba(255,255,255,0.97)',
    card:      'rgba(255,255,255,0.9)',
    cardBorder:'rgba(0,0,0,0.08)',
    table:     'rgba(255,255,255,0.95)',
    tableRow:  'rgba(241,245,249,0.8)',
    text:      '#1e293b',
    textMuted: '#64748b',
    input:     '#f8fafc',
  },
};

const ThemeContext = createContext({ theme: themes.dark, themeKey: 'dark', setThemeKey: ()=>{} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(() => localStorage.getItem('forcap_theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('forcap_theme', themeKey);
    const t = themes[themeKey] || themes.dark;

    // CSS variables for direct style prop usage
    document.documentElement.style.setProperty('--bg-main',         t.bg);
    document.documentElement.style.setProperty('--sidebar-bg',      t.sidebar);
    document.documentElement.style.setProperty('--card-bg',         t.card);
    document.documentElement.style.setProperty('--card-border',     t.cardBorder);
    document.documentElement.style.setProperty('--table-head-bg',   t.table);
    document.documentElement.style.setProperty('--table-row-bg',    t.tableRow);
    document.documentElement.style.setProperty('--text-main',       t.text);
    document.documentElement.style.setProperty('--text-muted',      t.textMuted);
    document.documentElement.style.setProperty('--text-subtle',     t.textSubtle || t.textMuted);
    document.documentElement.style.setProperty('--chart-label',     t.chartLabel || '#94a3b8');
    document.documentElement.style.setProperty('--input-bg',        t.input);
    document.documentElement.setAttribute('data-theme', themeKey);
    document.body.style.color = t.text;
    document.body.style.background = t.bg;

    // Inject comprehensive Tailwind override stylesheet
    const styleId = 'forcap-theme-styles';
    let el = document.getElementById(styleId);
    if (!el) { el = document.createElement('style'); el.id = styleId; document.head.appendChild(el); }

    const DARK_OVERRIDES = `
      /* ── DARK / DIM: all slate text classes → near-white for high contrast ── */
      [data-theme="dark"] .text-slate-100, [data-theme="dim"] .text-slate-100 { color: #f8fafc !important; }
      [data-theme="dark"] .text-slate-200, [data-theme="dim"] .text-slate-200 { color: #f1f5f9 !important; }
      [data-theme="dark"] .text-slate-300, [data-theme="dim"] .text-slate-300 { color: #e2e8f0 !important; }
      [data-theme="dark"] .text-slate-400, [data-theme="dim"] .text-slate-400 { color: #cbd5e1 !important; }
      [data-theme="dark"] .text-slate-500, [data-theme="dim"] .text-slate-500 { color: #94a3b8 !important; }
      [data-theme="dark"] .text-slate-600, [data-theme="dim"] .text-slate-600 { color: #64748b !important; }
      /* Sidebar always dark bg → always white text */
      [data-theme="light"] nav .text-slate-400 { color: #1e293b !important; }
      [data-theme="light"] nav .text-slate-500 { color: #334155 !important; }
      [data-theme="light"] nav .text-slate-600 { color: #334155 !important; }
    `;

    const LIGHT_TABLE_VARS = ``; // vars now set via setProperty for all themes
    const LIGHT_OVERRIDES = `
      /* ── LIGHT: all slate text classes → near-black for high contrast ── */
      [data-theme="light"] .text-slate-100 { color: #0f172a !important; }
      [data-theme="light"] .text-slate-200 { color: #1e293b !important; }
      [data-theme="light"] .text-slate-300 { color: #334155 !important; }
      [data-theme="light"] .text-slate-400 { color: #475569 !important; }
      [data-theme="light"] .text-slate-500 { color: #475569 !important; }
      [data-theme="light"] .text-slate-600 { color: #334155 !important; }
      /* Light theme: amber accents should stay visible */
      [data-theme="light"] .text-amber-300 { color: #b45309 !important; }
      [data-theme="light"] .text-amber-400 { color: #92400e !important; }
      [data-theme="light"] .text-teal-300  { color: #0f766e !important; }
      [data-theme="light"] .text-blue-300  { color: #1d4ed8 !important; }
      [data-theme="light"] .text-red-300   { color: #dc2626 !important; }
      [data-theme="light"] .text-green-300 { color: #15803d !important; }
      [data-theme="light"] .text-green-400 { color: #15803d !important; }
      [data-theme="light"] .text-purple-300 { color: #7e22ce !important; }
      /* Light theme: card/table backgrounds → white */
      [data-theme="light"] [class*="border-white"] { border-color: rgba(0,0,0,0.12) !important; }
      [data-theme="light"] .hover\:bg-white\/5:hover { background: rgba(0,0,0,0.05) !important; }
      /* Sidebar on light theme: ALWAYS dark bg with white text */
      [data-theme="light"] nav,
      [data-theme="light"] nav button { color: #e2e8f0 !important; }
      [data-theme="light"] nav .text-amber-300 { color: #fbbf24 !important; }
      /* Override monochrome/tracking labels in sidebar */
      [data-theme="light"] nav .text-slate-600 { color: #94a3b8 !important; }
    `;

    el.textContent = DARK_OVERRIDES + LIGHT_TABLE_VARS + LIGHT_OVERRIDES;
  }, [themeKey]);

  return (
    <ThemeContext.Provider value={{ theme: themes[themeKey] || themes.dark, themeKey, setThemeKey }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── ThemeSwitcher dropdown ────────────────────────────────────────────────────
export function ThemeSwitcher() {
  const { themeKey, setThemeKey } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 text-xs transition-all"
        title="Change theme">
        {themes[themeKey]?.icon} <span className="hidden md:inline">{themes[themeKey]?.label}</span>
        <span className="text-[10px] opacity-50">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-white/10 overflow-hidden shadow-2xl"
            style={{ background: 'rgba(8,15,30,0.98)', minWidth: 130 }}>
            {Object.entries(themes).map(([key, t]) => (
              <button key={key} onClick={() => { setThemeKey(key); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-white/10
                  ${themeKey === key ? 'text-amber-300 bg-amber-900/20' : 'text-slate-300'}`}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {themeKey === key && <span className="ml-auto text-amber-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
