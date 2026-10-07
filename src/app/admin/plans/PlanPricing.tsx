"use client";

import { useState } from "react";

/** Monthly and yearly price, with the yearly saving worked out as you type. */
export function PlanPricing({ monthly, yearly }: { monthly: number; yearly: number }) {
  const [m, setM] = useState(String(monthly));
  const [y, setY] = useState(String(yearly));
  const mn = Number(m) || 0;
  const yn = Number(y) || 0;
  const saving = mn > 0 && yn > 0 ? Math.floor((1 - yn / (mn * 12)) * 100) : null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label className="block space-y-1.5">
        <span className="label">Monthly (US$)</span>
        <input name="price" type="number" min={0} max={1000} step="0.01" value={m} onChange={(e) => setM(e.target.value)} required className="input tnum" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Yearly (US$)</span>
        <input name="yearly" type="number" min={0} max={10000} step="0.01" value={y} onChange={(e) => setY(e.target.value)} className="input tnum" />
        <span className="block text-xs text-dim">0 = not offered yet</span>
      </label>
      <div className="space-y-1.5">
        <span className="label">Yearly saving</span>
        <p aria-live="polite" className={`input tnum ${saving == null ? "text-mute" : saving < 0 ? "text-danger" : "text-lime"}`}>
          {saving == null ? "Not set" : saving < 0 ? `Costs ${-saving}% more than monthly` : `${saving}% vs paying monthly`}
        </p>
      </div>
    </div>
  );
}
