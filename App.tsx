import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Orb } from './components/Orb';
import { SettingsPanel } from './components/SettingsPanel';
import { AppState, AssistantSettings, ChatMessage, SearchResult, SystemCommand } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generateResponse } from './services/geminiService';

// Web Speech API Types extension
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

// Robust Regex for Wake Word Detection
// Matches: Start of string or whitespace + (phrases) + whitespace, end of string, or punctuation
// Phrases: hey aura, aura, olá aura, oi aura, assistente
const WAKE_WORD_REGEX = /(?:^|\s)(hey aura|aura|olá aura|oi aura|assistente)(?=\s|$|[.,!?])/i;

const App: React.FC = () => {
  // --- State ---
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [settings, setSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Chat History
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcribedText, setTranscribedText] = useState('');
  
  // Audio Visuals
  const [audioLevel, setAudioLevel] = useState(0);

  // System Notification
  const [systemNotification, setSystemNotification] = useState<string | null>(null);

  // Refs for persistence
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Speech Recognition Setup (STT) ---
  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Keep listening
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        // If we just started and state is IDLE, move to PASSIVE
        if (appState === AppState.IDLE) {
           setAppState(AppState.PASSIVE_LISTENING);
        }
      };

      recognition.onresult = (event: any) => {
        // Prevent processing if speaking or processing logic
        if (appState === AppState.SPEAKING || appState === AppState.PROCESSING) return;

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const fullText = (interimTranscript || finalTranscript).trim();

        // --- WAKE WORD LOGIC (Passive Mode) ---
        if (appState === AppState.PASSIVE_LISTENING) {
           // Check if wake word is present
           if (WAKE_WORD_REGEX.test(fullText)) {
             setAppState(AppState.LISTENING);
             // We do not clear transcribedText here immediately to allow the full sentence 
             // (including the wake word and subsequent command) to be processed in the next active phase
             // or we can clear it if we want to force a clean command. 
             // Strategy: Let it flow into Active Mode. The VAD logic below will pick it up.
           }
           return; 
        }

        // --- COMMAND LOGIC (Active Mode) ---
        setTranscribedText(fullText);
        setAppState(AppState.LISTENING);
        
        // Reset silence timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // VAD
        if (finalTranscript) {
          handleUserMessage(finalTranscript);
        } else if (interimTranscript.trim().length > 0) {
           silenceTimerRef.current = setTimeout(() => {
             handleUserMessage(interimTranscript);
             setTranscribedText('');
           }, 1000); // 1000ms for snappier response
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
           console.error("Microphone permission denied");
        }
        // If "no-speech" error in passive mode, just ignore it, it will restart
      };

      recognition.onend = () => {
        // Auto-restart loop for continuous listening
        if (appState !== AppState.IDLE) {
           try {
             recognition.start();
           } catch (e) { /* ignore */ }
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);


  // --- Logic Handlers ---

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;
    
    // Stop recognition briefly while processing/speaking to avoid hearing self
    if (recognitionRef.current) recognitionRef.current.stop();
    
    setAppState(AppState.PROCESSING);
    setTranscribedText(text);

    // Filter out the wake word from the message sent to history to keep it clean
    // This isn't strictly necessary for Gemini but looks better in UI
    const cleanText = text.replace(WAKE_WORD_REGEX, '').trim() || text;

    const newUserMsg: ChatMessage = { role: 'user', text: cleanText, timestamp: Date.now() };
    setMessages(prev => [...prev, newUserMsg]);

    // Call Gemini
    const result = await generateResponse(messages, cleanText, settings);

    // Handle System Command (Simulation)
    if (result.systemCommand) {
       executeSystemCommand(result.systemCommand);
    }

    // Update UI
    const newAiMsg: ChatMessage = { 
      role: 'model', 
      text: result.text, 
      timestamp: Date.now(),
      searchResults: result.searchResults 
    };
    setMessages(prev => [...prev, newAiMsg]);

    // Speak
    speakResponse(result.text);
  };

  const executeSystemCommand = (cmd: SystemCommand) => {
    console.log("EXECUTING SYSTEM COMMAND:", cmd);
    
    // Envia para o processo principal do Electron
    if (window.electronAPI) {
        window.electronAPI.sendCommand(cmd);
    } else {
        console.warn("Electron API não detectada. Rodando no navegador?");
    }
    
    // UI Notification (mantém o que você já fez)
    let notifyText = "";
    switch(cmd.action) {
      case 'OPEN_APP': notifyText = `Abrindo ${cmd.value || 'aplicativo'}...`; break;
      case 'VOLUME': notifyText = `Volume: ${cmd.value}`; break;
      case 'SHOW_DESKTOP': notifyText = "Minimizando janelas..."; break;
    }
    setSystemNotification(notifyText);
    setTimeout(() => setSystemNotification(null), 3000);
  };

  // --- Text to Speech (TTS) ---
  const speakResponse = useCallback((text: string) => {
    setAppState(AppState.SPEAKING);
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
      
      // Return to Passive Listening after finishing interaction
      setAppState(AppState.PASSIVE_LISTENING);
      
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
    };

    synthesisRef.current.speak(utterance);
  }, [settings]);

  // --- Microphone Audio Visualization ---
  useEffect(() => {
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let microphone: MediaStreamAudioSourceNode;
    let animationFrame: number;

    const setupAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const animate = () => {
          if (appState === AppState.LISTENING || appState === AppState.PASSIVE_LISTENING) {
             analyser.getByteFrequencyData(dataArray);
             let sum = 0;
             for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
             const average = sum / bufferLength;
             
             // Lower sensitivity for passive mode visualization
             setAudioLevel(average / (appState === AppState.PASSIVE_LISTENING ? 256 : 128)); 
          } else if (appState === AppState.IDLE) {
             setAudioLevel(0);
          }
          animationFrame = requestAnimationFrame(animate);
        };
        animate();
      } catch (err) {
        console.error("Audio visualizer error", err);
      }
    };

    if (appState === AppState.LISTENING || appState === AppState.PASSIVE_LISTENING) {
       setupAudio();
    }

    return () => {
      if (audioContext) audioContext.close();
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [appState]);

  const toggleListening = () => {
    if (appState === AppState.IDLE) {
      setAppState(AppState.PASSIVE_LISTENING);
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
    } else {
      setAppState(AppState.IDLE);
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  };

  // --- Render ---

  const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
  const lastAiMessage = messages.slice().reverse().find(m => m.role === 'model');

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white selection:bg-cyan-500 selection:text-white">
      
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950 -z-10" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
         <h1 className="text-xl font-light tracking-[0.2em] text-cyan-500 opacity-80">AURA</h1>
         <button 
           onClick={() => setIsSettingsOpen(true)}
           className="p-2 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-white"
         >
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
         </button>
      </div>

      {/* Main Visualizer */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl">
        
        {/* System Notification Toast */}
        {systemNotification && (
          <div className="absolute top-24 bg-white/10 backdrop-blur border border-white/20 px-6 py-2 rounded-full text-sm font-medium animate-bounce text-cyan-300">
            {systemNotification}
          </div>
        )}

        {/* The Orb */}
        <div className="mb-12">
           <Orb 
             state={appState} 
             audioData={audioLevel} 
             onClick={toggleListening}
           />
        </div>

        {/* Interaction Display */}
        <div className="w-full px-8 text-center space-y-6 min-h-[200px]">
          
          {/* User Transcript */}
          <div className="text-xl md:text-2xl font-light text-slate-300 transition-opacity duration-500">
             {(appState === AppState.LISTENING || appState === AppState.PASSIVE_LISTENING) && transcribedText ? (
                <span className="animate-pulse">"{transcribedText}"</span>
             ) : (
                lastUserMessage && <span className="opacity-60">"{lastUserMessage.text}"</span>
             )}
          </div>

          {/* AI Response Area */}
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
                  <p className="text-lg leading-relaxed text-white">
                    {lastAiMessage?.text}
                  </p>
                  
                  {/* Search Results */}
                  {lastAiMessage?.searchResults && lastAiMessage.searchResults.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10 text-left">
                      <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2">Fontes</p>
                      <div className="flex flex-wrap gap-2">
                        {lastAiMessage.searchResults.map((res, idx) => (
                           <a 
                             key={idx} 
                             href={res.uri} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="text-xs bg-slate-900 hover:bg-slate-700 border border-slate-700 px-3 py-1 rounded-full transition text-slate-300 truncate max-w-[200px]"
                           >
                             {res.title}
                           </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsPanel 
          settings={settings} 
          onUpdate={setSettings} 
          onClose={() => setIsSettingsOpen(false)} 
        />
      )}
    </div>
  );
};

export default App;