import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Orb } from './Orb';
import { SettingsPanel } from './SettingsPanel';
import { AppState, AssistantSettings, ChatMessage, SystemCommand } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { generateResponse } from '../services/geminiService';

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const WAKE_WORD_REGEX = /(?:^|\s)(hey aura|aura|olá aura|oi aura|assistente)(?=\s|$|[.,!?])/i;

export const Dashboard: React.FC = () => {
  // --- Estados ---
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [settings, setSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcribedText, setTranscribedText] = useState('');
  const [textInput, setTextInput] = useState(''); // Para o chat por texto
  const [audioLevel, setAudioLevel] = useState(0);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string>("Iniciando...");

  // --- Refs ---
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const isSpeakingRef = useRef(false); // Controle manual para evitar loop

  // --- 1. CONFIGURAÇÃO ÚNICA DO RECONHECIMENTO DE VOZ ---
  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus("Navegador não suporta Voz");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    // Tenta aumentar alternativas para pegar melhor a wake word
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("Mic ON");
      setVoiceStatus("Microfone Ativo");
      if (appState === AppState.IDLE) setAppState(AppState.PASSIVE_LISTENING);
    };

    recognition.onresult = (event: any) => {
      // Se a IA estiver falando, ignoramos o microfone para ela não se ouvir
      if (isSpeakingRef.current || appState === AppState.PROCESSING) return;

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }

      const fullText = (interimTranscript || finalTranscript).trim();
      
      // Atualiza texto na tela apenas se tiver algo relevante
      if (fullText) setTranscribedText(fullText);

      // Lógica de Wake Word (Modo Passivo)
      if (appState === AppState.PASSIVE_LISTENING) {
         if (WAKE_WORD_REGEX.test(fullText)) {
           setAppState(AppState.LISTENING);
           setVoiceStatus("Ouvindo Comando...");
         }
         return; 
      }

      // Lógica Ativa (Já ouviu a wake word ou clicou na orbe)
      if (appState === AppState.LISTENING) {
        // Debounce simples: espera o usuário parar de falar
        if (finalTranscript) {
          handleUserMessage(finalTranscript);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Erro Mic:", event.error);
      if (event.error === 'not-allowed') {
        setVoiceStatus("Erro: Microfone Bloqueado");
        setSystemNotification("Acesso ao Mic negado pelo Windows/Electron");
      } else if (event.error === 'no-speech') {
        // Apenas silêncio, ignora
      } else {
        setVoiceStatus(`Erro: ${event.error}`);
        // Tenta reiniciar se cair
        setTimeout(() => {
             try { recognition.start(); } catch(e){}
        }, 1000);
      }
    };

    recognition.onend = () => {
      console.log("Mic OFF (Restarting...)");
      // Reinicia automaticamente se não estivermos processando/falando
      if (!isSpeakingRef.current) {
         try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    
    // Inicia imediatamente
    try { recognition.start(); } catch(e){ console.error(e); }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dependência vazia = roda apenas 1 vez ao montar (CORREÇÃO CRÍTICA)

  // --- 2. MANIPULADORES ---

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;
    
    // Pausa reconhecimento
    if (recognitionRef.current) recognitionRef.current.stop();
    
    setAppState(AppState.PROCESSING);
    setTranscribedText(text); // Fixa o texto final

    const cleanText = text.replace(WAKE_WORD_REGEX, '').trim() || text;
    const newUserMsg: ChatMessage = { role: 'user', text: cleanText, timestamp: Date.now() };
    setMessages(prev => [...prev, newUserMsg]);

    try {
        const result = await generateResponse(messages, cleanText, settings);

        // Executa comandos
        if (result.systemCommand) executeSystemCommand(result.systemCommand);

        // Adiciona resposta
        const newAiMsg: ChatMessage = { 
          role: 'model', 
          text: result.text, 
          timestamp: Date.now(),
          searchResults: result.searchResults 
        };
        setMessages(prev => [...prev, newAiMsg]);
        
        // Fala
        speakResponse(result.text);

    } catch (error) {
        console.error(error);
        setAppState(AppState.IDLE);
        setSystemNotification("Erro ao conectar com a IA");
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
      case 'SHOW_DESKTOP': notifyText = "Minimizando janelas..."; break;
    }
    setSystemNotification(notifyText);
    setTimeout(() => setSystemNotification(null), 3000);
  };

  const speakResponse = useCallback((text: string) => {
    setAppState(AppState.SPEAKING);
    isSpeakingRef.current = true; // Bloqueia mic
    
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

    // Animação fake baseada na fala (já que TTS não dá dados de áudio fáceis no navegador)
    const intervalId = setInterval(() => {
      setAudioLevel(Math.random() * 0.6 + 0.2); 
    }, 100);

    utterance.onend = () => {
      clearInterval(intervalId);
      setAudioLevel(0);
      setAppState(AppState.PASSIVE_LISTENING);
      isSpeakingRef.current = false; // Libera mic
      
      // Reinicia escuta
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
    };
    
    setTimeout(() => synthesisRef.current.speak(utterance), 100);
  }, [settings]);

  // --- 3. VISUALIZADOR DE ÁUDIO (Input) ---
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
           // Só anima se não estiver falando (para não misturar visualização)
           if (!isSpeakingRef.current) {
             analyser.getByteFrequencyData(dataArray);
             let sum = 0;
             for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
             // Normaliza e define
             const val = (sum / dataArray.length) / 128;
             setAudioLevel(val); 
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

  // Força ativação ao clicar na orbe
  const handleOrbClick = () => {
      if (appState === AppState.IDLE || appState === AppState.PASSIVE_LISTENING) {
          setAppState(AppState.LISTENING);
          setVoiceStatus("Escuta Ativa Manual");
      } else {
          setAppState(AppState.PASSIVE_LISTENING);
          setVoiceStatus("Modo Passivo");
      }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
       {/* HEADER */}
       <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-50 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
         <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex flex-col">
            <h1 className="text-xl font-light tracking-[0.2em] text-cyan-500 opacity-80">AURA</h1>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">{voiceStatus}</span>
         </div>
         <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
             <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-white">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </button>
             <div className="h-6 w-px bg-slate-700/50" />
             <div className="flex items-center gap-2">
                <button onClick={() => window.electronAPI?.minimize()} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg></button>
                <button onClick={() => window.electronAPI?.maximize()} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
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
          
          {/* BARRA DE INPUT DE TEXTO (FALLBACK) */}
          <div className="w-full max-w-xl px-4 pb-8 z-50">
             <form onSubmit={handleTextSubmit} className="relative">
                <input 
                  type="text" 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Digite aqui se o microfone falhar..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-full py-3 px-6 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-lg backdrop-blur-sm"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-cyan-600 rounded-full hover:bg-cyan-500 transition disabled:opacity-50" disabled={!textInput.trim()}>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                   </svg>
                </button>
             </form>
          </div>
       </div>

       {isSettingsOpen && <SettingsPanel settings={settings} onUpdate={setSettings} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
};