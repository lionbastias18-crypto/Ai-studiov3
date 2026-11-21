import {
  GeminiAgentConfig,
  GeminiAgentGoal,
  GeminiAgentMemory,
  GeminiAgentOutcome,
  GeminiSuggestion,
} from "../types";

const AGENT_MEMORY_STORAGE_KEY = "gemini_autonomous_agent_memory_v1";

export const createDefaultGeminiAgentMemory = (): GeminiAgentMemory => ({
  xp: 0,
  level: 1,
  blocksMined: 0,
  oresFound: 0,
  mobsDefeated: 0,
  campsBuilt: 0,
  deaths: 0,
  maxDistanceReached: 0,
  strategyScores: {
    explore_far: 1.0,
    chop_trees: 1.2,
    mine_surface: 1.1,
    dig_mine: 1.4,
    build_camp: 0.8,
    hunt_mobs: 0.9,
    escape_hazard: 1.0,
  },
  recentOutcomes: [],
  learnedLessons: [
    "Explorar lejos del inicio permite descubrir biomas y vetas nuevas.",
    "Cavar túneles en escalera de 2 bloques de alto evita quedar atrapado.",
  ],
  lastThought: "Inicializando percepción del entorno con Gemini Flash...",
  lastModel: "gemini-4-hydrogen",
});

export const loadGeminiAgentMemory = (): GeminiAgentMemory => {
  try {
    const raw = localStorage.getItem(AGENT_MEMORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GeminiAgentMemory>;
      const def = createDefaultGeminiAgentMemory();
      return {
        ...def,
        ...parsed,
        strategyScores: {
          ...def.strategyScores,
          ...(parsed.strategyScores || {}),
        },
        recentOutcomes: Array.isArray(parsed.recentOutcomes)
          ? parsed.recentOutcomes.slice(-16)
          : def.recentOutcomes,
        learnedLessons: Array.isArray(parsed.learnedLessons) && parsed.learnedLessons.length > 0
          ? parsed.learnedLessons.slice(-8)
          : def.learnedLessons,
      };
    }
  } catch {}
  return createDefaultGeminiAgentMemory();
};

export const saveGeminiAgentMemory = (memory: GeminiAgentMemory): void => {
  try {
    localStorage.setItem(AGENT_MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch {}
};

export const resetGeminiAgentMemory = (): GeminiAgentMemory => {
  const fresh = createDefaultGeminiAgentMemory();
  saveGeminiAgentMemory(fresh);
  return fresh;
};

export const recordAgentExperience = (
  memory: GeminiAgentMemory,
  outcome: GeminiAgentOutcome,
  xpGain = 0
): GeminiAgentMemory => {
  const prevScore = memory.strategyScores[outcome.goal] ?? 1.0;
  // Temporal-difference Q-update keeping weights bounded in [-2, 6]
  const nextScore = Math.max(-2, Math.min(6, Number((prevScore * 0.82 + outcome.reward * 0.18).toFixed(3))));
  const nextXp = Math.max(0, memory.xp + xpGain);
  const nextLevel = Math.floor(nextXp / 45) + 1;
  return {
    ...memory,
    xp: nextXp,
    level: nextLevel,
    strategyScores: {
      ...memory.strategyScores,
      [outcome.goal]: nextScore,
    },
    recentOutcomes: [...memory.recentOutcomes.slice(-15), outcome],
  };
};

export const getBuildingSuggestion = async (
  biome: string,
  availableBlocks: string[]
): Promise<GeminiSuggestion | null> => {
  try {
    const response = await fetch("/api/gemini/suggest-build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ biome, availableBlocks }),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody?.error || `HTTP ${response.status}`);
    }
    return (await response.json()) as GeminiSuggestion;
  } catch (error) {
    console.error("Gemini suggestion error:", error);
    return null;
  }
};

export interface GeminiAgentStepPayload {
  agentName: string;
  autonomyStyle: GeminiAgentConfig["autonomyStyle"];
  lang: "es" | "en";
  position: { x: number; y: number; z: number };
  biome: string;
  distanceFromPlayer: number;
  hp: number;
  isNight: boolean;
  inWater: boolean;
  inLava: boolean;
  nearbyHostiles: number;
  nearbyOres: string[];
  nearbyLogs: number;
  inventorySummary: Record<string, number>;
  memory: GeminiAgentMemory;
  userPrompt?: string;
}

export interface GeminiAgentDecision {
  goal: GeminiAgentGoal;
  targetY: number;
  headingDeg: number;
  caution: "low" | "balanced" | "high";
  thought: string;
  learnedLesson: string;
  chatReply?: string;
  rewardAdjust?: Partial<Record<GeminiAgentGoal, number>>;
}

export interface GeminiAgentStepResult {
  ok: boolean;
  offline: boolean;
  model: string;
  decision?: GeminiAgentDecision;
  error?: string;
}

export const requestGeminiAgentStep = async (
  payload: GeminiAgentStepPayload
): Promise<GeminiAgentStepResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("/api/gemini/agent-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const errMsg = String(body?.error || `Error ${response.status}`);
      return {
        ok: false,
        offline: response.status === 404,
        model: "gemini-4-hydrogen",
        error: errMsg,
      };
    }

    const data = await response.json();
    if (!data?.decision?.goal) {
      return {
        ok: false,
        offline: false,
        model: data?.model || "gemini-4-hydrogen",
        error: "Respuesta incompleta de Gemini.",
      };
    }
    return {
      ok: true,
      offline: false,
      model: String(data.model || "gemini-4-hydrogen"),
      decision: data.decision as GeminiAgentDecision,
    };
  } catch (err: any) {
    const isOfflineOrAbort =
      err?.name === "AbortError" ||
      String(err?.message || "").toLowerCase().includes("failed to fetch");
    return {
      ok: false,
      offline: isOfflineOrAbort,
      model: "gemini-4-hydrogen",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
};
