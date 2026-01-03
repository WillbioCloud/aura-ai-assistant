import { GoogleGenAI, Tool, Type, FunctionDeclaration } from "@google/genai";
import { AssistantSettings, ChatMessage, SearchResult, ChatResponse, SystemCommand } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const controlSystemTool: FunctionDeclaration = {
  name: 'controlSystem',
  description: 'Control system functions on the user desktop computer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { 
        type: Type.STRING, 
        enum: ['OPEN_APP', 'VOLUME', 'SHOW_DESKTOP'],
        description: 'The type of system action to perform.'
      },
      value: { 
        type: Type.STRING,
        description: 'Value for the action. For OPEN_APP: app name (notepad, calculator, chrome). For VOLUME: up, down, mute, or 0-100.'
      }
    },
    required: ['action']
  }
};

export const generateResponse = async (
  history: ChatMessage[],
  newMessage: string,
  settings: AssistantSettings
): Promise<ChatResponse> => {
  
  if (!process.env.API_KEY) {
    return { text: "Erro: Chave de API não encontrada. Por favor configure a API_KEY." };
  }

  // Construct System Instruction based on settings
  const systemInstruction = SYSTEM_PROMPT_TEMPLATE
    .replace('${seriousness}', settings.personality.seriousness.toString())
    .replace('${humor}', settings.personality.humor.toString())
    .replace('${style}', settings.personality.style)
    .replace('${verbosity}', settings.personality.verbosity)
    + "\nSe o usuário pedir para abrir um programa, ajustar volume ou mostrar a área de trabalho, USE a ferramenta controlSystem. Não apenas diga que vai fazer, faça a chamada da função.";

  try {
    const model = 'gemini-flash-latest'; 
    
    // Tools configuration
    const tools: Tool[] = [
      { googleSearch: {} },
      { functionDeclarations: [controlSystemTool] }
    ];

    // Format history for the API
    const recentHistory = history.slice(-10).map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    const chat = ai.chats.create({
      model: model,
      history: recentHistory,
      config: {
        systemInstruction: systemInstruction,
        tools: tools,
        temperature: 0.7,
      }
    });

    const result = await chat.sendMessage({ message: newMessage });
    
    // Check for Function Calls (System Commands)
    let systemCommand: SystemCommand | undefined;
    const toolCall = result.functionCalls?.[0];
    
    if (toolCall && toolCall.name === 'controlSystem') {
       systemCommand = toolCall.args as SystemCommand;
    }

    // Extract Text
    // If the model calls a tool, it might have empty text. We provide a default if so.
    let responseText = result.text;
    
    if (!responseText && systemCommand) {
       if (systemCommand.action === 'OPEN_APP') responseText = `Abrindo ${systemCommand.value}...`;
       else if (systemCommand.action === 'VOLUME') responseText = `Ajustando volume (${systemCommand.value})...`;
       else if (systemCommand.action === 'SHOW_DESKTOP') responseText = "Mostrando área de trabalho.";
    }
    
    if (!responseText) responseText = "Comando processado.";

    // Extract Search Metadata (Grounding)
    let searchResults: SearchResult[] = [];
    const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    if (groundingChunks) {
      searchResults = groundingChunks
        .flatMap(chunk => {
          if (chunk.web) {
            return [{ title: chunk.web.title || 'Resultado Web', uri: chunk.web.uri || '#' }];
          }
          return [];
        });
    }

    return {
      text: responseText,
      searchResults: searchResults.length > 0 ? searchResults : undefined,
      systemCommand
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Desculpe, tive um problema ao conectar com minha inteligência." };
  }
};
