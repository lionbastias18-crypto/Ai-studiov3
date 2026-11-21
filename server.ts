import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ACTIVE_GEMINI_FLASH_MODEL = "gemini-4-hydrogen";

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function classifyGeminiError(error: unknown): { status: number; message: string } {
  const err = error as any;
  const rawMsg = err instanceof Error ? err.message : String(error || "Gemini API error");
  const statusCode = Number(err?.status || err?.code || 500);
  if (rawMsg.includes("PERMISSION_DENIED") || rawMsg.includes("API_KEY_INVALID") || statusCode === 400 || statusCode === 403) {
    return {
      status: 403,
      message: "API key de Gemini inválida o sin permisos. Verifica tu clave en Settings > Secrets.",
    };
  }
  if (rawMsg.includes("RESOURCE_EXHAUSTED") || statusCode === 429) {
    return {
      status: 429,
      message: "Cuota de Gemini alcanzada temporalmente (429). Reintentando aprendizaje autónomo.",
    };
  }
  if (rawMsg.includes("NOT_FOUND") || statusCode === 404) {
    return {
      status: 404,
      message: `Modelo ${ACTIVE_GEMINI_FLASH_MODEL} no disponible en esta cuenta.`,
    };
  }
  return {
    status: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    message: rawMsg.slice(0, 180),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/gemini/status", (_req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY);
    res.json({
      configured: hasKey,
      model: ACTIVE_GEMINI_FLASH_MODEL,
      requestedFamily: "gemini-flash",
    });
  });

  app.post("/api/gemini/suggest-build", async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: "GEMINI_API_KEY no está configurada en el servidor (Settings > Secrets).",
      });
    }

    try {
      const biome = String(req.body?.biome || "plains");
      const availableBlocks = Array.isArray(req.body?.availableBlocks)
        ? req.body.availableBlocks.slice(0, 20).map(String)
        : ["WOOD", "STONE", "GLASS"];

      const response = await ai.models.generateContent({
        model: ACTIVE_GEMINI_FLASH_MODEL,
        contents: `Suggest a creative Minecraft Infdev structure to build in a ${biome} biome using blocks like ${availableBlocks.join(", ")}. Answer in Spanish.`,
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
                items: { type: Type.STRING },
              },
            },
            required: ["title", "description", "steps"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        return res.status(502).json({ error: "Empty response from Gemini." });
      }
      return res.json(JSON.parse(text));
    } catch (error) {
      const mapped = classifyGeminiError(error);
      console.error("[/api/gemini/suggest-build] Error:", mapped.message);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post("/api/gemini/agent-step", async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: "GEMINI_API_KEY no configurada en el servidor (Settings > Secrets).",
      });
    }

    try {
      const {
        agentName = "Gemini IA",
        lang = "es",
        position = { x: 0, y: 64, z: 0 },
        biome = "plains",
        distanceFromPlayer = 0,
        hp = 20,
        isNight = false,
        inWater = false,
        inLava = false,
        nearbyHostiles = 0,
        nearbyOres = [],
        nearbyLogs = 0,
        inventorySummary = {},
        memory = {},
        userPrompt = "",
      } = req.body || {};

      const responseLanguage = lang === "en" ? "English" : "Spanish";
      const systemInstruction =
        `You are ${agentName}, an independent autonomous reinforcement-learning AI player living inside a 3D infinite voxel world (Minecraft-style). ` +
        `You are NOT a follower pet — you roam freely as far as you want, explore distant lands, chop wood, dig proper 2-block-tall staircase mines down to rich layers (Y=12..18 for diamonds/redstone, Y=24..42 for iron/coal), fight hostile monsters, and build survival camps when needed. ` +
        `Analyze your sensory state, inventory, strategyScores (learned Q-values), and recentOutcomes rewards to decide your next optimal goal and a new concrete learnedLesson. ` +
        `Keep "thought" and "learnedLesson" concise (1 short sentence each) in ${responseLanguage}.`;

      const statePrompt = JSON.stringify({
        position,
        biome,
        distanceFromPlayer: Math.round(Number(distanceFromPlayer) || 0),
        hp,
        isNight,
        inWater,
        inLava,
        nearbyHostiles,
        nearbyOres,
        nearbyLogs,
        inventorySummary,
        xp: memory?.xp ?? 0,
        level: memory?.level ?? 1,
        deaths: memory?.deaths ?? 0,
        strategyScores: memory?.strategyScores ?? {},
        recentOutcomes: Array.isArray(memory?.recentOutcomes) ? memory.recentOutcomes.slice(-6) : [],
        learnedLessons: Array.isArray(memory?.learnedLessons) ? memory.learnedLessons.slice(-5) : [],
        playerChatInput: userPrompt || undefined,
      });

      const response = await ai.models.generateContent({
        model: ACTIVE_GEMINI_FLASH_MODEL,
        contents: `Current autonomous agent state and learning memory:\n${statePrompt}`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              goal: {
                type: Type.STRING,
                enum: [
                  "explore_far",
                  "chop_trees",
                  "mine_surface",
                  "dig_mine",
                  "build_camp",
                  "hunt_mobs",
                  "escape_hazard",
                ],
              },
              targetY: { type: Type.INTEGER },
              headingDeg: { type: Type.INTEGER },
              caution: {
                type: Type.STRING,
                enum: ["low", "balanced", "high"],
              },
              thought: { type: Type.STRING },
              learnedLesson: { type: Type.STRING },
              chatReply: { type: Type.STRING },
              rewardAdjust: {
                type: Type.OBJECT,
                properties: {
                  explore_far: { type: Type.NUMBER },
                  chop_trees: { type: Type.NUMBER },
                  mine_surface: { type: Type.NUMBER },
                  dig_mine: { type: Type.NUMBER },
                  build_camp: { type: Type.NUMBER },
                  hunt_mobs: { type: Type.NUMBER },
                },
              },
            },
            required: ["goal", "targetY", "headingDeg", "caution", "thought", "learnedLesson"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        return res.status(502).json({ error: "Empty response from Gemini." });
      }
      const parsed = JSON.parse(text);
      return res.json({
        model: ACTIVE_GEMINI_FLASH_MODEL,
        decision: parsed,
      });
    } catch (error) {
      const mapped = classifyGeminiError(error);
      console.error("[/api/gemini/agent-step] Error:", mapped.message);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
