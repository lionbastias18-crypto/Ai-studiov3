import React, { useState, useCallback, useRef, useEffect } from "react";
import VoxelWorld from "./components/VoxelWorld";
import Joystick from "./components/Joystick";
import { FpsCounter } from "./components/FpsCounter";
import { BlockType, ToolType, Vector3D, GeminiSuggestion } from "./types";
import { BLOCK_NAMES, BLOCK_COLORS } from "./constants";
import { getBuildingSuggestion } from "./services/geminiService";
import { resumeAudio } from "./services/audioService";
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
  logoutGoogle,
  saveWorldToFirestore,
  loadWorldsFromFirestore,
  deleteWorldFromFirestore,
  handleFirestoreError,
  OperationType
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
  name: string;
}

const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "wood_planks",
    result: BlockType.WOOD,
    resultCount: 4,
    ingredients: [{ type: BlockType.LOG, count: 1 }],
    requiresCraftingTable: false,
    name: "Tablones de Madera",
  },
  {
    id: "crafting_table",
    result: BlockType.CRAFTING_TABLE,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 4 }],
    requiresCraftingTable: false,
    name: "Mesa de Crafteo",
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
    name: "Antorchas",
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
    name: "Antorchas de Azufre Súper",
  },
  {
    id: "bed",
    result: BlockType.BED,
    resultCount: 1,
    ingredients: [
      { type: BlockType.WOOD, count: 3 },
      { type: BlockType.FLOWER_RED, count: 2 }
    ],
    requiresCraftingTable: true,
    name: "Cama Cómoda",
  },
  {
    id: "door",
    result: BlockType.DOOR,
    resultCount: 1,
    ingredients: [{ type: BlockType.WOOD, count: 6 }],
    requiresCraftingTable: true,
    name: "Puerta de Madera",
  },
  {
    id: "obsidian",
    result: BlockType.OBSIDIAN,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 4 },
      { type: BlockType.LAVA, count: 1 }
    ],
    requiresCraftingTable: true,
    name: "Bloque de Obsidiana",
  },
  {
    id: "empty_bucket",
    result: BlockType.BUCKET_EMPTY,
    resultCount: 1,
    ingredients: [{ type: BlockType.STONE, count: 3 }],
    requiresCraftingTable: true,
    name: "Cubeta Metálica",
  },
  {
    id: "copper_block",
    result: BlockType.COPPER_BLOCK,
    resultCount: 1,
    ingredients: [{ type: BlockType.COPPER_ORE, count: 4 }],
    requiresCraftingTable: true,
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
    name: "Bloque de Cobre Oxidado",
  },
  {
    id: "sword",
    result: BlockType.SWORD,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 2 },
      { type: BlockType.WOOD, count: 1 }
    ],
    requiresCraftingTable: true,
    name: "Espada de Combate (Herr.)",
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
    name: "Pico de Minería (Herr.)",
  },
  {
    id: "axe",
    result: BlockType.AXE,
    resultCount: 1,
    ingredients: [
      { type: BlockType.WOOD, count: 3 },
      { type: BlockType.LOG, count: 2 }
    ],
    requiresCraftingTable: true,
    name: "Hacha de Tala (Herr.)",
  },
  {
    id: "shovel",
    result: BlockType.SHOVEL,
    resultCount: 1,
    ingredients: [
      { type: BlockType.STONE, count: 1 },
      { type: BlockType.WOOD, count: 2 }
    ],
    requiresCraftingTable: false,
    name: "Pala de Tierra (Herr.)",
  }
];

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
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [worlds, setWorlds] = useState<World[]>(() => loadWorlds());
  const [currentUser, setCurrentUser] = useState<string | null>(() => getActiveSession());
  const [activeSession, setActiveSessionState] = useState<string | null>(() => getActiveSession());

  const setActiveSession = useCallback((val: string | null) => {
    setActiveSessionPersistence(val);
    setActiveSessionState(val);
  }, []);

  const [currentBlock, setCurrentBlock] = useState<BlockType>(BlockType.WOOD);
  const [playerPos, setPlayerPos] = useState<Vector3D>({ x: 0, y: 80, z: 0 });
  const activePlayerPosRef = useRef<Vector3D>({ x: 0, y: 80, z: 0 });
  const [moveVector, setMoveVector] = useState({ x: 0, y: 0 });
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"break" | "place">(
    "break",
  );
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestion, setSuggestion] = useState<GeminiSuggestion | null>(null);
  const [appState, setAppState] = useState<"login-prompt" | "login" | "menu" | "settings" | "playing" | "worlds-list">(
    getActiveSession() ? "menu" : "login-prompt"
  );
  const [lang, setLang] = useState<Language>("es");
  const [isJumping, setIsJumping] = useState(false);
  const [weather, setWeather] = useState<"clear" | "rain" | "snow" | "thunderstorm" | "snow_rain">("clear");
  const [dimension, setDimension] = useState<"overworld" | "nether">("overworld");
  const [isGameMenuOpen, setIsGameMenuOpen] = useState<boolean>(false);

  // Portal Teleportation cinematic & state
  const [isTeleporting, setIsTeleporting] = useState(false);

  // Friends & Multiplayer states
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [friendSearchEmail, setFriendSearchEmail] = useState("");
  const [friendships, setFriendships] = useState<any[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<Record<string, any>>({});
  const [friendshipError, setFriendshipError] = useState("");
  const [friendshipSuccess, setFriendshipSuccess] = useState("");
  const [friendshipLoading, setFriendshipLoading] = useState(false);

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
  const [devicePreset, setDevicePreset] = useState<"auto" | "redmi" | "funtouch" | "galaxy">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minecraft_device_preset");
      if (saved === "auto" || saved === "redmi" || saved === "funtouch" || saved === "galaxy") {
        return saved as "auto" | "redmi" | "funtouch" | "galaxy";
      }
    }
    return "auto";
  });
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
    aspectRatio: typeof window !== "undefined" ? (window.innerWidth / (window.innerHeight || 1)) : 1.78,
  });
  const { health, food } = useGameState();

  // Active World
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);

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
  const [unlockedWorldsPass, setUnlockedWorldsPass] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("minecraft_unlocked_worlds") === "true";
    }
    return false;
  });
  const [goldCoins, setGoldCoins] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("minecraft_gold_coins");
      return val ? parseInt(val, 10) : 0;
    }
    return 0;
  });
  const [biomeConfig, setBiomeConfig] = useState<{ surface: number; underground: number; flora: number } | null>(null);
  const [activePlayers, setActivePlayers] = useState<Array<{ id: string; name: string; pos: Vector3D; dimension: string }>>([]);
  const [activityLogs, setActivityLogs] = useState<Array<{ id: string; playerEmail: string; playerName: string; action: string; timestamp: number }>>([]);
  const [allUserRolesList, setAllUserRolesList] = useState<Array<{ email: string; role: string; biomeSurface?: number; biomeUnderground?: number; biomeFlora?: number; blocksPlaced?: number; blocksBroken?: number; worldsCreated?: number; score?: number; displayName?: string; lastActive?: number }>>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<"vip_pass" | "unlocked_worlds" | "gold_coins_500" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal" | null>(null);
  const [paymentStep, setPaymentStep] = useState<"idle" | "form" | "processing" | "success">("idle");
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalPassword, setPaypalPassword] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [leaderboardToast, setLeaderboardToast] = useState<string | null>(null);
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const blocksPlacedRef = useRef(0);
  const blocksBrokenRef = useRef(0);

  const isBypassingWorldLimit = userRole === "owner" || userRole === "mod" || userRole === "staff" || userRole === "admin" || vipActive || unlockedWorldsPass;

  const [survivalInventory, setSurvivalInventory] = useState<Record<number, number>>({
    [BlockType.DIRT]: 16,
    [BlockType.WOOD]: 8,
    [BlockType.LOG]: 4,
    [BlockType.CRAFTING_TABLE]: 1,
  });
  const [inventoryTab, setInventoryTab] = useState<"items" | "crafting">("items");

  const getDimensionEdits = useCallback(() => {
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
  }, [currentWorld, dimension]);

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
              "❌ Sintaxis: /tp edge_farlands  o  /tp [X] [Y] [Z]"
            ]);
          }
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          `❌ Comando desconocido "/${cmd}". Intenta: /day, /night, /heal, /gamemode creative`
        ]);
      }
    } else {
      setChatMessages((prev) => [...prev, "💬 [Chat] No hay otros jugadores conectados en este mundo solitario."]);
    }
  };
  const [isCraftingTableActive, setIsCraftingTableActive] = useState<boolean>(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("wood_planks");
  const [worldSearchQuery, setWorldSearchQuery] = useState("");

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [touchControlsMode, setTouchControlsMode] = useState<"auto" | "yes" | "no">("auto");

  const showTouchControls = 
    touchControlsMode === "yes" 
      ? true 
      : touchControlsMode === "no" 
        ? false 
        : (isTouchDevice || isSmallScreen);

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

  const isCompactHeight = screenSize.height < 520;
  const isCompactWidth = screenSize.width < 768;
  const useCompactUI = isCompactHeight || isCompactWidth;

  const uiScaleConfig = (() => {
    switch (activeDevice) {
      case "redmi":
        return {
          name: "Redmi Pad SE 8.7 (5:3)",
          joystickSize: useCompactUI ? 100 : 135,
          jumpButtonSize: useCompactUI ? "w-11 h-11" : "w-16 h-16",
          hotbarScale: useCompactUI ? "scale-[0.8] origin-bottom" : "scale-[1.08] origin-bottom",
          controlPadding: useCompactUI ? "px-3 pb-1.5 pt-0.5" : "px-6 pb-6 pt-2",
          marginClass: useCompactUI ? "mb-1 mx-2 px-1" : "mb-3 mx-4 px-2",
          gapClass: useCompactUI ? "gap-2" : "gap-4",
          fontSize: "text-[10px]",
          badge: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
          desc: "Redmi Pad SE 8.7 (Pantalla compacta 5:3 / 1.67)",
          containerPadding: useCompactUI ? "p-2" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-2.5" : "p-4",
          statsTitle: useCompactUI ? "text-sm" : "text-lg",
          statsText: useCompactUI ? "text-[8px]" : "text-[9px]",
          btnSize: useCompactUI ? "w-9 h-9" : "w-12 h-12",
          btnIcon: useCompactUI ? "text-xs" : "text-base",
        };
      case "funtouch":
        return {
          name: "Funtouch OS 15 (3:2)",
          joystickSize: useCompactUI ? 110 : 165,
          jumpButtonSize: useCompactUI ? "w-12 h-12" : "w-20 h-20",
          hotbarScale: useCompactUI ? "scale-[0.85] origin-bottom" : "scale-[1.18] origin-bottom",
          controlPadding: useCompactUI ? "px-4 pb-2 pt-0.5" : "px-10 pb-8 pt-3",
          marginClass: useCompactUI ? "mb-1.5 mx-3 px-1.5" : "mb-6 mx-8 px-4",
          gapClass: useCompactUI ? "gap-2.5" : "gap-6",
          fontSize: "text-xs",
          badge: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
          desc: "Funtouch OS 15 Tablet (Pantalla grande 3:2 / 1.50)",
          containerPadding: useCompactUI ? "p-2.5" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-3" : "p-4",
          statsTitle: useCompactUI ? "text-sm sm:text-base" : "text-lg",
          statsText: useCompactUI ? "text-[8.5px]" : "text-xs",
          btnSize: useCompactUI ? "w-10 h-10" : "w-12 h-12",
          btnIcon: useCompactUI ? "text-sm" : "text-base",
        };
      case "galaxy":
        return {
          name: "Galaxy A23 (20:9)",
          joystickSize: useCompactUI ? 90 : 120,
          jumpButtonSize: useCompactUI ? "w-10 h-10" : "w-14 h-14",
          hotbarScale: useCompactUI ? "scale-[0.75] origin-bottom" : "scale-[0.92] origin-bottom",
          controlPadding: useCompactUI ? "px-4 pb-1.5 pt-0.5" : "px-12 pb-4 pt-1",
          marginClass: useCompactUI ? "mb-0.5 mx-2 px-0.5" : "mb-2 mx-6 px-1",
          gapClass: useCompactUI ? "gap-1.5" : "gap-3",
          fontSize: "text-[9px]",
          badge: "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30",
          desc: "Galaxy A23 (Ultra panorámico 20:9 / 2.22)",
          containerPadding: useCompactUI ? "p-2" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-2.5" : "p-4",
          statsTitle: useCompactUI ? "text-xs" : "text-base",
          statsText: useCompactUI ? "text-[8px]" : "text-[9px]",
          btnSize: useCompactUI ? "w-8.5 h-8.5" : "w-12 h-12",
          btnIcon: useCompactUI ? "text-[11px]" : "text-base",
        };
      default:
        return {
          name: "Adaptable Auto",
          joystickSize: useCompactUI ? 105 : 150,
          jumpButtonSize: useCompactUI ? "w-11 h-11" : "w-16 h-16",
          hotbarScale: useCompactUI ? "scale-[0.8] origin-bottom" : "scale-100 origin-bottom",
          controlPadding: useCompactUI ? "px-3 pb-1.5 pt-0.5" : "px-6 pb-6 pt-2",
          marginClass: useCompactUI ? "mb-1 mx-2 px-1" : "mb-3 mx-4 px-2",
          gapClass: useCompactUI ? "gap-2.5" : "gap-4",
          fontSize: "text-[10px]",
          badge: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
          desc: "Estándar auto-adaptable y flexible",
          containerPadding: useCompactUI ? "p-2" : "p-4 md:p-6",
          statsPadding: useCompactUI ? "p-2.5" : "p-4",
          statsTitle: useCompactUI ? "text-sm" : "text-lg",
          statsText: useCompactUI ? "text-[8px]" : "text-[9px]",
          btnSize: useCompactUI ? "w-9 h-9" : "w-12 h-12",
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
      // Modern tablet landscape screens and larger widths can also run touch modes
      setIsSmallScreen(window.innerWidth <= 1280);
      
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
        aspectRatio: window.innerWidth / (window.innerHeight || 1),
      });
    };
    checkTouchAndSize();
    window.addEventListener("resize", checkTouchAndSize);
    return () => {
      window.removeEventListener("resize", checkTouchAndSize);
    };
  }, []);

  useEffect(() => {
    if (currentWorld) {
      if ((currentWorld as any).survivalInventory) {
        setSurvivalInventory((currentWorld as any).survivalInventory);
      } else {
        const initialInv = {
          [BlockType.DIRT]: 16,
          [BlockType.WOOD]: 8,
          [BlockType.LOG]: 4,
          [BlockType.CRAFTING_TABLE]: 1,
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
  const [loginError, setLoginError] = useState("");

  // World Creator inputs
  const [worldNameInput, setWorldNameInput] = useState("");
  const [newWorldGameMode, setNewWorldGameMode] = useState<"creative" | "survival" | "adventure" | "spectator">("survival");
  const [newWorldType, setNewWorldType] = useState<"flat" | "normal" | "edge_farlands">("normal");

  const [googleUser, setGoogleUser] = useState<any | null>(null);

  const lookOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setGoogleUser(user);
        setCurrentUser(user.displayName || user.email || "Usuario de Google");
        setActiveSession(user.uid);
        try {
          const dbWorlds = await loadWorldsFromFirestore(user.uid);
          setWorlds(dbWorlds);
        } catch (e) {
          console.error("Error loading worlds from firestore:", e);
        }
        setAppState((prev) => (prev === "login-prompt" || prev === "login" ? "menu" : prev));
      } else {
        setGoogleUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // Activity logging helper
  const logUserActivity = useCallback(async (actionText: string) => {
    if (!auth.currentUser) return;
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
      console.error("Error writing activity log:", err);
      handleFirestoreError(err, OperationType.WRITE, `activity_logs/${logId}`);
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
      setDoc(roleRef, {
        email: emailKey,
        role: "owner",
        displayName: googleUser.displayName || "LionBastias18",
        lastActive: Date.now()
      }, { merge: true }).catch(err => {
        console.error("Error enforcing admin role:", err);
        handleFirestoreError(err, OperationType.WRITE, `user_roles/${emailKey}`);
      });
    } else {
      // For any other user, ensure their metadata is set/updated on login
      setDoc(roleRef, {
        displayName: googleUser.displayName || googleUser.email || emailKey,
        lastActive: Date.now()
      }, { merge: true }).catch(err => {
        console.error("Error updating user metadata:", err);
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
        
        // Sync VIP and Purchase States
        if (data) {
          const isVip = data.vipActive === true;
          const hasPass = data.unlockedWorldsPass === true;
          const coins = typeof data.goldCoins === "number" ? data.goldCoins : 0;
          
          setVipActive(isVip);
          setUnlockedWorldsPass(hasPass);
          setGoldCoins(coins);

          localStorage.setItem("minecraft_vip_active", String(isVip));
          localStorage.setItem("minecraft_unlocked_worlds", String(hasPass));
          localStorage.setItem("minecraft_gold_coins", String(coins));
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
          setUnlockedWorldsPass(false);
          setGoldCoins(0);
          localStorage.setItem("minecraft_vip_active", "false");
          localStorage.setItem("minecraft_unlocked_worlds", "false");
          localStorage.setItem("minecraft_gold_coins", "0");

          // Register user in the database so they show up on the leaderboard
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
            unlockedWorldsPass: false,
            goldCoins: 0
          }, { merge: true }).catch(err => {
            console.error("Error auto-registering user role:", err);
          });
        }
      }
    }, (error) => {
      console.error("Error watching user role:", error);
      handleFirestoreError(error, OperationType.GET, `user_roles/${emailKey}`);
    });

    return () => {
      unsubRole();
    };
  }, [googleUser]);

  // Handle active gameplay presence and multiplayer syncing
  useEffect(() => {
    if (appState !== "playing" || !currentWorld) {
      setActivePlayers([]);
      return;
    }

    const worldId = currentWorld.id;
    const userId = googleUser ? googleUser.uid : activeSession;
    const userEmail = googleUser ? (googleUser.email?.toLowerCase() || "") : "invitado@example.com";
    const userName = googleUser ? (googleUser.displayName || googleUser.email || "Usuario de Google") : `${currentUser || "Invitado"} (Invitado)`;

    if (!userId) return;

    const presenceRef = doc(db, "worlds", worldId, "players", userId);

    // Write presence heartbeat every 3 seconds
    const updatePresence = async () => {
      try {
        const now = Date.now();
        // 1. Write player's local subcollection presence
        await setDoc(presenceRef, {
          id: userId,
          email: userEmail,
          name: userName,
          pos: activePlayerPosRef.current,
          dimension: dimension,
          lastActive: now,
          spectator: currentWorld?.gameMode === "spectator"
        });

        // 2. Also write/refresh global /online_players presence
        const onlinePlayerRef = doc(db, "online_players", userId);
        await setDoc(onlinePlayerRef, {
          id: userId,
          name: userName,
          email: userEmail,
          worldId: worldId,
          worldName: currentWorld.name,
          dimension: dimension,
          lastActive: now,
          spectator: currentWorld?.gameMode === "spectator"
        }, { merge: true });

      } catch (err) {
        console.error("Error writing presence heartbeat:", err);
        handleFirestoreError(err, OperationType.WRITE, `worlds/${worldId}/players/${userId}`);
      }
    };

    updatePresence();
    const intervalId = setInterval(updatePresence, 3000);

    // Listen to presence subcollection
    const playersColRef = collection(db, "worlds", worldId, "players");
    const unsubPlayers = onSnapshot(playersColRef, (snapshot) => {
      const list: any[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Ignore self, dead/inactive heartbeats (> 15 seconds), and invisible spectators
        if (data.id !== userId && (now - (data.lastActive || 0) < 15000) && !data.spectator) {
          list.push({
            id: data.id,
            name: data.name || data.email || "Jugador",
            pos: data.pos || { x: 0, y: 80, z: 0 },
            dimension: data.dimension || "overworld"
          });
        }
      });
      setActivePlayers(list);
    }, (error) => {
      console.error("Error watching world players:", error);
      handleFirestoreError(error, OperationType.LIST, `worlds/${worldId}/players`);
    });

    // Write a join world log
    logUserActivity(`Entró al mundo '${currentWorld.name}' (Generación: ${currentWorld.worldType})`);

    // Clean up presence on unmount / exit playing
    return () => {
      clearInterval(intervalId);
      unsubPlayers();
      deleteDoc(presenceRef).catch(err => {
        console.error("Error removing presence on exit:", err);
      });
      // Delete from online_players as well
      deleteDoc(doc(db, "online_players", userId)).catch(() => {});
      logUserActivity(`Salió del mundo '${currentWorld.name}'`);
    };
  }, [appState, currentWorld?.id, dimension, googleUser, activeSession, currentUser, logUserActivity]);

  // Listen to world edits in real-time for multiplayer
  useEffect(() => {
    if (appState !== "playing" || !currentWorld) return;

    const worldRef = doc(db, "worlds", currentWorld.id);
    const unsubWorld = onSnapshot(worldRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.edits) {
          const dbEdits = data.edits;
          setCurrentWorld((prev) => {
            if (!prev) return prev;
            // Check if there are differences
            let hasDiff = false;
            const prevEditsKeys = Object.keys(prev.edits);
            const dbEditsKeys = Object.keys(dbEdits);
            if (prevEditsKeys.length !== dbEditsKeys.length) {
              hasDiff = true;
            } else {
              for (const key of dbEditsKeys) {
                if (prev.edits[key] !== dbEdits[key]) {
                  hasDiff = true;
                  break;
                }
              }
            }
            if (hasDiff) {
              return {
                ...prev,
                edits: dbEdits
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

  // Main menu and Lobby presence heartbeat
  useEffect(() => {
    if (appState !== "menu" && appState !== "settings" && appState !== "worlds-list") {
      return;
    }
    if (!activeSession) return;

    const updateMenuPresence = async () => {
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
        console.warn("Error updating menu presence:", err);
      }
    };

    updateMenuPresence();
    const intervalId = setInterval(updateMenuPresence, 4000);

    return () => {
      clearInterval(intervalId);
      // Clean up when leaving menu (online_players/{userId} is deleted, unless active playing takes over)
      setTimeout(async () => {
        const latestState = latestSaveDataRef.current;
        if (latestState.appState !== "playing") {
          try {
            await deleteDoc(doc(db, "online_players", activeSession));
          } catch (e) {}
        }
      }, 500);
    };
  }, [appState, activeSession, currentUser, googleUser, lang]);

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
  useEffect(() => {
    latestSaveDataRef.current = { currentWorld, survivalInventory, googleUser, appState };
  }, [currentWorld, survivalInventory, googleUser, appState]);

  const flushUserStats = useCallback(async () => {
    const { googleUser: activeUser } = latestSaveDataRef.current;
    if (!activeUser || !activeUser.email) return;

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
      console.log(`[Stats] Flushed: +${placed} placed, +${broken} broken. Added +${addedScore} score.`);
    } catch (err) {
      console.error("[Stats] Error flushing user stats to Firestore:", err);
      // Restore counts in case of error so we don't lose them
      blocksPlacedRef.current += placed;
      blocksBrokenRef.current += broken;
    }
  }, []);

  // Quiet background auto-save every 30 seconds during active gameplay
  useEffect(() => {
    if (appState !== "playing") return;

    const intervalId = setInterval(async () => {
      const { currentWorld: activeWorld, survivalInventory: activeInv, googleUser: activeUser } = latestSaveDataRef.current;
      if (!activeWorld) return;

      console.log("[Auto-Save] Guardando automáticamente el mundo en segundo plano...");
      const updatedWorld = {
        ...activeWorld,
        playerPos: activePlayerPosRef.current,
        survivalInventory: activeInv,
      };

      if (activeUser) {
        try {
          await saveWorldToFirestore(updatedWorld);
          const dbWorlds = await loadWorldsFromFirestore(activeUser.uid);
          setWorlds(dbWorlds);
          // Flush user stats too!
          await flushUserStats();
        } catch (e) {
          console.error("[Auto-Save] Error al guardar automáticamente en Firestore:", e);
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
    }, 30000);

    return () => clearInterval(intervalId);
  }, [appState]);

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
    try {
      resumeAudio();
      setLoginError("");
      await loginWithGoogle();
    } catch (e) {
      console.error(e);
      setLoginError("Error al iniciar sesión con Google");
    }
  };

  const handleChooseGuest = () => {
    resumeAudio();
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
    setLoginError("");
    setAppState("login");
  };

  const handleLogout = async () => {
    resumeAudio();
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
    setWorlds(loadWorlds()); // Reset to offline worlds
    setAppState("login-prompt");
  };

  const handleLoginOrRegister = (e: React.FormEvent) => {
    e.preventDefault();
    resumeAudio();
    const cleanUser = usernameInput.trim();
    if (!cleanUser) {
      setLoginError(dict[lang].enter_username_warn);
      return;
    }

    const existingProfile = profiles.find(
      (p) => p.username.toLowerCase() === cleanUser.toLowerCase(),
    );
    if (existingProfile) {
      if (existingProfile.pin && existingProfile.pin !== pinInput) {
        setLoginError(dict[lang].wrong_pin);
        return;
      }
    } else {
      const newProfile: Profile = {
        username: cleanUser,
        pin: pinInput,
      };
      const updatedProv = [...profiles, newProfile];
      setProfiles(updatedProv);
      saveProfiles(updatedProv);
    }

    setCurrentUser(cleanUser);
    setActiveSession(cleanUser);
    setLoginError("");
    setAppState("menu");
  };

  const handleCreateWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    resumeAudio();

    if (worlds.length >= 70 && !isBypassingWorldLimit) {
      setChatMessages((p) => [...p, "❌ Límite de 70 mundos alcanzado. Por favor elimina algún mundo antes de continuar."]);
      return;
    }

    const creator = googleUser ? googleUser.uid : (currentUser || "Invitado");
    const creatorName = googleUser ? (googleUser.displayName || googleUser.email) : (currentUser || "Invitado");
    const name = worldNameInput.trim() || dict[lang].new_world_default;

    const initialInv = {
      [BlockType.DIRT]: 16,
      [BlockType.WOOD]: 8,
      [BlockType.LOG]: 4,
      [BlockType.CRAFTING_TABLE]: 1,
    };

    const newWorld: World = {
      id: `world_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: name,
      creator: creator,
      creatorName: creatorName || undefined,
      createdAt: Date.now(),
      playerPos: { x: 0, y: newWorldType === "flat" ? 58 : 80, z: 0 },
      gameMode: newWorldGameMode,
      worldType: newWorldType,
      edits: {},
      survivalInventory: initialInv
    };

    if (googleUser) {
      try {
        await saveWorldToFirestore(newWorld);
        const dbWorlds = await loadWorldsFromFirestore(googleUser.uid);
        setWorlds(dbWorlds);
      } catch (e) {
        console.error("Error saving new world to firestore:", e);
      }
    } else {
      const nextWorlds = [...worlds, newWorld];
      setWorlds(nextWorlds);
      saveWorlds(nextWorlds);
    }

    setWorldNameInput("");
    setSurvivalInventory(initialInv);
    setCurrentWorld(newWorld);
    setPlayerPos({ x: 0, y: newWorldType === "flat" ? 58 : 80, z: 0 });
    setAppState("playing");
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

  const handleCraft = (recipe: CraftingRecipe) => {
    // Verify ingredients
    let hasAll = true;
    for (const ing of recipe.ingredients) {
      if ((survivalInventory[ing.type] || 0) < ing.count) {
        hasAll = false;
        break;
      }
    }

    if (!hasAll) return;

    // Deduct ingredients and add resulting item to inventory
    setSurvivalInventory((prev) => {
      const next = { ...prev };
      for (const ing of recipe.ingredients) {
        next[ing.type] = (next[ing.type] || 0) - ing.count;
      }
      next[recipe.result] = (next[recipe.result] || 0) + recipe.resultCount;

      if (currentWorld) {
        (currentWorld as any).survivalInventory = next;
      }
      return next;
    });
  };

  const handleBlockEdit = useCallback(
    (x: number, y: number, z: number, blockType: BlockType, oldBlockType?: BlockType) => {
      if (!currentWorld) return;

      if (blockType === BlockType.AIR) {
        blocksBrokenRef.current += 1;
      } else {
        blocksPlacedRef.current += 1;
      }

      const actName = blockType === BlockType.AIR ? "Destruyó bloque" : `Colocó bloque de ${BLOCK_NAMES[blockType] || blockType}`;
      logUserActivity(`${actName} en coord [X: ${x}, Y: ${y}, Z: ${z}] (${dimension === "nether" ? "Nether" : "Overworld"})`);

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
          setSurvivalInventory((prev) => {
            const nextCount = (prev[blockType] || 0) - 1;
            const next = {
              ...prev,
              [blockType]: Math.max(0, nextCount),
            };

            if (nextCount <= 0 && currentBlock === blockType) {
              const another = Object.keys(next).map(Number).find((k) => next[k] > 0);
              if (another) {
                setCurrentBlock(another);
              }
            }

            (currentWorld as any).survivalInventory = next;
            return next;
          });
        }
      }

      const editKey = dimension === "nether" ? `nether:${x},${y},${z}` : `${x},${y},${z}`;

      setCurrentWorld((prev) => {
        if (!prev) return prev;
        const updatedEdits = { ...prev.edits };

        // Helper to get block in the local copy of edits
        const getLocalBlockAt = (bx: number, by: number, bz: number) => {
          const key = dimension === "nether" ? `nether:${bx},${by},${bz}` : `${bx},${by},${bz}`;
          return updatedEdits[key] ?? BlockType.AIR;
        };

        const setLocalBlockAt = (bx: number, by: number, bz: number, type: BlockType) => {
          const key = dimension === "nether" ? `nether:${bx},${by},${bz}` : `${bx},${by},${bz}`;
          if (type === BlockType.AIR) {
            delete updatedEdits[key];
          } else {
            updatedEdits[key] = type;
          }
        };

        // Standard edit update first
        if (blockType === BlockType.AIR) {
          updatedEdits[editKey] = BlockType.AIR;
        } else {
          updatedEdits[editKey] = blockType;
        }

        // 1. Check if any portal frame is completed/valid in the neighborhood of (x, y, z)
        let portalCreated = false;
        // Search in a small box around the edited block
        for (let tx = x - 3; tx <= x + 3; tx++) {
          for (let ty = y - 3; ty <= y + 3; ty++) {
            for (let tz = z - 3; tz <= z + 3; tz++) {
              // Try X-aligned frame starting at (tx, ty, tz)
              if (isFrameValidX(tx, ty, tz, getLocalBlockAt)) {
                // Fill the 6 inner blocks
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
              // Try Z-aligned frame starting at (tx, ty, tz)
              if (isFrameValidZ(tx, ty, tz, getLocalBlockAt)) {
                // Fill the 6 inner blocks
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

        // 2. Always check and revalidate existing portal blocks in a neighborhood of (x, y, z)
        // If they are no longer part of a valid frame, break them (set to AIR)
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

        const updatedWorld = {
          ...prev,
          edits: updatedEdits,
          survivalInventory: (prev as any).survivalInventory
        };

        // Sync edits to Firestore in real-time so other players see them instantly!
        if (db) {
          updateDoc(doc(db, "worlds", prev.id), { edits: updatedEdits }).catch((err) => {
            console.warn("Error syncing block edits to Firestore:", err);
          });
        }

        setWorlds((allWorlds) => {
          const next = allWorlds.map((w) =>
            w.id === prev.id ? updatedWorld : w,
          );
          if (!googleUser) {
            saveWorlds(next);
          }
          return next;
        });

        return updatedWorld;
      });
    },
    [currentWorld, googleUser, currentBlock, dimension],
  );

  const handleManualSave = async () => {
    if (!currentWorld) return;
    
    const updatedWorld = {
      ...currentWorld,
      playerPos: activePlayerPosRef.current,
      survivalInventory: survivalInventory,
    };

    if (googleUser) {
      try {
        await saveWorldToFirestore(updatedWorld);
        const dbWorlds = await loadWorldsFromFirestore((googleUser as any).uid);
        setWorlds(dbWorlds);
      } catch (e) {
        console.error("Error saving world to firestore manually:", e);
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
    setScreenshotToast(lang === "es" ? "¡Mundo guardado con éxito!" : "World saved successfully!");
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

  const handleSaveAndExit = async () => {
    if (currentWorld) {
      const updatedWorld = {
        ...currentWorld,
        playerPos: activePlayerPosRef.current,
        survivalInventory: survivalInventory,
      };

      if (googleUser) {
        try {
          await saveWorldToFirestore(updatedWorld);
          const dbWorlds = await loadWorldsFromFirestore(googleUser.uid);
          setWorlds(dbWorlds);
          await flushUserStats();
        } catch (e) {
          console.error("Error saving world to firestore on exit:", e);
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
    }
    resumeAudio();
    setAppState("menu");
    setCurrentWorld(null);
  };

  const userWorlds = worlds.filter((w) => {
    if (googleUser) {
      return (
        w.creator.toLowerCase() === googleUser.uid.toLowerCase() ||
        w.creator.toLowerCase() === (currentUser || "").toLowerCase()
      );
    } else {
      return w.creator.toLowerCase() === (currentUser || "Invitado").toLowerCase();
    }
  });
  const lastTouchPos = useRef<{ x: number; y: number; id: number } | null>(
    null,
  );

  const isCreativeMode = (currentWorld?.gameMode as string) === "creative" || (currentWorld?.gameMode as string) === "creativo";

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
      ]
    : Object.keys(survivalInventory)
        .map(Number)
        .filter((k) => survivalInventory[k] > 0);

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
      setMoveVector(prev => (prev.x !== 0 || prev.y !== 0) ? { x: 0, y: 0 } : prev);
      setIsJumping(prev => prev ? false : prev);
      setDimension("overworld");
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

      setMoveVector(prev => {
        if (prev.x === left && prev.y === forward) return prev;
        return { x: left, y: forward };
      });
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
      setMoveVector(prev => (prev.x !== 0 || prev.y !== 0) ? { x: 0, y: 0 } : prev);
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
      setPlayerPos(newPos);
    }
  }, []);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    resumeAudio();
    if ("changedTouches" in e) {
      const touch = e.changedTouches[0];
      lastTouchPos.current = {
        x: touch.clientX,
        y: touch.clientY,
        id: touch.identifier,
      };
    } else {
      lastTouchPos.current = {
        x: (e as React.MouseEvent).clientX,
        y: (e as React.MouseEvent).clientY,
        id: -1,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!lastTouchPos.current) return;

    let clientX, clientY;
    if ("changedTouches" in e) {
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
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    lookOffsetRef.current.x += clientX - lastTouchPos.current.x;
    lookOffsetRef.current.y += clientY - lastTouchPos.current.y;

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
    } else {
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

  const handleCaptureScreenshot = () => {
    resumeAudio();
    const container = document.getElementById("voxel-canvas");
    const canvas = (container?.tagName === "CANVAS" 
      ? container 
      : container?.querySelector("canvas") || document.querySelector("canvas")) as HTMLCanvasElement | null;
    
    if (canvas) {
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

        // Capture frame as image
        const dataUrl = canvas.toDataURL("image/png");
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

  if (appState === "login-prompt") {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 relative overflow-y-auto">
        {/* Tiled Minecraft-style Dirt/Stone elegant dark overlay */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #000 10%, transparent 10%), radial-gradient(circle, #000 10%, transparent 10%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px"
          }}
        />

        {/* Sky gradient background lights */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full filter blur-[120px] pointer-events-none" />

        {/* Decorative blocks behind menu */}
        <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-wrap gap-4 p-8 justify-center items-center overflow-hidden">
          {[...Array(24)].map((_, i) => {
            const colors = ["#059669", "#92400e", "#3f3f46", "#52525b"];
            const color = colors[i % colors.length];
            const rotation = (i * 27) % 360;
            const size = 12 + (i * 7) % 16;
            return (
              <div
                key={i}
                className="rounded-lg shadow-xl shrink-0"
                style={{
                  width: `${size * 4}px`,
                  height: `${size * 4}px`,
                  backgroundColor: color,
                  transform: `rotate(${rotation}deg)`
                }}
              />
            );
          })}
        </div>

        <div className="z-10 bg-black/75 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/20 flex flex-col items-center shadow-2xl max-w-md w-full my-auto">
          <h1 className="text-white text-4xl sm:text-5xl font-bold minecraft-font uppercase tracking-tighter mb-4 text-center drop-shadow-lg leading-none">
            {t.menu_title} <span className="text-emerald-400">{t.menu_subtitle}</span>
          </h1>

          <p className="text-white/80 text-center text-sm md:text-base mt-2 mb-8 minecraft-font font-medium leading-relaxed">
            {t.login_prompt}
          </p>

          <div className="flex flex-col w-full gap-4">
            {/* Google Login button */}
            <button
              onClick={handleGoogleLogin}
              className="bg-white hover:bg-zinc-100 text-zinc-900 font-bold py-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 text-center flex items-center justify-center gap-2 border border-zinc-200"
            >
              <i className="fab fa-google text-red-500 text-base" /> {t.login_google}
            </button>

            <button
              onClick={handleChooseSignIn}
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all active:scale-95 text-center flex items-center justify-center gap-2"
            >
              <i className="fas fa-lock text-sm" /> {t.option_sign_in}
            </button>

            <button
              onClick={handleChooseGuest}
              className="bg-zinc-800 hover:bg-zinc-700 text-white/90 font-bold py-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider shadow-lg border border-white/10 transition-all active:scale-95 text-center flex items-center justify-center gap-2"
            >
              <i className="fas fa-user-secret text-sm" /> {t.option_guest}
            </button>
          </div>
          
          <div className="text-white/35 font-mono text-[9px] mt-6 select-none uppercase tracking-widest text-center border-t border-white/5 pt-4 w-full">
            alpha Mobile 1.0.2
          </div>
        </div>
      </div>
    );
  }

  if (appState === "login") {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 relative overflow-y-auto">
        {/* Tiled Minecraft-style Dirt/Stone elegant dark overlay */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #000 10%, transparent 10%), radial-gradient(circle, #000 10%, transparent 10%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px"
          }}
        />

        {/* Sky gradient background lights */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full filter blur-[120px] pointer-events-none" />

        {/* Decorative blocks behind menu */}
        <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-wrap gap-4 p-8 justify-center items-center overflow-hidden">
          {[...Array(24)].map((_, i) => {
            const colors = ["#059669", "#92400e", "#3f3f46", "#52525b"];
            const color = colors[i % colors.length];
            const rotation = (i * 27) % 360;
            const size = 12 + (i * 7) % 16;
            return (
              <div
                key={i}
                className="rounded-lg shadow-xl shrink-0"
                style={{
                  width: `${size * 4}px`,
                  height: `${size * 4}px`,
                  backgroundColor: color,
                  transform: `rotate(${rotation}deg)`
                }}
              />
            );
          })}
        </div>

        <div className="z-10 bg-black/75 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/20 flex flex-col items-center shadow-2xl max-w-sm w-full my-auto">
          <h2 className="text-white text-3xl font-bold minecraft-font uppercase tracking-tighter mb-4 text-center drop-shadow-lg font-bold">
            {t.option_sign_in}
          </h2>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-zinc-100 text-zinc-900 font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 text-center flex items-center justify-center gap-2 mb-4 border border-zinc-200 shadow-md"
          >
            <i className="fab fa-google text-red-500 text-sm" /> {t.login_google}
          </button>

          <div className="w-full flex items-center gap-2 mb-4">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold">o / or</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          <form onSubmit={handleLoginOrRegister} className="flex flex-col w-full gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.username}
              </label>
              <input
                type="text"
                placeholder={t.username}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-emerald-400 font-bold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.pin} <span className="text-[8px] text-zinc-500 font-normal">({t.optional})</span>
              </label>
              <input
                type="password"
                placeholder="1234"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-emerald-400 tracking-widest font-bold"
              />
            </div>

            {loginError && (
              <p className="text-red-400 text-xs font-bold font-mono text-center mt-1">
                <i className="fas fa-circle-exclamation mr-1" />
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5 rounded-xl text-center uppercase tracking-wider transition-all active:scale-95 mt-2 shadow-lg shadow-emerald-500/15 text-xs sm:text-sm"
            >
              {t.register_btn}
            </button>

            <button
              type="button"
              onClick={() => setAppState("login-prompt")}
              className="bg-zinc-800 hover:bg-zinc-700 text-white/70 font-semibold py-2 rounded-xl text-center text-xs uppercase transition-all"
            >
              {t.back}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (appState === "worlds-list") {
    const filteredWorlds = userWorlds.filter((w) =>
      w.name.toLowerCase().includes(worldSearchQuery.toLowerCase())
    );

    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-8 relative overflow-y-auto">
        {/* Tiled Minecraft-style Dirt/Stone elegant dark overlay */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #000 10%, transparent 10%), radial-gradient(circle, #000 10%, transparent 10%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px"
          }}
        />
        
        {/* Sky gradient background lights */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full filter blur-[120px] pointer-events-none" />

        <div className="z-10 bg-zinc-950/90 backdrop-blur-2xl p-6 sm:p-8 rounded-[32px] border border-white/10 flex flex-col w-full max-w-4xl shadow-3xl my-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-white/5 pb-4">
            <div>
              <h2 className="text-white text-3xl font-extrabold minecraft-font tracking-tighter uppercase flex items-center gap-2">
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
            <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-full shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs uppercase font-mono font-bold text-emerald-300">
                {currentUser || "Invitado"}
              </span>
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

                {worlds.length >= 70 && !isBypassingWorldLimit && (
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
                  disabled={worlds.length >= 70 && !isBypassingWorldLimit}
                  className={`font-bold py-3.5 rounded-xl text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-2 mt-2 ${
                    worlds.length >= 70 && !isBypassingWorldLimit
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
      </div>
    );
  }

  const handleJoinFriendWorld = async (worldId: string) => {
    try {
      setIsFriendsOpen(false);
      setFriendshipLoading(true);
      const worldSnap = await getDoc(doc(db, "worlds", worldId));
      if (worldSnap.exists()) {
        const worldData = worldSnap.data() as World;
        setCurrentWorld(worldData);
        setAppState("playing");
        setChatMessages((p) => [...p, `¡Te uniste al mundo de tu amigo: '${worldData.name}'! 🌍`]);
      } else {
        setFriendshipError("El mundo del amigo ya no está disponible o es privado.");
      }
    } catch (err) {
      console.error(err);
      setFriendshipError("Error al unirse al mundo del amigo.");
    } finally {
      setFriendshipLoading(false);
    }
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
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100020] flex items-center justify-center p-4 overflow-y-auto pointer-events-auto text-left animate-in fade-in duration-200"
      >
        <div className="bg-zinc-900 border-4 border-purple-600 p-6 sm:p-8 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col gap-4 relative text-white font-sans max-h-[90vh]">
          
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
                              onClick={() => handleJoinFriendWorld(onlineData.worldId)}
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

  const handlePurchaseComplete = async () => {
    setPaymentStep("processing");
    // Simulate multi-step secure processing logs
    await new Promise((resolve) => setTimeout(resolve, 1600));

    const txId = "TX-" + Date.now().toString().substring(4) + "-" + Math.floor(Math.random() * 1000);
    setTransactionId(txId);

    const emailKey = googleUser ? (googleUser.email?.toLowerCase() || "") : "invitado@example.com";
    const prodId = selectedProduct;
    let prodName = "";
    let price = 0;

    if (prodId === "vip_pass") {
      prodName = lang === "es" ? "Rango VIP Premium" : "VIP Premium Rank";
      price = 4.99;
    } else if (prodId === "unlocked_worlds") {
      prodName = lang === "es" ? "Desbloqueador de Mundos" : "World Expander Pass";
      price = 2.99;
    } else if (prodId === "gold_coins_500") {
      prodName = lang === "es" ? "Saco de 500 Monedas de Oro" : "Sack of 500 Gold Coins";
      price = 1.99;
    }

    const isFree = userRole === "owner" || userRole === "mod" || userRole === "staff" || userRole === "admin";
    const finalPrice = isFree ? 0 : price;

    try {
      if (googleUser && emailKey) {
        // Authenticated user: store in Firestore
        const purchaseRef = doc(db, "user_purchases", txId);
        await setDoc(purchaseRef, {
          id: txId,
          email: emailKey,
          productId: prodId,
          productName: prodName,
          price: finalPrice,
          timestamp: Date.now(),
          status: "completed"
        });

        const roleRef = doc(db, "user_roles", emailKey);
        if (prodId === "vip_pass") {
          await setDoc(roleRef, { vipActive: true }, { merge: true });
          setVipActive(true);
          localStorage.setItem("minecraft_vip_active", "true");
        } else if (prodId === "unlocked_worlds") {
          await setDoc(roleRef, { unlockedWorldsPass: true }, { merge: true });
          setUnlockedWorldsPass(true);
          localStorage.setItem("minecraft_unlocked_worlds", "true");
        } else if (prodId === "gold_coins_500") {
          const newCoins = goldCoins + 500;
          await setDoc(roleRef, { goldCoins: newCoins }, { merge: true });
          setGoldCoins(newCoins);
          localStorage.setItem("minecraft_gold_coins", String(newCoins));
        }
      } else {
        // Guest user local storage fallback
        if (prodId === "vip_pass") {
          setVipActive(true);
          localStorage.setItem("minecraft_vip_active", "true");
        } else if (prodId === "unlocked_worlds") {
          setUnlockedWorldsPass(true);
          localStorage.setItem("minecraft_unlocked_worlds", "true");
        } else if (prodId === "gold_coins_500") {
          const newCoins = goldCoins + 500;
          setGoldCoins(newCoins);
          localStorage.setItem("minecraft_gold_coins", String(newCoins));
        }
      }

      // Play level-up audio arpeggio
      playPurchaseChime();

      // Send to chat
      const claimText = isFree 
        ? (lang === "es" ? `gratis gracias a tu rango de ${userRole.toUpperCase()}` : `for free thanks to your ${userRole.toUpperCase()} rank`)
        : (lang === "es" ? `con éxito` : `successfully`);
      setChatMessages((p) => [
        ...p,
        `🛍️ [Tienda] ¡Adquisición de ${prodName} completada ${claimText}! Transacción: ${txId}. ¡Gracias por tu confianza!`
      ]);

      setPaymentStep("success");
    } catch (err: any) {
      console.error("Firestore purchase error (falling back to local cache):", err);
      // Fallback
      if (prodId === "vip_pass") {
        setVipActive(true);
        localStorage.setItem("minecraft_vip_active", "true");
      } else if (prodId === "unlocked_worlds") {
        setUnlockedWorldsPass(true);
        localStorage.setItem("minecraft_unlocked_worlds", "true");
      } else if (prodId === "gold_coins_500") {
        const newCoins = goldCoins + 500;
        setGoldCoins(newCoins);
        localStorage.setItem("minecraft_gold_coins", String(newCoins));
      }
      playPurchaseChime();
      setPaymentStep("success");
    }
  };

  const renderShopModal = () => {
    if (!isShopOpen) return null;

    const isFreeForMe = userRole === "owner" || userRole === "mod" || userRole === "staff" || userRole === "admin";

    // Products definition
    const products = [
      {
        id: "vip_pass" as const,
        name: lang === "es" ? "Pase VIP Premium" : "VIP Premium Rank",
        price: "$4.99 USD",
        priceVal: 4.99,
        desc: lang === "es" 
          ? "Obtén un rango VIP. Desbloquea un tag ✨ VIP dorado en el chat, tu nombre en color oro, y la capacidad de crear mundos ilimitados para siempre."
          : "Unlock VIP Rank. Grants a sparkling gold ✨ VIP chat prefix, gold-colored name, and infinite worlds creation forever.",
        icon: "fa-crown text-yellow-400",
        bg: "from-amber-500/10 to-yellow-500/5 border-yellow-500/30",
        active: vipActive
      },
      {
        id: "unlocked_worlds" as const,
        name: lang === "es" ? "Mundoramas Ilimitados" : "Unlimited Worlds Pass",
        price: "$2.99 USD",
        priceVal: 2.99,
        desc: lang === "es"
          ? "Elimina permanentemente el límite restrictivo de 70 mundos. Crea tantas tierras infinitas como quieras sin tener que borrar tus obras antiguas."
          : "Permanently removes the 70 worlds creation limit. Construct unlimited lands without deleting any of your older memories.",
        icon: "fa-infinity text-emerald-400",
        bg: "from-emerald-500/10 to-teal-500/5 border-emerald-500/30",
        active: unlockedWorldsPass || vipActive
      },
      {
        id: "gold_coins_500" as const,
        name: lang === "es" ? "Saco de 500 Monedas de Oro" : "Sack of 500 Gold Coins",
        price: "$1.99 USD",
        priceVal: 1.99,
        desc: lang === "es"
          ? "Adquiere un saco rebosante con 500 Monedas de Oro utilizables para futuros desbloqueos visuales y para presumir tu riqueza."
          : "Receive a sack containing 500 gleaming Gold Coins. Perfect for showing off in chat or future cosmetic expansion updates.",
        icon: "fa-coins text-amber-500",
        bg: "from-amber-600/10 to-yellow-600/5 border-amber-600/30",
        active: false // Can buy multiple times
      }
    ];

    const currentSelected = products.find(p => p.id === selectedProduct);

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
        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100010] flex items-center justify-center p-3 sm:p-4 overflow-y-auto pointer-events-auto text-left"
      >
        <div className="bg-zinc-900 border-4 border-amber-500 p-5 sm:p-7 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200 text-white font-sans max-h-[92vh] overflow-y-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-zinc-700/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/40 animate-pulse">
                <i className="fas fa-shopping-cart text-amber-400 text-xl" />
              </div>
              <div>
                <h2 className="text-2xl font-black minecraft-font uppercase tracking-wide text-amber-400 flex items-center gap-2">
                  {lang === "es" ? "TIENDA VIP PREMIUM" : "PREMIUM VIP SHOP"}
                </h2>
                <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider font-bold">
                  {lang === "es" ? "Expansiones de Cuenta e Infinite World Pass" : "Account Expansions and Passes"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Coin Counter */}
              <div className="bg-zinc-950 border border-yellow-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-inner">
                <span className="text-[13px] animate-bounce">🪙</span>
                <span className="text-xs font-mono font-black text-yellow-400">{goldCoins}</span>
                <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">{lang === "es" ? "MONEDAS" : "COINS"}</span>
              </div>

              <button
                onClick={() => {
                  setIsShopOpen(false);
                  setSelectedProduct(null);
                  setPaymentMethod(null);
                  setPaymentStep("idle");
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center border border-zinc-700 transition"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {/* Special Staff Role Notice */}
          {isFreeForMe && (
            <div className="bg-gradient-to-r from-yellow-500/20 via-amber-500/10 to-yellow-600/20 border-2 border-yellow-500/40 rounded-xl p-3 flex items-center gap-3.5 shadow-lg">
              <span className="text-2xl animate-spin" style={{ animationDuration: "3s" }}>🛡️</span>
              <div className="text-left">
                <p className="text-yellow-400 text-[10px] font-black uppercase tracking-widest font-mono">
                  {lang === "es" ? "Privilegio de Rango Activo" : "Active Rank Privilege"}
                </p>
                <p className="text-xs text-zinc-200 leading-normal">
                  {lang === "es" 
                    ? `Tienes el rango de "${userRole.toUpperCase()}". En este modo todas las compras se consideran de prueba y son 100% GRATUITAS para ti.`
                    : `You have the "${userRole.toUpperCase()}" staff role. All shop packages are 100% FREE of charge for your account.`
                  }
                </p>
              </div>
            </div>
          )}

          {paymentStep === "idle" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
              {products.map((p) => {
                const canClaimForFree = isFreeForMe;
                return (
                  <div 
                    key={p.id} 
                    className={`bg-zinc-950/40 border-2 ${p.bg} rounded-2xl p-5 flex flex-col justify-between hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-xl`}
                  >
                    <div className="text-left flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="w-11 h-11 bg-zinc-900 border border-white/5 rounded-xl flex items-center justify-center shadow-md">
                          <i className={`fas ${p.icon} text-lg`} />
                        </div>
                        {p.active ? (
                          <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[8px] font-black px-2 py-0.5 rounded-full tracking-wider uppercase font-mono">
                            {lang === "es" ? "Adquirido" : "Owned"}
                          </span>
                        ) : canClaimForFree ? (
                          <span className="bg-yellow-500 text-zinc-950 text-[8px] font-black px-2 py-0.5 rounded-full tracking-wider uppercase font-mono animate-bounce">
                            {lang === "es" ? "¡GRATIS!" : "FREE!"}
                          </span>
                        ) : (
                          <span className="bg-zinc-900 border border-white/10 text-white font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            {p.price}
                          </span>
                        )}
                      </div>
                      
                      <div>
                        <h3 className="text-base font-black tracking-tight text-white uppercase">{p.name}</h3>
                        <p className="text-[10.5px] text-zinc-400 mt-1.5 leading-relaxed">{p.desc}</p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-white/5">
                      {p.active ? (
                        <button 
                          disabled 
                          className="w-full bg-zinc-800 text-zinc-500 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-not-allowed border border-white/5"
                        >
                          {lang === "es" ? "Ya Adquirido" : "Already Owned"}
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedProduct(p.id);
                            if (canClaimForFree) {
                              setPaymentStep("form");
                            } else {
                              setPaymentStep("form");
                              setPaymentMethod("card"); // Default to Credit Card
                            }
                          }}
                          className={`w-full font-black py-2.5 px-4 rounded-xl text-xs uppercase tracking-widest transition-all ${
                            canClaimForFree
                              ? "bg-yellow-500 hover:bg-yellow-400 text-zinc-950 shadow-md shadow-yellow-500/10 animate-pulse"
                              : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/10"
                          }`}
                        >
                          {canClaimForFree 
                            ? (lang === "es" ? "Reclamar Gratis" : "Claim for Free")
                            : (lang === "es" ? "Comprar Ahora" : "Buy Now")
                          }
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* PAYMENT PROCESSOR STAGE */
            <div className="bg-zinc-950 p-4 sm:p-6 rounded-2xl border border-zinc-800 flex flex-col gap-5 relative overflow-hidden min-h-[360px] justify-center">
              
              {paymentStep === "form" && (
                <div className="flex flex-col gap-4 text-left">
                  {/* Step Header */}
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5">
                    <button 
                      onClick={() => {
                        setPaymentStep("idle");
                        setPaymentMethod(null);
                      }}
                      className="text-zinc-400 hover:text-white text-xs flex items-center gap-1 uppercase font-bold"
                    >
                      <i className="fas fa-arrow-left" /> {lang === "es" ? "Atrás" : "Back"}
                    </button>
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-bold block">{lang === "es" ? "PAQUETE SELECCIONADO" : "SELECTED PACKAGE"}</span>
                      <span className="text-sm font-black text-amber-400 uppercase font-mono">{currentSelected?.name}</span>
                    </div>
                  </div>

                  {isFreeForMe ? (
                    /* Claim Free confirmation panel */
                    <div className="flex flex-col gap-4 py-4 items-center justify-center text-center max-w-md mx-auto">
                      <div className="w-16 h-16 bg-yellow-500/10 border-2 border-yellow-400 rounded-full flex items-center justify-center text-2xl text-yellow-400 animate-bounce">
                        👑
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white uppercase">{lang === "es" ? "Confirmar Reclamo Gratis" : "Confirm Free Claim"}</h3>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          {lang === "es"
                            ? `Como eres "${userRole.toUpperCase()}", puedes activar este pase sin costo. No se requerirá tarjeta de crédito o método de pago.`
                            : `As a "${userRole.toUpperCase()}", you can unlock this pass completely free of charge. No billing details are required.`
                          }
                        </p>
                      </div>

                      <button
                        onClick={handlePurchaseComplete}
                        className="w-full max-w-xs mt-3 bg-gradient-to-r from-yellow-500 to-amber-600 text-zinc-950 font-black py-3 rounded-xl text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-yellow-500/10"
                      >
                        {lang === "es" ? "¡Confirmar Reclamo!" : "Confirm Claim!"}
                      </button>
                    </div>
                  ) : (
                    /* Regular billing form */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      
                      {/* Left: Payment Method + Forms */}
                      <div className="lg:col-span-7 flex flex-col gap-4">
                        
                        {/* Selector tabs */}
                        <div className="grid grid-cols-2 gap-2 bg-zinc-900 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => setPaymentMethod("card")}
                            className={`py-2 px-3 rounded-lg text-xs uppercase font-extrabold tracking-wider text-center transition-all flex items-center justify-center gap-1.5 ${
                              paymentMethod === "card"
                                ? "bg-amber-500 text-zinc-950 font-black"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            <i className="fas fa-credit-card text-xs" />
                            {lang === "es" ? "Tarjeta" : "Card"}
                          </button>
                          <button
                            onClick={() => setPaymentMethod("paypal")}
                            className={`py-2 px-3 rounded-lg text-xs uppercase font-extrabold tracking-wider text-center transition-all flex items-center justify-center gap-1.5 ${
                              paymentMethod === "paypal"
                                ? "bg-blue-600 text-white font-black"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            <i className="fab fa-paypal text-xs" />
                            PayPal
                          </button>
                        </div>

                        {paymentMethod === "card" ? (
                          /* Credit Card input form */
                          <div className="flex flex-col gap-3 mt-1 text-left">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{lang === "es" ? "Número de Tarjeta" : "Card Number"}</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="4111 2222 3333 4444"
                                  maxLength={19}
                                  value={cardForm.number}
                                  onChange={(e) => {
                                    const formatted = e.target.value
                                      .replace(/\s+/g, "")
                                      .replace(/[^0-9]/gi, "")
                                      .replace(/(\d{4})/g, "$1 ")
                                      .trim();
                                    setCardForm({ ...cardForm, number: formatted });
                                  }}
                                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 py-2.5 pl-3 pr-10 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                                />
                                <i className="fas fa-credit-card absolute right-3.5 top-3.5 text-zinc-600" />
                              </div>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{lang === "es" ? "Nombre del Titular" : "Cardholder Name"}</label>
                              <input
                                type="text"
                                placeholder="LIONEL BASTIAS"
                                value={cardForm.name}
                                onChange={(e) => setCardForm({ ...cardForm, name: e.target.value.toUpperCase() })}
                                className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 py-2.5 px-3 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/20 uppercase"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{lang === "es" ? "Vencimiento" : "Expiration"}</label>
                                <input
                                  type="text"
                                  placeholder="MM/YY"
                                  maxLength={5}
                                  value={cardForm.expiry}
                                  onChange={(e) => {
                                    let v = e.target.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
                                    if (v.length >= 2) {
                                      v = v.substring(0, 2) + "/" + v.substring(2, 4);
                                    }
                                    setCardForm({ ...cardForm, expiry: v });
                                  }}
                                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 py-2.5 px-3 rounded-xl text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">CVV</label>
                                <input
                                  type="password"
                                  placeholder="123"
                                  maxLength={4}
                                  value={cardForm.cvv}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/gi, "");
                                    setCardForm({ ...cardForm, cvv: val });
                                  }}
                                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 py-2.5 px-3 rounded-xl text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                if (cardForm.number.length < 15 || cardForm.name.length < 3 || cardForm.expiry.length < 5 || cardForm.cvv.length < 3) {
                                  alert(lang === "es" ? "Por favor rellene los datos de tarjeta correctamente." : "Please fill out all card fields properly.");
                                  return;
                                }
                                handlePurchaseComplete();
                              }}
                              className="w-full mt-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg"
                            >
                              {lang === "es" ? `Completar Pago Seguro de ${currentSelected?.price}` : `Pay Securely ${currentSelected?.price}`}
                            </button>
                          </div>
                        ) : (
                          /* PayPal portal form */
                          <div className="flex flex-col gap-4 mt-2 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-left">
                            <div className="flex items-center gap-1.5 border-b border-blue-500/20 pb-2">
                              <i className="fab fa-paypal text-blue-500 text-lg animate-pulse" />
                              <span className="text-[11px] uppercase font-mono font-black text-blue-400">PayPal Sandbox Portal</span>
                            </div>

                            <p className="text-[10px] text-zinc-400 leading-normal">
                              {lang === "es" 
                                ? "Inicia sesión de forma segura para completar tu sandbox checkout."
                                : "Securely authenticate your sandbox buyer credentials to execute the checkout."
                              }
                            </p>

                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">PayPal Email</label>
                                <input
                                  type="email"
                                  placeholder="comprador-test@sandbox.paypal.com"
                                  value={paypalEmail}
                                  onChange={(e) => setPaypalEmail(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 py-2 px-3 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">{lang === "es" ? "Contraseña" : "Password"}</label>
                                <input
                                  type="password"
                                  placeholder="••••••••"
                                  value={paypalPassword}
                                  onChange={(e) => setPaypalPassword(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 py-2 px-3 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                if (paypalEmail.length < 5 || paypalPassword.length < 4) {
                                  alert(lang === "es" ? "Por favor introduzca credenciales válidas." : "Please input valid credentials.");
                                  return;
                                }
                                handlePurchaseComplete();
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1"
                            >
                              <i className="fab fa-paypal" />
                              {lang === "es" ? `Pagar con PayPal ${currentSelected?.price}` : `Pay with PayPal ${currentSelected?.price}`}
                            </button>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 justify-center text-zinc-500 text-[10px] uppercase tracking-wider font-mono">
                          <i className="fas fa-lock text-[8px] text-emerald-500 animate-pulse" />
                          <span>{lang === "es" ? "Procesamiento SSL seguro de 256 bits" : "Secure 256-bit SSL connection"}</span>
                        </div>
                      </div>

                      {/* Right: Visual Card Preview */}
                      <div className="lg:col-span-5 flex flex-col items-center justify-center border-l border-zinc-800/80 pl-0 lg:pl-6">
                        <div className="w-full max-w-[280px] h-[170px] bg-gradient-to-tr from-slate-800 via-indigo-950 to-emerald-950 rounded-2xl p-4 shadow-2xl relative flex flex-col justify-between border border-white/10 overflow-hidden">
                          {/* Card Grid overlays */}
                          <div className="absolute inset-0 bg-radial-gradient opacity-10 pointer-events-none" />
                          <div className="absolute top-2 right-3 w-10 h-10 bg-white/5 rounded-full filter blur-md pointer-events-none" />

                          <div className="flex justify-between items-start z-10">
                            <div>
                              <p className="text-[7px] text-zinc-400 font-mono tracking-widest uppercase">Infinite Card</p>
                              {/* Gold foil chip */}
                              <div className="w-9 h-7 bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 rounded-md border border-yellow-300/40 mt-1 flex items-center justify-center">
                                <div className="w-7 h-5 border border-zinc-950/20 rounded opacity-60" />
                              </div>
                            </div>
                            <span className="text-[11px] font-black italic text-zinc-300 tracking-tighter">VISA</span>
                          </div>

                          <div className="z-10 text-left">
                            {/* Card Number display */}
                            <p className="font-mono text-white text-sm tracking-widest font-black leading-none mb-3">
                              {cardForm.number || "•••• •••• •••• ••••"}
                            </p>
                            
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[6px] text-zinc-500 uppercase tracking-widest font-mono font-bold">{lang === "es" ? "TITULAR" : "CARDHOLDER"}</p>
                                <p className="text-[10px] font-mono text-zinc-300 uppercase truncate max-w-[150px] font-bold">
                                  {cardForm.name || "NUEVO MIEMBRO"}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[6px] text-zinc-500 uppercase tracking-widest font-mono font-bold">EXP</p>
                                <p className="text-[10px] font-mono text-zinc-300 font-bold">{cardForm.expiry || "MM/YY"}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 bg-zinc-900 border border-white/5 rounded-xl p-3 text-center max-w-[280px]">
                          <p className="text-[9px] text-zinc-400 leading-normal font-mono uppercase tracking-wide">
                            {lang === "es" ? "🔐 PASARELA SANDBOX SEGURA" : "🔐 SECURE SANDBOX TUNNEL"}
                          </p>
                          <p className="text-[8px] text-zinc-500 mt-0.5 leading-normal">
                            {lang === "es"
                              ? "Utiliza números ficticios para completar la simulación. Ningún cargo real se efectuará."
                              : "Input test numbers to trigger successful checkout logs. No real charges are made."
                            }
                          </p>
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              )}

              {paymentStep === "processing" && (
                <div className="flex flex-col items-center justify-center gap-4 py-8 text-center max-w-md mx-auto">
                  <div className="relative flex items-center justify-center">
                    <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                    <i className="fas fa-shield-halved absolute text-amber-500 text-lg animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider font-mono">{lang === "es" ? "Procesando Transacción Segura" : "Processing Secure Transaction"}</h4>
                    <p className="text-[10.5px] text-zinc-400 leading-relaxed max-w-sm mt-1.5 font-mono uppercase tracking-wide">
                      {lang === "es" 
                        ? "Verificando firmas de cifrado SSL y sincronizando pases premium con Firestore..."
                        : "Verifying SSL signatures and synchronizing premium passes with Firestore..."
                      }
                    </p>
                  </div>
                </div>
              )}

              {paymentStep === "success" && (
                <div className="flex flex-col items-center justify-center gap-4 py-6 text-center max-w-md mx-auto">
                  {/* Huge Animated Success Badge */}
                  <div className="w-16 h-16 bg-emerald-500/10 border-2 border-emerald-400 rounded-full flex items-center justify-center text-emerald-400 text-2xl shadow-xl shadow-emerald-500/10 animate-bounce">
                    <i className="fas fa-check" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-emerald-400 uppercase tracking-tight">{lang === "es" ? "¡PAGO COMPLETADO CON ÉXITO!" : "PAYMENT COMPLETED SUCCESSFULLY!"}</h3>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      {lang === "es"
                        ? `Tu pase premium se ha activado instantáneamente en tu cuenta. ¡Muchísimas gracias por tu compra!`
                        : `Your premium pass benefits have been immediately mapped onto your account. Thanks so much!`
                      }
                    </p>
                  </div>

                  <div className="bg-zinc-900 border border-white/5 rounded-xl p-3 w-full text-left flex flex-col gap-1 font-mono text-[10px] uppercase tracking-wide">
                    <p className="text-zinc-500">{lang === "es" ? "Nro. Transacción:" : "Transaction ID:"} <span className="text-zinc-300 font-bold">{transactionId}</span></p>
                    <p className="text-zinc-500">{lang === "es" ? "Paquete adquirido:" : "Package acquired:"} <span className="text-amber-400 font-bold">{currentSelected?.name}</span></p>
                    <p className="text-zinc-500">{lang === "es" ? "Monto final:" : "Final amount:"} <span className="text-emerald-400 font-bold">{isFreeForMe ? "FREE ($0.00)" : currentSelected?.price}</span></p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setPaymentMethod(null);
                      setPaymentStep("idle");
                      setIsShopOpen(false); // Close modal on completion
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-2.5 rounded-xl text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
                  >
                    {lang === "es" ? "Cerrar y Volver al Juego" : "Close and return to Game"}
                  </button>
                </div>
              )}

            </div>
          )}

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
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100010] flex items-center justify-center p-4 overflow-y-auto pointer-events-auto text-left"
      >
        <div className="bg-zinc-900 border-4 border-yellow-600 p-6 sm:p-8 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200 text-white font-sans max-h-[90vh]">
          
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

  if (appState === "menu") {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 relative overflow-y-auto">
        {/* Tiled Minecraft-style Dirt/Stone elegant dark overlay */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #000 10%, transparent 10%), radial-gradient(circle, #000 10%, transparent 10%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px"
          }}
        />

        {/* Sky gradient background lights */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full filter blur-[120px] pointer-events-none" />

        {/* Decorative blocks behind menu */}
        <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-wrap gap-4 p-8 justify-center items-center overflow-hidden">
          {[...Array(24)].map((_, i) => {
            const colors = ["#059669", "#92400e", "#3f3f46", "#52525b"];
            const color = colors[i % colors.length];
            const rotation = (i * 27) % 360;
            const size = 12 + (i * 7) % 16;
            return (
              <div
                key={i}
                className="rounded-lg shadow-xl shrink-0"
                style={{
                  width: `${size * 4}px`,
                  height: `${size * 4}px`,
                  backgroundColor: color,
                  transform: `rotate(${rotation}deg)`
                }}
              />
            );
          })}
        </div>

        <div className="z-10 bg-black/60 backdrop-blur-xl p-6 sm:p-10 rounded-3xl border border-white/20 flex flex-col items-center shadow-2xl max-w-sm w-full my-auto">
          <h1 className="text-white text-5xl font-bold minecraft-font uppercase tracking-tighter mb-2 text-center drop-shadow-lg">
            {t.menu_title} <br />
            <span className="text-emerald-400">{t.menu_subtitle}</span>
          </h1>

          <div className="mt-4 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 py-1.5 px-4 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-white/80 font-mono text-[9px] uppercase tracking-wider font-bold">
                {t.profile_welcome}: <span className="text-emerald-400">{currentUser || "Invitado"}</span>
              </p>
            </div>
            <span className="text-white/40 font-mono text-[10px] tracking-wider uppercase font-bold select-none">
              alpha Mobile 1.0.2
            </span>
            {googleUser && (
              <div className="mt-1 flex items-center gap-1.5 bg-black/40 border border-white/5 py-1 px-3 rounded-full">
                <span className="text-zinc-400 font-mono text-[8px] uppercase tracking-wider font-bold">
                  {lang === "es" ? "Rol actual:" : "Current role:"}
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
                    <span className={`text-[8px] px-2 py-0.5 rounded font-sans font-extrabold uppercase tracking-widest ${badgeStyle}`}>
                      {label}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="flex flex-col w-full gap-3 mt-8">
            <button
              onClick={() => {
                resumeAudio();
                setAppState("worlds-list");
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl text-xl uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              {t.play}
            </button>
            
            <button
              onClick={() => {
                resumeAudio();
                setIsLeaderboardOpen(true);
              }}
              className="bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest shadow-lg border border-yellow-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-trophy text-white text-xs" /> {lang === "es" ? "Clasificación (Top 100)" : "Leaderboard (Top 100)"}
            </button>

            <button
              onClick={() => {
                resumeAudio();
                setIsFriendsOpen(true);
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest shadow-lg border border-purple-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-users text-white text-xs" /> {lang === "es" ? "Amigos (Multijugador)" : "Friends (Multiplayer)"}
            </button>

            <button
              onClick={() => {
                resumeAudio();
                setIsShopOpen(true);
              }}
              className="bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:via-amber-400 hover:to-yellow-500 text-zinc-950 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-yellow-500/20 border-2 border-yellow-300 transition-all active:scale-95 flex items-center justify-center gap-2 relative overflow-hidden group"
            >
              <i className="fas fa-shopping-cart text-zinc-950 text-xs animate-bounce" />
              <span>{lang === "es" ? "🛒 TIENDA VIP" : "🛒 VIP SHOP"}</span>
              {vipActive && (
                <span className="bg-zinc-950 text-yellow-400 text-[8px] px-1.5 py-0.5 rounded border border-yellow-400/30 font-extrabold animate-pulse ml-1">
                  VIP ACTIVO
                </span>
              )}
            </button>

            <button
              onClick={() => {
                resumeAudio();
                setAppState("settings");
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white/90 font-bold py-3 rounded-xl text-xs uppercase tracking-widest shadow-lg border border-white/10 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-cog text-emerald-400" /> {t.settings}
            </button>
            <button
              onClick={handleLogout}
              className="bg-zinc-900 border border-white/5 hover:bg-red-950/40 hover:text-red-400 text-white/50 font-semibold py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 mt-1"
            >
              <i className="fas fa-door-open mr-1" /> {t.logout}
            </button>
          </div>
        </div>
        {renderLeaderboardModal()}
        {renderFriendsModal()}
        {renderShopModal()}
      </div>
    );
  }

  if (appState === "settings") {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 relative overflow-y-auto">
        {/* Tiled Minecraft-style Dirt/Stone elegant dark overlay */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #000 10%, transparent 10%), radial-gradient(circle, #000 10%, transparent 10%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px"
          }}
        />

        {/* Sky gradient background lights */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full filter blur-[120px] pointer-events-none" />

        {/* Decorative blocks behind menu */}
        <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-wrap gap-4 p-8 justify-center items-center overflow-hidden">
          {[...Array(24)].map((_, i) => {
            const colors = ["#059669", "#92400e", "#3f3f46", "#52525b"];
            const color = colors[i % colors.length];
            const rotation = (i * 27) % 360;
            const size = 12 + (i * 7) % 16;
            return (
              <div
                key={i}
                className="rounded-lg shadow-xl shrink-0"
                style={{
                  width: `${size * 4}px`,
                  height: `${size * 4}px`,
                  backgroundColor: color,
                  transform: `rotate(${rotation}deg)`
                }}
              />
            );
          })}
        </div>

        <div className="z-10 bg-black/80 backdrop-blur-xl p-6 sm:p-10 rounded-3xl border border-white/20 flex flex-col items-center shadow-2xl max-w-sm w-full my-auto">
          <h1 className="text-white text-3xl font-bold minecraft-font uppercase tracking-tighter mb-6 text-center drop-shadow-lg flex items-center gap-2">
            <i className="fas fa-cog text-emerald-400 animate-spin-slow" />{" "}
            {t.settings}
          </h1>

          <div className="flex flex-col w-full gap-5">
            {/* IDIOMA */}
            <div className="flex flex-col gap-1.5 bg-zinc-900/40 p-3 rounded-xl border border-white/5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.language}
              </label>
              <div className="grid grid-cols-5 gap-1.5 mt-1">
                {(["es", "en", "fr", "pt", "de"] as Language[]).map((lcode) => {
                  const labelMap: Record<Language, string> = {
                    es: "ESP",
                    en: "ENG",
                    fr: "FRA",
                    pt: "POR",
                    de: "DEU",
                  };
                  return (
                    <button
                      key={lcode}
                      onClick={() => {
                        resumeAudio();
                        setLang(lcode);
                      }}
                      className={`text-[10px] py-1.5 rounded-lg font-bold border transition-all uppercase ${
                        lang === lcode
                          ? "bg-emerald-500 border-transparent text-white shadow-md font-extrabold"
                          : "bg-zinc-800 border-white/5 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {labelMap[lcode]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ULTRA OPTIMIZACION */}
            <div className="flex flex-col gap-1.5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.ultra_optimization}
              </label>
              <button
                onClick={() => {
                  resumeAudio();
                  setUltraOptimization(!ultraOptimization);
                }}
                className={`w-full text-white font-bold py-2.5 px-4 rounded-xl text-left border transition-all active:scale-95 flex justify-between items-center text-sm ${
                  ultraOptimization
                    ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300"
                    : "bg-zinc-800 border-white/10 text-white/80"
                }`}
              >
                <span>
                  <i className="fas fa-bolt mr-2 text-amber-400" />{" "}
                  {t.ultra_optimization}
                </span>
                <span className="text-[9px] uppercase font-mono bg-black/40 px-2 py-0.5 rounded text-emerald-300">
                  {ultraOptimization ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            {/* FOV */}
            <div className="flex flex-col gap-1.5 bg-zinc-900/40 p-3 rounded-xl border border-white/5">
              <div className="flex justify-between items-center">
                <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  {t.fov}
                </label>
                <span className="text-white font-mono font-bold text-xs bg-zinc-800 px-1.5 py-0.5 rounded">
                  {fov} {fov >= 115 ? "🔥" : ""}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="120"
                value={fov}
                onChange={(e) => setFov(parseInt(e.target.value))}
                className="w-full accent-emerald-400 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* PERSPECTIVA */}
            <div className="flex flex-col gap-1.5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {t.camera_view}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setPerspective("first")}
                  className={`text-[9px] py-2 rounded-lg font-bold border transition-all uppercase tracking-tighter ${
                    perspective === "first"
                      ? "bg-emerald-500 border-transparent text-white shadow-md"
                      : "bg-zinc-800 border-white/5 text-zinc-400"
                  }`}
                >
                  {t.first_person}
                </button>
                <button
                  onClick={() => setPerspective("second")}
                  className={`text-[9px] py-2 rounded-lg font-bold border transition-all uppercase tracking-tighter ${
                    perspective === "second"
                      ? "bg-emerald-500 border-transparent text-white shadow-md"
                      : "bg-zinc-800 border-white/5 text-zinc-400"
                  }`}
                >
                  {t.second_person}
                </button>
                <button
                  onClick={() => setPerspective("third")}
                  className={`text-[9px] py-2 rounded-lg font-bold border transition-all uppercase tracking-tighter ${
                    perspective === "third"
                      ? "bg-emerald-500 border-transparent text-white shadow-md"
                      : "bg-zinc-800 border-white/5 text-zinc-400"
                  }`}
                >
                  {t.third_person}
                </button>
              </div>
            </div>

            {/* CONTROLES EN PANTALLA */}
            <div className="flex flex-col gap-1.5 bg-zinc-900/40 p-3 rounded-xl border border-white/5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                {lang === "es" ? "🎮 CONTROLES TÁCTILES" : "🎮 TOUCHSCREEN CONTROLS"}
              </label>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {(["auto", "yes", "no"] as const).map((mode) => {
                  const isActive = touchControlsMode === mode;
                  const modeText = 
                    mode === "auto" 
                      ? (lang === "es" ? "AUTO" : "AUTO")
                      : mode === "yes" 
                        ? (lang === "es" ? "ACTIVO" : "VISIBLE")
                        : (lang === "es" ? "OCULTO" : "HIDDEN");

                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        resumeAudio();
                        setTouchControlsMode(mode);
                      }}
                      className={`text-[9px] py-2 rounded-lg font-bold border transition-all uppercase tracking-normal ${
                        isActive
                          ? "bg-emerald-500 border-transparent text-white shadow-md font-extrabold"
                          : "bg-zinc-800 border-white/5 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {modeText}
                    </button>
                  );
                })}
              </div>
              <p className="text-[8px] text-zinc-500 font-mono mt-1">
                {lang === "es" 
                  ? "* Auto oculta los botones en PC y los muestra en pantallas táctiles" 
                  : "* Auto hides overlays on PC and displays them on touchscreens"}
              </p>
            </div>

            {/* SOPORTE PARA TABLETS / DISPOSITIVOS */}
            <div className="flex flex-col gap-1.5 bg-zinc-900/40 p-3 rounded-xl border border-white/5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-tablet-screen-button text-xs animate-pulse" />
                {lang === "es" ? "📱 AJUSTAR PANTALLA Y TABLET" : "📱 ADJUST TABLET & SCREEN"}
              </label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
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
                      className={`text-[8.5px] py-2 px-1 rounded-lg font-bold border transition-all uppercase tracking-tight text-center ${
                        isActive
                          ? "bg-emerald-500 border-transparent text-white shadow-md font-extrabold scale-102"
                          : "bg-zinc-800 border-white/5 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-[8px] text-zinc-400 font-mono mt-1 px-1 flex flex-col gap-0.5 border-t border-white/5 pt-1.5">
                <div className="flex justify-between">
                  <span>{lang === "es" ? "Resolución actual:" : "Current resolution:"}</span>
                  <span className="text-white font-semibold">{screenSize.width}x{screenSize.height} (R:{screenSize.aspectRatio.toFixed(2)})</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === "es" ? "Perfil activo:" : "Active profile:"}</span>
                  <span className="text-emerald-400 font-bold">{uiScaleConfig.desc}</span>
                </div>
              </div>
            </div>

            {/* SISTEMA DE GUARDADO */}
            <div className="flex flex-col gap-1.5 bg-zinc-900/40 p-3 rounded-xl border border-white/5">
              <label className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider font-mono">
                {lang === "es" ? "💾 GUARDADO Y ARCHIVOS" : "💾 SAVES & FILES"}
              </label>
              
              {currentWorld && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={handleManualSave}
                    className="bg-emerald-600 hover:bg-emerald-500 py-2 rounded-lg text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 transition active:scale-95"
                  >
                    <i className="fas fa-save" /> {lang === "es" ? "Guardar" : "Save"}
                  </button>
                  <button
                    onClick={handleExportWorld}
                    className="bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 transition active:scale-95"
                  >
                    <i className="fas fa-file-export" /> {lang === "es" ? "Exportar" : "Export"}
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
                    className="col-span-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 py-2 rounded-lg text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 border border-yellow-400/20 shadow-lg"
                  >
                    <i className="fas fa-magic text-yellow-200 animate-pulse" /> {lang === "es" ? "Viajar a Far Lands (x:1515)" : "Travel to Far Lands (x:1515)"}
                  </button>
                </div>
              )}

              <div className="mt-1">
                <label className="w-full bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer text-center transition active:scale-95 border border-white/5">
                  <i className="fas fa-file-import" />
                  {lang === "es" ? "Importar mundo (.json)" : "Import world (.json)"}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportWorld}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* BOTON ATRAS */}
            <button
              onClick={() => {
                resumeAudio();
                setAppState(currentWorld ? "playing" : "menu");
              }}
              className="bg-zinc-700 hover:bg-zinc-600 border border-white/10 text-white font-bold py-3 rounded-xl text-center uppercase tracking-widest transition-all active:scale-95 mt-2 text-sm"
            >
              {currentWorld ? (lang === "es" ? "VOLVER AL JUEGO" : "BACK TO GAME") : t.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const maxAbsCoord = Math.max(Math.abs(playerPos.x), Math.abs(playerPos.z));

  return (
    <div
      className={`w-full h-full relative overflow-hidden bg-black touch-none ${maxAbsCoord >= 2000 ? "glitch-heavy" : maxAbsCoord >= 1500 ? "glitch-moderate" : ""}`}
      onMouseDown={handleTouchStart}
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
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
      <VoxelWorld
        key={(currentWorld?.id || "temp") + "_" + dimension}
        currentBlock={currentBlock}
        playerPos={playerPos}
        onBlockChange={handlePosChange}
        moveVector={moveVector}
        lookOffsetRef={lookOffsetRef}
        interactionMode={interactionMode}
        isJumping={isJumping}
        perspective={perspective}
        fov={fov}
        isZooming={isZooming}
        ultraOptimization={ultraOptimization}
        worldId={currentWorld?.id || "temp"}
        initialEdits={getDimensionEdits()}
        onBlockEdit={handleBlockEdit}
        onSelectBlock={setCurrentBlock}
        worldType={currentWorld?.worldType || "normal"}
        gameMode={currentWorld?.gameMode || "survival"}
        onOpenCraftingTable={() => {
          setIsCraftingTableActive(true);
          setInventoryTab("crafting");
          setIsInventoryOpen(true);
        }}
        survivalInventory={survivalInventory}
        onUpdateSurvivalInventory={setSurvivalInventory}
        weather={weather}
        dimension={dimension}
        onPortalTeleport={handlePortalTeleport}
        autoJumpEnabled={autoJumpEnabled}
        userRole={userRole}
        biomeConfig={biomeConfig}
        activePlayers={activePlayers}
      />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-30">
        <div className="w-5 h-5 border border-white/50 rounded-full flex items-center justify-center">
          <div className="w-0.5 h-0.5 bg-white"></div>
        </div>
      </div>

      <div className={`absolute inset-0 pointer-events-none flex flex-col justify-between transition-all duration-300 ${uiScaleConfig.containerPadding}`}>
        <div className="flex justify-between items-start w-full">
          <div className="flex flex-col gap-2 items-start max-w-[280px]">
            <div
              className={`bg-black/70 rounded-xl backdrop-blur-md border border-white/10 pointer-events-auto transition-all duration-300 ${uiScaleConfig.statsPadding}`}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <h1 className={`text-white font-bold minecraft-font uppercase tracking-tighter flex items-center gap-1.5 flex-wrap ${uiScaleConfig.statsTitle}`}>
                ALPHA <span className="text-emerald-400">MOBILE 1.0.2</span>
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

              <button
                onClick={handleSaveAndExit}
                className="mt-2 w-full bg-red-600/85 hover:bg-red-500 py-1 rounded-lg text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 transition active:scale-95"
              >
                <i className="fas fa-sign-out-alt" /> {t.save_n_exit}
              </button>
            </div>

            {/* Persistent Minecraft-style HUD Chat Overlay - Grouped vertically below stats box to avoid any overlap! */}
            <div className="w-64 max-h-[140px] sm:max-h-48 flex flex-col gap-1 overflow-hidden pointer-events-none transition-opacity duration-300">
              {chatMessages.slice(isCompactHeight ? -2 : -4).map((msg, idx) => (
                <div key={idx} className="bg-black/55 px-2 py-0.5 rounded text-[8px] sm:text-[9px] text-white font-mono border-l-2 border-sky-400">
                  {msg}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pointer-events-auto">
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
          </div>
        </div>

        <div className={`flex justify-between items-end transition-all duration-300 w-full ${uiScaleConfig.gapClass} ${uiScaleConfig.marginClass}`}>
          {showTouchControls ? (
            <div
              className={`pointer-events-auto flex items-end ${uiScaleConfig.gapClass}`}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Joystick
                onMove={setMoveVector}
                onEnd={() => setMoveVector({ x: 0, y: 0 })}
                size={uiScaleConfig.joystickSize}
              />
              <button
                onPointerDown={(e) => { e.stopPropagation(); setIsJumping(true); }}
                onPointerUp={(e) => { e.stopPropagation(); setIsJumping(false); }}
                onPointerCancel={(e) => { e.stopPropagation(); setIsJumping(false); }}
                onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(true); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(false); }}
                onTouchCancel={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(false); }}
                className={`${uiScaleConfig.jumpButtonSize} rounded-full bg-white/25 border-2 border-white/60 flex items-center justify-center active:bg-white/50 active:scale-95 transition-all mb-2 select-none pointer-events-auto touch-none`}
                style={{ touchAction: "none" }}
              >
                <i className="fas fa-arrow-up text-white/90 text-2xl animate-pulse" />
              </button>
            </div>
          ) : (
            <div
              className="pointer-events-auto flex flex-col gap-2 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white select-none max-w-xs transition-all mb-2"
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

          <div className="flex flex-col gap-5 items-center pointer-events-none">
            {/* HUD de Vida y Comida movido arriba */}
            <div
              className="flex flex-col gap-1 items-center drop-shadow-md w-full px-2 mb-2 pointer-events-auto"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex gap-1 justify-center w-full">
                {[...Array(10)].map((_, i) => (
                  <i
                    key={`h${i}`}
                    className={`fas fa-heart text-sm ${i < Math.ceil(health / 2) ? "text-red-500" : "text-red-950 opacity-50"}`}
                  />
                ))}
              </div>
              <div className="flex gap-1 justify-center w-full">
                {[...Array(10)].map((_, i) => (
                  <i
                    key={`f${i}`}
                    className={`fas fa-drumstick-bite text-sm ${i < Math.ceil(food / 2) ? "text-amber-500" : "text-amber-950 opacity-50"}`}
                  />
                ))}
              </div>
            </div>

            <div
              className={`flex flex-col gap-2 items-center pointer-events-auto transition-transform duration-300 ${uiScaleConfig.hotbarScale}`}
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

              {/* Advanced Horizontal Swipeable Scroll Hotbar */}
              <div className="bg-black/80 p-1.5 rounded-2xl flex flex-row items-center gap-1.5 border border-white/10 shadow-2xl min-w-0 max-w-[170px] xs:max-w-[230px] sm:max-w-[320px] md:max-w-[420px] lg:max-w-[500px] pointer-events-auto">
                <div 
                  className="flex flex-row gap-1.5 overflow-x-auto scrollbar-none py-0.5 px-0.5 min-w-0" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {inventoryItems.map((type) => (
                    <button
                      key={type}
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
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 transition-all shrink-0 ${currentBlock === type ? "border-emerald-400 scale-105" : "border-transparent opacity-60"}`}
                      style={{ backgroundColor: BLOCK_COLORS[type] }}
                    />
                  ))}
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
          className="fixed inset-0 z-[100] bg-zinc-950/98 p-4 sm:p-6 flex flex-col items-center overflow-y-auto"
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

          {/* Tab 1: Bloques y Objetos */}
          {inventoryTab === "items" && (
            <div className="w-full max-w-3xl flex flex-col">
              {!isCreativeMode && Object.keys(survivalInventory).filter(k => survivalInventory[parseInt(k)] > 0).length === 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 text-center flex flex-col items-center max-w-md mx-auto my-6">
                  <i className="fas fa-box-open text-zinc-600 text-4xl mb-4" />
                  <h3 className="text-white font-bold text-lg mb-2">¡Tu Inventario está Vacío!</h3>
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    Rompe bloques en el mundo (como Tierra o Troncos de Madera) para empezar a recolectar materiales rápidamente.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3 sm:gap-4 pb-10">
                  {Object.keys(BLOCK_NAMES).map((k) => {
                    const tVal = parseInt(k);
                    if (tVal === 0) return null;

                    // If survival mode, hide blocks they don't have
                    if (!isCreativeMode) {
                      const qty = survivalInventory[tVal] || 0;
                      if (qty <= 0) return null;
                    }

                    const isSelected = currentBlock === tVal;
                    const blockCount = survivalInventory[tVal] || 0;

                    return (
                      <button
                        key={tVal}
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          resumeAudio();
                          setCurrentBlock(tVal);
                          setIsInventoryOpen(false);
                          setIsCraftingTableActive(false);
                        }}
                        className={`aspect-square bg-zinc-900/60 rounded-2xl border-2 p-2 flex flex-col items-center justify-between transition-all active:scale-95 text-center relative group overflow-hidden ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-950/20 shadow-md shadow-emerald-500/10"
                            : "border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        {/* 3D Color representation inside slot */}
                        <div
                          className="w-full h-11 sm:h-12 rounded-lg shadow-inner flex-shrink-0 transition group-hover:scale-105"
                          style={{ backgroundColor: BLOCK_COLORS[tVal as BlockType] }}
                        />

                        <span className="text-[9px] text-zinc-300 font-bold uppercase truncate w-full mt-2">
                          {BLOCK_NAMES[tVal as BlockType]}
                        </span>

                        {/* Survival quantity badge */}
                        {!isCreativeMode && (
                          <span className="absolute top-1.5 right-1.5 bg-zinc-950/90 text-white font-mono font-bold text-[9px] px-1.5 py-0.5 rounded-md border border-white/10 z-10 shadow-lg">
                            {blockCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Crafting Panel */}
          {inventoryTab === "crafting" && (
            <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-12 gap-6 pb-12 items-start">
              {/* Left Side: Recipe List */}
              <div className="md:col-span-6 flex flex-col gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                {CRAFTING_RECIPES.map((recipe) => {
                  const hasAllMats = recipe.ingredients.every(
                    (ing) => (survivalInventory[ing.type] || 0) >= ing.count
                  );
                  const isLockedByTable = recipe.requiresCraftingTable && !isCraftingTableActive;
                  const isSelected = selectedRecipeId === recipe.id;

                  return (
                    <button
                      key={recipe.id}
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      className={`w-full p-3 rounded-2xl border-2 text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-950/20"
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 w-10/12">
                        {/* Resulting block thumbnail preview */}
                        <div
                          className="w-8 h-8 rounded-lg shadow-inner flex-shrink-0 border border-white/5"
                          style={{ backgroundColor: BLOCK_COLORS[recipe.result] }}
                        />
                        <div className="flex flex-col truncate">
                          <span className="text-xs font-bold text-white uppercase tracking-wide">
                            {recipe.name}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            Obtienes {recipe.resultCount} unidades
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isLockedByTable ? (
                          <span className="bg-zinc-800 text-zinc-500 text-[8px] font-bold uppercase py-0.5 px-1.5 rounded-md border border-zinc-700 flex items-center gap-1">
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

                  const hasAllMats = activeRecipe.ingredients.every(
                    (ing) => (survivalInventory[ing.type] || 0) >= ing.count
                  );
                  const isLockedByTable =
                    activeRecipe.requiresCraftingTable && !isCraftingTableActive;

                  return (
                    <>
                      {/* Recipe Output header representation */}
                      <div className="flex flex-col items-center text-center border-b border-white/5 pb-4 mb-4">
                        <div
                          className="w-16 h-16 rounded-2xl shadow-xl flex items-center justify-center border-2 border-white/10 mb-3 hover:scale-105 transition-transform"
                          style={{ backgroundColor: BLOCK_COLORS[activeRecipe.result] }}
                        />
                        <span className="bg-zinc-800 text-zinc-300 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border border-white/5 mb-1.5">
                          Resultado de Fabricación
                        </span>
                        <h3 className="text-white text-lg font-bold uppercase tracking-wide">
                          {activeRecipe.name}
                        </h3>
                        <p className="text-zinc-400 text-xs">
                          Produce x{activeRecipe.resultCount} unidades en total
                        </p>
                      </div>

                      {/* Ingredients breakdown */}
                      <div className="flex flex-col gap-2 mb-6">
                        <span className="text-[9px] text-zinc-400 font-mono tracking-wider uppercase mb-1">
                          Ingredientes Necesarios:
                        </span>
                        {activeRecipe.ingredients.map((ing, i) => {
                          const possessed = survivalInventory[ing.type] || 0;
                          const isMet = possessed >= ing.count;

                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/40 border border-white/5"
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-5 h-5 rounded shadow-inner"
                                  style={{ backgroundColor: BLOCK_COLORS[ing.type] }}
                                />
                                <span className="text-xs font-bold text-zinc-300">
                                  {BLOCK_NAMES[ing.type]}
                                </span>
                              </div>
                              <span
                                className={`text-[11px] font-mono font-bold ${
                                  isMet ? "text-emerald-400" : "text-rose-500"
                                }`}
                              >
                                {possessed} / {ing.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action trigger button */}
                      <button
                        disabled={!hasAllMats || isLockedByTable}
                        onClick={() => {
                          resumeAudio();
                          handleCraft(activeRecipe);
                        }}
                        className={`w-full py-4 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all duration-200 ${
                          isLockedByTable
                            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/55"
                            : hasAllMats
                            ? "bg-emerald-600 border border-emerald-400 text-white shadow-lg shadow-emerald-500/20 active:scale-95 hover:bg-emerald-500"
                            : "bg-zinc-850 text-zinc-500 cursor-not-allowed"
                        }`}
                      >
                        {isLockedByTable ? (
                          <span className="flex items-center justify-center gap-2">
                            <i className="fas fa-lock" /> Requiere Mesa de Crafteo
                          </span>
                        ) : hasAllMats ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <i className="fas fa-hammer" /> FABRICAR AHORA
                          </span>
                        ) : (
                          "Faltan Recursos"
                        )}
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gemini Suggestion Modal */}
      {suggestion && (
        <div className="fixed inset-0 z-[110] bg-indigo-950/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-zinc-900 border-2 border-indigo-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
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
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-black/85 text-white border border-teal-500/30 px-5 py-3 rounded-2xl shadow-2xl z-[200] flex items-center gap-3 font-semibold text-sm animate-bounce pointer-events-none">
          <i className="fas fa-camera text-teal-400 text-base animate-pulse" />
          <span>{screenshotToast}</span>
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
          className="fixed inset-0 z-[120] bg-zinc-950/95 backdrop-blur-md p-4 sm:p-6 flex flex-col items-center justify-center pointer-events-auto"
        >
          <div className="w-full max-w-xl bg-zinc-900 border-2 border-sky-500/30 rounded-3xl p-5 flex flex-col h-[85vh] sm:h-[75vh] shadow-2xl animate-in fade-in zoom-in-95 duration-205">
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
          className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md z-[10005] flex flex-col items-center justify-center p-4 overflow-y-auto"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Menu Card Container */}
          <div className="bg-zinc-900 border-4 border-zinc-700 p-6 sm:p-8 rounded-2xl w-full max-w-md shadow-2xl flex flex-col gap-5 relative">
            
            {/* Minecraft header banner */}
            <div className="text-center">
              <h2 className="text-white text-3xl font-bold minecraft-font uppercase tracking-wider drop-shadow-lg flex items-center justify-center gap-2">
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

            {/* Menu Buttons Grid */}
            <div className="flex flex-col gap-3">
              
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

      {/* Leaderboard Modal (Tabla de Clasificación) */}
      {renderLeaderboardModal()}
      {/* Friends Modal */}
      {renderFriendsModal()}
      {/* VIP Shop Modal */}
      {renderShopModal()}
    </div>
  );
};

export default App;
