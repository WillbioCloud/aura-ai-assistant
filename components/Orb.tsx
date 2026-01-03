import React, { useEffect, useRef } from 'react';
import { AppState } from '../types';

interface OrbProps {
  state: AppState;
  audioData?: number; // Normalized 0-1 volume level for visualization
  onClick?: () => void;
}

export const Orb: React.FC<OrbProps> = ({ state, audioData = 0, onClick }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  // Dynamic Styles based on State
  const getOrbColor = () => {
    switch (state) {
      case AppState.PASSIVE_LISTENING: return 'bg-sky-900/40 shadow-sky-500/10'; // Darker, subtle "sleep" blue
      case AppState.LISTENING: return 'bg-cyan-500 shadow-cyan-500/50';
      case AppState.PROCESSING: return 'bg-purple-500 shadow-purple-500/50';
      case AppState.SPEAKING: return 'bg-emerald-400 shadow-emerald-400/50';
      case AppState.IDLE: default: return 'bg-slate-400 shadow-slate-400/30';
    }
  };

  const getAnimationClass = () => {
    switch (state) {
      case AppState.PASSIVE_LISTENING: return 'animate-pulse duration-[2000ms]'; // Standard breathing
      case AppState.LISTENING: return 'animate-pulse';
      case AppState.PROCESSING: return 'animate-spin';
      default: return '';
    }
  };

  // React to audio amplitude (simulated visualizer effect)
  const scale = 1 + (audioData * 0.5); 

  return (
    <div 
      className="relative flex items-center justify-center w-64 h-64 cursor-pointer group"
      onClick={onClick}
    >
      {/* Outer Glow / Ripple */}
      <div 
        className={`absolute rounded-full opacity-30 transition-all duration-300 blur-xl ${getOrbColor()}`}
        style={{
          width: state === AppState.SPEAKING ? `${200 * scale}px` : (state === AppState.PASSIVE_LISTENING ? '160px' : '180px'),
          height: state === AppState.SPEAKING ? `${200 * scale}px` : (state === AppState.PASSIVE_LISTENING ? '160px' : '180px'),
        }}
      />
      
      {/* Secondary Ring (Active in Passive Mode) */}
      <div 
        ref={outerRef}
        className={`absolute w-40 h-40 rounded-full border-2 transition-all duration-500 ${
          state === AppState.PROCESSING ? 'border-dashed border-purple-400 animate-spin-slow opacity-100' : 
          (state === AppState.PASSIVE_LISTENING ? 'border-sky-500/20 opacity-100 scale-95' : 'border-white/20 opacity-40')
        }`}
      />

      {/* Core Orb */}
      <div 
        ref={coreRef}
        className={`relative w-24 h-24 rounded-full transition-all duration-300 shadow-lg ${getOrbColor()} ${getAnimationClass()}`}
        style={{
           transform: `scale(${state === AppState.LISTENING ? 1.1 : scale})`,
        }}
      >
        {/* Inner Highlight */}
        <div className="absolute top-2 left-4 w-6 h-6 bg-white opacity-20 rounded-full blur-[2px]" />
      </div>

      {/* Status Text */}
      <div className="absolute -bottom-12 text-slate-400 text-sm tracking-widest uppercase font-light">
        {state === AppState.PASSIVE_LISTENING ? 'Aguardando "Aura"...' : state.replace('_', ' ')}
      </div>
      
      {state === AppState.IDLE && (
         <div className="absolute text-xs text-white/50 top-full mt-2">Clique para iniciar</div>
      )}
    </div>
  );
};