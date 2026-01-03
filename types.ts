export enum AppState {
  IDLE = 'IDLE',
  PASSIVE_LISTENING = 'PASSIVE_LISTENING', // Waiting for wake word
  LISTENING = 'LISTENING', // Active interacting
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
}

export interface AssistantSettings {
  personality: {
    seriousness: number; // 0-100
    humor: number; // 0-100
    style: 'formal' | 'casual' | 'technical';
    verbosity: 'concise' | 'balanced' | 'detailed';
  };
  voice: {
    pitch: number; // 0.5 - 2
    rate: number; // 0.5 - 2
    volume: number; // 0 - 1
    selectedVoiceURI: string | null;
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
