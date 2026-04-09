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
    text:      '#cbd5e1',
    textMuted: '#475569',
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
    text:      '#e2e8f0',
    textMuted: '#64748b',
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
    // Apply CSS vars to root so legacy styles also pick up changes
    const t = themes[themeKey] || themes.dark;
    document.documentElement.style.setProperty('--bg-main', t.bg);
    document.documentElement.style.setProperty('--sidebar-bg', t.sidebar);
    document.documentElement.style.setProperty('--card-bg', t.card);
    document.documentElement.style.setProperty('--text-main', t.text);
    document.documentElement.style.setProperty('--text-muted', t.textMuted);
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
