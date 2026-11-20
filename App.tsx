import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import VoxelWorld, { DEFAULT_NOISE_CONFIG } from "./components/VoxelWorld";
import Joystick from "./components/Joystick";
import { FpsCounter } from "./components/FpsCounter";
import { MenuPanorama3D } from "./components/MenuPanorama3D";
import { BlockType, ToolType, Vector3D, GeminiSuggestion, NoiseConfig, PerformanceConfig, CharacterSkinId, CustomCharacterConfig, ActivePlayerInfo, AICompanionConfig, AICompanionMode, RealmData, RealmPlanTier, RealmWorldMeta, RealmEditorTool, RealmEditorConfig, RealmBatchEditPayload } from "./types";
import { CharacterModel, CHARACTER_SKINS, DEFAULT_CUSTOM_SKIN } from "./components/CharacterModel";
import { CharacterPreviewCard } from "./components/CharacterPreviewCard";
import { CatEasterEggs, CatEasterEggType } from "./components/CatEasterEggs";
import { BLOCK_NAMES, BLOCK_COLORS } from "./constants";
import { getBuildingSuggestion, askAICompanion, AICompanionChatAction } from "./services/geminiService";
import {
  resumeAudio,
  setUseProceduralMusic,
  getUseProceduralMusic,
  setCustomBackgroundMusicFile,
  playCustomBackgroundMusic,
  pauseCustomBackgroundMusic,
  setCustomBackgroundMusicVolume,
  getCustomBackgroundMusicVolume,
  getCustomMusicName,
  isCustomMusicPlaying,
  isCustomMusicLoaded,
  setMusicMode,
  setMusicContext,
  getCurrentMusicMode,
  getMusicTrackTitle,
  skipToNextTrack,
  MusicMode,
  playAttackSwingSound,
  playPlaceSound
} from "./services/audioService";
import { dict, Language } from "./dictionary";
import { useGameState, gameState } from "./store";
import {
  loadProfiles,
  saveProfiles,
  loadWorlds,
  saveWorlds,
  getActiveSession,
  setActiveSession as setActiveSessionPersistence,
  Profile,
  World
} from "./services/worldPersistence";
import {
  auth,
  db,
  loginWithGoogle,
  checkGoogleRedirectResult,
  formatGoogleAuthError,
  logoutGoogle,
  saveWorldToFirestore,
  loadWorldsFromFirestore,
  deleteWorldFromFirestore,
  batchUpdateWorldInFirestore,
  createRealmInFirestore,
  updateRealmInFirestore,
  deleteRealmFromFirestore,
  getRealmByCodeFromFirestore,
  handleFirestoreError,
  OperationType,
  isQuotaExceededError,
  isFirestoreWritePaused,
  markFirestoreQuotaExceeded,
  clearFirestoreQuotaPause,
  onFirestoreQuotaChange,
  FIRESTORE_QUOTA_CONSOLE_URL
} from "./services/firebaseService";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  getDocs,
  where,
  orderBy,
  limit,
  increment,
  updateDoc,
  deleteField,
  getDoc
} from "firebase/firestore";

interface CraftingRecipe {
  id: string;
  result: BlockType;
  resultCount: number;
  ingredients: { type: BlockType; count: number }[];
  requiresCraftingTable: boolean;
  category: "tools" | "utility" | "building";
  name: string;
}

const CRAFTING_RECIPES: CraftingRecipe[] = [
  // --- BÁSICOS Y ANTORCHAS ---
  {
    id: "wood_planks",
    result: BlockType.WOOD,
    resultCount: 4,
    ingredients: [{ type: BlockType.LOG, count: 1 }],
    requiresCraftingTable: false,
    category: "building",
    name: "Tablones de Madera",
  },
  {
    id: "crafting_table",
    result: BlockType.CRAFTING_TABLE,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 4 }],
    requiresCraftingTable: false,
    category: "utility",
    name: "Mesa de Crafteo",
  },
  {
    id: "coal_torches",
    result: BlockType.TORCH,
    resultCount: 4,
    ingredients: [
      { type: BlockType.WOOD, count: 1 },
      { type: BlockType.COAL_ORE, count: 1 }
    ],
    requiresCraftingTable: false,
    category: "utility",
    name: "Antorchas de Carbón",
  },
  {
    id: "wood_torches",
    result: BlockType.TORCH,
    resultCount: 2,
    ingredients: [
      { type: BlockType.WOOD, count: 1 },
      { type: BlockType.LOG, count: 1 }
    ],
    requiresCraftingTable: false,
    category: "utility",
    name: "Antorchas de Carbón Vegetal",
  },
  {
    id: "torches",
    result: BlockType.TORCH,
    resultCount: 4,
    ingredients: [
      { type: BlockType.WOOD, count: 1 },
      { type: BlockType.MUSHROOM_BROWN, count: 1 }
    ],
    requiresCraftingTable: false,
    category: "utility",
    name: "Antorchas de Champiñón",
  },
  {
    id: "sulfur_torches",
    result: BlockType.TORCH,
    resultCount: 8,
    ingredients: [
      { type: BlockType.WOOD, count: 1 },
      { type: BlockType.SULFUR, count: 1 }
    ],
    requiresCraftingTable: false,
    category: "utility",
    name: "Antorchas de Azufre Súper",
  },

  // --- HERRAMIENTAS Y ARMAS: MADERA ---
  {
    id: "wood_sword",
    result: BlockType.WOOD_SWORD,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 3 }],
    requiresCraftingTable: true,
    category: "tools",
    name: "Espada de Madera",
  },
  {
    id: "wood_pickaxe",
    result: BlockType.WOOD_PICKAXE,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 5 }],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pico de Madera",
  },
  {
    id: "axe",
    result: BlockType.AXE,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 4 }],
    requiresCraftingTable: true,
    category: "tools",
    name: "Hacha de Madera",
  },
  {
    id: "wood_shovel",
    result: BlockType.WOOD_SHOVEL,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 2 }],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pala de Madera",
  },

  // --- HERRAMIENTAS Y ARMAS: PIEDRA ---
  {
    id: "stone_sword",
    result: BlockType.STONE_SWORD,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 2 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Espada de Piedra",
  },
  {
    id: "pickaxe",
    result: BlockType.PICKAXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 3 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pico de Piedra",
  },
  {
    id: "stone_axe",
    result: BlockType.STONE_AXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 3 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Hacha de Piedra",
  },
  {
    id: "shovel",
    result: BlockType.SHOVEL,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 1 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pala de Piedra",
  },

  // --- HERRAMIENTAS Y ARMAS: HIERRO ---
  {
    id: "sword",
    result: BlockType.SWORD,
    resultCount: 1,
    ingredients: [
      { type: BlockType.IRON_ORE, count: 2 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Espada de Hierro",
  },
  {
    id: "iron_pickaxe",
    result: BlockType.IRON_PICKAXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.IRON_ORE, count: 3 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pico de Hierro",
  },
  {
    id: "iron_axe",
    result: BlockType.IRON_AXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.IRON_ORE, count: 3 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Hacha de Hierro",
  },
  {
    id: "iron_shovel",
    result: BlockType.IRON_SHOVEL,
    resultCount: 1,
    ingredients: [
      { type: BlockType.IRON_ORE, count: 1 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pala de Hierro",
  },

  // --- HERRAMIENTAS Y ARMAS: ORO ---
  {
    id: "gold_sword",
    result: BlockType.GOLD_SWORD,
    resultCount: 1,
    ingredients: [
      { type: BlockType.GOLD_ORE, count: 2 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Espada de Oro",
  },
  {
    id: "gold_pickaxe",
    result: BlockType.GOLD_PICKAXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.GOLD_ORE, count: 3 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pico de Oro",
  },
  {
    id: "gold_axe",
    result: BlockType.GOLD_AXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.GOLD_ORE, count: 3 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Hacha de Oro",
  },
  {
    id: "gold_shovel",
    result: BlockType.GOLD_SHOVEL,
    resultCount: 1,
    ingredients: [
      { type: BlockType.GOLD_ORE, count: 1 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pala de Oro",
  },

  // --- HERRAMIENTAS Y ARMAS: DIAMANTE ---
  {
    id: "diamond_sword",
    result: BlockType.DIAMOND_SWORD,
    resultCount: 1,
    ingredients: [
      { type: BlockType.DIAMOND_ORE, count: 2 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Espada de Diamante",
  },
  {
    id: "diamond_pickaxe",
    result: BlockType.DIAMOND_PICKAXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.DIAMOND_ORE, count: 3 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pico de Diamante",
  },
  {
    id: "diamond_axe",
    result: BlockType.DIAMOND_AXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.DIAMOND_ORE, count: 3 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Hacha de Diamante",
  },
  {
    id: "diamond_shovel",
    result: BlockType.DIAMOND_SHOVEL,
    resultCount: 1,
    ingredients: [
      { type: BlockType.DIAMOND_ORE, count: 1 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "tools",
    name: "Pala de Diamante",
  },

  // --- UTILIDAD ---
  {
    id: "bed",
    result: BlockType.BED,
    resultCount: 1,
    ingredients: [
      { type: BlockType.WOOD, count: 3 },
      { type: BlockType.FLOWER_RED, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "utility",
    name: "Cama Cómoda",
  },
  {
    id: "door",
    result: BlockType.DOOR,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 6 }],
    requiresCraftingTable: true,
    category: "utility",
    name: "Puerta de Madera",
  },
  {
    id: "furnace",
    result: BlockType.FURNACE,
    resultCount: 1,
    ingredients: [{ type: BlockType.STONE, count: 8 }],
    requiresCraftingTable: true,
    category: "utility",
    name: "Horno",
  },
  {
    id: "chest",
    result: BlockType.CHEST,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 8 }],
    requiresCraftingTable: true,
    category: "utility",
    name: "Cofre",
  },
  {
    id: "empty_bucket",
    result: BlockType.BUCKET_EMPTY,
    resultCount: 1,
    ingredients: [{ type: BlockType.IRON_ORE, count: 3 }],
    requiresCraftingTable: true,
    category: "utility",
    name: "Cubeta Metálica",
  },
  {
    id: "flint_and_steel",
    result: BlockType.FLINT_AND_STEEL,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 1 },
      { type: BlockType.IRON_ORE, count: 1 }
    ],
    requiresCraftingTable: false,
    category: "utility",
    name: "Encendedor",
  },
  {
    id: "jukebox",
    result: BlockType.JUKEBOX,
    resultCount: 1,
    ingredients: [
      { type: BlockType.WOOD, count: 8 },
      { type: BlockType.DIAMOND_ORE, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "utility",
    name: "Tocadiscos",
  },
  {
    id: "map",
    result: BlockType.MAP,
    resultCount: 1,
    ingredients: [
      { type: BlockType.PAPER, count: 4 },
      { type: BlockType.REDSTONE, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "utility",
    name: "Mapa",
  },
  {
    id: "locator_map",
    result: BlockType.LOCATOR_MAP,
    resultCount: 1,
    ingredients: [
      { type: BlockType.MAP, count: 1 },
      { type: BlockType.COPPER_BLOCK, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "utility",
    name: "Mapa Localizador",
  },
  {
    id: "cartography_table",
    result: BlockType.CARTOGRAPHY_TABLE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.WOOD, count: 4 },
      { type: BlockType.PAPER, count: 2 }
    ],
    requiresCraftingTable: true,
    category: "utility",
    name: "Mesa de Cartografía",
  },

  // --- CONSTRUCCIÓN Y MATERIALES ---
  {
    id: "obsidian",
    result: BlockType.OBSIDIAN,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 4 },
      { type: BlockType.LAVA, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "building",
    name: "Bloque de Obsidiana",
  },
  {
    id: "copper_block",
    result: BlockType.COPPER_BLOCK,
    resultCount: 1,
    ingredients: [{ type: BlockType.COPPER_ORE, count: 4 }],
    requiresCraftingTable: true,
    category: "building",
    name: "Bloque de Cobre",
  },
  {
    id: "oxidized_copper",
    result: BlockType.OXIDIZED_COPPER,
    resultCount: 1,
    ingredients: [
      { type: BlockType.COPPER_BLOCK, count: 1 },
      { type: BlockType.FLOWER_YELLOW, count: 1 }
    ],
    requiresCraftingTable: true,
    category: "building",
    name: "Bloque de Cobre Oxidado",
  },
  {
    id: "wool",
    result: BlockType.WOOL,
    resultCount: 1,
    ingredients: [{ type: BlockType.LEAVES, count: 4 }],
    requiresCraftingTable: false,
    category: "building",
    name: "Lana",
  },
  {
    id: "cushion",
    result: BlockType.CUSHION,
    resultCount: 1,
    ingredients: [
      { type: BlockType.WOOL, count: 2 },
      { type: BlockType.FLOWER_RED, count: 1 }
    ],
    requiresCraftingTable: false,
    category: "building",
    name: "Cojín",
  },
  {
    id: "wool_stairs",
    result: BlockType.WOOL_STAIRS,
    resultCount: 4,
    ingredients: [{ type: BlockType.WOOL, count: 6 }],
    requiresCraftingTable: true,
    category: "building",
    name: "Escaleras de Lana",
  },
  {
    id: "concrete",
    result: BlockType.CONCRETE,
    resultCount: 4,
    ingredients: [
      { type: BlockType.SAND, count: 2 },
      { type: BlockType.STONE, count: 2 }
    ],
    requiresCraftingTable: false,
    category: "building",
    name: "Concreto",
  },
  {
    id: "concrete_stairs",
    result: BlockType.CONCRETE_STAIRS,
    resultCount: 4,
    ingredients: [{ type: BlockType.CONCRETE, count: 6 }],
    requiresCraftingTable: true,
    category: "building",
    name: "Escaleras de Concreto",
  },
  {
    id: "paper",
    result: BlockType.PAPER,
    resultCount: 3,
    ingredients: [{ type: BlockType.SUGAR_CANE, count: 3 }],
    requiresCraftingTable: false,
    category: "building",
    name: "Papel",
  },
  {
    id: "sugar",
    result: BlockType.SUGAR,
    resultCount: 1,
    ingredients: [{ type: BlockType.SUGAR_CANE, count: 1 }],
    requiresCraftingTable: false,
    category: "building",
    name: "Azúcar",
  },
  {
    id: "redstone",
    result: BlockType.REDSTONE,
    resultCount: 4,
    ingredients: [{ type: BlockType.REDSTONE_ORE, count: 1 }],
    requiresCraftingTable: false,
    category: "building",
    name: "Redstone",
  }
];

const getUiToolMeta = (type: BlockType): {
  kind: "sword" | "pickaxe" | "axe" | "shovel";
  blade: string;
  hi: string;
} | null => {
  const tiers = {
    wood: { blade: "#b6895b", hi: "#e2ba8e" },
    stone: { blade: "#94a3b8", hi: "#cbd5e1" },
    iron: { blade: "#e2e8f0", hi: "#ffffff" },
    gold: { blade: "#facc15", hi: "#fef08a" },
    diamond: { blade: "#22d3ee", hi: "#a5f3fc" },
  };
  switch (type) {
    case BlockType.WOOD_SWORD: return { kind: "sword", ...tiers.wood };
    case BlockType.STONE_SWORD: return { kind: "sword", ...tiers.stone };
    case BlockType.SWORD: return { kind: "sword", ...tiers.iron };
    case BlockType.GOLD_SWORD: return { kind: "sword", ...tiers.gold };
    case BlockType.DIAMOND_SWORD: return { kind: "sword", ...tiers.diamond };
    case BlockType.WOOD_PICKAXE: return { kind: "pickaxe", ...tiers.wood };
    case BlockType.PICKAXE: return { kind: "pickaxe", ...tiers.stone };
    case BlockType.IRON_PICKAXE: return { kind: "pickaxe", ...tiers.iron };
    case BlockType.GOLD_PICKAXE: return { kind: "pickaxe", ...tiers.gold };
    case BlockType.DIAMOND_PICKAXE: return { kind: "pickaxe", ...tiers.diamond };
    case BlockType.AXE: return { kind: "axe", ...tiers.wood };
    case BlockType.STONE_AXE: return { kind: "axe", ...tiers.stone };
    case BlockType.IRON_AXE: return { kind: "axe", ...tiers.iron };
    case BlockType.GOLD_AXE: return { kind: "axe", ...tiers.gold };
    case BlockType.DIAMOND_AXE: return { kind: "axe", ...tiers.diamond };
    case BlockType.WOOD_SHOVEL: return { kind: "shovel", ...tiers.wood };
    case BlockType.SHOVEL: return { kind: "shovel", ...tiers.stone };
    case BlockType.IRON_SHOVEL: return { kind: "shovel", ...tiers.iron };
    case BlockType.GOLD_SHOVEL: return { kind: "shovel", ...tiers.gold };
    case BlockType.DIAMOND_SHOVEL: return { kind: "shovel", ...tiers.diamond };
    default: return null;
  }
};

const isUiToolBlock = (type: BlockType) => getUiToolMeta(type) !== null;

const ItemVisualBadge: React.FC<{ type: BlockType; className?: string }> = ({
  type,
  className = "w-full h-full",
}) => {
  const toolMeta = getUiToolMeta(type);
  if (toolMeta) {
    return (
      <div className={`${className} rounded-lg bg-zinc-950/90 border border-white/10 flex items-center justify-center p-1 shadow-inner`}>
        <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow" shapeRendering="crispEdges">
          {toolMeta.kind === "sword" && (
            <>
              <rect x="2" y="12" width="2" height="2" fill="#5c3a21" />
              <rect x="4" y="10" width="2" height="2" fill="#7c5230" />
              <rect x="3" y="8" width="2" height="2" fill="#4e342e" />
              <rect x="6" y="11" width="2" height="2" fill="#4e342e" />
              <rect x="5" y="9" width="2" height="2" fill={toolMeta.blade} />
              <rect x="7" y="7" width="2" height="2" fill={toolMeta.blade} />
              <rect x="9" y="5" width="2" height="2" fill={toolMeta.blade} />
              <rect x="11" y="3" width="2" height="2" fill={toolMeta.blade} />
              <rect x="12" y="2" width="2" height="2" fill={toolMeta.hi} />
              <rect x="7" y="7" width="1" height="1" fill={toolMeta.hi} />
              <rect x="9" y="5" width="1" height="1" fill={toolMeta.hi} />
            </>
          )}
          {toolMeta.kind === "pickaxe" && (
            <>
              <rect x="2" y="12" width="2" height="2" fill="#5c3a21" />
              <rect x="4" y="10" width="2" height="2" fill="#7c5230" />
              <rect x="6" y="8" width="2" height="2" fill="#7c5230" />
              <rect x="8" y="6" width="2" height="2" fill="#7c5230" />
              <rect x="4" y="2" width="8" height="2" fill={toolMeta.blade} />
              <rect x="11" y="3" width="2" height="8" fill={toolMeta.blade} />
              <rect x="2" y="3" width="2" height="2" fill={toolMeta.blade} />
              <rect x="10" y="10" width="2" height="2" fill={toolMeta.blade} />
              <rect x="5" y="2" width="6" height="1" fill={toolMeta.hi} />
            </>
          )}
          {toolMeta.kind === "axe" && (
            <>
              <rect x="2" y="12" width="2" height="2" fill="#5c3a21" />
              <rect x="4" y="10" width="2" height="2" fill="#7c5230" />
              <rect x="6" y="8" width="2" height="2" fill="#7c5230" />
              <rect x="8" y="6" width="2" height="2" fill="#7c5230" />
              <rect x="6" y="2" width="6" height="5" fill={toolMeta.blade} />
              <rect x="10" y="4" width="3" height="5" fill={toolMeta.blade} />
              <rect x="7" y="2" width="4" height="2" fill={toolMeta.hi} />
            </>
          )}
          {toolMeta.kind === "shovel" && (
            <>
              <rect x="2" y="12" width="2" height="2" fill="#5c3a21" />
              <rect x="4" y="10" width="2" height="2" fill="#7c5230" />
              <rect x="6" y="8" width="2" height="2" fill="#7c5230" />
              <rect x="8" y="3" width="5" height="5" fill={toolMeta.blade} />
              <rect x="10" y="2" width="4" height="3" fill={toolMeta.hi} />
            </>
          )}
        </svg>
      </div>
    );
  }

  if (type === BlockType.TORCH) {
    return (
      <div className={`${className} rounded-lg bg-zinc-950/90 border border-amber-500/40 flex items-center justify-center p-1 shadow-inner`}>
        <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow" shapeRendering="crispEdges">
          <rect x="5" y="1" width="6" height="4" fill="#ff7300" />
          <rect x="6" y="1" width="4" height="3" fill="#ffcf33" />
          <rect x="7" y="2" width="2" height="2" fill="#fffce0" />
          <rect x="6" y="5" width="4" height="2" fill="#2b1b12" />
          <rect x="6" y="7" width="4" height="8" fill="#6d4423" />
          <rect x="7" y="7" width="2" height="8" fill="#8b5a2b" />
        </svg>
      </div>
    );
  }

  if (type === BlockType.CRAFTING_TABLE) {
    return (
      <div className={`${className} rounded-lg bg-[#ab7d4d] border border-[#4e3315] grid grid-cols-3 grid-rows-3 gap-[1px] p-[2px] shadow-inner`}>
        {Array.from({ length: 9 }).map((_, idx) => (
          <div key={idx} className="bg-[#7b522c]/80 rounded-[1px]" />
        ))}
      </div>
    );
  }

  if (type === BlockType.FURNACE) {
    return (
      <div className={`${className} rounded-lg bg-[#607d8b] border border-zinc-800 flex flex-col items-center justify-between p-1.5 shadow-inner`}>
        <div className="w-3/4 h-1.5 bg-zinc-900 rounded-sm" />
        <div className="w-3/4 h-2.5 bg-orange-600/90 border border-zinc-900 rounded-sm shadow-inner" />
      </div>
    );
  }

  return (
    <div
      className={`${className} rounded-lg shadow-inner border border-white/10`}
      style={{ backgroundColor: BLOCK_COLORS[type] }}
    />
  );
};

// Nether Portal Frame and Blocks Validation Helpers
const isFrameValidX = (ix: number, iy: number, iz: number, getBlockAt: (x: number, y: number, z: number) => BlockType) => {
  const left0 = getBlockAt(ix - 1, iy, iz) === BlockType.OBSIDIAN;
  const left1 = getBlockAt(ix - 1, iy + 1, iz) === BlockType.OBSIDIAN;
  const left2 = getBlockAt(ix - 1, iy + 2, iz) === BlockType.OBSIDIAN;

  const right0 = getBlockAt(ix + 2, iy, iz) === BlockType.OBSIDIAN;
  const right1 = getBlockAt(ix + 2, iy + 1, iz) === BlockType.OBSIDIAN;
  const right2 = getBlockAt(ix + 2, iy + 2, iz) === BlockType.OBSIDIAN;

  const bottom0 = getBlockAt(ix, iy - 1, iz) === BlockType.OBSIDIAN;
  const bottom1 = getBlockAt(ix + 1, iy - 1, iz) === BlockType.OBSIDIAN;

  const top0 = getBlockAt(ix, iy + 3, iz) === BlockType.OBSIDIAN;
  const top1 = getBlockAt(ix + 1, iy + 3, iz) === BlockType.OBSIDIAN;

  return left0 && left1 && left2 && right0 && right1 && right2 && bottom0 && bottom1 && top0 && top1;
};

const isFrameValidZ = (ix: number, iy: number, iz: number, getBlockAt: (x: number, y: number, z: number) => BlockType) => {
  const left0 = getBlockAt(ix, iy, iz - 1) === BlockType.OBSIDIAN;
  const left1 = getBlockAt(ix, iy + 1, iz - 1) === BlockType.OBSIDIAN;
  const left2 = getBlockAt(ix, iy + 2, iz - 1) === BlockType.OBSIDIAN;

  const right0 = getBlockAt(ix, iy, iz + 2) === BlockType.OBSIDIAN;
  const right1 = getBlockAt(ix, iy + 1, iz + 2) === BlockType.OBSIDIAN;
  const right2 = getBlockAt(ix, iy + 2, iz + 2) === BlockType.OBSIDIAN;

  const bottom0 = getBlockAt(ix, iy - 1, iz) === BlockType.OBSIDIAN;
  const bottom1 = getBlockAt(ix, iy - 1, iz + 1) === BlockType.OBSIDIAN;

  const top0 = getBlockAt(ix, iy + 3, iz) === BlockType.OBSIDIAN;
  const top1 = getBlockAt(ix, iy + 3, iz + 1) === BlockType.OBSIDIAN;

  return left0 && left1 && left2 && right0 && right1 && right2 && bottom0 && bottom1 && top0 && top1;
};

const isPortalBlockValid = (px: number, py: number, pz: number, getBlockAt: (x: number, y: number, z: number) => BlockType) => {
  for (let dx = 0; dx <= 1; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      if (isFrameValidX(px - dx, py - dy, pz, getBlockAt)) {
        return true;
      }
    }
  }
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 2; dy++) {
      if (isFrameValidZ(px, py - dy, pz - dz, getBlockAt)) {
        return true;
      }
    }
  }
  return false;
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>("es");

  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  // Profiles loaded
  const [worlds, setWorlds] = useState<World[]>(() => loadWorlds());
  const resolveInitialDisplayUser = () => {
    const sess = getActiveSession();
    if (!sess) return null;
    try {
      const guestId = localStorage.getItem("minecraft_guest_id");
      const guestName = localStorage.getItem("minecraft_guest_name");
      if (guestId && sess === guestId && guestName) {
        return guestName;
      }
    } catch {}
    return sess;
  };
  const [currentUser, setCurrentUser] = useState<string | null>(() => resolveInitialDisplayUser());
  const [activeSession, setActiveSessionState] = useState<string | null>(() => getActiveSession());

  const setActiveSession = useCallback((val: string | null) => {
    setActiveSessionPersistence(val);
    setActiveSessionState(val);
  }, []);

  const [currentBlock, setCurrentBlock] = useState<BlockType>(BlockType.WOOD);
  const [noiseConfig, setNoiseConfig] = useState<NoiseConfig>(() => {
    const saved = localStorage.getItem("minecraft_noise_config");
    if (saved) {
      try {
        return { ...DEFAULT_NOISE_CONFIG, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_NOISE_CONFIG;
      }
    }
    return DEFAULT_NOISE_CONFIG;
  });
  const [perfConfig, setPerfConfig] = useState<PerformanceConfig>(() => {
    const safeDefault: PerformanceConfig = {
      renderDistance: 2,
      simulationDistance: 2,
      maxConcurrentChunks: 2,
      lightingQuality: "low",
      particlesEnabled: true,
      maxEntities: 15,
      effectsQuality: "low",
    };
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("minecraft_performance_config");
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            renderDistance: (parsed.renderDistance >= 1 && parsed.renderDistance <= 5) ? Number(parsed.renderDistance) : safeDefault.renderDistance,
            simulationDistance: (parsed.simulationDistance >= 1 && parsed.simulationDistance <= 4) ? Number(parsed.simulationDistance) : safeDefault.simulationDistance,
            maxConcurrentChunks: (parsed.maxConcurrentChunks >= 1 && parsed.maxConcurrentChunks <= 8) ? Number(parsed.maxConcurrentChunks) : safeDefault.maxConcurrentChunks,
            lightingQuality: (parsed.lightingQuality === "high" || parsed.lightingQuality === "low") ? parsed.lightingQuality : safeDefault.lightingQuality,
            particlesEnabled: typeof parsed.particlesEnabled === "boolean" ? parsed.particlesEnabled : safeDefault.particlesEnabled,
            maxEntities: (parsed.maxEntities >= 5 && parsed.maxEntities <= 50) ? Number(parsed.maxEntities) : safeDefault.maxEntities,
            effectsQuality: (parsed.effectsQuality === "high" || parsed.effectsQuality === "low") ? parsed.effectsQuality : safeDefault.effectsQuality,
          };
        }
      } catch (err) {
        console.warn("Failed to load performance config, using defaults", err);
      }
    }
    return safeDefault;
  });
  const [playerPos, setPlayerPos] = useState<Vector3D>({ x: 0, y: 80, z: 0 });
  const activePlayerPosRef = useRef<Vector3D>({ x: 0, y: 80, z: 0 });
  const moveVectorRef = useRef({ x: 0, y: 0 });
  const staticZeroMoveVector = useMemo(() => ({ x: 0, y: 0 }), []);
  const handleJoystickMove = useCallback((v: { x: number; y: number }) => {
    moveVectorRef.current.x = v.x;
    moveVectorRef.current.y = v.y;
  }, []);
  const handleJoystickEnd = useCallback(() => {
    moveVectorRef.current.x = 0;
    moveVectorRef.current.y = 0;
  }, []);
  const [aiCompanionConfig, setAiCompanionConfig] = useState<AICompanionConfig>(() => {
    try {
      const saved = localStorage.getItem("voxel_ai_companion");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          enabled: !!parsed.enabled,
          name: parsed.name || "Alex IA",
          skinId: parsed.skinId || "explorer",
          mode: parsed.mode || "follow",
        };
      }
    } catch {}
    return { enabled: false, name: "Alex IA", skinId: "explorer", mode: "follow" };
  });
  const [isCompanionPanelOpen, setIsCompanionPanelOpen] = useState(false);
  const [aiCompanionTpTrigger, setAiCompanionTpTrigger] = useState(0);
  const aiCompanionPosRef = useRef<Vector3D>({ x: 0, y: 80, z: 0 });
  const aiCompanionBagRef = useRef<Record<number, number>>({});
  const aiCompanionConfigRef = useRef(aiCompanionConfig);
  aiCompanionConfigRef.current = aiCompanionConfig;
  useEffect(() => {
    try {
      localStorage.setItem("voxel_ai_companion", JSON.stringify(aiCompanionConfig));
    } catch {}
  }, [aiCompanionConfig]);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"break" | "place">(
    "place",
  );
  const [buildBrush, setBuildBrush] = useState<"single" | "line3" | "wall3x2">("single");
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestion, setSuggestion] = useState<GeminiSuggestion | null>(null);
  const [appState, setAppState] = useState<"login-prompt" | "login" | "menu" | "settings" | "playing" | "worlds-list">(
    getActiveSession() ? "menu" : "login-prompt"
  );
  const [isJumping, setIsJumping] = useState(false);
  const [attackTrigger, setAttackTrigger] = useState(0);
  const [placeTrigger, setPlaceTrigger] = useState(0);
  const placeHoldTimerRef = useRef<any>(null);
  const pendingLocalEditsRef = useRef<Record<string, { value: BlockType; ts: number }>>({});
  const pendingLocalColorsRef = useRef<Record<string, { value: string | null; ts: number }>>({});
  const [isRealmEditorOpen, setIsRealmEditorOpen] = useState(false);
  const [realmEditorConfig, setRealmEditorConfig] = useState<RealmEditorConfig>({
    enabled: true,
    tool: "none",
    radius: 5,
    fillPercent: 100,
    replaceExisting: true,
    selectedColor: "#ff2a6d",
    applyColorToShapes: false,
    eraseColorMode: false,
    paintRadius: 1,
  });
  const [realmActionRequest, setRealmActionRequest] = useState<{
    seq: number;
    action: "place_front" | "paint_aimed" | "undo";
  } | null>(null);
  const [realmCanUndo, setRealmCanUndo] = useState(false);

  const handleAttack = useCallback(() => {
    resumeAudio();
    playAttackSwingSound();
    setAttackTrigger((prev) => prev + 1);
  }, []);

  const stopContinuousPlace = useCallback(() => {
    if (placeHoldTimerRef.current) {
      clearInterval(placeHoldTimerRef.current);
      clearTimeout(placeHoldTimerRef.current);
      placeHoldTimerRef.current = null;
    }
  }, []);

  const startContinuousPlace = useCallback(() => {
    resumeAudio();
    setPlaceTrigger((prev) => prev + 1);
    stopContinuousPlace();
    const t = setTimeout(() => {
      placeHoldTimerRef.current = setInterval(() => {
        setPlaceTrigger((prev) => prev + 1);
      }, 165);
    }, 220);
    placeHoldTimerRef.current = t;
  }, [stopContinuousPlace]);

  useEffect(() => () => stopContinuousPlace(), [stopContinuousPlace]);

  const [weather, setWeather] = useState<"clear" | "rain" | "snow" | "thunderstorm" | "snow_rain">("clear");
  const [dimension, setDimension] = useState<"overworld" | "nether">("overworld");
  const [isGameMenuOpen, setIsGameMenuOpen] = useState<boolean>(false);
  const [isCinemaMode, setIsCinemaMode] = useState<boolean>(false);

  // Background Music & Soundtrack Engine States
  const [musicFileName, setMusicFileName] = useState<string | null>(() => getCustomMusicName());
  const [musicVolume, setMusicVolume] = useState<number>(() => getCustomBackgroundMusicVolume());
  const [isMusicPlaying, setIsMusicPlayingState] = useState<boolean>(() => isCustomMusicPlaying());
  const [isProceduralActive, setIsProceduralActive] = useState<boolean>(() => getUseProceduralMusic());
  const [musicMode, setMusicModeState] = useState<MusicMode>(() => getCurrentMusicMode());
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string>(() => getMusicTrackTitle());

  useEffect(() => {
    if (appState === "playing") return;
    const timer = setInterval(() => {
      if (!document.hidden) {
        setCurrentTrackTitle(getMusicTrackTitle());
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [appState]);

  // Portal Teleportation cinematic & state
  const [isTeleporting, setIsTeleporting] = useState(false);

  // Friends & Multiplayer states
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [friendSearchEmail, setFriendSearchEmail] = useState("");
  const [joinWorldCodeInput, setJoinWorldCodeInput] = useState("");
  const [friendships, setFriendships] = useState<any[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<Record<string, any>>({});
  const [friendshipError, setFriendshipError] = useState("");
  const [friendshipSuccess, setFriendshipSuccess] = useState("");
  const [friendshipLoading, setFriendshipLoading] = useState(false);

  // Character skin & live pose tracking
  const [characterSkin, setCharacterSkin] = useState<CharacterSkinId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minecraft_character_skin") as CharacterSkinId | null;
      if (saved && CHARACTER_SKINS[saved]) return saved;
    }
    return "cyber";
  });
  const [customSkin, setCustomSkin] = useState<CustomCharacterConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("minecraft_custom_skin");
        if (raw) {
          return { ...DEFAULT_CUSTOM_SKIN, ...JSON.parse(raw) };
        }
      } catch {}
    }
    return DEFAULT_CUSTOM_SKIN;
  });
  const handleSelectSkin = useCallback((skin: CharacterSkinId) => {
    setCharacterSkin(skin);
    if (typeof window !== "undefined") {
      localStorage.setItem("minecraft_character_skin", skin);
    }
    const emailKey = auth.currentUser?.email?.toLowerCase();
    if (emailKey) {
      setDoc(doc(db, "user_roles", emailKey), { characterSkin: skin }, { merge: true }).catch(() => {});
    }
  }, []);
  const handleUpdateCustomSkin = useCallback((next: CustomCharacterConfig) => {
    setCustomSkin(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("minecraft_custom_skin", JSON.stringify(next));
    }
    const emailKey = auth.currentUser?.email?.toLowerCase();
    if (emailKey) {
      setDoc(doc(db, "user_roles", emailKey), { customSkin: next }, { merge: true }).catch(() => {});
    }
  }, []);
  const activePlayerPoseRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const multiplayerUserIdRef = useRef<string>("guest");
  const seenChatMessageIdsRef = useRef<Set<string>>(new Set());

  const handlePortalTeleport = useCallback(() => {
    setIsTeleporting(true);
    setTimeout(() => {
      setDimension((prev) => {
        const nextDim = prev === "overworld" ? "nether" : "overworld";
        if (nextDim === "nether") {
          setPlayerPos({ x: 0, y: 70, z: 0 });
        } else {
          setPlayerPos({ x: 0, y: 80, z: 0 });
        }
        return nextDim;
      });
      setTimeout(() => {
        setIsTeleporting(false);
      }, 1000);
    }, 1200);
  }, []);

  const [perspective, setPerspective] = useState<"first" | "second" | "third">(
    "first",
  );
  const [fov, setFov] = useState<number>(65);
  const [isZooming, setIsZooming] = useState<boolean>(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState<boolean>(false);
  const [ultraOptimization, setUltraOptimization] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 1024;
    }
    return false;
  });
  const [showCameraFlash, setShowCameraFlash] = useState<boolean>(false);
  const [flashOpacity, setFlashOpacity] = useState<number>(0);
  const [screenshotToast, setScreenshotToast] = useState<string | null>(null);
  const [firestoreQuotaPaused, setFirestoreQuotaPaused] = useState<boolean>(() => isFirestoreWritePaused());
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState<boolean>(false);
  const otherPlayersCountRef = useRef<number>(0);
  const queuedBlockPatchRef = useRef<{ worldId: string; patchFields: Record<string, any> } | null>(null);
  const blockPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveSignatureRef = useRef<string>("");

  useEffect(() => {
    const unsub = onFirestoreQuotaChange((paused) => {
      setFirestoreQuotaPaused(paused);
      if (paused) {
        setQuotaBannerDismissed(false);
      }
    });
    return unsub;
  }, []);
  const [devicePreset, setDevicePreset] = useState<"auto" | "redmi" | "funtouch" | "galaxy">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minecraft_device_preset");
      if (saved === "auto" || saved === "redmi" || saved === "funtouch" || saved === "galaxy") {
        return saved as "auto" | "redmi" | "funtouch" | "galaxy";
      }
    }
    return "auto";
  });
  const [webAutoRotateMode, setWebAutoRotateMode] = useState<"auto" | "landscape" | "portrait">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minecraft_web_autorotate");
      if (saved === "auto" || saved === "landscape" || saved === "portrait") {
        return saved;
      }
    }
    return "auto";
  });
  const [physicalViewport, setPhysicalViewport] = useState({
    width: typeof window !== "undefined" ? Math.round(window.visualViewport?.width || window.innerWidth) : 1280,
    height: typeof window !== "undefined" ? Math.round(window.visualViewport?.height || window.innerHeight) : 720,
  });
  const [sensorTiltDeg, setSensorTiltDeg] = useState<0 | 90 | -90 | null>(null);
  const [sensorStatus, setSensorStatus] = useState<"idle" | "active" | "needs_permission" | "unsupported">("idle");
  const { health, food, air, isInWater, isUnderwater, aquaticPerk, isRegenerating } = useGameState();

  // Active World
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);

  const isInWorldScene = (appState === "playing" || appState === "settings") && currentWorld !== null;
  useEffect(() => {
    setMusicContext(isInWorldScene ? "world" : "menu");
    setCurrentTrackTitle(getMusicTrackTitle());
  }, [isInWorldScene]);

  // New Custom States
  const [autoJumpEnabled, setAutoJumpEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minecraft_autojump");
      return saved !== "false";
    }
    return true;
  });
  const [userRole, setUserRole] = useState<string>("user");
  const [vipActive, setVipActive] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("minecraft_vip_active") === "true";
    }
    return false;
  });
  const [mvpActive, setMvpActive] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("minecraft_mvp_active") === "true";
    }
    return false;
  });
  const [unlockedWorldsPass, setUnlockedWorldsPass] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("minecraft_unlocked_worlds") === "true";
    }
    return false;
  });
  const [indefCoins, setIndefCoins] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("minecraft_indef_coins") ?? localStorage.getItem("minecraft_gold_coins");
      return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
    }
    return 0;
  });
  const [ownedShopItems, setOwnedShopItems] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("minecraft_owned_shop_items");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [purchaseHistory, setPurchaseHistory] = useState<Array<{
    id: string;
    productId: string;
    productName: string;
    price: number;
    currency?: string;
    paymentMethod?: string;
    timestamp: number;
    status: string;
    giftedBy?: string;
    giftNote?: string;
  }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("minecraft_purchase_history");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [biomeConfig, setBiomeConfig] = useState<{ surface: number; underground: number; flora: number } | null>(null);
  const [activePlayers, setActivePlayers] = useState<ActivePlayerInfo[]>([]);
  const [activityLogs, setActivityLogs] = useState<Array<{ id: string; playerEmail: string; playerName: string; action: string; timestamp: number }>>([]);
  const [allUserRolesList, setAllUserRolesList] = useState<Array<{ email: string; role: string; biomeSurface?: number; biomeUnderground?: number; biomeFlora?: number; blocksPlaced?: number; blocksBroken?: number; worldsCreated?: number; score?: number; displayName?: string; lastActive?: number; vipActive?: boolean; mvpActive?: boolean; unlockedWorldsPass?: boolean; indefCoins?: number; ownedShopItems?: string[] }>>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopCategory, setShopCategory] = useState<"all" | "indefs" | "passes" | "realms" | "skins" | "cosmetics" | "history">("all");
  const [selectedProduct, setSelectedProduct] = useState<
    | "indef_500"
    | "indef_1500"
    | "indef_4000"
    | "indef_10000"
    | "vip_pass"
    | "mvp_plus"
    | "aquatic_vip"
    | "unlocked_worlds"
    | "realm_basic"
    | "realm_plus"
    | "skin_dragon"
    | "skin_angel"
    | "skin_titan"
    | "skin_poseidon"
    | "skin_obsidian"
    | "kit_builder"
    | "kit_explorer_pro"
    | "kit_aquatic_starter"
    | "cape_royal"
    | null
  >(null);
  const [realmPlan, setRealmPlan] = useState<RealmPlanTier>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minecraft_realm_plan");
      if (saved === "basic" || saved === "plus") return saved;
    }
    return "none";
  });
  const [isRealmsOpen, setIsRealmsOpen] = useState(false);
  const [realmsTab, setRealmsTab] = useState<"my" | "join" | "plans" | "admin">("my");
  const [myRealms, setMyRealms] = useState<RealmData[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("minecraft_local_realms");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [joinedRealms, setJoinedRealms] = useState<RealmData[]>([]);
  const [allAdminRealms, setAllAdminRealms] = useState<RealmData[]>([]);
  const [selectedRealmId, setSelectedRealmId] = useState<string | null>(null);
  const [activeRealmId, setActiveRealmId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeRealmId) {
      setIsRealmEditorOpen(false);
      setRealmCanUndo(false);
      setRealmEditorConfig((prev) => (prev.tool === "none" ? prev : { ...prev, tool: "none" }));
    }
  }, [activeRealmId]);
  const realmEditorConfigForWorld = useMemo<RealmEditorConfig | undefined>(
    () => (activeRealmId ? { ...realmEditorConfig, enabled: true } : undefined),
    [activeRealmId, realmEditorConfig]
  );
  const [newRealmName, setNewRealmName] = useState("");
  const [newRealmTier, setNewRealmTier] = useState<"basic" | "plus">("basic");
  const [joinRealmCodeInput, setJoinRealmCodeInput] = useState("");
  const [inviteFriendEmailInput, setInviteFriendEmailInput] = useState("");
  const [realmWorldNameInput, setRealmWorldNameInput] = useState("");
  const [realmWorldMode, setRealmWorldMode] = useState<"survival" | "creative" | "adventure" | "spectator">("survival");
  const [realmWorldType, setRealmWorldType] = useState<"normal" | "flat" | "edge_farlands">("normal");
  const [realmStatusMsg, setRealmStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [realmLoading, setRealmLoading] = useState(false);
  const [lastDailyIndefClaim, setLastDailyIndefClaim] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return Math.max(0, Number(localStorage.getItem("minecraft_last_daily_indef") || 0) || 0);
    }
    return 0;
  });
  const [claimedWorldKits, setClaimedWorldKits] = useState<Record<string, boolean>>({});
  const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal" | "indefs" | null>(null);
  const [paymentStep, setPaymentStep] = useState<"idle" | "form" | "gift" | "processing" | "success">("idle");
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalPassword, setPaypalPassword] = useState("");
  const [giftRecipientEmail, setGiftRecipientEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftSearch, setGiftSearch] = useState("");
  const [shopCheckoutError, setShopCheckoutError] = useState("");
  const [lastReceiptSummary, setLastReceiptSummary] = useState<{ method: string; amountText: string } | null>(null);
  const [lastGiftSummary, setLastGiftSummary] = useState<{
    recipientEmail: string;
    productName: string;
    note: string;
    indefAdded: number;
  } | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [leaderboardToast, setLeaderboardToast] = useState<string | null>(null);

  useEffect(() => {
    gameState.setAquaticPerk(vipActive || mvpActive || ownedShopItems.includes("aquatic_vip"));
  }, [vipActive, mvpActive, ownedShopItems]);

  useEffect(() => {
    setClaimedWorldKits({});
  }, [currentWorld?.id]);
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const blocksPlacedRef = useRef(0);
  const blocksBrokenRef = useRef(0);

  const isBypassingWorldLimit = userRole === "owner" || userRole === "mod" || userRole === "staff" || userRole === "admin" || vipActive || mvpActive || unlockedWorldsPass;

  const [survivalInventory, setSurvivalInventory] = useState<Record<number, number>>({
    [BlockType.DIRT]: 16,
    [BlockType.WOOD]: 8,
    [BlockType.LOG]: 4,
    [BlockType.CRAFTING_TABLE]: 1,
  });
  const [inventoryTab, setInventoryTab] = useState<"items" | "crafting">("items");
  const [craftingCategory, setCraftingCategory] = useState<"all" | "tools" | "utility" | "building">("all");
  const [craftingSearch, setCraftingSearch] = useState<string>("");
  const [settingsSection, setSettingsSection] = useState<"game" | "graphics" | "audio" | "world" | "multiplayer">("game");
  const [inventoryCategory, setInventoryCategory] = useState<"all" | "building" | "nature" | "tools">("all");
  const [inventorySearch, setInventorySearch] = useState<string>("");

  const dimensionEdits = useMemo(() => {
    if (!currentWorld) return {};
    const edits: Record<string, number> = {};
    if (dimension === "nether") {
      for (const [key, value] of Object.entries(currentWorld.edits || {})) {
        if (key.startsWith("nether:")) {
          const rawKey = key.substring(7); // remove "nether:"
          edits[rawKey] = value;
        }
      }
    } else {
      for (const [key, value] of Object.entries(currentWorld.edits || {})) {
        if (!key.startsWith("nether:")) {
          edits[key] = value;
        }
      }
    }
    return edits;
  }, [currentWorld?.edits, dimension]);

  const dimensionBlockColors = useMemo(() => {
    if (!currentWorld?.blockColors) return {};
    const colors: Record<string, string> = {};
    if (dimension === "nether") {
      for (const [key, value] of Object.entries(currentWorld.blockColors)) {
        if (key.startsWith("nether:") && typeof value === "string") {
          colors[key.substring(7)] = value;
        }
      }
    } else {
      for (const [key, value] of Object.entries(currentWorld.blockColors)) {
        if (!key.startsWith("nether:") && typeof value === "string") {
          colors[key] = value;
        }
      }
    }
    return colors;
  }, [currentWorld?.blockColors, dimension]);

  // Chat & Commands State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<string[]>([
    "🎮 [Sistema] ¡Consola activa! Escribe mensajes o comandos.",
    "💡 Comandos de tiempo: /day, /night, /time set day, /time set night",
    "💡 Comandos rápidos: /heal para restaurar, /gamemode creative",
  ]);

  const executeCommand = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setChatMessages((prev) => [...prev, `[Tú] ${trimmed}`]);

    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).toLowerCase().split(" ");
      const cmd = parts[0];

      if (cmd === "day" || (cmd === "time" && parts[1] === "set" && parts[2] === "day")) {
        if (gameState.onTimeSet) {
          gameState.onTimeSet("day");
          setChatMessages((prev) => [...prev, "☀️ [Sistema] Tiempo establecido a: DÍA."]);
        } else {
          setChatMessages((prev) => [...prev, "❌ Controlador de tiempo no activado."]);
        }
      } else if (cmd === "night" || (cmd === "time" && parts[1] === "set" && parts[2] === "night")) {
        if (gameState.onTimeSet) {
          gameState.onTimeSet("night");
          setChatMessages((prev) => [...prev, "🌙 [Sistema] Tiempo establecido a: NOCHE."]);
        } else {
          setChatMessages((prev) => [...prev, "❌ Controlador de tiempo no activado."]);
        }
      } else if (cmd === "heal") {
        gameState.setHealth(20);
        gameState.setFood(20);
        setChatMessages((prev) => [...prev, "❤️ [Sistema] ¡Curación exitosa! Vida y comida restauradas."]);
      } else if (cmd === "gamemode" || cmd === "gm") {
        const mode = parts[1];
        if (mode === "creative" || mode === "c" || mode === "creativo") {
          if (currentWorld) {
            const updated = { ...currentWorld, gameMode: "creative" as const };
            setCurrentWorld(updated);
            gameState.gameMode = "creative";
            gameState.setHealth(20);
            gameState.setFood(20);
            setChatMessages((prev) => [...prev, "⚡ [Sistema] Modo cambiado a: CREATIVO."]);
            setWorlds((prev) => prev.map((w) => w.id === currentWorld.id ? { ...w, gameMode: "creative" as const } : w));
          }
        } else if (mode === "survival" || mode === "s" || mode === "supervivencia") {
          if (currentWorld) {
            const updated = { ...currentWorld, gameMode: "survival" as const };
            setCurrentWorld(updated);
            gameState.gameMode = "survival";
            setChatMessages((prev) => [...prev, "🪓 [Sistema] Modo cambiado a: SUPERVIVENCIA."]);
            setWorlds((prev) => prev.map((w) => w.id === currentWorld.id ? { ...w, gameMode: "survival" as const } : w));
          }
        } else if (mode === "spectator" || mode === "sp" || mode === "espectador") {
          if (currentWorld) {
            const updated = { ...currentWorld, gameMode: "spectator" as const };
            setCurrentWorld(updated);
            gameState.gameMode = "spectator";
            gameState.setHealth(20);
            gameState.setFood(20);
            setChatMessages((prev) => [...prev, "👻 [Sistema] Modo cambiado a: ESPECTADOR."]);
            setWorlds((prev) => prev.map((w) => w.id === currentWorld.id ? { ...w, gameMode: "spectator" as const } : w));
          }
        } else {
          setChatMessages((prev) => [...prev, "❌ Comandos válidos: /gamemode [creative | survival | spectator]"]);
        }
      } else if (cmd === "tp" || cmd === "teleport") {
        const dest = parts[1];
        if (dest === "edge" || dest === "farlands" || dest === "edge_farlands") {
          const targetPos = { x: 1530, y: 110, z: 1530 };
          setPlayerPos(targetPos);
          activePlayerPosRef.current = targetPos;
          setChatMessages((prev) => [...prev, "🌀 [Sistema] Teletransportado a Edge Farlands (X: 1530, Y: 110, Z: 1530)."]);
        } else {
          // Check if destination matches an online player name first
          const targetQuery = (parts.slice(1).join(" ") || "").trim().toLowerCase();
          const matchedPlayer = targetQuery
            ? activePlayers.find((p) => p.name.toLowerCase() === targetQuery || p.name.toLowerCase().includes(targetQuery))
            : undefined;
          if (matchedPlayer) {
            const targetPos = {
              x: matchedPlayer.pos.x + 1.5,
              y: matchedPlayer.pos.y + 0.5,
              z: matchedPlayer.pos.z + 1.5,
            };
            if (matchedPlayer.dimension && matchedPlayer.dimension !== dimension) {
              setDimension(matchedPlayer.dimension as "overworld" | "nether");
            }
            setPlayerPos(targetPos);
            activePlayerPosRef.current = targetPos;
            setChatMessages((prev) => [...prev, `🌀 [Sistema] Teletransportado junto a ${matchedPlayer.name}.`]);
          } else {
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);
            if (!isNaN(x) && !isNaN(z)) {
              const finalY = isNaN(y) ? 90 : y;
              const targetPos = { x, y: finalY, z };
              setPlayerPos(targetPos);
              activePlayerPosRef.current = targetPos;
              setChatMessages((prev) => [...prev, `🌀 [Sistema] Teletransportado a X: ${x.toFixed(0)}, Y: ${finalY.toFixed(0)}, Z: ${z.toFixed(0)}`]);
            } else {
              setChatMessages((prev) => [
                ...prev,
                "❌ Sintaxis: /tp edge_farlands | /tp [Jugador] | /tp [X] [Y] [Z]"
              ]);
            }
          }
        }
      } else if (
        cmd === "ai" ||
        cmd === "amigo" ||
        cmd === "companion" ||
        cmd === "bot"
      ) {
        const sub = (parts[1] || "").toLowerCase();
        if (!sub || sub === "on" || sub === "invocar" || sub === "activar") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] ¡Aquí estoy! Listo para jugar contigo.`]);
        } else if (sub === "off" || sub === "quitar" || sub === "desactivar") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: false }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] ¡Nos vemos pronto!`]);
        } else if (sub === "follow" || sub === "seguir") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: "follow" }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] Te sigo de cerca.`]);
        } else if (sub === "gather" || sub === "mine" || sub === "minar" || sub === "talar") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: "gather" }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] ⛏️ ¡Voy a minar y talar recursos!`]);
        } else if (sub === "build" || sub === "construir" || sub === "casa") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: "build" }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] 🏠 ¡Construyendo un refugio cercano!`]);
        } else if (sub === "guard" || sub === "proteger" || sub === "atacar") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: "guard" }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] ⚔️ ¡Espada lista para protegerte!`]);
        } else if (sub === "explore" || sub === "explorar") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: "explore" }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] 🧭 ¡A explorar los alrededores!`]);
        } else if (sub === "stay" || sub === "esperar") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: "stay" }));
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] 🛑 Me quedo aquí.`]);
        } else if (sub === "tp" || sub === "ven") {
          setAiCompanionConfig((prev) => ({ ...prev, enabled: true }));
          setAiCompanionTpTrigger((t) => t + 1);
          setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name}] ¡Voy hacia ti!`]);
        } else if (sub === "dar" || sub === "share" || sub === "bloques") {
          handleShareCompanionBag();
        } else {
          triggerCompanionReply(parts.slice(1).join(" "));
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          `❌ Comando desconocido "/${cmd}". Intenta: /day, /night, /heal, /gamemode creative, /ai`
        ]);
      }
    } else {
      if (currentWorld && db && !isFirestoreWritePaused()) {
        const senderId = multiplayerUserIdRef.current || activeSession || "guest";
        const senderName = googleUser ? (googleUser.displayName || googleUser.email || "Jugador") : (currentUser || "Invitado");
        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        seenChatMessageIdsRef.current.add(msgId);
        setDoc(doc(db, "worlds", currentWorld.id, "messages", msgId), {
          id: msgId,
          senderId,
          senderName,
          text: trimmed,
          timestamp: Date.now(),
        }).catch((err) => {
          if (isQuotaExceededError(err)) {
            markFirestoreQuotaExceeded(err);
          } else {
            console.warn("Error sending world chat message:", err);
          }
        });
      }
      if (aiCompanionConfigRef.current.enabled) {
        triggerCompanionReply(trimmed);
      } else if (activePlayers.length === 0) {
        setChatMessages((prev) => [...prev, "💬 [Chat] Mensaje guardado en el chat del mundo. ¡Comparte el Código del Mundo o activa a tu Amigo IA!"]);
      }
    }
  };

  const handleShareCompanionBag = useCallback(() => {
    const bag = aiCompanionBagRef.current;
    const entries = Object.entries(bag).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      setChatMessages((prev) => [
        ...prev,
        `🤖 [${aiCompanionConfigRef.current.name}] 🎒 Aún no tengo bloques en mi mochila. ¡Ponme en modo Minar para recolectar!`,
      ]);
      return;
    }
    setSurvivalInventory((prev) => {
      const next = { ...prev };
      for (const [blkStr, qty] of entries) {
        const blkId = Number(blkStr);
        next[blkId] = (next[blkId] || 0) + qty;
      }
      return next;
    });
    const summary = entries
      .slice(0, 5)
      .map(([blkStr, qty]) => `${qty}x ${BLOCK_NAMES[Number(blkStr)] || "Bloque"}`)
      .join(", ");
    aiCompanionBagRef.current = {};
    setChatMessages((prev) => [
      ...prev,
      `🎁 [${aiCompanionConfigRef.current.name}] ¡Toma lo que conseguí!: ${summary}`,
    ]);
  }, []);

  const applyCompanionAction = useCallback((action: AICompanionChatAction) => {
    if (action === "none") return;
    if (action === "share") {
      handleShareCompanionBag();
      return;
    }
    if (action === "tp_to_player") {
      setAiCompanionConfig((prev) => ({ ...prev, enabled: true }));
      setAiCompanionTpTrigger((t) => t + 1);
      return;
    }
    setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: action }));
  }, [handleShareCompanionBag]);

  const triggerCompanionReply = useCallback(async (message: string) => {
    const cfg = aiCompanionConfigRef.current;
    const bag = aiCompanionBagRef.current;
    const gatheredTotal = Object.values(bag).reduce((acc, v) => acc + (v || 0), 0);
    const res = await askAICompanion(message, {
      companionName: cfg.name || "Alex IA",
      mode: cfg.mode,
      gatheredTotal,
      isNight: false,
      altitude: activePlayerPosRef.current.y,
      nearbyHostiles: 0,
      lang: lang === "en" ? "en" : "es",
    });
    applyCompanionAction(res.action);
    if (res.action !== "share") {
      setChatMessages((prev) => [...prev, `🤖 [${cfg.name || "Alex IA"}] ${res.reply}`]);
    }
  }, [lang, applyCompanionAction]);

  const handleCompanionBuildComplete = useCallback(() => {
    setAiCompanionConfig((prev) => (prev.mode === "build" ? { ...prev, mode: "follow" } : prev));
  }, []);

  const handleCompanionSpeak = useCallback((msg: string) => {
    setChatMessages((prev) => [...prev, `🤖 [${aiCompanionConfigRef.current.name || "Alex IA"}] ${msg}`]);
  }, []);
  const [isCraftingTableActive, setIsCraftingTableActive] = useState<boolean>(false);
  const [isFurnaceOpen, setIsFurnaceOpen] = useState<boolean>(false);
  const [isCartographyOpen, setIsCartographyOpen] = useState<boolean>(false);
  const [isChestOpen, setIsChestOpen] = useState<boolean>(false);
  const [isMapOpen, setIsMapOpen] = useState<boolean>(false);

  // Chest storage state
  const [chestInventory, setChestInventory] = useState<Record<number, number>>({
    [BlockType.DIRT]: 8,
    [BlockType.STONE]: 4,
    [BlockType.WOOD]: 2
  });

  // Furnace smelting states
  const [furnaceInput, setFurnaceInput] = useState<BlockType | null>(null);
  const [furnaceInputCount, setFurnaceInputCount] = useState<number>(0);
  const [furnaceFuel, setFurnaceFuel] = useState<BlockType | null>(null);
  const [furnaceFuelCount, setFurnaceFuelCount] = useState<number>(0);
  const [furnaceOutput, setFurnaceOutput] = useState<BlockType | null>(null);
  const [furnaceOutputCount, setFurnaceOutputCount] = useState<number>(0);
  const [furnaceProgress, setFurnaceProgress] = useState<number>(0);

  const getSmeltingResult = (input: BlockType): BlockType | null => {
    if (input === BlockType.STONE) return BlockType.CONCRETE;
    if (input === BlockType.SAND) return BlockType.TERRACOTTA_WHITE;
    if (input === BlockType.IRON_ORE) return BlockType.COPPER_BLOCK;
    if (input === BlockType.LOG) return BlockType.TORCH;
    if (input === BlockType.SUGAR_CANE) return BlockType.SUGAR;
    return null;
  };

  const isFurnaceFuel = (fuel: BlockType): boolean => {
    return fuel === BlockType.LOG || fuel === BlockType.WOOD || fuel === BlockType.COAL_ORE || fuel === BlockType.LAVA || fuel === BlockType.SOUL_SAND;
  };
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("wood_planks");
  const [worldSearchQuery, setWorldSearchQuery] = useState("");

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [touchControlsMode, setTouchControlsMode] = useState<"auto" | "yes" | "no">("auto");

  const MENU_SPLASHES = useMemo(() => [
    "¡60 FPS Ultra Optimizado!",
    "¡Panorámica 3D en tiempo real!",
    "¡Con Iron Golem y Endermans!",
    "¡Bioma de Cerezo y Bosque Oscuro!",
    "¡Mundos infinitos en tu móvil!",
    "¡Aldeas con cofres y hornos!",
    "¡100% Voxel 3D sin lag!"
  ], []);
  const [splashIndex, setSplashIndex] = useState(0);
  const [activeCatEasterEgg, setActiveCatEasterEgg] = useState<CatEasterEggType>(null);
  const titleTapRef = useRef<{ count: number; lastAt: number; nextEgg: "spinning" | "crying" }>({
    count: 0,
    lastAt: 0,
    nextEgg: "spinning",
  });
  const splashTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });

  useEffect(() => {
    if (appState !== "menu" && appState !== "login-prompt") return;
    const id = setInterval(() => {
      if (!document.hidden) {
        setSplashIndex((prev) => (prev + 1) % MENU_SPLASHES.length);
      }
    }, 6000);
    return () => clearInterval(id);
  }, [appState, MENU_SPLASHES.length]);

  const handleTitleEasterEggTap = useCallback(() => {
    resumeAudio();
    const now = Date.now();
    const state = titleTapRef.current;
    if (now - state.lastAt > 2000) {
      state.count = 0;
    }
    state.count += 1;
    state.lastAt = now;
    if (state.count >= 3) {
      state.count = 0;
      const triggered = state.nextEgg;
      state.nextEgg = triggered === "spinning" ? "crying" : "spinning";
      setActiveCatEasterEgg(triggered);
    }
  }, []);

  const handleSplashEasterEggTap = useCallback(() => {
    resumeAudio();
    setSplashIndex((prev) => (prev + 1) % MENU_SPLASHES.length);
    const now = Date.now();
    const sState = splashTapRef.current;
    if (now - sState.lastAt > 2000) {
      sState.count = 0;
    }
    sState.count += 1;
    sState.lastAt = now;
    if (sState.count >= 3) {
      sState.count = 0;
      setActiveCatEasterEgg("crying");
    }
  }, [MENU_SPLASHES.length]);

  const showTouchControls = 
    touchControlsMode === "yes" 
      ? true 
      : touchControlsMode === "no" 
        ? false 
        : (isTouchDevice || isSmallScreen);

  const physIsLandscape = physicalViewport.width > physicalViewport.height;
  const virtualRotationDeg: 0 | 90 | -90 = (() => {
    if (webAutoRotateMode === "landscape") {
      if (physIsLandscape) return 0;
      return sensorTiltDeg === -90 ? -90 : 90;
    }
    if (webAutoRotateMode === "portrait") {
      return physIsLandscape ? 90 : 0;
    }
    if (!physIsLandscape && (isTouchDevice || physicalViewport.width <= 900) && (sensorTiltDeg === 90 || sensorTiltDeg === -90)) {
      return sensorTiltDeg;
    }
    return 0;
  })();

  const screenSize = (() => {
    const effW = Math.max(1, virtualRotationDeg !== 0 ? physicalViewport.height : physicalViewport.width);
    const effH = Math.max(1, virtualRotationDeg !== 0 ? physicalViewport.width : physicalViewport.height);
    return {
      width: effW,
      height: effH,
      aspectRatio: effW / (effH || 1),
    };
  })();

  const activeDevice = (() => {
    if (devicePreset !== "auto") return devicePreset;
    const ratio = screenSize.aspectRatio;

    // Landscape or Portrait 5:3 (Redmi Pad SE 8.7: 1340 x 800)
    if ((ratio >= 1.55 && ratio <= 1.75) || (ratio >= 0.55 && ratio <= 0.65)) {
      return "redmi";
    }
    // Landscape or Portrait 3:2 / 4:3 (Funtouch Tablet)
    if ((ratio >= 1.2 && ratio < 1.55) || (ratio >= 0.64 && ratio <= 0.83)) {
      return "funtouch";
    }
    // Landscape or Portrait 20:9 (Galaxy A23)
    if (ratio >= 1.95 || ratio <= 0.52) {
      return "galaxy";
    }
    return "auto"; // Default / standard
  })();

  const isPortrait = screenSize.height > screenSize.width && screenSize.width < 900;
  const isCompactHeight = screenSize.height < 640;
  const isVeryCompactHeight = screenSize.height < 460;
  const isCompactWidth = screenSize.width < 820;
  const useCompactUI = isCompactHeight || isCompactWidth;
  const autoMinDim = Math.min(screenSize.width, screenSize.height);
  const autoJoystickPx = Math.round(Math.max(72, Math.min(144, autoMinDim * (isPortrait ? 0.21 : 0.22))));
  const autoHotbarScaleClass = isPortrait
    ? (screenSize.width < 370 ? "scale-[0.82] origin-bottom" : "scale-[0.90] origin-bottom")
    : (isVeryCompactHeight ? "scale-[0.76] origin-bottom" : useCompactUI ? "scale-[0.84] origin-bottom" : "scale-100 origin-bottom");

  const uiScaleConfig = (() => {
    switch (activeDevice) {
      case "redmi":
        return {
          name: "Redmi Pad SE 8.7 (5:3)",
          joystickSize: isPortrait ? 84 : (useCompactUI ? (screenSize.height < 450 ? 88 : 100) : 135),
          jumpButtonSize: isPortrait ? "w-10 h-10" : (useCompactUI ? (screenSize.height < 450 ? "w-10 h-10" : "w-11 h-11") : "w-16 h-16"),
          hotbarScale: isPortrait ? "scale-[0.92] origin-bottom" : (useCompactUI ? "scale-[0.82] origin-bottom" : "scale-[1.08] origin-bottom"),
          controlPadding: isPortrait ? "px-2 pb-2 pt-0.5" : (useCompactUI ? "px-2.5 pb-1.5 pt-0.5" : "px-6 pb-4 pt-2"),
          marginClass: useCompactUI ? "mb-1 mx-2 px-1" : "mb-3 mx-4 px-2",
          gapClass: useCompactUI ? "gap-1.5" : "gap-4",
          fontSize: "text-[10px]",
          badge: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
          desc: "Redmi Pad SE 8.7 (Pantalla compacta 5:3 / 1.67)",
          containerPadding: useCompactUI ? "p-2" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-2" : "p-3.5",
          statsTitle: useCompactUI ? "text-xs sm:text-sm" : "text-lg",
          statsText: useCompactUI ? "text-[8px]" : "text-[9px]",
          btnSize: useCompactUI ? "w-8 h-8 sm:w-9 sm:h-9" : "w-11 h-11",
          btnIcon: useCompactUI ? "text-xs" : "text-base",
        };
      case "funtouch":
        return {
          name: "Funtouch OS 15 (3:2)",
          joystickSize: isPortrait ? 88 : (useCompactUI ? (screenSize.height < 450 ? 92 : 108) : 150),
          jumpButtonSize: isPortrait ? "w-10 h-10" : (useCompactUI ? "w-11 h-11" : "w-16 h-16"),
          hotbarScale: isPortrait ? "scale-[0.94] origin-bottom" : (useCompactUI ? "scale-[0.85] origin-bottom" : "scale-[1.12] origin-bottom"),
          controlPadding: isPortrait ? "px-2.5 pb-2 pt-0.5" : (useCompactUI ? "px-3 pb-2 pt-0.5" : "px-8 pb-5 pt-2"),
          marginClass: useCompactUI ? "mb-1.5 mx-3 px-1.5" : "mb-4 mx-6 px-3",
          gapClass: useCompactUI ? "gap-2" : "gap-5",
          fontSize: "text-xs",
          badge: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
          desc: "Funtouch OS 15 Tablet (Pantalla grande 3:2 / 1.50)",
          containerPadding: useCompactUI ? "p-2" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-2.5" : "p-3.5",
          statsTitle: useCompactUI ? "text-sm sm:text-base" : "text-lg",
          statsText: useCompactUI ? "text-[8.5px]" : "text-xs",
          btnSize: useCompactUI ? "w-9 h-9 sm:w-10 sm:h-10" : "w-11 h-11",
          btnIcon: useCompactUI ? "text-sm" : "text-base",
        };
      case "galaxy":
        return {
          name: "Galaxy A23 (20:9)",
          joystickSize: isPortrait ? 80 : (useCompactUI ? 86 : 120),
          jumpButtonSize: isPortrait ? "w-9.5 h-9.5" : (useCompactUI ? "w-9.5 h-9.5 sm:w-10 sm:h-10" : "w-14 h-14"),
          hotbarScale: isPortrait ? "scale-[0.88] origin-bottom" : (useCompactUI ? "scale-[0.78] origin-bottom" : "scale-[0.92] origin-bottom"),
          controlPadding: isPortrait ? "px-2 pb-2 pt-0.5" : (useCompactUI ? "px-2.5 pb-1.5 pt-0.5" : "px-10 pb-4 pt-1"),
          marginClass: useCompactUI ? "mb-0.5 mx-2 px-0.5" : "mb-2 mx-6 px-1",
          gapClass: useCompactUI ? "gap-1.5" : "gap-3",
          fontSize: "text-[9px]",
          badge: "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30",
          desc: "Galaxy A23 (Ultra panorámico 20:9 / 2.22)",
          containerPadding: useCompactUI ? "p-1.5 sm:p-2" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-2" : "p-3.5",
          statsTitle: useCompactUI ? "text-xs" : "text-base",
          statsText: useCompactUI ? "text-[8px]" : "text-[9px]",
          btnSize: useCompactUI ? "w-8 h-8" : "w-11 h-11",
          btnIcon: useCompactUI ? "text-[11px]" : "text-base",
        };
      default:
        return {
          name: "Adaptable Auto",
          joystickSize: autoJoystickPx,
          jumpButtonSize: isPortrait || isVeryCompactHeight ? "w-10 h-10" : (useCompactUI ? "w-11 h-11" : "w-14 h-14"),
          hotbarScale: autoHotbarScaleClass,
          controlPadding: isPortrait ? "px-2 pb-2 pt-0.5" : (useCompactUI ? "px-2.5 pb-1.5 pt-0.5" : "px-6 pb-4 pt-2"),
          marginClass: useCompactUI ? "mb-1 mx-2 px-1" : "mb-3 mx-4 px-2",
          gapClass: useCompactUI ? "gap-1.5" : "gap-4",
          fontSize: "text-[10px]",
          badge: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
          desc: "Estándar auto-adaptable fluido a cualquier pantalla",
          containerPadding: useCompactUI ? "p-1.5 sm:p-2" : "p-4 md:p-6",
          statsPadding: isVeryCompactHeight ? "p-1.5" : useCompactUI ? "p-2" : "p-3.5",
          statsTitle: useCompactUI ? "text-xs sm:text-sm" : "text-lg",
          statsText: useCompactUI ? "text-[8px]" : "text-[9px]",
          btnSize: isVeryCompactHeight ? "w-8 h-8" : useCompactUI ? "w-8 h-8 sm:w-9 sm:h-9" : "w-11 h-11",
          btnIcon: useCompactUI ? "text-xs" : "text-base",
        };
    }
  })();

  useEffect(() => {
    const checkTouchAndSize = () => {
      const hasTouch = 
        'ontouchstart' in window || 
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || 
        ((navigator as any).msMaxTouchPoints && (navigator as any).msMaxTouchPoints > 0) ||
        (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1) ||
        ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0) ||
        window.matchMedia('(pointer: coarse)').matches;
      setIsTouchDevice(hasTouch);
      const vw = Math.round(window.visualViewport?.width || window.innerWidth);
      const vh = Math.round(window.visualViewport?.height || window.innerHeight);
      // Modern tablet landscape screens and larger widths can also run touch modes
      setIsSmallScreen(vw <= 1280 || vh <= 1280);
      
      setPhysicalViewport((prev) => {
        if (prev.width === vw && prev.height === vh) return prev;
        return { width: vw, height: vh };
      });
    };

    let t1: ReturnType<typeof setTimeout> | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    const handleOrientationOrResize = () => {
      checkTouchAndSize();
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        checkTouchAndSize();
      });
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
      t1 = setTimeout(checkTouchAndSize, 90);
      t2 = setTimeout(() => {
        checkTouchAndSize();
        window.scrollTo(0, 0);
      }, 260);
    };

    checkTouchAndSize();
    window.addEventListener("resize", handleOrientationOrResize);
    window.addEventListener("orientationchange", handleOrientationOrResize);
    window.visualViewport?.addEventListener("resize", handleOrientationOrResize);
    try {
      (window.screen as any)?.orientation?.addEventListener?.("change", handleOrientationOrResize);
    } catch {}
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
      window.removeEventListener("resize", handleOrientationOrResize);
      window.removeEventListener("orientationchange", handleOrientationOrResize);
      window.visualViewport?.removeEventListener("resize", handleOrientationOrResize);
      try {
        (window.screen as any)?.orientation?.removeEventListener?.("change", handleOrientationOrResize);
      } catch {}
    };
  }, []);

  // Hardware Accelerometer/Gyroscope auto-rotation listener (works on mobile browsers even when OS Auto-Rotate is locked)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isTouchDevice && physicalViewport.width > 900) return;

    const dmReq = (window as any).DeviceMotionEvent?.requestPermission;
    const doReq = (window as any).DeviceOrientationEvent?.requestPermission;
    if (typeof dmReq === "function" || typeof doReq === "function") {
      setSensorStatus((prev) => (prev === "active" ? prev : "needs_permission"));
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let candidateTilt: 0 | 90 | -90 | null = null;
    let candidateSince = 0;
    let lastMotionEventAt = 0;

    const commitCandidate = (nextTilt: 0 | 90 | -90) => {
      const now = Date.now();
      if (candidateTilt !== nextTilt) {
        candidateTilt = nextTilt;
        candidateSince = now;
        return;
      }
      if (now - candidateSince >= 300) {
        setSensorTiltDeg((prev) => (prev === nextTilt ? prev : nextTilt));
      }
    };

    const handleDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.x === undefined || acc.y === undefined) return;
      lastMotionEventAt = Date.now();
      setSensorStatus("active");
      const gx = acc.x;
      const gy = acc.y;
      const gz = acc.z ?? 0;
      // Ignore flat table resting posture
      if (Math.abs(gz) > 8.6 && Math.hypot(gx, gy) < 3.6) return;

      if (Math.abs(gx) > 5.8 && Math.abs(gy) < 4.5) {
        const deg: 90 | -90 = isIOS ? (gx < 0 ? 90 : -90) : (gx > 0 ? 90 : -90);
        commitCandidate(deg);
      } else if (Math.abs(gy) > 6.2 && Math.abs(gx) < 4.2) {
        commitCandidate(0);
      }
    };

    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      // Prefer devicemotion if actively firing; fallback to beta/gamma otherwise
      if (Date.now() - lastMotionEventAt < 800) return;
      if (typeof e.beta !== "number" || typeof e.gamma !== "number") return;
      setSensorStatus("active");
      const absBeta = Math.abs(e.beta);
      const absGamma = Math.abs(e.gamma);
      if (absBeta < 38 && absGamma > 48) {
        commitCandidate(e.gamma < 0 ? 90 : -90);
      } else if (absBeta > 48 && absGamma < 35) {
        commitCandidate(0);
      }
    };

    window.addEventListener("devicemotion", handleDeviceMotion);
    window.addEventListener("deviceorientation", handleDeviceOrientation);
    return () => {
      window.removeEventListener("devicemotion", handleDeviceMotion);
      window.removeEventListener("deviceorientation", handleDeviceOrientation);
    };
  }, [isTouchDevice, physicalViewport.width]);

  const applyMobileRotationSelection = useCallback((mode: "auto" | "landscape" | "portrait", tryFullscreen = true) => {
    setWebAutoRotateMode(mode);
    try {
      localStorage.setItem("minecraft_web_autorotate", mode);
    } catch {}
    if (mode !== "auto") {
      setSensorTiltDeg(null);
    }

    // Request iOS 13+ sensor permissions synchronously inside user gesture
    try {
      const dm = (window as any).DeviceMotionEvent;
      if (dm && typeof dm.requestPermission === "function") {
        dm.requestPermission()
          .then((res: string) => {
            if (res === "granted") setSensorStatus("active");
          })
          .catch(() => {});
      }
      const dor = (window as any).DeviceOrientationEvent;
      if (dor && typeof dor.requestPermission === "function") {
        dor.requestPermission()
          .then((res: string) => {
            if (res === "granted") setSensorStatus("active");
          })
          .catch(() => {});
      }
    } catch {}

    // Attempt native browser Fullscreen + screen.orientation lock (supported on Android Chrome)
    if (typeof window !== "undefined") {
      const screenOrientation = (window.screen as any)?.orientation;
      const docEl = document.documentElement as any;
      const applyLock = () => {
        if (!screenOrientation) return;
        try {
          if (mode === "auto") {
            screenOrientation.unlock?.();
          } else {
            screenOrientation.lock?.(mode)?.catch?.(() => {});
          }
        } catch {}
      };

      if (tryFullscreen && mode !== "auto" && !document.fullscreenElement && docEl?.requestFullscreen) {
        try {
          const fsPromise = docEl.requestFullscreen({ navigationUI: "hide" });
          if (fsPromise && typeof fsPromise.then === "function") {
            fsPromise.then(applyLock).catch(applyLock);
          } else {
            applyLock();
          }
        } catch {
          applyLock();
        }
      } else {
        applyLock();
      }
    }
  }, []);

  const toggleManualScreenRotation = useCallback(() => {
    const nextMode: "landscape" | "portrait" = isPortrait ? "landscape" : "portrait";
    applyMobileRotationSelection(nextMode, true);
  }, [isPortrait, applyMobileRotationSelection]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    if (appState === "settings") {
      moveVectorRef.current.x = 0;
      moveVectorRef.current.y = 0;
      setIsJumping(false);
      setIsZooming(false);
      stopContinuousPlace();
    } else if (appState === "playing" && typeof window !== "undefined") {
      const raf = requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.dispatchEvent(new Event("resize"));
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [appState, stopContinuousPlace]);

  useEffect(() => {
    if (currentWorld) {
      const existing = (currentWorld as any).survivalInventory;
      if (existing && typeof existing === "object" && Object.keys(existing).length > 0) {
        setSurvivalInventory(existing);
      } else {
        const initialInv: Record<number, number> = {
          [BlockType.DIRT]: 32,
          [BlockType.WOOD]: 16,
          [BlockType.LOG]: 8,
          [BlockType.CRAFTING_TABLE]: 1,
          [BlockType.TORCH]: 8,
        };
        (currentWorld as any).survivalInventory = initialInv;
        setSurvivalInventory(initialInv);
      }
    }
  }, [currentWorld?.id]);

  useEffect(() => {
    gameState.gameMode = currentWorld?.gameMode || "survival";
  }, [currentWorld?.gameMode]);

  // Login Form Inputs
  const [usernameInput, setUsernameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isGoogleLoginLoading, setIsGoogleLoginLoading] = useState(false);

  // World Creator inputs
  const [worldNameInput, setWorldNameInput] = useState("");
  const [newWorldGameMode, setNewWorldGameMode] = useState<"creative" | "survival" | "adventure" | "spectator">("survival");
  const [newWorldType, setNewWorldType] = useState<"flat" | "normal" | "edge_farlands">("normal");

  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const isRealmAdmin = googleUser?.email?.toLowerCase().trim() === "lionbastias18@gmail.com";
  const effectiveRealmPlan: RealmPlanTier = isRealmAdmin
    ? "plus"
    : (realmPlan === "plus" || ownedShopItems.includes("realm_plus")
        ? "plus"
        : (realmPlan === "basic" || ownedShopItems.includes("realm_basic") ? "basic" : "none"));

  const userWorlds = worlds.filter((w) => {
    const creatorLower = (w.creator || "").toLowerCase();
    if (googleUser) {
      return (
        creatorLower === googleUser.uid.toLowerCase() ||
        creatorLower === (currentUser || "").toLowerCase()
      );
    }
    const guestId = (typeof localStorage !== "undefined" ? localStorage.getItem("minecraft_guest_id") : null) || "";
    const guestName = (typeof localStorage !== "undefined" ? localStorage.getItem("minecraft_guest_name") : null) || "";
    const targets = new Set(
      [currentUser || "Invitado", activeSession || "", guestId, guestName]
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    return targets.has(creatorLower);
  });

  const lookOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let mounted = true;
    checkGoogleRedirectResult().catch((err) => {
      if (!mounted) return;
      setLoginError(formatGoogleAuthError(err, lang));
    });

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!mounted) return;
      if (user) {
        setGoogleUser(user);
        setLoginError("");
        setIsGoogleLoginLoading(false);
        setCurrentUser(user.displayName || user.email || "Usuario de Google");
        setActiveSession(user.uid);
        try {
          const dbWorlds = await loadWorldsFromFirestore(user.uid);
          const localWorlds = loadWorlds();
          const mergedById = new Map<string, World>();
          localWorlds.forEach((lw) => mergedById.set(lw.id, lw));
          dbWorlds.forEach((dw) => mergedById.set(dw.id, dw));
          const mergedList = Array.from(mergedById.values());
          setWorlds(mergedList);
          saveWorlds(mergedList);
        } catch (e) {
          console.error("Error loading worlds from firestore:", e);
        }
        setAppState((prev) => (prev === "login-prompt" || prev === "login" ? "menu" : prev));
      } else {
        setGoogleUser(null);
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Activity logging helper (skips cleanly if Firestore daily write quota is exhausted)
  const logUserActivity = useCallback(async (actionText: string) => {
    if (!auth.currentUser || isFirestoreWritePaused()) return;
    const user = auth.currentUser;
    const email = user.email?.toLowerCase() || "anonimo";
    const displayName = user.displayName || user.email || "Usuario de Google";
    const logId = `${user.uid}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const logRef = doc(db, "activity_logs", logId);

    try {
      await setDoc(logRef, {
        id: logId,
        playerEmail: email,
        playerName: displayName,
        action: actionText,
        timestamp: Date.now()
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        markFirestoreQuotaExceeded(err);
        return;
      }
      console.warn("Error writing activity log:", err);
    }
  }, []);

  // Real-time listener for user role, custom biome config, presence, and logs
  useEffect(() => {
    if (!googleUser || !googleUser.email) {
      setUserRole("user");
      setBiomeConfig(null);
      return;
    }

    const emailKey = googleUser.email.toLowerCase();

    // 1. Check/Listen to role document
    const roleRef = doc(db, "user_roles", emailKey);

    // If admin email, guarantee role is 'owner' in DB
    if (emailKey === "lionbastias18@gmail.com") {
      setUserRole("owner");
      if (!isFirestoreWritePaused()) {
        setDoc(roleRef, {
          email: emailKey,
          role: "owner",
          displayName: googleUser.displayName || "LionBastias18",
          lastActive: Date.now()
        }, { merge: true }).catch(err => {
          if (isQuotaExceededError(err)) {
            markFirestoreQuotaExceeded(err);
          } else {
            console.warn("Error enforcing admin role:", err);
          }
        });
      }
    } else if (!isFirestoreWritePaused()) {
      // For any other user, ensure their metadata is set/updated on login
      setDoc(roleRef, {
        displayName: googleUser.displayName || googleUser.email || emailKey,
        lastActive: Date.now()
      }, { merge: true }).catch(err => {
        if (isQuotaExceededError(err)) {
          markFirestoreQuotaExceeded(err);
        } else {
          console.warn("Error updating user metadata:", err);
        }
      });
    }

    const unsubRole = onSnapshot(roleRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (emailKey === "lionbastias18@gmail.com") {
          setUserRole("owner");
        } else if (data && data.role) {
          setUserRole(data.role);
        }
        
        // Sync VIP, Indefs (Minecoins), Owned Items, and Custom Character States
        if (data) {
          const isVip = data.vipActive === true;
          const isMvp = data.mvpActive === true;
          const hasPass = data.unlockedWorldsPass === true;
          const coins =
            typeof data.indefCoins === "number"
              ? data.indefCoins
              : typeof data.goldCoins === "number"
                ? data.goldCoins
                : 0;
          const itemsList = Array.isArray(data.ownedShopItems) ? data.ownedShopItems : [];

          setVipActive(isVip || isMvp);
          setMvpActive(isMvp);
          setUnlockedWorldsPass(hasPass);
          setIndefCoins(coins);
          setOwnedShopItems(itemsList);

          if (data.characterSkin && CHARACTER_SKINS[data.characterSkin as CharacterSkinId]) {
            setCharacterSkin(data.characterSkin as CharacterSkinId);
            localStorage.setItem("minecraft_character_skin", data.characterSkin);
          }
          if (data.customSkin && typeof data.customSkin === "object") {
            const merged = { ...DEFAULT_CUSTOM_SKIN, ...data.customSkin };
            setCustomSkin(merged);
            localStorage.setItem("minecraft_custom_skin", JSON.stringify(merged));
          }

          const syncedRealmPlan: RealmPlanTier =
            emailKey === "lionbastias18@gmail.com"
              ? "plus"
              : (data.realmPlan === "plus" || itemsList.includes("realm_plus")
                  ? "plus"
                  : (data.realmPlan === "basic" || itemsList.includes("realm_basic") ? "basic" : "none"));
          setRealmPlan(syncedRealmPlan);
          localStorage.setItem("minecraft_realm_plan", syncedRealmPlan);

          localStorage.setItem("minecraft_vip_active", String(isVip || isMvp));
          localStorage.setItem("minecraft_mvp_active", String(isMvp));
          localStorage.setItem("minecraft_unlocked_worlds", String(hasPass));
          localStorage.setItem("minecraft_indef_coins", String(coins));
          localStorage.setItem("minecraft_owned_shop_items", JSON.stringify(itemsList));
        }

        if (data && data.biomeSurface !== undefined) {
          setBiomeConfig({
            surface: data.biomeSurface ?? BlockType.MOSS,
            underground: data.biomeUnderground ?? BlockType.DIRT,
            flora: data.biomeFlora ?? BlockType.VINES
          });
        } else {
          setBiomeConfig(null);
        }
      } else {
        if (emailKey !== "lionbastias18@gmail.com") {
          setUserRole("user");
          setBiomeConfig(null);
          setVipActive(false);
          setMvpActive(false);
          setUnlockedWorldsPass(false);
          setIndefCoins(0);
          setOwnedShopItems([]);
          setRealmPlan("none");
          localStorage.setItem("minecraft_vip_active", "false");
          localStorage.setItem("minecraft_mvp_active", "false");
          localStorage.setItem("minecraft_unlocked_worlds", "false");
          localStorage.setItem("minecraft_indef_coins", "0");
          localStorage.setItem("minecraft_owned_shop_items", "[]");
          localStorage.setItem("minecraft_realm_plan", "none");

          if (!isFirestoreWritePaused()) {
            setDoc(roleRef, {
              email: emailKey,
              role: "user",
              displayName: googleUser.displayName || googleUser.email || emailKey,
              blocksPlaced: 0,
              blocksBroken: 0,
              worldsCreated: 0,
              score: 0,
              lastActive: Date.now(),
              vipActive: false,
              mvpActive: false,
              unlockedWorldsPass: false,
              indefCoins: 0,
              ownedShopItems: [],
              realmPlan: "none"
            }, { merge: true }).catch(err => {
              if (isQuotaExceededError(err)) {
                markFirestoreQuotaExceeded(err);
              } else {
                console.warn("Error auto-registering user role:", err);
              }
            });
          }
        }
      }
    }, (error) => {
      if (isQuotaExceededError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        console.warn("Error watching user role:", error);
      }
    });

    // Listen to verified purchases for this account
    const purchasesQuery = query(
      collection(db, "user_purchases"),
      where("email", "==", emailKey),
      limit(30)
    );
    const unsubPurchases = onSnapshot(purchasesQuery, (snap) => {
      const list: Array<any> = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d) list.push(d);
      });
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setPurchaseHistory(list);
      localStorage.setItem("minecraft_purchase_history", JSON.stringify(list));
    }, () => {});

    // Real-time listeners for Realms (Owned, Member/Invited, and Admin global view)
    const ownedRealmsQuery = query(collection(db, "realms"), where("ownerUid", "==", googleUser.uid));
    const unsubOwnedRealms = onSnapshot(ownedRealmsQuery, (snap) => {
      const list: RealmData[] = [];
      snap.forEach((d) => {
        const data = d.data() as RealmData;
        if (data && data.id) list.push(data);
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMyRealms(list);
    }, (err) => console.warn("Failed watching owned realms:", err));

    let memberDocsMap: Record<string, RealmData> = {};
    let invitedDocsMap: Record<string, RealmData> = {};
    const syncJoinedRealms = () => {
      const merged: Record<string, RealmData> = { ...invitedDocsMap, ...memberDocsMap };
      const list = Object.values(merged).filter((r) => r.ownerUid !== googleUser.uid);
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setJoinedRealms(list);
    };

    const memberRealmsQuery = query(collection(db, "realms"), where("memberEmails", "array-contains", emailKey));
    const unsubMemberRealms = onSnapshot(memberRealmsQuery, (snap) => {
      memberDocsMap = {};
      snap.forEach((d) => {
        const data = d.data() as RealmData;
        if (data && data.id) memberDocsMap[data.id] = data;
      });
      syncJoinedRealms();
    }, (err) => console.warn("Failed watching member realms:", err));

    const invitedRealmsQuery = query(collection(db, "realms"), where("invitedEmails", "array-contains", emailKey));
    const unsubInvitedRealms = onSnapshot(invitedRealmsQuery, (snap) => {
      invitedDocsMap = {};
      snap.forEach((d) => {
        const data = d.data() as RealmData;
        if (data && data.id) invitedDocsMap[data.id] = data;
      });
      syncJoinedRealms();
    }, (err) => console.warn("Failed watching invited realms:", err));

    let unsubAllAdminRealms = () => {};
    if (emailKey === "lionbastias18@gmail.com") {
      unsubAllAdminRealms = onSnapshot(collection(db, "realms"), (snap) => {
        const list: RealmData[] = [];
        snap.forEach((d) => {
          const data = d.data() as RealmData;
          if (data && data.id) list.push(data);
        });
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setAllAdminRealms(list);
      }, (err) => console.warn("Failed watching admin realms:", err));
    } else {
      setAllAdminRealms([]);
    }

    return () => {
      unsubRole();
      unsubPurchases();
      unsubOwnedRealms();
      unsubMemberRealms();
      unsubInvitedRealms();
      unsubAllAdminRealms();
    };
  }, [googleUser]);

  // Real-time synchronization of the currently selected Realm to prevent desynchronization
  useEffect(() => {
    if (!selectedRealmId || !db) return;
    const realmRef = doc(db, "realms", selectedRealmId);
    const unsub = onSnapshot(realmRef, (snap) => {
      if (snap.exists()) {
        const updated = snap.data() as RealmData;
        if (updated && updated.id) {
          setMyRealms((prev) => prev.map((r) => r.id === updated.id ? updated : r));
          setJoinedRealms((prev) => prev.map((r) => r.id === updated.id ? updated : r));
          setAllAdminRealms((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        }
      }
    }, (err) => {
      console.warn("Failed syncing selected realm in real time:", err);
    });
    return () => unsub();
  }, [selectedRealmId]);

  // Live telemetry refs so the multiplayer sync interval reads fresh values without restarting
  const liveMultiplayerStateRef = useRef({
    characterSkin,
    customSkin,
    currentBlock,
    attackTrigger,
    dimension,
    gameMode: currentWorld?.gameMode || "survival",
    worldName: currentWorld?.name || "",
    activeRealmId: null as string | null,
  });
  useEffect(() => {
    liveMultiplayerStateRef.current = {
      characterSkin,
      customSkin,
      currentBlock,
      attackTrigger,
      dimension,
      gameMode: currentWorld?.gameMode || "survival",
      worldName: currentWorld?.name || "",
      activeRealmId: activeRealmId || null,
    };
  }, [characterSkin, customSkin, currentBlock, attackTrigger, dimension, currentWorld?.gameMode, currentWorld?.name, activeRealmId]);

  // Handle active gameplay presence, world initialization, chat, and multiplayer syncing
  useEffect(() => {
    if (appState !== "playing" || !currentWorld) {
      setActivePlayers([]);
      return;
    }

    const worldId = currentWorld.id;
    // Guarantee unique persistent client ID to eliminate guest ID collision
    const guestUniqueId = (() => {
      if (typeof window === "undefined") return "guest_" + Date.now();
      let gid = localStorage.getItem("minecraft_guest_unique_id");
      if (!gid) {
        gid = "guest_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
        localStorage.setItem("minecraft_guest_unique_id", gid);
      }
      return gid;
    })();

    const userId = googleUser ? googleUser.uid : (activeSession ? `${activeSession}_${guestUniqueId.slice(-6)}` : guestUniqueId);
    const userEmail = googleUser ? (googleUser.email?.toLowerCase() || "") : "invitado@example.com";
    const userName = googleUser ? (googleUser.displayName || googleUser.email || "Usuario de Google") : `${currentUser || "Invitado"}`;

    if (!userId) return;
    multiplayerUserIdRef.current = userId;
    seenChatMessageIdsRef.current.clear();

    // Ensure the world document exists in Firestore so ANY world (including guest worlds) is joinable by World Code or Friends
    const worldDocRef = doc(db, "worlds", worldId);
    getDoc(worldDocRef)
      .then((snap) => {
        if (!snap.exists() && !isFirestoreWritePaused()) {
          setDoc(worldDocRef, {
            id: currentWorld.id,
            name: currentWorld.name,
            creator: currentWorld.creator || userId,
            creatorName: currentWorld.creatorName || userName,
            createdAt: currentWorld.createdAt || Date.now(),
            playerPos: currentWorld.playerPos || { x: 0, y: 80, z: 0 },
            gameMode: currentWorld.gameMode || "survival",
            worldType: currentWorld.worldType || "normal",
            edits: currentWorld.edits || {},
            blockColors: currentWorld.blockColors || {},
            survivalInventory: currentWorld.survivalInventory || {},
          }, { merge: true }).catch((err) => {
            if (isQuotaExceededError(err)) {
              markFirestoreQuotaExceeded(err);
            } else {
              console.warn("Failed to ensure world doc in Firestore:", err);
            }
          });
        }
      })
      .catch(() => {});

    const presenceRef = doc(db, "worlds", worldId, "players", userId);
    const onlinePlayerRef = doc(db, "online_players", userId);

    let lastSentPos = { x: NaN, y: NaN, z: NaN };
    let lastSentYaw = NaN;
    let lastSentPitch = NaN;
    let lastSentSkin: CharacterSkinId | "" = "";
    let lastSentBlock: BlockType | -1 = -1;
    let lastSentAttack = -1;
    let lastSentDim = "";
    let lastPresenceWrite = 0;
    let lastOnlineWrite = 0;
    let lastCustomSkinSync = 0;
    let presenceInFlight = false;
    otherPlayersCountRef.current = 0;

    // Quota-safe adaptive multiplayer presence:
    // - Solo player in private world: 45s lightweight keep-alive (no wasted movement writes!)
    // - Active multiplayer / Realm session: ~400ms movement delta sync paired with dead-reckoning interpolation
    const updatePresence = async (force = false) => {
      if (isFirestoreWritePaused()) return;
      if (presenceInFlight && !force) return;
      if (!force && typeof document !== "undefined" && document.visibilityState === "hidden") return;

      try {
        const now = Date.now();
        const pos = activePlayerPosRef.current;
        const { yaw, pitch } = activePlayerPoseRef.current;
        const live = liveMultiplayerStateRef.current;
        const hasMultiplayerPeers = otherPlayersCountRef.current > 0 || Boolean(live.activeRealmId);

        const skinChanged = live.characterSkin !== lastSentSkin;
        const stateChanged =
          skinChanged ||
          live.currentBlock !== lastSentBlock ||
          live.attackTrigger !== lastSentAttack ||
          live.dimension !== lastSentDim;

        const movedDistSq =
          (pos.x - lastSentPos.x) ** 2 +
          (pos.y - lastSentPos.y) ** 2 +
          (pos.z - lastSentPos.z) ** 2;
        const rotated =
          isNaN(lastSentYaw) ||
          Math.abs(yaw - lastSentYaw) > 0.14 ||
          Math.abs(pitch - lastSentPitch) > 0.14;

        const elapsedSinceWrite = now - lastPresenceWrite;
        const minSpacingMs = 400;
        const keepAliveMs = hasMultiplayerPeers ? 20000 : 45000;
        const keepAliveDue = elapsedSinceWrite >= keepAliveMs;

        const shouldSendPeerDelta =
          hasMultiplayerPeers &&
          (stateChanged || (elapsedSinceWrite >= minSpacingMs && (isNaN(movedDistSq) || movedDistSq > 0.08 || rotated)));

        if (force || keepAliveDue || shouldSendPeerDelta || (!hasMultiplayerPeers && stateChanged && elapsedSinceWrite >= 5000)) {
          lastSentPos = { x: pos.x, y: pos.y, z: pos.z };
          lastSentYaw = yaw;
          lastSentPitch = pitch;
          lastSentSkin = live.characterSkin;
          lastSentBlock = live.currentBlock;
          lastSentAttack = live.attackTrigger;
          lastSentDim = live.dimension;
          lastPresenceWrite = now;

          const presencePayload: Record<string, any> = {
            id: userId,
            email: userEmail,
            name: userName,
            pos: { x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)), z: Number(pos.z.toFixed(2)) },
            yaw: Number(yaw.toFixed(2)),
            pitch: Number(pitch.toFixed(2)),
            skinId: live.characterSkin,
            heldBlock: live.currentBlock,
            attackSeq: live.attackTrigger,
            dimension: live.dimension,
            lastActive: now,
            spectator: live.gameMode === "spectator",
          };
          if (live.characterSkin === "custom" && (force || skinChanged || now - lastCustomSkinSync >= 30000)) {
            presencePayload.customSkin = live.customSkin;
            lastCustomSkinSync = now;
          }

          presenceInFlight = true;
          await setDoc(presenceRef, presencePayload, { merge: true });
        }

        // Refresh global /online_players discovery entry every 30 seconds
        if (!isFirestoreWritePaused() && (force || now - lastOnlineWrite >= 30000)) {
          lastOnlineWrite = now;
          void setDoc(onlinePlayerRef, {
            id: userId,
            name: userName,
            email: userEmail,
            worldId: worldId,
            worldName: live.worldName || currentWorld.name,
            dimension: live.dimension,
            skinId: live.characterSkin,
            pos: { x: Number(pos.x.toFixed(1)), y: Number(pos.y.toFixed(1)), z: Number(pos.z.toFixed(1)) },
            lastActive: now,
            spectator: live.gameMode === "spectator",
          }, { merge: true }).catch((err) => {
            if (isQuotaExceededError(err)) {
              markFirestoreQuotaExceeded(err);
            }
          });
        }
      } catch (err) {
        if (isQuotaExceededError(err)) {
          markFirestoreQuotaExceeded(err);
        } else {
          console.warn("Error writing presence heartbeat:", err);
        }
      } finally {
        presenceInFlight = false;
      }
    };

    updatePresence(true);
    const intervalId = setInterval(() => updatePresence(false), 250);

    // Listen to presence subcollection
    const playersColRef = collection(db, "worlds", worldId, "players");
    const unsubPlayers = onSnapshot(playersColRef, (snapshot) => {
      const list: ActivePlayerInfo[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const timeDelta = Math.abs(now - (data.lastActive || 0));
        // Ignore self, dead/inactive heartbeats (> 90 seconds, clock skew immune), and invisible spectators
        if (data.id !== userId && timeDelta < 90000 && !data.spectator) {
          list.push({
            id: data.id,
            name: data.name || data.email || "Jugador",
            pos: {
              x: typeof data.pos?.x === 'number' && !isNaN(data.pos.x) ? data.pos.x : 0,
              y: typeof data.pos?.y === 'number' && !isNaN(data.pos.y) ? data.pos.y : 80,
              z: typeof data.pos?.z === 'number' && !isNaN(data.pos.z) ? data.pos.z : 0
            },
            yaw: typeof data.yaw === 'number' && !isNaN(data.yaw) ? data.yaw : 0,
            pitch: typeof data.pitch === 'number' && !isNaN(data.pitch) ? data.pitch : 0,
            skinId: (data.skinId && CHARACTER_SKINS[data.skinId as CharacterSkinId]) ? (data.skinId as CharacterSkinId) : 'cyber',
            customSkin: (data.customSkin && typeof data.customSkin === "object") ? { ...DEFAULT_CUSTOM_SKIN, ...data.customSkin } : undefined,
            heldBlock: typeof data.heldBlock === 'number' ? data.heldBlock : undefined,
            attackSeq: typeof data.attackSeq === 'number' ? data.attackSeq : 0,
            dimension: data.dimension || "overworld"
          });
        }
      });
      const prevPeerCount = otherPlayersCountRef.current;
      otherPlayersCountRef.current = list.length;
      setActivePlayers(list);
      // Immediately send fresh coordinates when a peer joins our world
      if (prevPeerCount === 0 && list.length > 0) {
        void updatePresence(true);
      }
    }, (error) => {
      if (isQuotaExceededError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        console.warn("Error watching world players:", error);
      }
    });

    // Real-time multiplayer world chat listener
    const joinedAtMs = Date.now() - 120000; // show recent 2 min messages on join
    const messagesQuery = query(
      collection(db, "worlds", worldId, "messages"),
      orderBy("timestamp", "asc"),
      limit(30)
    );
    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const newLines: string[] = [];
      snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        if (!msg || !msg.id || seenChatMessageIdsRef.current.has(msg.id)) return;
        seenChatMessageIdsRef.current.add(msg.id);
        if (msg.senderId === userId) return;
        if (typeof msg.timestamp === "number" && msg.timestamp < joinedAtMs) return;
        newLines.push(`💬 [${msg.senderName || "Jugador"}] ${msg.text}`);
      });
      if (newLines.length > 0) {
        setChatMessages((prev) => [...prev, ...newLines].slice(-60));
      }
    }, () => {});

    // Write a join world log
    logUserActivity(`Entró al mundo '${currentWorld.name}' (Generación: ${currentWorld.worldType})`);

    // Clean up presence on unmount / exit playing
    return () => {
      clearInterval(intervalId);
      unsubPlayers();
      unsubMessages();
      if (!isFirestoreWritePaused()) {
        deleteDoc(presenceRef).catch(() => {});
        deleteDoc(onlinePlayerRef).catch(() => {});
      }
      logUserActivity(`Salió del mundo '${currentWorld.name}'`);
    };
  }, [appState, currentWorld?.id, googleUser, activeSession, currentUser, logUserActivity]);

  // Listen to world edits in real-time for multiplayer
  useEffect(() => {
    if (appState !== "playing" || !currentWorld) return;

    const worldRef = doc(db, "worlds", currentWorld.id);
    const unsubWorld = onSnapshot(worldRef, (docSnap) => {
      if (docSnap.exists()) {
        if (
          docSnap.metadata.hasPendingWrites &&
          (Object.keys(pendingLocalEditsRef.current).length > 0 ||
            Object.keys(pendingLocalColorsRef.current).length > 0)
        ) {
          return;
        }
        const data = docSnap.data();
        if (data && (data.edits || data.blockColors)) {
          const now = Date.now();
          const serverEdits = data.edits || {};
          const mergedEdits: Record<string, number> = { ...serverEdits };
          // Protect optimistic local block edits until Firestore server explicitly confirms them (or 15s safety ceiling)
          for (const [k, entry] of Object.entries(pendingLocalEditsRef.current)) {
            const serverVal = serverEdits[k];
            const isConfirmedOnServer =
              !docSnap.metadata.hasPendingWrites &&
              (serverVal === entry.value || (entry.value === BlockType.AIR && serverVal === undefined));
            if (isConfirmedOnServer || now - entry.ts >= 15000) {
              delete pendingLocalEditsRef.current[k];
            } else {
              mergedEdits[k] = entry.value;
            }
          }

          const serverColors: Record<string, string> = data.blockColors || {};
          const mergedColors: Record<string, string> = { ...serverColors };
          for (const [k, entry] of Object.entries(pendingLocalColorsRef.current)) {
            const serverVal = serverColors[k];
            const isConfirmedOnServer =
              !docSnap.metadata.hasPendingWrites &&
              (entry.value === null ? serverVal === undefined : serverVal === entry.value);
            if (isConfirmedOnServer || now - entry.ts >= 15000) {
              delete pendingLocalColorsRef.current[k];
            } else if (entry.value === null) {
              delete mergedColors[k];
            } else {
              mergedColors[k] = entry.value;
            }
          }

          setCurrentWorld((prev) => {
            if (!prev) return prev;
            let hasDiff = false;
            const prevEdits = prev.edits || {};
            const prevEditsKeys = Object.keys(prevEdits);
            const dbEditsKeys = Object.keys(mergedEdits);
            if (prevEditsKeys.length !== dbEditsKeys.length) {
              hasDiff = true;
            } else {
              for (const key of dbEditsKeys) {
                if (prevEdits[key] !== mergedEdits[key]) {
                  hasDiff = true;
                  break;
                }
              }
            }

            let hasColorDiff = false;
            const prevColors = prev.blockColors || {};
            const prevColorKeys = Object.keys(prevColors);
            const dbColorKeys = Object.keys(mergedColors);
            if (prevColorKeys.length !== dbColorKeys.length) {
              hasColorDiff = true;
            } else {
              for (const key of dbColorKeys) {
                if (prevColors[key] !== mergedColors[key]) {
                  hasColorDiff = true;
                  break;
                }
              }
            }

            if (hasDiff || hasColorDiff) {
              return {
                ...prev,
                edits: hasDiff ? mergedEdits : prev.edits,
                blockColors: hasColorDiff ? mergedColors : prev.blockColors,
              };
            }
            return prev;
          });
        }
      }
    });

    return () => {
      unsubWorld();
    };
  }, [appState, currentWorld?.id]);

  // Listen to friendships and online players in real-time
  useEffect(() => {
    if (!activeSession) return;

    // Listen to friendships where current user is sender
    const q1 = query(collection(db, "friendships"), where("senderId", "==", activeSession));
    const unsub1 = onSnapshot(q1, (snap) => {
      setFriendships((prev) => {
        const other = prev.filter((f) => f.senderId !== activeSession);
        const mine = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return [...other, ...mine];
      });
    }, () => {});

    // Listen to friendships where current user is receiver (by ID or Google email)
    const q2 = query(collection(db, "friendships"), where("receiverId", "==", activeSession));
    const unsub2 = onSnapshot(q2, (snap) => {
      setFriendships((prev) => {
        const other = prev.filter((f) => f.receiverId !== activeSession);
        const mine = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return [...other, ...mine];
      });
    }, () => {});

    // Also look for Google email receivers if signed in
    let unsub3 = () => {};
    if (googleUser && googleUser.email) {
      const q3 = query(collection(db, "friendships"), where("receiverId", "==", googleUser.email.toLowerCase()));
      unsub3 = onSnapshot(q3, (snap) => {
        setFriendships((prev) => {
          const other = prev.filter((f) => f.receiverId !== googleUser.email.toLowerCase());
          const mine = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          return [...other, ...mine];
        });
      }, () => {});
    }

    // Listen to online players to see who is active
    const unsubOnline = onSnapshot(collection(db, "online_players"), (snap) => {
      const players: Record<string, any> = {};
      snap.forEach((doc) => {
        players[doc.id] = doc.data();
      });
      setOnlinePlayers(players);
    }, () => {});

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsubOnline();
    };
  }, [activeSession, googleUser]);

  // Main menu and Lobby presence heartbeat (throttled to 45s to stay well within free Firestore daily quota)
  useEffect(() => {
    if (appState !== "menu" && appState !== "settings" && appState !== "worlds-list") {
      return;
    }
    if (!activeSession) return;

    const updateMenuPresence = async () => {
      if (isFirestoreWritePaused()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const onlinePlayerRef = doc(db, "online_players", activeSession);
        await setDoc(onlinePlayerRef, {
          id: activeSession,
          name: currentUser,
          email: googleUser?.email || "Invitado",
          worldId: null,
          worldName: lang === "es" ? "En el Menú Principal" : "In Main Menu",
          dimension: null,
          lastActive: Date.now()
        }, { merge: true });
      } catch (err) {
        if (isQuotaExceededError(err)) {
          markFirestoreQuotaExceeded(err);
        } else {
          console.warn("Error updating menu presence:", err);
        }
      }
    };

    updateMenuPresence();
    const intervalId = setInterval(updateMenuPresence, 45000);

    return () => {
      clearInterval(intervalId);
      // Clean up when leaving menu (online_players/{userId} is deleted, unless active playing takes over)
      setTimeout(async () => {
        const latestState = latestSaveDataRef.current;
        if (latestState.appState !== "playing" && !isFirestoreWritePaused()) {
          try {
            await deleteDoc(doc(db, "online_players", activeSession));
          } catch (e) {}
        }
      }, 500);
    };
  }, [appState, activeSession, currentUser, googleUser, lang]);

  // Furnace auto-smelting background tick loop
  useEffect(() => {
    if (appState !== "playing") return;
    if (!furnaceInput || furnaceInputCount <= 0 || !furnaceFuel || furnaceFuelCount <= 0) {
      setFurnaceProgress(0);
      return;
    }

    const outputType = getSmeltingResult(furnaceInput);
    if (!outputType) {
      setFurnaceProgress(0);
      return;
    }

    // Verify output slot compatibility
    if (furnaceOutput && furnaceOutput !== outputType) {
      setFurnaceProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setFurnaceProgress((prev) => {
        const next = prev + 20;
        if (next >= 100) {
          // Smelted 1 item successfully!
          setFurnaceInputCount((ic) => {
            const nextIc = ic - 1;
            if (nextIc <= 0) setFurnaceInput(null);
            return Math.max(0, nextIc);
          });
          setFurnaceOutput(outputType);
          setFurnaceOutputCount((oc) => oc + 1);
          setFurnaceFuelCount((fc) => {
            const nextFc = fc - 1;
            if (nextFc <= 0) setFurnaceFuel(null);
            return Math.max(0, nextFc);
          });
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [appState, furnaceInput, furnaceInputCount, furnaceFuel, furnaceFuelCount, furnaceOutput]);

  // Staff and Mod specific collections watchers (all users list and activity logs)
  useEffect(() => {
    if (!activeSession) {
      setActivityLogs([]);
      setAllUserRolesList([]);
      return;
    }

    // 1. Subscribe to activity logs (Only for staff, mod, or owner)
    let unsubLogs = () => {};
    const isStaffOrModUser = userRole === "staff" || userRole === "mod" || userRole === "owner" || googleUser?.email?.toLowerCase() === "lionbastias18@gmail.com";
    if (isStaffOrModUser) {
      const logsCol = collection(db, "activity_logs");
      const qLogs = query(logsCol, orderBy("timestamp", "desc"), limit(50));
      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        const logs: any[] = [];
        snapshot.forEach((docSnap) => {
          logs.push(docSnap.data());
        });
        setActivityLogs(logs);
      }, (error) => {
        console.warn("Failed to stream activity logs:", error);
      });
    } else {
      setActivityLogs([]);
    }

    // 2. Subscribe to user roles list (leaderboard) - For ALL logged-in users and guests!
    const rolesCol = collection(db, "user_roles");
    const unsubRoles = onSnapshot(rolesCol, (snapshot) => {
      const roles: any[] = [];
      snapshot.forEach((docSnap) => {
        roles.push(docSnap.data());
      });
      setAllUserRolesList(roles);
    }, (error) => {
      console.warn("Failed to stream user roles:", error);
    });

    return () => {
      unsubLogs();
      unsubRoles();
    };
  }, [activeSession, googleUser, userRole]);

  // Keep latest state in a ref to avoid resetting the auto-save interval on every block/inventory change!
  const latestSaveDataRef = useRef({ currentWorld, survivalInventory, googleUser, appState });
  latestSaveDataRef.current = { currentWorld, survivalInventory, googleUser, appState };

  const flushUserStats = useCallback(async () => {
    const { googleUser: activeUser } = latestSaveDataRef.current;
    if (!activeUser || !activeUser.email || isFirestoreWritePaused()) return;

    const placed = blocksPlacedRef.current;
    const broken = blocksBrokenRef.current;
    if (placed === 0 && broken === 0) return;

    // Reset local counters immediately to avoid double counting if save takes time
    blocksPlacedRef.current = 0;
    blocksBrokenRef.current = 0;

    const emailKey = activeUser.email.toLowerCase();
    const roleRef = doc(db, "user_roles", emailKey);

    try {
      const addedScore = placed * 10 + broken * 5;
      await setDoc(roleRef, {
        blocksPlaced: increment(placed),
        blocksBroken: increment(broken),
        score: increment(addedScore),
        lastActive: Date.now(),
        displayName: activeUser.displayName || activeUser.email || emailKey,
      }, { merge: true });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        markFirestoreQuotaExceeded(err);
      } else {
        console.warn("[Stats] Error flushing user stats to Firestore:", err);
      }
      // Restore counts in case of error so we don't lose them
      blocksPlacedRef.current += placed;
      blocksBrokenRef.current += broken;
    }
  }, []);

  // Quiet background auto-save every 45 seconds during active gameplay (dirty-checked to avoid redundant writes)
  useEffect(() => {
    if (appState !== "playing") return;

    const intervalId = setInterval(async () => {
      const { currentWorld: activeWorld, survivalInventory: activeInv, googleUser: activeUser } = latestSaveDataRef.current;
      if (!activeWorld) return;

      const curPos = activePlayerPosRef.current;
      const updatedWorld = {
        ...activeWorld,
        playerPos: curPos,
        survivalInventory: activeInv,
      };

      const sig = `${activeWorld.id}|${curPos.x.toFixed(1)},${curPos.y.toFixed(1)},${curPos.z.toFixed(1)}|${JSON.stringify(activeInv || {})}`;
      const isDirty = sig !== lastAutoSaveSignatureRef.current;

      if (activeUser && !isFirestoreWritePaused()) {
        if (!isDirty && blocksPlacedRef.current === 0 && blocksBrokenRef.current === 0) {
          return;
        }
        try {
          if (isDirty) {
            const worldDocRef = doc(db, "worlds", activeWorld.id);
            await setDoc(worldDocRef, {
              id: updatedWorld.id,
              name: updatedWorld.name,
              creator: updatedWorld.creator,
              creatorName: updatedWorld.creatorName || updatedWorld.creator,
              createdAt: updatedWorld.createdAt,
              playerPos: curPos,
              gameMode: updatedWorld.gameMode || "survival",
              worldType: updatedWorld.worldType || "normal",
              survivalInventory: activeInv,
            }, { merge: true });
            lastAutoSaveSignatureRef.current = sig;
          }
          setWorlds((prev) =>
            prev.map((w) => (w.id === activeWorld.id ? { ...w, playerPos: curPos, survivalInventory: activeInv } : w))
          );
          await flushUserStats();
        } catch (e) {
          if (isQuotaExceededError(e)) {
            markFirestoreQuotaExceeded(e);
            setWorlds((prev) => {
              const next = prev.map((w) => (w.id === activeWorld.id ? updatedWorld : w));
              saveWorlds(next);
              return next;
            });
          } else {
            console.warn("[Auto-Save] Error al guardar automáticamente en Firestore:", e);
          }
        }
      } else {
        setWorlds((prev) => {
          const next = prev.map((w) =>
            w.id === activeWorld.id ? updatedWorld : w,
          );
          saveWorlds(next);
          return next;
        });
      }
    }, 45000);

    return () => clearInterval(intervalId);
  }, [appState, flushUserStats]);

  // Dynamic random weather cycle during gameplay
  useEffect(() => {
    if (appState !== "playing") return;

    const intervalId = setInterval(() => {
      // 35% chance of weather shifting every 40 seconds
      if (Math.random() < 0.35) {
        const rand = Math.random();
        let nextWeather: "clear" | "rain" | "snow" | "thunderstorm" | "snow_rain" = "clear";

        if (rand < 0.60) {
          nextWeather = "clear";
        } else if (rand < 0.70) {
          nextWeather = "rain";
        } else if (rand < 0.80) {
          nextWeather = "thunderstorm";
        } else if (rand < 0.90) {
          nextWeather = "snow";
        } else {
          nextWeather = "snow_rain";
        }

        setWeather((currentWeather) => {
          if (currentWeather === nextWeather) return currentWeather; // Avoid duplicate messages
          
          const weatherNamesES: Record<string, string> = {
            clear: "Despejado ☀️",
            rain: "Lluvia 🌧️",
            snow: "Nieve ❄️",
            thunderstorm: "Tormenta Eléctrica ⛈️",
            snow_rain: "Lluvia de Nieve 🌨️"
          };

          setChatMessages((prev) => [
            ...prev,
            `[Clima] El tiempo ha cambiado a ${weatherNamesES[nextWeather] || nextWeather}`
          ]);

          return nextWeather;
        });
      }
    }, 40000);

    return () => clearInterval(intervalId);
  }, [appState]);

  // Autosave when page is unloaded or tab is closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { currentWorld: activeWorld, survivalInventory: activeInv } = latestSaveDataRef.current;
      if (appState === "playing" && activeWorld) {
        const updatedWorld = {
          ...activeWorld,
          playerPos: activePlayerPosRef.current,
          survivalInventory: activeInv,
        };
        setWorlds((prev) => {
          const next = prev.map((w) =>
            w.id === activeWorld.id ? updatedWorld : w,
          );
          saveWorlds(next);
          return next;
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [appState]);

  const handleGoogleLogin = async () => {
    if (isGoogleLoginLoading) return;
    try {
      resumeAudio();
      setLoginError("");
      setIsGoogleLoginLoading(true);
      await loginWithGoogle();
    } catch (e) {
      console.error(e);
      setLoginError(formatGoogleAuthError(e, lang));
    } finally {
      setIsGoogleLoginLoading(false);
    }
  };

  const handleChooseGuest = () => {
    resumeAudio();
    setLoginError("");
    let guestId = localStorage.getItem("minecraft_guest_id");
    let guestName = localStorage.getItem("minecraft_guest_name");
    if (!guestId) {
      guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem("minecraft_guest_id", guestId);
    }
    if (!guestName) {
      guestName = `Invitado_${Math.floor(100 + Math.random() * 900)}`;
      localStorage.setItem("minecraft_guest_name", guestName);
    }
    setCurrentUser(guestName);
    setActiveSession(guestId);
    setAppState("menu");
  };

  const handleChooseSignIn = () => {
    resumeAudio();
    setUsernameInput("");
    setPinInput("");
    setShowPinInput(false);
    setLoginError("");
    setAppState("login");
  };

  const handleLogout = async () => {
    resumeAudio();
    setLoginError("");
    setIsGoogleLoginLoading(false);
    if (googleUser) {
      try {
        await logoutGoogle();
      } catch (e) {
        console.error("Error signing out:", e);
      }
    }
    setCurrentUser(null);
    setActiveSession(null);
    setCurrentWorld(null);
    setActiveRealmId(null);
    setWorlds(loadWorlds()); // Reset to offline worlds
    setAppState("login-prompt");
  };

  const handleLoginOrRegister = (e: React.FormEvent) => {
    e.preventDefault();
    resumeAudio();
    const cleanUser = usernameInput.trim();
    const cleanPin = pinInput.trim();
    if (!cleanUser) {
      setLoginError(dict[lang].enter_username_warn);
      return;
    }

    const existingProfile = profiles.find(
      (p) => p.username.toLowerCase() === cleanUser.toLowerCase(),
    );
    if (existingProfile) {
      if (existingProfile.pin && existingProfile.pin !== cleanPin) {
        setLoginError(dict[lang].wrong_pin);
        return;
      }
    } else {
      const newProfile: Profile = {
        username: cleanUser,
        pin: cleanPin,
      };
      const updatedProv = [...profiles, newProfile];
      setProfiles(updatedProv);
      saveProfiles(updatedProv);
    }

    const resolvedName = existingProfile ? existingProfile.username : cleanUser;
    setCurrentUser(resolvedName);
    setActiveSession(resolvedName);
    setLoginError("");
    setAppState("menu");
  };

  const handleCreateWorld = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    resumeAudio();

    if (userWorlds.length >= 70 && !isBypassingWorldLimit) {
      setChatMessages((p) => [...p, "❌ Límite de 70 mundos alcanzado. Por favor elimina algún mundo antes de continuar."]);
      return;
    }

    const creator = googleUser ? googleUser.uid : (currentUser || "Invitado");
    const creatorName = googleUser ? (googleUser.displayName || googleUser.email || "Jugador") : (currentUser || "Invitado");
    const name = worldNameInput.trim() || dict[lang].new_world_default;

    const hasBuilderKit = ownedShopItems.includes("kit_builder") || vipActive || mvpActive;
    const hasExplorerKit = ownedShopItems.includes("kit_explorer_pro") || mvpActive;
    const hasAquaticKit = ownedShopItems.includes("kit_aquatic_starter") || ownedShopItems.includes("aquatic_vip") || vipActive || mvpActive;

    const initialInv: Record<number, number> = hasBuilderKit
      ? {
          [BlockType.DIRT]: 24,
          [BlockType.WOOD]: 32,
          [BlockType.LOG]: 16,
          [BlockType.TORCH]: 16,
          [BlockType.PICKAXE]: 1,
          [BlockType.BED]: 1,
          [BlockType.CRAFTING_TABLE]: 1,
          [BlockType.FURNACE]: 1,
        }
      : {
          [BlockType.DIRT]: 16,
          [BlockType.WOOD]: 8,
          [BlockType.LOG]: 4,
          [BlockType.CRAFTING_TABLE]: 1,
        };

    if (hasExplorerKit) {
      initialInv[BlockType.DIAMOND_SWORD] = (initialInv[BlockType.DIAMOND_SWORD] || 0) + 1;
      initialInv[BlockType.DIAMOND_PICKAXE] = (initialInv[BlockType.DIAMOND_PICKAXE] || 0) + 1;
      initialInv[BlockType.TORCH] = (initialInv[BlockType.TORCH] || 0) + 24;
      initialInv[BlockType.LOCATOR_MAP] = (initialInv[BlockType.LOCATOR_MAP] || 0) + 1;
      initialInv[BlockType.CHEST] = (initialInv[BlockType.CHEST] || 0) + 2;
    }

    if (hasAquaticKit) {
      initialInv[BlockType.BUCKET_WATER] = (initialInv[BlockType.BUCKET_WATER] || 0) + 2;
      initialInv[BlockType.GLOWSTONE] = (initialInv[BlockType.GLOWSTONE] || 0) + 12;
      initialInv[BlockType.CONCRETE] = (initialInv[BlockType.CONCRETE] || 0) + 32;
      initialInv[BlockType.TORCH] = (initialInv[BlockType.TORCH] || 0) + 12;
    }

    const newWorld: World = {
      id: `world_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: name,
      creator: creator,
      creatorName: creatorName || "Jugador",
      createdAt: Date.now(),
      playerPos: { x: 0, y: newWorldType === "flat" ? 58 : 80, z: 0 },
      gameMode: newWorldGameMode,
      worldType: newWorldType,
      edits: {},
      blockColors: {},
      survivalInventory: initialInv
    };

    // 1. Immediately update state and localStorage so world opens instantly
    const nextWorlds = [...worlds, newWorld];
    setWorlds(nextWorlds);
    saveWorlds(nextWorlds);

    setWorldNameInput("");
    setActiveRealmId(null);
    setSurvivalInventory(initialInv);
    setCurrentWorld(newWorld);
    setPlayerPos({ x: 0, y: newWorldType === "flat" ? 58 : 80, z: 0 });
    setAppState("playing");

    // 2. Sync to Firestore in background without blocking UI
    if (googleUser) {
      saveWorldToFirestore(newWorld).catch((err) => {
        console.warn("Background firestore save new world:", err);
      });
    }
  };

  const handleDeleteWorld = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    resumeAudio();
    if (googleUser) {
      try {
        await deleteWorldFromFirestore(id);
        const dbWorlds = await loadWorldsFromFirestore(googleUser.uid);
        setWorlds(dbWorlds);
      } catch (e) {
        console.error("Error deleting world from firestore:", e);
      }
    } else {
      const nextWorlds = worlds.filter((w) => w.id !== id);
      setWorlds(nextWorlds);
      saveWorlds(nextWorlds);
    }
    if (currentWorld?.id === id) {
      setCurrentWorld(null);
    }
  };

  const handleBulkDeleteOldest = async (countToDelete: number) => {
    resumeAudio();
    setIsDeletingBulk(true);
    try {
      const sortedWorlds = [...worlds].sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = sortedWorlds.slice(0, countToDelete);

      if (toDelete.length === 0) {
        setIsDeletingBulk(false);
        setShowBulkDeleteConfirm(false);
        return;
      }

      if (googleUser) {
        for (const w of toDelete) {
          try {
            await deleteWorldFromFirestore(w.id);
          } catch (err) {
            console.error(`Error deleting world ${w.id} from firestore:`, err);
          }
        }
        const dbWorlds = await loadWorldsFromFirestore(googleUser.uid);
        setWorlds(dbWorlds);
      } else {
        const idsToDelete = new Set(toDelete.map((w) => w.id));
        const nextWorlds = worlds.filter((w) => !idsToDelete.has(w.id));
        setWorlds(nextWorlds);
        saveWorlds(nextWorlds);
      }

      const deletedIds = new Set(toDelete.map((w) => w.id));
      if (currentWorld && deletedIds.has(currentWorld.id)) {
        setCurrentWorld(null);
      }

      setChatMessages((prev) => [
        ...prev,
        `🧹 [Limpieza] Se han eliminado automáticamente los ${toDelete.length} mundos más antiguos para liberar espacio.`,
      ]);
    } catch (err) {
      console.error("Error doing bulk delete:", err);
    } finally {
      setIsDeletingBulk(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const handleCraft = (recipe: CraftingRecipe, equipAfter = false) => {
    if (!isCreativeMode) {
      for (const ing of recipe.ingredients) {
        if ((survivalInventory[ing.type] || 0) < ing.count) {
          return;
        }
      }

      setSurvivalInventory((prev) => {
        const next = { ...prev };
        for (const ing of recipe.ingredients) {
          next[ing.type] = Math.max(0, (next[ing.type] || 0) - ing.count);
        }
        next[recipe.result] = (next[recipe.result] || 0) + recipe.resultCount;

        if (currentWorld) {
          (currentWorld as any).survivalInventory = next;
        }
        return next;
      });
    }

    playPlaceSound(recipe.result);
    if (equipAfter) {
      setCurrentBlock(recipe.result);
      setIsInventoryOpen(false);
      setIsCraftingTableActive(false);
    }
  };

  const handleBlockEdit = useCallback(
    (x: number, y: number, z: number, blockType: BlockType, oldBlockType?: BlockType, isSystemUpdate?: boolean) => {
      if (!currentWorld) return;

      if (!isSystemUpdate) {
        if (blockType === BlockType.AIR) {
          blocksBrokenRef.current += 1;
        } else {
          blocksPlacedRef.current += 1;
        }

        const isSurvival = (currentWorld.gameMode as string) === "survival" || (currentWorld.gameMode as string) === "supervivencia";
        if (isSurvival) {
          if (blockType === BlockType.AIR) {
            if (oldBlockType && (oldBlockType as any) !== BlockType.AIR && (oldBlockType as any) !== BlockType.BEDROCK) {
              setSurvivalInventory((prev) => {
                const next = {
                  ...prev,
                  [oldBlockType]: (prev[oldBlockType] || 0) + 1,
                };
                (currentWorld as any).survivalInventory = next;
                return next;
              });
            }
          } else {
            // Only deduct from survival inventory if this was an intentional placement of the held block
            if (currentBlock === blockType) {
              setSurvivalInventory((prev) => {
                const currentQty = prev[blockType] || 0;
                if (currentQty <= 0) return prev;
                const nextCount = currentQty - 1;
                const next = {
                  ...prev,
                  [blockType]: nextCount,
                };

                (currentWorld as any).survivalInventory = next;
                return next;
              });
            }
          }
        }
      }

      const baseWorld = latestSaveDataRef.current.currentWorld || currentWorld;
      const editKey = dimension === "nether" ? `nether:${x},${y},${z}` : `${x},${y},${z}`;
      pendingLocalEditsRef.current[editKey] = { value: blockType, ts: Date.now() };

      const updatedEdits = { ...(baseWorld.edits || {}) };
      const updatedBlockColors = { ...(baseWorld.blockColors || {}) };
      const patchFields: Record<string, any> = {};

      // Helper to get block in the local copy of edits
      const getLocalBlockAt = (bx: number, by: number, bz: number) => {
        const key = dimension === "nether" ? `nether:${bx},${by},${bz}` : `${bx},${by},${bz}`;
        return updatedEdits[key] ?? BlockType.AIR;
      };

      const setLocalBlockAt = (bx: number, by: number, bz: number, type: BlockType) => {
        const key = dimension === "nether" ? `nether:${bx},${by},${bz}` : `${bx},${by},${bz}`;
        pendingLocalEditsRef.current[key] = { value: type, ts: Date.now() };
        if (type === BlockType.AIR) {
          delete updatedEdits[key];
          patchFields[`edits.${key}`] = deleteField();
        } else {
          updatedEdits[key] = type;
          patchFields[`edits.${key}`] = type;
        }
      };

      // Standard edit update first
      if (blockType === BlockType.AIR) {
        updatedEdits[editKey] = BlockType.AIR;
        patchFields[`edits.${editKey}`] = BlockType.AIR;
        if (editKey in updatedBlockColors) {
          delete updatedBlockColors[editKey];
          patchFields[`blockColors.${editKey}`] = deleteField();
          pendingLocalColorsRef.current[editKey] = { value: null, ts: Date.now() };
        }
      } else {
        updatedEdits[editKey] = blockType;
        patchFields[`edits.${editKey}`] = blockType;
      }

      if (!isSystemUpdate) {
        // 1. Check if any portal frame is completed/valid in the neighborhood of (x, y, z)
        let portalCreated = false;
        for (let tx = x - 3; tx <= x + 3; tx++) {
          for (let ty = y - 3; ty <= y + 3; ty++) {
            for (let tz = z - 3; tz <= z + 3; tz++) {
              if (isFrameValidX(tx, ty, tz, getLocalBlockAt)) {
                for (let dx = 0; dx <= 1; dx++) {
                  for (let dy = 0; dy <= 2; dy++) {
                    const blockAtPos = getLocalBlockAt(tx + dx, ty + dy, tz);
                    if (blockAtPos !== BlockType.OBSIDIAN && blockAtPos !== BlockType.PORTAL) {
                      setLocalBlockAt(tx + dx, ty + dy, tz, BlockType.PORTAL);
                      portalCreated = true;
                    }
                  }
                }
              }
              if (isFrameValidZ(tx, ty, tz, getLocalBlockAt)) {
                for (let dz = 0; dz <= 1; dz++) {
                  for (let dy = 0; dy <= 2; dy++) {
                    const blockAtPos = getLocalBlockAt(tx, ty + dy, tz + dz);
                    if (blockAtPos !== BlockType.OBSIDIAN && blockAtPos !== BlockType.PORTAL) {
                      setLocalBlockAt(tx, ty + dy, tz + dz, BlockType.PORTAL);
                      portalCreated = true;
                    }
                  }
                }
              }
            }
          }
        }
        if (portalCreated) {
          setTimeout(() => {
            setChatMessages((p) => [...p, "¡Portal al Inframundo activado con éxito! 🌀"]);
          }, 50);
        }

        // 2. Revalidate existing portal blocks in a neighborhood of (x, y, z)
        for (let tx = x - 4; tx <= x + 4; tx++) {
          for (let ty = y - 4; ty <= y + 4; ty++) {
            for (let tz = z - 4; tz <= z + 4; tz++) {
              if (getLocalBlockAt(tx, ty, tz) === BlockType.PORTAL) {
                if (!isPortalBlockValid(tx, ty, tz, getLocalBlockAt)) {
                  setLocalBlockAt(tx, ty, tz, BlockType.AIR);
                }
              }
            }
          }
        }
      }

      const updatedWorld: World = {
        ...baseWorld,
        edits: updatedEdits,
        blockColors: updatedBlockColors,
        survivalInventory: (baseWorld as any).survivalInventory,
      };

      // Update synchronous ref immediately so rapid back-to-back edits accumulate cleanly
      latestSaveDataRef.current = {
        ...latestSaveDataRef.current,
        currentWorld: updatedWorld,
      };

      setCurrentWorld(updatedWorld);

      // Queue and coalesce rapid block edits (~450ms) so fast building/mining batches into minimal Firestore writes
      if (db && !isFirestoreWritePaused() && Object.keys(patchFields).length > 0) {
        if (queuedBlockPatchRef.current && queuedBlockPatchRef.current.worldId === updatedWorld.id) {
          Object.assign(queuedBlockPatchRef.current.patchFields, patchFields);
        } else {
          queuedBlockPatchRef.current = {
            worldId: updatedWorld.id,
            patchFields: { ...patchFields },
          };
        }

        if (!blockPatchTimerRef.current) {
          blockPatchTimerRef.current = setTimeout(() => {
            blockPatchTimerRef.current = null;
            const pending = queuedBlockPatchRef.current;
            queuedBlockPatchRef.current = null;
            if (!pending || isFirestoreWritePaused()) return;
            const worldSnapshot = latestSaveDataRef.current.currentWorld;
            const worldDocRef = doc(db, "worlds", pending.worldId);
            updateDoc(worldDocRef, pending.patchFields).catch((err) => {
              if (isQuotaExceededError(err)) {
                markFirestoreQuotaExceeded(err);
                return;
              }
              if (worldSnapshot && worldSnapshot.id === pending.worldId && !isFirestoreWritePaused()) {
                setDoc(worldDocRef, {
                  id: worldSnapshot.id,
                  name: worldSnapshot.name,
                  creator: worldSnapshot.creator,
                  creatorName: worldSnapshot.creatorName || worldSnapshot.creator,
                  createdAt: worldSnapshot.createdAt,
                  playerPos: worldSnapshot.playerPos || { x: 0, y: 80, z: 0 },
                  gameMode: worldSnapshot.gameMode || "survival",
                  worldType: worldSnapshot.worldType || "normal",
                  edits: worldSnapshot.edits || {},
                  blockColors: worldSnapshot.blockColors || {},
                  survivalInventory: worldSnapshot.survivalInventory || {},
                }, { merge: true }).catch((innerErr) => {
                  if (isQuotaExceededError(innerErr)) {
                    markFirestoreQuotaExceeded(innerErr);
                  } else {
                    console.warn("Error syncing block edits to Firestore:", innerErr);
                  }
                });
              }
            });
          }, 450);
        }
      }

      setWorlds((allWorlds) => {
        const next = allWorlds.map((w) =>
          w.id === updatedWorld.id ? updatedWorld : w,
        );
        if (!googleUser || isFirestoreWritePaused()) {
          saveWorlds(next);
        }
        return next;
      });
    },
    [currentWorld, googleUser, currentBlock, dimension],
  );

  const handleBatchWorldEdit = useCallback(
    (payload: RealmBatchEditPayload) => {
      if (!currentWorld) return;
      const baseWorld = latestSaveDataRef.current.currentWorld || currentWorld;
      const updatedEdits = { ...(baseWorld.edits || {}) };
      const updatedBlockColors = { ...(baseWorld.blockColors || {}) };
      const patchFields: Record<string, any> = {};
      const now = Date.now();
      const dimPrefix = dimension === "nether" ? "nether:" : "";

      let placedCount = 0;
      let brokenCount = 0;

      for (const [rawKey, blkVal] of Object.entries(payload.blockChanges || {})) {
        const fullKey = `${dimPrefix}${rawKey}`;
        pendingLocalEditsRef.current[fullKey] = { value: blkVal as BlockType, ts: now };
        updatedEdits[fullKey] = blkVal;
        patchFields[`edits.${fullKey}`] = blkVal;
        if (blkVal === BlockType.AIR) {
          brokenCount++;
          if (!(rawKey in (payload.colorChanges || {})) && fullKey in updatedBlockColors) {
            delete updatedBlockColors[fullKey];
            patchFields[`blockColors.${fullKey}`] = deleteField();
            pendingLocalColorsRef.current[fullKey] = { value: null, ts: now };
          }
        } else {
          placedCount++;
        }
      }

      for (const [rawKey, colorVal] of Object.entries(payload.colorChanges || {})) {
        const fullKey = `${dimPrefix}${rawKey}`;
        pendingLocalColorsRef.current[fullKey] = { value: colorVal, ts: now };
        if (colorVal === null) {
          if (fullKey in updatedBlockColors) {
            delete updatedBlockColors[fullKey];
            patchFields[`blockColors.${fullKey}`] = deleteField();
          }
        } else {
          updatedBlockColors[fullKey] = colorVal;
          patchFields[`blockColors.${fullKey}`] = colorVal;
        }
      }

      blocksPlacedRef.current += placedCount;
      blocksBrokenRef.current += brokenCount;
      if (payload.summaryLabel) {
        logUserActivity(`[Editor Realm] ${payload.summaryLabel}`);
      }

      const updatedWorld: World = {
        ...baseWorld,
        edits: updatedEdits,
        blockColors: updatedBlockColors,
        survivalInventory: (baseWorld as any).survivalInventory,
      };

      latestSaveDataRef.current = {
        ...latestSaveDataRef.current,
        currentWorld: updatedWorld,
      };
      setCurrentWorld(updatedWorld);

      if (db && !isFirestoreWritePaused() && Object.keys(patchFields).length > 0) {
        if (queuedBlockPatchRef.current && queuedBlockPatchRef.current.worldId === updatedWorld.id) {
          queuedBlockPatchRef.current = null;
        }
        batchUpdateWorldInFirestore(updatedWorld.id, patchFields).catch((err) => {
          if (isQuotaExceededError(err) || err?.message === "FIRESTORE_QUOTA_EXCEEDED") {
            markFirestoreQuotaExceeded(err);
          } else {
            saveWorldToFirestore(updatedWorld).catch(() => {});
          }
        });
      }

      setWorlds((allWorlds) => {
        const next = allWorlds.map((w) =>
          w.id === updatedWorld.id ? updatedWorld : w,
        );
        if (!googleUser || isFirestoreWritePaused()) {
          saveWorlds(next);
        }
        return next;
      });
    },
    [currentWorld, googleUser, dimension, logUserActivity],
  );

  const handleManualSave = async () => {
    if (!currentWorld) return;
    if (blockPatchTimerRef.current) {
      clearTimeout(blockPatchTimerRef.current);
      blockPatchTimerRef.current = null;
    }
    queuedBlockPatchRef.current = null;

    const updatedWorld = {
      ...currentWorld,
      playerPos: activePlayerPosRef.current,
      survivalInventory: survivalInventory,
    };

    if (googleUser && !isFirestoreWritePaused()) {
      try {
        await saveWorldToFirestore(updatedWorld);
        const dbWorlds = await loadWorldsFromFirestore((googleUser as any).uid);
        setWorlds(dbWorlds);
      } catch (e: any) {
        if (isQuotaExceededError(e) || e?.message === "FIRESTORE_QUOTA_EXCEEDED") {
          markFirestoreQuotaExceeded(e);
          setWorlds((prev) => {
            const next = prev.map((w) => (w.id === currentWorld.id ? updatedWorld : w));
            saveWorlds(next);
            return next;
          });
        } else {
          console.error("Error saving world to firestore manually:", e);
        }
      }
    } else {
      setWorlds((prev) => {
        const next = prev.map((w) =>
          w.id === currentWorld.id ? updatedWorld : w,
        );
        saveWorlds(next);
        return next;
      });
    }

    setCurrentWorld(updatedWorld);
    setScreenshotToast(
      isFirestoreWritePaused()
        ? (lang === "es" ? "¡Guardado localmente (cuota en nube pausada)!" : "Saved locally (cloud quota paused)!")
        : (lang === "es" ? "¡Mundo guardado con éxito!" : "World saved successfully!")
    );
    setTimeout(() => setScreenshotToast(null), 2500);
  };

  const handleExportWorld = () => {
    if (!currentWorld) return;
    
    const updatedWorld: World = {
      ...currentWorld,
      playerPos: activePlayerPosRef.current,
      survivalInventory: survivalInventory,
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(updatedWorld, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${currentWorld.name.replace(/\s+/g, "_")}_backup.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setScreenshotToast(lang === "es" ? "¡Mundo exportado como JSON!" : "World exported as JSON!");
    setTimeout(() => setScreenshotToast(null), 2500);
  };

  const handleImportWorld = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.id || !parsed.name || typeof parsed.edits !== "object") {
          throw new Error("Invalid world format");
        }

        const importedWorld: World = {
          ...parsed,
          id: `world_${Date.now()}_import`,
          name: parsed.name.includes("(Importado)") ? parsed.name : `${parsed.name} (Importado)`,
        };

        if (googleUser) {
          await saveWorldToFirestore(importedWorld);
          const dbWorlds = await loadWorldsFromFirestore((googleUser as any).uid);
          setWorlds(dbWorlds);
        } else {
          setWorlds((prev) => {
            const next = [...prev, importedWorld];
            saveWorlds(next);
            return next;
          });
        }

        setScreenshotToast(lang === "es" ? "¡Mundo importado correctamente!" : "World imported successfully!");
        setTimeout(() => setScreenshotToast(null), 2500);
      } catch (err) {
        setScreenshotToast(lang === "es" ? "Error al importar el archivo" : "Error importing file");
        setTimeout(() => setScreenshotToast(null), 2500);
      }
    };
    reader.readAsText(file);
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomBackgroundMusicFile(file);
      setMusicFileName(file.name);
      setIsMusicPlayingState(true);
      setIsProceduralActive(false);
    }
  };

  const handleSaveAndExit = () => {
    resumeAudio();
    setIsGameMenuOpen(false);
    if (blockPatchTimerRef.current) {
      clearTimeout(blockPatchTimerRef.current);
      blockPatchTimerRef.current = null;
    }
    queuedBlockPatchRef.current = null;

    if (currentWorld) {
      const updatedWorld: World = {
        ...currentWorld,
        playerPos: activePlayerPosRef.current || playerPos,
        survivalInventory: survivalInventory,
      };

      // 1. Save locally immediately so no progress is ever lost and transitions are instant
      setWorlds((prev) => {
        const next = prev.map((w) =>
          w.id === currentWorld.id ? updatedWorld : w,
        );
        saveWorlds(next);
        return next;
      });

      // 2. Perform cloud sync in the background if quota allows
      if (googleUser && !isFirestoreWritePaused()) {
        saveWorldToFirestore(updatedWorld)
          .then(() => flushUserStats())
          .catch((e) => {
            if (isQuotaExceededError(e) || e?.message === "FIRESTORE_QUOTA_EXCEEDED") {
              markFirestoreQuotaExceeded(e);
            } else {
              console.warn("Background cloud sync on exit:", e);
            }
          });
      }
    }

    setAppState("menu");
    setCurrentWorld(null);
  };
  const lastTouchPos = useRef<{ x: number; y: number; id: number } | null>(
    null,
  );

  const isCreativeMode = (currentWorld?.gameMode as string) === "creative" || (currentWorld?.gameMode as string) === "creativo";
  const isSpectatorMode = (currentWorld?.gameMode as string) === "spectator" || (currentWorld?.gameMode as string) === "espectador";

  const inventoryItems = isCreativeMode
    ? [
        BlockType.GRASS,
        BlockType.DIRT,
        BlockType.STONE,
        BlockType.WOOD,
        BlockType.LOG,
        BlockType.LEAVES,
        BlockType.SAND,
        BlockType.MUSHROOM_RED,
        BlockType.MUSHROOM_BROWN,
        BlockType.FLOWER_RED,
        BlockType.FLOWER_YELLOW,
        BlockType.WATER,
        BlockType.LAVA,
        BlockType.OBSIDIAN,
        BlockType.BED,
        BlockType.TORCH,
        BlockType.DOOR,
        BlockType.CRAFTING_TABLE,
        BlockType.COAL_ORE,
        BlockType.IRON_ORE,
        BlockType.GOLD_ORE,
        BlockType.REDSTONE_ORE,
        BlockType.DIAMOND_ORE,
        BlockType.BUCKET_EMPTY,
        BlockType.BUCKET_WATER,
        BlockType.BUCKET_LAVA,
        BlockType.SULFUR,
        BlockType.NETHERRACK,
        BlockType.SOUL_SAND,
        BlockType.GLOWSTONE,
        BlockType.NETHER_QUARTZ_ORE,
        BlockType.NETHER_BRICKS,
        BlockType.CRIMSON_NYLIUM,
        BlockType.WARPED_NYLIUM,
        BlockType.PORTAL,
        BlockType.CUSHION,
        BlockType.WOOL,
        BlockType.WOOL_STAIRS,
        BlockType.CONCRETE,
        BlockType.CONCRETE_STAIRS,
        BlockType.GRAVEL,
        BlockType.FLINT_AND_STEEL,
        BlockType.MAP,
        BlockType.LOCATOR_MAP,
        BlockType.REDSTONE,
        BlockType.SUGAR_CANE,
        BlockType.PAPER,
        BlockType.SUGAR,
        BlockType.CARTOGRAPHY_TABLE,
        BlockType.FURNACE,
        BlockType.BAMBOO,
        BlockType.CHEST,
        BlockType.FROG_EGGS,
        BlockType.CHICKEN_EGG,
        BlockType.CHERRY_LOG,
        BlockType.CHERRY_LEAVES,
        BlockType.CHERRY_WOOD,
        BlockType.DARK_LOG,
        BlockType.DARK_LEAVES,
        BlockType.DARK_GRASS,
        BlockType.WOOD_SWORD,
        BlockType.WOOD_PICKAXE,
        BlockType.AXE,
        BlockType.WOOD_SHOVEL,
        BlockType.STONE_SWORD,
        BlockType.PICKAXE,
        BlockType.STONE_AXE,
        BlockType.SHOVEL,
        BlockType.SWORD,
        BlockType.IRON_PICKAXE,
        BlockType.IRON_AXE,
        BlockType.IRON_SHOVEL,
        BlockType.GOLD_SWORD,
        BlockType.GOLD_PICKAXE,
        BlockType.GOLD_AXE,
        BlockType.GOLD_SHOVEL,
        BlockType.DIAMOND_SWORD,
        BlockType.DIAMOND_PICKAXE,
        BlockType.DIAMOND_AXE,
        BlockType.DIAMOND_SHOVEL,
      ]
    : (() => {
        const activeKeys = Object.keys(survivalInventory).map(Number);
        const items = activeKeys.filter((k) => (survivalInventory[k] ?? 0) > 0);
        if (currentBlock && !items.includes(currentBlock) && survivalInventory[currentBlock] !== undefined) {
          items.push(currentBlock);
        }
        return items.length > 0 ? items : [BlockType.DIRT, BlockType.WOOD, BlockType.LOG, BlockType.CRAFTING_TABLE];
      })();

  const lastIntPos = useRef({ x: NaN, y: NaN, z: NaN });

  // Keyboard controls for PC adapter
  const activeKeys = useRef<Record<string, boolean>>({});
  const inventoryItemsRef = useRef(inventoryItems);
  inventoryItemsRef.current = inventoryItems;
  const isInventoryOpenRef = useRef(isInventoryOpen);
  isInventoryOpenRef.current = isInventoryOpen;

  useEffect(() => {
    if (appState !== "playing") {
      activeKeys.current = {};
      moveVectorRef.current.x = 0;
      moveVectorRef.current.y = 0;
      setIsJumping(prev => prev ? false : prev);
      if (appState !== "settings") {
        setDimension("overworld");
      } else if (latestSaveDataRef.current.currentWorld) {
        const handleSettingsEscape = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setAppState("playing");
          }
        };
        window.addEventListener("keydown", handleSettingsEscape);
        return () => window.removeEventListener("keydown", handleSettingsEscape);
      }
      return;
    }

    const updateControls = () => {
      let forward = 0;
      let left = 0;

      if (activeKeys.current["w"] || activeKeys.current["arrowup"]) {
        forward += 1.0;
      }
      if (activeKeys.current["s"] || activeKeys.current["arrowdown"]) {
        forward -= 1.0;
      }
      if (activeKeys.current["a"] || activeKeys.current["arrowleft"]) {
        left -= 1.0;
      }
      if (activeKeys.current["d"] || activeKeys.current["arrowright"]) {
        left += 1.0;
      }

      moveVectorRef.current.x = left;
      moveVectorRef.current.y = forward;
      setIsJumping(prev => {
        const nextValue = !!activeKeys.current[" "];
        return prev === nextValue ? prev : nextValue;
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const key = e.key.toLowerCase();

      // Quick slot selection 1-9
      if (key >= "1" && key <= "9") {
        const slotIdx = parseInt(key) - 1;
        const currentItems = inventoryItemsRef.current;
        if (slotIdx < currentItems.length) {
          setCurrentBlock(currentItems[slotIdx]);
          setInteractionMode("place");
        }
        return;
      }

      // Toggle inventory with 'e' or 'i'
      if (key === "e" || key === "i") {
        setIsInventoryOpen(prev => !prev);
        e.preventDefault();
        return;
      }

      // Escape key to exit inventory or open in-game menu
      if (e.key === "Escape") {
        if (isInventoryOpenRef.current) {
          setIsInventoryOpen(false);
        } else {
          resumeAudio();
          setIsGameMenuOpen(prev => !prev);
        }
        e.preventDefault();
        return;
      }

      activeKeys.current[key] = true;
      if (e.key === " ") {
        activeKeys.current[" "] = true;
      }
      if (key === "c" || key === "z") {
        setIsZooming(true);
      }

      updateControls();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const key = e.key.toLowerCase();
      activeKeys.current[key] = false;
      if (e.key === " ") {
        activeKeys.current[" "] = false;
      }
      if (key === "c" || key === "z") {
        setIsZooming(false);
      }

      updateControls();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handleBlur = () => {
      activeKeys.current = {};
      moveVectorRef.current.x = 0;
      moveVectorRef.current.y = 0;
      lastTouchPos.current = null;
      setIsJumping(prev => prev ? false : prev);
      setIsZooming(false);
    };
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [appState]);

  const lastChunkReactRef = useRef({ cx: NaN, cz: NaN, farZone: 0 });
  const handlePosChange = useCallback((newPos: Vector3D) => {
    activePlayerPosRef.current = newPos;
    const ix = Math.round(newPos.x);
    const iy = Math.round(newPos.y);
    const iz = Math.round(newPos.z);
    
    if (ix !== lastIntPos.current.x || iy !== lastIntPos.current.y || iz !== lastIntPos.current.z) {
      lastIntPos.current = { x: ix, y: iy, z: iz };
      const el = document.getElementById("player-coordinates-hud");
      if (el) {
        el.textContent = `X:${ix} Y:${iy - 55} Z:${iz}`;
      }

      // Only trigger full React re-render on chunk crossings or Far Lands threshold changes
      const cx = Math.floor(newPos.x / 16);
      const cz = Math.floor(newPos.z / 16);
      const maxAbs = Math.max(Math.abs(newPos.x), Math.abs(newPos.z));
      const farZone = maxAbs >= 2000 ? 2 : maxAbs >= 1500 ? 1 : 0;
      if (
        cx !== lastChunkReactRef.current.cx ||
        cz !== lastChunkReactRef.current.cz ||
        farZone !== lastChunkReactRef.current.farZone
      ) {
        lastChunkReactRef.current = { cx, cz, farZone };
        setPlayerPos(newPos);
      }
    }
  }, []);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    resumeAudio();
    if ("changedTouches" in e) {
      // Do not hijack camera look drag if another finger is already rotating the camera
      if (lastTouchPos.current !== null && lastTouchPos.current.id !== -1) {
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) return;
      lastTouchPos.current = {
        x: touch.clientX,
        y: touch.clientY,
        id: touch.identifier,
      };
    } else {
      // Ignore synthetic mouse events while an active touch drag is tracked or non-primary mouse buttons
      if (lastTouchPos.current !== null && lastTouchPos.current.id !== -1) {
        return;
      }
      const mouseEv = e as React.MouseEvent;
      if (mouseEv.button !== 0) return;
      lastTouchPos.current = {
        x: mouseEv.clientX,
        y: mouseEv.clientY,
        id: -1,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!lastTouchPos.current) return;

    let clientX, clientY;
    if ("changedTouches" in e) {
      if (lastTouchPos.current.id === -1) return;
      let touch;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lastTouchPos.current.id) {
          touch = e.changedTouches[i];
          break;
        }
      }
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      if (lastTouchPos.current.id !== -1) return;
      const mouseEv = e as React.MouseEvent;
      if ((mouseEv.buttons & 1) === 0) {
        lastTouchPos.current = null;
        return;
      }
      clientX = mouseEv.clientX;
      clientY = mouseEv.clientY;
    }

    const rawDx = clientX - lastTouchPos.current.x;
    const rawDy = clientY - lastTouchPos.current.y;
    const rotDx = virtualRotationDeg === 90 ? rawDy : virtualRotationDeg === -90 ? -rawDy : rawDx;
    const rotDy = virtualRotationDeg === 90 ? -rawDx : virtualRotationDeg === -90 ? rawDx : rawDy;
    lookOffsetRef.current.x += rotDx;
    lookOffsetRef.current.y += rotDy;

    lastTouchPos.current.x = clientX;
    lastTouchPos.current.y = clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (!lastTouchPos.current) return;
    if ("changedTouches" in e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lastTouchPos.current.id) {
          lastTouchPos.current = null;
          break;
        }
      }
    } else if (lastTouchPos.current.id === -1) {
      lastTouchPos.current = null;
    }
  };

  const handleGetBuildingSuggestion = async () => {
    resumeAudio();
    setIsLoadingSuggestion(true);
    // Dynamic context based on current environment and items
    const availableBlocks = inventoryItems.map((item) => BLOCK_NAMES[item]);
    const biome =
      activePlayerPosRef.current.y - 55 > 10 ? dict[lang].biome_high : dict[lang].biome_low;
    const res = await getBuildingSuggestion(biome, availableBlocks);
    if (res) {
      setSuggestion(res);
    }
    setIsLoadingSuggestion(false);
  };

  const handleOpenCraftingTable = useCallback(() => {
    setIsCraftingTableActive(true);
    setInventoryTab("crafting");
    setIsInventoryOpen(true);
  }, []);
  const handleOpenFurnace = useCallback(() => setIsFurnaceOpen(true), []);
  const handleOpenCartographyTable = useCallback(() => setIsCartographyOpen(true), []);
  const handleOpenChest = useCallback(() => setIsChestOpen(true), []);
  const handleUseMap = useCallback(() => setIsMapOpen(true), []);

  const handleCaptureScreenshot = () => {
    resumeAudio();
    const captureBridge = (window as any).__captureVoxelScreenshot as (() => string) | undefined;
    const container = document.getElementById("voxel-canvas");
    const canvas = (container?.tagName === "CANVAS" 
      ? container 
      : container?.querySelector("canvas") || document.querySelector("canvas")) as HTMLCanvasElement | null;
    
    if (captureBridge || canvas) {
      try {
        // Trigger camera flash
        setShowCameraFlash(true);
        setFlashOpacity(1);
        setTimeout(() => {
          setFlashOpacity(0);
        }, 50);
        setTimeout(() => {
          setShowCameraFlash(false);
        }, 550);

        // Capture frame as image (uses immediate re-render bridge when preserveDrawingBuffer is false)
        const dataUrl = captureBridge ? captureBridge() : canvas!.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = `voxelworld-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();

        // Show Toast
        setScreenshotToast(t.screenshot_saved);
        setTimeout(() => {
          setScreenshotToast(null);
        }, 3000);
      } catch (err) {
        console.error("Error capturing frame:", err);
      }
    } else {
      console.error("Voxel world canvas element not found");
    }
  };

  const t = dict[lang];

  const renderAppScreen = () => {
  if (appState === "login-prompt") {
    const compactSideBySide = isVeryCompactHeight && !isPortrait;
    return (
      <div className="w-full h-full bg-slate-900 relative overflow-hidden select-none">
        {/* 3D Rotating Voxel Panorama */}
        <MenuPanorama3D 
          showLogo={false} 
          onEnterCinemaMode={() => setIsCinemaMode(!isCinemaMode)} 
          isCinemaMode={isCinemaMode} 
        />

        <div className={`relative z-10 w-full h-full safe-area-inset overflow-y-auto overscroll-contain flex ${compactSideBySide ? "flex-row items-center justify-center gap-4 px-3 py-2 pt-12" : "flex-col items-center justify-between px-4 sm:px-6 pt-14 pb-4 sm:py-8"} transition-all duration-300 ${isCinemaMode ? "opacity-0 pointer-events-none scale-95" : "opacity-100 scale-100"}`}>
          {/* Official Adventure Alpha Mobile Logo + Corner Star Splash + 3-Tap Cat Easter Eggs */}
          <div className={`flex flex-col items-center justify-center shrink-0 ${compactSideBySide ? "my-auto" : "my-auto flex-1"}`}>
            <div className="relative inline-flex items-center justify-center">
              <button
                type="button"
                onClick={handleTitleEasterEggTap}
                className="relative cursor-pointer active:scale-95 transition-transform duration-150 focus:outline-none select-none bg-transparent border-0 p-0"
                title="Adventure Alpha Mobile"
              >
                <img
                  src="./assets/adventure-alpha-emblem.png"
                  alt="Adventure Alpha Mobile"
                  className={`${compactSideBySide ? "w-32 h-32" : "w-40 h-40 sm:w-56 sm:h-56 md:w-64 md:h-64"} max-h-[36dvh] aspect-square object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.8)]`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = "./assets/aistudio/1794943627139_ac65a7dd.jpg"; }}
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSplashEasterEggTap();
                }}
                className="splash-bounce-tilt absolute -bottom-1 sm:bottom-1 -right-1 sm:-right-6 z-20 text-[#ffff55] font-extrabold text-[10px] sm:text-xs md:text-sm tracking-wide font-mono px-2 py-0.5 select-none cursor-pointer bg-transparent border-0 max-w-[175px] sm:max-w-[230px] leading-tight text-center"
                style={{
                  textShadow: "2px 2px 0px #3f3f00, 3px 3px 0px #000",
                }}
              >
                ★ {MENU_SPLASHES[splashIndex]} ★
              </button>
            </div>
          </div>

          <div className={`max-w-[min(310px,calc(100vw-2rem))] sm:max-w-sm w-full flex flex-col items-center my-auto ${compactSideBySide ? "gap-1.5" : "gap-2.5 mb-1 sm:mb-2"}`}>
            <p className="text-white font-extrabold text-center text-xs md:text-sm minecraft-font drop-shadow-[2px_2px_0_#000] bg-black/75 px-4 py-1.5 rounded-full border border-white/10">
              {t.login_prompt}
            </p>

            {loginError && (
              <div className="w-full bg-red-950/90 border border-red-400/50 text-red-200 px-3 py-2 rounded-xl text-[11px] font-mono font-bold flex items-start justify-between gap-2 shadow-lg">
                <span className="leading-snug">
                  <i className="fas fa-circle-exclamation mr-1.5 text-red-400" />
                  {loginError}
                </span>
                <button
                  type="button"
                  onClick={() => setLoginError("")}
                  className="text-red-300 hover:text-white shrink-0 bg-transparent border-0 p-0.5 cursor-pointer"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            )}

            <div className="flex flex-col w-full gap-2">
              {/* Google Login button */}
              <button
                type="button"
                disabled={isGoogleLoginLoading}
                onClick={handleGoogleLogin}
                className="w-full py-2.5 sm:py-3 px-4 rounded-lg text-zinc-900 font-extrabold text-xs sm:text-sm uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-2 border-t-2 border-l-2 border-white border-b-4 border-r-4 border-zinc-400 bg-gradient-to-b from-white via-zinc-100 to-zinc-200 shadow-[0_4px_0_#71717a,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#71717a] hover:brightness-105 cursor-pointer disabled:opacity-65 disabled:cursor-wait"
                style={{
                  textShadow: "1px 1px 0px rgba(255,255,255,0.7)"
                }}
              >
                <i className={isGoogleLoginLoading ? "fas fa-spinner fa-spin text-zinc-700 text-sm" : "fab fa-google text-red-500 text-sm"} />
                <span>{isGoogleLoginLoading ? (lang === "es" ? "Conectando..." : "Connecting...") : t.login_google}</span>
              </button>

              {/* Sign in button */}
              <button
                type="button"
                onClick={handleChooseSignIn}
                className="w-full py-2.5 sm:py-3 px-4 rounded-lg text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-2 border-t-2 border-l-2 border-emerald-300 border-b-4 border-r-4 border-emerald-950 bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-800 shadow-[0_4px_0_#064e3b,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#064e3b] hover:brightness-110 cursor-pointer"
                style={{
                  textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
                  backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, #10b981, #059669, #065f46)",
                  backgroundSize: "4px 4px, 4px 4px, 100% 100%"
                }}
              >
                <i className="fas fa-lock text-emerald-200 text-xs" /> {t.option_sign_in}
              </button>

              {/* Guest button */}
              <button
                type="button"
                onClick={handleChooseGuest}
                className="w-full py-2.5 sm:py-3 px-4 rounded-lg text-white/90 font-extrabold text-xs sm:text-sm uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-2 border-t-2 border-l-2 border-zinc-400 border-b-4 border-r-4 border-zinc-950 bg-gradient-to-b from-zinc-600 via-zinc-700 to-zinc-800 shadow-[0_4px_0_#18181b,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#18181b] hover:brightness-110 cursor-pointer"
                style={{
                  textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
                  backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, #52525b, #3f3f46, #27272a)",
                  backgroundSize: "4px 4px, 4px 4px, 100% 100%"
                }}
              >
                <i className="fas fa-user-secret text-zinc-300 text-xs" /> {t.option_guest}
              </button>
            </div>
            
            <div className="text-white/55 font-mono text-[9px] select-none uppercase tracking-widest text-center font-bold mt-0.5">
              Adventure Alpha Mobile 1.0.2
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === "login") {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center safe-area-inset p-4 sm:p-6 relative overflow-y-auto select-none">
        {/* 3D Rotating Voxel Panorama */}
        <MenuPanorama3D 
          showLogo={false} 
          onEnterCinemaMode={() => setIsCinemaMode(!isCinemaMode)} 
          isCinemaMode={isCinemaMode} 
        />

        <div
          onPointerDown={(e) => e.stopPropagation()}
          className={`z-10 bg-zinc-950/94 p-5 sm:p-7 rounded-3xl border border-white/20 flex flex-col items-center shadow-2xl max-w-[min(24rem,calc(100vw-1rem))] w-full my-auto transition-all duration-300 ${isCinemaMode ? "opacity-0 pointer-events-none scale-95" : "opacity-100 scale-100"}`}
        >
          <img
            src="./assets/adventure-alpha-emblem.png"
            alt="Adventure Alpha Mobile"
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain mb-2 drop-shadow-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "./assets/aistudio/1794943627139_ac65a7dd.jpg"; }}
          />
          <h2 className="text-white text-2xl sm:text-3xl font-bold minecraft-font uppercase tracking-tighter mb-3 text-center drop-shadow-lg">
            {t.option_sign_in}
          </h2>

          <button
            type="button"
            disabled={isGoogleLoginLoading}
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-zinc-100 text-zinc-900 font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 text-center flex items-center justify-center gap-2 mb-4 border border-zinc-200 shadow-md cursor-pointer disabled:opacity-65 disabled:cursor-wait"
          >
            <i className={isGoogleLoginLoading ? "fas fa-spinner fa-spin text-zinc-700 text-sm" : "fab fa-google text-red-500 text-sm"} />
            <span>{isGoogleLoginLoading ? (lang === "es" ? "Conectando..." : "Connecting...") : t.login_google}</span>
          </button>

          <div className="w-full flex items-center gap-2 mb-3">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold">o / or</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          {profiles.length > 0 && (
            <div className="w-full mb-3">
              <div className="text-[9px] text-zinc-400 uppercase font-mono font-bold mb-1.5">
                {lang === "es" ? "Perfiles guardados:" : "Saved profiles:"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profiles.slice(0, 6).map((prof) => (
                  <button
                    key={prof.username}
                    type="button"
                    onClick={() => {
                      setUsernameInput(prof.username);
                      setLoginError("");
                      if (!prof.pin) {
                        setCurrentUser(prof.username);
                        setActiveSession(prof.username);
                        setAppState("menu");
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                      usernameInput.trim().toLowerCase() === prof.username.toLowerCase()
                        ? "bg-emerald-500/25 border-emerald-400 text-emerald-200"
                        : "bg-zinc-900 border-white/15 text-zinc-300 hover:border-emerald-400/50"
                    }`}
                  >
                    <i className={`fas ${prof.pin ? "fa-lock" : "fa-user"} text-[9px] mr-1 opacity-70`} />
                    {prof.username}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleLoginOrRegister} className="flex flex-col w-full gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.username}
              </label>
              <input
                type="text"
                autoComplete="username"
                placeholder={t.username}
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value);
                  if (loginError) setLoginError("");
                }}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-emerald-400 font-bold select-text"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.pin} <span className="text-[8px] text-zinc-500 font-normal">({t.optional})</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPinInput ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="1234"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 pl-4 pr-11 text-white text-sm focus:outline-none focus:border-emerald-400 tracking-widest font-bold select-text"
                />
                <button
                  type="button"
                  onClick={() => setShowPinInput((v) => !v)}
                  className="absolute right-3 text-zinc-400 hover:text-white bg-transparent border-0 p-1 cursor-pointer"
                  aria-label={showPinInput ? "Ocultar PIN" : "Mostrar PIN"}
                >
                  <i className={`fas ${showPinInput ? "fa-eye-slash" : "fa-eye"} text-xs`} />
                </button>
              </div>
            </div>

            {loginError && (
              <div className="bg-red-950/90 border border-red-400/50 text-red-200 px-3 py-2 rounded-xl text-xs font-mono font-bold text-center">
                <i className="fas fa-circle-exclamation mr-1 text-red-400" />
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5 rounded-xl text-center uppercase tracking-wider transition-all active:scale-95 mt-1 shadow-lg shadow-emerald-500/15 text-xs sm:text-sm cursor-pointer"
            >
              {t.register_btn}
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginError("");
                setAppState("login-prompt");
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white/70 font-semibold py-2 rounded-xl text-center text-xs uppercase transition-all cursor-pointer"
            >
              {t.back}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // worlds-list screen moved below modal renderers so renderRealmsModal and renderShopModal are initialized


  const handleJoinFriendWorld = async (
    worldId: string,
    targetPlayerPos?: Vector3D,
    targetDimension?: "overworld" | "nether",
    realmIdOverride?: string | null
  ) => {
    const cleanId = worldId.trim();
    if (!cleanId) return;
    try {
      setFriendshipError("");
      setFriendshipLoading(true);
      const worldSnap = await getDoc(doc(db, "worlds", cleanId));
      if (worldSnap.exists()) {
        const worldData = worldSnap.data() as World;
        let spawnPos = targetPlayerPos
          ? { x: targetPlayerPos.x + 2, y: targetPlayerPos.y + 0.5, z: targetPlayerPos.z + 2 }
          : (worldData.playerPos || { x: 0, y: worldData.worldType === "flat" ? 58 : 80, z: 0 });
        let spawnDim: "overworld" | "nether" = targetDimension || "overworld";

        // If no explicit friend pos given, try spawning near an active player inside that world
        if (!targetPlayerPos) {
          try {
            const pSnap = await getDocs(collection(db, "worlds", cleanId, "players"));
            const now = Date.now();
            pSnap.forEach((d) => {
              const p = d.data();
              if (p && p.id !== multiplayerUserIdRef.current && Math.abs(now - (p.lastActive || 0)) < 90000 && p.pos) {
                spawnPos = {
                  x: (typeof p.pos.x === "number" ? p.pos.x : 0) + 2,
                  y: (typeof p.pos.y === "number" ? p.pos.y : 80) + 0.5,
                  z: (typeof p.pos.z === "number" ? p.pos.z : 0) + 2,
                };
                if (p.dimension === "nether" || p.dimension === "overworld") {
                  spawnDim = p.dimension;
                }
              }
            });
          } catch {}
        }

        setIsFriendsOpen(false);
        setIsRealmsOpen(false);
        setIsGameMenuOpen(false);
        setActiveRealmId(realmIdOverride ?? null);
        setDimension(spawnDim);
        setPlayerPos(spawnPos);
        activePlayerPosRef.current = spawnPos;
        if (worldData.survivalInventory && Object.keys(worldData.survivalInventory).length > 0) {
          setSurvivalInventory(worldData.survivalInventory);
        }
        setCurrentWorld(worldData);
        setAppState("playing");
        setChatMessages((p) => [...p, `🌍 ¡Te uniste al mundo '${worldData.name}'! Escribe en el chat para saludar.`]);
      } else {
        setFriendshipError("Mundo no encontrado. Verifica el código o pide a tu amigo que entre primero al mundo.");
      }
    } catch (err) {
      console.error(err);
      setFriendshipError("Error al unirse al mundo.");
    } finally {
      setFriendshipLoading(false);
    }
  };

  const handleJoinByWorldCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinWorldCodeInput.trim()) return;
    await handleJoinFriendWorld(joinWorldCodeInput.trim());
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFriendshipError("");
    setFriendshipSuccess("");
    const target = friendSearchEmail.trim();
    if (!target) return;

    if (target.toLowerCase() === activeSession?.toLowerCase() || (googleUser && target.toLowerCase() === googleUser.email?.toLowerCase())) {
      setFriendshipError(lang === "es" ? "No puedes enviarte una solicitud a ti mismo." : "You cannot send a request to yourself.");
      return;
    }

    setFriendshipLoading(true);
    try {
      const friendshipId = [activeSession, target.replace(/[@.]/g, "_")].sort().join("__");
      await setDoc(doc(db, "friendships", friendshipId), {
        id: friendshipId,
        senderId: activeSession,
        senderName: currentUser || "Invitado",
        receiverId: target.toLowerCase(),
        status: "pending",
        timestamp: Date.now()
      });
      setFriendshipSuccess(lang === "es" ? "¡Solicitud de amistad enviada con éxito!" : "Friend request sent successfully!");
      setFriendSearchEmail("");
    } catch (err) {
      console.error(err);
      setFriendshipError(lang === "es" ? "Error al enviar solicitud." : "Error sending request.");
    } finally {
      setFriendshipLoading(false);
    }
  };

  const handleAcceptFriend = async (id: string) => {
    setFriendshipError("");
    setFriendshipSuccess("");
    setFriendshipLoading(true);
    try {
      await setDoc(doc(db, "friendships", id), { status: "accepted" }, { merge: true });
      setFriendshipSuccess(lang === "es" ? "¡Solicitud aceptada!" : "Request accepted!");
    } catch (err) {
      console.error(err);
      setFriendshipError(lang === "es" ? "Error al aceptar solicitud." : "Error accepting request.");
    } finally {
      setFriendshipLoading(false);
    }
  };

  const handleDeclineOrRemoveFriend = async (id: string) => {
    setFriendshipError("");
    setFriendshipSuccess("");
    setFriendshipLoading(true);
    try {
      await deleteDoc(doc(db, "friendships", id));
      setFriendshipSuccess(lang === "es" ? "Amigo eliminado / Solicitud rechazada" : "Friend removed / Request declined");
    } catch (err) {
      console.error(err);
      setFriendshipError(lang === "es" ? "Error al procesar la acción." : "Error processing action.");
    } finally {
      setFriendshipLoading(false);
    }
  };

  const renderFriendsModal = () => {
    if (!isFriendsOpen) return null;

    // Filter incoming requests: status is pending AND receiver is me
    const incomingRequests = friendships.filter(
      (f) => f.status === "pending" && (f.receiverId === activeSession || (googleUser && f.receiverId === googleUser.email?.toLowerCase()))
    );

    // Filter sent requests: status is pending AND sender is me
    const sentRequests = friendships.filter(
      (f) => f.status === "pending" && f.senderId === activeSession
    );

    // Filter accepted friendships
    const friendsList = friendships.filter((f) => f.status === "accepted");

    return (
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 bg-black/88 z-[100020] flex flex-col items-center justify-start safe-area-inset p-2 sm:p-4 overflow-y-auto overscroll-contain pointer-events-auto text-left animate-in fade-in duration-200"
      >
        <div className="bg-zinc-900 border-4 border-purple-600 p-4 sm:p-8 rounded-2xl w-full max-w-[min(42rem,calc(100vw-1rem))] shadow-2xl flex flex-col gap-3 sm:gap-4 relative text-white font-sans max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-zinc-700 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/40">
                <i className="fas fa-users text-purple-400 text-xl" />
              </div>
              <div className="text-left">
                <h2 className="text-2xl font-bold minecraft-font uppercase tracking-wide text-purple-400">
                  {lang === "es" ? "Sistema de Amigos" : "Friends System"}
                </h2>
                <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider font-bold">
                  {lang === "es" ? "Multijugador en Línea y Conexiones" : "Online Multiplayer & Connections"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resumeAudio();
                  setIsFriendsOpen(false);
                  setRealmStatusMsg(null);
                  setIsRealmsOpen(true);
                }}
                className="bg-cyan-600/25 hover:bg-cyan-600/40 border border-cyan-400/40 text-cyan-200 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              >
                <i className="fas fa-chess-rook" />
                <span>Realms</span>
              </button>
              <button
                onClick={() => {
                  setIsFriendsOpen(false);
                  setFriendshipError("");
                  setFriendshipSuccess("");
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center border border-zinc-700 transition"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {/* Error and Success alerts */}
          {friendshipError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 font-mono">
              <i className="fas fa-circle-exclamation" /> {friendshipError}
            </div>
          )}
          {friendshipSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 font-mono">
              <i className="fas fa-circle-check" /> {friendshipSuccess}
            </div>
          )}

          {/* Amigo IA Companion Section */}
          <div className="bg-gradient-to-br from-cyan-950/70 via-zinc-950/90 to-indigo-950/70 border border-cyan-500/40 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-base">
                  🤖
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300">
                    {lang === "es" ? "Amigo IA (Juega como un Jugador)" : "AI Friend (Plays Like a Player)"}
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    {lang === "es"
                      ? "Camina, nada, mina, tala, construye refugios, combate mobs y conversa contigo."
                      : "Walks, swims, mines, chops, builds shelters, fights mobs & chats with you."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  resumeAudio();
                  setAiCompanionConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
                }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition active:scale-95 shrink-0 ${
                  aiCompanionConfig.enabled
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : "bg-cyan-600 hover:bg-cyan-500 text-white"
                }`}
              >
                {aiCompanionConfig.enabled
                  ? (lang === "es" ? "Desactivar" : "Dismiss")
                  : (lang === "es" ? "Invocar Amigo IA" : "Summon AI Friend")}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2 bg-zinc-900/80 border border-white/10 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase shrink-0">
                  {lang === "es" ? "Nombre:" : "Name:"}
                </span>
                <input
                  type="text"
                  maxLength={18}
                  value={aiCompanionConfig.name}
                  onChange={(e) => setAiCompanionConfig((prev) => ({ ...prev, name: e.target.value }))}
                  className="flex-1 bg-transparent text-white text-xs font-bold focus:outline-none"
                  placeholder="Alex IA"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto bg-zinc-900/80 border border-white/10 rounded-lg px-2 py-1">
                {(["explorer", "cyber", "knight", "mage", "classic", "dragon"] as CharacterSkinId[]).map((sid) => (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => setAiCompanionConfig((prev) => ({ ...prev, skinId: sid }))}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 transition ${
                      aiCompanionConfig.skinId === sid
                        ? "bg-cyan-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {sid}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {([
                { id: "follow", label: lang === "es" ? "🤝 Seguir" : "🤝 Follow" },
                { id: "gather", label: lang === "es" ? "⛏️ Minar/Talar" : "⛏️ Gather" },
                { id: "build", label: lang === "es" ? "🏠 Construir" : "🏠 Build" },
                { id: "guard", label: lang === "es" ? "⚔️ Proteger" : "⚔️ Guard" },
                { id: "explore", label: lang === "es" ? "🧭 Explorar" : "🧭 Explore" },
                { id: "stay", label: lang === "es" ? "🛑 Esperar" : "🛑 Stay" },
              ] as { id: AICompanionMode; label: string }[]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: m.id }))}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition active:scale-95 ${
                    aiCompanionConfig.enabled && aiCompanionConfig.mode === m.id
                      ? "bg-emerald-600 text-white border border-emerald-400/50"
                      : "bg-zinc-900/90 text-zinc-300 border border-white/10 hover:bg-zinc-800"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* World Code Share & Join Section */}
          <div className="bg-zinc-950/80 border border-emerald-500/30 rounded-xl p-3 flex flex-col gap-2">
            {currentWorld && (
              <div className="flex items-center justify-between gap-2 bg-emerald-950/30 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                <div className="flex flex-col truncate">
                  <span className="text-[9px] uppercase font-bold text-emerald-400">
                    {lang === "es" ? "Código de tu Mundo Actual (Compártelo)" : "Current World Code"}
                  </span>
                  <span className="text-xs font-mono text-white font-bold truncate">{currentWorld.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(currentWorld.id);
                    setFriendshipSuccess(lang === "es" ? "¡Código del mundo copiado!" : "World code copied!");
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition active:scale-95 flex items-center gap-1"
                >
                  <i className="fas fa-copy" /> {lang === "es" ? "Copiar" : "Copy"}
                </button>
              </div>
            )}

            <form onSubmit={handleJoinByWorldCode} className="flex gap-2">
              <input
                type="text"
                placeholder={lang === "es" ? "Unirse por Código del Mundo (ej: world_...)" : "Join by World Code (e.g. world_...)"}
                value={joinWorldCodeInput}
                onChange={(e) => setJoinWorldCodeInput(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 text-white rounded-lg px-3 py-2 text-xs focus:outline-none transition font-mono"
              />
              <button
                type="submit"
                disabled={friendshipLoading || !joinWorldCodeInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-lg text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
              >
                <i className="fas fa-door-open" />
                {lang === "es" ? "Unirse" : "Join"}
              </button>
            </form>
          </div>

          {/* Add Friend Form */}
          <form onSubmit={handleSendFriendRequest} className="flex gap-2">
            <input
              type="text"
              placeholder={lang === "es" ? "Ingresa ID de Invitado o Correo de Google..." : "Enter Guest ID or Google Email..."}
              value={friendSearchEmail}
              onChange={(e) => setFriendSearchEmail(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-purple-500 text-white rounded-lg px-4 py-2 text-xs focus:outline-none transition font-mono"
            />
            <button
              type="submit"
              disabled={friendshipLoading}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 shrink-0"
            >
              {friendshipLoading ? (
                <i className="fas fa-spinner animate-spin" />
              ) : (
                <i className="fas fa-user-plus" />
              )}
              {lang === "es" ? "Añadir" : "Add"}
            </button>
          </form>

          {/* Active Online Players Discovery Strip */}
          {(() => {
            const now = Date.now();
            const liveOthers = Object.values(onlinePlayers).filter(
              (p: any) => p && p.id !== activeSession && p.id !== multiplayerUserIdRef.current && (now - (p.lastActive || 0)) < 25000
            );
            if (liveOthers.length === 0) return null;
            return (
              <div className="bg-zinc-950/60 border border-sky-500/25 rounded-xl p-2.5 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {lang === "es" ? `Jugadores en Línea Ahora (${liveOthers.length})` : `Players Online Now (${liveOthers.length})`}
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {liveOthers.map((op: any) => (
                    <div key={op.id} className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shrink-0">
                      <div className="flex flex-col text-left">
                        <span className="text-[11px] font-bold text-white truncate max-w-[110px]">{op.name || "Jugador"}</span>
                        <span className="text-[8px] text-zinc-400 font-mono truncate max-w-[110px]">
                          {op.worldId ? `🌍 ${op.worldName || "Mundo"}` : (lang === "es" ? "En Menú" : "In Menu")}
                        </span>
                      </div>
                      {op.worldId && (
                        <button
                          type="button"
                          onClick={() => handleJoinFriendWorld(op.worldId, op.pos, op.dimension)}
                          className="bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] font-black px-2 py-1 rounded uppercase transition active:scale-95"
                        >
                          {lang === "es" ? "Entrar" : "Join"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Content tabs / columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1 max-h-[50vh]">
            
            {/* Friends list */}
            <div className="flex flex-col gap-2.5">
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider border-b border-zinc-800 pb-1 flex items-center gap-2">
                <i className="fas fa-user-group text-purple-400" />
                {lang === "es" ? "Mis Amigos" : "My Friends"} ({friendsList.length})
              </h3>
              
              {friendsList.length === 0 ? (
                <div className="text-zinc-500 text-xs italic py-6 text-center">
                  {lang === "es" ? "No has agregado amigos aún." : "No friends added yet."}
                </div>
              ) : (
                friendsList.map((f) => {
                  const isSenderMe = f.senderId === activeSession;
                  const friendId = isSenderMe ? f.receiverId : f.senderId;
                  const friendName = isSenderMe ? (f.receiverName || f.receiverId) : f.senderName;
                  
                  // Lookup if friend is online
                  const onlineData = onlinePlayers[friendId] || Object.values(onlinePlayers).find(p => p.email?.toLowerCase() === friendId.toLowerCase());
                  const isOnline = !!onlineData && (Date.now() - (onlineData.lastActive || 0) < 15000);
                  const isPlaying = isOnline && !!onlineData.worldId;

                  return (
                    <div key={f.id} className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-2 transition hover:border-zinc-700/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-zinc-600"}`} />
                          <div className="text-left">
                            <p className="text-xs font-bold truncate max-w-[140px] text-zinc-100">{friendName}</p>
                            <p className="text-[9px] text-zinc-500 font-mono truncate max-w-[140px] uppercase">{friendId}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeclineOrRemoveFriend(f.id)}
                          className="text-zinc-600 hover:text-red-400 text-[10px] uppercase font-bold p-1 transition"
                          title={lang === "es" ? "Eliminar Amigo" : "Remove Friend"}
                        >
                          <i className="fas fa-user-minus" />
                        </button>
                      </div>

                      {isOnline && (
                        <div className="bg-purple-950/20 border border-purple-900/30 rounded-lg p-2 flex flex-col gap-1.5 mt-0.5">
                          <p className="text-[9px] text-purple-300 font-mono font-semibold flex items-center gap-1">
                            <i className="fas fa-gamepad animate-pulse text-purple-400" />
                            {isPlaying ? `${lang === "es" ? "Jugando:" : "Playing:"} ${onlineData.worldName}` : (lang === "es" ? "En el menú" : "In menu")}
                          </p>
                          {isPlaying && (
                            <button
                              onClick={() => handleJoinFriendWorld(onlineData.worldId, onlineData.pos, onlineData.dimension)}
                              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] font-bold py-1.5 px-2 rounded uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow"
                            >
                              <i className="fas fa-arrow-right-to-bracket animate-bounce" />
                              {lang === "es" ? "Unirse al Mundo" : "Join World"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Requests columns */}
            <div className="flex flex-col gap-4">
              
              {/* Incoming */}
              <div className="flex flex-col gap-2">
                <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider border-b border-zinc-800 pb-1 flex items-center gap-2">
                  <i className="fas fa-envelope-open-text text-amber-400" />
                  {lang === "es" ? "Solicitudes Recibidas" : "Incoming Requests"} ({incomingRequests.length})
                </h3>
                
                {incomingRequests.length === 0 ? (
                  <div className="text-zinc-500 text-[10px] italic py-4 text-center">
                    {lang === "es" ? "No tienes solicitudes pendientes." : "No pending requests."}
                  </div>
                ) : (
                  incomingRequests.map((r) => (
                    <div key={r.id} className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div className="text-left truncate">
                        <p className="text-xs font-bold text-zinc-200 truncate">{r.senderName}</p>
                        <p className="text-[8px] text-zinc-500 font-mono truncate">{r.senderId}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleAcceptFriend(r.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-2 py-1 rounded text-[10px] uppercase transition active:scale-95"
                        >
                          <i className="fas fa-check" />
                        </button>
                        <button
                          onClick={() => handleDeclineOrRemoveFriend(r.id)}
                          className="bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-white font-extrabold px-2 py-1 rounded text-[10px] uppercase transition active:scale-95"
                        >
                          <i className="fas fa-times" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Sent Requests */}
              <div className="flex flex-col gap-2">
                <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider border-b border-zinc-800 pb-1 flex items-center gap-2">
                  <i className="fas fa-paper-plane text-zinc-400" />
                  {lang === "es" ? "Solicitudes Enviadas" : "Sent Requests"} ({sentRequests.length})
                </h3>
                
                {sentRequests.length === 0 ? (
                  <div className="text-zinc-500 text-[10px] italic py-4 text-center">
                    {lang === "es" ? "No has enviado solicitudes." : "No sent requests."}
                  </div>
                ) : (
                  sentRequests.map((r) => (
                    <div key={r.id} className="bg-zinc-950/20 border border-zinc-800/50 rounded-xl p-2.5 flex items-center justify-between gap-2">
                      <div className="text-left truncate">
                        <p className="text-xs text-zinc-400 truncate font-semibold">{r.receiverId}</p>
                      </div>
                      <button
                        onClick={() => handleDeclineOrRemoveFriend(r.id)}
                        className="text-zinc-500 hover:text-red-400 text-[10px] p-1"
                      >
                        <i className="fas fa-trash-can" />
                      </button>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>

        </div>
      </div>
    );
  };

  const playPurchaseChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 -> E5 -> G5 -> C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.5);
      });
    } catch (e) {
      console.error("Error playing purchase chime:", e);
    }
  };

  interface StoreProductDef {
    id:
      | "indef_500"
      | "indef_1500"
      | "indef_4000"
      | "indef_10000"
      | "vip_pass"
      | "mvp_plus"
      | "aquatic_vip"
      | "unlocked_worlds"
      | "realm_basic"
      | "realm_plus"
      | "skin_dragon"
      | "skin_angel"
      | "skin_titan"
      | "skin_poseidon"
      | "skin_obsidian"
      | "kit_builder"
      | "kit_explorer_pro"
      | "kit_aquatic_starter"
      | "cape_royal";
    category: "indefs" | "passes" | "realms" | "skins" | "cosmetics";
    name: string;
    priceUsd: number;
    priceIndefs?: number;
    indefGrant?: number;
    badge?: string;
    desc: string;
    icon: string;
    accentColor: string;
    owned: boolean;
    consumable?: boolean;
    skinId?: CharacterSkinId;
    kitId?: "kit_builder" | "kit_explorer_pro" | "kit_aquatic_starter";
  }

  const getEffectiveIndefPrice = (basePrice?: number): number | undefined => {
    if (!basePrice) return undefined;
    if (mvpActive) return Math.max(1, Math.round(basePrice * 0.75));
    if (vipActive) return Math.max(1, Math.round(basePrice * 0.8));
    return basePrice;
  };

  const DAILY_INDEF_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const dailyIndefRewardAmount = mvpActive ? 400 : vipActive ? 250 : 100;

  const handleClaimDailyIndefs = async () => {
    const now = Date.now();
    if (now - lastDailyIndefClaim < DAILY_INDEF_COOLDOWN_MS) return;

    const reward = dailyIndefRewardAmount;
    const nextIndefs = indefCoins + reward;
    const txId = `DAILY-${now.toString().slice(-6)}`;

    setIndefCoins(nextIndefs);
    setLastDailyIndefClaim(now);
    localStorage.setItem("minecraft_indef_coins", String(nextIndefs));
    localStorage.setItem("minecraft_last_daily_indef", String(now));

    const dailyReceipt = {
      id: txId,
      productId: "daily_indef",
      productName: lang === "es"
        ? `Recompensa Diaria (+${reward} Indefs)`
        : `Daily Reward (+${reward} Indefs)`,
      price: 0,
      currency: "BONUS",
      paymentMethod: mvpActive ? "MVP+ Daily" : vipActive ? "VIP Daily" : "Daily Bonus",
      timestamp: now,
      status: "completed",
    };
    setPurchaseHistory((prev) => {
      const nextHist = [dailyReceipt, ...prev].slice(0, 30);
      localStorage.setItem("minecraft_purchase_history", JSON.stringify(nextHist));
      return nextHist;
    });

    try {
      const emailKey = googleUser?.email?.toLowerCase();
      if (googleUser && emailKey) {
        await setDoc(
          doc(db, "user_roles", emailKey),
          { indefCoins: nextIndefs, goldCoins: nextIndefs },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn("Daily indef Firestore sync skipped:", err);
    }

    playPurchaseChime();
    setChatMessages((p) => [
      ...p,
      `◈ [Tienda Indef] ¡Reclamaste +${reward} Indefs diarios! Saldo total: ${nextIndefs.toLocaleString()} Indefs.`,
    ]);
  };

  const handleClaimKitInWorld = (kitId: "kit_builder" | "kit_explorer_pro" | "kit_aquatic_starter") => {
    if (!currentWorld || claimedWorldKits[kitId]) return;
    const kitGrants: Record<"kit_builder" | "kit_explorer_pro" | "kit_aquatic_starter", Record<number, number>> = {
      kit_builder: {
        [BlockType.WOOD]: 32,
        [BlockType.LOG]: 16,
        [BlockType.TORCH]: 16,
        [BlockType.PICKAXE]: 1,
        [BlockType.BED]: 1,
        [BlockType.CRAFTING_TABLE]: 1,
        [BlockType.FURNACE]: 1,
      },
      kit_explorer_pro: {
        [BlockType.DIAMOND_SWORD]: 1,
        [BlockType.DIAMOND_PICKAXE]: 1,
        [BlockType.TORCH]: 24,
        [BlockType.LOCATOR_MAP]: 1,
        [BlockType.CHEST]: 2,
      },
      kit_aquatic_starter: {
        [BlockType.BUCKET_WATER]: 2,
        [BlockType.GLOWSTONE]: 12,
        [BlockType.CONCRETE]: 32,
        [BlockType.TORCH]: 12,
      },
    };
    const grant = kitGrants[kitId];
    setSurvivalInventory((prev) => {
      const next = { ...prev };
      Object.entries(grant).forEach(([k, v]) => {
        const bType = Number(k);
        next[bType] = (next[bType] || 0) + Number(v);
      });
      if (currentWorld) {
        (currentWorld as any).survivalInventory = next;
        setWorlds((prevW) => {
          const updated = prevW.map((w) => (w.id === currentWorld.id ? { ...w, survivalInventory: next } : w));
          saveWorlds(updated);
          return updated;
        });
      }
      return next;
    });
    setClaimedWorldKits((prev) => ({ ...prev, [kitId]: true }));
    playPurchaseChime();
    setChatMessages((p) => [
      ...p,
      `🎒 [Tienda] Kit entregado directamente a tu inventario de "${currentWorld.name}".`,
    ]);
  };

  const getStoreCatalog = (): StoreProductDef[] => [
    {
      id: "indef_500",
      category: "indefs",
      name: "500 Indefs",
      priceUsd: 1.99,
      indefGrant: 500,
      badge: "MINICOIN",
      desc: lang === "es"
        ? "Paquete inicial de 500 Indefs para adquirir skins 3D, capas y pases exclusivos en la tienda."
        : "Starter bundle of 500 Indefs to unlock 3D skins, capes and passes in the marketplace.",
      icon: "fa-gem text-emerald-400",
      accentColor: "#10b981",
      owned: false,
      consumable: true,
    },
    {
      id: "indef_1500",
      category: "indefs",
      name: "1,500 Indefs (+200 Bonus)",
      priceUsd: 4.99,
      indefGrant: 1700,
      badge: "POPULAR",
      desc: lang === "es"
        ? "Recibe 1,500 Indefs + 200 Indefs de bonificación directa en tu billetera."
        : "Receive 1,500 Indefs plus 200 bonus Indefs credited directly to your wallet.",
      icon: "fa-gem text-cyan-400",
      accentColor: "#06b6d4",
      owned: false,
      consumable: true,
    },
    {
      id: "indef_4000",
      category: "indefs",
      name: "4,000 Indefs (+800 Bonus)",
      priceUsd: 9.99,
      indefGrant: 4800,
      badge: lang === "es" ? "MEJOR VALOR" : "BEST VALUE",
      desc: lang === "es"
        ? "Cofre legendario con 4,800 Indefs totales para coleccionistas y constructores."
        : "Legendary chest delivering 4,800 total Indefs for collectors and builders.",
      icon: "fa-coins text-amber-400",
      accentColor: "#f59e0b",
      owned: false,
      consumable: true,
    },
    {
      id: "indef_10000",
      category: "indefs",
      name: "10,000 Indefs (+2,500 Bonus)",
      priceUsd: 19.99,
      indefGrant: 12500,
      badge: "MEGA COFRE",
      desc: lang === "es"
        ? "Bóveda Suprema con 12,500 Indefs totales para desbloquear todo el catálogo VIP & Skins."
        : "Supreme Vault delivering 12,500 total Indefs to unlock the entire VIP & Skin catalog.",
      icon: "fa-vault text-fuchsia-400",
      accentColor: "#e879f9",
      owned: false,
      consumable: true,
    },
    {
      id: "vip_pass",
      category: "passes",
      name: lang === "es" ? "Pase VIP Dorado" : "Gold VIP Pass",
      priceUsd: 4.99,
      priceIndefs: 1200,
      badge: "VIP",
      desc: lang === "es"
        ? "Rango ✨ VIP, 20% dto. en Indefs, +250 Indefs diarios, Aletas Poseidón y 4 Skins 3D incluidas."
        : "✨ VIP tag, 20% Indef discount, +250 daily Indefs, Poseidon Fins & 4 VIP 3D Skins.",
      icon: "fa-crown text-yellow-400",
      accentColor: "#eab308",
      owned: vipActive,
    },
    {
      id: "mvp_plus",
      category: "passes",
      name: lang === "es" ? "Rango MVP+ Supremo" : "MVP+ Supreme Rank",
      priceUsd: 7.99,
      priceIndefs: 2200,
      badge: "MVP+",
      desc: lang === "es"
        ? "Máximo rango 💎 MVP+: 25% dto. en Indefs, +400 diarios, Skin Monarca Obsidiana, Kit Diamante y VIP completo."
        : "Ultimate 💎 MVP+: 25% Indef discount, +400 daily Indefs, Obsidian Skin, Diamond Kit & full VIP.",
      icon: "fa-bolt text-sky-400",
      accentColor: "#38bdf8",
      owned: mvpActive,
    },
    {
      id: "aquatic_vip",
      category: "passes",
      name: lang === "es" ? "Aletas & Branquias Poseidón" : "Poseidon Fins & Gills",
      priceUsd: 2.49,
      priceIndefs: 550,
      badge: lang === "es" ? "ACUÁTICO" : "AQUATIC",
      desc: lang === "es"
        ? "Nado ultra rápido (+55% velocidad) en océanos y lagos + respiración infinita bajo el agua."
        : "Turbo swimming speed (+55%) across oceans and lakes + infinite underwater oxygen.",
      icon: "fa-water text-cyan-400",
      accentColor: "#06b6d4",
      owned: vipActive || mvpActive || ownedShopItems.includes("aquatic_vip"),
    },
    {
      id: "unlocked_worlds",
      category: "passes",
      name: lang === "es" ? "Mundos Ilimitados" : "Unlimited Worlds Pass",
      priceUsd: 2.99,
      priceIndefs: 750,
      desc: lang === "es"
        ? "Elimina permanentemente el límite de 70 mundos guardados para crear sin fronteras."
        : "Permanently removes the 70-world cap so you can save unlimited realms.",
      icon: "fa-infinity text-emerald-400",
      accentColor: "#10b981",
      owned: unlockedWorldsPass || vipActive || mvpActive,
    },
    {
      id: "realm_basic",
      category: "realms",
      name: lang === "es" ? "Realm Básico (2 Amigos · 3 Mundos)" : "Basic Realm (2 Friends · 3 Worlds)",
      priceUsd: 0,
      priceIndefs: 0,
      badge: lang === "es" ? "GRATIS" : "FREE",
      desc: lang === "es"
        ? "Primera opción 100% gratis: crea tu Realm en la nube con capacidad para 2 amigos y hasta 3 mundos compartidos."
        : "First option 100% free: host your cloud Realm for up to 2 friends and 3 shared worlds.",
      icon: "fa-chess-rook text-emerald-400",
      accentColor: "#10b981",
      owned: effectiveRealmPlan === "basic" || effectiveRealmPlan === "plus",
    },
    {
      id: "realm_plus",
      category: "realms",
      name: lang === "es" ? "Realm Plus (4 Amigos · 6 Mundos)" : "Realm Plus (4 Friends · 6 Worlds)",
      priceUsd: 0.99,
      priceIndefs: 150,
      badge: lang === "es" ? "BARATO" : "LOW PRICE",
      desc: lang === "es"
        ? "Plan económico ampliado: capacidad para 4 amigos y hasta 6 mundos en tu Realm (¡Lion Admin entra gratis!)."
        : "Affordable expanded plan: capacity for 4 friends and up to 6 worlds in your Realm.",
      icon: "fa-chess-queen text-cyan-400",
      accentColor: "#06b6d4",
      owned: effectiveRealmPlan === "plus",
    },
    {
      id: "skin_dragon",
      category: "skins",
      name: lang === "es" ? "Skin 3D: Dragón Carmesí" : "3D Skin: Crimson Dragon",
      priceUsd: 2.49,
      priceIndefs: 650,
      badge: "3D SKIN",
      desc: lang === "es"
        ? "Armadura escamada carmesí con corona real dorada y capa roja visible en multijugador."
        : "Crimson dragon armor with royal crown and flowing cape synced in multiplayer.",
      icon: "fa-dragon text-orange-400",
      accentColor: "#f97316",
      owned: vipActive || ownedShopItems.includes("skin_dragon"),
      skinId: "dragon",
    },
    {
      id: "skin_angel",
      category: "skins",
      name: lang === "es" ? "Skin 3D: Arcángel Celestial" : "3D Skin: Celestial Angel",
      priceUsd: 2.99,
      priceIndefs: 800,
      badge: "3D SKIN",
      desc: lang === "es"
        ? "Túnica blanca metálica, corona celestial brillante y capa azul celeste animada."
        : "White metallic armor, radiant crown and sky-blue animated cape.",
      icon: "fa-feather-pointed text-sky-300",
      accentColor: "#38bdf8",
      owned: vipActive || ownedShopItems.includes("skin_angel"),
      skinId: "angel",
    },
    {
      id: "skin_titan",
      category: "skins",
      name: lang === "es" ? "Skin 3D: Titán Esmeralda" : "3D Skin: Emerald Titan",
      priceUsd: 2.49,
      priceIndefs: 650,
      badge: "3D SKIN",
      desc: lang === "es"
        ? "Blindaje verde esmeralda con visor táctico y katana dorsal para combates épicos."
        : "Emerald forged armor with tactical goggles and back sheath blade.",
      icon: "fa-shield-halved text-emerald-400",
      accentColor: "#10b981",
      owned: vipActive || ownedShopItems.includes("skin_titan"),
      skinId: "titan",
    },
    {
      id: "skin_poseidon",
      category: "skins",
      name: lang === "es" ? "Skin 3D: Señor de los Mares" : "3D Skin: Lord of the Seas",
      priceUsd: 2.99,
      priceIndefs: 780,
      badge: "VIP SKIN",
      desc: lang === "es"
        ? "Armadura abisal turquesa con visor acuático luminoso, corona tridente y capa oceánica."
        : "Abyssal turquoise armor with luminous aquatic visor, trident crown & ocean cape.",
      icon: "fa-trident text-cyan-400",
      accentColor: "#06b6d4",
      owned: vipActive || ownedShopItems.includes("skin_poseidon"),
      skinId: "poseidon",
    },
    {
      id: "skin_obsidian",
      category: "skins",
      name: lang === "es" ? "Skin 3D: Monarca Obsidiana" : "3D Skin: Obsidian Monarch",
      priceUsd: 3.49,
      priceIndefs: 950,
      badge: "MVP+ SKIN",
      desc: lang === "es"
        ? "Blindaje negro forjado con núcleo púrpura neón, katana dorsal y aura real suprema."
        : "Forged obsidian armor with neon purple core, back katana and supreme monarch aura.",
      icon: "fa-chess-king text-purple-400",
      accentColor: "#a855f7",
      owned: mvpActive || ownedShopItems.includes("skin_obsidian"),
      skinId: "obsidian",
    },
    {
      id: "kit_builder",
      category: "cosmetics",
      name: lang === "es" ? "Kit Maestro Constructor" : "Master Builder Kit",
      priceUsd: 1.99,
      priceIndefs: 450,
      badge: "KIT",
      desc: lang === "es"
        ? "Empieza con Madera x32, Troncos x16, Antorchas x16, Pico, Horno y Cama (reclamable en tu mundo)."
        : "Grants Wood x32, Logs x16, Torches x16, Pickaxe, Furnace & Bed (claimable in-world).",
      icon: "fa-hammer text-amber-400",
      accentColor: "#f59e0b",
      owned: vipActive || ownedShopItems.includes("kit_builder"),
      kitId: "kit_builder",
    },
    {
      id: "kit_explorer_pro",
      category: "cosmetics",
      name: lang === "es" ? "Kit Diamante & Explorador" : "Diamond Explorer Kit",
      priceUsd: 2.49,
      priceIndefs: 600,
      badge: "KIT PRO",
      desc: lang === "es"
        ? "Espada y Pico de Diamante, Antorchas x24, Mapa Localizador y Cofres x2 listos para aventuras."
        : "Diamond Sword & Pickaxe, Torches x24, Locator Map & 2 Chests ready for expeditions.",
      icon: "fa-gem text-sky-400",
      accentColor: "#38bdf8",
      owned: mvpActive || ownedShopItems.includes("kit_explorer_pro"),
      kitId: "kit_explorer_pro",
    },
    {
      id: "kit_aquatic_starter",
      category: "cosmetics",
      name: lang === "es" ? "Kit Marino Constructor" : "Marine Builder Kit",
      priceUsd: 1.49,
      priceIndefs: 350,
      badge: "KIT MAR",
      desc: lang === "es"
        ? "Cubetas de Agua x2, Piedra Luminosa x12, Concreto x32 y Antorchas x12 para bases submarinas."
        : "Water Buckets x2, Glowstone x12, Concrete x32 & Torches x12 for underwater bases.",
      icon: "fa-anchor text-teal-400",
      accentColor: "#14b8a6",
      owned: vipActive || mvpActive || ownedShopItems.includes("aquatic_vip") || ownedShopItems.includes("kit_aquatic_starter"),
      kitId: "kit_aquatic_starter",
    },
    {
      id: "cape_royal",
      category: "cosmetics",
      name: lang === "es" ? "Capa Real Dorada + Aura" : "Royal Golden Cape + Aura",
      priceUsd: 1.49,
      priceIndefs: 400,
      badge: "COSMÉTICO",
      desc: lang === "es"
        ? "Desbloquea el acabado dorado imperial y aplica capa real directa a tu personaje personalizado."
        : "Unlocks royal gold trim and auto-equips a golden cape on your custom hero.",
      icon: "fa-vest text-yellow-400",
      accentColor: "#eab308",
      owned: ownedShopItems.includes("cape_royal"),
    },
  ];

  // Standard Luhn verification for real card numbers
  const isValidLuhnCard = (digits: string) => {
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (isNaN(n)) return false;
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  };

  const isValidExpiry = (exp: string) => {
    const match = /^(\d{2})\/(\d{2})$/.exec(exp);
    if (!match) return false;
    const mm = parseInt(match[1], 10);
    const yy = parseInt("20" + match[2], 10);
    if (mm < 1 || mm > 12) return false;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    return yy > curYear || (yy === curYear && mm >= curMonth);
  };

  const handlePurchaseComplete = async (methodOverride?: "card" | "paypal" | "indefs" | "pay_api") => {
    const catalog = getStoreCatalog();
    const item = catalog.find((p) => p.id === selectedProduct);
    if (!item) return;

    const method = methodOverride || paymentMethod || "card";
    setShopCheckoutError("");

    const effectiveIndefCost = getEffectiveIndefPrice(item.priceIndefs);

    // Verify Indef balance BEFORE processing if buying with Indefs
    if (method === "indefs") {
      const indefCost = effectiveIndefCost ?? 999999;
      if (!effectiveIndefCost) {
        setShopCheckoutError(lang === "es" ? "Este paquete solo se adquiere con pago real." : "This pack requires real checkout.");
        return;
      }
      if (indefCoins < indefCost) {
        setShopCheckoutError(
          lang === "es"
            ? `Saldo insuficiente: necesitas ${indefCost.toLocaleString()} Indefs (tienes ${indefCoins.toLocaleString()}).`
            : `Insufficient Indefs: need ${indefCost.toLocaleString()} (balance: ${indefCoins.toLocaleString()}).`
        );
        return;
      }
    }

    setPaymentStep("processing");
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const txId = "TX-" + Date.now().toString().slice(-6) + "-" + Math.floor(100 + Math.random() * 900);
    setTransactionId(txId);

    const emailKey = googleUser ? (googleUser.email?.toLowerCase() || "") : "";
    const finalCurrency = method === "indefs" ? "INDEF" : "USD";
    const finalAmount = method === "indefs" ? (effectiveIndefCost || 0) : item.priceUsd;
    const methodLabel =
      method === "indefs"
        ? "Indef Wallet"
        : method === "pay_api"
          ? "Express Pay"
          : method === "paypal"
            ? "PayPal"
            : "Card";

    setLastGiftSummary(null);
    setLastReceiptSummary({
      method: methodLabel,
      amountText: method === "indefs" ? `${finalAmount.toLocaleString()} Indefs` : `$${item.priceUsd.toFixed(2)} USD`,
    });

    // Calculate updated balances & entitlements
    let nextIndefs = indefCoins;
    if (method === "indefs" && effectiveIndefCost) {
      nextIndefs = Math.max(0, indefCoins - effectiveIndefCost);
    }
    if (item.indefGrant) {
      nextIndefs += item.indefGrant;
    }

    const nextOwned = Array.from(new Set([...ownedShopItems, item.id]));
    const nextVip = vipActive || item.id === "vip_pass" || item.id === "mvp_plus";
    const nextMvp = mvpActive || item.id === "mvp_plus";
    const nextWorldsPass = unlockedWorldsPass || item.id === "unlocked_worlds" || nextVip;
    const nextRealmPlan: RealmPlanTier =
      isRealmAdmin || item.id === "realm_plus" || effectiveRealmPlan === "plus"
        ? "plus"
        : item.id === "realm_basic"
          ? "basic"
          : effectiveRealmPlan;

    const receiptRecord = {
      id: txId,
      email: emailKey || "guest@local",
      productId: item.id,
      productName: item.name,
      price: finalAmount,
      currency: finalCurrency,
      paymentMethod: methodLabel,
      indefAmount: item.indefGrant || 0,
      timestamp: Date.now(),
      status: "completed",
    };

    // Update local states & storage immediately
    setIndefCoins(nextIndefs);
    setOwnedShopItems(nextOwned);
    setVipActive(nextVip);
    setMvpActive(nextMvp);
    setUnlockedWorldsPass(nextWorldsPass);
    setRealmPlan(nextRealmPlan);
    setPurchaseHistory((prev) => {
      const nextHist = [receiptRecord, ...prev].slice(0, 30);
      localStorage.setItem("minecraft_purchase_history", JSON.stringify(nextHist));
      return nextHist;
    });

    localStorage.setItem("minecraft_indef_coins", String(nextIndefs));
    localStorage.setItem("minecraft_owned_shop_items", JSON.stringify(nextOwned));
    localStorage.setItem("minecraft_vip_active", String(nextVip));
    localStorage.setItem("minecraft_mvp_active", String(nextMvp));
    localStorage.setItem("minecraft_unlocked_worlds", String(nextWorldsPass));
    localStorage.setItem("minecraft_realm_plan", nextRealmPlan);

    if (item.id === "cape_royal") {
      handleUpdateCustomSkin({ ...customSkin, backGear: "cape", capeColor: "#f59e0b" });
    }
    if (item.id === "skin_dragon") handleSelectSkin("dragon");
    if (item.id === "skin_angel") handleSelectSkin("angel");
    if (item.id === "skin_titan") handleSelectSkin("titan");
    if (item.id === "skin_poseidon") handleSelectSkin("poseidon");
    if (item.id === "skin_obsidian") handleSelectSkin("obsidian");

    try {
      if (googleUser && emailKey) {
        await setDoc(doc(db, "user_purchases", txId), receiptRecord);
        await setDoc(
          doc(db, "user_roles", emailKey),
          {
            indefCoins: nextIndefs,
            goldCoins: nextIndefs,
            ownedShopItems: nextOwned,
            vipActive: nextVip,
            mvpActive: nextMvp,
            unlockedWorldsPass: nextWorldsPass,
            realmPlan: nextRealmPlan,
          },
          { merge: true }
        );
        if (item.id === "realm_plus") {
          for (const r of myRealms) {
            if (r.tier !== "plus") {
              await updateRealmInFirestore(r.id, {
                tier: "plus",
                maxFriends: 4,
                maxWorlds: 6,
                updatedAt: Date.now(),
              }).catch(() => {});
            }
          }
        }
      } else if (item.id === "realm_plus") {
        setMyRealms((prev) => {
          const upgraded = prev.map((r) => ({ ...r, tier: "plus" as const, maxFriends: 4 as const, maxWorlds: 6 as const, updatedAt: Date.now() }));
          localStorage.setItem("minecraft_local_realms", JSON.stringify(upgraded));
          return upgraded;
        });
      }
    } catch (err) {
      console.warn("Firestore sync deferred on purchase:", err);
    }

    playPurchaseChime();
    setChatMessages((p) => [
      ...p,
      `🛍️ [Tienda] Compra verificada: ${item.name} (${method === "indefs" ? `${finalAmount} Indefs` : `$${item.priceUsd.toFixed(2)} USD`}) • Ref ${txId}`
    ]);
    setPaymentStep("success");
  };

  const handleActivateFreeRealmBasic = async () => {
    const now = Date.now();
    const txId = `REALM-FREE-${now.toString().slice(-6)}`;
    const nextOwned = Array.from(new Set([...ownedShopItems, "realm_basic"]));
    const nextPlan: RealmPlanTier = effectiveRealmPlan === "plus" ? "plus" : "basic";
    const emailKey = googleUser?.email?.toLowerCase() || "";

    setOwnedShopItems(nextOwned);
    setRealmPlan(nextPlan);
    localStorage.setItem("minecraft_owned_shop_items", JSON.stringify(nextOwned));
    localStorage.setItem("minecraft_realm_plan", nextPlan);

    const freeReceipt = {
      id: txId,
      email: emailKey || "guest@local",
      productId: "realm_basic",
      productName: lang === "es" ? "Realm Básico (2 Amigos · 3 Mundos)" : "Basic Realm (2 Friends · 3 Worlds)",
      price: 0,
      currency: "FREE",
      paymentMethod: lang === "es" ? "Activación Gratuita" : "Free Activation",
      indefAmount: 0,
      timestamp: now,
      status: "completed",
    };
    setPurchaseHistory((prev) => {
      const nextHist = [freeReceipt, ...prev].slice(0, 30);
      localStorage.setItem("minecraft_purchase_history", JSON.stringify(nextHist));
      return nextHist;
    });

    try {
      if (googleUser && emailKey) {
        await setDoc(doc(db, "user_purchases", txId), freeReceipt);
        await setDoc(
          doc(db, "user_roles", emailKey),
          {
            ownedShopItems: nextOwned,
            realmPlan: nextPlan,
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn("Free Realm sync deferred:", err);
    }

    playPurchaseChime();
    setRealmStatusMsg({
      type: "ok",
      text: lang === "es"
        ? "¡Realm Básico activado gratis! Ya puedes crear tu Realm (2 amigos y 3 mundos)."
        : "Basic Realm unlocked for free! You can now create your Realm (2 friends & 3 worlds).",
    });
    setChatMessages((p) => [
      ...p,
      `🏰 [Realms] ¡Realm Básico (2 amigos · 3 mundos) activado gratis!`,
    ]);
  };

  const generateRealmCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "RLM-";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateRealm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    resumeAudio();
    setRealmStatusMsg(null);

    const cleanName = newRealmName.trim().slice(0, 64) || (lang === "es" ? `Realm de ${currentUser || "Jugador"}` : `${currentUser || "Player"}'s Realm`);
    const chosenTier: "basic" | "plus" =
      newRealmTier === "plus" && effectiveRealmPlan === "plus" ? "plus" : "basic";

    if (effectiveRealmPlan === "none" && chosenTier === "basic") {
      await handleActivateFreeRealmBasic();
    }

    const now = Date.now();
    const code = generateRealmCode();
    const ownerUid = googleUser ? googleUser.uid : (activeSession || "guest_local");
    const ownerEmail = googleUser ? (googleUser.email?.toLowerCase() || "guest@local") : "guest@local";
    const ownerName = googleUser ? (googleUser.displayName || googleUser.email || "Jugador") : (currentUser || "Invitado");

    const newRealm: RealmData = {
      id: code,
      joinCode: code,
      name: cleanName,
      tier: chosenTier,
      maxFriends: chosenTier === "plus" ? 4 : 2,
      maxWorlds: chosenTier === "plus" ? 6 : 3,
      ownerUid,
      ownerEmail,
      ownerName,
      invitedEmails: [],
      memberEmails: [],
      worldIds: [],
      worldsMeta: [],
      activeWorldId: "",
      createdAt: now,
      updatedAt: now,
    };

    setRealmLoading(true);
    try {
      if (googleUser) {
        await createRealmInFirestore(newRealm);
      } else {
        setMyRealms((prev) => {
          const next = [newRealm, ...prev];
          localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
          return next;
        });
      }
      setNewRealmName("");
      setSelectedRealmId(newRealm.id);
      setRealmsTab("my");
      playPurchaseChime();
      setRealmStatusMsg({
        type: "ok",
        text: lang === "es"
          ? `¡Realm "${cleanName}" creado! Código: ${code}`
          : `Realm "${cleanName}" created! Code: ${code}`,
      });
    } catch (err: any) {
      console.error("Error creating realm:", err);
      setRealmStatusMsg({
        type: "err",
        text: lang === "es"
          ? "No se pudo crear el Realm en la nube. Verifica tu conexión o inicia sesión con Google."
          : "Could not create Realm in cloud. Check connection or Google sign-in.",
      });
    } finally {
      setRealmLoading(false);
    }
  };

  const handleUpgradeRealmToPlus = async (realm: RealmData) => {
    if (effectiveRealmPlan !== "plus" && !isRealmAdmin) {
      setIsRealmsOpen(false);
      setShopCategory("realms");
      setSelectedProduct("realm_plus");
      setPaymentMethod("indefs");
      setShopCheckoutError("");
      setPaymentStep("form");
      setIsShopOpen(true);
      return;
    }

    setRealmLoading(true);
    setRealmStatusMsg(null);
    try {
      if (googleUser) {
        await updateRealmInFirestore(realm.id, {
          tier: "plus",
          maxFriends: 4,
          maxWorlds: 6,
          updatedAt: Date.now(),
        });
      } else {
        setMyRealms((prev) => {
          const next = prev.map((r) => (r.id === realm.id ? { ...r, tier: "plus" as const, maxFriends: 4 as const, maxWorlds: 6 as const, updatedAt: Date.now() } : r));
          localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
          return next;
        });
      }
      playPurchaseChime();
      setRealmStatusMsg({
        type: "ok",
        text: lang === "es" ? `"${realm.name}" mejorado a Realm Plus (4 amigos · 6 mundos).` : `"${realm.name}" upgraded to Realm Plus (4 friends · 6 worlds).`,
      });
    } catch (err) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Error al mejorar el Realm." : "Failed to upgrade Realm." });
    } finally {
      setRealmLoading(false);
    }
  };

  const handleInviteFriendToRealm = async (realm: RealmData, emailRaw: string) => {
    const cleanEmail = emailRaw.trim().toLowerCase();
    setRealmStatusMsg(null);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Ingresa un correo electrónico válido." : "Enter a valid email address." });
      return;
    }
    if (cleanEmail === realm.ownerEmail.toLowerCase()) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Ya eres el dueño del Realm." : "You are already the Realm owner." });
      return;
    }
    if (cleanEmail === "lionbastias18@gmail.com") {
      setRealmStatusMsg({
        type: "ok",
        text: lang === "es"
          ? "El admin (lionbastias18@gmail.com) puede unirse gratis con tu código sin gastar cupo de amigo."
          : "Admin (lionbastias18@gmail.com) joins for free without taking a friend slot.",
      });
      return;
    }
    const currentInvited = (realm.invitedEmails || []).filter((e) => e.toLowerCase() !== "lionbastias18@gmail.com");
    if (currentInvited.includes(cleanEmail)) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Ese amigo ya está invitado a este Realm." : "Friend is already invited." });
      return;
    }
    if (currentInvited.length >= realm.maxFriends) {
      setRealmStatusMsg({
        type: "err",
        text: lang === "es"
          ? `Límite de ${realm.maxFriends} amigos alcanzado en ${realm.tier === "basic" ? "Plan Básico" : "Plan Plus"}. ${realm.tier === "basic" ? "Mejora a Realm Plus (4 amigos) por $0.99 / 150 Indefs." : ""}`
          : `Friend limit (${realm.maxFriends}) reached.`,
      });
      return;
    }

    setRealmLoading(true);
    try {
      const nextInvited = [...currentInvited, cleanEmail];
      if (googleUser) {
        await updateRealmInFirestore(realm.id, { invitedEmails: nextInvited, updatedAt: Date.now() });
      } else {
        setMyRealms((prev) => {
          const next = prev.map((r) => (r.id === realm.id ? { ...r, invitedEmails: nextInvited, updatedAt: Date.now() } : r));
          localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
          return next;
        });
      }
      setInviteFriendEmailInput("");
      setRealmStatusMsg({ type: "ok", text: lang === "es" ? `Invitación enviada a ${cleanEmail}` : `Invited ${cleanEmail}` });
    } catch (err) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "No se pudo invitar al amigo." : "Failed to invite friend." });
    } finally {
      setRealmLoading(false);
    }
  };

  const handleRemoveFriendFromRealm = async (realm: RealmData, emailToRemove: string) => {
    const clean = emailToRemove.toLowerCase();
    setRealmLoading(true);
    setRealmStatusMsg(null);
    try {
      const nextInvited = (realm.invitedEmails || []).filter((e) => e.toLowerCase() !== clean);
      const nextMembers = (realm.memberEmails || []).filter((e) => e.toLowerCase() !== clean);
      if (googleUser) {
        await updateRealmInFirestore(realm.id, {
          invitedEmails: nextInvited,
          memberEmails: nextMembers,
          updatedAt: Date.now(),
        });
      } else {
        setMyRealms((prev) => {
          const next = prev.map((r) => (r.id === realm.id ? { ...r, invitedEmails: nextInvited, memberEmails: nextMembers, updatedAt: Date.now() } : r));
          localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
          return next;
        });
      }
      setRealmStatusMsg({ type: "ok", text: lang === "es" ? `Eliminado: ${clean}` : `Removed ${clean}` });
    } catch (err) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Error al quitar miembro." : "Failed to remove member." });
    } finally {
      setRealmLoading(false);
    }
  };

  const handleCreateWorldInRealm = async (realm: RealmData, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRealmStatusMsg(null);
    const currentWorlds = realm.worldsMeta || [];
    if (currentWorlds.length >= realm.maxWorlds) {
      setRealmStatusMsg({
        type: "err",
        text: lang === "es"
          ? `Límite de ${realm.maxWorlds} mundos alcanzado en este Realm. ${realm.tier === "basic" ? "Mejora a Realm Plus para tener hasta 6 mundos." : ""}`
          : `World limit (${realm.maxWorlds}) reached in this Realm.`,
      });
      return;
    }

    const name = realmWorldNameInput.trim().slice(0, 64) || `${realm.name} #${currentWorlds.length + 1}`;
    const creator = googleUser ? googleUser.uid : (currentUser || "Invitado");
    const creatorName = googleUser ? (googleUser.displayName || googleUser.email || "Jugador") : (currentUser || "Invitado");
    const now = Date.now();
    const newWorld: World = {
      id: `world_${now}_${Math.floor(Math.random() * 10000)}`,
      name,
      creator,
      creatorName,
      createdAt: now,
      playerPos: { x: 0, y: realmWorldType === "flat" ? 58 : 80, z: 0 },
      gameMode: realmWorldMode,
      worldType: realmWorldType,
      edits: {},
      blockColors: {},
      survivalInventory: {
        [BlockType.DIRT]: 16,
        [BlockType.WOOD]: 8,
        [BlockType.LOG]: 4,
        [BlockType.CRAFTING_TABLE]: 1,
      },
    };

    const meta: RealmWorldMeta = {
      id: newWorld.id,
      name: newWorld.name,
      gameMode: newWorld.gameMode,
      worldType: newWorld.worldType,
      createdAt: newWorld.createdAt,
    };

    setRealmLoading(true);
    try {
      const nextWorlds = [...worlds, newWorld];
      setWorlds(nextWorlds);
      saveWorlds(nextWorlds);
      if (googleUser) {
        await saveWorldToFirestore(newWorld);
      }

      const nextWorldIds = [...(realm.worldIds || []), newWorld.id];
      const nextWorldsMeta = [...currentWorlds, meta];
      if (googleUser) {
        await updateRealmInFirestore(realm.id, {
          worldIds: nextWorldIds,
          worldsMeta: nextWorldsMeta,
          activeWorldId: newWorld.id,
          updatedAt: now,
        });
      } else {
        setMyRealms((prev) => {
          const next = prev.map((r) => (r.id === realm.id ? { ...r, worldIds: nextWorldIds, worldsMeta: nextWorldsMeta, activeWorldId: newWorld.id, updatedAt: now } : r));
          localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
          return next;
        });
      }

      setRealmWorldNameInput("");
      playPurchaseChime();
      setRealmStatusMsg({
        type: "ok",
        text: lang === "es" ? `Mundo "${name}" añadido al Realm (${nextWorldsMeta.length}/${realm.maxWorlds}).` : `World "${name}" added (${nextWorldsMeta.length}/${realm.maxWorlds}).`,
      });
    } catch (err) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "No se pudo crear el mundo del Realm." : "Failed to create Realm world." });
    } finally {
      setRealmLoading(false);
    }
  };

  const handleDeleteWorldFromRealm = async (realm: RealmData, worldId: string) => {
    setRealmLoading(true);
    setRealmStatusMsg(null);
    try {
      const nextIds = (realm.worldIds || []).filter((id) => id !== worldId);
      const nextMeta = (realm.worldsMeta || []).filter((m) => m.id !== worldId);
      const nextActive = realm.activeWorldId === worldId ? (nextIds[0] || "") : (realm.activeWorldId || "");
      if (googleUser) {
        await updateRealmInFirestore(realm.id, {
          worldIds: nextIds,
          worldsMeta: nextMeta,
          activeWorldId: nextActive,
          updatedAt: Date.now(),
        });
        await deleteWorldFromFirestore(worldId).catch(() => {});
      } else {
        setMyRealms((prev) => {
          const next = prev.map((r) => (r.id === realm.id ? { ...r, worldIds: nextIds, worldsMeta: nextMeta, activeWorldId: nextActive, updatedAt: Date.now() } : r));
          localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
          return next;
        });
      }
      setWorlds((prev) => {
        const next = prev.filter((w) => w.id !== worldId);
        saveWorlds(next);
        return next;
      });
      setRealmStatusMsg({ type: "ok", text: lang === "es" ? "Mundo eliminado del Realm." : "World removed from Realm." });
    } catch (err) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Error al eliminar mundo." : "Failed to delete world." });
    } finally {
      setRealmLoading(false);
    }
  };

  const handlePlayRealmWorld = async (realm: RealmData, worldId: string) => {
    const emailKey = googleUser?.email?.toLowerCase() || "";
    const isOwner = googleUser ? realm.ownerUid === googleUser.uid : true;
    const friendMembers = (realm.memberEmails || []).filter(
      (e) => e.toLowerCase() !== realm.ownerEmail.toLowerCase() && e.toLowerCase() !== "lionbastias18@gmail.com"
    );

    if (!isOwner && !isRealmAdmin && emailKey && !friendMembers.includes(emailKey)) {
      if (friendMembers.length >= realm.maxFriends) {
        setRealmStatusMsg({
          type: "err",
          text: lang === "es"
            ? `Este Realm alcanzó su límite de ${realm.maxFriends} amigos.`
            : `This Realm reached its limit of ${realm.maxFriends} friends.`,
        });
        return;
      }
    }

    if (googleUser && emailKey && !isOwner && !(realm.memberEmails || []).includes(emailKey)) {
      try {
        await updateRealmInFirestore(realm.id, {
          memberEmails: [...(realm.memberEmails || []), emailKey],
          updatedAt: Date.now(),
        });
      } catch {}
    }

    // Try local world fallback first if not in Firestore yet
    const localMatch = worlds.find((w) => w.id === worldId);
    if (!googleUser && localMatch) {
      setIsRealmsOpen(false);
      setActiveRealmId(realm.id);
      setCurrentWorld(localMatch);
      setPlayerPos(localMatch.playerPos || { x: 0, y: localMatch.worldType === "flat" ? 58 : 80, z: 0 });
      setAppState("playing");
      return;
    }

    await handleJoinFriendWorld(worldId, undefined, undefined, realm.id);
    if (isRealmAdmin && !isOwner) {
      setChatMessages((p) => [
        ...p,
        `👑 [Realm Admin] Te uniste gratis al Realm "${realm.name}" (${realm.maxFriends} amigos · ${realm.maxWorlds} mundos).`,
      ]);
    }
  };

  const handleJoinRealmByCode = async (codeOverride?: string, autoEnterFirstWorld = false) => {
    const cleanCode = (codeOverride ?? joinRealmCodeInput).trim().toUpperCase();
    if (!cleanCode) return;
    setRealmStatusMsg(null);

    if (!googleUser) {
      setRealmStatusMsg({
        type: "err",
        text: lang === "es"
          ? "Inicia sesión con Google para buscar y unirte a Realms en la nube."
          : "Sign in with Google to join cloud Realms.",
      });
      return;
    }

    setRealmLoading(true);
    try {
      const realm = await getRealmByCodeFromFirestore(cleanCode);
      if (!realm) {
        setRealmStatusMsg({
          type: "err",
          text: lang === "es" ? `No se encontró ningún Realm con código "${cleanCode}".` : `Realm "${cleanCode}" not found.`,
        });
        return;
      }

      const emailKey = googleUser.email?.toLowerCase() || "";
      const isOwner = realm.ownerUid === googleUser.uid;
      const existingMembers = realm.memberEmails || [];
      const friendMembers = existingMembers.filter(
        (e) => e.toLowerCase() !== realm.ownerEmail.toLowerCase() && e.toLowerCase() !== "lionbastias18@gmail.com"
      );

      if (!isOwner && !isRealmAdmin && !friendMembers.includes(emailKey) && friendMembers.length >= realm.maxFriends) {
        setRealmStatusMsg({
          type: "err",
          text: lang === "es"
            ? `Realm "${realm.name}" lleno (${friendMembers.length}/${realm.maxFriends} amigos).`
            : `Realm "${realm.name}" is full (${friendMembers.length}/${realm.maxFriends} friends).`,
        });
        return;
      }

      if (!isOwner && emailKey && !existingMembers.includes(emailKey)) {
        await updateRealmInFirestore(realm.id, {
          memberEmails: [...existingMembers, emailKey],
          updatedAt: Date.now(),
        });
      }

      setJoinRealmCodeInput("");
      setSelectedRealmId(realm.id);
      setRealmsTab("my");

      if (autoEnterFirstWorld) {
        const targetWorldId = realm.activeWorldId || realm.worldIds?.[0] || realm.worldsMeta?.[0]?.id;
        if (targetWorldId) {
          await handlePlayRealmWorld(realm, targetWorldId);
          return;
        }
      }

      playPurchaseChime();
      setRealmStatusMsg({
        type: "ok",
        text: isRealmAdmin && !isOwner
          ? (lang === "es" ? `👑 Te uniste gratis como Admin al Realm "${realm.name}".` : `👑 Joined Realm "${realm.name}" free as Admin.`)
          : (lang === "es" ? `¡Te uniste al Realm "${realm.name}"!` : `Joined Realm "${realm.name}"!`),
      });
    } catch (err) {
      setRealmStatusMsg({ type: "err", text: lang === "es" ? "Error al conectar con el Realm." : "Failed to join Realm." });
    } finally {
      setRealmLoading(false);
    }
  };

  const handleOwnerGiftComplete = async () => {
    const ownerEmail = googleUser?.email?.toLowerCase().trim() || "";
    if (ownerEmail !== "lionbastias18@gmail.com") {
      setShopCheckoutError(lang === "es" ? "Solo el dueño puede enviar regalos." : "Only the owner can send gifts.");
      return;
    }

    const catalog = getStoreCatalog();
    const item = catalog.find((p) => p.id === selectedProduct);
    if (!item) return;

    const targetEmail = giftRecipientEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 128) {
      setShopCheckoutError(
        lang === "es"
          ? "Ingresa un correo electrónico válido del jugador destinatario."
          : "Enter a valid recipient player email."
      );
      return;
    }

    setShopCheckoutError("");
    setPaymentStep("processing");

    const txId = `GIFT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    setTransactionId(txId);

    try {
      const targetRoleRef = doc(db, "user_roles", targetEmail);
      const existingSnap = await getDoc(targetRoleRef);
      const existingData = existingSnap.exists() ? existingSnap.data() : null;

      const curIndefs =
        typeof existingData?.indefCoins === "number"
          ? existingData.indefCoins
          : typeof existingData?.goldCoins === "number"
            ? existingData.goldCoins
            : 0;
      const curOwned = Array.isArray(existingData?.ownedShopItems) ? existingData.ownedShopItems : [];
      const curVip = existingData?.vipActive === true;
      const curMvp = existingData?.mvpActive === true;
      const curWorlds = existingData?.unlockedWorldsPass === true;
      const curRealmPlan: RealmPlanTier =
        existingData?.realmPlan === "plus" || curOwned.includes("realm_plus")
          ? "plus"
          : (existingData?.realmPlan === "basic" || curOwned.includes("realm_basic") ? "basic" : "none");

      const addedIndefs = item.indefGrant || 0;
      const nextIndefs = Math.max(0, curIndefs + addedIndefs);
      const nextOwned = Array.from(new Set([...curOwned, item.id])).slice(0, 100);
      const nextVip = curVip || item.id === "vip_pass" || item.id === "mvp_plus";
      const nextMvp = curMvp || item.id === "mvp_plus";
      const nextWorldsPass = curWorlds || item.id === "unlocked_worlds" || nextVip;
      const nextRealmPlan: RealmPlanTier =
        item.id === "realm_plus" || curRealmPlan === "plus"
          ? "plus"
          : item.id === "realm_basic"
            ? "basic"
            : curRealmPlan;
      const resolvedRole =
        targetEmail === "lionbastias18@gmail.com"
          ? "owner"
          : (existingData?.role && ["user", "mod", "staff", "owner"].includes(existingData.role)
              ? existingData.role
              : "user");

      await setDoc(
        targetRoleRef,
        {
          email: targetEmail,
          role: resolvedRole,
          displayName: existingData?.displayName || targetEmail.split("@")[0] || targetEmail,
          lastActive: existingData?.lastActive || Date.now(),
          indefCoins: nextIndefs,
          goldCoins: nextIndefs,
          ownedShopItems: nextOwned,
          vipActive: nextVip,
          mvpActive: nextMvp,
          unlockedWorldsPass: nextWorldsPass,
          realmPlan: nextRealmPlan,
        },
        { merge: true }
      );

      const cleanNote = giftNote.trim().slice(0, 200);
      const giftReceipt = {
        id: txId,
        email: targetEmail,
        productId: item.id,
        productName: item.name,
        price: 0,
        currency: "GIFT",
        paymentMethod: lang === "es" ? "Regalo del Dueño" : "Owner Gift",
        indefAmount: addedIndefs,
        timestamp: Date.now(),
        status: "gifted",
        giftedBy: "lionbastias18@gmail.com",
        ...(cleanNote ? { giftNote: cleanNote } : {}),
      };

      await setDoc(doc(db, "user_purchases", txId), giftReceipt);

      logUserActivity(`🎁 Regaló "${item.name}" a ${targetEmail}${cleanNote ? ` (${cleanNote})` : ""}`);

      setLastReceiptSummary(null);
      setLastGiftSummary({
        recipientEmail: targetEmail,
        productName: item.name,
        note: cleanNote,
        indefAdded: addedIndefs,
      });

      playPurchaseChime();
      setChatMessages((p) => [
        ...p,
        `🎁 [Tienda VIP] ¡Regalo enviado! ${item.name} → ${targetEmail} • Ref ${txId}`
      ]);
      setPaymentStep("success");
    } catch (err: any) {
      console.error("Error sending owner gift:", err);
      setPaymentStep("gift");
      setShopCheckoutError(
        lang === "es"
          ? `No se pudo enviar el regalo (${err?.message || "error de permisos"}).`
          : `Failed to send gift (${err?.message || "permission error"}).`
      );
      if (String(err?.message || "").toLowerCase().includes("permission")) {
        handleFirestoreError(err, OperationType.WRITE, `user_roles/${targetEmail}`);
      }
    }
  };

  const handleExpressPaymentRequest = async (item: StoreProductDef) => {
    setShopCheckoutError("");
    if (typeof window === "undefined" || !(window as any).PaymentRequest) {
      setShopCheckoutError(
        lang === "es"
          ? "Tu navegador actual no soporta pago nativo rápido; usa Tarjeta o PayPal abajo."
          : "Express browser payment is unavailable here; please use Card or PayPal below."
      );
      return;
    }
    try {
      const supportedInstruments = [
        {
          supportedMethods: "basic-card",
          data: { supportedNetworks: ["visa", "mastercard", "amex"] },
        },
      ];
      const details = {
        total: {
          label: item.name,
          amount: { currency: "USD", value: item.priceUsd.toFixed(2) },
        },
      };
      const request = new (window as any).PaymentRequest(supportedInstruments, details);
      const response = await request.show();
      await response.complete("success");
      await handlePurchaseComplete("pay_api");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setShopCheckoutError(lang === "es" ? "Pago cancelado por el usuario." : "Payment cancelled.");
      } else {
        setShopCheckoutError(
          lang === "es"
            ? "Pasarela nativa no disponible en este entorno. Usa Tarjeta o PayPal."
            : "Native checkout unavailable in this frame. Please use Card or PayPal."
        );
      }
    }
  };

  const renderShopModal = () => {
    if (!isShopOpen) return null;

    const isOwnerGiftAccount = googleUser?.email?.toLowerCase().trim() === "lionbastias18@gmail.com";
    const products = getStoreCatalog();
    const visibleProducts =
      shopCategory === "all"
        ? products
        : products.filter((p) => p.category === shopCategory);
    const currentSelected = products.find((p) => p.id === selectedProduct);

    const cardDigits = cardForm.number.replace(/\s+/g, "");
    const detectedBrand = cardDigits.startsWith("4")
      ? "VISA"
      : /^5[1-5]/.test(cardDigits)
        ? "MASTERCARD"
        : /^3[47]/.test(cardDigits)
          ? "AMEX"
          : "CARD";

    return (
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 bg-black/90 z-[100010] flex flex-col items-center justify-start safe-area-inset p-2 sm:p-4 overflow-y-auto overscroll-contain pointer-events-auto text-left"
      >
        <div className="bg-zinc-950 border-2 border-amber-500/50 p-3.5 sm:p-6 rounded-2xl w-full max-w-[min(64rem,calc(100vw-1rem))] shadow-2xl flex flex-col gap-3 sm:gap-4 relative text-white font-sans max-h-[calc(100dvh-1rem)] my-auto overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500/25 to-emerald-500/20 rounded-xl flex items-center justify-center border border-amber-400/40">
                <i className="fas fa-store text-amber-400 text-lg" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black minecraft-font uppercase tracking-tight text-white flex flex-wrap items-center gap-2">
                  <span>{lang === "es" ? "TIENDA VIP & MARKETPLACE" : "VIP STORE & MARKETPLACE"}</span>
                  {isOwnerGiftAccount && (
                    <span className="bg-gradient-to-r from-purple-600 to-amber-500 text-white text-[9px] font-mono font-black px-2 py-0.5 rounded-full border border-white/25 tracking-wider">
                      🎁 {lang === "es" ? "DUEÑO: REGALOS ACTIVOS" : "OWNER: GIFTS ENABLED"}
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-zinc-400 font-mono">
                  {lang === "es"
                    ? "Indefs oficiales, rangos permanentes, skins 3D y kits"
                    : "Official Indefs, permanent ranks, 3D skins & kits"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Indef Wallet Pill */}
              <div className="bg-zinc-900 border border-emerald-500/40 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-inner">
                <span className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-400 to-amber-400 text-zinc-950 font-black text-[11px] flex items-center justify-center shadow">
                  ◈
                </span>
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-mono font-black text-emerald-300 tabular-nums">
                    {indefCoins.toLocaleString()}
                  </span>
                  <span className="text-[8px] uppercase font-bold text-zinc-400 tracking-wider font-mono">
                    INDEFS
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentStep("idle");
                    setSelectedProduct(null);
                    setShopCategory("indefs");
                  }}
                  className="ml-1 w-5 h-5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs flex items-center justify-center cursor-pointer"
                  title={lang === "es" ? "Recargar Indefs" : "Top up Indefs"}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsShopOpen(false);
                  setSelectedProduct(null);
                  setPaymentMethod(null);
                  setShopCheckoutError("");
                  setPaymentStep("idle");
                }}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 transition cursor-pointer"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {paymentStep === "idle" ? (
            <>
              {/* Daily Free Indefs Claim & VIP Perks Banner */}
              {(() => {
                const elapsed = Date.now() - lastDailyIndefClaim;
                const remainingMs = Math.max(0, DAILY_INDEF_COOLDOWN_MS - elapsed);
                const canClaimDaily = remainingMs === 0;
                const remHours = Math.floor(remainingMs / (1000 * 60 * 60));
                const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                const discountLabel = mvpActive ? "-25% MVP+" : vipActive ? "-20% VIP" : null;

                return (
                  <div className="bg-gradient-to-r from-emerald-950/80 via-zinc-900 to-amber-950/60 border border-emerald-500/35 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 font-black">
                        ◈
                      </div>
                      <div className="leading-tight">
                        <p className="text-xs font-black text-white flex flex-wrap items-center gap-1.5">
                          <span>
                            {lang === "es"
                              ? `Bono Diario de Indefs (+${dailyIndefRewardAmount} ◈)`
                              : `Daily Indef Bonus (+${dailyIndefRewardAmount} ◈)`}
                          </span>
                          {discountLabel && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/40 text-amber-300 font-mono">
                              {discountLabel} INDEFS
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          {lang === "es"
                            ? "VIP duplica bonos (+250) + 20% dto • MVP+ (+400) + 25% dto"
                            : "VIP gets +250 daily & 20% off • MVP+ gets +400 daily & 25% off"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canClaimDaily}
                      onClick={handleClaimDailyIndefs}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
                        canClaimDaily
                          ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md cursor-pointer active:scale-95"
                          : "bg-zinc-800/90 text-zinc-400 border border-white/10 cursor-not-allowed"
                      }`}
                    >
                      <i className={`fas ${canClaimDaily ? "fa-gift" : "fa-clock"}`} />
                      <span>
                        {canClaimDaily
                          ? (lang === "es" ? `Reclamar +${dailyIndefRewardAmount}` : `Claim +${dailyIndefRewardAmount}`)
                          : `${remHours}h ${remMins}m`}
                      </span>
                    </button>
                  </div>
                );
              })()}

              {/* Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
                {[
                  { id: "all", label: lang === "es" ? "Todo el Catálogo" : "All Items", icon: "fa-border-all" },
                  { id: "realms", label: "Realms", icon: "fa-chess-rook" },
                  { id: "indefs", label: lang === "es" ? "Paquetes Indef" : "Indef Packs", icon: "fa-gem" },
                  { id: "passes", label: lang === "es" ? "Rangos y Pases" : "Ranks & Passes", icon: "fa-crown" },
                  { id: "skins", label: lang === "es" ? "Skins 3D" : "3D Skins", icon: "fa-user-astronaut" },
                  { id: "cosmetics", label: lang === "es" ? "Kits y Capas" : "Kits & Capes", icon: "fa-hammer" },
                  { id: "history", label: lang === "es" ? `Historial (${purchaseHistory.length})` : `Receipts (${purchaseHistory.length})`, icon: "fa-receipt" },
                ].map((tab) => {
                  const active = shopCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setShopCategory(tab.id as any)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer ${
                        active
                          ? "bg-amber-500 border-amber-300 text-zinc-950 font-black shadow-md"
                          : "bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      <i className={`fas ${tab.icon} text-xs`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Body Grid or Receipt History */}
              <div className="flex-1 overflow-y-auto pr-1">
                {shopCategory === "history" ? (
                  purchaseHistory.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 flex flex-col items-center gap-2">
                      <i className="fas fa-receipt text-3xl text-zinc-600" />
                      <p className="text-sm font-bold text-zinc-300">
                        {lang === "es" ? "Aún no tienes compras registradas." : "No verified transactions yet."}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {lang === "es"
                          ? "Tus compras reales de Indefs, pases VIP o skins 3D aparecerán aquí con su recibo."
                          : "Your verified Indef, VIP rank, and 3D skin receipts will appear here."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {purchaseHistory.map((tx) => {
                        const isGift = tx.currency === "GIFT" || Boolean(tx.giftedBy);
                        return (
                          <div
                            key={tx.id}
                            className={`border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 ${
                              isGift
                                ? "bg-purple-950/35 border-purple-400/35"
                                : "bg-zinc-900/90 border-white/10"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${
                                isGift
                                  ? "bg-purple-500/20 border-purple-400/40 text-purple-300"
                                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                              }`}>
                                <i className={`fas ${isGift ? "fa-gift" : "fa-check"}`} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-white flex items-center gap-2">
                                  <span>{tx.productName}</span>
                                  {isGift && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/30 border border-purple-400/40 text-purple-200 font-mono uppercase">
                                      {lang === "es" ? "Regalo" : "Gift"}
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] font-mono text-zinc-400">
                                  {tx.id} • {isGift ? `${lang === "es" ? "De" : "From"} ${tx.giftedBy || "Owner"}` : (tx.paymentMethod || "Verified")} •{" "}
                                  {new Date(tx.timestamp).toLocaleString()}
                                </p>
                                {tx.giftNote && (
                                  <p className="text-[11px] text-purple-200/90 italic mt-0.5">
                                    “{tx.giftNote}”
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className={`font-mono text-xs font-black tabular-nums ${isGift ? "text-purple-300" : "text-emerald-300"}`}>
                              {isGift
                                ? (lang === "es" ? "REGALADO" : "GIFTED")
                                : tx.currency === "BONUS"
                                  ? (lang === "es" ? "RECLAMADO" : "CLAIMED")
                                  : tx.currency === "INDEF"
                                    ? `${Number(tx.price).toLocaleString()} Indefs`
                                    : `$${Number(tx.price).toFixed(2)} USD`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-2">
                    {visibleProducts.map((p) => {
                      const effectiveIndefs = getEffectiveIndefPrice(p.priceIndefs);
                      const hasIndefDiscount = !!p.priceIndefs && !!effectiveIndefs && effectiveIndefs < p.priceIndefs;
                      const canAffordIndefs = !!effectiveIndefs && indefCoins >= effectiveIndefs;
                      const isSkinEquipped = !!p.skinId && characterSkin === p.skinId;
                      const isKitClaimed = !!p.kitId && !!claimedWorldKits[p.kitId];
                      return (
                        <div
                          key={p.id}
                          className="bg-zinc-900/80 border border-white/10 hover:border-amber-400/50 rounded-2xl p-4 flex flex-col justify-between transition-all shadow-lg"
                          style={{ borderTopColor: `${p.accentColor}88`, borderTopWidth: "3px" }}
                        >
                          <div className="flex flex-col gap-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="w-11 h-11 bg-zinc-950 border border-white/10 rounded-xl flex items-center justify-center shrink-0">
                                <i className={`fas ${p.icon} text-lg`} />
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {p.owned ? (
                                  <span className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-md uppercase font-mono">
                                    {lang === "es" ? "En propiedad" : "Owned"}
                                  </span>
                                ) : (
                                  <span className="font-mono text-sm font-black text-white tabular-nums">
                                    {p.priceUsd === 0 ? (lang === "es" ? "GRATIS" : "FREE") : (
                                      <>
                                        ${p.priceUsd.toFixed(2)} <span className="text-[10px] text-zinc-400">USD</span>
                                      </>
                                    )}
                                  </span>
                                )}
                                {p.badge && !p.owned && (
                                  <span
                                    className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                                    style={{ color: p.accentColor }}
                                  >
                                    {p.badge}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-black text-white uppercase tracking-tight">
                                {p.name}
                              </h3>
                              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{p.desc}</p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
                            {p.owned ? (
                              p.skinId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    resumeAudio();
                                    handleSelectSkin(p.skinId!);
                                  }}
                                  className={`w-full font-black py-2 rounded-xl text-xs uppercase transition cursor-pointer ${
                                    isSkinEquipped
                                      ? "bg-emerald-600/25 border border-emerald-400 text-emerald-300"
                                      : "bg-sky-600 hover:bg-sky-500 text-white"
                                  }`}
                                >
                                  {isSkinEquipped
                                    ? (lang === "es" ? "✓ Skin Equipada" : "✓ Equipped")
                                    : (lang === "es" ? "Equipar Skin 3D" : "Equip 3D Skin")}
                                </button>
                              ) : p.kitId && appState === "playing" && currentWorld ? (
                                <button
                                  type="button"
                                  disabled={isKitClaimed}
                                  onClick={() => handleClaimKitInWorld(p.kitId!)}
                                  className={`w-full font-black py-2 rounded-xl text-xs uppercase transition ${
                                    isKitClaimed
                                      ? "bg-zinc-800 text-zinc-400 border border-white/5 cursor-not-allowed"
                                      : "bg-amber-500 hover:bg-amber-400 text-zinc-950 cursor-pointer"
                                  }`}
                                >
                                  {isKitClaimed
                                    ? (lang === "es" ? "✓ Kit Entregado" : "✓ Claimed Here")
                                    : (lang === "es" ? "Enviar Kit al Inventario" : "Send Kit to Inventory")}
                                </button>
                              ) : p.category === "realms" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsShopOpen(false);
                                    setRealmsTab("my");
                                    setIsRealmsOpen(true);
                                  }}
                                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-2 rounded-xl text-xs uppercase cursor-pointer transition"
                                >
                                  {lang === "es" ? "Abrir Mis Realms" : "Open My Realms"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="w-full bg-zinc-800 text-zinc-400 font-bold py-2 rounded-xl text-xs uppercase cursor-not-allowed border border-white/5"
                                >
                                  {lang === "es" ? "Desbloqueado" : "Unlocked"}
                                </button>
                              )
                            ) : p.priceUsd === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  handleActivateFreeRealmBasic();
                                }}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-2.5 px-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <i className="fas fa-gift" />
                                <span>{lang === "es" ? "Adquirir Gratis ($0.00)" : "Claim Free ($0.00)"}</span>
                              </button>
                            ) : (
                              <>
                                {effectiveIndefs && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedProduct(p.id);
                                      setPaymentMethod("indefs");
                                      setShopCheckoutError("");
                                      setPaymentStep("form");
                                    }}
                                    className={`w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                                      canAffordIndefs
                                        ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                        : "bg-zinc-950 border border-emerald-500/30 text-emerald-300 hover:bg-zinc-800"
                                    }`}
                                  >
                                    <span>◈</span>
                                    {hasIndefDiscount && p.priceIndefs && (
                                      <span className="line-through opacity-60 text-[10px] tabular-nums">
                                        {p.priceIndefs.toLocaleString()}
                                      </span>
                                    )}
                                    <span className="tabular-nums">
                                      {lang === "es"
                                        ? `Canjear ${effectiveIndefs.toLocaleString()} Indefs`
                                        : `Get for ${effectiveIndefs.toLocaleString()} Indefs`}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProduct(p.id);
                                    setPaymentMethod("card");
                                    setShopCheckoutError("");
                                    setPaymentStep("form");
                                  }}
                                  className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-2 px-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
                                >
                                  {lang === "es"
                                    ? `Comprar $${p.priceUsd.toFixed(2)} USD`
                                    : `Buy $${p.priceUsd.toFixed(2)} USD`}
                                </button>
                              </>
                            )}

                            {isOwnerGiftAccount && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProduct(p.id);
                                  setShopCheckoutError("");
                                  setGiftSearch("");
                                  setPaymentStep("gift");
                                }}
                                className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 text-white font-black py-2 px-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer"
                              >
                                <i className="fas fa-gift text-xs" />
                                <span>{lang === "es" ? "Regalar a Jugador" : "Gift to Player"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* REAL CHECKOUT / OWNER GIFT STAGE */
            <div className="bg-zinc-900/70 p-4 sm:p-6 rounded-2xl border border-white/10 flex flex-col gap-4 overflow-y-auto">
              {paymentStep === "gift" && isOwnerGiftAccount && currentSelected && (() => {
                const normalizedSearch = giftSearch.trim().toLowerCase();
                const filteredPlayers = allUserRolesList
                  .filter((u) => {
                    if (!u.email) return false;
                    if (!normalizedSearch) return true;
                    return (
                      u.email.toLowerCase().includes(normalizedSearch) ||
                      (u.displayName || "").toLowerCase().includes(normalizedSearch)
                    );
                  })
                  .slice(0, 24);

                return (
                  <div className="flex flex-col gap-4 text-left">
                    <div className="flex flex-wrap justify-between items-center gap-2 border-b border-white/10 pb-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentStep("idle");
                          setShopCheckoutError("");
                        }}
                        className="text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 uppercase font-bold cursor-pointer"
                      >
                        <i className="fas fa-arrow-left" /> {lang === "es" ? "Volver al catálogo" : "Back to store"}
                      </button>
                      <div className="text-right">
                        <span className="text-[10px] text-purple-300 uppercase tracking-wider font-mono font-bold block">
                          🎁 {lang === "es" ? "REGALO EXCLUSIVO DE DUEÑO" : "OWNER EXCLUSIVE GIFT"}
                        </span>
                        <span className="text-sm font-black text-amber-400 uppercase">
                          {currentSelected.name}
                        </span>
                      </div>
                    </div>

                    {shopCheckoutError && (
                      <div className="bg-red-500/15 border border-red-400/50 text-red-200 text-xs font-bold px-3 py-2.5 rounded-xl">
                        {shopCheckoutError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* Left: Recipient Email + Message */}
                      <div className="lg:col-span-6 flex flex-col gap-3">
                        <div className="bg-zinc-950 border border-purple-500/30 rounded-2xl p-4 flex flex-col gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
                              <i className="fas fa-gift text-base" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black text-white uppercase">
                                {lang === "es" ? "Datos del Destinatario" : "Recipient Details"}
                              </h3>
                              <p className="text-[11px] text-zinc-400">
                                {lang === "es"
                                  ? "El regalo se acreditará al instante en su cuenta Google."
                                  : "The gift is credited immediately to their Google account."}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-300 tracking-wider">
                              {lang === "es" ? "Correo del Jugador" : "Player Email"}
                            </label>
                            <input
                              type="email"
                              placeholder="jugador@gmail.com"
                              value={giftRecipientEmail}
                              onChange={(e) => {
                                setGiftRecipientEmail(e.target.value);
                                setShopCheckoutError("");
                              }}
                              className="w-full bg-zinc-900 border border-white/15 focus:border-purple-400 py-2.5 px-3 rounded-xl text-xs font-mono text-white focus:outline-none"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-300 tracking-wider">
                              {lang === "es" ? "Mensaje de Regalo (Opcional)" : "Gift Message (Optional)"}
                            </label>
                            <input
                              type="text"
                              maxLength={200}
                              placeholder={lang === "es" ? "¡Disfruta tu regalo VIP de parte del dueño!" : "Enjoy your VIP gift from the owner!"}
                              value={giftNote}
                              onChange={(e) => setGiftNote(e.target.value)}
                              className="w-full bg-zinc-900 border border-white/15 focus:border-purple-400 py-2.5 px-3 rounded-xl text-xs text-white focus:outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleOwnerGiftComplete}
                            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-amber-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg cursor-pointer transition"
                          >
                            <i className="fas fa-paper-plane" />
                            <span>
                              {lang === "es"
                                ? `Regalar ${currentSelected.name} Gratis`
                                : `Send ${currentSelected.name} Free Gift`}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Right: Registered Players Quick Picker */}
                      <div className="lg:col-span-6 flex flex-col gap-2 bg-zinc-950 border border-white/10 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-zinc-200 uppercase">
                            {lang === "es" ? "Jugadores Registrados" : "Registered Players"}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {allUserRolesList.length} {lang === "es" ? "cuentas" : "accounts"}
                          </span>
                        </div>

                        <div className="relative">
                          <i className="fas fa-search absolute left-3 top-2.5 text-zinc-500 text-xs" />
                          <input
                            type="text"
                            placeholder={lang === "es" ? "Buscar nombre o correo..." : "Search name or email..."}
                            value={giftSearch}
                            onChange={(e) => setGiftSearch(e.target.value)}
                            className="w-full bg-zinc-900 border border-white/10 focus:border-purple-400 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                          {filteredPlayers.length === 0 ? (
                            <p className="text-xs text-zinc-500 text-center py-6">
                              {lang === "es"
                                ? "No hay coincidencias. Puedes escribir cualquier correo manualmente a la izquierda."
                                : "No matching players. You can type any email manually on the left."}
                            </p>
                          ) : (
                            filteredPlayers.map((u) => {
                              const selected = giftRecipientEmail.trim().toLowerCase() === u.email.toLowerCase();
                              const alreadyHasItem =
                                u.ownedShopItems?.includes(currentSelected.id) ||
                                (currentSelected.id === "vip_pass" && u.vipActive) ||
                                (currentSelected.id === "mvp_plus" && u.mvpActive);
                              return (
                                <button
                                  key={u.email}
                                  type="button"
                                  onClick={() => {
                                    setGiftRecipientEmail(u.email);
                                    setShopCheckoutError("");
                                  }}
                                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                                    selected
                                      ? "bg-purple-600/25 border-purple-400 shadow"
                                      : "bg-zinc-900/70 border-white/5 hover:border-white/25"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                      <span>{u.displayName || u.email.split("@")[0]}</span>
                                      {u.mvpActive ? (
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">MVP+</span>
                                      ) : u.vipActive ? (
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">VIP</span>
                                      ) : null}
                                    </p>
                                    <p className="text-[10px] font-mono text-zinc-400 truncate">{u.email}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    {typeof u.indefCoins === "number" && (
                                      <p className="text-[10px] font-mono text-emerald-300 font-bold">
                                        ◈ {u.indefCoins.toLocaleString()}
                                      </p>
                                    )}
                                    {alreadyHasItem && !currentSelected.consumable && (
                                      <span className="text-[9px] font-mono text-zinc-400">
                                        {lang === "es" ? "Ya lo tiene" : "Owned"}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {paymentStep === "form" && currentSelected && (
                <div className="flex flex-col gap-4 text-left">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentStep("idle");
                        setPaymentMethod(null);
                        setShopCheckoutError("");
                      }}
                      className="text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 uppercase font-bold cursor-pointer"
                    >
                      <i className="fas fa-arrow-left" /> {lang === "es" ? "Volver al catálogo" : "Back to store"}
                    </button>
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold block">
                        {lang === "es" ? "ARTÍCULO SELECCIONADO" : "SELECTED ITEM"}
                      </span>
                      <span className="text-sm font-black text-amber-400 uppercase">
                        {currentSelected.name}
                      </span>
                    </div>
                  </div>

                  {shopCheckoutError && (
                    <div className="bg-red-500/15 border border-red-400/50 text-red-200 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center justify-between gap-2">
                      <span>{shopCheckoutError}</span>
                      {paymentMethod === "indefs" && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentStep("idle");
                            setSelectedProduct(null);
                            setShopCategory("indefs");
                            setShopCheckoutError("");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500 text-zinc-950 font-black text-[10px] uppercase shrink-0 cursor-pointer"
                        >
                          {lang === "es" ? "Comprar Indefs" : "Top Up Indefs"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Payment Method Selector */}
                  <div className={`grid ${currentSelected.priceIndefs ? "grid-cols-3" : "grid-cols-2"} gap-2 bg-zinc-950 p-1 rounded-xl border border-white/10`}>
                    {currentSelected.priceIndefs && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethod("indefs");
                          setShopCheckoutError("");
                        }}
                        className={`py-2 px-2 rounded-lg text-xs uppercase font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          paymentMethod === "indefs"
                            ? "bg-emerald-600 text-white"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <span>◈ Indefs</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("card");
                        setShopCheckoutError("");
                      }}
                      className={`py-2 px-2 rounded-lg text-xs uppercase font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        paymentMethod === "card"
                          ? "bg-amber-500 text-zinc-950"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <i className="fas fa-credit-card text-xs" />
                      <span>{lang === "es" ? "Tarjeta" : "Card"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("paypal");
                        setShopCheckoutError("");
                      }}
                      className={`py-2 px-2 rounded-lg text-xs uppercase font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        paymentMethod === "paypal"
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <i className="fab fa-paypal text-xs" />
                      <span>PayPal</span>
                    </button>
                  </div>

                  {paymentMethod === "indefs" && currentSelected.priceIndefs ? (() => {
                    const effectiveCost = getEffectiveIndefPrice(currentSelected.priceIndefs) || currentSelected.priceIndefs;
                    return (
                      <div className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-5 flex flex-col items-center text-center gap-4 max-w-md mx-auto w-full">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-2xl text-emerald-300 font-black">
                          ◈
                        </div>
                        <div>
                          <h3 className="text-base font-black text-white uppercase">
                            {lang === "es" ? "Confirmar Canje con Indefs" : "Confirm Indef Purchase"}
                          </h3>
                          <p className="text-xs text-zinc-400 mt-1">
                            {lang === "es"
                              ? `Costo: ${effectiveCost.toLocaleString()} Indefs • Saldo actual: ${indefCoins.toLocaleString()} Indefs`
                              : `Cost: ${effectiveCost.toLocaleString()} Indefs • Balance: ${indefCoins.toLocaleString()} Indefs`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePurchaseComplete("indefs")}
                          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest cursor-pointer transition"
                        >
                          {lang === "es"
                            ? `Pagar ${effectiveCost.toLocaleString()} Indefs`
                            : `Pay ${effectiveCost.toLocaleString()} Indefs`}
                        </button>
                      </div>
                    );
                  })() : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      <div className="lg:col-span-7 flex flex-col gap-3">
                        {/* Native Web PaymentRequest Express Checkout when supported */}
                        {typeof window !== "undefined" && Boolean((window as any).PaymentRequest) && (
                          <button
                            type="button"
                            onClick={() => handleExpressPaymentRequest(currentSelected)}
                            className="w-full py-2.5 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                          >
                            <i className="fas fa-wallet text-emerald-400" />
                            <span>
                              {lang === "es"
                                ? `Pago Rápido del Navegador ($${currentSelected.priceUsd.toFixed(2)} USD)`
                                : `Express Browser Pay ($${currentSelected.priceUsd.toFixed(2)} USD)`}
                            </span>
                          </button>
                        )}

                        {paymentMethod === "card" ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                                  {lang === "es" ? "Número de Tarjeta" : "Card Number"}
                                </label>
                                <span className="text-[10px] font-mono font-bold text-amber-400">{detectedBrand}</span>
                              </div>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="4532 •••• •••• ••••"
                                maxLength={19}
                                value={cardForm.number}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                                  const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
                                  setCardForm({ ...cardForm, number: formatted });
                                  setShopCheckoutError("");
                                }}
                                className="w-full bg-zinc-950 border border-white/15 focus:border-amber-400 py-2.5 px-3 rounded-xl text-sm font-mono tracking-wider focus:outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                                {lang === "es" ? "Nombre del Titular" : "Cardholder Name"}
                              </label>
                              <input
                                type="text"
                                placeholder="NOMBRE APELLIDO"
                                value={cardForm.name}
                                onChange={(e) => {
                                  setCardForm({ ...cardForm, name: e.target.value.toUpperCase() });
                                  setShopCheckoutError("");
                                }}
                                className="w-full bg-zinc-950 border border-white/15 focus:border-amber-400 py-2.5 px-3 rounded-xl text-sm uppercase focus:outline-none"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                                  {lang === "es" ? "Vencimiento" : "Expiry"}
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="MM/YY"
                                  maxLength={5}
                                  value={cardForm.expiry}
                                  onChange={(e) => {
                                    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                    if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
                                    setCardForm({ ...cardForm, expiry: v });
                                    setShopCheckoutError("");
                                  }}
                                  className="w-full bg-zinc-950 border border-white/15 focus:border-amber-400 py-2.5 px-3 rounded-xl text-sm font-mono text-center focus:outline-none"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">CVV</label>
                                <input
                                  type="password"
                                  inputMode="numeric"
                                  placeholder="•••"
                                  maxLength={4}
                                  value={cardForm.cvv}
                                  onChange={(e) => {
                                    setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, "") });
                                    setShopCheckoutError("");
                                  }}
                                  className="w-full bg-zinc-950 border border-white/15 focus:border-amber-400 py-2.5 px-3 rounded-xl text-sm font-mono text-center focus:outline-none"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const cleanDigits = cardForm.number.replace(/\s+/g, "");
                                if (!isValidLuhnCard(cleanDigits)) {
                                  setShopCheckoutError(
                                    lang === "es"
                                      ? "Número de tarjeta inválido (falló verificación Luhn)."
                                      : "Invalid card number (failed Luhn check)."
                                  );
                                  return;
                                }
                                if (cardForm.name.trim().length < 3) {
                                  setShopCheckoutError(
                                    lang === "es" ? "Ingresa el nombre completo del titular." : "Enter cardholder full name."
                                  );
                                  return;
                                }
                                if (!isValidExpiry(cardForm.expiry)) {
                                  setShopCheckoutError(
                                    lang === "es" ? "Fecha de vencimiento inválida o expirada (MM/YY)." : "Invalid or expired date (MM/YY)."
                                  );
                                  return;
                                }
                                if (cardForm.cvv.length < 3) {
                                  setShopCheckoutError(lang === "es" ? "CVV inválido (3 o 4 dígitos)." : "Invalid CVV (3-4 digits).");
                                  return;
                                }
                                handlePurchaseComplete("card");
                              }}
                              className="w-full mt-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition shadow-lg cursor-pointer"
                            >
                              {lang === "es"
                                ? `Pagar $${currentSelected.priceUsd.toFixed(2)} USD`
                                : `Pay $${currentSelected.priceUsd.toFixed(2)} USD`}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 p-4 rounded-xl border border-blue-500/25 bg-blue-500/5">
                            <div className="flex items-center gap-2 border-b border-blue-500/20 pb-2">
                              <i className="fab fa-paypal text-blue-400 text-lg" />
                              <span className="text-xs uppercase font-mono font-black text-blue-300">PayPal Checkout</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase font-bold text-blue-300">PayPal Email</label>
                              <input
                                type="email"
                                placeholder="usuario@correo.com"
                                value={paypalEmail}
                                onChange={(e) => {
                                  setPaypalEmail(e.target.value);
                                  setShopCheckoutError("");
                                }}
                                className="w-full bg-zinc-950 border border-white/15 focus:border-blue-400 py-2 px-3 rounded-xl text-xs focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase font-bold text-blue-300">
                                {lang === "es" ? "Contraseña" : "Password"}
                              </label>
                              <input
                                type="password"
                                placeholder="••••••••"
                                value={paypalPassword}
                                onChange={(e) => {
                                  setPaypalPassword(e.target.value);
                                  setShopCheckoutError("");
                                }}
                                className="w-full bg-zinc-950 border border-white/15 focus:border-blue-400 py-2 px-3 rounded-xl text-xs focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail.trim())) {
                                  setShopCheckoutError(lang === "es" ? "Introduce un correo de PayPal válido." : "Enter a valid PayPal email.");
                                  return;
                                }
                                if (paypalPassword.length < 6) {
                                  setShopCheckoutError(lang === "es" ? "La contraseña debe tener al menos 6 caracteres." : "Password must be at least 6 characters.");
                                  return;
                                }
                                handlePurchaseComplete("paypal");
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <i className="fab fa-paypal" />
                              <span>
                                {lang === "es"
                                  ? `Autorizar Pago $${currentSelected.priceUsd.toFixed(2)} USD`
                                  : `Authorize $${currentSelected.priceUsd.toFixed(2)} USD`}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right Order Summary + Card Preview */}
                      <div className="lg:col-span-5 flex flex-col gap-3 items-center justify-center lg:border-l lg:border-white/10 lg:pl-5">
                        <div className="w-full max-w-[290px] h-[165px] bg-gradient-to-tr from-slate-900 via-indigo-950 to-emerald-950 rounded-2xl p-4 shadow-2xl flex flex-col justify-between border border-white/15">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[8px] text-zinc-400 font-mono tracking-widest uppercase">VIP Checkout</p>
                              <div className="w-8 h-6 bg-gradient-to-br from-yellow-400 to-amber-600 rounded mt-1" />
                            </div>
                            <span className="text-xs font-black italic text-zinc-200">{detectedBrand}</span>
                          </div>
                          <div>
                            <p className="font-mono text-white text-sm tracking-widest font-black mb-2">
                              {cardForm.number || "•••• •••• •••• ••••"}
                            </p>
                            <div className="flex justify-between items-end text-[10px] font-mono text-zinc-300">
                              <span className="uppercase truncate max-w-[160px]">{cardForm.name || (currentUser || "PLAYER")}</span>
                              <span>{cardForm.expiry || "MM/YY"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="w-full max-w-[290px] bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs flex flex-col gap-1.5 font-mono">
                          <div className="flex justify-between text-zinc-400">
                            <span>{lang === "es" ? "Artículo" : "Item"}</span>
                            <span className="text-white font-bold truncate max-w-[155px]">{currentSelected.name}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Total</span>
                            <span className="text-emerald-400 font-black tabular-nums">${currentSelected.priceUsd.toFixed(2)} USD</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {paymentStep === "processing" && (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center max-w-md mx-auto">
                  <div className="w-14 h-14 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider font-mono">
                      {lang === "es" ? "Validando Pago Real" : "Authorizing Purchase"}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      {lang === "es"
                        ? "Verificando cargo, emitiendo recibo y acreditando en tu cuenta..."
                        : "Validating charge, generating receipt and syncing your account..."}
                    </p>
                  </div>
                </div>
              )}

              {paymentStep === "success" && (
                <div className="flex flex-col items-center justify-center gap-4 py-6 text-center max-w-md mx-auto">
                  <div className={`w-16 h-16 border-2 rounded-full flex items-center justify-center text-2xl ${
                    lastGiftSummary
                      ? "bg-purple-500/20 border-purple-400 text-purple-300"
                      : "bg-emerald-500/15 border-emerald-400 text-emerald-400"
                  }`}>
                    <i className={`fas ${lastGiftSummary ? "fa-gift" : "fa-check"}`} />
                  </div>
                  <div>
                    <h3 className={`text-xl font-black uppercase tracking-tight ${lastGiftSummary ? "text-purple-300" : "text-emerald-400"}`}>
                      {lastGiftSummary
                        ? (lang === "es" ? "¡REGALO ENVIADO!" : "GIFT DELIVERED!")
                        : (lang === "es" ? "¡COMPRA VERIFICADA!" : "PURCHASE VERIFIED!")}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {lastGiftSummary
                        ? (lang === "es"
                            ? "El artículo fue acreditado inmediatamente en la cuenta del jugador."
                            : "The item was immediately credited to the recipient player account.")
                        : (lang === "es"
                            ? "Tus artículos e Indefs ya están activos en tu perfil."
                            : "Your items and Indefs are now active on your account.")}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-white/10 rounded-xl p-3.5 w-full text-left flex flex-col gap-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">ID:</span>
                      <span className="text-zinc-200 font-bold">{transactionId}</span>
                    </div>
                    {lastGiftSummary ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">{lang === "es" ? "Destinatario:" : "Recipient:"}</span>
                          <span className="text-purple-300 font-bold truncate max-w-[220px]">{lastGiftSummary.recipientEmail}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">{lang === "es" ? "Regalo:" : "Gift:"}</span>
                          <span className="text-amber-400 font-bold">{lastGiftSummary.productName}</span>
                        </div>
                        {lastGiftSummary.indefAdded > 0 && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">{lang === "es" ? "Acreditado:" : "Credited:"}</span>
                            <span className="text-emerald-400 font-black">+{lastGiftSummary.indefAdded.toLocaleString()} Indefs</span>
                          </div>
                        )}
                        {lastGiftSummary.note && (
                          <div className="flex justify-between gap-2">
                            <span className="text-zinc-500">{lang === "es" ? "Mensaje:" : "Note:"}</span>
                            <span className="text-zinc-200 italic truncate max-w-[220px]">{lastGiftSummary.note}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">{lang === "es" ? "Artículo:" : "Item:"}</span>
                          <span className="text-amber-400 font-bold">{currentSelected?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">{lang === "es" ? "Método:" : "Method:"}</span>
                          <span className="text-zinc-200 font-bold">{lastReceiptSummary?.method}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">{lang === "es" ? "Importe:" : "Paid:"}</span>
                          <span className="text-emerald-400 font-black tabular-nums">{lastReceiptSummary?.amountText}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setPaymentMethod(null);
                      setLastGiftSummary(null);
                      setShopCheckoutError("");
                      setPaymentStep("idle");
                    }}
                    className={`w-full font-black py-2.5 rounded-xl text-xs uppercase tracking-widest cursor-pointer transition ${
                      lastGiftSummary
                        ? "bg-purple-500 hover:bg-purple-400 text-white"
                        : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                    }`}
                  >
                    {lang === "es" ? "Seguir en la Tienda" : "Continue Shopping"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRealmsModal = () => {
    if (!isRealmsOpen) return null;

    const combinedVisibleRealms: RealmData[] = [
      ...myRealms,
      ...joinedRealms.filter((jr) => !myRealms.some((mr) => mr.id === jr.id)),
    ];
    const activeInspectRealm =
      combinedVisibleRealms.find((r) => r.id === selectedRealmId) ||
      allAdminRealms.find((r) => r.id === selectedRealmId) ||
      combinedVisibleRealms[0] ||
      null;

    const acceptedFriends = friendships.filter((f) => f.status === "accepted");

    return (
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 bg-black/88 z-[100025] flex flex-col items-center justify-start safe-area-inset p-2 sm:p-4 overflow-y-auto overscroll-contain pointer-events-auto text-left"
      >
        <div className="bg-zinc-950 border-4 border-cyan-500/70 p-3.5 sm:p-6 rounded-3xl w-full max-w-[min(56rem,calc(100vw-1rem))] shadow-2xl flex flex-col gap-3 text-white font-sans max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center border border-cyan-400/40">
                <i className="fas fa-chess-rook text-cyan-300 text-lg" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black minecraft-font uppercase tracking-wide text-cyan-300 flex items-center gap-2 flex-wrap">
                  <span>REALMS</span>
                  {isRealmAdmin && (
                    <span className="text-[9px] bg-yellow-500/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-mono">
                      👑 ADMIN GRATIS ∞
                    </span>
                  )}
                </h2>
                <p className="text-[10px] sm:text-xs text-zinc-400 font-mono font-bold">
                  {lang === "es"
                    ? "Plan 1 Gratis (2 Amigos · 3 Mundos) • Plan 2 Plus (4 Amigos · 6 Mundos)"
                    : "Plan 1 Free (2 Friends · 3 Worlds) • Plan 2 Plus (4 Friends · 6 Worlds)"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-mono font-black px-2.5 py-1 rounded-lg border uppercase ${
                  effectiveRealmPlan === "plus"
                    ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                    : effectiveRealmPlan === "basic"
                      ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200"
                      : "bg-zinc-900 border-white/10 text-zinc-400"
                }`}
              >
                {effectiveRealmPlan === "plus"
                  ? "PLAN PLUS (4A / 6M)"
                  : effectiveRealmPlan === "basic"
                    ? "PLAN BÁSICO (2A / 3M)"
                    : (lang === "es" ? "SIN PLAN" : "NO PLAN")}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRealmsOpen(false);
                  setRealmStatusMsg(null);
                }}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 transition cursor-pointer"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {/* Google Sign-In Notice for Guests */}
          {!googleUser && (
            <div className="bg-amber-500/10 border border-amber-400/35 rounded-xl px-3.5 py-2.5 flex flex-col gap-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-amber-200 font-medium">
                  {lang === "es"
                    ? "Conecta tu cuenta Google para guardar Realms en la nube, invitar amigos y permitir que el admin se una."
                    : "Sign in with Google to sync Realms in the cloud and invite friends."}
                </p>
                <button
                  type="button"
                  disabled={isGoogleLoginLoading}
                  onClick={handleGoogleLogin}
                  className="bg-white hover:bg-zinc-200 text-zinc-950 font-black text-[10px] uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-65"
                >
                  <i className={isGoogleLoginLoading ? "fas fa-spinner fa-spin text-zinc-700" : "fab fa-google text-red-500"} />
                  <span>{isGoogleLoginLoading ? (lang === "es" ? "Conectando..." : "Connecting...") : (lang === "es" ? "Conectar Google" : "Sign in Google")}</span>
                </button>
              </div>
              {loginError && (
                <p className="text-[11px] text-red-300 font-mono font-bold">
                  <i className="fas fa-circle-exclamation mr-1" />
                  {loginError}
                </p>
              )}
            </div>
          )}

          {/* Status Message */}
          {realmStatusMsg && (
            <div
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 shrink-0 border ${
                realmStatusMsg.type === "ok"
                  ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                  : "bg-red-500/15 border-red-400/40 text-red-200"
              }`}
            >
              <i className={`fas ${realmStatusMsg.type === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} />
              <span>{realmStatusMsg.text}</span>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
            {[
              { id: "my", label: lang === "es" ? `Mis Realms (${combinedVisibleRealms.length})` : `My Realms (${combinedVisibleRealms.length})`, icon: "fa-fort-awesome" },
              { id: "join", label: lang === "es" ? "Unirse por Código" : "Join by Code", icon: "fa-door-open" },
              { id: "plans", label: lang === "es" ? "Planes (Gratis / Plus)" : "Plans (Free / Plus)", icon: "fa-tags" },
              ...(isRealmAdmin ? [{ id: "admin", label: `👑 Admin Gratis (${allAdminRealms.length})`, icon: "fa-crown" }] : []),
            ].map((tab) => {
              const active = realmsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setRealmsTab(tab.id as any);
                    setRealmStatusMsg(null);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer ${
                    active
                      ? tab.id === "admin"
                        ? "bg-yellow-500 border-yellow-300 text-zinc-950"
                        : "bg-cyan-500 border-cyan-300 text-zinc-950"
                      : "bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <i className={`fas ${tab.icon === "fa-fort-awesome" ? "fa-chess-rook" : tab.icon} text-xs`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
            {realmsTab === "plans" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plan 1: FREE */}
                <div className="bg-zinc-900/80 border-2 border-emerald-500/40 rounded-2xl p-5 flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-black px-2.5 py-1 rounded-full uppercase font-mono">
                        OPCIÓN 1 • GRATIS
                      </span>
                      <span className="text-xl font-black text-emerald-400 font-mono">$0.00</span>
                    </div>
                    <h3 className="text-lg font-black text-white uppercase minecraft-font">
                      Realm Básico
                    </h3>
                    <ul className="text-xs text-zinc-300 flex flex-col gap-1.5 font-mono">
                      <li className="flex items-center gap-2">
                        <i className="fas fa-users text-emerald-400" />
                        <span>Capacidad de <strong>2 Amigos</strong></span>
                      </li>
                      <li className="flex items-center gap-2">
                        <i className="fas fa-globe text-emerald-400" />
                        <span>Capacidad de <strong>3 Mundos</strong></span>
                      </li>
                      <li className="flex items-center gap-2">
                        <i className="fas fa-crown text-yellow-400" />
                        <span>Admin (lionbastias18@gmail.com) entra gratis</span>
                      </li>
                    </ul>
                  </div>

                  {effectiveRealmPlan === "basic" || effectiveRealmPlan === "plus" ? (
                    <button
                      type="button"
                      onClick={() => setRealmsTab("my")}
                      className="w-full py-2.5 rounded-xl bg-emerald-600/25 border border-emerald-400/50 text-emerald-300 font-black text-xs uppercase cursor-pointer"
                    >
                      ✓ Desbloqueado — Ir a Mis Realms
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleActivateFreeRealmBasic}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition cursor-pointer shadow-lg"
                    >
                      Adquirir Gratis ($0.00)
                    </button>
                  )}
                </div>

                {/* Plan 2: CHEAP PLUS */}
                <div className="bg-zinc-900/80 border-2 border-cyan-500/50 rounded-2xl p-5 flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-black px-2.5 py-1 rounded-full uppercase font-mono">
                        OPCIÓN 2 • ECONÓMICO
                      </span>
                      <div className="text-right font-mono">
                        <span className="text-xl font-black text-cyan-300">$0.99</span>
                        <span className="text-[10px] text-emerald-300 block font-bold">o 150 Indefs</span>
                      </div>
                    </div>
                    <h3 className="text-lg font-black text-white uppercase minecraft-font">
                      Realm Plus
                    </h3>
                    <ul className="text-xs text-zinc-300 flex flex-col gap-1.5 font-mono">
                      <li className="flex items-center gap-2">
                        <i className="fas fa-users text-cyan-400" />
                        <span>Capacidad de <strong>4 Amigos</strong></span>
                      </li>
                      <li className="flex items-center gap-2">
                        <i className="fas fa-globe text-cyan-400" />
                        <span>Capacidad de <strong>6 Mundos</strong></span>
                      </li>
                      <li className="flex items-center gap-2">
                        <i className="fas fa-crown text-yellow-400" />
                        <span>Admin (lionbastias18@gmail.com) entra gratis</span>
                      </li>
                    </ul>
                  </div>

                  {effectiveRealmPlan === "plus" ? (
                    <button
                      type="button"
                      onClick={() => setRealmsTab("my")}
                      className="w-full py-2.5 rounded-xl bg-cyan-600/25 border border-cyan-400/50 text-cyan-200 font-black text-xs uppercase cursor-pointer"
                    >
                      ✓ {isRealmAdmin ? "Admin Gratis Activado" : "Plan Plus Desbloqueado"}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRealmsOpen(false);
                          setShopCategory("realms");
                          setSelectedProduct("realm_plus");
                          setPaymentMethod("indefs");
                          setShopCheckoutError("");
                          setPaymentStep("form");
                          setIsShopOpen(true);
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer transition"
                      >
                        ◈ Canjear {getEffectiveIndefPrice(150)} Indefs
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRealmsOpen(false);
                          setShopCategory("realms");
                          setSelectedProduct("realm_plus");
                          setPaymentMethod("card");
                          setShopCheckoutError("");
                          setPaymentStep("form");
                          setIsShopOpen(true);
                        }}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider cursor-pointer transition"
                      >
                        Comprar Barato ($0.99 USD)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {realmsTab === "join" && (
              <div className="flex flex-col gap-4">
                <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                    <i className="fas fa-key" />
                    <span>{lang === "es" ? "Ingresar Código de Realm" : "Enter Realm Code"}</span>
                  </h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleJoinRealmByCode();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      placeholder="RLM-XXXXXX"
                      value={joinRealmCodeInput}
                      onChange={(e) => setJoinRealmCodeInput(e.target.value.toUpperCase())}
                      className="flex-1 bg-zinc-950 border border-white/15 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase text-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={realmLoading || !joinRealmCodeInput.trim()}
                      className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-950 font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition shrink-0"
                    >
                      {isRealmAdmin ? "Unirse Gratis (Admin)" : (lang === "es" ? "Unirse" : "Join")}
                    </button>
                  </form>
                  {isRealmAdmin && (
                    <p className="text-[10px] font-mono text-yellow-300/90">
                      👑 Como admin (lionbastias18@gmail.com) te unes gratis a cualquier Realm sin ocupar cupo de amigo.
                    </p>
                  )}
                </div>

                {joinedRealms.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold uppercase text-zinc-400 tracking-wider">
                      Realms donde eres miembro o invitado ({joinedRealms.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {joinedRealms.map((r) => (
                        <div key={r.id} className="bg-zinc-900/70 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-white truncate">{r.name}</p>
                            <p className="text-[10px] font-mono text-zinc-400 truncate">
                              {r.joinCode} • {(r.worldsMeta || []).length}/{r.maxWorlds} mundos
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRealmId(r.id);
                              setRealmsTab("my");
                            }}
                            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-[10px] uppercase px-3 py-1.5 rounded-lg cursor-pointer shrink-0"
                          >
                            Ver Mundos
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {realmsTab === "admin" && isRealmAdmin && (
              <div className="flex flex-col gap-3">
                <div className="bg-yellow-500/10 border border-yellow-400/35 rounded-xl p-3 text-xs text-yellow-200 font-mono">
                  👑 Panel Admin (lionbastias18@gmail.com): puedes unirte gratis a cualquiera de los Realms creados sin costo ni límite de cupos.
                </div>
                {allAdminRealms.length === 0 ? (
                  <div className="py-10 text-center text-zinc-500 text-xs">No hay Realms registrados aún en Firestore.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allAdminRealms.map((r) => {
                      const worldCount = (r.worldsMeta || []).length;
                      const friendCount = (r.memberEmails || []).filter(
                        (e) => e.toLowerCase() !== r.ownerEmail.toLowerCase() && e.toLowerCase() !== "lionbastias18@gmail.com"
                      ).length;
                      const targetWorldId = r.activeWorldId || r.worldIds?.[0] || r.worldsMeta?.[0]?.id;
                      return (
                        <div key={r.id} className="bg-zinc-900/80 border border-yellow-500/30 rounded-2xl p-3.5 flex flex-col gap-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-white truncate">{r.name}</p>
                              <p className="text-[10px] font-mono text-zinc-400 truncate">
                                Dueño: {r.ownerName || r.ownerEmail}
                              </p>
                              <p className="text-[10px] font-mono text-cyan-300">
                                {r.joinCode} • {r.tier === "plus" ? "PLUS" : "BÁSICO"} • {friendCount}/{r.maxFriends} amigos • {worldCount}/{r.maxWorlds} mundos
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRealmId(r.id);
                                setRealmsTab("my");
                              }}
                              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[10px] uppercase py-2 rounded-lg cursor-pointer"
                            >
                              Inspeccionar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleJoinRealmByCode(r.id, Boolean(targetWorldId))}
                              className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-black text-[10px] uppercase py-2 rounded-lg cursor-pointer"
                            >
                              👑 Unirse Gratis
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {realmsTab === "my" && (
              <div className="flex flex-col gap-4">
                {/* Quick Create Realm Bar */}
                <form
                  onSubmit={handleCreateRealm}
                  className="bg-zinc-900/70 border border-white/10 rounded-2xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                >
                  <input
                    type="text"
                    placeholder={lang === "es" ? "Nombre de tu nuevo Realm..." : "New Realm name..."}
                    value={newRealmName}
                    onChange={(e) => setNewRealmName(e.target.value)}
                    maxLength={48}
                    className="flex-1 bg-zinc-950 border border-white/15 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <select
                    value={effectiveRealmPlan === "plus" ? newRealmTier : "basic"}
                    onChange={(e) => setNewRealmTier(e.target.value as "basic" | "plus")}
                    className="bg-zinc-950 border border-white/15 rounded-xl px-2.5 py-2 text-xs text-white font-mono focus:outline-none"
                  >
                    <option value="basic">Básico (2 Amigos · 3 Mundos — Gratis)</option>
                    {effectiveRealmPlan === "plus" && (
                      <option value="plus">Plus (4 Amigos · 6 Mundos)</option>
                    )}
                  </select>
                  <button
                    type="submit"
                    disabled={realmLoading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition shrink-0"
                  >
                    {effectiveRealmPlan === "none" ? "+ Crear Realm Gratis" : "+ Crear Realm"}
                  </button>
                </form>

                {/* Selected Realm Selector Strip */}
                {combinedVisibleRealms.length === 0 && !activeInspectRealm ? (
                  <div className="bg-zinc-900/40 border border-white/5 rounded-2xl py-10 px-4 text-center flex flex-col items-center gap-2.5">
                    <i className="fas fa-chess-rook text-3xl text-cyan-400/70" />
                    <p className="text-sm font-black text-white">
                      {lang === "es" ? "Aún no tienes ningún Realm" : "You don't have a Realm yet"}
                    </p>
                    <p className="text-xs text-zinc-400 max-w-md">
                      {lang === "es"
                        ? "Activa gratis el Plan 1 (2 amigos y 3 mundos) arriba o adquiere Plan 2 Plus (4 amigos y 6 mundos) a precio económico."
                        : "Create your first Realm for free above (2 friends & 3 worlds) or upgrade to Plus (4 friends & 6 worlds)."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {(isRealmAdmin && activeInspectRealm && !combinedVisibleRealms.some((r) => r.id === activeInspectRealm.id)
                        ? [activeInspectRealm, ...combinedVisibleRealms]
                        : combinedVisibleRealms
                      ).map((r) => {
                        const isSel = activeInspectRealm?.id === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRealmId(r.id)}
                            className={`px-3 py-2 rounded-xl border text-left shrink-0 transition cursor-pointer ${
                              isSel
                                ? "bg-cyan-500/20 border-cyan-400 text-white"
                                : "bg-zinc-900/70 border-white/10 text-zinc-400 hover:text-white"
                            }`}
                          >
                            <p className="text-xs font-black truncate max-w-[140px]">{r.name}</p>
                            <p className="text-[9px] font-mono text-cyan-300">
                              {r.joinCode} • {r.tier === "plus" ? "PLUS" : "BÁSICO"}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {activeInspectRealm && (() => {
                      const realm = activeInspectRealm;
                      const isOwner = googleUser ? realm.ownerUid === googleUser.uid : realm.ownerEmail === "guest@local";
                      const canManage = isOwner || isRealmAdmin;
                      const invitedList = (realm.invitedEmails || []).filter((e) => e.toLowerCase() !== "lionbastias18@gmail.com");
                      const friendMembers = (realm.memberEmails || []).filter(
                        (e) => e.toLowerCase() !== realm.ownerEmail.toLowerCase() && e.toLowerCase() !== "lionbastias18@gmail.com"
                      );
                      const hasAdminJoined = (realm.memberEmails || []).some((e) => e.toLowerCase() === "lionbastias18@gmail.com");
                      const realmWorlds = realm.worldsMeta || [];

                      return (
                        <div className="bg-zinc-900/75 border border-cyan-500/30 rounded-2xl p-4 flex flex-col gap-4">
                          {/* Realm Top Summary */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-black text-white uppercase">{realm.name}</h3>
                                <span
                                  className={`text-[9px] font-mono font-black px-2 py-0.5 rounded uppercase ${
                                    realm.tier === "plus"
                                      ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/40"
                                      : "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
                                  }`}
                                >
                                  {realm.tier === "plus" ? "PLUS · 4 Amigos · 6 Mundos" : "BÁSICO · 2 Amigos · 3 Mundos"}
                                </span>
                              </div>
                              <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                                Dueño: {realm.ownerName || realm.ownerEmail} • Código:{" "}
                                <strong className="text-cyan-300">{realm.joinCode}</strong>
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(realm.joinCode);
                                  setRealmStatusMsg({ type: "ok", text: `Código ${realm.joinCode} copiado.` });
                                }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 cursor-pointer"
                              >
                                <i className="fas fa-copy mr-1" /> Copiar Código
                              </button>
                              {isOwner && realm.tier === "basic" && (
                                <button
                                  type="button"
                                  onClick={() => handleUpgradeRealmToPlus(realm)}
                                  className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-[10px] font-black px-2.5 py-1.5 rounded-lg uppercase cursor-pointer"
                                >
                                  ⬆ Mejorar a Plus (4A · 6M)
                                </button>
                              )}
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (googleUser) {
                                      await deleteRealmFromFirestore(realm.id).catch(() => {});
                                    } else {
                                      setMyRealms((prev) => {
                                        const next = prev.filter((x) => x.id !== realm.id);
                                        localStorage.setItem("minecraft_local_realms", JSON.stringify(next));
                                        return next;
                                      });
                                    }
                                    setSelectedRealmId(null);
                                  }}
                                  className="bg-red-950/60 hover:bg-red-600 text-red-300 hover:text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-red-500/30 cursor-pointer"
                                >
                                  <i className="fas fa-trash-alt" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            {/* Friends Capacity Column */}
                            <div className="lg:col-span-5 bg-zinc-950/70 border border-white/10 rounded-xl p-3 flex flex-col gap-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase text-purple-300 flex items-center gap-1.5">
                                  <i className="fas fa-users" /> Amigos ({Math.max(invitedList.length, friendMembers.length)} / {realm.maxFriends})
                                </span>
                                {hasAdminJoined && (
                                  <span className="text-[9px] font-mono bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">
                                    👑 Admin Unido
                                  </span>
                                )}
                              </div>

                              {canManage && (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    handleInviteFriendToRealm(realm, inviteFriendEmailInput);
                                  }}
                                  className="flex gap-1.5"
                                >
                                  <input
                                    type="email"
                                    placeholder="correo-amigo@gmail.com"
                                    value={inviteFriendEmailInput}
                                    onChange={(e) => setInviteFriendEmailInput(e.target.value)}
                                    className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                                  />
                                  <button
                                    type="submit"
                                    disabled={realmLoading}
                                    className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg uppercase cursor-pointer"
                                  >
                                    Invitar
                                  </button>
                                </form>
                              )}

                              {canManage && acceptedFriends.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {acceptedFriends.slice(0, 6).map((f) => {
                                    const fEmail = (f.senderId === activeSession ? f.receiverId : f.senderId).toLowerCase();
                                    if (!fEmail.includes("@")) return null;
                                    return (
                                      <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => handleInviteFriendToRealm(realm, fEmail)}
                                        className="text-[9px] bg-zinc-900 hover:bg-purple-600/30 border border-white/10 text-zinc-300 px-2 py-0.5 rounded-full cursor-pointer"
                                      >
                                        + {fEmail.split("@")[0]}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                                {Array.from(new Set([...invitedList, ...friendMembers])).length === 0 ? (
                                  <p className="text-[11px] text-zinc-500 italic py-2">
                                    Sin amigos invitados aún. Comparte el código {realm.joinCode}.
                                  </p>
                                ) : (
                                  Array.from(new Set([...invitedList, ...friendMembers])).map((em) => {
                                    const joined = friendMembers.includes(em);
                                    return (
                                      <div key={em} className="bg-zinc-900/80 border border-white/5 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-mono text-white truncate">{em}</p>
                                          <p className="text-[9px] text-zinc-400">
                                            {joined ? "✓ Miembro activo" : "⏳ Invitado"}
                                          </p>
                                        </div>
                                        {canManage && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveFriendFromRealm(realm, em)}
                                            className="text-zinc-500 hover:text-red-400 text-xs px-1 cursor-pointer"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Worlds Capacity Column */}
                            <div className="lg:col-span-7 bg-zinc-950/70 border border-white/10 rounded-xl p-3 flex flex-col gap-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase text-emerald-300 flex items-center gap-1.5">
                                  <i className="fas fa-globe" /> Mundos del Realm ({realmWorlds.length} / {realm.maxWorlds})
                                </span>
                              </div>

                              {canManage && realmWorlds.length < realm.maxWorlds && (
                                <form
                                  onSubmit={(e) => handleCreateWorldInRealm(realm, e)}
                                  className="flex flex-wrap gap-1.5"
                                >
                                  <input
                                    type="text"
                                    placeholder="Nombre del mundo..."
                                    value={realmWorldNameInput}
                                    onChange={(e) => setRealmWorldNameInput(e.target.value)}
                                    maxLength={48}
                                    className="flex-1 min-w-[130px] bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                                  />
                                  <select
                                    value={realmWorldMode}
                                    onChange={(e) => setRealmWorldMode(e.target.value as any)}
                                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white"
                                  >
                                    <option value="survival">Supervivencia</option>
                                    <option value="creative">Creativo</option>
                                    <option value="adventure">Aventura</option>
                                  </select>
                                  <select
                                    value={realmWorldType}
                                    onChange={(e) => setRealmWorldType(e.target.value as any)}
                                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white"
                                  >
                                    <option value="normal">Normal</option>
                                    <option value="flat">Plano</option>
                                    <option value="edge_farlands">Far Lands</option>
                                  </select>
                                  <button
                                    type="submit"
                                    disabled={realmLoading}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase cursor-pointer"
                                  >
                                    + Crear Mundo
                                  </button>
                                </form>
                              )}

                              {realmWorlds.length >= realm.maxWorlds && realm.tier === "basic" && isOwner && (
                                <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                                  <span className="text-cyan-200">Límite de 3 mundos alcanzado en Plan Básico.</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpgradeRealmToPlus(realm)}
                                    className="bg-cyan-500 text-zinc-950 font-black text-[10px] px-2.5 py-1 rounded uppercase cursor-pointer shrink-0"
                                  >
                                    Ampliar a 6 Mundos
                                  </button>
                                </div>
                              )}

                              <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                                {realmWorlds.length === 0 ? (
                                  <p className="text-[11px] text-zinc-500 italic py-4 text-center">
                                    No hay mundos en este Realm aún. ¡Crea el primero arriba!
                                  </p>
                                ) : (
                                  realmWorlds.map((w) => (
                                    <div key={w.id} className="bg-zinc-900/90 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-black text-white truncate">{w.name}</p>
                                        <p className="text-[9px] font-mono text-zinc-400 uppercase">
                                          {w.gameMode} • {w.worldType}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handlePlayRealmWorld(realm, w.id)}
                                          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-[10px] uppercase px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
                                        >
                                          <i className="fas fa-play text-[9px]" />
                                          <span>{isRealmAdmin && !isOwner ? "Entrar Gratis" : "Jugar"}</span>
                                        </button>
                                        {canManage && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteWorldFromRealm(realm, w.id)}
                                            className="bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 text-[10px] px-2 py-1.5 rounded-lg cursor-pointer"
                                          >
                                            <i className="fas fa-trash-alt" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderLeaderboardModal = () => {
    if (!isLeaderboardOpen) return null;
    return (
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 bg-black/88 z-[100010] flex flex-col items-center justify-start safe-area-inset p-2 sm:p-4 overflow-y-auto overscroll-contain pointer-events-auto text-left"
      >
        <div className="bg-zinc-900 border-4 border-yellow-600 p-4 sm:p-8 rounded-2xl w-full max-w-[min(56rem,calc(100vw-1rem))] shadow-2xl flex flex-col gap-3 sm:gap-4 relative animate-in fade-in zoom-in-95 duration-200 text-white font-sans max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto">
          
          {/* Header with Trophy */}
          <div className="flex justify-between items-center border-b border-zinc-700 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center border border-yellow-500/40">
                <i className="fas fa-trophy text-yellow-400 text-xl" />
              </div>
              <div className="text-left">
                <h2 className="text-2xl font-bold minecraft-font uppercase tracking-wide text-yellow-400">
                  {lang === "es" ? "Tabla de Clasificación" : "Leaderboard"}
                </h2>
                <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider font-bold">
                  {lang === "es" ? "Top 100 Jugadores de la Comunidad" : "Top 100 Community Players"}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setIsLeaderboardOpen(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center border border-zinc-700 transition"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Custom Toast inside Leaderboard */}
          {leaderboardToast && (
            <div className="bg-emerald-500/95 text-white font-bold py-2 px-4 rounded-xl text-[10px] uppercase tracking-wider text-center border border-emerald-400 animate-pulse font-mono shadow-lg">
              <i className="fas fa-circle-check mr-2" />
              {leaderboardToast}
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <i className="fas fa-magnifying-glass absolute left-3 top-2.5 text-zinc-500 text-xs" />
              <input
                type="text"
                placeholder={lang === "es" ? "Buscar jugador por nombre o correo..." : "Search player by name or email..."}
                value={leaderboardSearch}
                onChange={(e) => setLeaderboardSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-yellow-500 text-white rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none transition font-mono"
              />
            </div>
            {leaderboardSearch && (
              <button
                onClick={() => setLeaderboardSearch("")}
                className="bg-zinc-800 hover:bg-zinc-700 px-3 rounded-lg text-xs font-semibold"
              >
                {lang === "es" ? "Limpiar" : "Clear"}
              </button>
            )}
          </div>

          {/* Leaderboard Table Container */}
          <div className="overflow-x-auto overflow-y-auto max-h-[50vh] rounded-xl border border-zinc-800 bg-zinc-950/50 scrollbar-thin">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase tracking-wider select-none">
                  <th className="py-3 px-4 text-center w-12">#</th>
                  <th className="py-3 px-4">{lang === "es" ? "Jugador / Email" : "Player / Email"}</th>
                  <th className="py-3 px-4 w-36">{lang === "es" ? "Rol" : "Role"}</th>
                  <th className="py-3 px-4 text-center w-24">{lang === "es" ? "Bloques Puestos" : "Blocks Placed"}</th>
                  <th className="py-3 px-4 text-center w-24">{lang === "es" ? "Bloques Rotos" : "Blocks Broken"}</th>
                  <th className="py-3 px-4 text-center w-20">{lang === "es" ? "Mundos" : "Worlds"}</th>
                  <th className="py-3 px-4 text-right w-24 pr-6">{lang === "es" ? "Puntaje" : "Score"}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const mapped = [...allUserRolesList].map(u => {
                    const blocksPlaced = u.blocksPlaced ?? 0;
                    const blocksBroken = u.blocksBroken ?? 0;
                    const worldsCreated = u.worldsCreated ?? 0;
                    const computedScore = u.score !== undefined ? u.score : (blocksPlaced * 10 + blocksBroken * 5 + worldsCreated * 100);
                    return {
                      ...u,
                      blocksPlaced,
                      blocksBroken,
                      worldsCreated,
                      score: computedScore,
                      displayName: u.displayName || u.email.split("@")[0] || u.email
                    };
                  });

                  // Sort by score descending
                  const sorted = mapped.sort((a, b) => b.score - a.score);

                  // Filter search
                  const filtered = sorted.filter(u => {
                    const s = leaderboardSearch.toLowerCase().trim();
                    if (!s) return true;
                    return u.email.toLowerCase().includes(s) || u.displayName.toLowerCase().includes(s);
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-zinc-500 italic">
                          {lang === "es" ? "No se encontraron jugadores que coincidan con la búsqueda." : "No players found matching your search."}
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((u) => {
                    // Original global rank is index + 1 in sorted array
                    const globalRank = sorted.findIndex(item => item.email === u.email) + 1;
                    
                    let rankBadge = "";
                    let rankRowBg = "hover:bg-white/5 border-b border-zinc-900";
                    
                    if (globalRank === 1) {
                      rankBadge = "👑 1º";
                      rankRowBg = "bg-yellow-500/10 hover:bg-yellow-500/15 border-b border-yellow-500/20";
                    } else if (globalRank === 2) {
                      rankBadge = "⭐ 2º";
                      rankRowBg = "bg-slate-300/10 hover:bg-slate-300/15 border-b border-slate-300/20";
                    } else if (globalRank === 3) {
                      rankBadge = "✨ 3º";
                      rankRowBg = "bg-amber-700/15 hover:bg-amber-700/20 border-b border-amber-700/25";
                    } else {
                      rankBadge = `#${globalRank}`;
                    }

                    const isSelf = googleUser && googleUser.email && googleUser.email.toLowerCase() === u.email.toLowerCase();

                    return (
                      <tr key={u.email} className={`${rankRowBg} ${isSelf ? "outline outline-1 outline-yellow-500/40" : ""}`}>
                        <td className="py-3.5 px-4 text-center font-bold text-xs">
                          <span className={
                            globalRank === 1 ? "text-yellow-400 text-sm font-extrabold" :
                            globalRank === 2 ? "text-slate-200 font-extrabold" :
                            globalRank === 3 ? "text-amber-500 font-extrabold" : "text-zinc-400"
                          }>
                            {rankBadge}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-left">
                          <div className="flex flex-col">
                            <span className="font-semibold text-white flex items-center gap-1.5">
                              {u.displayName}
                              {isSelf && (
                                <span className="text-[7.5px] bg-yellow-500/20 text-yellow-300 font-bold px-1 py-0.5 rounded uppercase tracking-wider scale-90">
                                  {lang === "es" ? "Tú" : "You"}
                                </span>
                              )}
                            </span>
                            <span className="text-[9.5px] text-zinc-500">{u.email}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-left">
                          {/* Role Selection for lionbastias18@gmail.com */}
                          {googleUser?.email?.toLowerCase() === "lionbastias18@gmail.com" ? (
                            <select
                              value={u.role || "user"}
                              onChange={async (e) => {
                                const newRole = e.target.value;
                                const targetEmail = u.email.toLowerCase().trim();
                                try {
                                  await setDoc(doc(db, "user_roles", targetEmail), {
                                    role: newRole
                                  }, { merge: true });
                                  setLeaderboardToast(lang === "es" ? `¡Rol de ${targetEmail} cambiado a ${newRole.toUpperCase()}!` : `Role of ${targetEmail} changed to ${newRole.toUpperCase()}!`);
                                  setTimeout(() => setLeaderboardToast(null), 3500);
                                  logUserActivity(`Actualizó rol del usuario ${targetEmail} a ${newRole} desde la clasificación`);
                                } catch (err) {
                                  console.error("Error setting role from leaderboard:", err);
                                  handleFirestoreError(err, OperationType.WRITE, `user_roles/${targetEmail}`);
                                }
                              }}
                              className="bg-zinc-950 border border-zinc-800 text-[10px] rounded text-white p-1 focus:outline-none focus:border-yellow-500 cursor-pointer font-sans font-bold"
                            >
                              <option value="user">Usuario</option>
                              <option value="mod">Mod</option>
                              <option value="staff">Staff</option>
                              <option value="owner">Owner</option>
                            </select>
                          ) : (
                            // Beautiful static role badge for others
                            (() => {
                              let badgeStyle = "bg-zinc-800 text-zinc-400";
                              let label = lang === "es" ? "USUARIO" : "USER";

                              if (u.role === "owner") {
                                badgeStyle = "bg-gradient-to-r from-yellow-500 to-amber-500 text-white border border-yellow-400 animate-pulse";
                                label = lang === "es" ? "DUEÑO" : "OWNER";
                              } else if (u.role === "staff") {
                                badgeStyle = "bg-red-500/20 text-red-400 border border-red-500/30";
                                label = "STAFF";
                              } else if (u.role === "mod") {
                                badgeStyle = "bg-purple-500/20 text-purple-400 border border-purple-500/30";
                                label = "MOD";
                              }

                              return (
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-sans font-extrabold uppercase tracking-widest ${badgeStyle}`}>
                                  {label}
                                </span>
                              );
                            })()
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-zinc-300">{u.blocksPlaced.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center font-mono text-zinc-300">{u.blocksBroken.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center font-mono text-zinc-300">{u.worldsCreated}</td>
                        <td className="py-3.5 px-4 text-right font-bold font-mono pr-6">
                          <span className={
                            globalRank === 1 ? "text-yellow-400 text-shadow-yellow animate-pulse" :
                            globalRank === 2 ? "text-slate-100" :
                            globalRank === 3 ? "text-amber-400" : "text-emerald-400"
                          }>
                            {u.score.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* Footer with short scoring explanation */}
          <div className="flex flex-col sm:flex-row justify-between items-center text-[9px] text-zinc-500 font-mono pt-2 border-t border-zinc-800 gap-2">
            <span className="text-center sm:text-left">* {lang === "es" ? "Score = 10 pts por bloque puesto + 5 pts por bloque roto + 100 pts por mundo" : "Score = 10 pts per block placed + 5 pts per block broken + 100 pts per world"}</span>
            <button
              onClick={() => setIsLeaderboardOpen(false)}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-5 py-2 rounded-xl text-xs uppercase font-bold tracking-widest border border-yellow-500/30 transition active:scale-95"
            >
              {lang === "es" ? "Cerrar" : "Close"}
            </button>
          </div>

        </div>
      </div>
    );
  };

  if (appState === "worlds-list") {
    const filteredWorlds = userWorlds.filter((w) =>
      w.name.toLowerCase().includes(worldSearchQuery.toLowerCase())
    );

    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center safe-area-inset p-2 sm:p-6 relative overflow-y-auto overscroll-contain select-none">
        {/* 3D Rotating Voxel Panorama */}
        <MenuPanorama3D showLogo={false} />

        <div className="z-10 bg-zinc-950/94 p-4 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-white/10 flex flex-col w-full max-w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto shadow-3xl my-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-5 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <img
                src="./assets/adventure-alpha-emblem.png"
                alt="Adventure Alpha Mobile"
                className="w-11 h-11 sm:w-14 sm:h-14 object-contain shrink-0 drop-shadow-md"
              />
              <div>
                <h2 className="text-white text-xl sm:text-3xl font-extrabold minecraft-font tracking-tighter uppercase flex items-center gap-2">
                  <span className="text-emerald-400">⚡ MUNDOS</span> DE EXPLORACIÓN
                </h2>
              <div className="text-zinc-400 text-xs mt-0.5 font-medium flex items-center gap-2 flex-wrap">
                <span>Gestiona y crea tus tierras infinitas personalizadas</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md font-mono uppercase ${
                  isBypassingWorldLimit
                    ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 text-yellow-300 animate-pulse"
                    : worlds.length >= 70 
                      ? "bg-red-500/10 border border-red-500/20 text-red-400"
                      : "bg-zinc-900 border border-white/5 text-zinc-500"
                }`}>
                  {worlds.length} / {isBypassingWorldLimit ? "ILIMITADOS" : "70"} MUNDOS
                </span>
              </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  resumeAudio();
                  setRealmStatusMsg(null);
                  setIsRealmsOpen(true);
                }}
                className="bg-gradient-to-r from-cyan-600 to-emerald-600 hover:brightness-110 border border-cyan-300/40 text-white px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <i className="fas fa-chess-rook text-cyan-200" />
                <span>Realms</span>
                {effectiveRealmPlan === "none" ? (
                  <span className="text-[9px] bg-black/40 text-emerald-300 px-1.5 py-0.5 rounded-full font-mono">GRATIS</span>
                ) : (
                  <span className="text-[9px] bg-black/40 text-cyan-200 px-1.5 py-0.5 rounded-full font-mono uppercase">
                    {isRealmAdmin ? "ADMIN" : effectiveRealmPlan}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-full shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs uppercase font-mono font-bold text-emerald-300">
                  {currentUser || "Invitado"}
                </span>
              </div>
            </div>
          </div>

          {/* Dual Pane Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT PANE: Worlds Scroll List (7 columns) */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                  🔎 Buscar mundo guardado
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-zinc-400 text-sm">
                    <i className="fas fa-search" />
                  </span>
                  <input
                    type="text"
                    placeholder="Filtrar por nombre..."
                    value={worldSearchQuery}
                    onChange={(e) => setWorldSearchQuery(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 hover:border-white/20 focus:border-emerald-400 rounded-xl py-2 px-3 pl-10 text-white text-xs focus:outline-none placeholder-zinc-500 font-semibold transition-all"
                  />
                  {worldSearchQuery && (
                    <button 
                      onClick={() => setWorldSearchQuery("")}
                      className="absolute right-3.5 top-2 text-zinc-400 hover:text-white text-xs font-bold"
                    >
                      <i className="fas fa-times-circle" />
                    </button>
                  )}
                </div>
              </div>

              {/* Worlds Scrollbox */}
              <div className="bg-zinc-900/30 rounded-2xl border border-white/5 p-2 max-h-[380px] overflow-y-auto pr-1 flex flex-col gap-2.5">
                {filteredWorlds.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-sm flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-3 text-zinc-400">
                      <i className="fas fa-globe text-3xl" />
                    </div>
                    <p className="font-extrabold text-zinc-400">{t.no_worlds_found}</p>
                    <p className="text-zinc-600 text-[11px] mt-1 px-4">Utiliza el panel de la derecha para colonizar tu primer terreno.</p>
                  </div>
                ) : (
                  filteredWorlds.map((world) => {
                    const formattedDate = new Date(world.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    });

                    return (
                      <div
                        key={world.id}
                        className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex gap-3.5 items-center transition hover:bg-zinc-900/90 hover:border-white/10 hover:shadow-lg hover:scale-[1.01]"
                      >
                        {/* CSS Isometric 3D Voxel Grass Icon placeholder */}
                        <div className="relative w-11 h-11 shrink-0 flex items-center justify-center bg-zinc-800 rounded-lg overflow-hidden border border-white/10">
                          {world.worldType === "flat" ? (
                            <div className="w-full h-full bg-gradient-to-b from-lime-500 to-green-700 flex flex-col items-center justify-center">
                              <i className="fas fa-layer-group text-white/50 text-xs" />
                            </div>
                          ) : (
                            <div className="w-full h-full bg-gradient-to-b from-emerald-500 to-amber-970 flex flex-col items-center justify-center">
                              <i className="fas fa-mountain text-white/60 text-xs" />
                            </div>
                          )}
                        </div>

                        {/* Text and stats */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[13px] font-bold truncate uppercase tracking-tight">
                            {world.name}
                          </p>
                          <div className="flex gap-1 mt-1 flex-wrap items-center">
                            <span className="text-[8px] font-bold uppercase tracking-wider bg-zinc-900 text-emerald-400 px-2 py-0.5 rounded-md border border-white/5">
                              {world.gameMode === "creative" ? t.creative_mode : world.gameMode === "adventure" ? t.adventure_mode : world.gameMode === "spectator" ? t.spectator_mode : t.survival_mode}
                            </span>
                            <span className="text-[8px] font-bold uppercase tracking-wider bg-zinc-900 text-sky-400 px-2 py-0.5 rounded-md border border-white/5">
                              {world.worldType === "flat" ? t.world_type_flat : world.worldType === "edge_farlands" ? t.world_type_edge_farlands : t.world_type_normal}
                            </span>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 ml-1">
                              • {formattedDate}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              resumeAudio();
                              setActiveRealmId(null);
                              setCurrentWorld(world);
                              setSurvivalInventory(world.survivalInventory || {
                                [BlockType.DIRT]: 16,
                                [BlockType.WOOD]: 8,
                                [BlockType.LOG]: 4,
                                [BlockType.CRAFTING_TABLE]: 1,
                              });
                              setPlayerPos(world.playerPos || { x: 0, y: 80, z: 0 });
                              setAppState("playing");
                            }}
                            className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold h-9 px-3.5 rounded-xl text-[10px] uppercase tracking-wider shadow-md hover:shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <i className="fas fa-play text-[9px]" /> JUGAR
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteWorld(world.id, e)}
                            className="bg-zinc-800 hover:bg-red-950/40 hover:text-red-400 border border-white/5 hover:border-red-500/20 text-zinc-400 h-9 w-9 rounded-xl transition-all active:scale-95 flex items-center justify-center"
                            title="Borrar Mundo"
                          >
                            <i className="fas fa-trash-alt text-xs" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT PANE: Create World Form (5 columns) */}
            <div className="lg:col-span-5 bg-zinc-900/30 p-5 rounded-2xl border border-white/5 flex flex-col gap-4">
              <h3 className="text-white text-xs font-black uppercase tracking-wider border-b border-white/5 pb-2 flex items-center gap-1.5">
                <i className="fas fa-hammer text-emerald-400" /> CREAR NUEVA TIERRA
              </h3>

              <form onSubmit={handleCreateWorld} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex justify-between">
                    <span>{t.world_name}</span>
                    <span className="text-[9px] text-zinc-600">Corto y descriptivo</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Escribe el nombre del mundo..."
                    value={worldNameInput}
                    onChange={(e) => setWorldNameInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 hover:border-white/20 focus:border-emerald-400 rounded-xl py-2 px-3 text-white text-xs focus:outline-none placeholder-zinc-600 font-semibold transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    {t.game_mode}
                  </label>
                  <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1.5 rounded-xl border border-white/5">
                    {(["survival", "creative", "adventure", "spectator"] as const).map((mode) => {
                      const isActive = newWorldGameMode === mode;
                      const modeText = mode === "survival" ? t.survival_mode : mode === "creative" ? t.creative_mode : mode === "adventure" ? t.adventure_mode : t.spectator_mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            resumeAudio();
                            setNewWorldGameMode(mode);
                          }}
                          className={`py-2 px-1 rounded-lg text-[9px] uppercase font-extrabold tracking-wider text-center transition-all ${
                            isActive
                              ? "bg-emerald-500 text-white shadow-md font-black"
                              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                          }`}
                        >
                          {modeText}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    {t.world_type}
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1.2 rounded-xl border border-white/5">
                    {(["normal", "flat", "edge_farlands"] as const).map((type) => {
                      const isActive = newWorldType === type;
                      const typeText = type === "normal" 
                        ? t.world_type_normal 
                        : type === "flat" 
                          ? t.world_type_flat 
                          : t.world_type_edge_farlands;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            resumeAudio();
                            setNewWorldType(type);
                          }}
                          className={`py-2 px-0.5 rounded-lg text-[8px] uppercase font-extrabold tracking-wider text-center h-full flex items-center justify-center transition-all ${
                            isActive
                              ? "bg-emerald-500 text-white shadow-md font-black"
                              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                          }`}
                        >
                          <span className="truncate px-1" title={typeText}>{typeText}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {userWorlds.length >= 70 && !isBypassingWorldLimit && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex flex-col gap-2.5 text-red-400 font-semibold text-[9px] leading-relaxed uppercase tracking-wider">
                    <div className="flex gap-2 items-center">
                      <i className="fas fa-exclamation-triangle text-[11px] animate-pulse" />
                      <span>Límite de 70 mundos alcanzado. Por favor, elimina algún mundo existente antes de poder crear uno nuevo.</span>
                    </div>
                    
                    {!showBulkDeleteConfirm ? (
                      <div className="border-t border-red-500/20 pt-2 flex justify-between items-center gap-2">
                        <span className="text-zinc-400">¿Quieres liberar espacio rápidamente?</span>
                        <button
                          type="button"
                          onClick={() => {
                            resumeAudio();
                            setShowBulkDeleteConfirm(true);
                          }}
                          className="bg-red-500 hover:bg-red-400 text-white font-extrabold px-2.5 py-1.5 rounded-lg text-[8px] transition-all hover:scale-105 active:scale-95 flex items-center gap-1 shadow-md shadow-red-500/20 shrink-0"
                        >
                          <i className="fas fa-broom" /> Liberar espacio
                        </button>
                      </div>
                    ) : (
                      <div className="border-t border-red-500/20 pt-2 flex flex-col gap-2">
                        <span className="text-red-300 font-bold">⚠️ ¿Confirmas eliminar automáticamente los 5 mundos más antiguos?</span>
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            disabled={isDeletingBulk}
                            onClick={() => {
                              resumeAudio();
                              setShowBulkDeleteConfirm(false);
                            }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold px-2 py-1 rounded-lg text-[8px] transition-all active:scale-95 border border-white/5"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingBulk}
                            onClick={() => {
                              resumeAudio();
                              handleBulkDeleteOldest(5);
                            }}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold px-2.5 py-1 rounded-lg text-[8px] transition-all hover:scale-105 active:scale-95 flex items-center gap-1 shadow-md"
                          >
                            {isDeletingBulk ? (
                              <>
                                <i className="fas fa-spinner fa-spin" /> Borrando...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-trash-alt" /> Sí, borrar 5
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  onClick={(e) => {
                    handleCreateWorld(e);
                  }}
                  disabled={userWorlds.length >= 70 && !isBypassingWorldLimit}
                  className={`font-bold py-3.5 rounded-xl text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-2 mt-2 ${
                    userWorlds.length >= 70 && !isBypassingWorldLimit
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5"
                      : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95"
                  }`}
                >
                  <i className="fas fa-plus text-[10px]" /> {t.create_btn}
                </button>
              </form>
            </div>

          </div>

          {/* Footer Back Button */}
          <div className="mt-8 border-t border-white/5 pt-4 flex justify-between items-center">
            <button
              onClick={() => {
                resumeAudio();
                setAppState("menu");
              }}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white/80 font-bold py-2.5 px-6 rounded-xl text-center text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5"
            >
              <i className="fas fa-arrow-left" /> VOLVER AL MENÚ
            </button>
            <p className="text-[10px] text-zinc-600 font-mono tracking-wider uppercase font-bold">Infinite World v2.1</p>
          </div>
          
        </div>
        {renderShopModal()}
        {renderRealmsModal()}
      </div>
    );
  }

  // Removing old definition location
  if (appState === "menu") {
    const unlockedSkinsList: CharacterSkinId[] = [];
    if (vipActive || ownedShopItems.includes("skin_dragon")) unlockedSkinsList.push("dragon");
    if (vipActive || ownedShopItems.includes("skin_angel")) unlockedSkinsList.push("angel");
    if (vipActive || ownedShopItems.includes("skin_titan")) unlockedSkinsList.push("titan");
    if (vipActive || ownedShopItems.includes("skin_poseidon")) unlockedSkinsList.push("poseidon");
    if (mvpActive || ownedShopItems.includes("skin_obsidian")) unlockedSkinsList.push("obsidian");

    const useCompactMenuLayout = isPortrait || screenSize.height < 600 || screenSize.width < 880;
    const menuButtonsCompact = useCompactMenuLayout && (!isPortrait || screenSize.height < 680);

    const renderEmblemBlock = (sizeClass: string, splashPosClass: string) => (
      <div className="relative inline-flex items-center justify-center shrink-0">
        <button
          type="button"
          onClick={handleTitleEasterEggTap}
          className="relative cursor-pointer active:scale-95 transition-transform duration-150 focus:outline-none select-none bg-transparent border-0 p-0"
          title="Adventure Alpha Mobile"
        >
          <img
            src="./assets/adventure-alpha-emblem.png"
            alt="Adventure Alpha Mobile"
            className={`${sizeClass} aspect-square object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.85)]`}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "./assets/aistudio/1794943627139_ac65a7dd.jpg"; }}
          />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSplashEasterEggTap();
          }}
          className={`splash-bounce-tilt absolute -bottom-1 sm:bottom-0 ${splashPosClass} z-20 text-[#ffff55] font-extrabold text-[9px] sm:text-xs tracking-wide font-mono px-1.5 py-0.5 select-none cursor-pointer bg-transparent border-0 max-w-[135px] sm:max-w-[205px] leading-tight text-center`}
          style={{
            textShadow: "2px 2px 0px #3f3f00, 3px 3px 0px #000",
          }}
        >
          ★ {MENU_SPLASHES[splashIndex]} ★
        </button>
      </div>
    );

    const renderMenuButtonsBlock = (compact: boolean) => (
      <div className={`w-full flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
        {/* 1. PLAY & REALMS ROW */}
        <div className="grid grid-cols-12 gap-1.5 sm:gap-2 w-full">
          <button
            onClick={() => {
              resumeAudio();
              setAppState("worlds-list");
            }}
            className={`col-span-7 relative group ${compact ? "py-2" : "py-2.5 sm:py-3.5"} px-3 rounded-lg text-white font-black text-xs sm:text-base uppercase tracking-widest minecraft-font transition-all duration-75 flex items-center justify-center gap-2 border-t-2 border-l-2 border-emerald-300/90 border-b-4 border-r-4 border-emerald-950 bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-800 shadow-[0_5px_0_#064e3b,0_10px_20px_rgba(0,0,0,0.65)] active:translate-y-[4px] active:shadow-[0_1px_0_#064e3b,0_4px_10px_rgba(0,0,0,0.5)] hover:brightness-110 select-none cursor-pointer`}
            style={{
              textShadow: "2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, #10b981, #059669, #065f46)",
              backgroundSize: "4px 4px, 4px 4px, 100% 100%"
            }}
          >
            <i className="fas fa-play text-emerald-200 text-xs sm:text-sm group-hover:scale-110 transition-transform" />
            <span>{t.play}</span>
          </button>

          <button
            onClick={() => {
              resumeAudio();
              setRealmStatusMsg(null);
              setIsRealmsOpen(true);
            }}
            className={`col-span-5 relative group ${compact ? "py-2" : "py-2.5 sm:py-3.5"} px-2.5 rounded-lg text-white font-black text-xs sm:text-sm uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-1.5 border-t-2 border-l-2 border-cyan-300/90 border-b-4 border-r-4 border-cyan-950 bg-gradient-to-b from-cyan-500 via-teal-600 to-cyan-900 shadow-[0_5px_0_#164e63,0_10px_20px_rgba(0,0,0,0.65)] active:translate-y-[4px] active:shadow-[0_1px_0_#164e63,0_4px_10px_rgba(0,0,0,0.5)] hover:brightness-110 select-none cursor-pointer`}
            style={{
              textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, #06b6d4, #0d9488, #164e63)",
              backgroundSize: "4px 4px, 4px 4px, 100% 100%"
            }}
          >
            <i className="fas fa-chess-rook text-cyan-100 text-xs group-hover:scale-110 transition-transform" />
            <span>Realms</span>
            {effectiveRealmPlan === "none" && (
              <span className="bg-emerald-400 text-zinc-950 text-[7px] px-1 py-0.5 rounded font-mono font-black leading-none">
                GRATIS
              </span>
            )}
          </button>
        </div>

        {/* 2. DUAL ROW: LEADERBOARD & FRIENDS */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full">
          <button
            onClick={() => {
              resumeAudio();
              setIsLeaderboardOpen(true);
            }}
            className={`relative group ${compact ? "py-1.5 sm:py-2" : "py-2 sm:py-2.5"} px-2.5 rounded-lg text-white font-bold text-[9px] sm:text-[11px] uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-1.5 border-t-2 border-l-2 border-yellow-200/90 border-b-4 border-r-4 border-amber-950 bg-gradient-to-b from-amber-500 via-yellow-600 to-amber-800 shadow-[0_4px_0_#78350f,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#78350f] hover:brightness-110 select-none cursor-pointer`}
            style={{
              textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, #f59e0b, #d97706, #92400e)",
              backgroundSize: "4px 4px, 4px 4px, 100% 100%"
            }}
          >
            <i className="fas fa-trophy text-yellow-200 text-xs group-hover:rotate-12 transition-transform" />
            <span className="truncate">{lang === "es" ? "Clasificación" : "Leaderboard"}</span>
          </button>

          <button
            onClick={() => {
              resumeAudio();
              setIsFriendsOpen(true);
            }}
            className={`relative group ${compact ? "py-1.5 sm:py-2" : "py-2 sm:py-2.5"} px-2.5 rounded-lg text-white font-bold text-[9px] sm:text-[11px] uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-1.5 border-t-2 border-l-2 border-purple-300/90 border-b-4 border-r-4 border-purple-950 bg-gradient-to-b from-purple-600 via-purple-700 to-indigo-900 shadow-[0_4px_0_#3b0764,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#3b0764] hover:brightness-110 select-none cursor-pointer`}
            style={{
              textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, #9333ea, #7e22ce, #3b0764)",
              backgroundSize: "4px 4px, 4px 4px, 100% 100%"
            }}
          >
            <i className="fas fa-users text-purple-200 text-xs group-hover:scale-110 transition-transform" />
            <span className="truncate">{lang === "es" ? "Amigos" : "Friends"}</span>
          </button>
        </div>

        {/* 3. VIP SHOP BUTTON */}
        <button
          onClick={() => {
            resumeAudio();
            setShopCategory("all");
            setIsShopOpen(true);
          }}
          className={`w-full relative group ${compact ? "py-2" : "py-2.5 sm:py-3"} px-3 rounded-lg text-zinc-950 font-black text-[10.5px] sm:text-xs uppercase tracking-widest minecraft-font transition-all duration-75 flex items-center justify-center gap-2 border-t-2 border-l-2 border-yellow-100 border-b-4 border-r-4 border-yellow-950 bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 shadow-[0_4px_0_#713f12,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#713f12] hover:brightness-110 select-none cursor-pointer`}
          style={{
            textShadow: "1px 1px 0px rgba(255,255,255,0.5)",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to right, #eab308, #f59e0b, #eab308)",
            backgroundSize: "4px 4px, 4px 4px, 100% 100%"
          }}
        >
          <i className="fas fa-shopping-cart text-zinc-950 text-xs" />
          <span className="truncate">{lang === "es" ? "TIENDA VIP & INDEFS" : "VIP SHOP & INDEFS"}</span>
          {mvpActive ? (
            <span className="bg-zinc-950 text-sky-300 text-[8px] px-2 py-0.5 rounded-full border border-sky-400/40 font-extrabold ml-1 font-mono">
              MVP+
            </span>
          ) : vipActive ? (
            <span className="bg-zinc-950 text-yellow-300 text-[8px] px-2 py-0.5 rounded-full border border-yellow-400/40 font-extrabold ml-1 font-mono">
              VIP
            </span>
          ) : null}
        </button>

        {/* 4. DUAL ROW: SETTINGS & LOGOUT */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full">
          <button
            onClick={() => {
              resumeAudio();
              setAppState("settings");
            }}
            className={`relative group ${compact ? "py-1.5 sm:py-2" : "py-2 sm:py-2.5"} px-2.5 rounded-lg text-white font-bold text-[9px] sm:text-[11px] uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-1.5 border-t-2 border-l-2 border-zinc-400 border-b-4 border-r-4 border-zinc-950 bg-gradient-to-b from-zinc-600 via-zinc-700 to-zinc-800 shadow-[0_4px_0_#18181b,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#18181b] hover:brightness-110 select-none cursor-pointer`}
            style={{
              textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, #52525b, #3f3f46, #27272a)",
              backgroundSize: "4px 4px, 4px 4px, 100% 100%"
            }}
          >
            <i className="fas fa-cog text-emerald-400 text-xs group-hover:rotate-90 transition-transform duration-300" />
            <span className="truncate">{t.settings}</span>
          </button>

          <button
            onClick={handleLogout}
            className={`relative group ${compact ? "py-1.5 sm:py-2" : "py-2 sm:py-2.5"} px-2.5 rounded-lg text-white/90 font-bold text-[9px] sm:text-[11px] uppercase tracking-wider minecraft-font transition-all duration-75 flex items-center justify-center gap-1.5 border-t-2 border-l-2 border-stone-500 border-b-4 border-r-4 border-black bg-gradient-to-b from-stone-700 via-stone-800 to-stone-900 hover:from-red-950/80 hover:via-red-900/60 hover:to-stone-950 shadow-[0_4px_0_#1c1917,0_8px_16px_rgba(0,0,0,0.55)] active:translate-y-[3px] active:shadow-[0_1px_0_#1c1917] select-none cursor-pointer`}
            style={{
              textShadow: "1px 1px 0px #000, -1px -1px 0px #000",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, #44403c, #292524, #1c1917)",
              backgroundSize: "4px 4px, 4px 4px, 100% 100%"
            }}
          >
            <i className="fas fa-door-open text-red-400 text-xs group-hover:-translate-x-0.5 transition-transform" />
            <span className="truncate">{t.logout}</span>
          </button>
        </div>

        <div className="w-full flex items-center justify-between px-1 pt-0.5 pointer-events-none select-none text-white/45 font-mono text-[8px] uppercase tracking-widest font-bold">
          <span>⛏️ ALPHA MOBILE 1.0.2</span>
          <span>60 FPS 3D VOXEL</span>
        </div>
      </div>
    );

    const renderCharacterPreview = (
      mode: "floating" | "inline",
      cardClass?: string,
      stageClass?: string
    ) => (
      <CharacterPreviewCard
        lang={lang}
        characterSkin={characterSkin}
        customSkin={customSkin}
        ownedSkins={unlockedSkinsList}
        indefCoins={indefCoins}
        vipActive={vipActive}
        onSelectSkin={(sid) => {
          resumeAudio();
          handleSelectSkin(sid);
        }}
        onUpdateCustomSkin={handleUpdateCustomSkin}
        onOpenShopForSkin={(skinId) => {
          resumeAudio();
          setShopCategory("skins");
          if (skinId === "dragon") setSelectedProduct("skin_dragon");
          else if (skinId === "angel") setSelectedProduct("skin_angel");
          else if (skinId === "titan") setSelectedProduct("skin_titan");
          else if (skinId === "poseidon") setSelectedProduct("skin_poseidon");
          else if (skinId === "obsidian") setSelectedProduct("skin_obsidian");
          setPaymentMethod("indefs");
          setPaymentStep("form");
          setIsShopOpen(true);
        }}
        hidden={isCinemaMode}
        layoutMode={mode}
        cardClassName={cardClass}
        stageHeightClass={stageClass}
      />
    );

    return (
      <div className="w-full h-full bg-slate-900 relative overflow-hidden select-none safe-area-inset">
        {/* 3D Rotating Voxel Panorama Background */}
        <MenuPanorama3D 
          showLogo={false} 
          onEnterCinemaMode={() => setIsCinemaMode(!isCinemaMode)} 
          isCinemaMode={isCinemaMode} 
        />

        {/* Responsive Non-Overlapping Menu Layer (Empty background drags 3D panorama) */}
        <div
          className={`relative z-20 w-full h-full flex flex-col justify-between p-2.5 sm:p-4 overflow-y-auto overflow-x-hidden overscroll-contain pointer-events-none transition-all duration-300 ${
            isCinemaMode ? "opacity-0 scale-95" : "opacity-100 scale-100"
          }`}
        >
          {/* Top Bar: Profile + Indefs + Rotate (reserving right margin for Panorama button) */}
          <div className={`w-full pr-36 sm:pr-44 flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 ${isCinemaMode ? "pointer-events-none" : "pointer-events-auto"}`}>
            <div className="flex items-center gap-2 bg-black/75 hover:bg-black/90 border border-white/20 py-1 px-3 rounded-full shadow-xl transition-all max-w-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] shrink-0" />
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-white/70 font-mono text-[9px] uppercase tracking-wider font-bold hidden sm:inline">
                  {t.profile_welcome}:
                </span>
                <span className="text-emerald-400 font-mono text-[11px] sm:text-xs uppercase tracking-wider font-black drop-shadow truncate max-w-[110px] sm:max-w-[160px]">
                  {currentUser || "Invitado"}
                </span>
              </div>
              {googleUser && (
                <div className="flex items-center ml-0.5 shrink-0">
                  {(() => {
                    let badgeStyle = "bg-zinc-800 text-zinc-400 border border-white/10";
                    let label = lang === "es" ? "USUARIO" : "USER";

                    if (userRole === "owner") {
                      badgeStyle = "bg-gradient-to-r from-yellow-500 to-amber-500 text-white border border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.5)]";
                      label = lang === "es" ? "DUEÑO" : "OWNER";
                    } else if (userRole === "staff") {
                      badgeStyle = "bg-red-600 text-white border border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]";
                      label = "STAFF";
                    } else if (userRole === "mod") {
                      badgeStyle = "bg-purple-600 text-white border border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]";
                      label = "MOD";
                    }

                    return (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-mono font-black uppercase tracking-widest ${badgeStyle}`}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Indef (Minecoins) Quick Pill */}
            <button
              type="button"
              onClick={() => {
                resumeAudio();
                setShopCategory("indefs");
                setIsShopOpen(true);
              }}
              className="flex items-center gap-1.5 bg-zinc-950/90 hover:bg-zinc-900 border border-emerald-400/40 py-1 px-2.5 rounded-full shadow-lg transition cursor-pointer shrink-0"
              title={lang === "es" ? "Comprar o gestionar Indefs" : "Buy or manage Indefs"}
            >
              <span className="w-3.5 h-3.5 rounded bg-gradient-to-br from-emerald-400 to-amber-400 text-zinc-950 font-black text-[9px] flex items-center justify-center">
                ◈
              </span>
              <span className="text-[11px] font-mono font-black text-emerald-300 tabular-nums">
                {indefCoins.toLocaleString()}
              </span>
              <span className="text-[8.5px] font-mono uppercase font-bold text-zinc-400">Indefs</span>
            </button>

            {/* Mobile Quick Rotate Button (in top bar, never overlapping Panorama toggle) */}
            {(isTouchDevice || isSmallScreen) && (
              <button
                type="button"
                onClick={() => {
                  resumeAudio();
                  toggleManualScreenRotation();
                }}
                className="flex items-center gap-1 bg-black/80 hover:bg-black/95 border border-emerald-400/40 text-emerald-300 px-2.5 py-1 rounded-full text-[9.5px] font-mono font-bold shadow-lg active:scale-95 transition shrink-0"
                title={lang === "es" ? "Girar Pantalla (Vertical / Horizontal)" : "Rotate Screen"}
              >
                <i className="fas fa-rotate text-[10px]" />
                <span>{isPortrait ? (lang === "es" ? "Horizontal" : "Landscape") : (lang === "es" ? "Vertical" : "Portrait")}</span>
              </button>
            )}

            {/* Music Track Mini Badge (desktop) */}
            <div className="hidden lg:flex items-center gap-2 bg-black/75 hover:bg-black/90 border border-white/15 px-3 py-1 rounded-full shadow-lg transition-all">
              <span className="flex items-center gap-0.5 h-3 text-emerald-400">
                <span className="w-0.5 h-2.5 bg-emerald-400 animate-pulse rounded-full" />
                <span className="w-0.5 h-3.5 bg-emerald-400 animate-pulse rounded-full delay-75" />
                <span className="w-0.5 h-1.5 bg-emerald-400 animate-pulse rounded-full delay-150" />
              </span>
              <span className="text-white/80 font-mono text-[9px] font-bold max-w-[190px] truncate" title={currentTrackTitle}>
                {currentTrackTitle}
              </span>
              {(musicMode === "c418" || (musicMode === "soundtrack" && currentWorld !== null)) && (
                <button
                  onClick={() => {
                    resumeAudio();
                    skipToNextTrack();
                    setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 150);
                  }}
                  className="text-white/60 hover:text-white text-[10px] ml-1 transition"
                  title={lang === "es" ? "Siguiente pista" : "Next track"}
                >
                  <i className="fas fa-forward-step" />
                </button>
              )}
            </div>
          </div>

          {/* Center & Bottom Content Adapted to Viewport Orientation & Size */}
          {useCompactMenuLayout ? (
            isPortrait ? (
              <>
                <div className={`w-full flex flex-wrap items-center justify-center gap-3 sm:gap-5 my-auto py-1 ${isCinemaMode ? "pointer-events-none" : "pointer-events-auto"}`}>
                  {renderEmblemBlock(
                    screenSize.height < 640 ? "w-28 h-28 sm:w-36 sm:h-36" : "w-32 h-32 sm:w-44 sm:h-44",
                    "-right-1 sm:-right-4"
                  )}
                  {renderCharacterPreview(
                    "inline",
                    "w-[144px] sm:w-[190px]",
                    screenSize.height < 640 ? "h-[104px] sm:h-[138px]" : "h-[118px] sm:h-[152px]"
                  )}
                </div>

                <div className={`w-full max-w-[min(340px,100%)] mx-auto shrink-0 pt-1 ${isCinemaMode ? "pointer-events-none" : "pointer-events-auto"}`}>
                  {renderMenuButtonsBlock(menuButtonsCompact)}
                </div>
              </>
            ) : (
              /* Compact Landscape: Left/Center = Emblem + Menu Buttons, Right = Character Preview Card */
              <div className={`w-full flex-1 min-h-0 flex items-center justify-center gap-3 sm:gap-6 my-auto py-1 ${isCinemaMode ? "pointer-events-none" : "pointer-events-auto"}`}>
                <div className="flex flex-col items-center gap-1.5 sm:gap-2.5 flex-1 max-w-[min(340px,calc(100vw-180px))] min-w-0">
                  {renderEmblemBlock(
                    isVeryCompactHeight ? "w-20 h-20" : "w-24 h-24 sm:w-32 sm:h-32",
                    "-right-2 sm:-right-5"
                  )}
                  {renderMenuButtonsBlock(true)}
                </div>
                {renderCharacterPreview(
                  "inline",
                  "w-[144px] sm:w-[186px] max-h-[calc(100dvh-56px)]",
                  isVeryCompactHeight ? "h-[90px]" : "h-[122px] sm:h-[146px]"
                )}
              </div>
            )
          ) : (
            /* Spacious Desktop / Large Tablet */
            <>
              <div className={`flex flex-col items-center justify-center my-auto pt-2 ${isCinemaMode ? "pointer-events-none" : "pointer-events-auto"}`}>
                {renderEmblemBlock("w-40 h-40 sm:w-48 sm:h-48", "-right-4 sm:-right-10")}
              </div>
              <div className={`w-full max-w-sm mx-auto shrink-0 pb-1 ${isCinemaMode ? "pointer-events-none" : "pointer-events-auto"}`}>
                {renderMenuButtonsBlock(false)}
              </div>
            </>
          )}
        </div>

        {/* Desktop Floating Character Card (Rendered outside scroll flex only on large screens) */}
        {!useCompactMenuLayout && renderCharacterPreview("floating")}

        {renderLeaderboardModal()}
        {renderFriendsModal()}
        {renderShopModal()}
        {renderRealmsModal()}
      </div>
    );
  }


  const renderSettingsModal = (asOverlay: boolean) => {
    const currentUniqueId = googleUser ? googleUser.uid : (activeSession ? `${activeSession}_guest` : "invitado_local");

    return (
      <div
        className={`fixed inset-0 w-full h-full flex flex-col items-center justify-start sm:justify-center safe-area-inset p-2 sm:p-5 overflow-y-auto overscroll-contain select-none ${
          asOverlay ? "z-[100005] bg-slate-950/92" : "bg-slate-950"
        }`}
        onPointerDown={asOverlay ? (e) => e.stopPropagation() : undefined}
        onPointerMove={asOverlay ? (e) => e.stopPropagation() : undefined}
        onPointerUp={asOverlay ? (e) => e.stopPropagation() : undefined}
        onTouchStart={asOverlay ? (e) => e.stopPropagation() : undefined}
        onTouchMove={asOverlay ? (e) => e.stopPropagation() : undefined}
        onTouchEnd={asOverlay ? (e) => e.stopPropagation() : undefined}
        onMouseDown={asOverlay ? (e) => e.stopPropagation() : undefined}
        onMouseMove={asOverlay ? (e) => e.stopPropagation() : undefined}
        onMouseUp={asOverlay ? (e) => e.stopPropagation() : undefined}
      >
        {/* 3D Rotating Voxel Panorama only in menu mode */}
        {!asOverlay && <MenuPanorama3D showLogo={false} />}

        <div className="z-10 bg-zinc-950/96 p-3 sm:p-6 rounded-3xl border border-white/15 flex flex-col items-center shadow-2xl max-w-[min(42rem,calc(100vw-1rem))] w-full max-h-[calc(100dvh-1rem)] my-auto transition-all overflow-hidden">
          {/* Header */}
          <div className="flex flex-col items-center justify-center w-full mb-2.5 sm:mb-4 shrink-0">
            <h1 className="text-white text-xl sm:text-3xl font-black minecraft-font uppercase tracking-tight text-center drop-shadow-lg flex items-center gap-2.5">
              <i className="fas fa-sliders text-emerald-400" />
              <span>{t.settings}</span>
            </h1>
            <span className="text-[10px] text-zinc-400 font-mono mt-0.5 text-center">
              {lang === "es" ? "Ajusta controles, gráficos, audio, mundo y multijugador" : "Configure controls, graphics, audio, world and multiplayer"}
            </span>
          </div>

          {/* Section Category Tabs */}
          <div className="grid grid-cols-5 gap-1.5 w-full mb-2.5 sm:mb-4 bg-zinc-900/80 p-1 sm:p-1.5 rounded-2xl border border-white/10 shrink-0">
            {[
              { id: "game", icon: "fa-gamepad", label: lang === "es" ? "Juego" : "Game" },
              { id: "graphics", icon: "fa-desktop", label: lang === "es" ? "Gráficos" : "Graphics" },
              { id: "audio", icon: "fa-music", label: lang === "es" ? "Audio" : "Audio" },
              { id: "world", icon: "fa-earth-americas", label: lang === "es" ? "Mundo" : "World" },
              { id: "multiplayer", icon: "fa-users", label: lang === "es" ? "Red" : "Multi" },
            ].map((tab) => {
              const isActive = settingsSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    resumeAudio();
                    setSettingsSection(tab.id as any);
                  }}
                  className={`py-2 px-1 rounded-xl font-bold text-[10px] sm:text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-1 border ${
                    isActive
                      ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 font-black scale-[1.02]"
                      : "bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                  }`}
                >
                  <i className={`fas ${tab.icon} text-xs`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab 1: 🎮 JUEGO & CONTROLES */}
          {settingsSection === "game" && (
            <div className="flex flex-col w-full gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
              {/* Apariencia del Personaje (6 Skins 3D) */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-user-astronaut text-xs" />
                    <span>{lang === "es" ? "Apariencia del Personaje (Skin 3D)" : "Character Skin (3D)"}</span>
                  </label>
                  <span className="text-[9px] font-mono text-zinc-400">
                    {lang === "es" ? "Visible en 3ª/2ª persona y Multijugador" : "Visible in 3rd/2nd view & Multiplayer"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.values(CHARACTER_SKINS)).filter((skin) => {
                    if (skin.id === "dragon") return vipActive || ownedShopItems.includes("skin_dragon");
                    if (skin.id === "angel") return vipActive || ownedShopItems.includes("skin_angel");
                    if (skin.id === "titan") return vipActive || ownedShopItems.includes("skin_titan");
                    if (skin.id === "poseidon") return vipActive || ownedShopItems.includes("skin_poseidon");
                    if (skin.id === "obsidian") return mvpActive || ownedShopItems.includes("skin_obsidian");
                    return true;
                  }).map((skin) => {
                    const isSelected = characterSkin === skin.id;
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        onClick={() => {
                          resumeAudio();
                          handleSelectSkin(skin.id);
                        }}
                        className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2.5 active:scale-95 ${
                          isSelected
                            ? "bg-emerald-600/25 border-emerald-400 shadow-md shadow-emerald-500/15"
                            : "bg-zinc-950/60 border-white/5 hover:border-white/20"
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg shrink-0 border border-white/20 flex flex-col overflow-hidden shadow-inner"
                          style={{ backgroundColor: skin.id === "custom" ? customSkin.shirt : skin.shirt }}
                        >
                          <div className="h-3.5 w-full flex items-center justify-center" style={{ backgroundColor: skin.id === "custom" ? customSkin.skin : skin.skin }}>
                            <div className="w-4 h-1 rounded-full" style={{ backgroundColor: skin.id === "custom" ? customSkin.eyes : skin.eyes }} />
                          </div>
                          <div className="flex-1 w-full flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: skin.id === "custom" ? customSkin.accent : skin.badgeColor }} />
                          </div>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`text-[10px] font-bold truncate ${isSelected ? "text-white" : "text-zinc-300"}`}>
                            {lang === "es" ? skin.nameEs : skin.nameEn}
                          </span>
                          <span className="text-[8px] font-mono uppercase text-zinc-400 truncate">
                            {skin.gear !== "none" ? skin.gear : skin.backGear}
                          </span>
                        </div>
                        {isSelected && <i className="fas fa-check-circle text-emerald-400 text-xs shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Idioma */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-globe text-xs" />
                  <span>{t.language}</span>
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(["es", "en", "fr", "pt", "de"] as Language[]).map((lcode) => {
                    const labelMap: Record<Language, string> = {
                      es: "Español",
                      en: "English",
                      fr: "Français",
                      pt: "Português",
                      de: "Deutsch",
                    };
                    return (
                      <button
                        key={lcode}
                        onClick={() => {
                          resumeAudio();
                          setLang(lcode);
                        }}
                        className={`text-[9px] sm:text-[10px] py-2 rounded-xl font-bold border transition-all uppercase truncate px-1 ${
                          lang === lcode
                            ? "bg-emerald-500 border-transparent text-white shadow-md font-extrabold"
                            : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {labelMap[lcode]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Perspectiva de Cámara */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-video text-xs" />
                  <span>{t.camera_view}</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPerspective("first")}
                    className={`text-[10px] sm:text-xs py-2.5 rounded-xl font-bold border transition-all uppercase ${
                      perspective === "first"
                        ? "bg-emerald-500 border-transparent text-white shadow-md"
                        : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {t.first_person}
                  </button>
                  <button
                    onClick={() => setPerspective("second")}
                    className={`text-[10px] sm:text-xs py-2.5 rounded-xl font-bold border transition-all uppercase ${
                      perspective === "second"
                        ? "bg-emerald-500 border-transparent text-white shadow-md"
                        : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {t.second_person}
                  </button>
                  <button
                    onClick={() => setPerspective("third")}
                    className={`text-[10px] sm:text-xs py-2.5 rounded-xl font-bold border transition-all uppercase ${
                      perspective === "third"
                        ? "bg-emerald-500 border-transparent text-white shadow-md"
                        : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {t.third_person}
                  </button>
                </div>
              </div>

              {/* FOV (Campo de Visión) */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-eye text-xs" />
                    <span>{t.fov} (Campo de Visión)</span>
                  </label>
                  <span className="text-white font-mono font-black text-xs bg-zinc-800 px-2 py-0.5 rounded-lg border border-white/10">
                    {fov}° {fov >= 110 ? "🔥" : ""}
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="120"
                  value={fov}
                  onChange={(e) => setFov(parseInt(e.target.value))}
                  className="w-full accent-emerald-400 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1"
                />
              </div>

              {/* Controles en Pantalla */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-hand-pointer text-xs" />
                  <span>{lang === "es" ? "Controles Táctiles en Pantalla" : "Touchscreen Controls"}</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["auto", "yes", "no"] as const).map((mode) => {
                    const isActive = touchControlsMode === mode;
                    const modeText = 
                      mode === "auto" 
                        ? (lang === "es" ? "Automático" : "Auto")
                        : mode === "yes" 
                          ? (lang === "es" ? "Siempre Activo" : "Always On")
                          : (lang === "es" ? "Oculto" : "Hidden");

                    return (
                      <button
                        key={mode}
                        onClick={() => {
                          resumeAudio();
                          setTouchControlsMode(mode);
                        }}
                        className={`text-[10px] sm:text-xs py-2 rounded-xl font-bold border transition-all ${
                          isActive
                            ? "bg-emerald-500 border-transparent text-white shadow-md font-extrabold"
                            : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {modeText}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Soporte para Tablets / Dispositivos */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-tablet-screen-button text-xs" />
                  <span>{lang === "es" ? "Ajuste de Pantalla y Tablet" : "Tablet & Screen Profile"}</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: "auto", name: lang === "es" ? "Auto-Detectar" : "Auto-Detect" },
                    { code: "redmi", name: "Redmi Pad 8.7" },
                    { code: "funtouch", name: "Funtouch OS 15" },
                    { code: "galaxy", name: "Galaxy A23 (20:9)" },
                  ].map((preset) => {
                    const isActive = devicePreset === preset.code;
                    return (
                      <button
                        key={preset.code}
                        onClick={() => {
                          resumeAudio();
                          setDevicePreset(preset.code as any);
                          localStorage.setItem("minecraft_device_preset", preset.code);
                        }}
                        className={`text-[10px] sm:text-xs py-2 px-2 rounded-xl font-bold border transition-all ${
                          isActive
                            ? "bg-emerald-500 border-transparent text-white shadow-md font-black"
                            : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {preset.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rotación Automática en Teléfonos (Web) */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-rotate text-xs" />
                    <span>{lang === "es" ? "Rotación en Teléfonos (Web)" : "Mobile Web Auto-Rotation"}</span>
                  </label>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {isPortrait ? (lang === "es" ? "Vertical" : "Portrait") : (lang === "es" ? "Horizontal" : "Landscape")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { mode: "auto", labelEs: "Automática", labelEn: "Auto" },
                    { mode: "landscape", labelEs: "Horizontal", labelEn: "Landscape" },
                    { mode: "portrait", labelEs: "Vertical", labelEn: "Portrait" },
                  ] as const).map((item) => {
                    const isActive = webAutoRotateMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        onClick={() => {
                          resumeAudio();
                          applyMobileRotationSelection(item.mode, item.mode !== "auto");
                        }}
                        className={`text-[10px] sm:text-xs py-2 rounded-xl font-bold border transition-all ${
                          isActive
                            ? "bg-emerald-500 border-transparent text-white shadow-md font-extrabold"
                            : "bg-zinc-850 border-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {lang === "es" ? item.labelEs : item.labelEn}
                      </button>
                    );
                  })}
                </div>
                {sensorStatus === "needs_permission" && (
                  <button
                    type="button"
                    onClick={() => {
                      resumeAudio();
                      applyMobileRotationSelection("auto", false);
                    }}
                    className="w-full py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    {lang === "es" ? "Activar Sensor de Giro en iPhone/Web" : "Enable Gyroscope Sensor"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: 🖼️ GRÁFICOS & RENDIMIENTO */}
          {settingsSection === "graphics" && (
            <div className="flex flex-col w-full gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
              {/* Ultra Optimización */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-white font-bold text-xs flex items-center gap-2">
                    <i className="fas fa-bolt text-amber-400" />
                    <span>{t.ultra_optimization}</span>
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono mt-0.5">
                    {lang === "es" ? "Acelera renderizado para máxima fluidez a 60 FPS" : "Fast mobile rendering for solid 60 FPS"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    resumeAudio();
                    setUltraOptimization(!ultraOptimization);
                  }}
                  className={`px-4 py-2 rounded-xl font-mono font-black text-xs border transition-all ${
                    ultraOptimization
                      ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                      : "bg-zinc-800 border-white/10 text-zinc-400"
                  }`}
                >
                  {ultraOptimization ? "ACTIVADO" : "DESACTIVADO"}
                </button>
              </div>

              {/* Distancia de Renderizado de Chunks */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-cubes text-xs" />
                    <span>{lang === "es" ? "Distancia de Render (Chunks)" : "Render Distance (Chunks)"}</span>
                  </label>
                  <span className="text-white font-mono font-black text-xs bg-zinc-800 px-2 py-0.5 rounded-lg border border-white/10">
                    {perfConfig.renderDistance} Chunks
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={perfConfig.renderDistance}
                  onChange={(e) => {
                    const updated = { ...perfConfig, renderDistance: parseInt(e.target.value) };
                    setPerfConfig(updated);
                    localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                  }}
                  className="w-full accent-emerald-400 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1"
                />
              </div>

              {/* Distancia de Simulación */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-clock text-xs" />
                    <span>{lang === "es" ? "Distancia de Simulación" : "Simulation Distance"}</span>
                  </label>
                  <span className="text-white font-mono font-black text-xs bg-zinc-800 px-2 py-0.5 rounded-lg border border-white/10">
                    {perfConfig.simulationDistance} Radio
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="1"
                  value={perfConfig.simulationDistance}
                  onChange={(e) => {
                    const updated = { ...perfConfig, simulationDistance: parseInt(e.target.value) };
                    setPerfConfig(updated);
                    localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                  }}
                  className="w-full accent-emerald-400 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1"
                />
              </div>

              {/* Límite de Entidades y Chunks Simultáneos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-300 font-bold text-[10px] uppercase">
                      {lang === "es" ? "Límite Mobs" : "Max Entities"}
                    </span>
                    <span className="text-white font-mono font-bold text-xs bg-zinc-800 px-1.5 py-0.5 rounded">
                      {perfConfig.maxEntities}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={perfConfig.maxEntities}
                    onChange={(e) => {
                      const updated = { ...perfConfig, maxEntities: parseInt(e.target.value) };
                      setPerfConfig(updated);
                      localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                    }}
                    className="w-full accent-emerald-400 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-300 font-bold text-[10px] uppercase">
                      {lang === "es" ? "Chunks/Tick" : "Chunks/Tick"}
                    </span>
                    <span className="text-white font-mono font-bold text-xs bg-zinc-800 px-1.5 py-0.5 rounded">
                      {perfConfig.maxConcurrentChunks}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={perfConfig.maxConcurrentChunks}
                    onChange={(e) => {
                      const updated = { ...perfConfig, maxConcurrentChunks: parseInt(e.target.value) };
                      setPerfConfig(updated);
                      localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                    }}
                    className="w-full accent-emerald-400 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Botones de Iluminación, Partículas y Efectos */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    const updated = { ...perfConfig, particlesEnabled: !perfConfig.particlesEnabled };
                    setPerfConfig(updated);
                    localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                  }}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                    perfConfig.particlesEnabled
                      ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                      : "bg-zinc-900 border-white/5 text-zinc-400"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase">{lang === "es" ? "Partículas" : "Particles"}</span>
                  <span className="text-[9px] font-mono font-black">{perfConfig.particlesEnabled ? "ON" : "OFF"}</span>
                </button>

                <button
                  onClick={() => {
                    const updated = { ...perfConfig, lightingQuality: perfConfig.lightingQuality === "high" ? "low" : "high" as any };
                    setPerfConfig(updated);
                    localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                  }}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                    perfConfig.lightingQuality === "high"
                      ? "bg-amber-600/30 border-amber-500 text-amber-300"
                      : "bg-zinc-900 border-white/5 text-zinc-400"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase">{lang === "es" ? "Iluminación" : "Lighting"}</span>
                  <span className="text-[9px] font-mono font-black">{perfConfig.lightingQuality === "high" ? "ALTA" : "BAJA"}</span>
                </button>

                <button
                  onClick={() => {
                    const updated = { ...perfConfig, effectsQuality: perfConfig.effectsQuality === "high" ? "low" : "high" as any };
                    setPerfConfig(updated);
                    localStorage.setItem("minecraft_performance_config", JSON.stringify(updated));
                  }}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                    perfConfig.effectsQuality === "high"
                      ? "bg-sky-600/30 border-sky-500 text-sky-300"
                      : "bg-zinc-900 border-white/5 text-zinc-400"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase">{lang === "es" ? "Efectos" : "Effects"}</span>
                  <span className="text-[9px] font-mono font-black">{perfConfig.effectsQuality === "high" ? "ALTO" : "BAJO"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: 🎵 AUDIO & MÚSICA */}
          {settingsSection === "audio" && (
            <div className="flex flex-col w-full gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
              {/* Selector de Modo de Música */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2.5">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-compact-disc text-xs" />
                  <span>{lang === "es" ? "Motor de Banda Sonora y Música" : "Soundtrack Engine"}</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => {
                      resumeAudio();
                      setMusicContext(isInWorldScene ? "world" : "menu");
                      setMusicMode('soundtrack');
                      setMusicModeState('soundtrack');
                      setIsProceduralActive(true);
                      setIsMusicPlayingState(false);
                      setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 100);
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                      musicMode === 'soundtrack'
                        ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/20 font-black"
                        : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">🎵</span>
                    <span className="text-[10px] font-bold uppercase">Banda Sonora</span>
                    <span className="text-[8px] text-zinc-500 font-mono">Menú / Mundo</span>
                  </button>

                  <button
                    onClick={() => {
                      resumeAudio();
                      setMusicMode('c418');
                      setMusicModeState('c418');
                      setIsProceduralActive(true);
                      setIsMusicPlayingState(false);
                      setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 100);
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                      musicMode === 'c418'
                        ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/20 font-black"
                        : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">🎹</span>
                    <span className="text-[10px] font-bold uppercase">C418 Piano</span>
                    <span className="text-[8px] text-zinc-500 font-mono">Alta Fidelidad</span>
                  </button>

                  <button
                    onClick={() => {
                      resumeAudio();
                      setMusicMode('chiptune');
                      setMusicModeState('chiptune');
                      setIsProceduralActive(true);
                      setIsMusicPlayingState(false);
                      setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 100);
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                      musicMode === 'chiptune'
                        ? "bg-amber-600/30 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/20 font-black"
                        : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">🕹️</span>
                    <span className="text-[10px] font-bold uppercase">Retro 8-Bit</span>
                    <span className="text-[8px] text-zinc-500 font-mono">Chiptune</span>
                  </button>

                  <button
                    onClick={() => {
                      setMusicMode('custom');
                      setMusicModeState('custom');
                      setIsProceduralActive(false);
                      if (isCustomMusicLoaded()) {
                        playCustomBackgroundMusic();
                        setIsMusicPlayingState(true);
                      }
                      setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 100);
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                      musicMode === 'custom'
                        ? "bg-sky-600/30 border-sky-500 text-sky-300 shadow-lg shadow-sky-500/20 font-black"
                        : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">📁</span>
                    <span className="text-[10px] font-bold uppercase">MP3 Propio</span>
                    <span className="text-[8px] text-zinc-500 font-mono">Subir Archivo</span>
                  </button>
                </div>
              </div>

              {/* Reproductor Activo & Pista Sonando */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 truncate max-w-[70%]">
                  <div className="flex items-center gap-1 h-4 text-emerald-400 shrink-0">
                    <span className="w-1 h-3.5 bg-emerald-400 animate-pulse rounded-full" />
                    <span className="w-1 h-5 bg-emerald-400 animate-pulse rounded-full delay-100" />
                    <span className="w-1 h-2.5 bg-emerald-400 animate-pulse rounded-full delay-200" />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-zinc-400 text-[8px] uppercase font-bold tracking-wider">
                      {lang === "es" ? "Pista en Reproducción:" : "Now Playing:"}
                    </span>
                    <span className="text-emerald-300 font-black truncate text-xs">
                      {currentTrackTitle}
                    </span>
                  </div>
                </div>

                {(musicMode === "c418" || (musicMode === "soundtrack" && currentWorld !== null)) && (
                  <button
                    onClick={() => {
                      resumeAudio();
                      skipToNextTrack();
                      setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 150);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 shadow-md"
                  >
                    <span>{lang === "es" ? "Siguiente" : "Next"}</span>
                    <i className="fas fa-forward-step" />
                  </button>
                )}
              </div>

              {/* Subir MP3 */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <label className="w-full bg-zinc-800 hover:bg-zinc-700 py-2.5 rounded-xl text-white font-bold text-xs text-center cursor-pointer transition active:scale-95 border border-white/5 flex items-center justify-center gap-2">
                  <i className="fas fa-cloud-arrow-up text-sky-400" />
                  <span>{lang === "es" ? "Cargar Archivo MP3 para Música" : "Upload MP3 File"}</span>
                  <input
                    type="file"
                    accept="audio/mp3,audio/*"
                    onChange={(e) => {
                      handleMusicUpload(e);
                      setMusicModeState('custom');
                      setTimeout(() => setCurrentTrackTitle(getMusicTrackTitle()), 200);
                    }}
                    className="hidden"
                  />
                </label>

                {musicFileName && (
                  <div className="flex items-center justify-between bg-zinc-950/70 p-2.5 rounded-xl border border-white/5">
                    <span className="text-white text-xs truncate max-w-[65%] font-mono">{musicFileName}</span>
                    <button
                      onClick={() => {
                        if (isMusicPlaying) {
                          pauseCustomBackgroundMusic();
                          setIsMusicPlayingState(false);
                        } else {
                          playCustomBackgroundMusic();
                          setIsMusicPlayingState(true);
                          setMusicModeState('custom');
                        }
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition ${
                        isMusicPlaying ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {isMusicPlaying ? "Pausar" : "Reproducir"}
                    </button>
                  </div>
                )}
              </div>

              {/* Volumen Maestro */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-volume-high text-xs" />
                    <span>{lang === "es" ? "Volumen Maestro de Música" : "Music Volume"}</span>
                  </label>
                  <span className="text-white font-mono font-black text-xs bg-zinc-800 px-2 py-0.5 rounded-lg border border-white/10">
                    {Math.round(musicVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setCustomBackgroundMusicVolume(vol);
                    setMusicVolume(vol);
                  }}
                  className="w-full accent-emerald-400 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1"
                />
              </div>
            </div>
          )}

          {/* Tab 4: 🌍 MUNDO & GENERACIÓN PROCEDURAL */}
          {settingsSection === "world" && (
            <div className="flex flex-col w-full gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
              {/* Acciones de Guardado y Archivos */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2.5">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fas fa-floppy-disk text-xs" />
                  <span>{lang === "es" ? "Gestión de Mundos y Archivos" : "World Management"}</span>
                </label>

                {currentWorld && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleManualSave}
                      className="bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-xl text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md"
                    >
                      <i className="fas fa-save" /> {lang === "es" ? "Guardar Ahora" : "Save Now"}
                    </button>
                    <button
                      onClick={handleExportWorld}
                      className="bg-indigo-600 hover:bg-indigo-500 py-2.5 rounded-xl text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md"
                    >
                      <i className="fas fa-file-export" /> {lang === "es" ? "Exportar JSON" : "Export JSON"}
                    </button>
                    <button
                      onClick={() => {
                        const farPos = { x: 1515, y: 110, z: 1515 };
                        setPlayerPos(farPos);
                        activePlayerPosRef.current = farPos;
                        setAppState("playing");
                        setScreenshotToast(lang === "es" ? "👾 ¡Viajado a los FAR LANDS (X:1515, Z:1515)!" : "👾 Traveled to the FAR LANDS (X:1515, Z:1515)!");
                        setTimeout(() => setScreenshotToast(null), 3000);
                      }}
                      className="col-span-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 py-2.5 rounded-xl text-white font-black text-xs uppercase flex items-center justify-center gap-2 transition active:scale-95 shadow-lg border border-yellow-400/30"
                    >
                      <i className="fas fa-compass text-yellow-200" />
                      <span>{lang === "es" ? "Viajar a los Far Lands (X:1515, Z:1515)" : "Travel to Far Lands"}</span>
                    </button>
                  </div>
                )}

                <label className="w-full bg-zinc-800 hover:bg-zinc-700 py-2.5 rounded-xl text-white font-bold text-xs uppercase flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 border border-white/5">
                  <i className="fas fa-file-import text-emerald-400" />
                  <span>{lang === "es" ? "Importar mundo desde archivo (.json)" : "Import world (.json)"}</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportWorld}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Generación Procedural (Simplex, Ridged, FBM) */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-emerald-400 text-[10px] font-black uppercase tracking-wider font-mono">
                    ⚙️ {lang === "es" ? "Ajustes de Ruido Procedural" : "Noise Procedural Settings"}
                  </span>
                  <button
                    onClick={() => {
                      const reset = { ...DEFAULT_NOISE_CONFIG };
                      setNoiseConfig(reset);
                      localStorage.setItem("minecraft_noise_config", JSON.stringify(reset));
                    }}
                    className="text-[9px] bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold px-2 py-0.5 rounded-lg border border-red-500/30 uppercase"
                  >
                    {lang === "es" ? "Restablecer" : "Reset"}
                  </button>
                </div>

                {/* 1. Cuevas Simplex 3D */}
                <div className="flex items-center justify-between">
                  <span className="text-white text-xs font-bold">1. Simplex Noise 3D (Cuevas)</span>
                  <button
                    onClick={() => {
                      const updated = { ...noiseConfig, simplex3DEnabled: !noiseConfig.simplex3DEnabled };
                      setNoiseConfig(updated);
                      localStorage.setItem("minecraft_noise_config", JSON.stringify(updated));
                    }}
                    className={`text-[9px] font-black px-2.5 py-1 rounded-lg border ${
                      noiseConfig.simplex3DEnabled ? "bg-emerald-500 text-white border-emerald-400" : "bg-zinc-800 text-zinc-400 border-white/10"
                    }`}
                  >
                    {noiseConfig.simplex3DEnabled ? "ON" : "OFF"}
                  </button>
                </div>

                {/* 2. Ridged Noise (Crestas) */}
                <div className="flex items-center justify-between">
                  <span className="text-white text-xs font-bold">2. Ridged Noise (Montañas Suaves)</span>
                  <button
                    onClick={() => {
                      const updated = { ...noiseConfig, ridgedEnabled: !noiseConfig.ridgedEnabled };
                      setNoiseConfig(updated);
                      localStorage.setItem("minecraft_noise_config", JSON.stringify(updated));
                    }}
                    className={`text-[9px] font-black px-2.5 py-1 rounded-lg border ${
                      noiseConfig.ridgedEnabled ? "bg-emerald-500 text-white border-emerald-400" : "bg-zinc-800 text-zinc-400 border-white/10"
                    }`}
                  >
                    {noiseConfig.ridgedEnabled ? "ON" : "OFF"}
                  </button>
                </div>

                {/* 3. FBM Detalle Fractal */}
                <div className="flex items-center justify-between">
                  <span className="text-white text-xs font-bold">3. FBM Fractal (Relieve)</span>
                  <button
                    onClick={() => {
                      const updated = { ...noiseConfig, fbmEnabled: !noiseConfig.fbmEnabled };
                      setNoiseConfig(updated);
                      localStorage.setItem("minecraft_noise_config", JSON.stringify(updated));
                    }}
                    className={`text-[9px] font-black px-2.5 py-1 rounded-lg border ${
                      noiseConfig.fbmEnabled ? "bg-emerald-500 text-white border-emerald-400" : "bg-zinc-800 text-zinc-400 border-white/10"
                    }`}
                  >
                    {noiseConfig.fbmEnabled ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: 🌐 MULTIJUGADOR & CUENTA */}
          {settingsSection === "multiplayer" && (
            <div className="flex flex-col w-full gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
              {/* Estado de Conexión */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" />
                  <div className="flex flex-col">
                    <span className="text-white font-bold text-xs">
                      {lang === "es" ? "Estado Multijugador: En Línea" : "Multiplayer Status: Online"}
                    </span>
                    <span className="text-[9px] text-zinc-400 font-mono">
                      Firestore Realtime Synchronization
                    </span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-md border border-emerald-500/30">
                  ACTIVO
                </span>
              </div>

              {/* Código del Mundo + Sesión */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                {currentWorld && (
                  <div className="flex flex-col gap-1 border-b border-white/5 pb-2.5 mb-1">
                    <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                      {lang === "es" ? "Código de este Mundo (Invita Amigos)" : "Current World Code (Invite Friends)"}
                    </span>
                    <div className="flex items-center justify-between bg-zinc-950/70 p-2.5 rounded-xl border border-emerald-500/25 gap-2">
                      <span className="text-emerald-300 font-mono text-xs font-bold truncate">{currentWorld.id}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(currentWorld.id);
                          setScreenshotToast(lang === "es" ? "🌍 Código del mundo copiado" : "🌍 World code copied");
                          setTimeout(() => setScreenshotToast(null), 2500);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0 active:scale-95"
                      >
                        <i className="fas fa-copy mr-1" />
                        {lang === "es" ? "Copiar" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}

                <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  {lang === "es" ? "Tu Identificador de Sesión" : "Session Player ID"}
                </span>
                <div className="flex items-center justify-between bg-zinc-950/70 p-2.5 rounded-xl border border-white/5 gap-2">
                  <span className="text-white font-mono text-xs truncate">{currentUniqueId}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(currentUniqueId);
                      setScreenshotToast(lang === "es" ? "📋 ID de jugador copiado al portapapeles" : "📋 Player ID copied to clipboard");
                      setTimeout(() => setScreenshotToast(null), 2500);
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0 border border-white/10 active:scale-95"
                  >
                    <i className="fas fa-copy mr-1" />
                    Copiar
                  </button>
                </div>
              </div>

              {/* Jugadores Activos en el Mundo */}
              <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-user-group text-xs" />
                    <span>{lang === "es" ? "Jugadores en el Mundo" : "Players in World"} ({activePlayers.length + 1})</span>
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 mt-1">
                  {/* Tú */}
                  <div className="flex items-center justify-between bg-emerald-950/20 border border-emerald-500/30 p-2 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-white font-bold">{currentUser || "Tú"} <span className="text-emerald-400 text-[10px]">(Tú)</span></span>
                    </div>
                    <span className="text-zinc-400 font-mono text-[10px]">
                      X:{Math.round(activePlayerPosRef.current.x)} Y:{Math.round(activePlayerPosRef.current.y - 55)} Z:{Math.round(activePlayerPosRef.current.z)}
                    </span>
                  </div>

                  {/* Otros jugadores */}
                  {activePlayers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-zinc-950/50 border border-white/5 p-2 rounded-xl text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
                        <span className="text-white font-bold truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-zinc-400 font-mono text-[10px]">
                          X:{Math.round(p.pos?.x || 0)} Y:{Math.round((p.pos?.y || 80) - 55)} Z:{Math.round(p.pos?.z || 0)}
                        </span>
                        {currentWorld && (
                          <button
                            onClick={() => {
                              const tpPos = { x: (p.pos?.x || 0) + 1.5, y: (p.pos?.y || 80) + 0.5, z: (p.pos?.z || 0) + 1.5 };
                              if (p.dimension && p.dimension !== dimension) {
                                setDimension(p.dimension as "overworld" | "nether");
                              }
                              setPlayerPos(tpPos);
                              activePlayerPosRef.current = tpPos;
                              setAppState("playing");
                              setScreenshotToast(`🌀 Teletransportado hacia ${p.name}`);
                              setTimeout(() => setScreenshotToast(null), 2500);
                            }}
                            className="bg-sky-600 hover:bg-sky-500 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase active:scale-95"
                          >
                            TP
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {activePlayers.length === 0 && (
                    <div className="text-center text-zinc-500 text-xs py-3 italic">
                      {lang === "es" ? "No hay otros jugadores en este mundo actualmente. ¡Invita a tus amigos!" : "No other players in this world right now. Invite friends!"}
                    </div>
                  )}
                </div>
              </div>

              {/* Botones Rápidos de Red */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => {
                    resumeAudio();
                    setIsFriendsOpen(true);
                  }}
                  className="bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 font-bold py-2.5 rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <i className="fas fa-user-plus" />
                  <span>{lang === "es" ? "Amigos e Invitaciones" : "Friends & Invites"}</span>
                </button>
                <button
                  onClick={() => {
                    resumeAudio();
                    setIsLeaderboardOpen(true);
                  }}
                  className="bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/40 text-amber-200 font-bold py-2.5 rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <i className="fas fa-trophy" />
                  <span>{lang === "es" ? "Clasificación Global" : "Leaderboard"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Bar: Botón Volver */}
          <div className="w-full pt-2.5 sm:pt-4 mt-1.5 sm:mt-2 border-t border-white/10 flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                resumeAudio();
                setAppState(currentWorld ? "playing" : "menu");
              }}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white font-black py-2.5 sm:py-3 rounded-2xl text-center uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              <i className="fas fa-arrow-left" />
              <span>{currentWorld ? (lang === "es" ? "VOLVER AL JUEGO" : "BACK TO GAME") : (lang === "es" ? "VOLVER AL MENÚ" : "BACK TO MENU")}</span>
            </button>
          </div>
        </div>
        {!asOverlay && renderLeaderboardModal()}
        {!asOverlay && renderFriendsModal()}
        {!asOverlay && renderShopModal()}
        {!asOverlay && renderRealmsModal()}
      </div>
    );
  };

  if (appState === "settings" && !currentWorld) {
    return renderSettingsModal(false);
  }

  // --- NEW INTERACTIVE SCREENS FOR COFRES, HORNOS, CARTOGRAFIA, MAPAS ---
  const renderFurnaceModal = () => {
    if (!isFurnaceOpen) return null;

    const inputResult = getSmeltingResult(furnaceInput || BlockType.AIR);

    const handleSelectInput = (type: BlockType) => {
      if (getSmeltingResult(type)) {
        setFurnaceInput(type);
        setFurnaceInputCount((prev) => prev + 1);
        setSurvivalInventory((inv) => ({ ...inv, [type]: Math.max(0, (inv[type] || 0) - 1) }));
      }
    };

    const handleSelectFuel = (type: BlockType) => {
      if (isFurnaceFuel(type)) {
        setFurnaceFuel(type);
        setFurnaceFuelCount((prev) => prev + 1);
        setSurvivalInventory((inv) => ({ ...inv, [type]: Math.max(0, (inv[type] || 0) - 1) }));
      }
    };

    const handleCollectOutput = () => {
      if (furnaceOutput && furnaceOutputCount > 0) {
        setSurvivalInventory((inv) => ({ ...inv, [furnaceOutput]: (inv[furnaceOutput] || 0) + furnaceOutputCount }));
        setFurnaceOutput(null);
        setFurnaceOutputCount(0);
      }
    };

    return (
      <div className="fixed inset-0 z-[150] bg-black/88 flex flex-col items-center justify-start safe-area-inset p-2 sm:p-5 overflow-y-auto overscroll-contain">
        <div className="bg-zinc-900 border-2 border-orange-500/40 rounded-3xl p-4 sm:p-6 max-w-[min(42rem,calc(100vw-1rem))] w-full max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
            <h3 className="text-white text-xl font-bold minecraft-font flex items-center gap-2 uppercase tracking-wide">
              <i className="fas fa-fire text-orange-500 animate-pulse" />
              <span>Horno de Cocción</span>
            </h3>
            <button
              onClick={() => setIsFurnaceOpen(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 w-8 h-8 rounded-full flex items-center justify-center border border-white/5"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Smelting Mechanics Column */}
            <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl flex flex-col items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-4">Mecánica de Fundición</span>
              
              <div className="flex flex-col items-center gap-2">
                {/* Input Slot */}
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-zinc-500 uppercase font-mono font-bold mb-1">Entrada / Ore</span>
                  <div className="w-14 h-14 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-xl flex items-center justify-center relative">
                    {furnaceInput ? (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: BLOCK_COLORS[furnaceInput] }}>
                        <span className="absolute bottom-1 right-1.5 bg-black/80 px-1 py-0.2 rounded text-[9px] text-white">{furnaceInputCount}</span>
                      </div>
                    ) : (
                      <i className="fas fa-box text-zinc-700 text-lg" />
                    )}
                  </div>
                </div>

                {/* Progress Flame */}
                <div className="my-2 flex flex-col items-center justify-center">
                  <i className={`fas fa-fire text-2xl transition-all duration-300 ${furnaceProgress > 0 ? "text-orange-500 scale-125 animate-pulse" : "text-zinc-800"}`} />
                  <div className="w-24 bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-orange-500 h-full rounded-full transition-all duration-300" style={{ width: `${furnaceProgress}%` }} />
                  </div>
                </div>

                {/* Fuel Slot */}
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-xl flex items-center justify-center relative">
                    {furnaceFuel ? (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: BLOCK_COLORS[furnaceFuel] }}>
                        <span className="absolute bottom-1 right-1.5 bg-black/80 px-1 py-0.2 rounded text-[9px] text-white">{furnaceFuelCount}</span>
                      </div>
                    ) : (
                      <i className="fas fa-coal text-zinc-700 text-lg" />
                    )}
                  </div>
                  <span className="text-[8px] text-zinc-500 uppercase font-mono font-bold mt-1">Combustible / Fuel</span>
                </div>
              </div>

              {/* Output Slot */}
              <div className="mt-6 flex flex-col items-center border-t border-white/5 pt-4 w-full">
                <span className="text-[8px] text-emerald-400 uppercase font-mono font-bold mb-1.5">Resultado</span>
                <button
                  onClick={handleCollectOutput}
                  disabled={!furnaceOutput}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 relative transition ${furnaceOutput ? "border-emerald-500 bg-emerald-950/20 active:scale-95 cursor-pointer" : "border-zinc-800 bg-zinc-900/40 cursor-not-allowed"}`}
                >
                  {furnaceOutput ? (
                    <div className="w-11 h-11 rounded-xl" style={{ backgroundColor: BLOCK_COLORS[furnaceOutput] }}>
                      <span className="absolute bottom-1 right-1.5 bg-black/90 px-1 rounded text-[10px] text-white font-mono font-bold">{furnaceOutputCount}</span>
                    </div>
                  ) : (
                    <i className="fas fa-gem text-zinc-800 text-xl" />
                  )}
                </button>
                {furnaceOutput && (
                  <span className="text-[9px] text-emerald-400 font-bold uppercase mt-1">¡Toca para recoger!</span>
                )}
              </div>
            </div>

            {/* Inventory Column */}
            <div className="bg-zinc-950/40 border border-white/5 p-4 rounded-2xl flex flex-col max-h-[42dvh] md:h-[360px] overflow-y-auto">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-3 block text-center">Tu Inventario (Cargar Horno)</span>
              
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(survivalInventory).map(Number).filter(k => survivalInventory[k] > 0).map((type) => {
                  const isSmeltable = !!getSmeltingResult(type);
                  const isFuel = isFurnaceFuel(type);

                  if (!isSmeltable && !isFuel) return null;

                  return (
                    <div key={type} className="bg-zinc-900 border border-zinc-800 rounded-xl p-1 flex flex-col items-center justify-between text-center relative gap-1">
                      <div className="w-8 h-8 rounded-lg shadow-inner" style={{ backgroundColor: BLOCK_COLORS[type] }} />
                      <span className="text-[8px] text-zinc-300 font-bold uppercase truncate w-full">{BLOCK_NAMES[type]}</span>
                      
                      <div className="flex gap-1 w-full">
                        {isSmeltable && (
                          <button
                            onClick={() => handleSelectInput(type)}
                            className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-black text-[7px] py-1 rounded uppercase"
                            title="Smelt"
                          >
                            Ore
                          </button>
                        )}
                        {isFuel && (
                          <button
                            onClick={() => handleSelectFuel(type)}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-zinc-950 font-black text-[7px] py-1 rounded uppercase"
                            title="Fuel"
                          >
                            Fuel
                          </button>
                        )}
                      </div>
                      
                      <span className="absolute -top-1 -right-1 bg-zinc-950 text-white text-[7.5px] px-1 rounded font-bold">{survivalInventory[type]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderChestModal = () => {
    if (!isChestOpen) return null;

    const handleStoreItem = (type: BlockType) => {
      const qty = survivalInventory[type] || 0;
      if (qty > 0) {
        setSurvivalInventory((inv) => ({ ...inv, [type]: qty - 1 }));
        setChestInventory((chest) => ({ ...chest, [type]: (chest[type] || 0) + 1 }));
      }
    };

    const handleRetrieveItem = (type: BlockType) => {
      const qty = chestInventory[type] || 0;
      if (qty > 0) {
        setChestInventory((chest) => ({ ...chest, [type]: qty - 1 }));
        setSurvivalInventory((inv) => ({ ...inv, [type]: (inv[type] || 0) + 1 }));
      }
    };

    return (
      <div className="fixed inset-0 z-[150] bg-black/88 flex flex-col items-center justify-start safe-area-inset p-2 sm:p-5 overflow-y-auto overscroll-contain">
        <div className="bg-zinc-900 border-2 border-yellow-600/40 rounded-3xl p-4 sm:p-6 max-w-[min(48rem,calc(100vw-1rem))] w-full max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-5">
            <h3 className="text-white text-xl font-bold minecraft-font flex items-center gap-2 uppercase tracking-wide">
              <i className="fas fa-box text-yellow-500" />
              <span>Cofre de Almacenamiento</span>
            </h3>
            <button
              onClick={() => setIsChestOpen(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 w-8 h-8 rounded-full flex items-center justify-center border border-white/5"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Player Inventory */}
            <div className="bg-zinc-950/40 border border-white/5 p-4 rounded-2xl flex flex-col max-h-[38dvh] md:h-[360px] overflow-y-auto">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-3 block text-center">Tu Inventario (Toca para Guardar)</span>
              
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(survivalInventory).map(Number).filter(k => survivalInventory[k] > 0).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleStoreItem(type)}
                    className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 rounded-xl p-2 flex flex-col items-center relative transition active:scale-95 text-center group"
                  >
                    <div className="w-8 h-8 rounded-lg shadow-inner group-hover:scale-105 transition" style={{ backgroundColor: BLOCK_COLORS[type] }} />
                    <span className="text-[8px] text-zinc-400 uppercase truncate font-bold w-full mt-1.5">{BLOCK_NAMES[type]}</span>
                    <span className="absolute top-1.5 right-1.5 bg-black/85 text-white font-mono text-[8px] px-1 rounded-md">{survivalInventory[type]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: Chest Inventory */}
            <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl flex flex-col max-h-[38dvh] md:h-[360px] overflow-y-auto">
              <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider mb-3 block text-center">Contenido del Cofre (Toca para Sacar)</span>
              
              {Object.keys(chestInventory).map(Number).filter(k => chestInventory[k] > 0).length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500 italic p-6">
                  <i className="fas fa-box-open text-zinc-700 text-3xl mb-3" />
                  <span className="text-xs">El cofre está vacío. ¡Guarda tus bloques valiosos!</span>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {Object.keys(chestInventory).map(Number).filter(k => chestInventory[k] > 0).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleRetrieveItem(type)}
                      className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 rounded-xl p-2 flex flex-col items-center relative transition active:scale-95 text-center group"
                    >
                      <div className="w-8 h-8 rounded-lg shadow-inner group-hover:scale-105 transition" style={{ backgroundColor: BLOCK_COLORS[type] }} />
                      <span className="text-[8px] text-zinc-400 uppercase truncate font-bold w-full mt-1.5">{BLOCK_NAMES[type]}</span>
                      <span className="absolute top-1.5 right-1.5 bg-black/85 text-white font-mono text-[8px] px-1 rounded-md">{chestInventory[type]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCartographyModal = () => {
    if (!isCartographyOpen) return null;

    const hasSugarCane = (survivalInventory[BlockType.SUGAR_CANE] || 0) >= 3;
    const hasMapAndPaper = (survivalInventory[BlockType.MAP] || 0) >= 1 && (survivalInventory[BlockType.PAPER] || 0) >= 1;
    const hasPaperAndRedstone = (survivalInventory[BlockType.PAPER] || 0) >= 4 && (survivalInventory[BlockType.REDSTONE] || 0) >= 1;

    const handleCraftPaper = () => {
      if (hasSugarCane) {
        setSurvivalInventory((inv) => ({
          ...inv,
          [BlockType.SUGAR_CANE]: (inv[BlockType.SUGAR_CANE] || 0) - 3,
          [BlockType.PAPER]: (inv[BlockType.PAPER] || 0) + 3
        }));
      }
    };

    const handleCraftMap = () => {
      if (hasPaperAndRedstone) {
        setSurvivalInventory((inv) => ({
          ...inv,
          [BlockType.PAPER]: (inv[BlockType.PAPER] || 0) - 4,
          [BlockType.REDSTONE]: (inv[BlockType.REDSTONE] || 0) - 1,
          [BlockType.MAP]: (inv[BlockType.MAP] || 0) + 1
        }));
      }
    };

    const handleCraftLocatorMap = () => {
      if (hasMapAndPaper) {
        setSurvivalInventory((inv) => ({
          ...inv,
          [BlockType.MAP]: (inv[BlockType.MAP] || 0) - 1,
          [BlockType.PAPER]: (inv[BlockType.PAPER] || 0) - 1,
          [BlockType.LOCATOR_MAP]: (inv[BlockType.LOCATOR_MAP] || 0) + 1
        }));
      }
    };

    return (
      <div className="fixed inset-0 z-[150] bg-black/88 flex flex-col items-center justify-start safe-area-inset p-2 sm:p-5 overflow-y-auto overscroll-contain">
        <div className="bg-zinc-900 border-2 border-indigo-500/40 rounded-3xl p-4 sm:p-6 max-w-[min(36rem,calc(100vw-1rem))] w-full max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-5">
            <h3 className="text-white text-xl font-bold minecraft-font flex items-center gap-2 uppercase tracking-wide">
              <i className="fas fa-map text-indigo-400 animate-bounce" />
              <span>Mesa de Cartografía</span>
            </h3>
            <button
              onClick={() => setIsCartographyOpen(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 w-8 h-8 rounded-full flex items-center justify-center border border-white/5"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed mb-6 font-mono border-b border-white/5 pb-3">
            Combina papel, caña de azúcar, redstone y mapas para expandir tu exploración cartográfica.
          </p>

          <div className="flex flex-col gap-4">
            {/* Formula 1: Caña de azúcar -> Papel */}
            <div className="bg-zinc-950/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-white uppercase font-sans">Fabricar Papel</span>
                <span className="text-[10px] text-zinc-500 mt-0.5">Necesita: 3 Cañas de Azúcar (Tienes: {survivalInventory[BlockType.SUGAR_CANE] || 0})</span>
              </div>
              <button
                onClick={handleCraftPaper}
                disabled={!hasSugarCane}
                className={`px-4 py-2 rounded-xl text-xs uppercase font-extrabold tracking-wider transition active:scale-95 ${hasSugarCane ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer" : "bg-zinc-850 text-zinc-600 cursor-not-allowed"}`}
              >
                +3 Papel
              </button>
            </div>

            {/* Formula 2: Papel + Redstone -> Mapa */}
            <div className="bg-zinc-950/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-white uppercase font-sans">Crear Mapa de Papel</span>
                <span className="text-[10px] text-zinc-500 mt-0.5">Necesita: 4 Papeles + 1 Redstone</span>
              </div>
              <button
                onClick={handleCraftMap}
                disabled={!hasPaperAndRedstone}
                className={`px-4 py-2 rounded-xl text-xs uppercase font-extrabold tracking-wider transition active:scale-95 ${hasPaperAndRedstone ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer" : "bg-zinc-850 text-zinc-600 cursor-not-allowed"}`}
              >
                +1 Mapa
              </button>
            </div>

            {/* Formula 3: Mapa + Papel -> Mapa Localizador */}
            <div className="bg-zinc-950/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-white uppercase font-sans">Crear Mapa Localizador</span>
                <span className="text-[10px] text-zinc-500 mt-0.5">Necesita: 1 Mapa + 1 Papel</span>
              </div>
              <button
                onClick={handleCraftLocatorMap}
                disabled={!hasMapAndPaper}
                className={`px-4 py-2 rounded-xl text-xs uppercase font-extrabold tracking-wider transition active:scale-95 ${hasMapAndPaper ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer" : "bg-zinc-850 text-zinc-600 cursor-not-allowed"}`}
              >
                +1 Localizador
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMapModal = () => {
    if (!isMapOpen) return null;

    // Build an 11x11 matrix representing surrounding blocks using live activePlayerPosRef
    const livePos = activePlayerPosRef.current || playerPos;
    const radius = 5;
    const px = Math.round(livePos.x);
    const pz = Math.round(livePos.z);
    
    // We will query edits first or assume a beautiful procedural layout
    const rows = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const cols = [];
      for (let dz = -radius; dz <= radius; dz++) {
        const targetX = px + dx;
        const targetZ = pz + dz;
        const editKey = `${targetX},${Math.round(livePos.y - 1.5)},${targetZ}`;
        const editKeyNether = `nether:${targetX},${Math.round(livePos.y - 1.5)},${targetZ}`;
        
        let blockType = BlockType.AIR;
        if (currentWorld) {
          blockType = currentWorld.edits[dimension === "nether" ? editKeyNether : editKey] ?? BlockType.AIR;
        }

        if (blockType === BlockType.AIR) {
          // Fallback to biome base block
          if (dimension === "nether") {
            blockType = BlockType.NETHERRACK;
          } else {
            const hInfo = Math.floor(Math.sin(targetX * 0.05) * 4 + 60);
            blockType = hInfo < 57 ? BlockType.SAND : BlockType.GRASS;
          }
        }
        cols.push({ x: targetX, z: targetZ, type: blockType });
      }
      rows.push(cols);
    }

    return (
      <div className="fixed inset-0 z-[150] bg-black/90 flex flex-col items-center justify-start safe-area-inset p-2 sm:p-5 overflow-y-auto overscroll-contain">
        <div className="bg-zinc-900 border-2 border-emerald-500/40 rounded-3xl p-3.5 sm:p-6 max-w-[min(28rem,calc(100vw-1rem))] w-full max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
            <h3 className="text-white text-lg font-bold minecraft-font flex items-center gap-2 uppercase tracking-wide">
              <i className="fas fa-map-location-dot text-emerald-400 animate-pulse" />
              <span>Mapa Localizador HUD</span>
            </h3>
            <button
              onClick={() => setIsMapOpen(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 w-8 h-8 rounded-full flex items-center justify-center border border-white/5 shrink-0"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <div className="bg-zinc-950 p-3 sm:p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-3 sm:gap-4">
            <span className="text-[10px] text-zinc-500 font-mono font-bold">X: {px} | Z: {pz} | {dimension.toUpperCase()}</span>
            
            {/* Visual Radar grid */}
            <div className="grid grid-cols-11 gap-0.5 sm:gap-1 bg-zinc-900 p-1.5 sm:p-2 rounded-xl border border-zinc-800 shadow-inner relative">
              {rows.map((row, rIdx) => 
                row.map((col, cIdx) => {
                  const isCenter = rIdx === 5 && cIdx === 5;
                  let colorClass = "bg-zinc-800";
                  if (col.type === BlockType.GRASS || col.type === BlockType.MOSS || col.type === BlockType.DARK_GRASS) colorClass = "bg-emerald-600";
                  else if (col.type === BlockType.WATER) colorClass = "bg-blue-600";
                  else if (col.type === BlockType.SAND) colorClass = "bg-yellow-100";
                  else if (col.type === BlockType.STONE) colorClass = "bg-zinc-500";
                  else if (col.type === BlockType.WOOD || col.type === BlockType.LOG) colorClass = "bg-amber-800";
                  else if (col.type === BlockType.NETHERRACK || col.type === BlockType.LAVA || col.type === BlockType.FIRE) colorClass = "bg-red-700";

                  return (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center text-[7px] font-bold ${colorClass} ${isCenter ? "outline-2 outline-yellow-400 ring-1 ring-yellow-400 z-10 scale-105" : ""}`}
                      title={`Coord: [${col.x}, ${col.z}]`}
                    >
                      {isCenter && (
                        <i className="fas fa-location-arrow text-yellow-300 text-xs animate-pulse" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-[9px] text-zinc-400 font-mono flex flex-wrap items-center justify-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" /> Césped</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" /> Agua</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-100 inline-block" /> Arena</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-700 inline-block" /> Nether</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const maxAbsCoord = Math.max(Math.abs(playerPos.x), Math.abs(playerPos.z));

  return (
    <div
      className={`fixed inset-0 w-full h-full overflow-hidden touch-none ${dimension === "nether" ? "bg-[#240606]" : "bg-[#09090b]"} ${maxAbsCoord >= 2000 ? "glitch-heavy" : maxAbsCoord >= 1500 ? "glitch-moderate" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={handleTouchStart}
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Glitch CRT Styles */}
      <style>{`
        @keyframes glitch-shake {
          0% { transform: translate(0, 0) skew(0deg); }
          10% { transform: translate(-2px, 1.5px) skew(-1.5deg); }
          20% { transform: translate(1.5px, -1.5px) skew(2.5deg); }
          30% { transform: translate(-3.5px, -2px) skew(-2deg); }
          40% { transform: translate(2px, 3px) skew(1.5deg); }
          50% { transform: translate(-1.5px, 2px) skew(0deg); }
          60% { transform: translate(3.5px, -1px) skew(-1.5deg); }
          70% { transform: translate(-2px, -3.5px) skew(3.5deg); }
          80% { transform: translate(1.5px, 2.5px) skew(-2.5deg); }
          90% { transform: translate(-3.5px, 1.5px) skew(1.5deg); }
          100% { transform: translate(0, 0) skew(0deg); }
        }
        @keyframes scanline-anim {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes noise-flicker-anim {
          0% { opacity: 0.12; }
          50% { opacity: 0.05; }
          100% { opacity: 0.18; }
        }
        .glitch-moderate {
          animation: glitch-shake 0.45s infinite steps(2);
        }
        .glitch-heavy {
          animation: glitch-shake 0.15s infinite steps(1);
        }
        .scanlines-overlay {
          background: linear-gradient(
            rgba(18, 16, 16, 0) 50%, 
            rgba(0, 0, 0, 0.45) 50%
          ), linear-gradient(
            90deg,
            rgba(255, 0, 0, 0.06),
            rgba(0, 255, 0, 0.02),
            rgba(0, 0, 255, 0.06)
          );
          background-size: 100% 4px, 6px 100%;
        }
        .scanline-light {
          animation: scanline-anim 6s linear infinite;
        }
        .cyber-noise {
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.15),
            rgba(0, 0, 0, 0.15) 1px,
            transparent 1px,
            transparent 2px
          );
          animation: noise-flicker-anim 0.08s infinite;
        }
      `}</style>

      {/* Screen Warning Messages overlay based on player coordinates */}
      {maxAbsCoord >= 2300 ? (
        <div className="absolute inset-0 bg-black/60 pointer-events-none flex flex-col items-center justify-center gap-4 z-[9999] overflow-hidden">
          {/* Static Scanline noise sweeps */}
          <div className="absolute inset-0 scanlines-overlay mix-blend-color-burn opacity-95" />
          <div className="absolute top-0 left-0 w-full h-[15px] bg-red-600/40 scanline-light shadow-[0_0_20px_rgba(239,68,68,0.85)] animate-bounce" />
          <div className="absolute inset-0 cyber-noise opacity-[0.4] mix-blend-difference" />
          
          <div className="bg-black/95 border-4 border-red-600 text-red-500 px-8 py-5 rounded-3xl font-extrabold tracking-[0.2em] uppercase shadow-[0_0_50px_rgba(220,38,38,0.95)] font-mono text-center flex flex-col gap-2 scale-110">
            <span className="text-2xl md:text-4xl text-red-600 font-black tracking-widest animate-pulse">
              ⚠️ SEÑAL CORROMPIDA ⚠️
            </span>
            <span className="text-[10px] text-zinc-400 font-semibold tracking-wider">
              FALLA CRÍTICA DE SEÑAL - MUNDO DISOLVIÉNDOSE
            </span>
          </div>
        </div>
      ) : (
        <>
          {maxAbsCoord >= 2000 && maxAbsCoord < 2300 && (
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-2 z-[9999]">
              <div className="bg-red-950/95 border-2 border-red-600/80 px-6 py-3 rounded-lg font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(239,68,68,0.75)] font-mono text-center flex flex-col gap-1 text-[11px] md:text-sm animate-pulse">
                <span className="text-red-500 font-extrabold flex items-center justify-center gap-2 tracking-[0.2em]">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-ping mr-1" />
                  SEÑAL CORROMPIDA
                </span>
              </div>
            </div>
          )}

          {maxAbsCoord >= 1500 && maxAbsCoord < 2000 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[120px] pointer-events-none flex flex-col items-center gap-2 z-[9999]">
              <div className="bg-red-950/85 border-2 border-red-500 text-red-100 px-6 py-3 rounded-2xl font-bold tracking-widest uppercase shadow-[0_0_25px_rgba(239,68,68,0.65)] font-mono text-center flex flex-col gap-1.5 animate-pulse">
                <span className="text-red-400 font-extrabold flex items-center justify-center gap-2 text-xs md:text-sm">
                  <i className="fas fa-exclamation-triangle animate-bounce text-red-500" /> {lang === "es" ? "HAS LLEGADO AL LÍMITE" : "YOU HAVE REACHED THE LIMIT"}
                </span>
                <span className="text-[9px] text-red-200/90 font-semibold tracking-wide">
                  {lang === "es" ? "EL MUNDO SE ESTÁ CORROMPIENDO MUCHO..." : "THE WORLD IS SEVERELY CORRUPTING..."}
                </span>
              </div>
            </div>
          )}

          {maxAbsCoord >= 1400 && maxAbsCoord < 1500 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[120px] pointer-events-none flex flex-col items-center gap-2 z-[9999]">
              <div className="bg-amber-950/80 border-2 border-amber-500 text-amber-100 px-5 py-2.5 rounded-2xl font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(245,158,11,0.5)] font-mono text-center flex flex-col gap-1 text-[11px] md:text-xs">
                <span className="text-amber-400 font-extrabold flex items-center justify-center gap-1.5">
                  <i className="fas fa-circle-exclamation animate-pulse" /> {lang === "es" ? "EL MUNDO EMPIEZA A CORROMPERSE" : "THE WORLD IS STARTING TO CORRUPT"}
                </span>
                <span className="text-[8.5px] text-amber-200/80 font-semibold tracking-wide">
                  {lang === "es" ? "EL MUNDO SE ESTÁ GLICHEANDO..." : "THE WORLD IS GLITCHING..."}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Screen Glitched full screen filter for x/z >= 1500 */}
      {maxAbsCoord >= 1500 && (
        <div className="absolute inset-0 pointer-events-none z-[9998] overflow-hidden">
          {/* Scanlines layer */}
          <div className="absolute inset-0 scanlines-overlay mix-blend-color-burn opacity-80" />
          {/* Dynamic scanline sweeper */}
          <div className="absolute top-0 left-0 w-full h-[6px] bg-red-500/25 scanline-light shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
          {/* Heavy Cyber Noise layer */}
          <div className="absolute inset-0 cyber-noise opacity-[0.22] mix-blend-difference" />
          {/* Corrupted ambient screen patches */}
          <div className="absolute top-[15%] left-[5%] w-24 h-36 bg-purple-500/10 mix-blend-color-dodge blur-xl animate-pulse" />
          <div className="absolute bottom-[20%] right-[10%] w-36 h-36 bg-red-500/10 mix-blend-color-dodge blur-xl animate-pulse" />
        </div>
      )}
      {isUnderwater && !isSpectatorMode && (
        <div className="absolute inset-0 pointer-events-none z-[50] bg-gradient-to-b from-cyan-500/25 via-sky-700/35 to-blue-950/50 transition-opacity duration-300" />
      )}
      <VoxelWorld
        key={(currentWorld?.id || "temp") + "_" + dimension}
        currentBlock={currentBlock}
        playerPos={playerPos}
        onBlockChange={handlePosChange}
        moveVector={staticZeroMoveVector}
        externalMoveVectorRef={moveVectorRef}
        lookOffsetRef={lookOffsetRef}
        interactionMode={interactionMode}
        isJumping={isJumping}
        perspective={perspective}
        fov={fov}
        isZooming={isZooming}
        ultraOptimization={ultraOptimization}
        worldId={currentWorld?.id || "temp"}
        initialEdits={dimensionEdits}
        onBlockEdit={handleBlockEdit}
        onSelectBlock={setCurrentBlock}
        worldType={currentWorld?.worldType || "normal"}
        gameMode={currentWorld?.gameMode || "survival"}
        onOpenCraftingTable={handleOpenCraftingTable}
        onOpenFurnace={handleOpenFurnace}
        onOpenCartographyTable={handleOpenCartographyTable}
        onOpenChest={handleOpenChest}
        onUseMap={handleUseMap}
        survivalInventory={survivalInventory}
        onUpdateSurvivalInventory={setSurvivalInventory}
        weather={weather}
        dimension={dimension}
        onPortalTeleport={handlePortalTeleport}
        autoJumpEnabled={autoJumpEnabled}
        userRole={userRole}
        biomeConfig={biomeConfig}
        activePlayers={activePlayers}
        noiseConfig={noiseConfig}
        perfConfig={perfConfig}
        attackTrigger={attackTrigger}
        placeTrigger={placeTrigger}
        buildBrush={buildBrush}
        characterSkin={characterSkin}
        customSkin={characterSkin === "custom" ? customSkin : undefined}
        playerPoseRef={activePlayerPoseRef}
        aiCompanionConfig={aiCompanionConfig}
        aiCompanionTpTrigger={aiCompanionTpTrigger}
        aiCompanionPosRef={aiCompanionPosRef}
        aiCompanionBagRef={aiCompanionBagRef}
        onAICompanionBuildComplete={handleCompanionBuildComplete}
        onAICompanionSpeak={handleCompanionSpeak}
        initialBlockColors={dimensionBlockColors}
        onBatchWorldEdit={handleBatchWorldEdit}
        virtualRotationDeg={virtualRotationDeg}
        realmEditorConfig={realmEditorConfigForWorld}
        realmActionRequest={realmActionRequest}
        onRealmUndoChange={setRealmCanUndo}
      />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-30">
        <div className="w-5 h-5 border border-white/50 rounded-full flex items-center justify-center">
          <div className="w-0.5 h-0.5 bg-white"></div>
        </div>
      </div>

      <div className="fixed inset-0 z-20 pointer-events-none overflow-hidden select-none safe-area-inset">
        {/* Top-Left: Stats + Chat */}
        <div className={`absolute top-0 left-0 flex flex-col gap-1.5 items-start ${isPortrait ? "max-w-[calc(100%-72px)]" : "max-w-[230px] sm:max-w-[280px]"} pointer-events-none ${uiScaleConfig.containerPadding}`}>
          <div
            className={`bg-black/80 rounded-xl border border-white/15 pointer-events-auto transition-all duration-300 ${uiScaleConfig.statsPadding}`}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <h1 className={`text-white font-bold minecraft-font uppercase tracking-tighter flex items-center gap-1.5 flex-wrap ${uiScaleConfig.statsTitle}`}>
              ALPHA <span className="text-emerald-400">MOBILE 1.0.2</span>
              {activeRealmId && (
                <span className="text-[8px] font-mono bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 px-1.5 py-0.5 rounded uppercase">
                  🏰 Realm
                </span>
              )}
            </h1>
            <p className={`text-white/40 mt-1 font-mono break-words leading-normal ${uiScaleConfig.statsText}`}>
              <span id="player-coordinates-hud">
                X:{playerPos.x.toFixed(0)} Y:{(playerPos.y - 55).toFixed(0)} Z:{playerPos.z.toFixed(0)}
              </span>
              <br/>
              Chunks: {Object.keys(currentWorld?.edits || {}).length} | <FpsCounter />
            </p>

            {/* REAL-TIME SCREEN RESOLUTION & PRESET HUD - CLICK TO CYCLE */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                resumeAudio();
                const presets: ("auto" | "redmi" | "funtouch" | "galaxy")[] = ["auto", "redmi", "funtouch", "galaxy"];
                const nextIndex = (presets.indexOf(devicePreset) + 1) % presets.length;
                const nextPreset = presets[nextIndex];
                setDevicePreset(nextPreset);
                localStorage.setItem("minecraft_device_preset", nextPreset);
              }}
              className={`mt-2 px-2 py-1.5 rounded-lg text-[8px] font-mono leading-tight transition-all flex flex-col gap-0.5 pointer-events-auto cursor-pointer select-none hover:bg-white/5 active:scale-97 border ${uiScaleConfig.badge}`}
              title="Toca para cambiar perfil de pantalla"
            >
              <div className="flex items-center justify-between gap-1 font-bold uppercase">
                <div className="flex items-center gap-1">
                  <i className="fas fa-tablet-screen-button text-[9px] animate-pulse" />
                  <span>Soporte de Pantalla</span>
                </div>
                <span className="text-[7px] bg-white/20 px-1 rounded uppercase tracking-tighter">Tap 🔄</span>
              </div>
              <div>
                Tam: {screenSize.width}x{screenSize.height} (R: {screenSize.aspectRatio.toFixed(2)})
              </div>
              <div className="text-[7.5px] opacity-90 border-t border-white/5 pt-0.5 mt-0.5 flex justify-between items-center">
                <span>Perfil: <strong>{uiScaleConfig.name}</strong></span>
                <span className="text-[6.5px] text-white/50 lowercase">({lang === "es" ? "tocar" : "cycle"})</span>
              </div>
            </div>

            {activeRealmId && (
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    resumeAudio();
                    setIsRealmEditorOpen((prev) => !prev);
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[9.5px] uppercase tracking-wider flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                    isRealmEditorOpen || realmEditorConfig.tool !== "none"
                      ? "bg-fuchsia-600/90 hover:bg-fuchsia-500 border-fuchsia-300/60 text-white shadow-lg"
                      : "bg-cyan-700/80 hover:bg-cyan-600 border-cyan-400/40 text-cyan-50"
                  }`}
                >
                  <i className="fas fa-wand-magic-sparkles" />
                  <span>{isRealmEditorOpen ? "Cerrar Editor" : "Herramientas Realm"}</span>
                </button>
                {realmCanUndo && (
                  <button
                    type="button"
                    onClick={() => {
                      resumeAudio();
                      setRealmActionRequest({ seq: Date.now(), action: "undo" });
                    }}
                    className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-amber-300 font-bold text-[9.5px] transition active:scale-95"
                    title="Deshacer último cambio"
                  >
                    ↩️
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleSaveAndExit}
              className="mt-2 w-full bg-red-600/85 hover:bg-red-500 py-1 rounded-lg text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 transition active:scale-95"
            >
              <i className="fas fa-sign-out-alt" /> {t.save_n_exit}
            </button>
          </div>

          {/* Active Realm Tool Quick Pill when panel is collapsed */}
          {activeRealmId && !isRealmEditorOpen && realmEditorConfig.tool !== "none" && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="pointer-events-auto bg-zinc-950/95 border border-fuchsia-500/50 rounded-xl px-2.5 py-1.5 text-white flex flex-wrap items-center gap-1.5 shadow-xl"
            >
              <span className="text-[9.5px] font-black uppercase text-fuchsia-300">
                {realmEditorConfig.tool === "sphere" && `🔵 Esfera r=${realmEditorConfig.radius} (${realmEditorConfig.fillPercent}%)`}
                {realmEditorConfig.tool === "erase_sphere" && `🕳️ Vaciar r=${realmEditorConfig.radius} (${realmEditorConfig.fillPercent}%)`}
                {realmEditorConfig.tool === "platform" && `🟦 Disco r=${realmEditorConfig.radius} (${realmEditorConfig.fillPercent}%)`}
                {realmEditorConfig.tool === "paint" && (realmEditorConfig.eraseColorMode ? "🧹 Quitar Color" : `🎨 Pintar ${realmEditorConfig.selectedColor}`)}
              </span>
              <button
                type="button"
                onClick={() => {
                  resumeAudio();
                  setRealmActionRequest({
                    seq: Date.now(),
                    action: realmEditorConfig.tool === "paint" ? "paint_aimed" : "place_front",
                  });
                }}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-[9px] font-bold uppercase"
              >
                {realmEditorConfig.tool === "paint" ? "Pintar Aquí" : "Aplicar Frente"}
              </button>
              <button
                type="button"
                onClick={() => setRealmEditorConfig((prev) => ({ ...prev, tool: "none" }))}
                className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[9px] font-bold text-zinc-300"
              >
                ✋ Mano
              </button>
            </div>
          )}

          {/* Collapsible Realm World Editor Drawer */}
          {activeRealmId && isRealmEditorOpen && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="fixed left-2 sm:left-4 top-2 sm:top-4 z-40 pointer-events-auto bg-zinc-950/96 border border-fuchsia-500/45 rounded-2xl p-3 w-[min(320px,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain shadow-2xl text-white flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🛠️</span>
                  <span className="text-xs font-black uppercase tracking-wider text-fuchsia-300">
                    Editor del Realm
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!realmCanUndo}
                    onClick={() => setRealmActionRequest({ seq: Date.now(), action: "undo" })}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition ${
                      realmCanUndo
                        ? "bg-amber-600 hover:bg-amber-500 text-white"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    ↩️ Deshacer
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRealmEditorOpen(false)}
                    className="text-zinc-400 hover:text-white px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Tool Selector */}
              <div className="grid grid-cols-2 gap-1">
                {([
                  { id: "none", label: "✋ Mano (Normal)" },
                  { id: "sphere", label: "🔵 Esfera" },
                  { id: "paint", label: "🎨 Pintar Bloque" },
                  { id: "erase_sphere", label: "🕳️ Vaciar Esfera" },
                  { id: "platform", label: "🟦 Disco / Piso" },
                ] as { id: RealmEditorTool; label: string }[]).map((toolItem) => (
                  <button
                    key={toolItem.id}
                    type="button"
                    onClick={() => {
                      resumeAudio();
                      setRealmEditorConfig((prev) => ({ ...prev, tool: toolItem.id }));
                      if (toolItem.id !== "none") {
                        setInteractionMode("place");
                      }
                    }}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition text-left ${
                      toolItem.id === "none" ? "col-span-2 text-center" : ""
                    } ${
                      realmEditorConfig.tool === toolItem.id
                        ? "bg-fuchsia-600 text-white border border-fuchsia-300/60 shadow"
                        : "bg-zinc-900 text-zinc-300 border border-white/10 hover:bg-zinc-800"
                    }`}
                  >
                    {toolItem.label}
                  </button>
                ))}
              </div>

              {/* Sphere / Platform Controls: Any Size & 0% - 100% Fill */}
              {(realmEditorConfig.tool === "sphere" ||
                realmEditorConfig.tool === "erase_sphere" ||
                realmEditorConfig.tool === "platform" ||
                realmEditorConfig.tool === "none") && (
                <div className="bg-zinc-900/90 border border-white/10 rounded-xl p-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-sky-300">
                      Tamaño (Radio)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={realmEditorConfig.radius}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(25, Number(e.target.value) || 1));
                          setRealmEditorConfig((prev) => ({ ...prev, radius: val }));
                        }}
                        className="w-12 bg-zinc-950 border border-white/20 rounded px-1.5 py-0.5 text-[10px] font-mono text-center text-white"
                      />
                      <span className="text-[9px] font-mono text-zinc-400">
                        ({realmEditorConfig.radius * 2 + 1}m)
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={realmEditorConfig.radius}
                    onChange={(e) =>
                      setRealmEditorConfig((prev) => ({ ...prev, radius: Number(e.target.value) }))
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                  <div className="flex gap-1">
                    {[2, 5, 8, 12, 18, 25].map((rPreset) => (
                      <button
                        key={rPreset}
                        type="button"
                        onClick={() => setRealmEditorConfig((prev) => ({ ...prev, radius: rPreset }))}
                        className={`flex-1 py-0.5 rounded text-[9px] font-mono font-bold border ${
                          realmEditorConfig.radius === rPreset
                            ? "bg-sky-600 border-sky-300 text-white"
                            : "bg-zinc-950 border-white/10 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        r{rPreset}
                      </button>
                    ))}
                  </div>

                  {/* Fill Percentage 0% - 100% */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <span className="text-[10px] font-black uppercase text-emerald-300">
                      Relleno Interior
                    </span>
                    <span className="text-[10px] font-mono font-bold text-white">
                      {realmEditorConfig.fillPercent}%{" "}
                      {realmEditorConfig.fillPercent === 0
                        ? "(Hueca)"
                        : realmEditorConfig.fillPercent === 100
                          ? "(Sólida)"
                          : "(Porosa)"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={realmEditorConfig.fillPercent}
                    onChange={(e) =>
                      setRealmEditorConfig((prev) => ({ ...prev, fillPercent: Number(e.target.value) }))
                    }
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { pct: 0, label: "0% Hueca" },
                      { pct: 25, label: "25%" },
                      { pct: 50, label: "50%" },
                      { pct: 100, label: "100% Sólida" },
                    ].map((preset) => (
                      <button
                        key={preset.pct}
                        type="button"
                        onClick={() =>
                          setRealmEditorConfig((prev) => ({ ...prev, fillPercent: preset.pct }))
                        }
                        className={`py-1 px-1 rounded text-[8.5px] font-bold border ${
                          realmEditorConfig.fillPercent === preset.pct
                            ? "bg-emerald-600 border-emerald-300 text-white"
                            : "bg-zinc-950 border-white/10 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Replace existing & Material quick bar */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() =>
                        setRealmEditorConfig((prev) => ({
                          ...prev,
                          replaceExisting: !prev.replaceExisting,
                        }))
                      }
                      className={`flex-1 py-1 px-2 rounded text-[9px] font-bold border ${
                        realmEditorConfig.replaceExisting
                          ? "bg-amber-600/80 border-amber-400 text-white"
                          : "bg-zinc-950 border-white/15 text-zinc-300"
                      }`}
                    >
                      {realmEditorConfig.replaceExisting ? "🔁 Reemplaza bloques" : "🫧 Solo en aire"}
                    </button>
                    <span className="text-[9px] text-zinc-300 truncate max-w-[110px]">
                      Bloque: <strong>{BLOCK_NAMES[currentBlock] || "Concreto"}</strong>
                    </span>
                  </div>

                  {/* Quick shape materials */}
                  <div className="flex flex-wrap gap-1">
                    {[
                      { type: BlockType.CONCRETE, label: "Concreto" },
                      { type: BlockType.WOOL, label: "Lana" },
                      { type: BlockType.STONE, label: "Piedra" },
                      { type: BlockType.WOOD, label: "Madera" },
                      { type: BlockType.GLOWSTONE, label: "Luz" },
                      { type: BlockType.OBSIDIAN, label: "Obsid." },
                    ].map((mat) => (
                      <button
                        key={mat.type}
                        type="button"
                        onClick={() => setCurrentBlock(mat.type)}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold border ${
                          currentBlock === mat.type
                            ? "bg-white text-zinc-950 border-white"
                            : "bg-zinc-950 text-zinc-300 border-white/10 hover:bg-zinc-800"
                        }`}
                      >
                        {mat.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      resumeAudio();
                      setRealmEditorConfig((prev) => ({
                        ...prev,
                        tool: prev.tool === "erase_sphere" || prev.tool === "platform" ? prev.tool : "sphere",
                      }));
                      setRealmActionRequest({ seq: Date.now(), action: "place_front" });
                    }}
                    className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide shadow transition active:scale-95 ${
                      realmEditorConfig.tool === "erase_sphere"
                        ? "bg-rose-600 hover:bg-rose-500 text-white"
                        : "bg-sky-600 hover:bg-sky-500 text-white"
                    }`}
                  >
                    {realmEditorConfig.tool === "erase_sphere"
                      ? "🕳️ Vaciar Esfera Frente a Mí"
                      : realmEditorConfig.tool === "platform"
                        ? "🟦 Colocar Plataforma Bajo/Frente"
                        : "🔵 Colocar Esfera Frente a Mí"}
                  </button>
                </div>
              )}

              {/* Block Color Painter Section */}
              <div className="bg-zinc-900/90 border border-white/10 rounded-xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-pink-300">
                    🎨 Colores de Bloques
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={realmEditorConfig.selectedColor}
                      onChange={(e) =>
                        setRealmEditorConfig((prev) => ({
                          ...prev,
                          selectedColor: e.target.value,
                          eraseColorMode: false,
                        }))
                      }
                      className="w-6 h-6 rounded border border-white/25 bg-transparent cursor-pointer"
                      title="Elegir cualquier color personalizado"
                    />
                    <span className="text-[9px] font-mono text-zinc-300 uppercase">
                      {realmEditorConfig.eraseColorMode ? "ORIGINAL" : realmEditorConfig.selectedColor}
                    </span>
                  </div>
                </div>

                {/* 16 Color Swatches */}
                <div className="grid grid-cols-8 gap-1">
                  {[
                    "#ffffff", "#94a3b8", "#334155", "#09090b",
                    "#ef4444", "#f97316", "#facc15", "#84cc16",
                    "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
                    "#6366f1", "#a855f7", "#ec4899", "#ff2a6d",
                  ].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setRealmEditorConfig((prev) => ({
                          ...prev,
                          selectedColor: hex,
                          eraseColorMode: false,
                          tool: prev.tool === "none" ? "paint" : prev.tool,
                        }))
                      }
                      style={{ backgroundColor: hex }}
                      className={`h-5 rounded border transition ${
                        !realmEditorConfig.eraseColorMode && realmEditorConfig.selectedColor.toLowerCase() === hex
                          ? "border-white ring-2 ring-fuchsia-400 scale-105"
                          : "border-white/25 hover:scale-105"
                      }`}
                      title={hex}
                    />
                  ))}
                </div>

                {/* Paint Brush Radius */}
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <span className="text-[9px] text-zinc-400 uppercase font-bold">Brocha:</span>
                  <div className="flex gap-1 flex-1 justify-end">
                    {[1, 2, 3, 5].map((pr) => (
                      <button
                        key={pr}
                        type="button"
                        onClick={() =>
                          setRealmEditorConfig((prev) => ({ ...prev, paintRadius: pr }))
                        }
                        className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                          realmEditorConfig.paintRadius === pr
                            ? "bg-pink-600 border-pink-300 text-white"
                            : "bg-zinc-950 border-white/10 text-zinc-300"
                        }`}
                      >
                        {pr === 1 ? "1 Blq" : `R${pr}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Options */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setRealmEditorConfig((prev) => ({
                        ...prev,
                        applyColorToShapes: !prev.applyColorToShapes,
                        eraseColorMode: false,
                      }))
                    }
                    className={`w-full py-1 px-2 rounded text-[9px] font-bold border text-left ${
                      realmEditorConfig.applyColorToShapes
                        ? "bg-fuchsia-700/80 border-fuchsia-400 text-white"
                        : "bg-zinc-950 border-white/10 text-zinc-300"
                    }`}
                  >
                    {realmEditorConfig.applyColorToShapes
                      ? "✅ Esferas y discos salen con este color"
                      : "⬜ Aplicar color a nuevas esferas (Desactivado)"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRealmEditorConfig((prev) => ({
                        ...prev,
                        eraseColorMode: !prev.eraseColorMode,
                        tool: "paint",
                      }))
                    }
                    className={`w-full py-1 px-2 rounded text-[9px] font-bold border text-left ${
                      realmEditorConfig.eraseColorMode
                        ? "bg-slate-200 text-zinc-950 border-white"
                        : "bg-zinc-950 border-white/10 text-zinc-300"
                    }`}
                  >
                    {realmEditorConfig.eraseColorMode
                      ? "🧹 Modo Quitar Color (Restaura textura original)"
                      : "🧹 Restaurar textura original al pintar"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resumeAudio();
                    setRealmEditorConfig((prev) => ({ ...prev, tool: "paint" }));
                    setRealmActionRequest({ seq: Date.now(), action: "paint_aimed" });
                  }}
                  className="w-full py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-black uppercase tracking-wide shadow transition active:scale-95"
                >
                  🎨 Pintar Bloque Apuntado
                </button>
              </div>
            </div>
          )}

          {/* Persistent Minecraft-style HUD Chat Overlay - Grouped vertically below stats box to avoid any overlap! */}
          {(!activeRealmId || !isRealmEditorOpen) && (
            <div className="w-56 sm:w-64 max-h-[100px] sm:max-h-44 flex flex-col gap-1 overflow-hidden pointer-events-none transition-opacity duration-300">
              {chatMessages.slice(isCompactHeight ? -2 : -4).map((msg, idx) => (
                <div key={idx} className="bg-black/55 px-2 py-0.5 rounded text-[8px] sm:text-[9px] text-white font-mono border-l-2 border-sky-400">
                  {msg}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top-Right: Utility Buttons + Companion Quick Panel */}
        <div className={`absolute top-0 right-0 flex flex-col items-end gap-1.5 pointer-events-none ${uiScaleConfig.containerPadding}`}>
          <div className={`${useCompactUI || isCompactHeight ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1.5"} pointer-events-auto`}>
            <button
              onClick={handleGetBuildingSuggestion}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              disabled={isLoadingSuggestion}
              className={`bg-indigo-600/90 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all hover:bg-indigo-500 ${uiScaleConfig.btnSize}`}
              title="Sugerencia de construcción"
              id="wand-btn"
            >
              <i
                className={`fas ${uiScaleConfig.btnIcon} ${isLoadingSuggestion ? "fa-spinner fa-spin" : "fa-wand-sparkles"}`}
              />
            </button>
            <button
              onClick={handleCaptureScreenshot}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`bg-teal-600/95 hover:bg-teal-500 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all ${uiScaleConfig.btnSize}`}
              title="Capturar pantalla"
              id="camera-btn"
            >
              <i className={`fas fa-camera ${uiScaleConfig.btnIcon}`} />
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setIsZooming(true); }}
              onPointerUp={(e) => { e.stopPropagation(); setIsZooming(false); }}
              onPointerCancel={(e) => { e.stopPropagation(); setIsZooming(false); }}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); setIsZooming(true); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setIsZooming(false); }}
              onTouchCancel={(e) => { e.preventDefault(); e.stopPropagation(); setIsZooming(false); }}
              className={`bg-blue-600/90 rounded-2xl shadow-xl text-white flex items-center justify-center transition-all hover:bg-blue-500 active:bg-blue-400 select-none pointer-events-auto touch-none ${uiScaleConfig.btnSize} ${isZooming ? 'ring-2 ring-yellow-400 bg-blue-500 scale-95' : ''}`}
              title="Zoom"
              id="zoom-btn"
              style={{ touchAction: "none" }}
            >
              <i className={`fas fa-search-plus ${uiScaleConfig.btnIcon} ${isZooming ? 'text-yellow-300' : 'text-sky-300'}`} />
            </button>
            <button
              onClick={() => {
                resumeAudio();
                setIsCompanionPanelOpen((prev) => !prev);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`${
                aiCompanionConfig.enabled
                  ? "bg-cyan-600/95 hover:bg-cyan-500 border-cyan-300/60"
                  : "bg-zinc-800/95 hover:bg-zinc-700 border-white/10"
              } rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all border ${uiScaleConfig.btnSize}`}
              title={lang === "es" ? "Amigo IA" : "AI Friend"}
              id="hud-ai-companion-btn"
            >
              <i className={`fas fa-robot ${aiCompanionConfig.enabled ? "text-cyan-100" : "text-cyan-400"} ${uiScaleConfig.btnIcon}`} />
            </button>
            <button
              onClick={() => {
                resumeAudio();
                setIsChatOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`bg-sky-600/95 hover:bg-sky-500 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all border border-white/10 ${uiScaleConfig.btnSize}`}
              title="Chat / Comandos"
              id="hud-chat-btn"
            >
              <i className={`fas fa-comment-dots text-yellow-200 animate-pulse ${uiScaleConfig.btnIcon}`} />
            </button>
            <button
              onClick={() => {
                resumeAudio();
                setAppState("settings");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`bg-zinc-800/95 hover:bg-zinc-700 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all border border-white/10 ${uiScaleConfig.btnSize}`}
              title="Ajustes"
              id="hud-settings-btn"
            >
              <i className={`fas fa-cog text-emerald-400 ${uiScaleConfig.btnIcon}`} />
            </button>
            {showTouchControls && (
              <button
                type="button"
                onClick={() => {
                  resumeAudio();
                  toggleManualScreenRotation();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className={`rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all border ${
                  virtualRotationDeg !== 0
                    ? "bg-emerald-600/95 hover:bg-emerald-500 border-emerald-300/60"
                    : "bg-zinc-800/95 hover:bg-zinc-700 border-emerald-500/30"
                } ${uiScaleConfig.btnSize}`}
                title={lang === "es" ? "Girar Pantalla (Vertical / Horizontal)" : "Rotate Screen"}
                id="hud-rotate-btn"
              >
                <i className={`fas fa-rotate ${virtualRotationDeg !== 0 ? "text-white" : "text-emerald-300"} ${uiScaleConfig.btnIcon}`} />
              </button>
            )}
            <button
              onClick={() => {
                resumeAudio();
                setIsGameMenuOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`bg-zinc-800/95 hover:bg-zinc-700 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center transition-all border border-amber-500/40 ${uiScaleConfig.btnSize}`}
              title="Pausa y Menú"
              id="hud-pause-btn"
            >
              <i className={`fas fa-pause text-amber-400 ${uiScaleConfig.btnIcon}`} />
            </button>
          </div>

          {/* Compact AI Companion Quick Panel */}
          {isCompanionPanelOpen && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="fixed right-2 sm:right-4 top-12 sm:top-16 z-40 pointer-events-auto bg-zinc-950/96 border border-cyan-500/40 rounded-2xl p-3 w-[min(18rem,calc(100vw-1rem))] max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain shadow-2xl text-white flex flex-col gap-2"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs font-black uppercase tracking-wider text-cyan-300 truncate max-w-[130px]">
                    {aiCompanionConfig.name || "Alex IA"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAiCompanionConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                    className={`px-2 py-0.5 rounded text-[9px] font-black uppercase transition ${
                      aiCompanionConfig.enabled ? "bg-rose-600 text-white" : "bg-cyan-600 text-white"
                    }`}
                  >
                    {aiCompanionConfig.enabled ? "OFF" : "ON"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCompanionPanelOpen(false)}
                    className="text-zinc-400 hover:text-white px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {([
                  { id: "follow", label: "🤝 Seguir" },
                  { id: "gather", label: "⛏️ Minar" },
                  { id: "build", label: "🏠 Casa" },
                  { id: "guard", label: "⚔️ Defensa" },
                  { id: "explore", label: "🧭 Explorar" },
                  { id: "stay", label: "🛑 Esperar" },
                ] as { id: AICompanionMode; label: string }[]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAiCompanionConfig((prev) => ({ ...prev, enabled: true, mode: m.id }))}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold transition active:scale-95 ${
                      aiCompanionConfig.enabled && aiCompanionConfig.mode === m.id
                        ? "bg-emerald-600 text-white border border-emerald-400/50"
                        : "bg-zinc-900 text-zinc-300 border border-white/10 hover:bg-zinc-800"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAiCompanionConfig((prev) => ({ ...prev, enabled: true }));
                    setAiCompanionTpTrigger((t) => t + 1);
                  }}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold py-1.5 rounded-lg transition active:scale-95"
                >
                  📍 Venir aquí
                </button>
                <button
                  type="button"
                  onClick={handleShareCompanionBag}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold py-1.5 rounded-lg transition active:scale-95"
                >
                  🎁 Dar bloques
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar: Joystick + Center Hotbar + Action Cluster (wraps cleanly in Portrait) */}
        <div className={`absolute inset-x-0 bottom-0 flex ${isPortrait && showTouchControls ? "flex-wrap gap-y-1.5" : ""} justify-between items-end transition-all duration-300 w-full ${uiScaleConfig.gapClass} ${uiScaleConfig.controlPadding}`}>
          {showTouchControls ? (
            <div
              className={`pointer-events-auto flex items-end ${isPortrait ? "order-1 mb-0.5" : (isCompactHeight ? "mb-0.5" : "mb-1.5")} select-none shrink-0`}
              style={{ touchAction: "none" }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onPointerCancel={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchCancel={(e) => e.stopPropagation()}
            >
              <Joystick
                onMove={handleJoystickMove}
                onEnd={handleJoystickEnd}
                size={uiScaleConfig.joystickSize}
                screenRotationDeg={virtualRotationDeg}
              />
            </div>
          ) : (
            <div
              className="pointer-events-auto flex flex-col gap-2 bg-black/80 p-4 rounded-2xl border border-white/15 text-white select-none max-w-xs transition-all mb-2"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <h3 className="text-emerald-400 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5 font-sans">
                <i className="fas fa-keyboard text-xs animate-pulse" /> Controles de PC
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] text-zinc-300 font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">W A S D</span>
                  <span>Mover</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">Espacio</span>
                  <span>Saltar</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">Clic Izq</span>
                  <span>Romper</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">Clic Der</span>
                  <span>Poner/Abrir</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">E / I</span>
                  <span>Inventario</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">Esc</span>
                  <span>Ajustes</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono col-span-2 border-t border-white/5 pt-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">C / Z</span>
                  <span>Zoom (Mantener)</span>
                </div>
              </div>
            </div>
          )}

          <div className={`flex flex-col gap-1.5 sm:gap-3 items-center pointer-events-none min-w-0 ${isPortrait && showTouchControls ? "order-3 basis-full w-full max-w-full" : "flex-1 max-w-[calc(100%-156px)] sm:max-w-lg"}`}>
            {/* HUD de Oxígeno, Vida y Comida */}
            <div
              className="flex flex-col gap-0.5 sm:gap-1 items-center drop-shadow-md w-full px-1 sm:px-2 mb-0.5 sm:mb-1 pointer-events-auto"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {(isInWater || air < 20) && !isCreativeMode && !isSpectatorMode && (
                <div className="flex gap-0.5 sm:gap-1 justify-center items-center w-full mb-0.5">
                  {aquaticPerk ? (
                    <span className="text-[9px] font-mono font-black text-cyan-300 bg-cyan-950/75 border border-cyan-400/50 px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                      <i className="fas fa-water text-cyan-400" />
                      <span>{lang === "es" ? "Branquias Poseidón (Oxígeno ∞)" : "Poseidon Gills (∞ O₂)"}</span>
                    </span>
                  ) : (
                    [...Array(10)].map((_, i) => {
                      const bubbleThreshold = (i + 1) * 2;
                      const filled = air >= bubbleThreshold;
                      const half = !filled && air >= bubbleThreshold - 1;
                      return (
                        <i
                          key={`air${i}`}
                          className={`fas fa-droplet text-[10px] sm:text-xs transition-all duration-150 ${
                            filled
                              ? "text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.85)]"
                              : half
                                ? "text-cyan-300/70 scale-90"
                                : "text-sky-950/70 opacity-40 scale-75"
                          }`}
                        />
                      );
                    })
                  )}
                </div>
              )}
              <div className="flex gap-0.5 sm:gap-1 justify-center w-full relative">
                {[...Array(10)].map((_, i) => {
                  const isHeartFilled = i < Math.ceil(health / 2);
                  const isRegenTarget = isRegenerating && i === Math.ceil(health / 2) - 1;
                  return (
                    <i
                      key={`h${i}`}
                      className={`fas fa-heart text-[11px] sm:text-sm transition-all duration-200 ${
                        isHeartFilled
                          ? isRegenerating 
                            ? "text-red-500 animate-pulse drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]" 
                            : "text-red-500"
                          : "text-red-950 opacity-50"
                      } ${isRegenTarget ? "scale-110" : ""}`}
                    />
                  );
                })}
                {isRegenerating && (
                  <span className="absolute -top-3.5 right-0 text-[8px] font-mono font-bold text-emerald-400 bg-black/60 px-1.5 py-0.2 rounded-full border border-emerald-400/40 animate-pulse flex items-center gap-1 shadow-sm">
                    <i className="fas fa-sparkles text-[7px]" /> +VIDA
                  </span>
                )}
              </div>
              <div className="flex gap-0.5 sm:gap-1 justify-center w-full">
                {[...Array(10)].map((_, i) => (
                  <i
                    key={`f${i}`}
                    className={`fas fa-drumstick-bite text-[11px] sm:text-sm ${i < Math.ceil(food / 2) ? "text-amber-500" : "text-amber-950 opacity-50"}`}
                  />
                ))}
              </div>
            </div>

            <div
              className={`flex flex-col gap-1.5 sm:gap-2 items-center w-full pointer-events-auto transition-transform duration-300 ${uiScaleConfig.hotbarScale}`}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Only render upper controls row if there are visible elements like the Eat button */}
              {(currentBlock === BlockType.MUSHROOM_RED || currentBlock === BlockType.MUSHROOM_BROWN) && (
                <div className="flex gap-2 mb-1">
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      resumeAudio();
                      gameState.eat(4);
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      resumeAudio();
                      gameState.eat(4);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeAudio();
                      gameState.eat(4);
                    }}
                    className="w-12 h-12 rounded-xl flex flex-col items-center justify-center border-4 transition-all shadow-lg bg-orange-600 border-orange-300 active:scale-95 pointer-events-auto"
                  >
                    <i className="fas fa-drumstick-bite text-white text-base" />
                    <span className="text-[7px] text-white font-bold uppercase mt-0.5">
                      Eat
                    </span>
                  </button>
                </div>
              )}

              {/* Build Assist Toolbar: Mode Toggle (Break/Place) & Rapid Brush (1x1 / Row x3 / Wall 3x2) */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 bg-black/75 border border-white/10 px-2 py-1 rounded-xl shadow-lg pointer-events-auto">
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode((prev) => (prev === "place" ? "break" : "place"));
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide flex items-center gap-1 border transition cursor-pointer ${
                    interactionMode === "place"
                      ? "bg-emerald-600/80 border-emerald-400 text-white"
                      : "bg-red-600/80 border-red-400 text-white"
                  }`}
                  title={lang === "es" ? "Cambiar acción al tocar pantalla" : "Toggle tap action"}
                >
                  <i className={`fas ${interactionMode === "place" ? "fa-cubes" : "fa-hammer"} text-[9px]`} />
                  <span>{interactionMode === "place" ? (lang === "es" ? "Poner" : "Place") : (lang === "es" ? "Romper" : "Break")}</span>
                </button>

                <div className="w-px h-3.5 bg-white/15" />

                {([
                  { id: "single", label: "1x1" },
                  { id: "line3", label: lang === "es" ? "Fila x3" : "Row x3" },
                  { id: "wall3x2", label: lang === "es" ? "Pared 3x2" : "Wall 3x2" },
                ] as const).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeAudio();
                      setBuildBrush(b.id);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase transition cursor-pointer ${
                      buildBrush === b.id
                        ? "bg-amber-500 text-zinc-950 font-black shadow"
                        : "bg-zinc-900/90 text-zinc-300 hover:text-white border border-white/10"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {/* Advanced Horizontal Swipeable Scroll Hotbar */}
              <div className="bg-black/80 p-1.5 rounded-2xl flex flex-row items-center gap-1.5 border border-white/10 shadow-2xl min-w-0 max-w-full pointer-events-auto">
                <div 
                  className="flex flex-row gap-1.5 overflow-x-auto scrollbar-none py-0.5 px-0.5 min-w-0" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {inventoryItems.map((type) => {
                    const count = survivalInventory[type];
                    return (
                      <div key={type} className="relative shrink-0">
                        <button
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            resumeAudio();
                            setCurrentBlock(type);
                            setInteractionMode("place");
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            resumeAudio();
                            setCurrentBlock(type);
                            setInteractionMode("place");
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            resumeAudio();
                            setCurrentBlock(type);
                            setInteractionMode("place");
                          }}
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 transition-all block p-0.5 ${
                            currentBlock === type ? "border-emerald-400 scale-105 shadow-md shadow-emerald-500/20" : "border-transparent opacity-75 hover:opacity-100"
                          }`}
                          title={BLOCK_NAMES[type]}
                        >
                          <ItemVisualBadge type={type} className="w-full h-full" />
                        </button>
                        {!isCreativeMode && typeof count === "number" && (
                          <span className={`absolute -bottom-1 -right-1 text-[7.5px] font-mono font-black px-1 rounded shadow pointer-events-none select-none border border-white/10 ${
                            count > 0 ? "bg-black/90 text-white" : "bg-red-950/90 text-red-300"
                          }`}>
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setIsInventoryOpen(true);
                  }}
                  className="w-9 h-9 sm:w-10 sm:h-10 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center justify-center text-white text-xs transition active:scale-95 shrink-0"
                >
                  <i className="fas fa-th-large" />
                </button>
              </div>
            </div>
          </div>

          {/* Action cluster on mobile: Build/Place, Attack/Break, and Jump buttons */}
          {showTouchControls ? (
            <div
              className={`pointer-events-auto flex ${isPortrait ? "order-2 flex-row gap-2 mb-1" : `flex-col ${isCompactHeight ? "gap-1.5 mb-0.5" : "gap-2.5 mb-1.5"}`} items-center select-none shrink-0`}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Boton Dedicado de Construir / Colocar / Abrir */}
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startContinuousPlace();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  stopContinuousPlace();
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  stopContinuousPlace();
                }}
                onPointerLeave={stopContinuousPlace}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  stopContinuousPlace();
                }}
                onTouchCancel={(e) => {
                  e.stopPropagation();
                  stopContinuousPlace();
                }}
                className={`${uiScaleConfig.jumpButtonSize} rounded-full bg-gradient-to-tr from-emerald-600/95 to-teal-500/95 border-2 border-emerald-300/90 shadow-lg shadow-emerald-500/30 flex flex-col items-center justify-center active:scale-90 active:brightness-125 transition-all select-none pointer-events-auto touch-none ring-2 ring-black/40`}
                style={{ touchAction: "none" }}
                title="Colocar Bloque / Construir (Mantener para construir rápido)"
                aria-label="Construir"
              >
                <i className="fas fa-cubes text-white text-lg drop-shadow-md" />
                <span className="text-[7px] font-black text-white uppercase leading-none mt-0.5">
                  {lang === "es" ? "Poner" : "Build"}
                </span>
              </button>

              {/* Boton de Ataque / Romper */}
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAttack();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                className={`${uiScaleConfig.jumpButtonSize} rounded-full bg-gradient-to-tr from-amber-600/90 to-red-500/90 border-2 border-amber-300/80 shadow-lg shadow-red-500/30 flex items-center justify-center active:scale-90 active:brightness-125 transition-all select-none pointer-events-auto touch-none ring-2 ring-black/40`}
                style={{ touchAction: "none" }}
                title="Atacar / Romper"
                aria-label="Atacar"
              >
                <i className="fas fa-hand-back-fist text-white text-xl drop-shadow-md" />
              </button>

              {/* Boton de Salto / Nado */}
              <button
                onPointerDown={(e) => { e.stopPropagation(); setIsJumping(true); }}
                onPointerUp={(e) => { e.stopPropagation(); setIsJumping(false); }}
                onPointerCancel={(e) => { e.stopPropagation(); setIsJumping(false); }}
                onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(true); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(false); }}
                onTouchCancel={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(false); }}
                className={`${uiScaleConfig.jumpButtonSize} rounded-full border-2 shadow-lg flex flex-col items-center justify-center active:scale-90 transition-all select-none pointer-events-auto touch-none ring-2 ring-black/40 ${
                  isInWater
                    ? "bg-gradient-to-tr from-cyan-600/90 to-sky-500/90 border-cyan-300 shadow-cyan-500/40"
                    : "bg-zinc-900/65 border-white/80 active:bg-white/60"
                }`}
                style={{ touchAction: "none" }}
                title={isInWater ? (lang === "es" ? "Nadar hacia arriba" : "Swim up") : "Saltar"}
                aria-label={isInWater ? "Nadar" : "Saltar"}
              >
                <i className={`fas ${isInWater ? "fa-water" : "fa-arrow-up"} text-white text-xl font-black drop-shadow`} />
                {isInWater && (
                  <span className="text-[7px] font-black text-white uppercase leading-none mt-0.5">
                    {lang === "es" ? "Nadar ▲" : "Swim ▲"}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="w-10 sm:w-16 pointer-events-none" />
          )}
        </div>
      </div>

      {isInventoryOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[100] bg-zinc-950/98 safe-area-inset p-3 sm:p-6 flex flex-col items-center overflow-y-auto"
        >
          {/* Modal Header */}
          <div className="flex justify-between w-full max-w-3xl mb-6 items-center border-b border-white/10 pb-4">
            <div className="flex flex-col">
              <h2 className="text-white text-2xl font-bold minecraft-font uppercase tracking-wide">
                {isCreativeMode ? "Inventario Creativo" : "Inventario y Crafteo"}
              </h2>
              <span className="text-[10px] text-zinc-400 font-mono">
                {isCreativeMode ? "Todo es accesible e infinito" : "Consigue y fabrica tus propios recursos"}
              </span>
            </div>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setIsInventoryOpen(false);
                setIsCraftingTableActive(false);
              }}
              className="bg-zinc-800 hover:bg-zinc-700 w-10 h-10 rounded-full text-white flex items-center justify-center transition active:scale-95 border border-white/10"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Active Crafting Table notice */}
          {isCraftingTableActive && (
            <div className="mb-6 bg-emerald-950/50 border border-emerald-500/30 px-4 py-3 rounded-2xl text-emerald-300 text-xs flex items-center gap-3 w-full max-w-3xl">
              <i className="fas fa-circle-info text-emerald-400 text-base flex-shrink-0 animate-pulse" />
              <span>
                <strong>¡Mesa de Crafteo Activa!</strong> Tienes acceso completo a todas las recetas de rango superior como la <strong>Cama Cómoda</strong>, la <strong>Puerta de Madera</strong> y la <strong>Cubeta Metálica</strong>.
              </span>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex gap-2 sm:gap-4 mb-6 w-full max-w-3xl">
            <button
              onClick={() => setInventoryTab("items")}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 border ${
                inventoryTab === "items"
                  ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
              }`}
            >
              <i className="fas fa-cubes text-base" />
              <span>Objetos y Bloques</span>
            </button>
            <button
              onClick={() => setInventoryTab("crafting")}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 border ${
                inventoryTab === "crafting"
                  ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
              }`}
            >
              <i className="fas fa-hammer text-base" />
              <span>Fabricación (Craft)</span>
            </button>
          </div>

          {/* Tab 1: Bloques y Objetos con Categorías y Búsqueda */}
          {inventoryTab === "items" && (
            <div className="w-full max-w-3xl flex flex-col">
              {/* Category Pills & Search */}
              <div className="flex flex-col gap-2 mb-4 w-full">
                {/* Search Bar */}
                <div className="relative w-full">
                  <i className="fas fa-search absolute left-3.5 top-3 text-zinc-500 text-xs" />
                  <input
                    type="text"
                    placeholder={lang === "es" ? "Buscar por nombre (ej. madera, antorcha, diamante)..." : "Search item by name..."}
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  {inventorySearch && (
                    <button
                      onClick={() => setInventorySearch("")}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-white text-xs"
                    >
                      <i className="fas fa-times" />
                    </button>
                  )}
                </div>

                {/* Subcategory Filter Buttons */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full">
                  {[
                    { id: "all", label: lang === "es" ? "📦 Todos" : "📦 All" },
                    { id: "building", label: lang === "es" ? "🧱 Construcción" : "🧱 Building" },
                    { id: "nature", label: lang === "es" ? "🌿 Naturaleza & Minerales" : "🌿 Nature & Ores" },
                    { id: "tools", label: lang === "es" ? "⚔️ Herramientas & Utilidad" : "⚔️ Tools & Utility" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setInventoryCategory(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold whitespace-nowrap transition border ${
                        inventoryCategory === cat.id
                          ? "bg-emerald-600/40 border-emerald-400 text-white shadow-md shadow-emerald-500/20 font-black"
                          : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5 sm:gap-3.5 pb-10">
                {Object.keys(BLOCK_NAMES).map((k) => {
                  const tVal = parseInt(k) as BlockType;
                  if (tVal === 0) return null;

                  const blockName = BLOCK_NAMES[tVal] || "";
                  // Search query filter
                  if (inventorySearch && !blockName.toLowerCase().includes(inventorySearch.toLowerCase())) {
                    return null;
                  }

                  // Category filter
                  const isToolOrUtility = 
                    isUiToolBlock(tVal) ||
                    tVal === BlockType.TORCH || tVal === BlockType.BED || tVal === BlockType.CRAFTING_TABLE || tVal === BlockType.FURNACE ||
                    tVal === BlockType.CHEST || tVal === BlockType.CARTOGRAPHY_TABLE || tVal === BlockType.BUCKET_EMPTY ||
                    tVal === BlockType.BUCKET_WATER || tVal === BlockType.BUCKET_LAVA || tVal === BlockType.FLINT_AND_STEEL ||
                    tVal === BlockType.MAP || tVal === BlockType.LOCATOR_MAP || tVal === BlockType.DOOR || tVal === BlockType.JUKEBOX ||
                    tVal === BlockType.MUSIC_DISC_CAT || tVal === BlockType.MUSIC_DISC_CHIRP || tVal === BlockType.MUSIC_DISC_BLOCKS || tVal === BlockType.MUSIC_DISC_MELLOHI;

                  const isNatureOrOre = 
                    tVal === BlockType.DIRT || tVal === BlockType.GRASS || tVal === BlockType.LEAVES || tVal === BlockType.FLOWER_RED ||
                    tVal === BlockType.FLOWER_YELLOW || tVal === BlockType.MUSHROOM_RED || tVal === BlockType.MUSHROOM_BROWN ||
                    tVal === BlockType.WATER || tVal === BlockType.LAVA || tVal === BlockType.OBSIDIAN || tVal === BlockType.COAL_ORE ||
                    tVal === BlockType.IRON_ORE || tVal === BlockType.GOLD_ORE || tVal === BlockType.REDSTONE_ORE ||
                    tVal === BlockType.DIAMOND_ORE || tVal === BlockType.NETHER_QUARTZ_ORE || tVal === BlockType.SULFUR ||
                    tVal === BlockType.REDSTONE || tVal === BlockType.SUGAR_CANE || tVal === BlockType.BAMBOO ||
                    tVal === BlockType.CHICKEN_EGG || tVal === BlockType.FROG_EGGS || tVal === BlockType.DARK_LEAVES ||
                    tVal === BlockType.DARK_GRASS || tVal === BlockType.CHERRY_LEAVES;

                  const cat = isToolOrUtility ? "tools" : (isNatureOrOre ? "nature" : "building");
                  if (inventoryCategory !== "all" && inventoryCategory !== cat) {
                    return null;
                  }

                  const isSelected = currentBlock === tVal;
                  const blockCount = isCreativeMode ? 64 : (survivalInventory[tVal] || 0);
                  const isAvailable = isCreativeMode || blockCount > 0;

                  return (
                    <button
                      key={tVal}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        resumeAudio();
                        if (!isAvailable) {
                          setScreenshotToast(lang === "es" ? `Tienes 0 unidades de ${blockName}. Consíguelo o fabrícalo.` : `You have 0 of ${blockName}. Craft or gather it.`);
                          setTimeout(() => setScreenshotToast(null), 2500);
                          return;
                        }
                        setCurrentBlock(tVal);
                        setIsInventoryOpen(false);
                        setIsCraftingTableActive(false);
                      }}
                      className={`aspect-square rounded-2xl border-2 p-2 flex flex-col items-center justify-between transition-all active:scale-95 text-center relative group overflow-hidden ${
                        isSelected
                          ? "border-emerald-400 bg-emerald-950/40 shadow-lg shadow-emerald-500/20"
                          : isAvailable
                            ? "bg-zinc-900/80 border-zinc-700/60 hover:border-zinc-500"
                            : "bg-zinc-950/40 border-zinc-900 opacity-50 hover:opacity-75"
                      }`}
                    >
                      <div className="w-full h-11 sm:h-12 flex-shrink-0 transition group-hover:scale-105">
                        <ItemVisualBadge type={tVal} className="w-full h-full" />
                      </div>

                      <span className="text-[9px] text-zinc-300 font-bold uppercase truncate w-full mt-1.5">
                        {blockName}
                      </span>

                      {/* Quantity badge */}
                      {!isCreativeMode && (
                        <span className={`absolute top-1.5 right-1.5 font-mono font-black text-[9px] px-1.5 py-0.5 rounded-md border shadow-lg ${
                          blockCount > 0
                            ? "bg-zinc-950/95 text-emerald-400 border-emerald-500/30"
                            : "bg-red-950/90 text-red-300 border-red-500/30"
                        }`}>
                          {blockCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Crafting Panel */}
          {inventoryTab === "crafting" && (
            <div className="w-full max-w-3xl flex flex-col gap-4 pb-12">
              {/* Filter bar: Search + Category tabs */}
              <div className="flex flex-col gap-2">
                <div className="relative w-full">
                  <i className="fas fa-search absolute left-3.5 top-3 text-zinc-500 text-xs" />
                  <input
                    type="text"
                    placeholder="Buscar receta (ej. pico, espada, diamante, antorcha)..."
                    value={craftingSearch}
                    onChange={(e) => setCraftingSearch(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  {craftingSearch && (
                    <button
                      onClick={() => setCraftingSearch("")}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-white text-xs"
                    >
                      <i className="fas fa-times" />
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: "all", label: "📦 Todas" },
                    { id: "tools", label: "⚔️ Picos, Espadas y Herramientas" },
                    { id: "utility", label: "🔥 Antorchas y Utilidad" },
                    { id: "building", label: "🧱 Construcción" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCraftingCategory(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold whitespace-nowrap transition border ${
                        craftingCategory === cat.id
                          ? "bg-emerald-600/40 border-emerald-400 text-white shadow-md shadow-emerald-500/20 font-black"
                          : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Left Side: Recipe List */}
                <div className="md:col-span-6 flex flex-col gap-2.5 max-h-[440px] overflow-y-auto pr-1">
                  {CRAFTING_RECIPES.filter((recipe) => {
                    if (craftingCategory !== "all" && recipe.category !== craftingCategory) return false;
                    if (craftingSearch && !recipe.name.toLowerCase().includes(craftingSearch.toLowerCase())) return false;
                    return true;
                  }).map((recipe) => {
                    const hasAllMats = isCreativeMode || recipe.ingredients.every(
                      (ing) => (survivalInventory[ing.type] || 0) >= ing.count
                    );
                    const isLockedByTable = recipe.requiresCraftingTable && !isCraftingTableActive;
                    const isSelected = selectedRecipeId === recipe.id;

                    return (
                      <button
                        key={recipe.id}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                        className={`w-full p-2.5 rounded-2xl border-2 text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-950/20"
                            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 w-10/12">
                          <div className="w-9 h-9 flex-shrink-0">
                            <ItemVisualBadge type={recipe.result} className="w-full h-full" />
                          </div>
                          <div className="flex flex-col truncate">
                            <span className="text-xs font-bold text-white uppercase tracking-wide truncate">
                              {recipe.name}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              Obtienes {recipe.resultCount} {recipe.resultCount === 1 ? "unidad" : "unidades"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isLockedByTable ? (
                            <span className="bg-zinc-800 text-zinc-400 text-[8px] font-bold uppercase py-0.5 px-1.5 rounded-md border border-zinc-700 flex items-center gap-1">
                              <i className="fas fa-lock text-[7px]" /> Mesa
                            </span>
                          ) : hasAllMats ? (
                            <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase py-0.5 px-1.5 rounded-md border border-emerald-500/30">
                              Listo
                            </span>
                          ) : (
                            <span className="bg-zinc-850 text-zinc-500 text-[8px] font-bold uppercase py-0.5 px-1.5 rounded-md">
                              Faltan
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Right Side: Recipe Details View */}
                <div className="md:col-span-6 bg-zinc-900/40 border-2 border-zinc-800 rounded-3xl p-5 flex flex-col">
                  {(() => {
                    const activeRecipe =
                      CRAFTING_RECIPES.find((r) => r.id === selectedRecipeId) ||
                      CRAFTING_RECIPES[0];

                    const hasAllMats = isCreativeMode || activeRecipe.ingredients.every(
                      (ing) => (survivalInventory[ing.type] || 0) >= ing.count
                    );
                    const isLockedByTable =
                      activeRecipe.requiresCraftingTable && !isCraftingTableActive;

                    return (
                      <>
                        {/* Recipe Output header representation */}
                        <div className="flex flex-col items-center text-center border-b border-white/5 pb-4 mb-4">
                          <div className="w-16 h-16 mb-3 hover:scale-105 transition-transform">
                            <ItemVisualBadge type={activeRecipe.result} className="w-full h-full rounded-2xl" />
                          </div>
                          <span className="bg-zinc-800 text-zinc-300 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border border-white/5 mb-1.5">
                            Resultado de Fabricación
                          </span>
                          <h3 className="text-white text-lg font-bold uppercase tracking-wide">
                            {activeRecipe.name}
                          </h3>
                          <p className="text-zinc-400 text-xs">
                            Produce x{activeRecipe.resultCount} {activeRecipe.resultCount === 1 ? "unidad" : "unidades"} en total
                          </p>
                        </div>

                        {/* Ingredients breakdown */}
                        <div className="flex flex-col gap-2 mb-5">
                          <span className="text-[9px] text-zinc-400 font-mono tracking-wider uppercase mb-1">
                            {isCreativeMode ? "Ingredientes (Gratis en Creativo):" : "Ingredientes Necesarios:"}
                          </span>
                          {activeRecipe.ingredients.map((ing, i) => {
                            const possessed = isCreativeMode ? ing.count : (survivalInventory[ing.type] || 0);
                            const isMet = possessed >= ing.count;

                            return (
                              <div
                                key={i}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/40 border border-white/5"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-6 h-6 flex-shrink-0">
                                    <ItemVisualBadge type={ing.type} className="w-full h-full" />
                                  </div>
                                  <span className="text-xs font-bold text-zinc-300">
                                    {BLOCK_NAMES[ing.type]}
                                  </span>
                                </div>
                                <span
                                  className={`text-[11px] font-mono font-bold ${
                                    isMet ? "text-emerald-400" : "text-rose-500"
                                  }`}
                                >
                                  {isCreativeMode ? `∞ / ${ing.count}` : `${possessed} / ${ing.count}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Action trigger buttons */}
                        <div className="flex flex-col gap-2">
                          <button
                            disabled={!hasAllMats || isLockedByTable}
                            onClick={() => {
                              resumeAudio();
                              handleCraft(activeRecipe, false);
                            }}
                            className={`w-full py-3.5 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all duration-200 ${
                              isLockedByTable
                                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/55"
                                : hasAllMats
                                ? "bg-emerald-600 border border-emerald-400 text-white shadow-lg shadow-emerald-500/20 active:scale-95 hover:bg-emerald-500"
                                : "bg-zinc-850 text-zinc-500 cursor-not-allowed"
                            }`}
                          >
                            {isLockedByTable ? (
                              <span className="flex items-center justify-center gap-2">
                                <i className="fas fa-lock" /> Coloca y abre una Mesa de Crafteo
                              </span>
                            ) : hasAllMats ? (
                              <span className="flex items-center justify-center gap-1.5">
                                <i className="fas fa-hammer" /> FABRICAR AHORA
                              </span>
                            ) : (
                              "Faltan Recursos"
                            )}
                          </button>

                          {!isLockedByTable && hasAllMats && (
                            <button
                              onClick={() => {
                                resumeAudio();
                                handleCraft(activeRecipe, true);
                              }}
                              className="w-full py-2.5 rounded-xl font-bold uppercase text-[11px] tracking-wider bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 transition active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <i className="fas fa-hand-holding" /> FABRICAR Y EQUIPAR EN MANO
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gemini Suggestion Modal */}
      {suggestion && (
        <div className="fixed inset-0 z-[110] bg-indigo-950/85 flex flex-col items-center justify-start safe-area-inset p-2 sm:p-5 overflow-y-auto overscroll-contain">
          <div className="bg-zinc-900 border-2 border-indigo-500/50 rounded-3xl w-full max-w-[min(28rem,calc(100vw-1rem))] p-4 sm:p-6 max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <span className="bg-indigo-600/30 text-indigo-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">
                {t.suggestion_title}
              </span>
              <button
                onClick={() => setSuggestion(null)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <h2 className="text-white text-2xl font-bold mb-3 minecraft-font uppercase">
              {suggestion.title}
            </h2>
            <p className="text-white/60 text-sm mb-6 leading-relaxed italic">
              "{suggestion.description}"
            </p>
            <div className="space-y-3">
              <p className="text-[10px] text-emerald-400 font-bold uppercase mb-2 flex items-center gap-2">
                <i className="fas fa-list-check" /> {t.steps}
              </p>
              {suggestion.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex gap-3 text-sm text-white/90 bg-white/5 p-3 rounded-xl border border-white/5"
                >
                  <span className="text-emerald-500 font-bold">{i + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSuggestion(null)}
              className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              {t.great}
            </button>
          </div>
        </div>
      )}

      {/* Camera shutter flash */}
      {showCameraFlash && (
        <div 
          className="fixed inset-0 bg-white pointer-events-none z-[99999] transition-opacity duration-500 ease-out"
          style={{ opacity: flashOpacity }}
        />
      )}

      {/* Screenshot Toast Notification */}
      {screenshotToast && (
        <div className="fixed inset-x-0 top-6 px-4 flex justify-center z-[200] pointer-events-none">
          <div className="max-w-[90vw] sm:max-w-md bg-black/85 text-white border border-teal-500/30 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 font-semibold text-xs sm:text-sm text-center break-words">
            <i className="fas fa-camera text-teal-400 text-base animate-pulse shrink-0" />
            <span>{screenshotToast}</span>
          </div>
        </div>
      )}

      {/* Firestore Free Daily Quota Guard Notice */}
      {firestoreQuotaPaused && !quotaBannerDismissed && (
        <div className="fixed inset-x-0 bottom-4 px-3 sm:px-4 flex justify-center z-[210] pointer-events-none">
          <div className="pointer-events-auto max-w-lg w-full bg-zinc-950/95 text-white border border-amber-500/50 px-3.5 py-2.5 rounded-xl shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2">
              <i className="fas fa-exclamation-triangle text-amber-400 text-sm mt-0.5 shrink-0" />
              <div className="leading-snug">
                <p className="font-bold text-amber-300">
                  {lang === "es" ? "Límite diario gratuito de Firebase alcanzado" : "Firebase free daily write quota reached"}
                </p>
                <p className="text-[11px] text-zinc-300">
                  {lang === "es"
                    ? "Los guardados en la nube se pausaron para evitar errores; tu progreso sigue guardándose en este dispositivo hasta el reinicio diario."
                    : "Cloud writes paused temporarily; progress is saved locally until the daily quota resets."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              <a
                href={FIRESTORE_QUOTA_CONSOLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-amber-600/80 hover:bg-amber-500 text-white px-2.5 py-1 rounded-lg font-bold text-[10px] transition"
              >
                {lang === "es" ? "Ver Consola" : "Console"}
              </a>
              <button
                type="button"
                onClick={() => clearFirestoreQuotaPause()}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded-lg font-bold text-[10px] transition"
              >
                {lang === "es" ? "Reintentar" : "Retry"}
              </button>
              <button
                type="button"
                onClick={() => setQuotaBannerDismissed(true)}
                className="text-zinc-400 hover:text-white px-1.5 py-1 rounded-lg font-bold text-[11px] transition"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Chat & Command Console Modal */}
      {isChatOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[120] bg-zinc-950/94 safe-area-inset p-2 sm:p-5 flex flex-col items-center justify-start overflow-y-auto overscroll-contain pointer-events-auto"
        >
          <div className="w-full max-w-[min(36rem,calc(100vw-1rem))] bg-zinc-900 border-2 border-sky-500/30 rounded-3xl p-3.5 sm:p-5 flex flex-col h-[min(85dvh,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] my-auto shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-205">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <i className="fas fa-comment-dots text-sky-400 text-lg" />
                <span className="text-white font-bold minecraft-font uppercase tracking-wide text-sm">
                  Consola de Chat y Comandos
                </span>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-400 w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95 border border-white/5"
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>

            {/* Quick Helper Buttons for Mobile */}
            <div className="mb-3">
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block mb-1.5 font-mono">
                Atajos de comandos rápidos:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "☀ Día", cmd: "/day" },
                  { label: "🌙 Noche", cmd: "/night" },
                  { label: "❤️ Curar", cmd: "/heal" },
                  { label: "⚡ Creativo", cmd: "/gamemode creative" },
                  { label: "🪓 Supervivencia", cmd: "/gamemode survival" },
                  { label: "🌀 Tp Farlands", cmd: "/tp edge_farlands" },
                  { label: "🤖 Invocar IA", cmd: "/ai on" },
                  { label: "⛏️ IA Minar", cmd: "/ai minar" },
                  { label: "🏠 IA Construir", cmd: "/ai construir" },
                  { label: "⚔️ IA Proteger", cmd: "/ai proteger" },
                  { label: "🎁 IA Bloques", cmd: "/ai dar" },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      executeCommand(item.cmd);
                    }}
                    className="bg-sky-950/50 hover:bg-sky-900/60 text-sky-300 border border-sky-700/50 text-[10px] font-bold px-2.5 py-1 rounded-xl transition active:scale-95"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages Log Panel */}
            <div className="flex-1 overflow-y-auto mb-4 bg-black/50 border border-white/5 rounded-2xl p-3.5 flex flex-col gap-1.5 scrollbar-thin">
              {chatMessages.map((msg, i) => {
                let textCol = "text-zinc-300";
                if (msg.includes("❌")) textCol = "text-rose-400";
                else if (msg.includes("☀️") || msg.includes("🌙") || msg.includes("⚡") || msg.includes("❤️")) textCol = "text-yellow-300 font-semibold";
                else if (msg.includes("[Tú]")) textCol = "text-emerald-300";

                return (
                  <div key={i} className={`text-xs font-mono break-all leading-relaxed ${textCol}`}>
                    {msg}
                  </div>
                );
              })}
            </div>

            {/* Input Footer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeCommand(chatInput);
                setChatInput("");
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                autoFocus
                placeholder="Escribe un comando o mensaje..."
                className="flex-1 bg-zinc-950 text-white border-2 border-zinc-800 rounded-2xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-sky-500/60 placeholder:text-zinc-600"
              />
              <button
                type="submit"
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] px-5 rounded-2xl transition active:scale-95 flex items-center justify-center uppercase tracking-wider"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Minecraft-style Game Pause Menu */}
      {isGameMenuOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/88 z-[10005] flex flex-col items-center justify-start safe-area-inset p-2 sm:p-4 overflow-y-auto overscroll-contain"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Menu Card Container */}
          <div className="bg-zinc-900 border-4 border-zinc-700 p-4 sm:p-6 rounded-2xl w-full max-w-[min(28rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] my-auto shadow-2xl flex flex-col gap-3 sm:gap-4 relative overflow-hidden">
            
            {/* Minecraft header banner */}
            <div className="text-center shrink-0">
              <h2 className="text-white text-2xl sm:text-3xl font-bold minecraft-font uppercase tracking-wider drop-shadow-lg flex items-center justify-center gap-2">
                <i className="fas fa-gamepad text-emerald-400" />
                {lang === "es" ? "Menú de Juego" : "Game Menu"}
              </h2>
              <div className="h-[2px] bg-emerald-500/30 w-full mt-2" />
              
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span className="text-[9px] text-zinc-400 font-mono uppercase tracking-wider font-bold">
                  {lang === "es" ? "Tu Rol:" : "Your Role:"}
                </span>
                {(() => {
                  let badgeStyle = "bg-zinc-800 text-zinc-400";
                  let label = lang === "es" ? "USUARIO" : "USER";

                  if (userRole === "owner") {
                    badgeStyle = "bg-gradient-to-r from-yellow-500 to-amber-500 text-white border border-yellow-400 animate-pulse";
                    label = lang === "es" ? "DUEÑO (OWNER)" : "OWNER";
                  } else if (userRole === "staff") {
                    badgeStyle = "bg-red-600 text-white border border-red-500";
                    label = "STAFF";
                  } else if (userRole === "mod") {
                    badgeStyle = "bg-purple-600 text-white border border-purple-500";
                    label = "MOD";
                  }

                  return (
                    <span className={`text-[8.5px] px-2 py-0.5 rounded font-sans font-extrabold uppercase tracking-widest ${badgeStyle}`}>
                      {label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Menu Buttons Grid (Scrollable if screen is short) */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5 sm:gap-3">
              
              {/* Button: Resume Game */}
              <button
                onClick={() => {
                  resumeAudio();
                  setIsGameMenuOpen(false);
                }}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest border border-emerald-400/30 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-play text-xs" />
                {lang === "es" ? "Volver al Juego" : "Resume Game"}
              </button>

              {/* Button: Leaderboard / Tabla de Clasificación */}
              <button
                onClick={() => {
                  resumeAudio();
                  setIsLeaderboardOpen(true);
                }}
                className="w-full bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest border border-yellow-400/30 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-trophy text-white text-xs animate-pulse" />
                {lang === "es" ? "Tabla de Clasificación" : "Leaderboard"}
              </button>

              {/* Quick Skin Switcher & World Code / Active Players in Pause Menu */}
              <div className="bg-zinc-950/60 border border-white/10 rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <i className="fas fa-user-astronaut" />
                    {lang === "es" ? "Personaje 3D" : "3D Character"}
                  </span>
                  <button
                    onClick={() => {
                      resumeAudio();
                      setPerspective((prev) => prev === "first" ? "third" : prev === "third" ? "second" : "first");
                    }}
                    className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-sky-300 font-bold px-2 py-0.5 rounded border border-white/10 uppercase"
                  >
                    <i className="fas fa-video mr-1" />
                    {perspective === "first" ? "1ª Pers." : perspective === "third" ? "3ª Pers." : "2ª Pers."}
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {Object.values(CHARACTER_SKINS).filter((skin) => {
                    if (skin.id === "dragon") return vipActive || ownedShopItems.includes("skin_dragon");
                    if (skin.id === "angel") return vipActive || ownedShopItems.includes("skin_angel");
                    if (skin.id === "titan") return vipActive || ownedShopItems.includes("skin_titan");
                    if (skin.id === "poseidon") return vipActive || ownedShopItems.includes("skin_poseidon");
                    if (skin.id === "obsidian") return mvpActive || ownedShopItems.includes("skin_obsidian");
                    return true;
                  }).map((skin) => {
                    const active = characterSkin === skin.id;
                    return (
                      <button
                        key={skin.id}
                        onClick={() => {
                          resumeAudio();
                          handleSelectSkin(skin.id);
                        }}
                        className={`px-2 py-1 rounded-lg border text-[9px] font-bold shrink-0 flex items-center gap-1.5 transition active:scale-95 ${
                          active
                            ? "bg-emerald-600/30 border-emerald-400 text-white"
                            : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ backgroundColor: skin.id === "custom" ? customSkin.accent : skin.badgeColor }} />
                        <span>{lang === "es" ? skin.nameEs : skin.nameEn}</span>
                      </button>
                    );
                  })}
                </div>

                {currentWorld && (
                  <div className="flex items-center justify-between gap-2 bg-zinc-900/90 border border-white/5 rounded-lg px-2.5 py-1.5">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] text-zinc-400 font-bold uppercase">
                        {lang === "es" ? "Código del Mundo" : "World Code"} • {activePlayers.length + 1} {lang === "es" ? "en sala" : "online"}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-300 truncate">{currentWorld.id}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(currentWorld.id);
                        setScreenshotToast(lang === "es" ? "🌍 Código copiado" : "🌍 Code copied");
                        setTimeout(() => setScreenshotToast(null), 2000);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold px-2 py-1 rounded shrink-0 active:scale-95"
                    >
                      <i className="fas fa-copy mr-1" />
                      {lang === "es" ? "Copiar" : "Copy"}
                    </button>
                  </div>
                )}

                {activePlayers.length > 0 && (
                  <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                    {activePlayers.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-zinc-900/70 rounded-lg px-2 py-1 text-[10px]">
                        <span className="text-sky-300 font-bold truncate flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {p.name}
                        </span>
                        <button
                          onClick={() => {
                            const tpPos = { x: p.pos.x + 1.5, y: p.pos.y + 0.5, z: p.pos.z + 1.5 };
                            if (p.dimension && p.dimension !== dimension) {
                              setDimension(p.dimension as "overworld" | "nether");
                            }
                            setPlayerPos(tpPos);
                            activePlayerPosRef.current = tpPos;
                            setIsGameMenuOpen(false);
                            setChatMessages((m) => [...m, `🌀 Teletransportado junto a ${p.name}`]);
                          }}
                          className="bg-sky-600 hover:bg-sky-500 text-white font-black text-[8px] px-2 py-0.5 rounded uppercase active:scale-95"
                        >
                          TP
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Button: Friends / Amigos */}
              <button
                onClick={() => {
                  resumeAudio();
                  setIsFriendsOpen(true);
                }}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest border border-purple-500/30 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-users text-white text-xs" />
                {lang === "es" ? "Amigos (Multijugador)" : "Friends (Multiplayer)"}
              </button>

              {/* Button: Auto-Jump Toggle */}
              <button
                onClick={() => {
                  resumeAudio();
                  setAutoJumpEnabled(prev => {
                    const next = !prev;
                    localStorage.setItem("minecraft_autojump", String(next));
                    return next;
                  });
                }}
                className={`w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest border shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  autoJumpEnabled 
                    ? "bg-sky-600 hover:bg-sky-500 text-white border-sky-400/30" 
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700"
                }`}
              >
                <i className={`fas ${autoJumpEnabled ? "fa-circle-check" : "fa-circle"} text-xs`} />
                {lang === "es" ? `Salto Automático: ${autoJumpEnabled ? "SÍ" : "NO"}` : `Auto-Jump: ${autoJumpEnabled ? "ON" : "OFF"}`}
              </button>

              {/* Button: Open Inventory/Crafting */}
              <button
                onClick={() => {
                  resumeAudio();
                  setIsGameMenuOpen(false);
                  setIsInventoryOpen(true);
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest border border-white/5 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-boxes-stacked text-xs text-yellow-500" />
                {lang === "es" ? "Inventario & Crafteo" : "Inventory & Crafting"}
              </button>

              {/* Button: Unstuck / Return to Surface */}
              <button
                onClick={() => {
                  resumeAudio();
                  setIsGameMenuOpen(false);
                  // Teleport player high up to trigger the safe spawn-guard landing check
                  setPlayerPos(prev => ({ x: prev.x, y: 150, z: prev.z }));
                }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest border border-amber-500/30 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-life-ring text-xs text-zinc-100" />
                {lang === "es" ? "Desatascarse (Ir a Superficie)" : "Unstuck (Go to Surface)"}
              </button>

              {/* Editable Biome Configuration - Visible ONLY to STAFF / MOD / lionbastias18 */}
              {(userRole === "staff" || userRole === "mod" || googleUser?.email?.toLowerCase() === "lionbastias18@gmail.com") && (
                <div className="bg-zinc-950/50 p-4 rounded-xl border border-white/5 flex flex-col gap-3 mt-1">
                  <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-1">
                    <i className="fas fa-tree text-emerald-500" />
                    {lang === "es" ? "Configurar Bioma Editable" : "Configure Editable Biome"}
                  </h3>
                  
                  {/* Selector fields for Surface, Underground, Flora */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Surface Selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 uppercase tracking-widest">
                        {lang === "es" ? "Superficie" : "Surface"}
                      </label>
                      <select
                        value={biomeConfig?.surface ?? BlockType.MOSS}
                        onChange={async (e) => {
                          const val = Number(e.target.value);
                          const nextConfig = {
                            surface: val,
                            underground: biomeConfig?.underground ?? BlockType.DIRT,
                            flora: biomeConfig?.flora ?? BlockType.VINES
                          };
                          setBiomeConfig(nextConfig);
                          if (googleUser?.email) {
                            try {
                              await setDoc(doc(db, "user_roles", googleUser.email.toLowerCase()), {
                                biomeSurface: val
                              }, { merge: true });
                              logUserActivity(`Configuró bloque de superficie de su bioma editable a ${BLOCK_NAMES[val] || val}`);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.WRITE, `user_roles/${googleUser.email.toLowerCase()}`);
                            }
                          }
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white p-1.5 focus:outline-none focus:border-emerald-500"
                      >
                        {Object.entries(BLOCK_NAMES).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Underground Selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 uppercase tracking-widest">
                        {lang === "es" ? "Subsuelo" : "Underground"}
                      </label>
                      <select
                        value={biomeConfig?.underground ?? BlockType.DIRT}
                        onChange={async (e) => {
                          const val = Number(e.target.value);
                          const nextConfig = {
                            surface: biomeConfig?.surface ?? BlockType.MOSS,
                            underground: val,
                            flora: biomeConfig?.flora ?? BlockType.VINES
                          };
                          setBiomeConfig(nextConfig);
                          if (googleUser?.email) {
                            try {
                              await setDoc(doc(db, "user_roles", googleUser.email.toLowerCase()), {
                                biomeUnderground: val
                              }, { merge: true });
                              logUserActivity(`Configuró bloque de subsuelo de su bioma editable a ${BLOCK_NAMES[val] || val}`);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.WRITE, `user_roles/${googleUser.email.toLowerCase()}`);
                            }
                          }
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white p-1.5 focus:outline-none focus:border-emerald-500"
                      >
                        {Object.entries(BLOCK_NAMES).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Flora Selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 uppercase tracking-widest">
                        {lang === "es" ? "Vegetación" : "Vegetation"}
                      </label>
                      <select
                        value={biomeConfig?.flora ?? BlockType.VINES}
                        onChange={async (e) => {
                          const val = Number(e.target.value);
                          const nextConfig = {
                            surface: biomeConfig?.surface ?? BlockType.MOSS,
                            underground: biomeConfig?.underground ?? BlockType.DIRT,
                            flora: val
                          };
                          setBiomeConfig(nextConfig);
                          if (googleUser?.email) {
                            try {
                              await setDoc(doc(db, "user_roles", googleUser.email.toLowerCase()), {
                                biomeFlora: val
                              }, { merge: true });
                              logUserActivity(`Configuró vegetación de su bioma editable a ${BLOCK_NAMES[val] || val}`);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.WRITE, `user_roles/${googleUser.email.toLowerCase()}`);
                            }
                          }
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white p-1.5 focus:outline-none focus:border-emerald-500"
                      >
                        {Object.entries(BLOCK_NAMES).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ADMIN ROLE & EMAIL LOG PANEL - Visible ONLY to lionbastias18@gmail.com */}
              {googleUser?.email?.toLowerCase() === "lionbastias18@gmail.com" && (
                <div className="bg-zinc-950/60 p-4 rounded-xl border border-red-500/20 flex flex-col gap-3 mt-1">
                  <h3 className="text-red-400 text-xs font-bold uppercase tracking-wider flex items-center justify-between border-b border-white/5 pb-1">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-shield-halved text-red-500" />
                      ADMIN: {lang === "es" ? "Gestión y Alertas" : "RBAC & Monitoring"}
                    </span>
                    <span className="text-[8px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded uppercase font-mono tracking-tighter">
                      Staff Real-time
                    </span>
                  </h3>

                  {/* Role Assignment Form */}
                  <div className="flex flex-col gap-2 bg-zinc-900/40 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider font-mono">
                      {lang === "es" ? "Asignar Rol a Usuario:" : "Assign User Role:"}
                    </span>
                    <div className="flex gap-1.5">
                      <input 
                        id="role_assign_email"
                        type="email"
                        placeholder="usuario@gmail.com"
                        className="flex-1 bg-zinc-950 border border-zinc-800 text-xs rounded px-2 py-1 focus:outline-none focus:border-red-500 text-white"
                      />
                      <select 
                        id="role_assign_select"
                        className="bg-zinc-950 border border-zinc-800 text-xs rounded text-white p-1 focus:outline-none focus:border-red-500"
                      >
                        <option value="user">Usuario</option>
                        <option value="mod">Mod</option>
                        <option value="staff">Staff</option>
                      </select>
                      <button 
                        type="button"
                        onClick={async () => {
                          const emailInput = document.getElementById("role_assign_email") as HTMLInputElement;
                          const roleSelect = document.getElementById("role_assign_select") as HTMLSelectElement;
                          const targetEmail = (emailInput?.value || "").toLowerCase().trim();
                          const targetRole = roleSelect?.value || "user";
                          if (!targetEmail) return;

                          try {
                            await setDoc(doc(db, "user_roles", targetEmail), {
                              email: targetEmail,
                              role: targetRole
                            }, { merge: true });
                            alert(`¡Rol de ${targetEmail} actualizado a ${targetRole}!`);
                            if (emailInput) emailInput.value = "";
                            logUserActivity(`Actualizó rol del usuario ${targetEmail} a ${targetRole}`);
                          } catch (err) {
                            console.error("Error setting user role:", err);
                            handleFirestoreError(err, OperationType.WRITE, `user_roles/${targetEmail}`);
                          }
                        }}
                        className="bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] px-2.5 py-1 rounded transition active:scale-95"
                      >
                        OK
                      </button>
                    </div>
                  </div>

                  {/* Real-time users activities list */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8.5px] text-red-400 font-bold uppercase tracking-wider font-mono flex items-center justify-between">
                      <span>🔔 Registro de Actividad (Staff Gmail Feed):</span>
                      <span className="text-zinc-500">({activityLogs.length} logs)</span>
                    </span>

                    <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-2 max-h-[140px] overflow-y-auto flex flex-col gap-1 font-mono text-[9px] scrollbar-thin">
                      {activityLogs.length === 0 ? (
                        <p className="text-zinc-600 italic text-center py-4">
                          No hay acciones registradas aún.
                        </p>
                      ) : (
                        activityLogs.map((log) => {
                          const dateText = new Date(log.timestamp).toLocaleTimeString();
                          return (
                            <div key={log.id} className="border-b border-white/5 pb-1 flex flex-col text-left">
                              <div className="flex justify-between text-[8px] text-zinc-400 font-bold">
                                <span className="text-red-400">{log.playerName} ({log.playerEmail})</span>
                                <span>{dateText}</span>
                              </div>
                              <p className="text-zinc-200 mt-0.5">{log.action}</p>
                              <div className="text-[7.5px] text-emerald-400/80 flex items-center gap-1 mt-0.5 font-semibold">
                                <i className="fas fa-envelope text-[8px]" />
                                Notificación Gmail enviada a lionbastias18@gmail.com ✓
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Exit Game Button */}
              <button
                onClick={() => {
                  resumeAudio();
                  setIsGameMenuOpen(false);
                  handleSaveAndExit();
                }}
                className="w-full bg-red-600/80 hover:bg-red-500 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest border border-red-500/30 transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
              >
                <i className="fas fa-sign-out-alt text-xs" />
                {lang === "es" ? "Guardar y Salir" : "Save and Exit"}
              </button>
              
            </div>
          </div>
        </div>
      )}

      {/* In-World Settings Overlay (keeps VoxelWorld mounted) */}
      {appState === "settings" && renderSettingsModal(true)}
      {/* Realms Modal */}
      {renderRealmsModal()}
      {/* Leaderboard Modal (Tabla de Clasificación) */}
      {renderLeaderboardModal()}
      {/* Friends Modal */}
      {renderFriendsModal()}
      {/* VIP Shop Modal */}
      {renderShopModal()}
    </div>
  );
  };

  const rootViewportStyle: React.CSSProperties | undefined =
    virtualRotationDeg !== 0
      ? {
          width: `${physicalViewport.height}px`,
          height: `${physicalViewport.width}px`,
          transform: `translate(-50%, -50%) rotate(${virtualRotationDeg}deg)`,
        }
      : undefined;

  return (
    <div
      style={rootViewportStyle}
      className={
        virtualRotationDeg !== 0
          ? "fixed top-1/2 left-1/2 origin-center overflow-hidden bg-[#09090b]"
          : "fixed inset-0 w-full h-full overflow-hidden bg-[#09090b]"
      }
    >
      {renderAppScreen()}
      <CatEasterEggs
        activeEgg={activeCatEasterEgg}
        lang={lang}
        onClose={() => setActiveCatEasterEgg(null)}
        onSwitchEgg={(next) => setActiveCatEasterEgg(next)}
      />
    </div>
  );
};

export default App;
