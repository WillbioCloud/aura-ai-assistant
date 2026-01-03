import { ChatMessage, ChatResponse, SystemCommand } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "llama3"; // Ou "mistral", dependendo do que baixou

export const generateResponseLocal = async (
  history: ChatMessage[], 
  userMessage: string, 
  settings: any // Tipagem simplificada para o exemplo
): Promise<ChatResponse> => {

  // 1. Montar o Prompt com as instruções de sistema
  // O Llama3 funciona melhor com um formato de prompt específico, mas texto corrido funciona bem também
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
      .replace('${seriousness}', settings.personality.seriousness.toString())
      .replace('${humor}', settings.personality.humor.toString())
      .replace('${style}', settings.personality.style)
      .replace('${verbosity}', settings.personality.verbosity);

  // Instrução para comandos do sistema (JSON)
  const toolsInstruction = `
  [SISTEMA]: Você é a AURA, uma assistente pessoal.
  Se precisar abrir um app, termine a frase com: {"action": "OPEN_APP", "value": "nome_do_app"}
  Se precisar mudar volume: {"action": "VOLUME", "value": "0.5"}
  Se for apenas conversa, não use JSON.
  Responda em PORTUGUÊS.
  `;

  // Montamos o contexto da conversa
  const conversationContext = history
    .map(msg => `${msg.role === 'model' ? 'Aura' : 'Usuário'}: ${msg.text}`)
    .join('\n');

  const finalPrompt = `${systemPrompt}\n${toolsInstruction}\n\nHistórico:\n${conversationContext}\nUsuário: ${userMessage}\nAura:`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: finalPrompt,
        stream: false, // Importante: false para pegar a resposta inteira de uma vez
        options: {
          temperature: 0.7,
          num_predict: 200 // Limita o tamanho para ser mais rápido
        }
      }),
    });

    const data = await response.json();
    const rawText = data.response;

    // 2. Processar Comandos (Igual ao GeminiService)
    let finalText = rawText;
    let command: SystemCommand | undefined = undefined;

    try {
        const jsonMatch = rawText.match(/\{"action":\s*".*?"(?:,\s*"value":\s*".*?")?\}/);
        if (jsonMatch) {
            command = JSON.parse(jsonMatch[0]);
            finalText = rawText.replace(jsonMatch[0], '').trim();
        }
    } catch (e) {
        console.warn("Erro ao parsear JSON do Ollama", e);
    }

    return {
      text: finalText,
      searchResults: [],
      systemCommand: command
    };

  } catch (error) {
    console.error("Erro Ollama:", error);
    return {
      text: "Não consegui conectar ao meu cérebro local. Verifique se o Ollama está rodando.",
      systemCommand: undefined
    };
  }
};