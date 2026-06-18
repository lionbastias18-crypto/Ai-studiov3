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
  setActiveSession,
  Profile,
  World
} from "./services/worldPersistence";
import {
  auth,
  loginWithGoogle,
  logoutGoogle,
  saveWorldToFirestore,
  loadWorldsFromFirestore,
  deleteWorldFromFirestore
} from "./services/firebaseService";

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

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [worlds, setWorlds] = useState<World[]>(() => loadWorlds());
  const [currentUser, setCurrentUser] = useState<string | null>(() => getActiveSession());

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
  const [perspective, setPerspective] = useState<"first" | "second" | "third">(
    "first",
  );
  const [fov, setFov] = useState<number>(65);
  const [ultraOptimization, setUltraOptimization] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 1024;
    }
    return false;
  });
  const [showCameraFlash, setShowCameraFlash] = useState<boolean>(false);
  const [flashOpacity, setFlashOpacity] = useState<number>(0);
  const [screenshotToast, setScreenshotToast] = useState<string | null>(null);
  const { health, food } = useGameState();

  // Active World
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);

  const [survivalInventory, setSurvivalInventory] = useState<Record<number, number>>({
    [BlockType.DIRT]: 16,
    [BlockType.WOOD]: 8,
    [BlockType.LOG]: 4,
    [BlockType.CRAFTING_TABLE]: 1,
  });
  const [inventoryTab, setInventoryTab] = useState<"items" | "crafting">("items");

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
        } else {
          setChatMessages((prev) => [...prev, "❌ Comandos válidos: /gamemode [creative | survival]"]);
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
  const [newWorldGameMode, setNewWorldGameMode] = useState<"creative" | "survival" | "adventure">("survival");
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

  // Keep latest state in a ref to avoid resetting the auto-save interval on every block/inventory change!
  const latestSaveDataRef = useRef({ currentWorld, survivalInventory, googleUser });
  useEffect(() => {
    latestSaveDataRef.current = { currentWorld, survivalInventory, googleUser };
  }, [currentWorld, survivalInventory, googleUser]);

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
    setCurrentUser("Invitado");
    setActiveSession("Invitado");
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

      const editKey = `${x},${y},${z}`;

      setCurrentWorld((prev) => {
        if (!prev) return prev;
        const updatedEdits = { ...prev.edits };
        if (blockType === BlockType.AIR) {
          updatedEdits[editKey] = BlockType.AIR;
        } else {
          updatedEdits[editKey] = blockType;
        }
        const updatedWorld = {
          ...prev,
          edits: updatedEdits,
          survivalInventory: (prev as any).survivalInventory
        };

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
    [currentWorld, googleUser, currentBlock],
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

      // Escape key to exit inventory or open settings
      if (e.key === "Escape") {
        if (isInventoryOpenRef.current) {
          setIsInventoryOpen(false);
        } else {
          resumeAudio();
          setAppState("settings");
        }
        e.preventDefault();
        return;
      }

      activeKeys.current[key] = true;
      if (e.key === " ") {
        activeKeys.current[" "] = true;
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

      updateControls();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handleBlur = () => {
      activeKeys.current = {};
      setMoveVector(prev => (prev.x !== 0 || prev.y !== 0) ? { x: 0, y: 0 } : prev);
      setIsJumping(prev => prev ? false : prev);
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
              <p className="text-zinc-400 text-xs mt-0.5 font-medium">Gestiona y crea tus tierras infinitas personalizadas</p>
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
                              {world.gameMode === "creative" ? t.creative_mode : world.gameMode === "adventure" ? t.adventure_mode : t.survival_mode}
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
                  <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1.5 rounded-xl border border-white/5">
                    {(["survival", "creative", "adventure"] as const).map((mode) => {
                      const isActive = newWorldGameMode === mode;
                      const modeText = mode === "survival" ? t.survival_mode : mode === "creative" ? t.creative_mode : t.adventure_mode;
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

                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wide shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
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
          </div>

          <div className="flex flex-col w-full gap-4 mt-8">
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
                setAppState("settings");
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white/90 font-bold py-4 rounded-xl text-sm uppercase tracking-widest shadow-lg border border-white/10 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-cog text-emerald-400" /> {t.settings}
            </button>
            <button
              onClick={handleLogout}
              className="bg-zinc-900 border border-white/5 hover:bg-red-950/40 hover:text-red-400 text-white/50 font-semibold py-3 rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 mt-1"
            >
              <i className="fas fa-door-open mr-1" /> {t.logout}
            </button>
          </div>
        </div>
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
      className={`w-full h-full relative overflow-hidden bg-black touch-none ${maxAbsCoord >= 1500 ? "glitch-heavy" : ""}`}
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
        .glitch-heavy {
          animation: glitch-shake 0.28s infinite steps(2);
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
      {maxAbsCoord >= 1500 && (
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
        key={currentWorld?.id || "temp"}
        currentBlock={currentBlock}
        playerPos={playerPos}
        onBlockChange={handlePosChange}
        moveVector={moveVector}
        lookOffsetRef={lookOffsetRef}
        interactionMode={interactionMode}
        isJumping={isJumping}
        perspective={perspective}
        fov={fov}
        ultraOptimization={ultraOptimization}
        worldId={currentWorld?.id || "temp"}
        initialEdits={currentWorld?.edits || {}}
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
      />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-30">
        <div className="w-5 h-5 border border-white/50 rounded-full flex items-center justify-center">
          <div className="w-0.5 h-0.5 bg-white"></div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div
            className="bg-black/70 p-4 rounded-xl backdrop-blur-md border border-white/10 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <h1 className="text-white text-lg font-bold minecraft-font uppercase tracking-tighter flex items-center gap-1.5 flex-wrap">
              ALPHA <span className="text-emerald-400">MOBILE 1.0.2</span>
            </h1>
            <p className="text-white/40 text-[9px] mt-1 font-mono break-words">
              <span id="player-coordinates-hud">
                X:{playerPos.x.toFixed(0)} Y:{(playerPos.y - 55).toFixed(0)} Z:{playerPos.z.toFixed(0)}
              </span>
              <br/>
              Chunks: {Object.keys(currentWorld?.edits || {}).length} | <FpsCounter />
            </p>
            <button
              onClick={handleSaveAndExit}
              className="mt-3 w-full bg-red-600/85 hover:bg-red-500 py-1.5 rounded-lg text-white font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <i className="fas fa-sign-out-alt" /> {t.save_n_exit}
            </button>
          </div>

          {/* Persistent Minecraft-style HUD Chat Overlay */}
          <div className="absolute left-6 top-[136px] w-64 max-h-48 flex flex-col gap-1 overflow-hidden pointer-events-none transition-opacity duration-300">
            {chatMessages.slice(-4).map((msg, idx) => (
              <div key={idx} className="bg-black/55 px-2.5 py-1 rounded text-[9px] text-white font-mono border-l-2 border-sky-400">
                {msg}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pointer-events-auto">
            <button
              onClick={handleGetBuildingSuggestion}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              disabled={isLoadingSuggestion}
              className="bg-indigo-600/90 p-3 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center w-12 h-12 transition-all hover:bg-indigo-500"
              title="Sugerencia de construcción"
              id="wand-btn"
            >
              <i
                className={`fas ${isLoadingSuggestion ? "fa-spinner fa-spin" : "fa-wand-sparkles"}`}
              />
            </button>
            <button
              onClick={handleCaptureScreenshot}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="bg-teal-600/95 hover:bg-teal-500 p-3 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center w-12 h-12 transition-all"
              title="Capturar pantalla"
              id="camera-btn"
            >
              <i className="fas fa-camera text-base" />
            </button>
            <button
              onClick={() => {
                resumeAudio();
                setIsChatOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="bg-sky-600/95 hover:bg-sky-500 p-3 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center w-12 h-12 transition-all border border-white/10"
              title="Chat / Comandos"
              id="hud-chat-btn"
            >
              <i className="fas fa-comment-dots text-base text-yellow-200 animate-pulse" />
            </button>
            <button
              onClick={() => {
                resumeAudio();
                setAppState("settings");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="bg-zinc-800/95 hover:bg-zinc-700 p-3 rounded-2xl shadow-xl active:scale-90 text-white flex items-center justify-center w-12 h-12 transition-all border border-white/10"
              title="Ajustes"
              id="hud-settings-btn"
            >
              <i className="fas fa-cog text-emerald-400 text-base" />
            </button>
          </div>
        </div>

        <div className="flex justify-between items-end gap-6 mb-4">
          {showTouchControls ? (
            <div
              className="pointer-events-auto flex gap-4 items-end"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Joystick
                onMove={setMoveVector}
                onEnd={() => setMoveVector({ x: 0, y: 0 })}
              />
              <button
                onPointerDown={(e) => { e.stopPropagation(); setIsJumping(true); }}
                onPointerUp={(e) => { e.stopPropagation(); setIsJumping(false); }}
                onPointerCancel={(e) => { e.stopPropagation(); setIsJumping(false); }}
                onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(true); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(false); }}
                onTouchCancel={(e) => { e.preventDefault(); e.stopPropagation(); setIsJumping(false); }}
                className="w-16 h-16 rounded-full bg-white/25 border-2 border-white/60 flex items-center justify-center active:bg-white/50 active:scale-95 transition-all mb-2 select-none pointer-events-auto touch-none"
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
                <div className="flex items-center gap-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">E / I</span>
                  <span>Inventario</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-black/50 border border-white/10 px-1.5 py-0.5 rounded text-white font-extrabold shadow-sm">Esc</span>
                  <span>Ajustes</span>
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
              className="flex flex-col gap-5 items-center pointer-events-auto"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex gap-3">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode("break");
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode("break");
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode("break");
                  }}
                  className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-4 transition-all shadow-lg pointer-events-auto ${"hidden"}`}
                >
                  <i className="fas fa-hand-fist text-white text-xl" />
                  <span className="text-[8px] text-white font-bold uppercase mt-1">
                    {t.break}
                  </span>
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode("place");
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode("place");
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setInteractionMode("place");
                  }}
                  className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-4 transition-all shadow-lg pointer-events-auto ${"hidden"}`}
                >
                  <i className="fas fa-cube text-white text-xl" />
                  <span className="text-[8px] text-white font-bold uppercase mt-1">
                    {t.place}
                  </span>
                </button>
                {(currentBlock === BlockType.MUSHROOM_RED ||
                  currentBlock === BlockType.MUSHROOM_BROWN) && (
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
                    className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-4 transition-all shadow-lg bg-orange-600 border-orange-300 active:scale-95 pointer-events-auto"
                  >
                    <i className="fas fa-drumstick-bite text-white text-xl" />
                    <span className="text-[8px] text-white font-bold uppercase mt-1">
                      Eat
                    </span>
                  </button>
                )}
              </div>

              <div className="bg-black/80 p-2 rounded-2xl flex flex-wrap justify-center gap-2 border border-white/10 shadow-2xl max-w-[280px] sm:max-w-md pointer-events-auto">
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
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg border-2 transition-all ${currentBlock === type ? "border-emerald-400 scale-110" : "border-transparent opacity-60"}`}
                    style={{ backgroundColor: BLOCK_COLORS[type] }}
                  />
                ))}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeAudio();
                    setIsInventoryOpen(true);
                  }}
                  className="w-10 h-10 sm:w-11 sm:h-11 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center justify-center text-white text-xs transition active:scale-95"
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
    </div>
  );
};

export default App;
