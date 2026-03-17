import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, ISeriesApi, IChartApi, LineStyle, UTCTimestamp } from 'lightweight-charts';
import { ArrowUp, ArrowDown, Activity, Layers, Settings, RefreshCw, Wifi, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

interface CandleData {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorState {
  sma: boolean;
  ema: boolean;
  bb: boolean;
  macd: boolean;
  rsi: boolean;
}

// --- Indicator Calculation Helpers ---

const calculateSMA = (data: CandleData[], period: number) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val.close, 0);
    result.push({ time: data[i].time as UTCTimestamp, value: sum / period });
  }
  return result;
};

const calculateEMA = (data: CandleData[], period: number) => {
  const result = [];
  const k = 2 / (period + 1);
  let ema = data[0].close;
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema = data[i].close;
    } else {
      ema = (data[i].close - ema) * k + ema;
    }
    if (i >= period - 1) {
      result.push({ time: data[i].time as UTCTimestamp, value: ema });
    }
  }
  return result;
};

const calculateBB = (data: CandleData[], period: number = 20, stdDevMult: number = 2) => {
  const upper = [];
  const lower = [];
  const basis = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((acc, val) => acc + val.close, 0) / period;
    
    const sumSqDiff = slice.reduce((acc, val) => acc + Math.pow(val.close - avg, 2), 0);
    const stdDev = Math.sqrt(sumSqDiff / period);
    
    const time = data[i].time as UTCTimestamp;
    basis.push({ time, value: avg });
    upper.push({ time, value: avg + stdDev * stdDevMult });
    lower.push({ time, value: avg - stdDev * stdDevMult });
  }
  return { upper, lower, basis };
};

const calculateRSI = (data: CandleData[], period: number = 14) => {
  const result = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (i >= period) {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push({ time: data[i].time as UTCTimestamp, value: rsi });
    }
  }
  return result;
};

const calculateMACD = (data: CandleData[]) => {
  // MACD 12, 26, 9
  const closes = data.map(d => d.close);
  
  const getEMAArray = (values: number[], period: number) => {
    const k = 2 / (period + 1);
    const res = new Array(values.length).fill(0);
    let ema = values[0];
    res[0] = ema;
    for(let i = 1; i < values.length; i++){
      ema = (values[i] - ema) * k + ema;
      res[i] = ema;
    }
    return res;
  }
  
  const ema12 = getEMAArray(closes, 12);
  const ema26 = getEMAArray(closes, 26);
  
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = getEMAArray(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  
  const macdData = [];
  const signalData = [];
  const histogramData = [];

  for(let i = 26; i < data.length; i++) {
    const time = data[i].time as UTCTimestamp;
    macdData.push({ time, value: macdLine[i] });
    signalData.push({ time, value: signalLine[i] });
    histogramData.push({ 
      time, 
      value: histogram[i], 
      color: histogram[i] >= 0 ? '#26a69a' : '#ef5350' 
    });
  }
  
  return { macd: macdData, signal: signalData, histogram: histogramData };
};

type StrategyMode = 'Combined' | 'LongOnly' | 'ShortOnly';

const TradingViewWidget: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  // Series Refs
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbBasisRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  // Indicator Panes
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [candleData, setCandleData] = useState<CandleData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [lastSignal, setLastSignal] = useState<'buy' | 'sell' | 'none'>('none');
  const [isConnected, setIsConnected] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<StrategyMode>('Combined');
  const [isStatsExpanded, setIsStatsExpanded] = useState(true); // Default open on desktop
  
  const [indicators, setIndicators] = useState<IndicatorState>({
    sma: false,
    ema: false,
    bb: false,
    macd: false,
    rsi: false
  });

  // Mobile check to auto-collapse on small screens
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsStatsExpanded(false);
    }
  }, []);

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight, // Use dynamic height
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
      rightPriceScale: { borderColor: '#1e293b' },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // 2. Fetch Initial Data & Setup WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;

    const initDataStream = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=300');
        const data = await response.json();
        
        const initialCandles: CandleData[] = data.map((d: any) => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        setCandleData(initialCandles);
        
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(initialCandles as any);
        }
        
        if (initialCandles.length > 0) {
            setCurrentPrice(initialCandles[initialCandles.length - 1].close);
        }

        ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_15m');
        
        ws.onopen = () => {
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            const k = message.k;
            const newCandle: CandleData = {
                time: k.t / 1000,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
            };

            setCurrentPrice(newCandle.close);

            if (candleSeriesRef.current) {
                candleSeriesRef.current.update(newCandle as any);
            }

            setCandleData(prev => {
                const last = prev[prev.length - 1];
                if (last && last.time === newCandle.time) {
                    const newData = [...prev];
                    newData[newData.length - 1] = newCandle;
                    return newData;
                } else {
                    return [...prev, newCandle];
                }
            });
        };

        ws.onclose = () => setIsConnected(false);
        ws.onerror = (err) => {
            console.error('WS Error', err);
            setIsConnected(false);
        };

      } catch (error) {
        console.error("Failed to fetch data", error);
      }
    };

    initDataStream();

    return () => {
        if (ws) ws.close();
    };
  }, []);

  // 3. Reactive Updates: Indicators & Signals
  useEffect(() => {
    if (!chartRef.current || candleData.length === 0) return;
    
    const chart = chartRef.current;
    
    // --- Update Indicators ---

    // SMA
    if (indicators.sma) {
      if (!smaSeriesRef.current) {
        smaSeriesRef.current = chart.addLineSeries({ color: '#fbbf24', lineWidth: 2, title: 'SMA 20' });
      }
      smaSeriesRef.current.setData(calculateSMA(candleData, 20));
    } else if (smaSeriesRef.current) {
      chart.removeSeries(smaSeriesRef.current);
      smaSeriesRef.current = null;
    }

    // EMA
    if (indicators.ema) {
      if (!emaSeriesRef.current) {
        emaSeriesRef.current = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'EMA 20' });
      }
      emaSeriesRef.current.setData(calculateEMA(candleData, 20));
    } else if (emaSeriesRef.current) {
      chart.removeSeries(emaSeriesRef.current);
      emaSeriesRef.current = null;
    }

    // Bollinger Bands
    if (indicators.bb) {
      const bbData = calculateBB(candleData);
      if (!bbBasisRef.current) {
        bbBasisRef.current = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1, title: 'BB Basis', lineStyle: LineStyle.Dotted });
        bbUpperRef.current = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1, title: 'BB Upper' });
        bbLowerRef.current = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1, title: 'BB Lower' });
      }
      bbBasisRef.current.setData(bbData.basis);
      bbUpperRef.current?.setData(bbData.upper);
      bbLowerRef.current?.setData(bbData.lower);
    } else if (bbBasisRef.current) {
      chart.removeSeries(bbBasisRef.current);
      if(bbUpperRef.current) chart.removeSeries(bbUpperRef.current);
      if(bbLowerRef.current) chart.removeSeries(bbLowerRef.current);
      bbBasisRef.current = null;
      bbUpperRef.current = null;
      bbLowerRef.current = null;
    }

    // MACD
    if (indicators.macd) {
      chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.35 } });
      const macdData = calculateMACD(candleData);

      if (!macdLineRef.current) {
        macdLineRef.current = chart.addLineSeries({ color: '#2962FF', lineWidth: 2, priceScaleId: 'macd', title: 'MACD' });
        macdSignalRef.current = chart.addLineSeries({ color: '#FF6D00', lineWidth: 2, priceScaleId: 'macd', title: 'Signal' });
        macdHistRef.current = chart.addHistogramSeries({ priceScaleId: 'macd', title: 'Histogram' });
        chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });
      }
      
      macdLineRef.current.setData(macdData.macd);
      macdSignalRef.current.setData(macdData.signal);
      macdHistRef.current.setData(macdData.histogram);
    } else if (macdLineRef.current) {
       // Only reset margin if RSI is also off (simplified logic, ideally manage panes dynamically)
       if (!indicators.rsi) {
           chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } });
       }
       chart.removeSeries(macdLineRef.current);
       if(macdSignalRef.current) chart.removeSeries(macdSignalRef.current);
       if(macdHistRef.current) chart.removeSeries(macdHistRef.current);
       macdLineRef.current = null;
       macdSignalRef.current = null;
       macdHistRef.current = null;
    }

    // RSI
    if (indicators.rsi) {
       chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.35 } });
       const rsiData = calculateRSI(candleData);
       if (!rsiLineRef.current) {
           rsiLineRef.current = chart.addLineSeries({ color: '#a855f7', lineWidth: 2, priceScaleId: 'rsi', title: 'RSI' });
           chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });
           // Add horizontal lines for 30/70 levels? Lightweight charts doesn't support static horz lines easily per series, but grid helps.
       }
       rsiLineRef.current.setData(rsiData);
    } else if (rsiLineRef.current) {
       if (!indicators.macd) {
           chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } });
       }
       chart.removeSeries(rsiLineRef.current);
       rsiLineRef.current = null;
    }


    // --- Generate Strategy Markers (Based on Active Strategy & RSI) ---
    if (candleSeriesRef.current) {
        const rsiSeries = calculateRSI(candleData); // Recalc for logic even if indicator invisible
        const markers: any[] = [];
        let lastSig: 'buy' | 'sell' | 'none' = 'none';

        // Map RSI back to candles. RSI array is shorter by 14.
        // rsiSeries[0] corresponds to candleData[14] roughly.
        // We match by timestamp.
        
        for (let i = 20; i < candleData.length; i++) {
            const candle = candleData[i];
            const rsiPoint = rsiSeries.find(r => r.time === candle.time);
            
            if (rsiPoint) {
                const rsiVal = rsiPoint.value;
                const isOversold = rsiVal < 30;
                const isOverbought = rsiVal > 70;

                // Logic based on Active Strategy
                if (activeStrategy === 'LongOnly' || activeStrategy === 'Combined') {
                    // BUY SIGNAL: RSI crosses below 30
                    if (isOversold) {
                         // Simple debounce: only if we haven't just signaled
                         const recent = markers.find(m => m.time === candle.time);
                         if (!recent) {
                            markers.push({
                                time: candle.time,
                                position: 'belowBar',
                                color: '#10b981',
                                shape: 'arrowUp',
                                text: 'LONG',
                                size: 2
                            });
                            lastSig = 'buy';
                         }
                    }
                }

                if (activeStrategy === 'ShortOnly' || activeStrategy === 'Combined') {
                    // SELL SIGNAL: RSI crosses above 70
                    if (isOverbought) {
                         const recent = markers.find(m => m.time === candle.time);
                         if (!recent) {
                             markers.push({
                                 time: candle.time,
                                 position: 'aboveBar',
                                 color: '#f43f5e',
                                 shape: 'arrowDown',
                                 text: 'SHORT',
                                 size: 2
                             });
                             lastSig = 'sell';
                         }
                    }
                }
            }
        }
        candleSeriesRef.current.setMarkers(markers);
        setLastSignal(lastSig);
    }

  }, [indicators, candleData, activeStrategy]);

  const toggleIndicator = (key: keyof IndicatorState) => {
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="relative group">
        {/* Active Strategy Selector Overlay - Collapsible on Mobile */}
        <div className="absolute top-2 left-2 md:top-4 md:left-4 z-10 flex flex-col gap-2 max-w-[200px] md:max-w-none transition-all">
           {/* Strategy Stats Panel */}
           <div className={`bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${isStatsExpanded ? 'w-[180px] md:w-auto' : 'w-[40px] md:w-auto h-[40px]'}`}>
              
              {/* Header / Toggle */}
              <div 
                className="flex items-center justify-between p-2 md:p-4 cursor-pointer hover:bg-slate-800/50"
                onClick={() => setIsStatsExpanded(!isStatsExpanded)}
              >
                  <div className={`flex items-center gap-2 ${!isStatsExpanded ? 'justify-center w-full' : ''}`}>
                      <Activity className={`w-4 h-4 text-blue-400 ${!isStatsExpanded ? 'w-5 h-5' : ''}`} />
                      {isStatsExpanded && <h3 className="text-xs md:text-sm font-bold text-slate-100">Sim Strategy</h3>}
                  </div>
                  {isStatsExpanded && (
                      <div className="text-slate-500">
                          <ChevronUp className="w-3 h-3" />
                      </div>
                  )}
              </div>
              
              {/* Content (Hidden when collapsed) */}
              {isStatsExpanded && (
                <div className="px-2 pb-2 md:px-4 md:pb-4 border-t border-slate-700/50 pt-2">
                    {/* Selector */}
                    <div className="flex gap-1 mb-3 bg-slate-800 p-1 rounded-lg">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveStrategy('LongOnly'); }}
                            className={`flex-1 px-2 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors ${activeStrategy === 'LongOnly' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            L
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveStrategy('ShortOnly'); }}
                            className={`flex-1 px-2 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors ${activeStrategy === 'ShortOnly' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            S
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveStrategy('Combined'); }}
                            className={`flex-1 px-2 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors ${activeStrategy === 'Combined' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            All
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 md:gap-x-8 gap-y-1 text-[10px] md:text-xs">
                        <span className="text-slate-400">Price</span>
                        <span className="text-emerald-400 font-mono text-right">
                            ${currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>

                        <span className="text-slate-400">Signal</span>
                        <span className={`font-bold font-mono text-right ${
                            lastSignal === 'buy' ? 'text-emerald-400' : 
                            lastSignal === 'sell' ? 'text-rose-400' : 'text-slate-500'
                        }`}>
                            {lastSignal.toUpperCase()}
                        </span>
                    </div>
                </div>
              )}
           </div>
        </div>

        {/* Tools Toolbar - Scrollable on Mobile */}
        <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20 flex gap-1 md:gap-2 overflow-x-auto max-w-[60%] md:max-w-none scrollbar-hide py-1">
           {['sma', 'ema', 'bb', 'rsi', 'macd'].map(tool => (
             <button 
               key={tool}
               onClick={() => toggleIndicator(tool as keyof IndicatorState)}
               className={`px-3 py-1.5 md:px-3 md:py-1.5 rounded-md text-[10px] md:text-xs font-bold border transition-colors whitespace-nowrap shadow-sm backdrop-blur-sm ${indicators[tool as keyof IndicatorState] ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
             >
               {tool.toUpperCase()}
             </button>
           ))}
        </div>

        <div 
            ref={chartContainerRef} 
            className="w-full bg-surface border border-slate-700 rounded-xl overflow-hidden shadow-xl h-[400px] md:h-[600px]" 
        />
    </div>
  );
};

export default TradingViewWidget;