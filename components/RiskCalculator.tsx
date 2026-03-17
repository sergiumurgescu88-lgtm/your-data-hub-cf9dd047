import React, { useState } from 'react';
import { Calculator, AlertTriangle, ShieldCheck } from 'lucide-react';

const RiskCalculator: React.FC = () => {
  const [capital, setCapital] = useState<number>(1000);
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const [stopLossPercent, setStopLossPercent] = useState<number>(2.5);
  const [leverage, setLeverage] = useState<number>(1);

  // Calculations
  const riskAmount = (capital * riskPercent) / 100;
  // Position Size = Risk Amount / Stop Loss %
  // E.g. Risk $10 with 2% SL => Position must be $500
  const positionSize = riskAmount / (stopLossPercent / 100);
  
  // Margin required = Position Size / Leverage
  const marginRequired = positionSize / leverage;
  
  // Percentage of capital used
  const capitalUsage = (marginRequired / capital) * 100;

  const isHighRisk = capitalUsage > 50;
  const isExtremeLeverage = leverage > 5;

  return (
    <div className="bg-surface rounded-xl border border-slate-700 p-4 md:p-6 mb-20 md:mb-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-500/10 rounded-lg">
          <Calculator className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-100">Position Calculator</h2>
          <p className="text-xs md:text-sm text-slate-400">Risk management for Futures & Spot</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {/* Inputs */}
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">Account Balance</label>
            <div className="relative">
               <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
               <input 
                 type="number" 
                 value={capital}
                 onChange={(e) => setCapital(Number(e.target.value))}
                 className="w-full bg-background border border-slate-700 rounded-lg pl-7 pr-4 py-3 text-base md:text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                 inputMode="decimal"
               />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">Risk Per Trade (%)</label>
            <input 
              type="number" 
              step="0.1"
              value={riskPercent}
              onChange={(e) => setRiskPercent(Number(e.target.value))}
              className="w-full bg-background border border-slate-700 rounded-lg px-4 py-3 text-base md:text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
              inputMode="decimal"
            />
            <p className="text-[10px] text-slate-500 mt-1.5">Recommended: 1-2%</p>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">Stop Loss Distance (%)</label>
            <input 
              type="number" 
              step="0.1"
              value={stopLossPercent}
              onChange={(e) => setStopLossPercent(Number(e.target.value))}
              className="w-full bg-background border border-slate-700 rounded-lg px-4 py-3 text-base md:text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">Leverage (x)</label>
            <div className="flex gap-2">
                <input 
                  type="number" 
                  min="1"
                  max="125"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className={`flex-1 bg-background border rounded-lg px-4 py-3 text-base md:text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors ${isExtremeLeverage ? 'border-warning/50' : 'border-slate-700'}`}
                  inputMode="numeric"
                />
                {/* Quick select buttons for mobile convenience */}
                {[1, 5, 10, 20].map(val => (
                    <button 
                        key={val}
                        onClick={() => setLeverage(val)}
                        className={`px-3 rounded-lg border text-xs font-bold transition-colors ${leverage === val ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                    >
                        {val}x
                    </button>
                ))}
            </div>
             {isExtremeLeverage && <p className="text-[10px] text-warning mt-1.5">Warning: High leverage increases liquidation risk.</p>}
          </div>
        </div>

        {/* Results */}
        <div className="bg-background rounded-xl p-5 border border-slate-700 flex flex-col justify-center shadow-inner">
          <div className="mb-6">
            <span className="text-xs text-slate-500 font-mono block mb-1 uppercase tracking-wider">Max Loss (Risk)</span>
            <span className="text-3xl font-bold text-danger">{riskAmount.toFixed(2)} <span className="text-sm font-normal text-slate-500">USDT</span></span>
          </div>

          <div className="mb-6">
            <span className="text-xs text-slate-500 font-mono block mb-1 uppercase tracking-wider">Total Position Size</span>
            <span className="text-3xl font-bold text-slate-100">{Math.floor(positionSize)} <span className="text-sm font-normal text-slate-500">USDT</span></span>
          </div>

          <div className="p-4 bg-surface rounded-lg border border-slate-700 mb-4">
             <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400">Margin Required</span>
                <span className="text-sm font-mono text-blue-400">{marginRequired.toFixed(2)} USDT</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Capital Usage</span>
                <span className={`text-sm font-mono ${isHighRisk ? 'text-danger' : 'text-success'}`}>{capitalUsage.toFixed(1)}%</span>
             </div>
          </div>

          {isHighRisk ? (
            <div className="flex items-start gap-3 text-danger bg-danger/10 p-3 rounded-lg text-xs leading-relaxed border border-danger/20">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p><strong>High Risk:</strong> Requires {'>'} 50% of account balance. Reduce position size or increase leverage (carefully).</p>
            </div>
          ) : (
             <div className="flex items-start gap-3 text-success bg-success/10 p-3 rounded-lg text-xs leading-relaxed border border-success/20">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <p><strong>Safe Allocation:</strong> Good risk management. You are protecting your capital.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskCalculator;