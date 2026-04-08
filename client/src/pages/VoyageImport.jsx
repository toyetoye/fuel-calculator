import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function VoyageImport() {
  const [step, setStep]         = useState('upload'); // upload | preview | importing | done
  const [file, setFile]         = useState(null);
  const [parsed, setParsed]     = useState([]);       // voyages from preview
  const [selected, setSelected] = useState([]);       // which sheets to import
  const [results, setResults]   = useState([]);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const fileRef = useRef();
  const nav = useNavigate();

  const card  = 'rounded-xl p-5 border border-white/5 bg-slate-900/60';
  const btn   = 'px-4 py-2 rounded-lg text-sm font-semibold text-white';
  const inp   = 'px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-amber-600 w-full';
  const amber = { background: 'linear-gradient(135deg,#B45309,#D97706)' };

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('fuel_token')}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setParsed(data.voyages);
      setSelected(data.voyages.map((_, i) => i)); // select all by default
      setStep('preview');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    const toImport = parsed.filter((_, i) => selected.includes(i));
    if (!toImport.length) return;
    setLoading(true);
    setError('');
    setStep('importing');
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('fuel_token')}`,
        },
        body: JSON.stringify({ voyages: toImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResults(data.imported);
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(i) {
    setSelected(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Import Voyages from Excel</h1>
          <p className="text-sm text-slate-500 mt-1">Upload a voyage calculation spreadsheet — voyages are created as drafts for your review</p>
        </div>
        <button onClick={() => nav('/voyages')} className={`${btn} bg-slate-700/50 border border-white/10`}>← Back</button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
        {['UPLOAD', 'PREVIEW', 'IMPORT', 'DONE'].map((s, i) => (
          <React.Fragment key={s}>
            <span className={
              step === s.toLowerCase() || (step === 'importing' && s === 'IMPORT') || (step === 'done' && s === 'DONE')
                ? 'text-amber-400 font-bold'
                : (i < ['upload','preview','importing','done'].indexOf(step) ? 'text-slate-400' : 'text-slate-600')
            }>{s}</span>
            {i < 3 && <span className="text-slate-700">→</span>}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-900/30 border border-red-700/40 text-red-300 text-sm">{error}</div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === 'upload' && (
        <div className={card}>
          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center cursor-pointer hover:border-amber-700/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            onDragOver={e => e.preventDefault()}
          >
            <div className="text-4xl mb-3">📊</div>
            <div className="text-sm font-semibold text-slate-200">Drop Excel file here or click to browse</div>
            <div className="text-xs text-slate-500 mt-2">.xlsx files only · Each voyage sheet is parsed automatically</div>
            {file && (
              <div className="mt-4 text-xs font-mono text-amber-400">
                ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => setFile(e.target.files[0])} />
          <div className="mt-4 flex justify-end">
            <button onClick={handlePreview} disabled={!file || loading} className={`${btn}`} style={amber}>
              {loading ? 'Parsing…' : 'Parse & Preview →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className={`${card} text-sm text-slate-400`}>
            Found <span className="text-amber-400 font-bold">{parsed.length}</span> voyage sheet{parsed.length !== 1 ? 's' : ''}. 
            Review the parsed data below. Deselect any sheets you don't want to import.
          </div>

          {parsed.map((v, i) => (
            <div key={i} className={`${card} ${selected.includes(i) ? 'border-amber-800/40' : 'opacity-50'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected.includes(i)} onChange={() => toggleSelect(i)}
                  className="mt-1 accent-amber-500 w-4 h-4 cursor-pointer" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-slate-100">{v.vessel_name || '—'}</span>
                    <span className="text-xs font-mono text-amber-400">{v.voyage_number || '—'}</span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${v.leg_type === 'LADEN'
                      ? 'bg-blue-900/30 text-blue-300 border-blue-700/40'
                      : 'bg-slate-700/30 text-slate-300 border-slate-600/40'}`}>{v.leg_type}</span>
                    <span className="text-xs text-slate-500">Sheet: {v.sheet_name}</span>
                    <span className="text-xs font-mono text-emerald-400">{v.report_count} day reports</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div><span className="text-slate-500">Port: </span><span className="text-slate-300">{v.discharge_port || '—'}</span></div>
                    <div><span className="text-slate-500">FAOP: </span><span className="text-slate-300">{v.faop_time ? new Date(v.faop_time).toLocaleString() : '—'} {v.faop_timezone}</span></div>
                    <div><span className="text-slate-500">EOSP: </span><span className="text-slate-300">{v.eosp_time ? new Date(v.eosp_time).toLocaleString() : '—'} {v.eosp_timezone}</span></div>
                    <div><span className="text-slate-500">Gauging after: </span><span className="text-slate-300">{v.gauging_after_m3 || 0} M³</span></div>
                    <div><span className="text-slate-500">Gauging before: </span><span className="text-slate-300">{v.gauging_before_m3 || 0} M³</span></div>
                    <div><span className="text-slate-500">Gauging after time: </span><span className="text-slate-300">{v.gauging_after_time ? new Date(v.gauging_after_time).toLocaleString() : '—'}</span></div>
                  </div>

                  {/* First 5 daily reports preview */}
                  {v.reports?.length > 0 && (
                    <div>
                      <div className="text-xs font-mono text-slate-500 mb-1">FIRST 5 DAYS</div>
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full border-collapse">
                          <thead>
                            <tr className="text-slate-500">
                              {['Day','Date','Hrs','Revs','NM','HFO','FOE','Remarks'].map(h => (
                                <th key={h} className="text-left pr-4 pb-1 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {v.reports.slice(0, 5).map((r, j) => (
                              <tr key={j} className="text-slate-300">
                                <td className="pr-4 pb-0.5">{r.day_number}</td>
                                <td className="pr-4 pb-0.5">{r.report_date}</td>
                                <td className="pr-4 pb-0.5">{r.steaming_hours}</td>
                                <td className="pr-4 pb-0.5">{r.total_revs}</td>
                                <td className="pr-4 pb-0.5">{r.distance_nm}</td>
                                <td className="pr-4 pb-0.5">{r.hfo_consumed}</td>
                                <td className="pr-4 pb-0.5">{r.foe_consumed}</td>
                                <td className="pr-4 pb-0.5 text-slate-500 truncate max-w-xs">{r.weather_condition || r.remarks || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {v.reports.length > 5 && <div className="text-xs text-slate-600 mt-1">… and {v.reports.length - 5} more days</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center pt-2">
            <button onClick={() => { setStep('upload'); setFile(null); setParsed([]); }} className={`${btn} bg-slate-700/50 border border-white/10`}>← Re-upload</button>
            <button onClick={handleConfirm} disabled={!selected.length || loading} className={`${btn}`} style={amber}>
              Import {selected.length} voyage{selected.length !== 1 ? 's' : ''} as drafts →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Importing ── */}
      {step === 'importing' && (
        <div className={`${card} text-center py-12`}>
          <div className="text-3xl mb-4">⏳</div>
          <div className="text-sm text-slate-400">Importing voyages and noon reports…</div>
        </div>
      )}

      {/* ── STEP 4: Done ── */}
      {step === 'done' && (
        <div className="space-y-4">
          <div className={`${card} text-center py-8`}>
            <div className="text-3xl mb-3">✅</div>
            <div className="text-sm font-semibold text-slate-200 mb-1">Import complete</div>
            <div className="text-xs text-slate-500">{results.length} voyage{results.length !== 1 ? 's' : ''} created as drafts</div>
          </div>
          {results.map((r, i) => (
            <div key={i} className={`${card} flex items-center justify-between`}>
              <div>
                <div className="text-sm font-semibold text-slate-200">{r.vessel_name} · {r.voyage_number}</div>
                <div className="text-xs text-slate-500 mt-0.5">{r.reports_imported} noon reports imported</div>
              </div>
              <button onClick={() => nav(`/voyages/${r.voyage_id}`)} className={`${btn} text-xs`} style={amber}>
                Open →
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button onClick={() => nav('/voyages')} className={`${btn} bg-slate-700/50 border border-white/10`}>← All Voyages</button>
          </div>
        </div>
      )}
    </div>
  );
}
