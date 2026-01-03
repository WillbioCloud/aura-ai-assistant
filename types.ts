export enum AppState {
  IDLE = 'IDLE',
  PASSIVE_LISTENING = 'PASSIVE_LISTENING',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
}

export interface AssistantSettings {
  personality: {
    seriousness: number;
    humor: number;
    style: 'formal' | 'casual' | 'technical';
    verbosity: 'concise' | 'balanced' | 'detailed';
  };
  voice: {
    pitch: number;
    rate: number;
    volume: number;
    selectedVoiceURI: string | null;
    selectedMicrophoneId: string | null; // NOVO
    selectedSpeakerId: string | null;    // NOVO
  };
  behavior: {
    autoSearch: boolean;
    confirmCommands: boolean;
  };
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  searchResults?: SearchResult[];
}

export interface SearchResult {
  title: string;
  uri: string;
}

export interface SystemCommand {
  action: 'OPEN_APP' | 'VOLUME' | 'SHOW_DESKTOP';
  value?: string;
}

export interface ChatResponse {
  text: string;
  searchResults?: SearchResult[];
  systemCommand?: SystemCommand;
}

declare global {
  interface Window {
    electronAPI: {
      sendCommand: (command: any) => void;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}