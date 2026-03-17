import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { Strategy } from '../types';

interface BacktestSimProps {
  strategy: Strategy;
}

// Generate some mock market data
const generateData = (type: 'Long' | 'Short' | 'Combined') => {
  const data = [];
  let price = 50000;
  for (let i = 0; i < 50; i++) {
    const change = (Math.random() - 0.5) * 1000;
    
    // Bias data based on strategy type for visual effect
    if (type === 'Short' && i > 25) price -= 200; 
    if (type === 'Long' && i > 25) price += 200;
    
    price += change;
    
    let signal: 'buy' | 'sell' | undefined;
    
    // Mock signals
    if (i === 15) signal = type === 'Short' ? 'sell' : 'buy';
    if (i === 40) signal = type === 'Short' ? 'buy' : 'sell'; // Exit

    data.push({
      time: i,
      price: Math.floor(price),
      signal
    });
  }
  return data;
};

const BacktestSim: React.FC<BacktestSimProps> = ({ strategy }) => {
  const data = React.useMemo(() => generateData(strategy.type), [strategy.type]);
  const entryPoint = data.find(d => d.signal === (strategy.type === 'Short' ? 'sell' : 'buy'));
  const exitPoint = data.find(d => d.time === 40);

  const profit = entryPoint && exitPoint 
    ? strategy.type === 'Short' 
      ? ((entryPoint.price - exitPoint.price) / entryPoint.price * 100).toFixed(2)
      : ((exitPoint.price - entryPoint.price) / entryPoint.price * 100).toFixed(2)
    : '0.00';

  const isProfitable = Number(profit) > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 px-2">
        <h3 className="text-sm font-mono text-slate-400">SIMULATION: BTC/USDT 15m</h3>
        <span className={`text-sm font-bold px-2 py-1 rounded ${isProfitable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
          PnL: {profit}%
        </span>
      </div>
      
      <div className="flex-grow w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
              itemStyle={{ color: '#f8fafc' }}
              labelStyle={{ display: 'none' }}
              formatter={(value: any) => [`$${value}`, 'Price']}
            />
            <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
            
            {data.map((entry, index) => {
              if (entry.signal === 'buy') {
                return <ReferenceDot key={index} r={6} fill="#10b981" stroke="#fff" x={entry.time} y={entry.price} />;
              }
              if (entry.signal === 'sell') {
                return <ReferenceDot key={index} r={6} fill="#f43f5e" stroke="#fff" x={entry.time} y={entry.price} />;
              }
              return null;
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 text-xs font-mono text-slate-500 px-2">
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
           <span>LONG Entry / Short Exit</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full bg-rose-500"></div>
           <span>SHORT Entry / Long Exit</span>
        </div>
      </div>
    </div>
  );
};

export default BacktestSim;
