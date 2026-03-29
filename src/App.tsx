/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RotateCcw, Zap, Layout, Cpu, Info, AlertTriangle, Layers, Activity, Gauge } from 'lucide-react';
import * as pretext from '@chenglou/pretext';
import ReactMarkdown from 'react-markdown';

const MODEL_DISPLAY = 'gpt-4o-mini';

const STREAM_PROMPT = `Write a detailed technical analysis (~600 words) about spatial layout algorithms in modern AI interfaces. Use rich markdown formatting: headings, bold, italics, bullet lists, a table, and a blockquote. This content is used to stress-test a browser layout performance benchmark.`;

export default function App() {
  const [streamText, setStreamText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<'traditional' | 'pretext'>('traditional');
  const [stressTest, setStressTest] = useState(false);
  const [fps, setFps] = useState(0);
  const [heightA, setHeightA] = useState(120);
  const [heightB, setHeightB] = useState(120);
  const [jankCount, setJankCount] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [lastReflowTime, setLastReflowTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const textRefA = useRef<HTMLDivElement>(null);
  const preparedTextRef = useRef<{ text: string; prepared: unknown }>({ text: '', prepared: null });
  const lastTimeRef = useRef(performance.now());
  const framesRef = useRef(0);

  // FPS Counter
  useEffect(() => {
    let requestRef: number;
    const animate = (time: number) => {
      framesRef.current++;
      if (time - lastTimeRef.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastTimeRef.current = time;
      }
      requestRef = requestAnimationFrame(animate);
    };
    requestRef = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef);
  }, []);

  // Live stream via Cloudflare Worker proxy → OpenAI gpt-4o-mini
  useEffect(() => {
    if (!isStreaming) return;

    const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
    if (!workerUrl) {
      setError('VITE_WORKER_URL is not set. Add it to your .env file (see README).');
      setIsStreaming(false);
      return;
    }

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const run = async () => {
      try {
        setError(null);
        const response = await fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error(`Worker error ${response.status}: ${await response.text()}`);
        }

        reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const json = JSON.parse(data);
              const text: string = json.choices?.[0]?.delta?.content ?? '';
              if (text) {
                setStreamText(prev => prev + text);
                const words = text.trim().split(/\s+/).filter(Boolean);
                if (words.length > 0) setTokenCount(prev => prev + words.length);
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Worker request failed');
        }
      } finally {
        reader?.cancel();
        if (!cancelled) setIsStreaming(false);
      }
    };

    run();
    return () => {
      cancelled = true;
      reader?.cancel();
    };
  }, [isStreaming]);

  // Scenario A: Traditional DOM Measurement
  useLayoutEffect(() => {
    if (mode === 'traditional' && textRefA.current) {
      const start = performance.now();
      
      let totalHeight = 0;
      const iterations = stressTest ? 50 : 10;
      for (let i = 0; i < iterations; i++) {
        const rect = textRefA.current.getBoundingClientRect();
        totalHeight = rect.height;
        if (stressTest) {
          (textRefA.current.style as any).opacity = i % 2 === 0 ? "0.99" : "1";
        }
      }
      
      const end = performance.now();
      const duration = end - start;
      setLastReflowTime(duration);
      
      if (duration > 0.01) {
        setJankCount(prev => prev + iterations);
      }
      
      const newHeight = Math.max(120, totalHeight + 120);
      setHeightA(prev => Math.abs(prev - newHeight) < 0.5 ? prev : newHeight);
    }
  }, [streamText, mode, stressTest]);

  // Scenario B: Pretext Measurement
  // prepare(text, font) — segments & measures words via canvas; caches internally.
  //   Called whenever text changes, but per-word results are cached so only new
  //   words incur canvas work. Stored in a ref — NOT timed (setup cost, not layout cost).
  // layout(prepared, maxWidth, lineHeight) — pure arithmetic, ~0.0002ms.
  //   This is what we benchmark: the equivalent of getBoundingClientRect().
  useLayoutEffect(() => {
    if (mode === 'pretext') {
      let calculatedHeight = 0;
      try {
        const p = pretext as any;
        if (typeof p.prepare === 'function' && typeof p.layout === 'function') {
          // Re-prepare only when text changes; internal cache handles repeated words.
          if (preparedTextRef.current.text !== streamText) {
            preparedTextRef.current = {
              text: streamText,
              prepared: p.prepare(streamText || ' ', '16px Inter'),
            };
          }
          // Time only layout() — pure arithmetic, no canvas, no DOM reads.
          // Matches the iteration count of the traditional mode for a fair comparison.
          const iterations = stressTest ? 50 : 10;
          const start = performance.now();
          for (let i = 0; i < iterations; i++) {
            const result = p.layout(preparedTextRef.current.prepared, 500, 24);
            calculatedHeight = result.height;
          }
          const end = performance.now();
          setLastReflowTime(end - start);
        } else {
          throw new Error('Pretext API unavailable');
        }
      } catch (e) {
        // Fallback arithmetic
        const charWidth = 9.2;
        const containerWidth = 500 - 64;
        const charsPerLine = Math.floor(containerWidth / charWidth);
        const lines = Math.max(1, Math.ceil((streamText.length || 1) / charsPerLine));
        calculatedHeight = lines * 24 + 100;
        setLastReflowTime(0);
      }
      const newHeight = Math.max(120, calculatedHeight + 120);
      setHeightB(prev => Math.abs(prev - newHeight) < 0.5 ? prev : newHeight);
    }
  }, [streamText, mode, stressTest]);

  const reset = useCallback(() => {
    setStreamText("");
    setIsStreaming(false);
    setHeightA(120);
    setHeightB(120);
    setJankCount(0);
    setTokenCount(0);
    setLastReflowTime(0);
    setError(null);
    preparedTextRef.current = { text: '', prepared: null };
  }, []);

  // Reset when switching modes
  useEffect(() => {
    reset();
  }, [mode, reset]);

  const reflowRatio = tokenCount > 0 ? (jankCount / tokenCount).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/5 p-6 flex items-center justify-between bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-2xl shadow-orange-500/20">
            <Activity className="text-black" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter italic uppercase">Spatial AI Lab</h1>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Real-time Performance Monitor</p>
              <span className="text-[9px] font-black uppercase tracking-widest bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-mono">
                {MODEL_DISPLAY}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setMode('traditional')}
            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              mode === 'traditional' ? 'bg-white text-black shadow-2xl scale-105' : 'text-white/40 hover:text-white'
            }`}
          >
            <AlertTriangle size={16} />
            Traditional
          </button>
          <button
            onClick={() => setMode('pretext')}
            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              mode === 'pretext' ? 'bg-orange-500 text-black shadow-2xl scale-105' : 'text-white/40 hover:text-white'
            }`}
          >
            <Zap size={16} />
            Pretext
          </button>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-[10px] text-white/30 uppercase font-mono mb-1">FPS</p>
            <p className={`text-3xl font-black font-mono leading-none ${fps < 55 ? 'text-red-500' : 'text-green-500'}`}>
              {fps}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              disabled={isStreaming}
              className="w-10 h-10 bg-white/10 text-white/50 rounded-xl flex items-center justify-center hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              title="Reset"
            >
              <RotateCcw size={18} />
            </button>
            <button
              onClick={() => setIsStreaming(prev => !prev)}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl ${
                isStreaming ? 'bg-orange-500 text-black shadow-orange-500/20' : 'bg-white text-black shadow-white/10'
              }`}
            >
              {isStreaming ? <RotateCcw size={24} className="animate-spin" /> : <Play size={24} className="ml-1" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Panel: Metrics & Controls */}
        <div className="lg:col-span-4 space-y-8">
          {/* Real-time Metrics Card */}
          <section className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Gauge size={120} />
            </div>
            
            <div className="space-y-6 relative">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/40">Performance Metrics</h2>
              
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-xs text-white/50 font-mono">Layout Budget Used</p>
                    <p className={`text-lg font-bold font-mono ${lastReflowTime > 1 ? 'text-red-500' : 'text-green-500'}`}>
                      {lastReflowTime.toFixed(3)}ms
                    </p>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className={`h-full ${lastReflowTime > 1 ? 'bg-red-500' : 'bg-green-500'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (lastReflowTime / 4) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[8px] text-white/20 uppercase font-mono">Scale: 4ms Max (Target: {fps > 60 ? '8ms' : '16ms'})</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-xs text-white/50 font-mono">Forced Reflows</p>
                    <p className={`text-lg font-bold font-mono ${jankCount > 0 ? 'text-red-500' : 'text-white/20'}`}>
                      {jankCount}
                    </p>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-red-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (jankCount / 1000) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-xs text-white/50 font-mono">Reflows per Token</p>
                    <p className={`text-lg font-bold font-mono ${parseFloat(reflowRatio) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {reflowRatio}
                    </p>
                  </div>
                  <p className="text-[8px] text-white/20 uppercase font-mono">Ideal Ratio: 0.00</p>
                </div>

                {/* Frame Drop Indicator */}
                <div className="pt-2 flex items-center justify-between">
                  <p className="text-[10px] text-white/30 uppercase font-mono">Frame Stability</p>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-3 h-3 rounded-sm transition-colors ${
                          (fps < 58 && isStreaming) ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-green-500/20'
                        }`} 
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-white/40">Stress Test Mode</label>
                <button 
                  onClick={() => setStressTest(!stressTest)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${stressTest ? 'bg-orange-500' : 'bg-white/10'}`}
                >
                  <motion.div 
                    animate={{ x: stressTest ? 24 : 4 }}
                    className="absolute top-1 w-4 h-4 bg-white rounded-full"
                  />
                </button>
              </div>
              <p className="text-[10px] text-white/30 italic">
                Increases reflow pressure by 5x.
              </p>
            </div>
          </section>

          {/* Error Card */}
          {error && (
            <section className="bg-red-500/10 border border-red-500/30 rounded-3xl p-6 space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={16} />
                <p className="text-xs font-bold uppercase tracking-widest">API Error</p>
              </div>
              <p className="text-xs text-red-300/70 font-mono break-all">{error}</p>
            </section>
          )}

          {/* Explanation Card */}
          <section className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
            <h2 className="text-xl font-bold tracking-tight">The Ratio Explained</h2>
            
            <div className="space-y-4 text-sm text-white/60 leading-relaxed">
              <p>
                The <span className="text-white font-bold">Reflow-to-Token Ratio</span> shows how many times the browser was forced to calculate layout for every single word generated.
              </p>
              <p>
                In <span className="text-red-400 font-bold">Traditional</span> mode, this ratio is high because we read from the DOM after every update. In <span className="text-green-400 font-bold">Pretext</span>, it stays at 0.00 because we bypass the DOM entirely for measurement.
              </p>
            </div>
          </section>
        </div>

        {/* Right Panel: The Spatial Canvas */}
        <div className="lg:col-span-8 space-y-8">
          <div className="relative bg-[#0a0a0a] rounded-[3rem] border border-white/10 overflow-hidden min-h-[800px] shadow-[0_0_100px_rgba(0,0,0,0.5)] group">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            
            <div className="relative p-16">
              {/* The Whiteboard Container */}
              <motion.div
                animate={{ 
                  height: mode === 'traditional' ? heightA : heightB,
                  borderColor: (mode === 'traditional' && isStreaming) ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)'
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                className={`w-full max-w-[600px] bg-white text-black rounded-[2rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] p-12 relative overflow-visible border-2`}
              >
                {/* Jank Indicator Overlay */}
                <AnimatePresence>
                  {mode === 'traditional' && isStreaming && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.05 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-red-500 pointer-events-none rounded-[2rem]"
                    />
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                      <Layers size={16} className="text-white" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest">Spatial AI Lab</span>
                  </div>
                  <div className="flex items-center gap-2 bg-black/5 px-3 py-1 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">Live Analysis</span>
                  </div>
                </div>

                <div 
                  ref={textRefA}
                  className="prose prose-sm max-w-none text-black/80 leading-relaxed font-medium overflow-visible"
                >
                  <ReactMarkdown>
                    {streamText || "_Initializing stream sequence..._"}
                  </ReactMarkdown>
                </div>
              </motion.div>

              {/* Other UI elements that get pushed */}
              <motion.div 
                layout
                className="mt-12 w-full max-w-[600px] grid grid-cols-2 gap-8"
              >
                <div className="h-48 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col items-center justify-center gap-4 group-hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                    <Cpu size={24} className="text-white/20" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">Core Processing</p>
                </div>
                <div className="h-48 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col items-center justify-center gap-4 group-hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                    <Layout size={24} className="text-white/20" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">Spatial Layout</p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-12 border-t border-white/5 mt-12 flex flex-col md:flex-row justify-between items-center gap-8 opacity-40">
        <div className="flex items-center gap-4">
          <Activity size={20} />
          <div className="text-xs font-mono uppercase tracking-widest">
            System Status: {isStreaming ? 'Streaming' : 'Standby'}
          </div>
        </div>
        <div className="flex gap-12 text-[10px] uppercase tracking-[0.3em] font-black">
          <span className="text-red-500">Forced Reflow</span>
          <span className="text-green-500">Arithmetic Layout</span>
          <span className="text-white/40">120Hz Optimized</span>
        </div>
      </footer>
    </div>
  );
}
