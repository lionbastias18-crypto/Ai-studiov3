import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_COLORS, BLOCK_NAMES } from '../constants';
import {
  BlockType,
  EntityData,
  EntityType,
  GeminiAgentConfig,
  GeminiAgentGoal,
  GeminiAgentMemory,
  GeminiAgentTelemetry,
  Vector3D,
} from '../types';
import { CharacterModel, resolveCharacterSkin } from './CharacterModel';
import {
  loadGeminiAgentMemory,
  recordAgentExperience,
  requestGeminiAgentStep,
  saveGeminiAgentMemory,
} from '../services/geminiService';
import {
  playAttackSwingSound,
  playBreakSound,
  playHurtSound,
  playPlaceSound,
  playStepSound,
} from '../services/audioService';

export interface HitEntityOptions {
  damage?: number;
  attackerPos?: Vector3D;
  isCompanion?: boolean;
}

export interface AutonomousAgentCombatState {
  alive: boolean;
  pos: Vector3D;
  hp: number;
  maxHp: number;
  lastAttackerPos: Vector3D | null;
  lastDamagedAtMs: number;
  damage: (amount: number, knockFromX?: number, knockFromZ?: number, sourceLabel?: string) => void;
}

export interface GeminiAutonomousAgentProps {
  config: GeminiAgentConfig;
  lang: 'es' | 'en';
  playerPosRef: React.MutableRefObject<Vector3D>;
  chunksRef: React.MutableRefObject<Record<string, Uint8Array>>;
  savedChunksRef: React.MutableRefObject<Record<string, Uint8Array>>;
  setChunks: React.Dispatch<React.SetStateAction<Record<string, Uint8Array>>>;
  editsRef: React.MutableRefObject<Record<string, number>>;
  entitiesRef: React.MutableRefObject<Record<string, EntityData[]>>;
  particlesRef: React.MutableRefObject<any[]>;
  gameTimeRef: React.MutableRefObject<number>;
  checkSolid: (x: number, y: number, z: number) => boolean;
  hitEntityById: (id: string, opts?: HitEntityOptions) => boolean;
  onBlockEditRef: React.MutableRefObject<
    ((x: number, y: number, z: number, block: BlockType, previousBlock?: BlockType, silent?: boolean) => void) | undefined
  >;
  agentPosRef: React.MutableRefObject<Vector3D>;
  agentBagRef: React.MutableRefObject<Record<number, number>>;
  agentCombatRef?: React.MutableRefObject<AutonomousAgentCombatState>;
  ensureChunkAt?: (wx: number, wz: number) => boolean;
  memoryResetTrigger: number;
  externalChatPrompt?: { id: number; text: string } | null;
  onAgentSpeak?: (msg: string) => void;
  onAgentToast?: (msg: string) => void;
  onAgentTelemetry?: (telemetry: GeminiAgentTelemetry) => void;
}

const MAX_AGENT_HP = 20;
const RESPAWN_DELAY_MS = 4500;
const GEMINI_THOUGHT_INTERVAL_MS = 13000;

const ALWAYS_HOSTILE_SET = new Set<EntityType>([
  EntityType.ZOMBIE,
  EntityType.CREEPER,
  EntityType.SKELETON,
  EntityType.SNOW_SKELETON,
  EntityType.SWAMP_SKELETON,
  EntityType.HOGLIN,
]);

const LOG_BLOCKS = new Set<BlockType>([
  BlockType.LOG,
  BlockType.DARK_LOG,
  BlockType.CHERRY_LOG,
  BlockType.GREY_LOG,
]);

const ORE_BLOCKS = new Set<BlockType>([
  BlockType.DIAMOND_ORE,
  BlockType.GOLD_ORE,
  BlockType.REDSTONE_ORE,
  BlockType.IRON_ORE,
  BlockType.COPPER_ORE,
  BlockType.COAL_ORE,
  BlockType.SULFUR,
  BlockType.NETHER_QUARTZ_ORE,
]);

const STRUCTURAL_BLOCKS = new Set<BlockType>([
  BlockType.WOOD,
  BlockType.GREY_WOOD,
  BlockType.CHERRY_WOOD,
  BlockType.DOOR,
  BlockType.CHEST,
  BlockType.CRAFTING_TABLE,
  BlockType.FURNACE,
  BlockType.TORCH,
  BlockType.BED,
  BlockType.JUKEBOX,
  BlockType.CARTOGRAPHY_TABLE,
  BlockType.WOOL,
  BlockType.CONCRETE,
  BlockType.NETHER_BRICKS,
  BlockType.GLOWSTONE,
  BlockType.OBSIDIAN,
  BlockType.PORTAL,
]);

const DIGGABLE_TERRAIN_BLOCKS = new Set<BlockType>([
  BlockType.STONE,
  BlockType.DIRT,
  BlockType.GRASS,
  BlockType.AUTUMN_GRASS,
  BlockType.DARK_GRASS,
  BlockType.SAND,
  BlockType.GRAVEL,
  BlockType.SNOW,
  BlockType.MOSS,
  BlockType.TERRACOTTA_BROWN,
  BlockType.TERRACOTTA_ORANGE,
  BlockType.TERRACOTTA_RED,
  BlockType.TERRACOTTA_YELLOW,
  BlockType.TERRACOTTA_WHITE,
  BlockType.TERRACOTTA_LIGHT_GRAY,
  BlockType.LEAVES,
  BlockType.AUTUMN_LEAVES,
  BlockType.CHERRY_LEAVES,
  BlockType.DARK_LEAVES,
  BlockType.VINES,
]);

const AABB_POOL = Array.from({ length: 64 }, () => ({
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 0,
  maxY: 0,
  maxZ: 0,
}));

interface BuildStep {
  x: number;
  y: number;
  z: number;
  block: BlockType;
}

interface CampBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const getBlockPriority = (b: BlockType): number => {
  switch (b) {
    case BlockType.DIAMOND_ORE:
      return 120;
    case BlockType.GOLD_ORE:
      return 96;
    case BlockType.REDSTONE_ORE:
      return 92;
    case BlockType.IRON_ORE:
      return 88;
    case BlockType.NETHER_QUARTZ_ORE:
      return 82;
    case BlockType.COPPER_ORE:
    case BlockType.COAL_ORE:
      return 75;
    case BlockType.SULFUR:
      return 68;
    case BlockType.LOG:
    case BlockType.DARK_LOG:
    case BlockType.CHERRY_LOG:
    case BlockType.GREY_LOG:
      return 72;
    case BlockType.STONE:
      return 30;
    case BlockType.DIRT:
    case BlockType.SAND:
    case BlockType.GRAVEL:
    case BlockType.GRASS:
      return 14;
    default:
      return 0;
  }
};

const getMineDuration = (b: BlockType): number => {
  if (b === BlockType.DIAMOND_ORE || b === BlockType.GOLD_ORE || b === BlockType.REDSTONE_ORE) return 0.72;
  if (ORE_BLOCKS.has(b) || b === BlockType.STONE || b === BlockType.TERRACOTTA_BROWN) return 0.52;
  if (LOG_BLOCKS.has(b)) return 0.45;
  return 0.30;
};

const getBestToolForBlock = (b: BlockType): BlockType => {
  if (LOG_BLOCKS.has(b) || b === BlockType.WOOD || b === BlockType.GREY_WOOD || b === BlockType.CHERRY_WOOD) {
    return BlockType.DIAMOND_AXE;
  }
  if (
    b === BlockType.DIRT ||
    b === BlockType.SAND ||
    b === BlockType.GRASS ||
    b === BlockType.AUTUMN_GRASS ||
    b === BlockType.DARK_GRASS ||
    b === BlockType.GRAVEL ||
    b === BlockType.SNOW
  ) {
    return BlockType.IRON_SHOVEL;
  }
  return BlockType.DIAMOND_PICKAXE;
};

const getGoalLabel = (goal: GeminiAgentGoal, lang: 'es' | 'en'): string => {
  const esMap: Record<GeminiAgentGoal, string> = {
    explore_far: '🧭 Explorando mundo',
    chop_trees: '🪵 Talando árboles',
    mine_surface: '🪨 Minando superficie',
    dig_mine: '⛏️ Excavando mina',
    build_camp: '🏠 Base autónoma',
    hunt_mobs: '⚔️ Combate autónomo',
    escape_hazard: '🛟 Evadiendo peligro',
  };
  const enMap: Record<GeminiAgentGoal, string> = {
    explore_far: '🧭 Roaming far',
    chop_trees: '🪵 Chopping trees',
    mine_surface: '🪨 Surface mining',
    dig_mine: '⛏️ Strip-mining',
    build_camp: '🏠 Building camp',
    hunt_mobs: '⚔️ Fighting mobs',
    escape_hazard: '🛟 Escaping hazard',
  };
  return lang === 'en' ? enMap[goal] : esMap[goal];
};

const GeminiAutonomousAgent: React.FC<GeminiAutonomousAgentProps> = ({
  config,
  lang,
  playerPosRef,
  chunksRef,
  savedChunksRef,
  setChunks,
  editsRef,
  entitiesRef,
  particlesRef,
  gameTimeRef,
  checkSolid,
  hitEntityById,
  onBlockEditRef,
  agentPosRef,
  agentBagRef,
  agentCombatRef,
  ensureChunkAt,
  memoryResetTrigger,
  externalChatPrompt,
  onAgentSpeak,
  onAgentToast,
  onAgentTelemetry,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const torsoGroupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const capeRef = useRef<THREE.Mesh>(null);
  const distSpanRef = useRef<HTMLSpanElement>(null);
  const statusSpanRef = useRef<HTMLSpanElement>(null);
  const respawnSpanRef = useRef<HTMLSpanElement>(null);

  const [heldBlock, setHeldBlock] = useState<BlockType>(BlockType.DIAMOND_PICKAXE);
  const heldBlockRef = useRef<BlockType>(BlockType.DIAMOND_PICKAXE);

  // Vitals / combat state
  const hpRef = useRef(MAX_AGENT_HP);
  const [hudHp, setHudHp] = useState(MAX_AGENT_HP);
  const isDeadRef = useRef(false);
  const [isDead, setIsDead] = useState(false);
  const respawnAtMsRef = useRef(0);
  const invulnUntilMsRef = useRef(0);
  const hurtFlashUntilMsRef = useRef(0);
  const lastRegenMsRef = useRef(0);
  const lastAttackerPosRef = useRef<Vector3D | null>(null);
  const lastDamagedAtMsRef = useRef(0);
  const knockbackRef = useRef({ x: 0, z: 0 });
  const prevVelYRef = useRef(0);

  // Physics state stored at eye height
  const posRef = useRef<Vector3D>({
    x: playerPosRef.current.x + 3.2,
    y: playerPosRef.current.y + 1,
    z: playerPosRef.current.z + 3.2,
  });
  const lastSafePosRef = useRef<Vector3D>({ ...posRef.current });
  const velYRef = useRef(0);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const walkPhaseRef = useRef(0);
  const swingProgressRef = useRef(0);
  const isGroundedRef = useRef(false);
  const wasGroundedRef = useRef(false);
  const stuckTimerRef = useRef(0);
  const lastStepToggleRef = useRef(false);
  const lastLavaHurtMsRef = useRef(0);
  const lastTorchPlaceMsRef = useRef(0);
  const lastPillarPlaceMsRef = useRef(0);

  // Gemini Learning & Decision Brain State
  const memoryRef = useRef<GeminiAgentMemory>(loadGeminiAgentMemory());
  const goalRef = useRef<GeminiAgentGoal>('explore_far');
  const targetYRef = useRef<number>(58);
  const headingDegRef = useRef<number>(Math.floor(Math.random() * 360));
  const cautionRef = useRef<'low' | 'balanced' | 'high'>('balanced');
  const geminiConnectedRef = useRef<boolean>(false);
  const geminiErrorRef = useRef<string | null>(null);
  const geminiBusyRef = useRef<boolean>(false);
  const lastGeminiQueryMsRef = useRef<number>(0);
  const lastTelemetryEmitMsRef = useRef<number>(0);
  const lastHandledPromptIdRef = useRef<number>(0);

  // World interaction & pathfinding state
  const scanTimerRef = useRef(0);
  const targetHostileRef = useRef<EntityData | null>(null);
  const lastAttackMsRef = useRef(0);
  const mineTargetRef = useRef<{ x: number; y: number; z: number; block: BlockType; progress: number } | null>(null);
  const tunnelStepTargetRef = useRef<{ x: number; y: number; z: number; block: BlockType; progress: number } | null>(null);
  const unreachableUntilRef = useRef<Map<string, number>>(new Map());
  const buildQueueRef = useRef<BuildStep[]>([]);
  const lastBuildStepMsRef = useRef(0);
  const protectedBlocksRef = useRef<Set<string>>(new Set());
  const builtCampsRef = useRef<CampBounds[]>([]);
  const roamWaypointRef = useRef<{ x: number; z: number; untilMs: number } | null>(null);
  const lastObstacleBreakMsRef = useRef(0);

  const skinPreset = resolveCharacterSkin(config.skinId);

  const updateHeldBlock = (next: BlockType) => {
    if (heldBlockRef.current !== next) {
      heldBlockRef.current = next;
      setHeldBlock(next);
    }
  };

  const getBlockAt = (wx: number, wy: number, wz: number): BlockType => {
    const rx = Math.round(wx);
    const ry = Math.round(wy);
    const rz = Math.round(wz);
    if (ry < 0 || ry >= WORLD_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(rx / CHUNK_SIZE);
    const cz = Math.floor(rz / CHUNK_SIZE);
    const chunk = chunksRef.current[`${cx},${cz}`];
    if (!chunk) return BlockType.AIR;
    const lx = ((rx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((rz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk[lx * CHUNK_SIZE * WORLD_HEIGHT + ry * CHUNK_SIZE + lz] as BlockType;
  };

  const isProtectedBlock = (wx: number, wy: number, wz: number, blk: BlockType): boolean => {
    const rx = Math.round(wx);
    const ry = Math.round(wy);
    const rz = Math.round(wz);
    if (protectedBlocksRef.current.has(`${rx},${ry},${rz}`)) return true;
    for (let i = 0; i < builtCampsRef.current.length; i++) {
      const b = builtCampsRef.current[i];
      if (rx >= b.minX && rx <= b.maxX && ry >= b.minY && ry <= b.maxY && rz >= b.minZ && rz <= b.maxZ) {
        return true;
      }
    }
    return STRUCTURAL_BLOCKS.has(blk);
  };

  const isExposedBlock = (wx: number, wy: number, wz: number): boolean => {
    return (
      !checkSolid(wx + 1, wy, wz) ||
      !checkSolid(wx - 1, wy, wz) ||
      !checkSolid(wx, wy + 1, wz) ||
      !checkSolid(wx, wy - 1, wz) ||
      !checkSolid(wx, wy, wz + 1) ||
      !checkSolid(wx, wy, wz - 1)
    );
  };

  const setWorldBlock = (
    wx: number,
    wy: number,
    wz: number,
    block: BlockType,
    emitParticles = true,
    protectCoord = false
  ): boolean => {
    if (wy < 1 || wy >= WORLD_HEIGHT - 1) return false;
    ensureChunkAt?.(wx, wz);
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const existing = chunksRef.current[k];
    if (!existing) return false;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = lx * CHUNK_SIZE * WORLD_HEIGHT + wy * CHUNK_SIZE + lz;
    const prev = existing[idx] as BlockType;
    if (prev === block || prev === BlockType.BEDROCK) return false;
    if (block === BlockType.AIR && isProtectedBlock(wx, wy, wz, prev)) {
      return false;
    }

    const fresh = new Uint8Array(existing);
    fresh[idx] = block;
    chunksRef.current[k] = fresh;
    savedChunksRef.current[k] = fresh;
    setChunks((prevChunks) => ({ ...prevChunks, [k]: fresh }));

    if (protectCoord && block !== BlockType.AIR) {
      protectedBlocksRef.current.add(`${wx},${wy},${wz}`);
    }
    if (editsRef.current) {
      editsRef.current[`${wx},${wy},${wz}`] = block;
    }
    if (onBlockEditRef.current) {
      onBlockEditRef.current(wx, wy, wz, block, prev, true);
    }

    if (emitParticles) {
      const distSqPlayer =
        Math.pow(wx - playerPosRef.current.x, 2) + Math.pow(wz - playerPosRef.current.z, 2);
      if (distSqPlayer < 45 * 45) {
        const colBlock = block === BlockType.AIR ? prev : block;
        const color = BLOCK_COLORS[colBlock] || '#94a3b8';
        const now = performance.now();
        for (let i = 0; i < 5; i++) {
          particlesRef.current.push({
            id: now + i + Math.random(),
            x: wx + (Math.random() - 0.5) * 0.45,
            y: wy + (Math.random() - 0.5) * 0.45,
            z: wz + (Math.random() - 0.5) * 0.45,
            vx: (Math.random() - 0.5) * 2.0,
            vy: 1.4 + Math.random() * 1.6,
            vz: (Math.random() - 0.5) * 2.0,
            color,
            size: 0.11 + Math.random() * 0.07,
            life: 0.7,
          });
        }
      }
    }
    return true;
  };

  const findSafeSurfaceY = (wx: number, wz: number, hintY: number): number => {
    const rx = Math.round(wx);
    const rz = Math.round(wz);
    ensureChunkAt?.(rx, rz);
    const startY = Math.min(WORLD_HEIGHT - 4, Math.max(8, Math.round(hintY + 20)));
    for (let y = startY; y >= 3; y--) {
      if (checkSolid(rx, y, rz) && !checkSolid(rx, y + 1, rz) && !checkSolid(rx, y + 2, rz)) {
        return y + 2.02;
      }
    }
    for (let y = WORLD_HEIGHT - 4; y >= 4; y--) {
      if (checkSolid(rx, y, rz) && !checkSolid(rx, y + 1, rz) && !checkSolid(rx, y + 2, rz)) {
        return y + 2.02;
      }
    }
    return Math.max(64, hintY + 1);
  };

  const spawnBurstParticles = (x: number, y: number, z: number, color: string, count = 10) => {
    const distSqPlayer =
      Math.pow(x - playerPosRef.current.x, 2) + Math.pow(z - playerPosRef.current.z, 2);
    if (distSqPlayer > 55 * 55) return;
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: now + i + Math.random(),
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + (Math.random() - 0.5) * 0.6,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1.0 + Math.random() * 2.0,
        vz: (Math.random() - 0.5) * 2.4,
        color,
        size: 0.13 + Math.random() * 0.08,
        life: 0.7,
      });
    }
  };

  const pushOutcome = (goal: GeminiAgentGoal, action: string, reward: number, xpGain = 0) => {
    const updated = recordAgentExperience(
      memoryRef.current,
      {
        goal,
        action,
        reward,
        y: Math.round(posRef.current.y - 1.5),
        biome: posRef.current.y < 42 ? 'cave' : 'overworld',
        timestamp: Date.now(),
      },
      xpGain
    );
    memoryRef.current = updated;
    saveGeminiAgentMemory(updated);
  };

  const prepareAutonomousCamp = () => {
    const pos = posRef.current;
    const baseX = Math.round(pos.x);
    const baseZ = Math.round(pos.z);
    ensureChunkAt?.(baseX, baseZ);
    let groundY = Math.round(pos.y - 2);
    for (let y = Math.min(WORLD_HEIGHT - 6, Math.round(pos.y + 3)); y >= Math.max(3, Math.round(pos.y - 6)); y--) {
      if (checkSolid(baseX, y, baseZ) && !checkSolid(baseX, y + 1, baseZ)) {
        groundY = y;
        break;
      }
    }

    const steps: BuildStep[] = [];
    builtCampsRef.current.push({
      minX: baseX - 3,
      maxX: baseX + 3,
      minY: groundY - 1,
      maxY: groundY + 5,
      minZ: baseZ - 3,
      maxZ: baseZ + 3,
    });

    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        steps.push({ x: baseX + dx, y: groundY, z: baseZ + dz, block: BlockType.STONE });
        protectedBlocksRef.current.add(`${baseX + dx},${groundY},${baseZ + dz}`);
      }
    }
    for (let h = 1; h <= 3; h++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const isEdge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (!isEdge) continue;
          const isDoorway = dx === 0 && dz === -2 && h <= 2;
          if (isDoorway) continue;
          const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
          const isWindow = h === 2 && !isCorner && (dx === 0 || dz === 0) && !(dx === 0 && dz === -2);
          if (isWindow) continue;
          steps.push({
            x: baseX + dx,
            y: groundY + h,
            z: baseZ + dz,
            block: isCorner ? BlockType.LOG : BlockType.WOOD,
          });
          protectedBlocksRef.current.add(`${baseX + dx},${groundY + h},${baseZ + dz}`);
        }
      }
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        steps.push({ x: baseX + dx, y: groundY + 4, z: baseZ + dz, block: BlockType.WOOD });
        protectedBlocksRef.current.add(`${baseX + dx},${groundY + 4},${baseZ + dz}`);
      }
    }
    const interior: BuildStep[] = [
      { x: baseX, y: groundY + 1, z: baseZ - 2, block: BlockType.DOOR },
      { x: baseX, y: groundY + 2, z: baseZ - 2, block: BlockType.DOOR },
      { x: baseX - 1, y: groundY + 1, z: baseZ + 1, block: BlockType.CRAFTING_TABLE },
      { x: baseX, y: groundY + 1, z: baseZ + 1, block: BlockType.FURNACE },
      { x: baseX + 1, y: groundY + 1, z: baseZ + 1, block: BlockType.CHEST },
      { x: baseX - 1, y: groundY + 2, z: baseZ - 1, block: BlockType.TORCH },
      { x: baseX + 1, y: groundY + 2, z: baseZ + 1, block: BlockType.TORCH },
    ];
    for (const item of interior) {
      steps.push(item);
      protectedBlocksRef.current.add(`${item.x},${item.y},${item.z}`);
    }
    buildQueueRef.current = steps;
  };

  const selectLocalReinforcedGoal = (): GeminiAgentGoal => {
    const pos = posRef.current;
    const isNight = Math.sin(gameTimeRef.current) < -0.05;
    const bag = agentBagRef.current;
    const logQty =
      (bag[BlockType.LOG] || 0) +
      (bag[BlockType.DARK_LOG] || 0) +
      (bag[BlockType.CHERRY_LOG] || 0) +
      (bag[BlockType.GREY_LOG] || 0);
    const totalRes = Object.values(bag).reduce((a, b) => a + (b || 0), 0);

    // Style bias + learned Q-scores
    const s = memoryRef.current.strategyScores;
    const candidates: { g: GeminiAgentGoal; w: number }[] = [
      { g: 'explore_far', w: (s.explore_far ?? 1) + (config.autonomyStyle === 'explorer' ? 1.5 : 0.3) },
      { g: 'dig_mine', w: (s.dig_mine ?? 1.2) + (config.autonomyStyle === 'miner' ? 1.6 : 0.4) },
      { g: 'mine_surface', w: (s.mine_surface ?? 1.0) + (pos.y > 52 ? 0.4 : 0.1) },
      { g: 'chop_trees', w: (s.chop_trees ?? 1.0) + (logQty < 8 && pos.y > 54 ? 0.9 : -0.3) },
      {
        g: 'build_camp',
        w: (s.build_camp ?? 0.8) + ((isNight && totalRes >= 8) ? 1.4 : -0.5) + (config.autonomyStyle === 'builder' ? 1.2 : 0),
      },
      { g: 'hunt_mobs', w: s.hunt_mobs ?? 0.8 },
    ];

    candidates.sort((a, b) => b.w - a.w);
    // Epsilon-greedy exploration (25% random exploration to keep learning new tactics!)
    if (Math.random() < 0.25) {
      const pool = candidates.slice(0, 4);
      return pool[Math.floor(Math.random() * pool.length)].g;
    }
    return candidates[0].g;
  };

  const triggerGeminiBrainSync = async (
    forcedUserPrompt?: string,
    urgentReason?: string
  ) => {
    if (!config.enabled || geminiBusyRef.current) return;
    geminiBusyRef.current = true;
    lastGeminiQueryMsRef.current = performance.now();

    const pos = posRef.current;
    const lp = playerPosRef.current;
    const dist = Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z);
    const isNight = Math.sin(gameTimeRef.current) < -0.05;
    const feetBlk = getBlockAt(pos.x, pos.y - 1.4, pos.z);
    const waistBlk = getBlockAt(pos.x, pos.y - 0.8, pos.z);

    // Collect compact sensory scan around agent
    const oreCounts: Record<string, number> = {};
    let nearbyLogs = 0;
    const bx = Math.round(pos.x);
    const by = Math.round(pos.y - 1);
    const bz = Math.round(pos.z);
    for (let dx = -8; dx <= 8; dx += 2) {
      for (let dz = -8; dz <= 8; dz += 2) {
        for (let dy = -3; dy <= 4; dy += 2) {
          const blk = getBlockAt(bx + dx, by + dy, bz + dz);
          if (ORE_BLOCKS.has(blk)) {
            const name = BLOCK_NAMES[blk] || `ore_${blk}`;
            oreCounts[name] = (oreCounts[name] || 0) + 1;
          } else if (LOG_BLOCKS.has(blk)) {
            nearbyLogs++;
          }
        }
      }
    }

    const invSummary: Record<string, number> = {};
    for (const [k, qty] of Object.entries(agentBagRef.current)) {
      if ((qty || 0) > 0) {
        invSummary[BLOCK_NAMES[Number(k)] || `blk_${k}`] = qty;
      }
    }

    let nearbyHostiles = 0;
    const buckets = entitiesRef.current;
    for (const ck in buckets) {
      const list = buckets[ck];
      if (!Array.isArray(list)) continue;
      for (let i = 0; i < list.length; i++) {
        const ent = list[i];
        if (!ent?.pos || !ALWAYS_HOSTILE_SET.has(ent.type)) continue;
        if (Math.hypot(ent.pos.x - pos.x, ent.pos.z - pos.z) <= 18) {
          nearbyHostiles++;
        }
      }
    }

    const res = await requestGeminiAgentStep({
      agentName: config.name || 'Gemini IA',
      autonomyStyle: config.autonomyStyle,
      lang,
      position: { x: Math.round(pos.x), y: Math.round(pos.y - 1.5), z: Math.round(pos.z) },
      biome: pos.y < 44 ? 'underground_cave' : waistBlk === BlockType.WATER ? 'ocean' : 'overworld',
      distanceFromPlayer: Math.round(dist),
      hp: Math.ceil(hpRef.current),
      isNight,
      inWater: feetBlk === BlockType.WATER || waistBlk === BlockType.WATER,
      inLava: feetBlk === BlockType.LAVA || waistBlk === BlockType.LAVA,
      nearbyHostiles,
      nearbyOres: Object.entries(oreCounts).map(([n, c]) => `${n}:${c}`),
      nearbyLogs,
      inventorySummary: invSummary,
      memory: memoryRef.current,
      userPrompt: forcedUserPrompt || urgentReason,
    });

    geminiBusyRef.current = false;
    if (!config.enabled) return;

    if (res.ok && res.decision) {
      geminiConnectedRef.current = true;
      geminiErrorRef.current = null;
      const dec = res.decision;
      const nextGoal = dec.goal;
      goalRef.current = nextGoal;
      targetYRef.current = Math.max(10, Math.min(72, Math.round(dec.targetY)));
      headingDegRef.current = ((Math.round(dec.headingDeg) % 360) + 360) % 360;
      cautionRef.current = dec.caution || 'balanced';

      if (nextGoal === 'build_camp' && buildQueueRef.current.length === 0) {
        prepareAutonomousCamp();
      } else if (nextGoal !== 'build_camp') {
        buildQueueRef.current = [];
      }

      const prevMem = memoryRef.current;
      const updatedScores = { ...prevMem.strategyScores };
      if (dec.rewardAdjust) {
        for (const [gKey, adj] of Object.entries(dec.rewardAdjust)) {
          const gk = gKey as GeminiAgentGoal;
          if (typeof adj === 'number' && !Number.isNaN(adj)) {
            updatedScores[gk] = Math.max(-2, Math.min(6, Number(((updatedScores[gk] ?? 1) + adj * 0.25).toFixed(3))));
          }
        }
      }
      const nextLessons = dec.learnedLesson
        ? [...prevMem.learnedLessons.filter((l) => l !== dec.learnedLesson), dec.learnedLesson].slice(-8)
        : prevMem.learnedLessons;
      const nextMemory: GeminiAgentMemory = {
        ...prevMem,
        strategyScores: updatedScores,
        learnedLessons: nextLessons,
        lastThought: dec.thought || prevMem.lastThought,
        lastModel: res.model,
      };
      memoryRef.current = nextMemory;
      saveGeminiAgentMemory(nextMemory);

      if (forcedUserPrompt && dec.chatReply) {
        onAgentSpeak?.(dec.chatReply);
      } else if (dec.thought && !urgentReason && Math.random() < 0.35) {
        onAgentSpeak?.(`🧠 (${Math.round(dist)}m) ${dec.thought}`);
      }
    } else {
      geminiConnectedRef.current = false;
      if (!res.offline && res.error) {
        geminiErrorRef.current = res.error;
      } else {
        geminiErrorRef.current = null;
      }
      // Autonomous local RL policy fallback when offline / server unreachable
      const fallbackGoal = selectLocalReinforcedGoal();
      goalRef.current = fallbackGoal;
      if (fallbackGoal === 'dig_mine') {
        targetYRef.current = Math.random() < 0.45 ? 14 : 30;
      } else if (fallbackGoal === 'explore_far') {
        headingDegRef.current = (headingDegRef.current + (Math.random() - 0.5) * 110 + 360) % 360;
        targetYRef.current = 60;
      } else if (fallbackGoal === 'build_camp' && buildQueueRef.current.length === 0) {
        prepareAutonomousCamp();
      }
      const nextMem = {
        ...memoryRef.current,
        lastThought:
          lang === 'en'
            ? `Local RL policy active (${fallbackGoal})`
            : `Aprendizaje local activo (${getGoalLabel(fallbackGoal, 'es')})`,
      };
      memoryRef.current = nextMem;
      saveGeminiAgentMemory(nextMem);
      if (forcedUserPrompt) {
        onAgentSpeak?.(
          res.error && !res.offline
            ? `⚠️ ${res.error}`
            : `🧠 Aprendiendo localmente en (${Math.round(pos.x)}, ${Math.round(pos.y - 1.5)}, ${Math.round(pos.z)}) — ${getGoalLabel(fallbackGoal, lang)}`
        );
      }
    }
  };

  const applyAgentDamage = (
    amount: number,
    knockFromX?: number,
    knockFromZ?: number,
    sourceLabel?: string
  ) => {
    if (!config.enabled || isDeadRef.current || amount <= 0) return;
    const nowMs = performance.now();
    if (nowMs < invulnUntilMsRef.current) return;

    invulnUntilMsRef.current = nowMs + 450;
    hurtFlashUntilMsRef.current = nowMs + 220;
    lastDamagedAtMsRef.current = nowMs;

    if (typeof knockFromX === 'number' && typeof knockFromZ === 'number') {
      lastAttackerPosRef.current = { x: knockFromX, y: posRef.current.y - 1.5, z: knockFromZ };
      const kdx = posRef.current.x - knockFromX;
      const kdz = posRef.current.z - knockFromZ;
      const klen = Math.hypot(kdx, kdz);
      if (klen > 0.01) {
        knockbackRef.current.x = (kdx / klen) * 6.5;
        knockbackRef.current.z = (kdz / klen) * 6.5;
        velYRef.current = Math.max(velYRef.current, 4.4);
      }
    }

    const nextHp = Math.max(0, Math.round((hpRef.current - amount) * 10) / 10);
    hpRef.current = nextHp;
    setHudHp(Math.ceil(nextHp));
    if (Math.hypot(posRef.current.x - playerPosRef.current.x, posRef.current.z - playerPosRef.current.z) < 28) {
      playHurtSound();
    }
    spawnBurstParticles(posRef.current.x, posRef.current.y - 0.6, posRef.current.z, '#ef4444', 7);

    if (agentCombatRef) {
      agentCombatRef.current.hp = nextHp;
      agentCombatRef.current.lastDamagedAtMs = nowMs;
      agentCombatRef.current.lastAttackerPos = lastAttackerPosRef.current;
    }

    if (nextHp <= 0) {
      isDeadRef.current = true;
      setIsDead(true);
      respawnAtMsRef.current = nowMs + RESPAWN_DELAY_MS;
      targetHostileRef.current = null;
      mineTargetRef.current = null;
      tunnelStepTargetRef.current = null;
      memoryRef.current = {
        ...memoryRef.current,
        deaths: memoryRef.current.deaths + 1,
      };
      pushOutcome(goalRef.current, `death_${sourceLabel || 'hazard'}`, -8.0, 0);
      if (agentCombatRef) {
        agentCombatRef.current.alive = false;
      }
      spawnBurstParticles(posRef.current.x, posRef.current.y - 0.5, posRef.current.z, '#f8fafc', 14);
      onAgentToast?.(`💀 ${config.name || 'Gemini IA'} cayó (${sourceLabel || 'peligro'}). Aprendiendo y reapareciendo...`);
    } else if (nextHp <= 8) {
      pushOutcome(goalRef.current, `heavy_damage_${sourceLabel || 'mob'}`, -3.5, 0);
      if (nowMs - lastGeminiQueryMsRef.current > 4500) {
        triggerGeminiBrainSync(undefined, `Took heavy damage from ${sourceLabel || 'hazard'} (HP=${nextHp}).`);
      }
    }
  };

  const applyDamageRef = useRef(applyAgentDamage);
  applyDamageRef.current = applyAgentDamage;

  // Handle memory reset from UI
  useEffect(() => {
    if (memoryResetTrigger === 0) return;
    memoryRef.current = loadGeminiAgentMemory();
  }, [memoryResetTrigger]);

  // Handle chat prompts sent directly to Gemini agent
  useEffect(() => {
    if (!config.enabled || !externalChatPrompt) return;
    if (externalChatPrompt.id === lastHandledPromptIdRef.current) return;
    lastHandledPromptIdRef.current = externalChatPrompt.id;
    triggerGeminiBrainSync(externalChatPrompt.text);
  }, [externalChatPrompt, config.enabled]);

  // Register combat bridge when enabled
  useEffect(() => {
    if (!agentCombatRef) return;
    if (!config.enabled) {
      agentCombatRef.current.alive = false;
      return;
    }
    agentCombatRef.current.alive = !isDeadRef.current;
    agentCombatRef.current.hp = hpRef.current;
    agentCombatRef.current.maxHp = MAX_AGENT_HP;
    agentCombatRef.current.pos = { ...posRef.current };
    agentCombatRef.current.damage = (amt, kx, kz, label) => applyDamageRef.current(amt, kx, kz, label);
    return () => {
      agentCombatRef.current.alive = false;
    };
  }, [config.enabled, agentCombatRef]);

  // Initial spawn near player ONCE when turned on, then completely free to roam forever
  useEffect(() => {
    if (!config.enabled) return;
    const lp = playerPosRef.current;
    const sx = Math.round(lp.x + 3.2);
    const sz = Math.round(lp.z + 3.2);
    const sy = findSafeSurfaceY(sx, sz, lp.y);
    posRef.current = { x: sx, y: sy, z: sz };
    lastSafePosRef.current = { x: sx, y: sy, z: sz };
    velYRef.current = 0;
    hpRef.current = MAX_AGENT_HP;
    setHudHp(MAX_AGENT_HP);
    isDeadRef.current = false;
    setIsDead(false);
    knockbackRef.current = { x: 0, z: 0 };
    agentPosRef.current = { ...posRef.current };
    mineTargetRef.current = null;
    tunnelStepTargetRef.current = null;
    roamWaypointRef.current = null;
    if (agentCombatRef) {
      agentCombatRef.current.alive = true;
      agentCombatRef.current.hp = MAX_AGENT_HP;
      agentCombatRef.current.pos = { ...posRef.current };
      agentCombatRef.current.damage = (amt, kx, kz, label) => applyDamageRef.current(amt, kx, kz, label);
    }
    triggerGeminiBrainSync(undefined, 'Agent just spawned into world and is ready to explore & learn independently.');
  }, [config.enabled]);

  useFrame((state, delta) => {
    if (!config.enabled || !groupRef.current) return;
    const minDelta = Math.min(delta, 0.08);
    const nowMs = performance.now();
    const lp = playerPosRef.current;
    const pos = posRef.current;

    // --- Death & Independent Respawn Cycle (respawns in its own explored region, NEVER forced back to player) ---
    if (isDeadRef.current) {
      if (agentCombatRef) agentCombatRef.current.alive = false;
      const remSec = Math.max(1, Math.ceil((respawnAtMsRef.current - nowMs) / 1000));
      if (respawnSpanRef.current) {
        const nextTxt = `💀 Reapareciendo en ${remSec}s...`;
        if (respawnSpanRef.current.textContent !== nextTxt) respawnSpanRef.current.textContent = nextTxt;
      }
      if (nowMs >= respawnAtMsRef.current) {
        const anchor = lastSafePosRef.current;
        const sx = anchor.x + (Math.random() - 0.5) * 4;
        const sz = anchor.z + (Math.random() - 0.5) * 4;
        const sy = findSafeSurfaceY(Math.round(sx), Math.round(sz), 64);
        pos.x = sx;
        pos.y = sy;
        pos.z = sz;
        velYRef.current = 0;
        knockbackRef.current = { x: 0, z: 0 };
        hpRef.current = MAX_AGENT_HP;
        setHudHp(MAX_AGENT_HP);
        isDeadRef.current = false;
        setIsDead(false);
        invulnUntilMsRef.current = nowMs + 2000;
        lastDamagedAtMsRef.current = 0;
        lastAttackerPosRef.current = null;
        targetHostileRef.current = null;
        mineTargetRef.current = null;
        tunnelStepTargetRef.current = null;
        roamWaypointRef.current = null;
        agentPosRef.current = { x: sx, y: sy, z: sz };
        groupRef.current.position.set(sx, sy - 1.5, sz);
        if (agentCombatRef) {
          agentCombatRef.current.alive = true;
          agentCombatRef.current.hp = MAX_AGENT_HP;
          agentCombatRef.current.pos = { x: sx, y: sy, z: sz };
          agentCombatRef.current.lastAttackerPos = null;
        }
        goalRef.current = 'explore_far';
        targetYRef.current = 60;
        triggerGeminiBrainSync(undefined, 'Agent respawned after dying; adjust strategy safely.');
      }
      return;
    }

    const distToPlayer = Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z);
    if (distToPlayer > memoryRef.current.maxDistanceReached) {
      memoryRef.current = {
        ...memoryRef.current,
        maxDistanceReached: Math.round(distToPlayer),
      };
    }

    // Ensure chunks exist around the agent regardless of how far away from the player it is!
    const hRad = (headingDegRef.current * Math.PI) / 180;
    const aheadChunkX = pos.x + Math.cos(hRad) * 14;
    const aheadChunkZ = pos.z + Math.sin(hRad) * 14;
    ensureChunkAt?.(pos.x, pos.z);
    ensureChunkAt?.(aheadChunkX, aheadChunkZ);

    // Rescue from world void (< 1) onto local surface (still stays in its own distant area!)
    if (pos.y < 1) {
      pos.y = findSafeSurfaceY(Math.round(pos.x), Math.round(pos.z), 64);
      velYRef.current = 0;
      knockbackRef.current = { x: 0, z: 0 };
      mineTargetRef.current = null;
      tunnelStepTargetRef.current = null;
    }

    // Periodic Gemini Cloud Sync
    if (nowMs - lastGeminiQueryMsRef.current >= GEMINI_THOUGHT_INTERVAL_MS && !geminiBusyRef.current) {
      triggerGeminiBrainSync();
    }

    // Periodic Telemetry Snapshot to HUD (2Hz)
    if (onAgentTelemetry && nowMs - lastTelemetryEmitMsRef.current >= 500) {
      lastTelemetryEmitMsRef.current = nowMs;
      onAgentTelemetry({
        pos: { x: pos.x, y: pos.y - 1.5, z: pos.z },
        distanceFromPlayer: Math.round(distToPlayer),
        hp: Math.ceil(hpRef.current),
        maxHp: MAX_AGENT_HP,
        alive: !isDeadRef.current,
        goal: goalRef.current,
        targetY: targetYRef.current,
        statusLabel: getGoalLabel(goalRef.current, lang),
        biome: pos.y < 44 ? 'Cueva' : 'Superficie',
        geminiConnected: geminiConnectedRef.current,
        geminiError: geminiErrorRef.current,
        modelName: memoryRef.current.lastModel || 'gemini-4-hydrogen',
        bagSummary: { ...agentBagRef.current },
        memory: memoryRef.current,
      });
    }

    // --- 4Hz Environment, Threat, and Mining Scanner ---
    scanTimerRef.current += minDelta;
    if (scanTimerRef.current >= 0.25) {
      scanTimerRef.current = 0;

      if (isGroundedRef.current && getBlockAt(pos.x, pos.y - 1.4, pos.z) !== BlockType.LAVA) {
        lastSafePosRef.current = { x: pos.x, y: pos.y, z: pos.z };
      }

      // Passive health regen
      if (
        hpRef.current < MAX_AGENT_HP &&
        nowMs - lastDamagedAtMsRef.current > 4500 &&
        nowMs - lastRegenMsRef.current > 3200 &&
        !targetHostileRef.current
      ) {
        lastRegenMsRef.current = nowMs;
        const healed = Math.min(MAX_AGENT_HP, hpRef.current + 1);
        hpRef.current = healed;
        setHudHp(Math.ceil(healed));
        if (agentCombatRef) agentCombatRef.current.hp = healed;
      }

      // 1. Scan hostile mobs near the agent
      const radiusSq = 18 * 18;
      const recentlyAttacked = nowMs - lastDamagedAtMsRef.current < 3500 && lastAttackerPosRef.current;
      let bestMob: EntityData | null = null;
      let bestMobScore = Infinity;
      const buckets = entitiesRef.current;
      for (const ck in buckets) {
        const list = buckets[ck];
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) {
          const ent = list[i];
          if (!ent?.pos) continue;
          const isAlwaysHostile = ALWAYS_HOSTILE_SET.has(ent.type);
          const isEndermanThreat =
            ent.type === EntityType.ENDERMAN &&
            (Boolean((ent as any).isAngry) || Math.hypot(ent.pos.x - pos.x, ent.pos.z - pos.z) < 8);
          const isPiglinThreat = ent.type === EntityType.ZOMBIFIED_PIGLIN && Boolean((ent as any).isAngry);
          if (!isAlwaysHostile && !isEndermanThreat && !isPiglinThreat) continue;

          const dx = ent.pos.x - pos.x;
          const dy = ent.pos.y - (pos.y - 1.5);
          const dz = ent.pos.z - pos.z;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq > radiusSq) continue;

          let score = dSq;
          if (recentlyAttacked && lastAttackerPosRef.current) {
            const dAttSq =
              Math.pow(ent.pos.x - lastAttackerPosRef.current.x, 2) +
              Math.pow(ent.pos.z - lastAttackerPosRef.current.z, 2);
            if (dAttSq < 12) score *= 0.35;
          }
          if (score < bestMobScore) {
            bestMobScore = score;
            bestMob = ent;
          }
        }
      }
      targetHostileRef.current = bestMob;

      // 2. Scan for nearby exposed Ores or Trees (never mines its own protected camp blocks)
      if (!bestMob && !mineTargetRef.current && goalRef.current !== 'build_camp') {
        const baseX = Math.round(pos.x);
        const baseY = Math.round(pos.y - 1);
        const baseZ = Math.round(pos.z);
        const scanR = goalRef.current === 'dig_mine' || goalRef.current === 'mine_surface' ? 9 : 7;
        let bestCand: { x: number; y: number; z: number; block: BlockType; score: number } | null = null;

        for (let ox = -scanR; ox <= scanR; ox++) {
          for (let oz = -scanR; oz <= scanR; oz++) {
            for (let oy = -3; oy <= 5; oy++) {
              const wx = baseX + ox;
              const wy = baseY + oy;
              const wz = baseZ + oz;
              if (wy <= 2 || wy >= WORLD_HEIGHT - 2) continue;

              const key = `${wx},${wy},${wz}`;
              const until = unreachableUntilRef.current.get(key);
              if (until && until > nowMs) continue;

              const blk = getBlockAt(wx, wy, wz);
              if (blk === BlockType.AIR || blk === BlockType.WATER || blk === BlockType.LAVA) continue;
              const prio = getBlockPriority(blk);
              if (prio < 65) continue; // Only actively seek Ores or Logs; tunnel digger handles stone/dirt!
              if (goalRef.current === 'chop_trees' && !LOG_BLOCKS.has(blk)) continue;
              if (isProtectedBlock(wx, wy, wz, blk)) continue;
              if (!isExposedBlock(wx, wy, wz)) continue;

              // Skip blocks submerged deeply underwater unless close
              if (getBlockAt(wx, wy + 1, wz) === BlockType.WATER && getBlockAt(wx, wy + 2, wz) === BlockType.WATER) {
                continue;
              }

              const dist = Math.hypot(ox, oy * 1.3, oz);
              const trunkBonus = LOG_BLOCKS.has(blk) && oy <= 1 ? 10 : 0;
              const score = prio + trunkBonus - dist * 4.2;
              if (!bestCand || score > bestCand.score) {
                bestCand = { x: wx, y: wy, z: wz, block: blk, score };
              }
            }
          }
        }
        if (bestCand) {
          mineTargetRef.current = {
            x: bestCand.x,
            y: bestCand.y,
            z: bestCand.z,
            block: bestCand.block,
            progress: 0,
          };
          tunnelStepTargetRef.current = null;
        }
      }

      // 3. Auto-place torch in dark caves/mines or at night
      const isNight = Math.sin(gameTimeRef.current) < -0.05;
      if ((isNight || pos.y < 52) && nowMs - lastTorchPlaceMsRef.current > 8500 && isGroundedRef.current) {
        const tx = Math.round(pos.x);
        const ty = Math.round(pos.y - 1.2);
        const tz = Math.round(pos.z);
        if (getBlockAt(tx, ty, tz) === BlockType.AIR && checkSolid(tx, ty - 1, tz)) {
          let hasTorchNear = false;
          for (let dx = -5; dx <= 5 && !hasTorchNear; dx += 2) {
            for (let dz = -5; dz <= 5; dz += 2) {
              if (getBlockAt(tx + dx, ty, tz + dz) === BlockType.TORCH) {
                hasTorchNear = true;
                break;
              }
            }
          }
          if (!hasTorchNear && setWorldBlock(tx, ty, tz, BlockType.TORCH, false, true)) {
            lastTorchPlaceMsRef.current = nowMs;
            if (distToPlayer < 24) playPlaceSound(BlockType.TORCH);
          }
        }
      }
    }

    // --- Action & Navigation Decision ---
    let moveGoalX: number | null = null;
    let moveGoalZ: number | null = null;
    let desiredDist = 0.6;
    let moveSpeed = 4.8;
    let lookTarget: Vector3D | null = null;
    let statusLabel = getGoalLabel(goalRef.current, lang);
    let wantPathClear = true;

    const hostile = targetHostileRef.current;
    const feetBlkNow = getBlockAt(pos.x, pos.y - 1.4, pos.z);
    const waistBlkNow = getBlockAt(pos.x, pos.y - 0.8, pos.z);
    const isInWater = feetBlkNow === BlockType.WATER || waistBlkNow === BlockType.WATER;
    const isInLava = feetBlkNow === BlockType.LAVA || waistBlkNow === BlockType.LAVA;
    const isInFire = feetBlkNow === BlockType.FIRE || waistBlkNow === BlockType.FIRE;

    if (isInLava && nowMs - lastLavaHurtMsRef.current > 650) {
      lastLavaHurtMsRef.current = nowMs;
      velYRef.current = 7.5;
      // Learned hazard avoidance: turn away from lava & log negative reward!
      headingDegRef.current = (headingDegRef.current + 145) % 360;
      applyAgentDamage(4, pos.x, pos.z, 'Lava');
      if (isDeadRef.current) return;
    } else if (isInFire && nowMs - lastLavaHurtMsRef.current > 850) {
      lastLavaHurtMsRef.current = nowMs;
      applyAgentDamage(1, pos.x, pos.z, 'Fuego');
      if (isDeadRef.current) return;
    }

    if (hostile && hostile.pos) {
      statusLabel = '⚔️ Combate';
      updateHeldBlock(BlockType.DIAMOND_SWORD);
      lookTarget = { x: hostile.pos.x, y: hostile.pos.y + 1.0, z: hostile.pos.z };
      const distMobFlat = Math.hypot(hostile.pos.x - pos.x, hostile.pos.z - pos.z);
      const distMob3D = Math.hypot(hostile.pos.x - pos.x, hostile.pos.y - (pos.y - 1.5), hostile.pos.z - pos.z);

      if (hostile.type === EntityType.CREEPER && distMobFlat < 2.6 && nowMs - lastAttackMsRef.current < 520) {
        moveGoalX = pos.x - (hostile.pos.x - pos.x);
        moveGoalZ = pos.z - (hostile.pos.z - pos.z);
        desiredDist = 0;
        moveSpeed = 5.6;
      } else {
        moveGoalX = hostile.pos.x;
        moveGoalZ = hostile.pos.z;
        desiredDist = hostile.type === EntityType.CREEPER ? 2.2 : 1.55;
        moveSpeed = 5.7;
      }

      if (distMob3D <= 3.6 && Math.abs(hostile.pos.y - (pos.y - 1.5)) <= 2.7 && nowMs - lastAttackMsRef.current > 600) {
        lastAttackMsRef.current = nowMs;
        swingProgressRef.current = 1.0;
        if (distToPlayer < 24) playAttackSwingSound();
        const killed = hitEntityById(hostile.id, {
          damage: 15,
          attackerPos: { x: pos.x, y: pos.y, z: pos.z },
          isCompanion: true,
        });
        if (killed) {
          memoryRef.current = {
            ...memoryRef.current,
            mobsDefeated: memoryRef.current.mobsDefeated + 1,
          };
          pushOutcome('hunt_mobs', `defeated_${hostile.type}`, 3.5, 10);
        }
      }
    } else if (goalRef.current === 'build_camp') {
      if (buildQueueRef.current.length === 0) {
        memoryRef.current = {
          ...memoryRef.current,
          campsBuilt: memoryRef.current.campsBuilt + 1,
        };
        pushOutcome('build_camp', 'camp_completed', 4.0, 15);
        goalRef.current = 'explore_far';
        roamWaypointRef.current = null;
      } else {
        const step = buildQueueRef.current[0];
        statusLabel = '🏠 Construyendo base';
        updateHeldBlock(step.block);
        lookTarget = { x: step.x, y: step.y, z: step.z };

        const dStep = Math.hypot(step.x - pos.x, step.z - pos.z);
        if (dStep > 4.2) {
          moveGoalX = step.x;
          moveGoalZ = step.z;
          desiredDist = 2.6;
          moveSpeed = 4.9;
        } else if (dStep < 0.85 && Math.abs(step.y - (pos.y - 0.5)) < 1.5) {
          moveGoalX = pos.x - (step.x - pos.x);
          moveGoalZ = pos.z - (step.z - pos.z);
          desiredDist = 0;
        }

        if (dStep <= 4.8 && nowMs - lastBuildStepMsRef.current >= 220) {
          lastBuildStepMsRef.current = nowMs;
          const currentAtStep = getBlockAt(step.x, step.y, step.z);
          protectedBlocksRef.current.add(`${step.x},${step.y},${step.z}`);
          if (currentAtStep === BlockType.AIR || currentAtStep === BlockType.WATER) {
            const overlapsPlayer =
              Math.abs(step.x - lp.x) < 0.75 &&
              Math.abs(step.z - lp.z) < 0.75 &&
              step.y >= lp.y - 1.5 &&
              step.y <= lp.y + 0.3 &&
              step.block !== BlockType.DOOR &&
              step.block !== BlockType.TORCH;
            if (!overlapsPlayer) {
              setWorldBlock(step.x, step.y, step.z, step.block, true, true);
              swingProgressRef.current = 1.0;
              if (distToPlayer < 24) playPlaceSound(step.block);
            }
          }
          buildQueueRef.current.shift();
        }
      }
    } else if (mineTargetRef.current) {
      // Exposed Ore / Tree Vein-Mining
      const m = mineTargetRef.current;
      const actualNow = getBlockAt(m.x, m.y, m.z);
      if (actualNow === BlockType.AIR || actualNow === BlockType.BEDROCK || isProtectedBlock(m.x, m.y, m.z, actualNow)) {
        mineTargetRef.current = null;
      } else {
        statusLabel = LOG_BLOCKS.has(actualNow) ? '🪵 Talando árbol' : `⛏️ Minando ${BLOCK_NAMES[actualNow] || 'mineral'}`;
        updateHeldBlock(getBestToolForBlock(actualNow));
        lookTarget = { x: m.x, y: m.y, z: m.z };
        const dMineFlat = Math.hypot(m.x - pos.x, m.z - pos.z);
        const dMine3D = Math.hypot(m.x - pos.x, m.y - (pos.y - 0.5), m.z - pos.z);

        if (dMine3D > 4.0 || dMineFlat > 3.3) {
          moveGoalX = m.x;
          moveGoalZ = m.z;
          desiredDist = 1.85;
          moveSpeed = 5.0;
        } else {
          m.progress += minDelta;
          if (swingProgressRef.current <= 0.05) swingProgressRef.current = 1.0;
          if (m.progress >= getMineDuration(actualNow)) {
            if (setWorldBlock(m.x, m.y, m.z, BlockType.AIR, true)) {
              if (distToPlayer < 24) playBreakSound(actualNow);
              agentBagRef.current[actualNow] = (agentBagRef.current[actualNow] || 0) + 1;
              const isOre = ORE_BLOCKS.has(actualNow);
              const reward =
                actualNow === BlockType.DIAMOND_ORE
                  ? 6.0
                  : actualNow === BlockType.GOLD_ORE || actualNow === BlockType.IRON_ORE
                    ? 3.8
                    : isOre
                      ? 2.5
                      : 1.8;
              const xpGain = actualNow === BlockType.DIAMOND_ORE ? 14 : isOre ? 6 : 3;
              memoryRef.current = {
                ...memoryRef.current,
                blocksMined: memoryRef.current.blocksMined + 1,
                oresFound: memoryRef.current.oresFound + (isOre ? 1 : 0),
              };
              pushOutcome(
                LOG_BLOCKS.has(actualNow) ? 'chop_trees' : goalRef.current === 'dig_mine' ? 'dig_mine' : 'mine_surface',
                `mined_${BLOCK_NAMES[actualNow] || actualNow}`,
                reward,
                xpGain
              );
            }
            // Chain adjacent vein or log trunk
            let nextVein: { x: number; y: number; z: number; block: BlockType; progress: number } | null = null;
            for (let ox = -1; ox <= 1 && !nextVein; ox++) {
              for (let oz = -1; oz <= 1 && !nextVein; oz++) {
                for (let oy = -1; oy <= 2; oy++) {
                  if (ox === 0 && oy === 0 && oz === 0) continue;
                  const nx = m.x + ox;
                  const ny = m.y + oy;
                  const nz = m.z + oz;
                  if (ny <= 2 || ny >= WORLD_HEIGHT - 2) continue;
                  const nb = getBlockAt(nx, ny, nz);
                  const sameFamily = nb === actualNow || (LOG_BLOCKS.has(actualNow) && LOG_BLOCKS.has(nb));
                  if (sameFamily && !isProtectedBlock(nx, ny, nz, nb)) {
                    if (Math.hypot(nx - pos.x, ny - (pos.y - 0.5), nz - pos.z) <= 4.7) {
                      nextVein = { x: nx, y: ny, z: nz, block: nb, progress: 0 };
                      break;
                    }
                  }
                }
              }
            }
            mineTargetRef.current = nextVein;
          }
        }
      }
    } else if (goalRef.current === 'dig_mine' || goalRef.current === 'mine_surface') {
      // PROPER STAIRCASE & HORIZONTAL TUNNEL MINING!
      const feetY = Math.round(pos.y - 1.5);
      const wantY = goalRef.current === 'dig_mine' ? targetYRef.current : Math.max(46, feetY);
      const stepDeltaY = feetY > wantY + 1 ? -1 : feetY < wantY - 2 ? 1 : 0;

      const fwdX = Math.cos(hRad);
      const fwdZ = Math.sin(hRad);
      const ax = Math.round(pos.x + fwdX * 1.15);
      const az = Math.round(pos.z + fwdZ * 1.15);

      // Lava / Water breach safety check ahead before carving!
      let hazardAhead = false;
      for (let checkY = feetY + stepDeltaY - 1; checkY <= feetY + stepDeltaY + 2; checkY++) {
        const cb = getBlockAt(ax, checkY, az);
        if (cb === BlockType.LAVA || cb === BlockType.WATER) {
          hazardAhead = true;
          break;
        }
      }
      if (hazardAhead) {
        headingDegRef.current = (headingDegRef.current + 90) % 360;
        tunnelStepTargetRef.current = null;
        pushOutcome('dig_mine', 'avoided_fluid_vein', 1.0, 2);
      } else {
        // Determine blocks to carve for a clean 2-3 block tall walkable stepped tunnel
        const carveHeights =
          stepDeltaY < 0
            ? [feetY + 1, feetY, feetY - 1]
            : stepDeltaY > 0
              ? [feetY + 3, feetY + 2, feetY + 1]
              : [feetY + 1, feetY];

        if (!tunnelStepTargetRef.current) {
          for (const cy of carveHeights) {
            if (cy <= 2 || cy >= WORLD_HEIGHT - 2) continue;
            const blk = getBlockAt(ax, cy, az);
            if (blk !== BlockType.AIR && blk !== BlockType.TORCH && blk !== BlockType.BEDROCK && !isProtectedBlock(ax, cy, az, blk)) {
              tunnelStepTargetRef.current = { x: ax, y: cy, z: az, block: blk, progress: 0 };
              break;
            }
          }
        }

        if (tunnelStepTargetRef.current) {
          const ts = tunnelStepTargetRef.current;
          const curBlk = getBlockAt(ts.x, ts.y, ts.z);
          if (curBlk === BlockType.AIR || curBlk === BlockType.BEDROCK || isProtectedBlock(ts.x, ts.y, ts.z, curBlk)) {
            tunnelStepTargetRef.current = null;
          } else {
            statusLabel = stepDeltaY < 0 ? `⛏️ Bajando a Y:${wantY}` : `⛏️ Túnel Y:${feetY}`;
            updateHeldBlock(getBestToolForBlock(curBlk));
            lookTarget = { x: ts.x, y: ts.y, z: ts.z };
            const dTs = Math.hypot(ts.x - pos.x, ts.z - pos.z);
            if (dTs > 2.8) {
              moveGoalX = ts.x;
              moveGoalZ = ts.z;
              desiredDist = 1.1;
              moveSpeed = 4.4;
            } else {
              ts.progress += minDelta;
              if (swingProgressRef.current <= 0.05) swingProgressRef.current = 1.0;
              if (ts.progress >= getMineDuration(curBlk)) {
                if (setWorldBlock(ts.x, ts.y, ts.z, BlockType.AIR, true)) {
                  if (distToPlayer < 24) playBreakSound(curBlk);
                  agentBagRef.current[curBlk] = (agentBagRef.current[curBlk] || 0) + 1;
                  memoryRef.current = {
                    ...memoryRef.current,
                    blocksMined: memoryRef.current.blocksMined + 1,
                  };
                }
                tunnelStepTargetRef.current = null;
              }
            }
          }
        } else {
          // Tunnel slice clear — step forward cleanly!
          // If climbing upward and no floor under next step, place stone bridge
          if (stepDeltaY > 0 && !checkSolid(ax, feetY, az) && nowMs - lastPillarPlaceMsRef.current > 450) {
            lastPillarPlaceMsRef.current = nowMs;
            setWorldBlock(ax, feetY, az, BlockType.STONE, false);
          }
          // If descending and void below next step, bridge safely
          if (stepDeltaY <= 0 && !checkSolid(ax, feetY + stepDeltaY - 1, az) && !checkSolid(ax, feetY + stepDeltaY - 2, az)) {
            setWorldBlock(ax, feetY + stepDeltaY - 1, az, BlockType.STONE, false);
          }
          moveGoalX = pos.x + fwdX * 4;
          moveGoalZ = pos.z + fwdZ * 4;
          desiredDist = 0.2;
          moveSpeed = 4.3;
          statusLabel = stepDeltaY < 0 ? `⛏️ Excavando Y:${wantY}` : `⛏️ Explorando mina`;
          updateHeldBlock(BlockType.DIAMOND_PICKAXE);
        }
      }
    } else {
      // Independent Far-Range Exploration (UNLIMITED distance from player!)
      statusLabel = '🧭 Explorando sin límites';
      updateHeldBlock(BlockType.IRON_PICKAXE);

      const feetY = Math.round(pos.y - 1.5);
      // If stuck underground while Gemini wants surface exploration, pillar / dig upward cleanly!
      if (feetY < 50 && isGroundedRef.current && nowMs - lastPillarPlaceMsRef.current > 650) {
        const headAbove = getBlockAt(Math.round(pos.x), Math.round(pos.y + 1), Math.round(pos.z));
        if (headAbove === BlockType.AIR) {
          lastPillarPlaceMsRef.current = nowMs;
          velYRef.current = 7.8;
          setWorldBlock(Math.round(pos.x), feetY, Math.round(pos.z), BlockType.STONE, false);
        } else if (headAbove !== BlockType.BEDROCK && !isProtectedBlock(pos.x, pos.y + 1, pos.z, headAbove)) {
          setWorldBlock(Math.round(pos.x), Math.round(pos.y + 1), Math.round(pos.z), BlockType.AIR, true);
        }
      }

      const needNewWaypoint =
        !roamWaypointRef.current ||
        nowMs > roamWaypointRef.current.untilMs ||
        Math.hypot(roamWaypointRef.current.x - pos.x, roamWaypointRef.current.z - pos.z) < 2.5;

      if (needNewWaypoint) {
        const angRad = (headingDegRef.current * Math.PI) / 180 + (Math.random() - 0.5) * 0.65;
        const stepDist = 36 + Math.random() * 64;
        const wx = pos.x + Math.cos(angRad) * stepDist;
        const wz = pos.z + Math.sin(angRad) * stepDist;
        ensureChunkAt?.(wx, wz);
        roamWaypointRef.current = { x: wx, z: wz, untilMs: nowMs + 15000 };
      }

      if (roamWaypointRef.current) {
        moveGoalX = roamWaypointRef.current.x;
        moveGoalZ = roamWaypointRef.current.z;
        desiredDist = 1.2;
        moveSpeed = 5.0;
      }
    }

    if (isInWater) {
      statusLabel = '🏊 Nadando';
      moveSpeed *= 0.85;
    }

    // --- Horizontal Movement Vector ---
    let vx = 0;
    let vz = 0;
    let isMoving = false;
    if (moveGoalX !== null && moveGoalZ !== null) {
      const toX = moveGoalX - pos.x;
      const toZ = moveGoalZ - pos.z;
      const flatDist = Math.hypot(toX, toZ);
      if (flatDist > desiredDist) {
        vx = (toX / flatDist) * moveSpeed;
        vz = (toZ / flatDist) * moveSpeed;
        isMoving = true;
        if (!lookTarget) {
          const targetYaw = Math.atan2(toX, toZ);
          let diff = targetYaw - yawRef.current;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          yawRef.current += diff * Math.min(1, minDelta * 9);
          pitchRef.current = THREE.MathUtils.damp(pitchRef.current, 0, 8, minDelta);
        }
      }
    }

    if (lookTarget) {
      const ldx = lookTarget.x - pos.x;
      const ldy = lookTarget.y - pos.y;
      const ldz = lookTarget.z - pos.z;
      const targetYaw = Math.atan2(ldx, ldz);
      let diff = targetYaw - yawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      yawRef.current += diff * Math.min(1, minDelta * 11);
      const flatL = Math.max(0.1, Math.hypot(ldx, ldz));
      const targetPitch = Math.max(-0.9, Math.min(0.9, Math.atan2(ldy, flatL)));
      pitchRef.current = THREE.MathUtils.damp(pitchRef.current, targetPitch, 10, minDelta);
    }

    // Apply Knockback Decay
    if (Math.abs(knockbackRef.current.x) > 0.05 || Math.abs(knockbackRef.current.z) > 0.05) {
      vx += knockbackRef.current.x;
      vz += knockbackRef.current.z;
      const decay = Math.exp(-8 * minDelta);
      knockbackRef.current.x *= decay;
      knockbackRef.current.z *= decay;
    }

    // --- Gravity & Water Buoyancy ---
    prevVelYRef.current = velYRef.current;
    if (isInWater) {
      const targetVy = waistBlkNow === BlockType.WATER ? 3.5 : 0.5;
      velYRef.current += (targetVy - velYRef.current) * Math.min(1, minDelta * 6);
    } else {
      velYRef.current -= 24.0 * minDelta;
      if (velYRef.current < -32) velYRef.current = -32;
    }

    const dx = vx * minDelta;
    const dz = vz * minDelta;
    const dy = velYRef.current * minDelta;

    const r = 0.28;
    const hBottom = 1.5;
    const hTop = 0.28;

    const minBx = Math.floor(pos.x - r - Math.abs(dx) - 0.5);
    const maxBx = Math.ceil(pos.x + r + Math.abs(dx) + 0.5);
    const minBy = Math.floor(pos.y - hBottom - Math.abs(dy) - 0.5);
    const maxBy = Math.ceil(pos.y + hTop + Math.abs(dy) + 0.5);
    const minBz = Math.floor(pos.z - r - Math.abs(dz) - 0.5);
    const maxBz = Math.ceil(pos.z + r + Math.abs(dz) + 0.5);

    let boxCount = 0;
    for (let bx = minBx; bx <= maxBx && boxCount < AABB_POOL.length; bx++) {
      for (let by = minBy; by <= maxBy && boxCount < AABB_POOL.length; by++) {
        for (let bz = minBz; bz <= maxBz && boxCount < AABB_POOL.length; bz++) {
          if (checkSolid(bx, by, bz)) {
            const b = AABB_POOL[boxCount++];
            b.minX = bx - 0.5;
            b.minY = by - 0.5;
            b.minZ = bz - 0.5;
            b.maxX = bx + 0.5;
            b.maxY = by + 0.5;
            b.maxZ = bz + 0.5;
          }
        }
      }
    }

    const eps = 0.001;
    let nx = pos.x;
    let ny = pos.y + dy;
    let nz = pos.z;
    wasGroundedRef.current = isGroundedRef.current;
    isGroundedRef.current = false;

    for (let i = 0; i < boxCount; i++) {
      const b = AABB_POOL[i];
      if (nx + r > b.minX && nx - r < b.maxX && nz + r > b.minZ && nz - r < b.maxZ) {
        if (ny - hBottom < b.maxY && ny + hTop > b.minY) {
          if (dy <= 0 && pos.y - hBottom >= b.maxY - 0.25) {
            ny = b.maxY + hBottom + eps;
            velYRef.current = 0;
            isGroundedRef.current = true;
          } else if (dy > 0 && pos.y + hTop <= b.minY + 0.25) {
            ny = b.minY - hTop - eps;
            velYRef.current = 0;
          }
        }
      }
    }

    if (!wasGroundedRef.current && isGroundedRef.current && !isInWater && prevVelYRef.current < -14.0) {
      const fallDmg = Math.max(1, Math.floor((-prevVelYRef.current - 13.0) * 1.1));
      applyAgentDamage(fallDmg, undefined, undefined, 'Caída');
      if (isDeadRef.current) return;
    }

    let hitWall = false;
    nx += dx;
    for (let i = 0; i < boxCount; i++) {
      const b = AABB_POOL[i];
      if (nx + r > b.minX && nx - r < b.maxX && ny - hBottom + 0.05 < b.maxY && ny + hTop - 0.05 > b.minY && nz + r > b.minZ && nz - r < b.maxZ) {
        hitWall = true;
        if (dx > 0) nx = b.minX - r - eps;
        else if (dx < 0) nx = b.maxX + r + eps;
      }
    }

    nz += dz;
    for (let i = 0; i < boxCount; i++) {
      const b = AABB_POOL[i];
      if (nx + r > b.minX && nx - r < b.maxX && ny - hBottom + 0.05 < b.maxY && ny + hTop - 0.05 > b.minY && nz + r > b.minZ && nz - r < b.maxZ) {
        hitWall = true;
        if (dz > 0) nz = b.minZ - r - eps;
        else if (dz < 0) nz = b.maxZ + r + eps;
      }
    }

    if (hitWall && isMoving && (isGroundedRef.current || isInWater)) {
      velYRef.current = 7.7;
      stuckTimerRef.current += minDelta;
    } else if (isMoving && Math.hypot(nx - pos.x, nz - pos.z) < 0.005 * minDelta * 60) {
      stuckTimerRef.current += minDelta;
    } else {
      stuckTimerRef.current = 0;
    }

    // Clear 2-block-tall obstacle path if blocked while walking or mining
    if (wantPathClear && stuckTimerRef.current > 0.55 && nowMs - lastObstacleBreakMsRef.current > 420 && moveGoalX !== null && moveGoalZ !== null) {
      const dirLen = Math.max(0.01, Math.hypot(moveGoalX - pos.x, moveGoalZ - pos.z));
      const fdx = (moveGoalX - pos.x) / dirLen;
      const fdz = (moveGoalZ - pos.z) / dirLen;
      const probeX = Math.round(pos.x + fdx * 0.95);
      const probeZ = Math.round(pos.z + fdz * 0.95);
      const probeYs = [Math.round(ny), Math.round(ny - 0.9)];
      for (const py of probeYs) {
        const obs = getBlockAt(probeX, py, probeZ);
        if (obs !== BlockType.AIR && DIGGABLE_TERRAIN_BLOCKS.has(obs) && !isProtectedBlock(probeX, py, probeZ, obs)) {
          lastObstacleBreakMsRef.current = nowMs;
          swingProgressRef.current = 1.0;
          if (setWorldBlock(probeX, py, probeZ, BlockType.AIR, true)) {
            if (distToPlayer < 24) playBreakSound(obs);
          }
          stuckTimerRef.current = 0.15;
          break;
        }
      }
    }

    if (stuckTimerRef.current > 2.2) {
      stuckTimerRef.current = 0;
      if (mineTargetRef.current) {
        const m = mineTargetRef.current;
        unreachableUntilRef.current.set(`${m.x},${m.y},${m.z}`, nowMs + 12000);
        mineTargetRef.current = null;
      }
      tunnelStepTargetRef.current = null;
      roamWaypointRef.current = null;
      headingDegRef.current = (headingDegRef.current + 115) % 360;
      pushOutcome(goalRef.current, 'stuck_reroute', -0.8, 0);
      if (isGroundedRef.current) velYRef.current = 8.0;
    }

    pos.x = nx;
    pos.y = ny;
    pos.z = nz;
    agentPosRef.current.x = nx;
    agentPosRef.current.y = ny;
    agentPosRef.current.z = nz;
    if (agentCombatRef) {
      agentCombatRef.current.alive = true;
      agentCombatRef.current.hp = hpRef.current;
      agentCombatRef.current.pos.x = nx;
      agentCombatRef.current.pos.y = ny;
      agentCombatRef.current.pos.z = nz;
    }

    groupRef.current.position.set(nx, ny - 1.5, nz);
    const hurtTilt = nowMs < hurtFlashUntilMsRef.current ? 0.26 : 0;
    groupRef.current.rotation.set(0, yawRef.current, hurtTilt);

    // Animations
    const timeVal = state.clock.getElapsedTime();
    if (isMoving) {
      walkPhaseRef.current += minDelta * (moveSpeed * 2.3);
      const swing = Math.sin(walkPhaseRef.current) * 0.6;
      if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, swing, 14, minDelta);
      if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, -swing, 14, minDelta);
      if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, -swing, 14, minDelta);
      if (rightArmRef.current && swingProgressRef.current <= 0) {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, swing, 14, minDelta);
      }
      if (torsoGroupRef.current) torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(torsoGroupRef.current.rotation.x, -0.07, 10, minDelta);
      if (capeRef.current) capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.36 + Math.sin(timeVal * 10) * 0.08, 10, minDelta);

      if (!isInWater && isGroundedRef.current && distToPlayer < 16) {
        if (swing < -0.52 && !lastStepToggleRef.current) {
          lastStepToggleRef.current = true;
          playStepSound(getBlockAt(nx, ny - 1.7, nz), 0.015);
        } else if (swing > 0) {
          lastStepToggleRef.current = false;
        }
      }
    } else {
      const breath = Math.sin(timeVal * 2.2) * 0.03;
      if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, 0, 10, minDelta);
      if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, 0, 10, minDelta);
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, 0, 10, minDelta);
        leftArmRef.current.rotation.z = THREE.MathUtils.damp(leftArmRef.current.rotation.z, -0.05 - breath, 10, minDelta);
      }
      if (rightArmRef.current && swingProgressRef.current <= 0) {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, 0, 10, minDelta);
        rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, 0.05 + breath, 10, minDelta);
      }
      if (torsoGroupRef.current) torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(torsoGroupRef.current.rotation.x, 0, 10, minDelta);
      if (capeRef.current) capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.08 + breath, 8, minDelta);
    }

    if (headGroupRef.current) {
      headGroupRef.current.rotation.x = THREE.MathUtils.damp(headGroupRef.current.rotation.x, pitchRef.current * 0.6, 12, minDelta);
    }

    if (swingProgressRef.current > 0) {
      swingProgressRef.current = Math.max(0, swingProgressRef.current - minDelta * 6.0);
      const sw = Math.sin((1 - swingProgressRef.current) * Math.PI);
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -sw * 1.6;
        rightArmRef.current.rotation.y = -sw * 0.4;
      }
    }

    if (distSpanRef.current) {
      const dTxt = `${Math.round(distToPlayer)}m · Nv.${memoryRef.current.level}`;
      if (distSpanRef.current.textContent !== dTxt) distSpanRef.current.textContent = dTxt;
    }
    if (statusSpanRef.current && statusSpanRef.current.textContent !== statusLabel) {
      statusSpanRef.current.textContent = statusLabel;
    }
  });

  if (!config.enabled) return null;

  const hpPct = Math.max(0, Math.min(100, (hudHp / MAX_AGENT_HP) * 100));
  const hpBarColor = hpPct > 55 ? '#10b981' : hpPct > 25 ? '#f59e0b' : '#ef4444';

  return (
    <group ref={groupRef} position={[posRef.current.x, posRef.current.y - 1.5, posRef.current.z]}>
      <Html position={[0, isDead ? 1.1 : 2.15, 0]} center distanceFactor={18} zIndexRange={[10, 50]}>
        <div className="flex flex-col items-center gap-0.5 pointer-events-none select-none">
          <div
            className="flex items-center gap-1.5 bg-zinc-950/90 px-2.5 py-0.5 rounded-md text-white font-mono text-[11px] font-bold whitespace-nowrap uppercase tracking-wider shadow-lg"
            style={{ border: `1px solid ${skinPreset.badgeColor}88` }}
          >
            <span className="text-[10px]">{isDead ? '💀' : '✨'}</span>
            <span style={{ color: skinPreset.badgeColor }}>{config.name || 'Gemini IA'}</span>
            <span ref={distSpanRef} className="text-[9px] text-zinc-400 font-normal ml-0.5">
              Nv.1
            </span>
          </div>
          {!isDead ? (
            <>
              <div className="w-20 h-1.5 bg-zinc-900/90 border border-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-150"
                  style={{ width: `${hpPct}%`, backgroundColor: hpBarColor }}
                />
              </div>
              <span
                ref={statusSpanRef}
                className="bg-black/75 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-bold text-cyan-300 whitespace-nowrap shadow"
              >
                🧠 Gemini IA
              </span>
            </>
          ) : (
            <span
              ref={respawnSpanRef}
              className="bg-rose-950/90 border border-rose-400/40 px-2 py-0.5 rounded text-[9px] font-bold text-rose-200 whitespace-nowrap shadow"
            >
              💀 Reapareciendo...
            </span>
          )}
        </div>
      </Html>

      {!isDead && (
        <CharacterModel
          skinId={config.skinId}
          heldBlock={heldBlock}
          refs={{
            headGroupRef,
            torsoGroupRef,
            leftArmRef,
            rightArmRef,
            leftLegRef,
            rightLegRef,
            capeRef,
          }}
        />
      )}
    </group>
  );
};

export default React.memo(GeminiAutonomousAgent);
