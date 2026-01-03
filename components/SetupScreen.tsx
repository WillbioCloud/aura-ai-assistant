import React, { useState, useEffect, useRef } from 'react';
import { generateResponse } from '../services/geminiService';
import { AssistantSettings } from '../types';

interface SetupScreenProps {
  onComplete: () => void;
  settings: AssistantSettings;
  onUpdateSettings: (s: AssistantSettings) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete, settings, onUpdateSettings }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1=AutoCheck, 2=Audio, 3=Mic, 4=Brain
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [brainStatus, setBrainStatus] = useState<'waiting' | 'ok' | 'error'>('waiting');

  const addLog = (text: string) => setLogs(prev => [...prev, `> ${text}`]);

  // --- PASSO 1: AUTO-ANÁLISE ---
  useEffect(() => {
    if (step === 1) {
      const runDiagnostics = async () => {
        addLog("INICIANDO PROTOCOLO DE BOOT...");
        await new Promise(r => setTimeout(r, 500));
        
        // 1. Check Electron
        if (window.electronAPI) addLog("SISTEMA: Conexão Electron [OK]");
        else addLog("ERRO CRÍTICO: Electron API não detectada (Rodando no Browser?)");
        
        await new Promise(r => setTimeout(r, 500));

        // 2. Check Internet
        if (navigator.onLine) addLog("REDE: Conexão Internet [OK]");
        else addLog("ERRO: Sem conexão com a internet");

        await new Promise(r => setTimeout(r, 500));

        // 3. Load Devices
        try {
          addLog("HARDWARE: Buscando dispositivos...");
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          addLog("PERMISSÃO: Acesso ao Microfone concedido [OK]");
          stream.getTracks().forEach(t => t.stop()); // Fecha stream de teste

          const devices = await navigator.mediaDevices.enumerateDevices();
          const mics = devices.filter(d => d.kind === 'audioinput');
          const speakers = devices.filter(d => d.kind === 'audiooutput');
          
          setMicDevices(mics);
          setAudioDevices(speakers);
          addLog(`HARDWARE: ${mics.length} microfones, ${speakers.length} saídas encontradas.`);
          
          setStep(2); // Avança para teste de áudio
        } catch (e: any) {
          addLog(`ERRO PERMISSÃO: ${e.message}`);
          addLog("AÇÃO NECESSÁRIA: Verifique as configurações de privacidade do Windows.");
        }
      };
      runDiagnostics();
    }
  }, [step]);

  // --- PASSO 2: TESTE DE ÁUDIO ---
  const playTestSound = () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.value = 440; // Lá (A4)
    gain.gain.value = 0.1;
    
    osc.start();
    addLog("ÁUDIO: Emitindo sinal de teste...");
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 1000);
    
    // Tentar TTS também
    const utt = new SpeechSynthesisUtterance("Teste de sistema.");
    window.speechSynthesis.speak(utt);
  };

  // --- PASSO 3: TESTE DE MICROFONE (Visualizador) ---
  useEffect(() => {
    if (step === 3) {
      let ctx: AudioContext;
      let stream: MediaStream;
      
      const startMic = async () => {
        try {
          const constraints = settings.voice.selectedMicrophoneId 
            ? { audio: { deviceId: { exact: settings.voice.selectedMicrophoneId } } }
            : { audio: true };
            
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          src.connect(analyser);
          
          const data = new Uint8Array(analyser.frequencyBinCount);
          const loop = () => {
            if (step !== 3) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a,b) => a+b) / data.length;
            setMicLevel(avg);
            requestAnimationFrame(loop);
          };
          loop();
        } catch(e) { console.error(e); }
      };
      startMic();
      
      return () => {
        if (ctx) ctx.close();
        if (stream) stream.getTracks().forEach(t => t.stop());
      };
    }
  }, [step, settings.voice.selectedMicrophoneId]);

  // --- PASSO 4: TESTE DE IA (Cérebro) ---
  const testBrain = async () => {
    addLog("IA: Tentando conexão com Gemini...");
    setBrainStatus('waiting');
    try {
      // Envia uma mensagem falsa para testar conexão
      const res = await generateResponse([], "System Check. Responda apenas 'OK'.", settings);
      if (res.text) {
        addLog(`IA RESPOSTA: "${res.text}" [OK]`);
        setBrainStatus('ok');
        setTimeout(onComplete, 2000); // Entra no app após 2s
      } else {
        throw new Error("Resposta vazia");
      }
    } catch (e: any) {
      addLog(`ERRO IA: ${e.message}`);
      addLog("Verifique sua API KEY no arquivo .env");
      setBrainStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-green-500 font-mono p-10 flex flex-col z-[100] overflow-hidden select-none">
      
      {/* HEADER */}
      <div className="border-b border-green-800 pb-4 mb-4 flex justify-between">
        <h1 className="text-2xl font-bold tracking-widest">AURA.SYS // DIAGNOSTIC_MODE</h1>
        <div className="animate-pulse">{step === 4 && brainStatus === 'ok' ? "SYSTEM READY" : "INITIALIZING..."}</div>
      </div>

      <div className="flex flex-1 gap-8">
        
        {/* COLUNA DA ESQUERDA: LOGS */}
        <div className="w-1/2 border border-green-900 bg-green-900/10 p-4 font-xs overflow-y-auto font-mono h-[500px]">
          {logs.map((log, i) => (
            <div key={i} className="mb-1 opacity-80">{log}</div>
          ))}
          <div className="animate-pulse">_</div>
        </div>

        {/* COLUNA DA DIREITA: CONTROLES */}
        <div className="w-1/2 flex flex-col justify-center gap-8">
          
          {/* PASSO 2: AUDIO */}
          <div className={`transition-opacity duration-500 ${step === 2 ? 'opacity-100' : 'opacity-30 blur-sm pointer-events-none'}`}>
            <h2 className="text-xl mb-2 text-white">2. TESTE DE SAÍDA DE ÁUDIO</h2>
            <p className="text-sm mb-4">Selecione o dispositivo e clique em TESTAR.</p>
            <div className="flex gap-2 mb-2">
               <select 
                  className="bg-green-900/30 border border-green-600 p-2 text-white w-full"
                  onChange={(e) => onUpdateSettings({...settings, voice: {...settings.voice, selectedVoiceURI: e.target.value}})}
               >
                 <option value="">Voz Padrão</option>
                 {window.speechSynthesis.getVoices().map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
               </select>
            </div>
            <button onClick={playTestSound} className="bg-green-700 hover:bg-green-600 text-white px-6 py-2 rounded">
               REPRODUZIR SOM DE TESTE
            </button>
            <div className="mt-4">
              <span className="mr-4">Você ouviu?</span>
              <button onClick={() => { addLog("USUÁRIO: Áudio Confirmado [OK]"); setStep(3); }} className="border border-green-500 px-4 py-1 hover:bg-green-500/20 mr-2">SIM</button>
              <button onClick={() => addLog("USUÁRIO: Falha no Áudio. Tente outra voz ou verifique o volume.")} className="border border-red-500 text-red-500 px-4 py-1 hover:bg-red-900/20">NÃO</button>
            </div>
          </div>

          {/* PASSO 3: MICROFONE */}
          <div className={`transition-opacity duration-500 ${step === 3 ? 'opacity-100' : 'opacity-30 blur-sm pointer-events-none'}`}>
            <h2 className="text-xl mb-2 text-white">3. TESTE DE ENTRADA (MIC)</h2>
            <select 
                className="bg-green-900/30 border border-green-600 p-2 text-white w-full mb-4"
                value={settings.voice.selectedMicrophoneId || ''}
                onChange={(e) => onUpdateSettings({...settings, voice: {...settings.voice, selectedMicrophoneId: e.target.value}})}
            >
               <option value="">Microfone Padrão</option>
               {micDevices.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
            </select>
            
            <div className="w-full h-8 bg-green-900/30 border border-green-600 relative overflow-hidden">
               <div 
                 className="h-full bg-green-500 transition-all duration-75"
                 style={{ width: `${Math.min(micLevel * 2, 100)}%` }}
               />
               <div className="absolute inset-0 flex items-center justify-center text-xs tracking-widest">
                  NÍVEL DE SINAL
               </div>
            </div>
            <p className="text-xs mt-2 text-gray-400">Fale algo. A barra deve se mover.</p>

            <div className="mt-4">
              <button onClick={() => { addLog("USUÁRIO: Microfone Confirmado [OK]"); setStep(4); testBrain(); }} className="bg-green-700 w-full py-2 hover:bg-green-600">
                TUDO OK, AVANÇAR
              </button>
            </div>
          </div>

          {/* PASSO 4: CÉREBRO */}
          <div className={`transition-opacity duration-500 ${step === 4 ? 'opacity-100' : 'opacity-30 blur-sm pointer-events-none'}`}>
             <h2 className="text-xl mb-2 text-white">4. SINCRONIZAÇÃO NEURAL</h2>
             {brainStatus === 'waiting' && <div className="animate-pulse text-yellow-500">CONECTANDO AO GEMINI API...</div>}
             {brainStatus === 'ok' && <div className="text-green-400 font-bold">SISTEMA ONLINE. INICIANDO INTERFACE...</div>}
             {brainStatus === 'error' && (
               <div>
                 <div className="text-red-500 font-bold">FALHA NA CONEXÃO.</div>
                 <button onClick={testBrain} className="mt-2 text-xs border border-red-500 px-2 py-1">TENTAR NOVAMENTE</button>
               </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
};