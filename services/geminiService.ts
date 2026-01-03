import { GoogleGenerativeAI } from "@google/generative-ai";
import { AssistantSettings, ChatMessage, ChatResponse, SearchResult, SystemCommand } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";

// Pega a chave do jeito certo no Vite
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Inicializa a API fora da função para não recriar sempre
let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

try {
  if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
  } else {
    console.error("VITE_GEMINI_API_KEY não encontrada no .env");
  }
} catch (e) {
  console.error("Erro ao inicializar Gemini:", e);
}

export const generateResponse = async (
  history: ChatMessage[], 
  userMessage: string, 
  settings: AssistantSettings
): Promise<ChatResponse> => {
  
  // 1. Verificação de Segurança da Chave
  if (!API_KEY) {
    return {
      text: "Eu preciso de uma chave de API para funcionar. Por favor, verifique se o arquivo .env tem a variável VITE_GEMINI_API_KEY configurada.",
      systemCommand: undefined
    };
  }

  if (!model) {
    return {
      text: "Erro interno: O modelo de IA não foi inicializado corretamente.",
      systemCommand: undefined
    };
  }

  try {
    // 2. Montar o Prompt do Sistema (Personalidade)
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE
      .replace('${seriousness}', settings.personality.seriousness.toString())
      .replace('${humor}', settings.personality.humor.toString())
      .replace('${style}', settings.personality.style)
      .replace('${verbosity}', settings.personality.verbosity);

    // 3. Preparar histórico para o Gemini
    // O Gemini Pro espera alternância user/model. Filtramos mensagens inválidas.
    const chatHistory = history
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

    // Inicia o chat
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: `Instrução do Sistema: ${systemPrompt}` }] },
        { role: "model", parts: [{ text: "Entendido. Estou configurada e pronta." }] },
        ...chatHistory
      ],
      generationConfig: {
        maxOutputTokens: 500, // Limita resposta para ser rápida
        temperature: 0.7,
      },
    });

    // 4. Envia a mensagem com instruções extras para comandos
    const promptWithTools = `${userMessage}
    
    [INSTRUÇÃO IMPORTANTE]:
    Se o usuário pedir para abrir um programa, responda EXATAMENTE neste formato JSON no final da frase: {"action": "OPEN_APP", "value": "nome_do_executavel"}
    Se pedir volume, use: {"action": "VOLUME", "value": "0.5"} (de 0.0 a 1.0)
    Se pedir para minimizar tudo/mostrar area de trabalho: {"action": "SHOW_DESKTOP"}
    Não use markdown de código (\`\`\`) para o JSON, apenas coloque o texto puro no final.`;

    const result = await chat.sendMessage(promptWithTools);
    const response = await result.response;
    const text = response.text();

    // 5. Processamento de Comandos (Parser Simples)
    let finalResponseText = text;
    let command: SystemCommand | undefined = undefined;

    // Tenta achar o JSON do comando no texto
    try {
        const jsonMatch = text.match(/\{"action":\s*".*?"(?:,\s*"value":\s*".*?")?\}/);
        if (jsonMatch) {
            command = JSON.parse(jsonMatch[0]);
            // Remove o JSON da fala para a Aura não "ler" o código para você
            finalResponseText = text.replace(jsonMatch[0], '').trim();
        }
    } catch (e) {
        console.warn("Falha ao processar comando JSON da IA", e);
    }

    return {
      text: finalResponseText,
      searchResults: [], // Busca na web implementaremos no próximo passo se quiser
      systemCommand: command
    };

  } catch (error: any) {
    console.error("Erro na requisição Gemini:", error);
    
    // Tratamento de erros comuns
    let errorMessage = "Desculpe, tive um problema ao conectar com minha inteligência.";
    
    if (error.message?.includes("API key")) {
      errorMessage = "Minha chave de API parece estar inválida ou expirada.";
    } else if (error.message?.includes("quota")) {
      errorMessage = "Atingi meu limite de uso da API do Google por hoje.";
    } else if (error.message?.includes("network")) {
      errorMessage = "Estou com problemas para acessar a internet.";
    }

    return {
      text: errorMessage,
      systemCommand: undefined
    };
  }
};