import React, { useEffect, useState } from 'react';
import { AssistantSettings } from '../types';

interface SettingsPanelProps {
  settings: AssistantSettings;
  onUpdate: (newSettings: AssistantSettings) => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, onClose }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const avail = window.speechSynthesis.getVoices();
      setVoices(avail);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const handleChange = (section: keyof AssistantSettings, key: string, value: any) => {
    onUpdate({
      ...settings,
      [section]: {
        ...settings[section],
        [key]: value,
      },
    });
  };

  return (
    <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-md z-50 p-8 overflow-y-auto flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-light text-white">Configurações da Aura</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-8 max-w-2xl mx-auto w-full">
        
        {/* Personality Section */}
        <section>
          <h3 className="text-cyan-400 uppercase tracking-widest text-sm mb-4">Personalidade</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 mb-2 text-sm">Seriedade ({settings.personality.seriousness}%)</label>
              <input 
                type="range" min="0" max="100" 
                value={settings.personality.seriousness}
                onChange={(e) => handleChange('personality', 'seriousness', parseInt(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-2 text-sm">Humor ({settings.personality.humor}%)</label>
              <input 
                type="range" min="0" max="100" 
                value={settings.personality.humor}
                onChange={(e) => handleChange('personality', 'humor', parseInt(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-slate-300 mb-2 text-sm">Estilo</label>
                 <select 
                    value={settings.personality.style}
                    onChange={(e) => handleChange('personality', 'style', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                 >
                   <option value="formal">Formal</option>
                   <option value="casual">Casual</option>
                   <option value="technical">Técnico</option>
                 </select>
               </div>
               <div>
                 <label className="block text-slate-300 mb-2 text-sm">Verbosidade</label>
                 <select 
                    value={settings.personality.verbosity}
                    onChange={(e) => handleChange('personality', 'verbosity', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                 >
                   <option value="concise">Conciso</option>
                   <option value="balanced">Equilibrado</option>
                   <option value="detailed">Detalhado</option>
                 </select>
               </div>
            </div>
          </div>
        </section>

        {/* Voice Section */}
        <section>
          <h3 className="text-purple-400 uppercase tracking-widest text-sm mb-4">Voz & Áudio</h3>
          <div className="space-y-4">
             <div>
                 <label className="block text-slate-300 mb-2 text-sm">Voz do Sistema</label>
                 <select 
                    value={settings.voice.selectedVoiceURI || ''}
                    onChange={(e) => handleChange('voice', 'selectedVoiceURI', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                 >
                   {voices.map(v => (
                     <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                   ))}
                 </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-slate-300 mb-2 text-sm">Velocidade ({settings.voice.rate}x)</label>
                  <input 
                    type="range" min="0.5" max="2" step="0.1"
                    value={settings.voice.rate}
                    onChange={(e) => handleChange('voice', 'rate', parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
               </div>
               <div>
                  <label className="block text-slate-300 mb-2 text-sm">Tom ({settings.voice.pitch})</label>
                  <input 
                    type="range" min="0.5" max="2" step="0.1"
                    value={settings.voice.pitch}
                    onChange={(e) => handleChange('voice', 'pitch', parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
               </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
