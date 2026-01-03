import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Orb } from './Orb';
import { SettingsPanel } from './SettingsPanel';
import { AppState, AssistantSettings, ChatMessage, SystemCommand } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
// ALTERAÇÃO 1: Importamos o serviço local em vez do geminiService
import { generateResponseLocal } from '../services/ollamaService'; 

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const WAKE_WORD_REGEX = /(?:^|\s)(hey aura|aura|olá aura|oi aura|assistente)(?=\s|$|[.,!?])/i;

export const Dashboard: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [settings, setSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcribedText, setTranscribedText] = useState('');
  const [textInput, setTextInput] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);
  
  // Debug Logs
  const [statusLog, setStatusLog] = useState<string>("Iniciando sistema...");
  const [errorLog, setErrorLog] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const isSpeakingRef = useRef(false);

  // --- 1. RECONHECIMENTO DE FALA ---
  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorLog("ERRO CRÍTICO: Navegador sem suporte a Speech API");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatusLog("Microfone Ativo (Ouvindo...)");
      setErrorLog(""); // Limpa erros anteriores
      if (appState === AppState.IDLE) setAppState(AppState.PASSIVE_LISTENING);
    };

    recognition.onresult = (event: any) => {
      if (isSpeakingRef.current || appState === AppState.PROCESSING) return;

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }

      const fullText = (interimTranscript || finalTranscript).trim();
      
      if (fullText) {
          setTranscribedText(fullText);
          setStatusLog(`Detectado: "${fullText}"`);
      }

      // Wake Word
      if (appState === AppState.PASSIVE_LISTENING) {
         if (WAKE_WORD_REGEX.test(fullText)) {
           setStatusLog("WAKE WORD DETECTADA!");
           setAppState(AppState.LISTENING);
         }
         return; 
      }

      // Comando Final
      if (appState === AppState.LISTENING && finalTranscript) {
        handleUserMessage(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Erro Mic:", event.error);
      if (event.error === 'no-speech') {
        // Ignora silêncio
      } else if (event.error === 'not-allowed') {
        setErrorLog("BLOQUEADO: Windows ou Electron negou acesso ao Mic.");
      } else if (event.error === 'network') {
        setErrorLog("REDE: Erro de conexão com Google Speech API.");
      } else {
        setErrorLog(`ERRO VOZ: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (!isSpeakingRef.current) {
         setStatusLog("Reiniciando escuta...");
         try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch(e){ setErrorLog(`Falha ao iniciar: ${e}`); }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;
    if (recognitionRef.current) recognitionRef.current.stop();
    
    setAppState(AppState.PROCESSING);
    setTranscribedText(text);
    setStatusLog("Processando resposta (Local)..."); // Pequena mudança visual para você saber que é local

    const cleanText = text.replace(WAKE_WORD_REGEX, '').trim() || text;
    const newUserMsg: ChatMessage = { role: 'user', text: cleanText, timestamp: Date.now() };
    setMessages(prev => [...prev, newUserMsg]);

    try {
        // ALTERAÇÃO 2: Chamada ao serviço local (Ollama)
        const result = await generateResponseLocal(messages, cleanText, settings);
        
        if (result.systemCommand) executeSystemCommand(result.systemCommand);

        const newAiMsg: ChatMessage = { 
          role: 'model', 
          text: result.text, 
          timestamp: Date.now(), 
          searchResults: result.searchResults 
        };
        setMessages(prev => [...prev, newAiMsg]);
        speakResponse(result.text);

    } catch (error: any) {
        setAppState(AppState.IDLE);
        setSystemNotification("Erro IA Local");
        setErrorLog(`Erro Ollama: ${error.message}`);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if(textInput.trim()) {
          handleUserMessage(textInput);
          setTextInput('');
      }
  };

  const executeSystemCommand = (cmd: SystemCommand) => {
    if (window.electronAPI) window.electronAPI.sendCommand(cmd);
    let notifyText = "";
    switch(cmd.action) {
      case 'OPEN_APP': notifyText = `Abrindo ${cmd.value}...`; break;
      case 'VOLUME': notifyText = `Volume: ${cmd.value}`; break;
      case 'SHOW_DESKTOP': notifyText = "Desktop..."; break;
    }
    setSystemNotification(notifyText);
    setTimeout(() => setSystemNotification(null), 3000);
  };

  const speakResponse = useCallback((text: string) => {
    setAppState(AppState.SPEAKING);
    setStatusLog("Falando...");
    isSpeakingRef.current = true;
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = settings.voice.pitch;
    utterance.rate = settings.voice.rate;
    utterance.volume = settings.voice.volume;
    
    if (settings.voice.selectedVoiceURI) {
      const voices = synthesisRef.current.getVoices();
      const selected = voices.find(v => v.voiceURI === settings.voice.selectedVoiceURI);
      if (selected) utterance.voice = selected;
    }

    const intervalId = setInterval(() => {
      setAudioLevel(Math.random() * 0.6 + 0.2); 
    }, 100);

    utterance.onend = () => {
      clearInterval(intervalId);
      setAudioLevel(0);
      setAppState(AppState.PASSIVE_LISTENING);
      setStatusLog("Aguardando comando...");
      isSpeakingRef.current = false;
      if (recognitionRef.current) try { recognitionRef.current.start(); } catch(e) {}
    };
    
    setTimeout(() => synthesisRef.current.speak(utterance), 100);
  }, [settings]);

  // Visualizador de Áudio
  useEffect(() => {
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let stream: MediaStream;
    let animationFrame: number;

    const setupAudio = async () => {
      try {
        const constraints = settings.voice.selectedMicrophoneId 
            ? { audio: { deviceId: { exact: settings.voice.selectedMicrophoneId } } } 
            : { audio: true };

        try { stream = await navigator.mediaDevices.getUserMedia(constraints); } 
        catch (err) { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const animate = () => {
           if (!isSpeakingRef.current) {
             analyser.getByteFrequencyData(dataArray);
             let sum = 0;
             for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
             setAudioLevel((sum / dataArray.length) / 128); 
           }
           animationFrame = requestAnimationFrame(animate);
        };
        animate();
      } catch (err) { console.error(err); }
    };

    setupAudio();
    return () => {
      if (audioContext) audioContext.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [settings.voice.selectedMicrophoneId]);

  const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
  const lastAiMessage = messages.slice().reverse().find(m => m.role === 'model');

  const handleOrbClick = () => {
      if (appState === AppState.IDLE || appState === AppState.PASSIVE_LISTENING) {
          setAppState(AppState.LISTENING);
          setStatusLog("Escuta Manual Ativada");
      } else {
          setAppState(AppState.PASSIVE_LISTENING);
      }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
       {/* HEADER */}
       <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-50 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
         <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex flex-col">
            <h1 className="text-xl font-light tracking-[0.2em] text-cyan-500 opacity-80">AURA</h1>
            {/* LOGS DE DIAGNÓSTICO NA TELA */}
            <div className="flex flex-col mt-1">
                <span className="text-[10px] text-green-400 font-mono tracking-widest uppercase">{statusLog}</span>
                {errorLog && <span className="text-[10px] text-red-500 font-mono tracking-widest uppercase animate-pulse">{errorLog}</span>}
            </div>
         </div>
         <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
             <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-white">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </button>
             <div className="h-6 w-px bg-slate-700/50" />
             <div className="flex items-center gap-2">
                <button onClick={() => window.electronAPI?.minimize()} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg></button>
                <button onClick={() => window.electronAPI?.close()} className="p-2 hover:bg-red-500 rounded text-slate-400 hover:text-white transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
         </div>
       </div>

       {systemNotification && (
          <div className="absolute top-24 bg-white/10 backdrop-blur border border-white/20 px-6 py-2 rounded-full text-sm font-medium animate-bounce text-cyan-300 z-40">
            {systemNotification}
          </div>
       )}

       <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl mt-12 z-10">
          <div className="mb-8">
             <Orb state={appState} audioData={audioLevel} onClick={handleOrbClick} />
          </div>

          <div className="w-full px-8 text-center space-y-6 min-h-[150px] mb-8">
            <div className="text-xl md:text-2xl font-light text-slate-300 transition-opacity duration-500 min-h-[40px]">
               {transcribedText ? (
                  <span className="animate-pulse">"{transcribedText}"</span>
               ) : ( lastUserMessage && <span className="opacity-60">"{lastUserMessage.text}"</span> )}
            </div>

            {(lastAiMessage || appState === AppState.PROCESSING) && (
              <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-white/5 shadow-2xl max-w-2xl mx-auto transform transition-all">
                {appState === AppState.PROCESSING ? (
                  <div className="flex items-center justify-center space-x-2">
                     <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                     <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                     <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <>
                    <p className="text-lg leading-relaxed text-white">{lastAiMessage?.text}</p>
                  </>
                )}
              </div>
            )}
          </div>
          
          <div className="w-full max-w-xl px-4 pb-8 z-50">
             <form onSubmit={handleTextSubmit} className="relative">
                <input 
                  type="text" 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Fale algo ou digite aqui..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-full py-3 px-6 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-lg backdrop-blur-sm"
                />
             </form>
          </div>
       </div>

       {isSettingsOpen && <SettingsPanel settings={settings} onUpdate={setSettings} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
};