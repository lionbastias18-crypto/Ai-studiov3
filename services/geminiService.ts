import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { AICompanionMode, GeminiSuggestion } from "../types";

let _cachedClient: GoogleGenAI | null = null;
const getAiClient = (): GoogleGenAI | null => {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!key) return null;
  if (!_cachedClient) {
    _cachedClient = new GoogleGenAI({ apiKey: key });
  }
  return _cachedClient;
};

export type AICompanionChatAction = AICompanionMode | 'share' | 'tp_to_player' | 'none';

export interface AICompanionReply {
  reply: string;
  action: AICompanionChatAction;
}

export const getBuildingSuggestion = async (biome: string, availableBlocks: string[]): Promise<GeminiSuggestion | null> => {
  try {
    const ai = getAiClient();
    if (!ai) return null;
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Suggest a creative Minecraft Infdev structure to build in a ${biome} biome using blocks like ${availableBlocks.join(', ')}.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["title", "description", "steps"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as GeminiSuggestion;
  } catch (error) {
    console.error("Gemini suggestion error:", error);
    return null;
  }
};

export const detectLocalCompanionIntent = (message: string): AICompanionChatAction => {
  const q = message.toLowerCase();
  if (/(ven|acércate|acercate|teletransp|tp|come here|come to me)/.test(q)) {
    return /(sígueme|sigueme|follow)/.test(q) ? 'follow' : 'tp_to_player';
  }
  if (/(sígueme|sigueme|acompañ|follow|conmigo)/.test(q)) return 'follow';
  if (/(dame|comparte|regala|pasa|invent|mochila|give|share|drop)/.test(q) && /(bloque|madera|piedra|carb|hierro|diamant|todo|recurso|wood|stone|block|item)/.test(q)) {
    return 'share';
  }
  if (/(dame|comparte|share|give me)/.test(q)) return 'share';
  if (/(construy|casa|refugio|pared|torre|build|house|shelter)/.test(q)) return 'build';
  if (/(mina|pico|mineral|diamant|hierro|tala|madera|árbol|arbol|corta|recolect|gather|mine|chop)/.test(q)) return 'gather';
  if (/(proteg|defiend|atac|mata|pelea|lucha|zomb|creeper|esquelet|mob|guard|fight|defend)/.test(q)) return 'guard';
  if (/(explor|busca|aventur|pasea|libre|explore|roam)/.test(q)) return 'explore';
  if (/(quédate|quedate|espera|alto|para|quiet|stay|wait|stop)/.test(q)) return 'stay';
  return 'none';
};

export const buildLocalCompanionFallback = (
  name: string,
  message: string,
  action: AICompanionChatAction,
  context: {
    mode: AICompanionMode;
    gatheredTotal: number;
    isNight: boolean;
    altitude: number;
    lang: 'es' | 'en';
  }
): string => {
  const isEs = context.lang !== 'en';
  if (action === 'follow') return isEs ? `¡Voy contigo! Te cubro las espaldas.` : `Right behind you! I've got your back.`;
  if (action === 'tp_to_player') return isEs ? `¡Ya llegué a tu lado!` : `Made it right next to you!`;
  if (action === 'gather') return isEs ? `⛏️ ¡En marcha! Voy a picar piedra, minerales y talar madera cercana.` : `⛏️ On it! Going to mine stone, ores, and chop nearby trees.`;
  if (action === 'build') return isEs ? `🏠 ¡Sacando bloques! Te construiré un refugio cerca con puerta y antorchas.` : `🏠 Pulling out blocks! Building us a shelter nearby with door and torches.`;
  if (action === 'guard') return isEs ? `⚔️ ¡Espada lista! Atacaré a cualquier mob hostil que se acerque.` : `⚔️ Sword ready! I'll fight any hostile mob nearby.`;
  if (action === 'explore') return isEs ? `🧭 ¡Modo exploración! Voy a investigar los alrededores.` : `🧭 Exploring mode! Scouting around nearby.`;
  if (action === 'stay') return isEs ? `🛑 Perfecto, me quedo vigilando justo aquí.` : `🛑 Got it, holding position right here.`;
  if (action === 'share') {
    return context.gatheredTotal > 0
      ? (isEs ? `🎁 ¡Toma! Te paso los recursos que recolecté.` : `🎁 Here you go! Sharing the resources I gathered.`)
      : (isEs ? `🎒 Aún no tengo bloques en mi mochila, ¡ponme en modo Minar y te consigo!` : `🎒 My bag is empty right now, set me to Gather and I'll mine some!`);
  }

  const q = message.toLowerCase();
  if (/(hola|buenas|hey|hi|hello|qué tal|que tal)/.test(q)) {
    return isEs
      ? `¡Hola! Soy ${name}. Ahora mismo estoy en modo ${context.mode} y llevo ${context.gatheredTotal} bloques en la mochila. ¿Minamos, construimos o exploramos?`
      : `Hey! I'm ${name}. Currently on ${context.mode} mode with ${context.gatheredTotal} blocks in my bag. Want to mine, build, or explore?`;
  }
  if (/(qué haces|que haces|what are you doing|estado|status)/.test(q)) {
    return isEs
      ? `Estoy a Y:${Math.round(context.altitude)} (${context.isNight ? 'es de noche, atento a los mobs' : 'buen día para construir'}) en modo ${context.mode}.`
      : `I'm at Y:${Math.round(context.altitude)} (${context.isNight ? 'nighttime, watching for mobs' : 'great day to build'}) in ${context.mode} mode.`;
  }
  return isEs
    ? `¡Entendido! Aquí sigo contigo (llevo ${context.gatheredTotal} bloques). Pídeme que mine, construya un refugio, te siga o te proteja.`
    : `Got it! Playing right alongside you (${context.gatheredTotal} blocks gathered). Ask me to mine, build a shelter, follow, or guard!`;
};

export const askAICompanion = async (
  playerMessage: string,
  context: {
    companionName: string;
    mode: AICompanionMode;
    gatheredTotal: number;
    isNight: boolean;
    altitude: number;
    nearbyHostiles: number;
    lang: 'es' | 'en';
  }
): Promise<AICompanionReply> => {
  const localAction = detectLocalCompanionIntent(playerMessage);
  const ai = getAiClient();

  // Execute clear commands instantly without waiting on network; enrich casual chat with Gemini when available
  if (!ai || localAction !== 'none') {
    return {
      action: localAction,
      reply: buildLocalCompanionFallback(context.companionName, playerMessage, localAction, context),
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Player says: "${playerMessage}"\nContext: mode=${context.mode}, blocksInBag=${context.gatheredTotal}, isNight=${context.isNight}, y=${Math.round(context.altitude)}, nearbyMonsters=${context.nearbyHostiles}, language=${context.lang}.`,
      config: {
        systemInstruction: `You are ${context.companionName}, a friendly human-like co-op player companion inside a 3D Minecraft-style voxel world. Keep replies concise (1-2 short sentences), cheerful, and natural in ${context.lang === 'es' ? 'Spanish' : 'English'}. Also decide if the player is asking you to change action: "follow", "gather", "build", "guard", "explore", "stay", "share", "tp_to_player", or "none".`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            action: {
              type: Type.STRING,
              enum: ["follow", "gather", "build", "guard", "explore", "stay", "share", "tp_to_player", "none"]
            }
          },
          required: ["reply", "action"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}") as Partial<AICompanionReply>;
    if (parsed.reply && parsed.action) {
      return {
        reply: parsed.reply,
        action: parsed.action,
      };
    }
  } catch (err) {
    console.warn("AI companion Gemini chat fallback:", err);
  }

  return {
    action: localAction,
    reply: buildLocalCompanionFallback(context.companionName, playerMessage, localAction, context),
  };
};

