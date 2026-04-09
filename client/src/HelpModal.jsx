// HelpModal.jsx — embedded contextual help for LNG and LPG users
import React, { useState } from 'react';

function HelpSection({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-bold text-amber-300 mb-2 pb-1 border-b border-white/5">{title}</h3>
      <div className="text-sm text-slate-300 space-y-1.5">{children}</div>
    </div>
  );
}
function P({ children }) { return <p className="leading-relaxed">{children}</p>; }
function Li({ children }) { return <li className="flex gap-2"><span className="text-amber-500 mt-0.5 shrink-0">›</span><span>{children}</span></li>; }

export function LNGHelp() {
  return (
    <div>
      <HelpSection title="Dashboard Overview">
        <P>The LNG Dashboard shows aggregate fleet performance across all vessels. Use the vessel dropdown (top right) to drill into a single vessel, or keep it on <b>All Vessels (Fleet)</b> for a combined view.</P>
      </HelpSection>
      <HelpSection title="CII Rating">
        <P>The <b>Carbon Intensity Indicator</b> is calculated under IMO MEPC.339(76) for LNG Carriers.</P>
        <ul className="space-y-1 mt-1">
          <Li>Attained CII = (Total CO₂ × 10⁶) ÷ (DWT × Distance)</Li>
          <Li>CF for HFO = 3.114 t-CO₂/t-fuel</Li>
          <Li>Required CII decreases each year — the Z% reduction factor for 2026 is 9%</Li>
          <Li>Rating A = excellent, E = requires corrective action plan</Li>
        </ul>
        <P className="mt-1">The dashboard shows <b>aggregate CII to date</b> — all voyage data ever recorded for this vessel/fleet.</P>
      </HelpSection>
      <HelpSection title="Net Excess Fuel">
        <P>Net Excess = actual fuel consumed minus the charter party guaranteed allowance (based on speed-fuel interpolation curves). Positive = charterer is liable; negative = within allowance.</P>
      </HelpSection>
      <HelpSection title="Creating a Voyage">
        <ul className="space-y-1">
          <Li>Click <b>Voyages</b> → <b>New Voyage</b> in the sidebar</Li>
          <Li>Fill in vessel, voyage number, leg type (LADEN or BALLAST), FAOP and EOSP times</Li>
          <Li>After saving, add daily <b>Noon Reports</b> from the voyage detail page</Li>
          <Li>Each noon report captures steaming hours, distance, HFO consumed, FOE, and weather</Li>
          <Li>The calculation runs automatically and shows guaranteed vs actual fuel</Li>
        </ul>
      </HelpSection>
      <HelpSection title="Interpolation Curves">
        <P>Speed-fuel curves define the guaranteed fuel consumption at each speed for each vessel class and leg type. If you see "No interpolation curve found", check that the vessel's <b>Vessel Class</b> in LNG Vessels settings matches an available curve (Rivers, Rivers Plus).</P>
      </HelpSection>
      <HelpSection title="Vessel Classes">
        <ul className="space-y-1">
          <Li><b>Rivers class</b> — 141,090 m³, DWT 79,541 (Adamawa, Akwa-Ibom, Cross-River, River-Niger)</Li>
          <Li><b>Rivers Plus class</b> — 137,100 m³, DWT 79,822 (Bayelsa, Rivers, Sokoto)</Li>
        </ul>
      </HelpSection>
    </div>
  );
}

export function LPGHelp() {
  return (
    <div>
      <HelpSection title="Dashboard Overview">
        <P>The LPG Dashboard shows performance analytics for the Alfred Temile fleet. Historical data (2020–2023) is imported from the XLS noon log. New data is entered via <b>Daily Noon</b>.</P>
      </HelpSection>
      <HelpSection title="Charts Explained">
        <ul className="space-y-1">
          <Li><b>Propeller Slip Trend</b> — monthly average slip during sea passages only. The 6% dashed line marks the hull fouling threshold.</Li>
          <Li><b>VLSFO Consumption</b> — monthly total VLSFO consumed in MT</Li>
          <Li><b>Cylinder Oil Rate</b> — L consumed per ME running hour (lower is better)</Li>
          <Li><b>Average AE Load</b> — monthly average auxiliary engine load in kW</Li>
        </ul>
        <P>Hover over any data point to see the exact value for that month.</P>
      </HelpSection>
      <HelpSection title="CII Rating">
        <P>CII for small coastal LPG carriers is calculated under IMO MEPC.339(76) using the Gas Carrier reference line. Small vessels in coastal trading typically attain an E rating under this framework — this reflects the framework's calibration for large ocean-going vessels, not the vessel's operational efficiency.</P>
      </HelpSection>
      <HelpSection title="Alerts & Anomalies">
        <ul className="space-y-1">
          <Li><b>High Slip (sea passage)</b> — propeller slip &gt;8% during actual steaming. Possible causes: hull fouling, pitch wear, fouled propeller.</Li>
          <Li><b>Negative VLSFO</b> — negative total fuel entry. Check the noon log entry for that date.</Li>
        </ul>
      </HelpSection>
      <HelpSection title="Entering Daily Noon">
        <ul className="space-y-1">
          <Li>Click <b>Daily Noon</b> in the sidebar</Li>
          <Li>Hours Breakdown: enter Sea Steam, Anchor/Drift, Manoeuvring, Berth hours — Total auto-calculates</Li>
          <Li>Enter ME consumption under Fuel — VLSFO section</Li>
          <Li>Save the record — it will appear in History immediately</Li>
        </ul>
      </HelpSection>
      <HelpSection title="Importing XLS">
        <P>Admin users can bulk-import historical noon logs from the Alfred Temile XLS format. Use <b>Import XLS</b> in the sidebar. The preview step shows how many records were parsed before confirming.</P>
      </HelpSection>
    </div>
  );
}

export function HelpModal({ type, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
      <div className="relative z-10 rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        style={{ background: 'rgba(8,15,30,0.98)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{type === 'lng' ? '🚢' : '⛽'}</span>
            <div>
              <h2 className="font-bold text-slate-100">{type === 'lng' ? 'LNG Dashboard Help' : 'LPG Dashboard Help'}</h2>
              <p className="text-xs text-slate-500">FORCAP Maritime Intelligence</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none px-2">✕</button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {type === 'lng' ? <LNGHelp /> : <LPGHelp />}
        </div>
        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-xs text-slate-600">FORCAP v1.0 — © 2025 FORCAP Maritime Intelligence Ltd</span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-medium transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// Help trigger button — small "?" icon
export function HelpButton({ type }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center justify-center w-7 h-7 rounded-full border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 text-xs font-bold transition-all"
        title={`${type.toUpperCase()} Help`}>
        ?
      </button>
      {open && <HelpModal type={type} onClose={() => setOpen(false)} />}
    </>
  );
}
