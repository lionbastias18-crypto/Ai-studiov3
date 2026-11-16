import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_COLORS, BLOCK_NAMES } from '../constants';
import { AICompanionConfig, BlockType, EntityData, EntityType, Vector3D } from '../types';
import { CharacterModel, resolveCharacterSkin } from './CharacterModel';
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

export interface AICompanionCombatState {
  alive: boolean;
  pos: Vector3D;
  hp: number;
  maxHp: number;
  lastAttackerPos: Vector3D | null;
  lastDamagedAtMs: number;
  damage: (amount: number, knockFromX?: number, knockFromZ?: number, sourceLabel?: string) => void;
}

export interface AICompanionProps {
  config: AICompanionConfig;
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
  companionPosRef: React.MutableRefObject<Vector3D>;
  companionBagRef: React.MutableRefObject<Record<number, number>>;
  companionCombatRef?: React.MutableRefObject<AICompanionCombatState>;
  ensureChunkAt?: (wx: number, wz: number) => boolean;
  tpTrigger: number;
  onBuildComplete?: () => void;
  onCompanionSpeak?: (msg: string) => void;
  onCompanionToast?: (msg: string) => void;
}

const MAX_COMPANION_HP = 20;
const RESPAWN_DELAY_MS = 5000;

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
  BlockType.TERRACOTTA_WHITE,
  BlockType.TERRACOTTA_ORANGE,
  BlockType.TERRACOTTA_RED,
  BlockType.TERRACOTTA_YELLOW,
  BlockType.TERRACOTTA_BROWN,
  BlockType.TERRACOTTA_LIGHT_GRAY,
  BlockType.JUKEBOX,
  BlockType.CARTOGRAPHY_TABLE,
  BlockType.WOOL,
  BlockType.WOOL_STAIRS,
  BlockType.CONCRETE,
  BlockType.CONCRETE_STAIRS,
  BlockType.CUSHION,
  BlockType.NETHER_BRICKS,
  BlockType.COPPER_BLOCK,
  BlockType.OXIDIZED_COPPER,
  BlockType.GLOWSTONE,
  BlockType.OBSIDIAN,
  BlockType.PORTAL,
]);

const NATURAL_OBSTACLE_BLOCKS = new Set<BlockType>([
  BlockType.DIRT,
  BlockType.GRASS,
  BlockType.AUTUMN_GRASS,
  BlockType.DARK_GRASS,
  BlockType.SAND,
  BlockType.GRAVEL,
  BlockType.STONE,
  BlockType.SNOW,
  BlockType.MOSS,
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

interface HouseBounds {
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
      return 100;
    case BlockType.GOLD_ORE:
      return 85;
    case BlockType.IRON_ORE:
      return 80;
    case BlockType.REDSTONE_ORE:
    case BlockType.NETHER_QUARTZ_ORE:
      return 75;
    case BlockType.COAL_ORE:
    case BlockType.COPPER_ORE:
      return 70;
    case BlockType.LOG:
    case BlockType.DARK_LOG:
    case BlockType.CHERRY_LOG:
    case BlockType.GREY_LOG:
      return 65;
    case BlockType.STONE:
      return 38;
    case BlockType.DIRT:
    case BlockType.SAND:
    case BlockType.GRAVEL:
    case BlockType.GRASS:
      return 18;
    default:
      return 0;
  }
};

const getMineDuration = (b: BlockType): number => {
  switch (b) {
    case BlockType.DIAMOND_ORE:
    case BlockType.GOLD_ORE:
    case BlockType.REDSTONE_ORE:
      return 0.85;
    case BlockType.IRON_ORE:
    case BlockType.COPPER_ORE:
    case BlockType.COAL_ORE:
    case BlockType.STONE:
      return 0.65;
    case BlockType.LOG:
    case BlockType.DARK_LOG:
    case BlockType.CHERRY_LOG:
    case BlockType.GREY_LOG:
      return 0.55;
    default:
      return 0.38;
  }
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

const AICompanion: React.FC<AICompanionProps> = ({
  config,
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
  companionPosRef,
  companionBagRef,
  companionCombatRef,
  ensureChunkAt,
  tpTrigger,
  onBuildComplete,
  onCompanionSpeak,
  onCompanionToast,
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

  const [heldBlock, setHeldBlock] = useState<BlockType>(BlockType.DIAMOND_SWORD);
  const heldBlockRef = useRef<BlockType>(BlockType.DIAMOND_SWORD);

  // Vitals / combat state
  const hpRef = useRef(MAX_COMPANION_HP);
  const [hudHp, setHudHp] = useState(MAX_COMPANION_HP);
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

  // Physics state stored at eye height (same convention as playerPosRef: feet = y - 1.5)
  const posRef = useRef<Vector3D>({
    x: playerPosRef.current.x + 2.2,
    y: playerPosRef.current.y + 1,
    z: playerPosRef.current.z + 2.2,
  });
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

  // AI brain state
  const scanTimerRef = useRef(0);
  const targetHostileRef = useRef<EntityData | null>(null);
  const lastAttackMsRef = useRef(0);
  const mineTargetRef = useRef<{ x: number; y: number; z: number; block: BlockType; progress: number } | null>(null);
  const unreachableUntilRef = useRef<Map<string, number>>(new Map());
  const buildQueueRef = useRef<BuildStep[]>([]);
  const lastBuildStepMsRef = useRef(0);
  const protectedBlocksRef = useRef<Set<string>>(new Set());
  const builtHousesRef = useRef<HouseBounds[]>([]);
  const exploreGoalRef = useRef<{ x: number; z: number; untilMs: number } | null>(null);
  const lastExploreChatMsRef = useRef(0);
  const lastObstacleBreakMsRef = useRef(0);
  const stayAnchorRef = useRef<Vector3D | null>(null);
  const lastTpTriggerRef = useRef(tpTrigger);
  const lastModeRef = useRef(config.mode);

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

  const isChunkLoadedAt = (wx: number, wz: number): boolean => {
    const cx = Math.floor(Math.round(wx) / CHUNK_SIZE);
    const cz = Math.floor(Math.round(wz) / CHUNK_SIZE);
    return Boolean(chunksRef.current[`${cx},${cz}`]);
  };

  const isProtectedBlock = (wx: number, wy: number, wz: number, blk: BlockType): boolean => {
    const rx = Math.round(wx);
    const ry = Math.round(wy);
    const rz = Math.round(wz);
    if (protectedBlocksRef.current.has(`${rx},${ry},${rz}`)) return true;
    for (let i = 0; i < builtHousesRef.current.length; i++) {
      const b = builtHousesRef.current[i];
      if (rx >= b.minX && rx <= b.maxX && ry >= b.minY && ry <= b.maxY && rz >= b.minZ && rz <= b.maxZ) {
        return true;
      }
    }
    if (STRUCTURAL_BLOCKS.has(blk)) return true;
    if (LOG_BLOCKS.has(blk)) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const nb = getBlockAt(rx + dx, ry + dy, rz + dz);
            if (STRUCTURAL_BLOCKS.has(nb) || protectedBlocksRef.current.has(`${rx + dx},${ry + dy},${rz + dz}`)) {
              return true;
            }
          }
        }
      }
    }
    return false;
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
      const colBlock = block === BlockType.AIR ? prev : block;
      const color = BLOCK_COLORS[colBlock] || '#94a3b8';
      const now = performance.now();
      for (let i = 0; i < 6; i++) {
        particlesRef.current.push({
          id: now + i + Math.random(),
          x: wx + (Math.random() - 0.5) * 0.45,
          y: wy + (Math.random() - 0.5) * 0.45,
          z: wz + (Math.random() - 0.5) * 0.45,
          vx: (Math.random() - 0.5) * 2.2,
          vy: 1.5 + Math.random() * 1.8,
          vz: (Math.random() - 0.5) * 2.2,
          color,
          size: 0.11 + Math.random() * 0.08,
          life: 0.75,
        });
      }
    }
    return true;
  };

  const findSafeSurfaceY = (wx: number, wz: number, hintY: number): number => {
    const rx = Math.round(wx);
    const rz = Math.round(wz);
    ensureChunkAt?.(rx, rz);
    const startY = Math.min(WORLD_HEIGHT - 3, Math.max(4, Math.round(hintY + 14)));
    const minY = Math.max(2, Math.round(hintY - 16));
    for (let y = startY; y >= minY; y--) {
      if (checkSolid(rx, y, rz) && !checkSolid(rx, y + 1, rz) && !checkSolid(rx, y + 2, rz)) {
        return y + 2.02;
      }
    }
    for (let y = WORLD_HEIGHT - 4; y >= 4; y--) {
      if (checkSolid(rx, y, rz) && !checkSolid(rx, y + 1, rz) && !checkSolid(rx, y + 2, rz)) {
        return y + 2.02;
      }
    }
    return hintY + 1;
  };

  const spawnBurstParticles = (x: number, y: number, z: number, color: string, count = 10) => {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: now + i + Math.random(),
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + (Math.random() - 0.5) * 0.6,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 2.6,
        vy: 1.0 + Math.random() * 2.0,
        vz: (Math.random() - 0.5) * 2.6,
        color,
        size: 0.13 + Math.random() * 0.09,
        life: 0.75,
      });
    }
  };

  const applyCompanionDamage = (
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
    playHurtSound();
    spawnBurstParticles(posRef.current.x, posRef.current.y - 0.6, posRef.current.z, '#ef4444', 7);

    if (companionCombatRef) {
      companionCombatRef.current.hp = nextHp;
      companionCombatRef.current.lastDamagedAtMs = nowMs;
      companionCombatRef.current.lastAttackerPos = lastAttackerPosRef.current;
    }

    if (nextHp <= 0) {
      isDeadRef.current = true;
      setIsDead(true);
      respawnAtMsRef.current = nowMs + RESPAWN_DELAY_MS;
      targetHostileRef.current = null;
      mineTargetRef.current = null;
      if (companionCombatRef) {
        companionCombatRef.current.alive = false;
      }
      spawnBurstParticles(posRef.current.x, posRef.current.y - 0.5, posRef.current.z, '#f8fafc', 16);
      const causeText = sourceLabel ? ` contra ${sourceLabel}` : '';
      onCompanionSpeak?.(`💀 ¡He caído${causeText}! Reapareciendo junto a ti en 5 segundos...`);
      onCompanionToast?.(`💀 ${config.name || 'Alex IA'} murió. Reaparece en 5s...`);
    }
  };

  const applyDamageRef = useRef(applyCompanionDamage);
  applyDamageRef.current = applyCompanionDamage;

  const prepareShelterBlueprint = () => {
    const lp = playerPosRef.current;
    const baseX = Math.round(lp.x + 5);
    const baseZ = Math.round(lp.z + 5);
    ensureChunkAt?.(baseX, baseZ);
    let groundY = Math.round(lp.y - 2);
    for (let y = Math.min(WORLD_HEIGHT - 6, Math.round(lp.y + 4)); y >= Math.max(3, Math.round(lp.y - 8)); y--) {
      if (checkSolid(baseX, y, baseZ) && !checkSolid(baseX, y + 1, baseZ)) {
        groundY = y;
        break;
      }
    }

    const steps: BuildStep[] = [];
    // Protect the entire footprint + foundation underneath so AI never undermines its house
    builtHousesRef.current.push({
      minX: baseX - 3,
      maxX: baseX + 3,
      minY: groundY - 1,
      maxY: groundY + 5,
      minZ: baseZ - 3,
      maxZ: baseZ + 3,
    });

    // 5x5 wooden floor
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        steps.push({ x: baseX + dx, y: groundY, z: baseZ + dz, block: BlockType.WOOD });
        protectedBlocksRef.current.add(`${baseX + dx},${groundY},${baseZ + dz}`);
        protectedBlocksRef.current.add(`${baseX + dx},${groundY - 1},${baseZ + dz}`);
      }
    }
    // Walls & corner log pillars (3 high), leaving doorway at (0, -2)
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
          const blk = isCorner ? BlockType.LOG : BlockType.WOOD;
          steps.push({ x: baseX + dx, y: groundY + h, z: baseZ + dz, block: blk });
          protectedBlocksRef.current.add(`${baseX + dx},${groundY + h},${baseZ + dz}`);
        }
      }
    }
    // Roof
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        steps.push({ x: baseX + dx, y: groundY + 4, z: baseZ + dz, block: BlockType.TERRACOTTA_BROWN });
        protectedBlocksRef.current.add(`${baseX + dx},${groundY + 4},${baseZ + dz}`);
      }
    }
    // Door, chest, crafting table, torches
    const interiorFeatures: BuildStep[] = [
      { x: baseX, y: groundY + 1, z: baseZ - 2, block: BlockType.DOOR },
      { x: baseX, y: groundY + 2, z: baseZ - 2, block: BlockType.DOOR },
      { x: baseX - 1, y: groundY + 1, z: baseZ + 1, block: BlockType.CRAFTING_TABLE },
      { x: baseX + 1, y: groundY + 1, z: baseZ + 1, block: BlockType.CHEST },
      { x: baseX - 1, y: groundY + 2, z: baseZ - 1, block: BlockType.TORCH },
      { x: baseX + 1, y: groundY + 2, z: baseZ + 1, block: BlockType.TORCH },
    ];
    for (const f of interiorFeatures) {
      steps.push(f);
      protectedBlocksRef.current.add(`${f.x},${f.y},${f.z}`);
    }

    buildQueueRef.current = steps;
  };

  // Register live combat bridge whenever enabled
  useEffect(() => {
    if (!companionCombatRef) return;
    if (!config.enabled) {
      companionCombatRef.current.alive = false;
      return;
    }
    companionCombatRef.current.alive = !isDeadRef.current;
    companionCombatRef.current.hp = hpRef.current;
    companionCombatRef.current.maxHp = MAX_COMPANION_HP;
    companionCombatRef.current.pos = { ...posRef.current };
    companionCombatRef.current.damage = (amt, kx, kz, label) => applyDamageRef.current(amt, kx, kz, label);
    return () => {
      companionCombatRef.current.alive = false;
    };
  }, [config.enabled, companionCombatRef]);

  // Spawn next to player when enabled
  useEffect(() => {
    if (!config.enabled) return;
    const lp = playerPosRef.current;
    const sx = Math.round(lp.x + 2.2);
    const sz = Math.round(lp.z + 2.2);
    const sy = findSafeSurfaceY(sx, sz, lp.y);
    posRef.current = { x: sx, y: sy, z: sz };
    velYRef.current = 0;
    hpRef.current = MAX_COMPANION_HP;
    setHudHp(MAX_COMPANION_HP);
    isDeadRef.current = false;
    setIsDead(false);
    knockbackRef.current = { x: 0, z: 0 };
    companionPosRef.current = { ...posRef.current };
    stayAnchorRef.current = { ...posRef.current };
    if (companionCombatRef) {
      companionCombatRef.current.alive = true;
      companionCombatRef.current.hp = MAX_COMPANION_HP;
      companionCombatRef.current.pos = { ...posRef.current };
      companionCombatRef.current.damage = (amt, kx, kz, label) => applyDamageRef.current(amt, kx, kz, label);
    }
  }, [config.enabled]);

  // Handle explicit TP trigger from UI or chat
  useEffect(() => {
    if (!config.enabled || tpTrigger === lastTpTriggerRef.current) return;
    lastTpTriggerRef.current = tpTrigger;
    const lp = playerPosRef.current;
    const sx = lp.x + 2.0;
    const sz = lp.z + 2.0;
    const sy = findSafeSurfaceY(Math.round(sx), Math.round(sz), lp.y);
    posRef.current = { x: sx, y: sy, z: sz };
    velYRef.current = 0;
    knockbackRef.current = { x: 0, z: 0 };
    stayAnchorRef.current = { ...posRef.current };
    companionPosRef.current = { ...posRef.current };
    exploreGoalRef.current = null;
    if (isDeadRef.current) {
      isDeadRef.current = false;
      setIsDead(false);
      hpRef.current = MAX_COMPANION_HP;
      setHudHp(MAX_COMPANION_HP);
    }
    if (companionCombatRef) {
      companionCombatRef.current.alive = true;
      companionCombatRef.current.hp = hpRef.current;
      companionCombatRef.current.pos = { ...posRef.current };
    }
  }, [tpTrigger, config.enabled]);

  // React to mode changes
  useEffect(() => {
    if (!config.enabled) return;
    if (lastModeRef.current !== config.mode) {
      lastModeRef.current = config.mode;
      mineTargetRef.current = null;
      exploreGoalRef.current = null;
      if (config.mode === 'build') {
        prepareShelterBlueprint();
      } else {
        buildQueueRef.current = [];
      }
      if (config.mode === 'stay') {
        stayAnchorRef.current = { ...posRef.current };
      }
    }
  }, [config.mode, config.enabled]);

  useFrame((state, delta) => {
    if (!config.enabled || !groupRef.current) return;
    const minDelta = Math.min(delta, 0.08);
    const nowMs = performance.now();
    const lp = playerPosRef.current;
    const pos = posRef.current;

    // --- Death & Respawn Cycle ---
    if (isDeadRef.current) {
      if (companionCombatRef) {
        companionCombatRef.current.alive = false;
      }
      const remSec = Math.max(1, Math.ceil((respawnAtMsRef.current - nowMs) / 1000));
      if (respawnSpanRef.current) {
        const nextTxt = `💀 Reapareciendo en ${remSec}s...`;
        if (respawnSpanRef.current.textContent !== nextTxt) {
          respawnSpanRef.current.textContent = nextTxt;
        }
      }
      if (nowMs >= respawnAtMsRef.current) {
        const sx = lp.x + 2.2;
        const sz = lp.z + 2.2;
        const sy = findSafeSurfaceY(Math.round(sx), Math.round(sz), lp.y);
        pos.x = sx;
        pos.y = sy;
        pos.z = sz;
        velYRef.current = 0;
        knockbackRef.current = { x: 0, z: 0 };
        hpRef.current = MAX_COMPANION_HP;
        setHudHp(MAX_COMPANION_HP);
        isDeadRef.current = false;
        setIsDead(false);
        invulnUntilMsRef.current = nowMs + 2000;
        lastDamagedAtMsRef.current = 0;
        lastAttackerPosRef.current = null;
        targetHostileRef.current = null;
        mineTargetRef.current = null;
        exploreGoalRef.current = null;
        companionPosRef.current = { x: sx, y: sy, z: sz };
        stayAnchorRef.current = { x: sx, y: sy, z: sz };
        groupRef.current.position.set(sx, sy - 1.5, sz);
        groupRef.current.rotation.set(0, yawRef.current, 0);
        if (companionCombatRef) {
          companionCombatRef.current.alive = true;
          companionCombatRef.current.hp = MAX_COMPANION_HP;
          companionCombatRef.current.pos = { x: sx, y: sy, z: sz };
          companionCombatRef.current.lastAttackerPos = null;
        }
        spawnBurstParticles(sx, sy - 0.5, sz, '#22d3ee', 16);
        onCompanionSpeak?.('✨ ¡Ya reaparecí! Listo para seguir luchando y explorando.');
        onCompanionToast?.(`✨ ${config.name || 'Alex IA'} ha reaparecido`);
      }
      return;
    }

    const distToPlayer = Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z);

    // Ensure terrain chunk exists around companion (especially during long-range exploration)
    if (distToPlayer <= 115) {
      ensureChunkAt?.(pos.x, pos.z);
    }

    // Safety teleport when fallen into void or far beyond world simulation bounds
    const maxAllowedRange = config.mode === 'explore' ? 120 : 52;
    if (pos.y < 1 || (config.mode !== 'stay' && distToPlayer > maxAllowedRange)) {
      const nx = lp.x + 2.2;
      const nz = lp.z + 2.2;
      pos.x = nx;
      pos.z = nz;
      pos.y = findSafeSurfaceY(Math.round(nx), Math.round(nz), lp.y);
      velYRef.current = 0;
      knockbackRef.current = { x: 0, z: 0 };
      mineTargetRef.current = null;
      exploreGoalRef.current = null;
    }

    // Periodic environment & mob scan (4Hz)
    scanTimerRef.current += minDelta;
    if (scanTimerRef.current >= 0.25) {
      scanTimerRef.current = 0;

      // Passive health regeneration when calm & not recently hit
      if (
        hpRef.current < MAX_COMPANION_HP &&
        nowMs - lastDamagedAtMsRef.current > 5000 &&
        nowMs - lastRegenMsRef.current > 3500 &&
        !targetHostileRef.current
      ) {
        lastRegenMsRef.current = nowMs;
        const healed = Math.min(MAX_COMPANION_HP, hpRef.current + 1);
        hpRef.current = healed;
        setHudHp(Math.ceil(healed));
        if (companionCombatRef) {
          companionCombatRef.current.hp = healed;
        }
      }

      // 1. Autonomous threat detection across ALL modes without needing any button!
      const compRadius = config.mode === 'stay' ? 12 : 18;
      const compRadiusSq = compRadius * compRadius;
      const playerProtectSq = 15 * 15;
      const recentlyAttacked = nowMs - lastDamagedAtMsRef.current < 3500 && lastAttackerPosRef.current;

      let bestMob: EntityData | null = null;
      let bestScore = Infinity;
      const buckets = entitiesRef.current;
      for (const ck in buckets) {
        const list = buckets[ck];
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) {
          const ent = list[i];
          if (!ent || !ent.pos) continue;

          const isAlwaysHostile = ALWAYS_HOSTILE_SET.has(ent.type);
          const isEndermanThreat =
            ent.type === EntityType.ENDERMAN &&
            (Boolean((ent as any).isAngry) ||
              Math.hypot(ent.pos.x - pos.x, ent.pos.z - pos.z) < 9.5 ||
              Math.hypot(ent.pos.x - lp.x, ent.pos.z - lp.z) < 8);
          const isPiglinThreat = ent.type === EntityType.ZOMBIFIED_PIGLIN && Boolean((ent as any).isAngry);

          if (!isAlwaysHostile && !isEndermanThreat && !isPiglinThreat) continue;

          const dCompSq =
            (ent.pos.x - pos.x) * (ent.pos.x - pos.x) +
            (ent.pos.y - (pos.y - 1.5)) * (ent.pos.y - (pos.y - 1.5)) +
            (ent.pos.z - pos.z) * (ent.pos.z - pos.z);
          const dPlaySq =
            (ent.pos.x - lp.x) * (ent.pos.x - lp.x) +
            (ent.pos.y - (lp.y - 1.5)) * (ent.pos.y - (lp.y - 1.5)) +
            (ent.pos.z - lp.z) * (ent.pos.z - lp.z);

          const inCompRange = dCompSq <= compRadiusSq;
          const inPlayerRange = config.mode !== 'stay' && config.mode !== 'explore' && dPlaySq <= playerProtectSq;
          if (!inCompRange && !inPlayerRange) continue;

          let score = Math.min(dCompSq, dPlaySq + 16);
          if (recentlyAttacked && lastAttackerPosRef.current) {
            const dAttSq =
              (ent.pos.x - lastAttackerPosRef.current.x) * (ent.pos.x - lastAttackerPosRef.current.x) +
              (ent.pos.z - lastAttackerPosRef.current.z) * (ent.pos.z - lastAttackerPosRef.current.z);
            if (dAttSq < 12) score *= 0.35;
          }
          if (score < bestScore) {
            bestScore = score;
            bestMob = ent;
          }
        }
      }
      targetHostileRef.current = bestMob;

      // 2. Resource / Ore / Tree scanning in gather or explore mode (NEVER targets protected/house blocks!)
      if ((config.mode === 'gather' || config.mode === 'explore') && !bestMob && !mineTargetRef.current) {
        let bestBlockPos: { x: number; y: number; z: number; block: BlockType; score: number } | null = null;
        const baseX = Math.round(pos.x);
        const baseY = Math.round(pos.y - 1);
        const baseZ = Math.round(pos.z);
        const radius = config.mode === 'gather' ? 10 : 7;

        for (let ox = -radius; ox <= radius; ox += 1) {
          for (let oz = -radius; oz <= radius; oz += 1) {
            for (let oy = -2; oy <= 4; oy += 1) {
              const wx = baseX + ox;
              const wy = baseY + oy;
              const wz = baseZ + oz;
              if (wy <= 2 || wy >= WORLD_HEIGHT - 2) continue;

              const key = `${wx},${wy},${wz}`;
              const blkUntil = unreachableUntilRef.current.get(key);
              if (blkUntil && blkUntil > nowMs) continue;

              const blk = getBlockAt(wx, wy, wz);
              const prio = getBlockPriority(blk);
              if (prio <= 0) continue;
              if (config.mode === 'explore' && prio < 65) continue;
              if (isProtectedBlock(wx, wy, wz, blk)) continue;

              // Only target blocks exposed to air/non-solid OR reachable trunk logs
              const exposed = isExposedBlock(wx, wy, wz);
              if (!exposed) continue;

              const dist = Math.hypot(ox, oy * 1.35, oz);
              // Prefer lower trunk logs slightly first so trees chop cleanly bottom-to-top
              const trunkBonus = LOG_BLOCKS.has(blk) && oy <= 1 ? 8 : 0;
              const score = prio + trunkBonus - dist * 4.5;
              if (!bestBlockPos || score > bestBlockPos.score) {
                bestBlockPos = { x: wx, y: wy, z: wz, block: blk, score };
              }
            }
          }
        }
        if (bestBlockPos) {
          mineTargetRef.current = {
            x: bestBlockPos.x,
            y: bestBlockPos.y,
            z: bestBlockPos.z,
            block: bestBlockPos.block,
            progress: 0,
          };
          if (config.mode === 'explore' && distToPlayer > 28 && nowMs - lastExploreChatMsRef.current > 28000) {
            lastExploreChatMsRef.current = nowMs;
            const blkLabel = BLOCK_NAMES[bestBlockPos.block] || 'recursos';
            onCompanionSpeak?.(`🧭 Explorando a ${Math.round(distToPlayer)}m de ti, encontré ${blkLabel}.`);
          }
        }
      }

      // 3. Auto-light dark spots at night / caves when grounded
      const isNight = Math.sin(gameTimeRef.current) < -0.05;
      if ((isNight || pos.y < 52) && nowMs - lastTorchPlaceMsRef.current > 12000 && isGroundedRef.current) {
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
          if (!hasTorchNear) {
            if (setWorldBlock(tx, ty, tz, BlockType.TORCH, false, true)) {
              lastTorchPlaceMsRef.current = nowMs;
              playPlaceSound(BlockType.TORCH);
            }
          }
        }
      }
    }

    // --- Decide desired action & movement target ---
    let moveGoalX: number | null = null;
    let moveGoalZ: number | null = null;
    let desiredDist = 0.5;
    let moveSpeed = 4.6;
    let lookTarget: Vector3D | null = null;
    let statusLabel = '🤝 Contigo';
    let wantPathClear = false;

    const hostile = targetHostileRef.current;
    if (hostile && hostile.pos) {
      // Autonomous combat! (Activates automatically in any mode)
      statusLabel = '⚔️ Combate';
      updateHeldBlock(BlockType.DIAMOND_SWORD);
      lookTarget = { x: hostile.pos.x, y: hostile.pos.y + 1.0, z: hostile.pos.z };
      const distMobFlat = Math.hypot(hostile.pos.x - pos.x, hostile.pos.z - pos.z);
      const distMob3D = Math.hypot(hostile.pos.x - pos.x, hostile.pos.y - (pos.y - 1.5), hostile.pos.z - pos.z);

      if (hostile.type === EntityType.CREEPER && distMobFlat < 2.25 && nowMs - lastAttackMsRef.current < 480) {
        // Kite backward between sword strikes so creeper won't finish its fuse!
        moveGoalX = pos.x - (hostile.pos.x - pos.x);
        moveGoalZ = pos.z - (hostile.pos.z - pos.z);
        desiredDist = 0;
        moveSpeed = 5.4;
      } else {
        moveGoalX = hostile.pos.x;
        moveGoalZ = hostile.pos.z;
        desiredDist = hostile.type === EntityType.CREEPER ? 2.15 : 1.6;
        moveSpeed = 5.8;
      }

      if (distMob3D <= 3.55 && Math.abs(hostile.pos.y - (pos.y - 1.5)) <= 2.7 && nowMs - lastAttackMsRef.current > 620) {
        lastAttackMsRef.current = nowMs;
        swingProgressRef.current = 1.0;
        playAttackSwingSound();
        hitEntityById(hostile.id, {
          damage: 15,
          attackerPos: { x: pos.x, y: pos.y, z: pos.z },
          isCompanion: true,
        });
      }
    } else if (config.mode === 'build') {
      if (buildQueueRef.current.length === 0) {
        onCompanionSpeak?.(`🏠 ¡Listo! Ya terminé nuestro refugio y está protegido.`);
        onBuildComplete?.();
      } else {
        const step = buildQueueRef.current[0];
        statusLabel = '🏠 Construyendo';
        updateHeldBlock(step.block);
        lookTarget = { x: step.x, y: step.y, z: step.z };

        const dStep = Math.hypot(step.x - pos.x, step.z - pos.z);
        if (dStep > 4.2) {
          moveGoalX = step.x;
          moveGoalZ = step.z;
          desiredDist = 2.6;
          moveSpeed = 5.0;
        } else if (dStep < 0.85 && Math.abs(step.y - (pos.y - 0.5)) < 1.5) {
          moveGoalX = pos.x - (step.x - pos.x);
          moveGoalZ = pos.z - (step.z - pos.z);
          desiredDist = 0;
        }

        if (dStep <= 4.8 && nowMs - lastBuildStepMsRef.current >= 260) {
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
              playPlaceSound(step.block);
            }
          }
          buildQueueRef.current.shift();
        }
      }
    } else if ((config.mode === 'gather' || (config.mode === 'explore' && mineTargetRef.current)) && mineTargetRef.current) {
      const m = mineTargetRef.current;
      const actualNow = getBlockAt(m.x, m.y, m.z);
      if (actualNow === BlockType.AIR || actualNow === BlockType.BEDROCK || isProtectedBlock(m.x, m.y, m.z, actualNow)) {
        mineTargetRef.current = null;
      } else {
        statusLabel = LOG_BLOCKS.has(actualNow) ? '🪵 Talando' : '⛏️ Minando';
        updateHeldBlock(getBestToolForBlock(actualNow));
        lookTarget = { x: m.x, y: m.y, z: m.z };
        const dMineFlat = Math.hypot(m.x - pos.x, m.z - pos.z);
        const dMine3D = Math.hypot(m.x - pos.x, m.y - (pos.y - 0.5), m.z - pos.z);

        if (dMine3D > 3.9 || dMineFlat > 3.2) {
          moveGoalX = m.x;
          moveGoalZ = m.z;
          desiredDist = 1.9;
          moveSpeed = 5.0;
          wantPathClear = true;
        } else {
          m.progress += minDelta;
          if (swingProgressRef.current <= 0.05) {
            swingProgressRef.current = 1.0;
          }
          if (m.progress >= getMineDuration(actualNow)) {
            if (setWorldBlock(m.x, m.y, m.z, BlockType.AIR, true)) {
              playBreakSound(actualNow);
              companionBagRef.current[actualNow] = (companionBagRef.current[actualNow] || 0) + 1;
            }
            // Vein / Tree-trunk chaining: automatically continue to adjacent log or same ore!
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
                    const nd3d = Math.hypot(nx - pos.x, ny - (pos.y - 0.5), nz - pos.z);
                    if (nd3d <= 4.6) {
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
    } else if (config.mode === 'stay') {
      statusLabel = '🛑 Esperando';
      updateHeldBlock(BlockType.TORCH);
      const anchor = stayAnchorRef.current || pos;
      if (Math.hypot(anchor.x - pos.x, anchor.z - pos.z) > 1.8) {
        moveGoalX = anchor.x;
        moveGoalZ = anchor.z;
        desiredDist = 0.6;
        moveSpeed = 3.8;
      }
      if (distToPlayer < 8) {
        lookTarget = lp;
      }
    } else if (config.mode === 'explore') {
      statusLabel = '🧭 Explorando';
      updateHeldBlock(BlockType.IRON_PICKAXE);

      const needNewGoal =
        !exploreGoalRef.current ||
        nowMs > exploreGoalRef.current.untilMs ||
        Math.hypot(exploreGoalRef.current.x - pos.x, exploreGoalRef.current.z - pos.z) < 2.2;

      if (needNewGoal) {
        // Pick long-range exploration waypoints (28..72 blocks away, staying inside 95m exploration radius)
        let gx = pos.x;
        let gz = pos.z;
        for (let attempt = 0; attempt < 8; attempt++) {
          const ang = Math.random() * Math.PI * 2;
          const stepDist = 28 + Math.random() * 42;
          const candX = distToPlayer > 78 ? lp.x + (Math.random() - 0.5) * 45 : pos.x + Math.cos(ang) * stepDist;
          const candZ = distToPlayer > 78 ? lp.z + (Math.random() - 0.5) * 45 : pos.z + Math.sin(ang) * stepDist;
          if (Math.hypot(candX - lp.x, candZ - lp.z) <= 95) {
            gx = candX;
            gz = candZ;
            break;
          }
        }
        ensureChunkAt?.(gx, gz);
        exploreGoalRef.current = {
          x: gx,
          z: gz,
          untilMs: nowMs + 14000,
        };
      }

      if (distToPlayer > 98) {
        // Gently steer back inside max roaming boundary rather than locking close to player
        moveGoalX = lp.x;
        moveGoalZ = lp.z;
        desiredDist = 45;
        moveSpeed = 5.4;
      } else if (exploreGoalRef.current) {
        moveGoalX = exploreGoalRef.current.x;
        moveGoalZ = exploreGoalRef.current.z;
        desiredDist = 1.2;
        moveSpeed = 4.9;
      }
    } else {
      // 'follow', 'guard', or 'gather' idle near player
      statusLabel = config.mode === 'guard' ? '🛡️ Protegiendo' : config.mode === 'gather' ? '⛏️ Buscando' : '🤝 Siguiéndote';
      const isNight = Math.sin(gameTimeRef.current) < -0.05;
      updateHeldBlock(config.mode === 'guard' ? BlockType.DIAMOND_SWORD : isNight ? BlockType.TORCH : BlockType.WOOD);
      moveGoalX = lp.x;
      moveGoalZ = lp.z;
      desiredDist = 2.7;
      moveSpeed = distToPlayer > 8 ? 5.8 : 4.5;
      if (distToPlayer < 6) {
        lookTarget = lp;
      }
    }

    // --- Water, Lava & Fire Hazards ---
    const blockFeet = getBlockAt(pos.x, pos.y - 1.4, pos.z);
    const blockWaist = getBlockAt(pos.x, pos.y - 0.8, pos.z);
    const isInWater = blockFeet === BlockType.WATER || blockWaist === BlockType.WATER;
    const isInLava = blockFeet === BlockType.LAVA || blockWaist === BlockType.LAVA;
    const isInFire = blockFeet === BlockType.FIRE || blockWaist === BlockType.FIRE;

    if (isInWater) {
      statusLabel = '🏊 Nadando';
      moveSpeed *= 0.82;
    }
    if (isInLava && nowMs - lastLavaHurtMsRef.current > 750) {
      lastLavaHurtMsRef.current = nowMs;
      velYRef.current = 6.2;
      applyCompanionDamage(4, pos.x, pos.z, 'Lava');
    } else if (isInFire && nowMs - lastLavaHurtMsRef.current > 900) {
      lastLavaHurtMsRef.current = nowMs;
      applyCompanionDamage(1, pos.x, pos.z, 'Fuego');
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
          lookTarget = { x: moveGoalX, y: pos.y, z: moveGoalZ };
        }
      }
    }

    // Decay and apply combat knockback
    if (Math.abs(knockbackRef.current.x) > 0.05 || Math.abs(knockbackRef.current.z) > 0.05) {
      vx += knockbackRef.current.x;
      vz += knockbackRef.current.z;
      const decay = Math.pow(0.05, minDelta);
      knockbackRef.current.x *= decay;
      knockbackRef.current.z *= decay;
      if (Math.hypot(knockbackRef.current.x, knockbackRef.current.z) < 0.15) {
        knockbackRef.current.x = 0;
        knockbackRef.current.z = 0;
      }
    }

    // Rotation toward look target
    if (lookTarget) {
      const lx = lookTarget.x - pos.x;
      const ly = lookTarget.y - pos.y;
      const lz = lookTarget.z - pos.z;
      const targetYaw = Math.atan2(-lx, -lz);
      const diff = Math.atan2(Math.sin(targetYaw - yawRef.current), Math.cos(targetYaw - yawRef.current));
      yawRef.current += diff * Math.min(1, minDelta * 10);
      const flatL = Math.max(0.5, Math.hypot(lx, lz));
      pitchRef.current = THREE.MathUtils.clamp(Math.atan2(ly, flatL), -0.65, 0.65);
    }

    // Check next chunk before moving so companion never walks off unloaded world into void
    const nextStepX = pos.x + vx * minDelta;
    const nextStepZ = pos.z + vz * minDelta;
    if (!isChunkLoadedAt(nextStepX, nextStepZ)) {
      ensureChunkAt?.(nextStepX, nextStepZ);
    }
    const canSimulateNextChunk = isChunkLoadedAt(nextStepX, nextStepZ);

    // Gravity / Swim Buoyancy
    if (!canSimulateNextChunk) {
      velYRef.current = 0;
      vx = -vx * 0.5;
      vz = -vz * 0.5;
      exploreGoalRef.current = null;
    } else if (isInWater) {
      const targetVy = blockWaist === BlockType.WATER ? 3.4 : 0.4;
      velYRef.current = THREE.MathUtils.damp(velYRef.current, targetVy, 8, minDelta);
    } else {
      velYRef.current = Math.max(-24, velYRef.current - 24 * minDelta);
    }

    prevVelYRef.current = velYRef.current;
    const dx = vx * minDelta;
    const dz = vz * minDelta;
    const dy = velYRef.current * minDelta;

    // Populate local solid block AABBs
    const r = 0.28;
    const hBottom = 1.5;
    const hTop = 0.3;
    let boxCount = 0;
    const minBx = Math.floor(Math.min(pos.x - r, pos.x - r + dx) - 1);
    const maxBx = Math.floor(Math.max(pos.x + r, pos.x + r + dx) + 1);
    const minBy = Math.floor(Math.min(pos.y - hBottom, pos.y - hBottom + dy) - 1);
    const maxBy = Math.floor(Math.max(pos.y + hTop, pos.y + hTop + dy) + 2);
    const minBz = Math.floor(Math.min(pos.z - r, pos.z - r + dz) - 1);
    const maxBz = Math.floor(Math.max(pos.z + r, pos.z + r + dz) + 1);

    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        for (let bz = minBz; bz <= maxBz; bz++) {
          if (checkSolid(bx, by, bz) && boxCount < AABB_POOL.length) {
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

    // Fall damage on hard landing
    if (!wasGroundedRef.current && isGroundedRef.current && !isInWater && prevVelYRef.current < -13.5) {
      const fallDmg = Math.max(1, Math.floor((-prevVelYRef.current - 12.5) * 1.1));
      applyCompanionDamage(fallDmg, undefined, undefined, 'Caída');
      if (isDeadRef.current) return;
    }

    // Horizontal X
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

    // Horizontal Z
    nz += dz;
    for (let i = 0; i < boxCount; i++) {
      const b = AABB_POOL[i];
      if (nx + r > b.minX && nx - r < b.maxX && ny - hBottom + 0.05 < b.maxY && ny + hTop - 0.05 > b.minY && nz + r > b.minZ && nz - r < b.maxZ) {
        hitWall = true;
        if (dz > 0) nz = b.minZ - r - eps;
        else if (dz < 0) nz = b.maxZ + r + eps;
      }
    }

    // Jump cleanly over 1-block walls when blocked while walking
    if (hitWall && isMoving && (isGroundedRef.current || isInWater)) {
      velYRef.current = 7.6;
      stuckTimerRef.current += minDelta;
    } else if (isMoving && Math.hypot(nx - pos.x, nz - pos.z) < 0.005 * minDelta * 60) {
      stuckTimerRef.current += minDelta;
    } else {
      stuckTimerRef.current = 0;
    }

    // Clear natural non-house obstacle blocks (leaves/dirt/stone) if mining path is blocked
    if (wantPathClear && stuckTimerRef.current > 0.75 && nowMs - lastObstacleBreakMsRef.current > 550 && moveGoalX !== null && moveGoalZ !== null) {
      const dirLen = Math.max(0.01, Math.hypot(moveGoalX - pos.x, moveGoalZ - pos.z));
      const fdx = (moveGoalX - pos.x) / dirLen;
      const fdz = (moveGoalZ - pos.z) / dirLen;
      const probeX = Math.round(pos.x + fdx * 0.9);
      const probeZ = Math.round(pos.z + fdz * 0.9);
      const probeYs = [Math.round(ny - 0.1), Math.round(ny - 1.0)];
      for (const py of probeYs) {
        const obs = getBlockAt(probeX, py, probeZ);
        if (obs !== BlockType.AIR && NATURAL_OBSTACLE_BLOCKS.has(obs) && !isProtectedBlock(probeX, py, probeZ, obs)) {
          lastObstacleBreakMsRef.current = nowMs;
          swingProgressRef.current = 1.0;
          if (setWorldBlock(probeX, py, probeZ, BlockType.AIR, true)) {
            playBreakSound(obs);
          }
          stuckTimerRef.current = 0.2;
          break;
        }
      }
    }

    // If really stuck for > 2.4s, blacklist unreachable target and switch cleanly
    if (stuckTimerRef.current > 2.4) {
      stuckTimerRef.current = 0;
      if (mineTargetRef.current) {
        const m = mineTargetRef.current;
        unreachableUntilRef.current.set(`${m.x},${m.y},${m.z}`, nowMs + 12000);
        mineTargetRef.current = null;
      }
      exploreGoalRef.current = null;
      if (isGroundedRef.current) velYRef.current = 8.0;
    }

    pos.x = nx;
    pos.y = ny;
    pos.z = nz;
    companionPosRef.current.x = nx;
    companionPosRef.current.y = ny;
    companionPosRef.current.z = nz;
    if (companionCombatRef) {
      companionCombatRef.current.alive = true;
      companionCombatRef.current.hp = hpRef.current;
      companionCombatRef.current.pos.x = nx;
      companionCombatRef.current.pos.y = ny;
      companionCombatRef.current.pos.z = nz;
    }

    // Apply transform to 3D rig (feet sit at ny - 1.5)
    groupRef.current.position.set(nx, ny - 1.5, nz);
    const hurtTilt = nowMs < hurtFlashUntilMsRef.current ? 0.26 : 0;
    groupRef.current.rotation.set(0, yawRef.current, hurtTilt);

    // Limb & Cape Animations
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

      if (!isInWater && isGroundedRef.current && distToPlayer < 12) {
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

    // Imperative HUD nametag updates (zero React re-renders)
    if (distSpanRef.current) {
      const dTxt = `${Math.round(distToPlayer)}m`;
      if (distSpanRef.current.textContent !== dTxt) {
        distSpanRef.current.textContent = dTxt;
      }
    }
    if (statusSpanRef.current && statusSpanRef.current.textContent !== statusLabel) {
      statusSpanRef.current.textContent = statusLabel;
    }
  });

  if (!config.enabled) return null;

  const hpPct = Math.max(0, Math.min(100, (hudHp / MAX_COMPANION_HP) * 100));
  const hpBarColor = hpPct > 55 ? '#10b981' : hpPct > 25 ? '#f59e0b' : '#ef4444';

  return (
    <group ref={groupRef} position={[posRef.current.x, posRef.current.y - 1.5, posRef.current.z]}>
      <Html position={[0, isDead ? 1.1 : 2.15, 0]} center distanceFactor={18} zIndexRange={[10, 50]}>
        <div className="flex flex-col items-center gap-0.5 pointer-events-none select-none">
          <div
            className="flex items-center gap-1.5 bg-zinc-950/90 px-2.5 py-0.5 rounded-md text-white font-mono text-[11px] font-bold whitespace-nowrap uppercase tracking-wider shadow-lg"
            style={{ border: `1px solid ${skinPreset.badgeColor}88` }}
          >
            <span className="text-[10px]">{isDead ? '💀' : '🤖'}</span>
            <span style={{ color: skinPreset.badgeColor }}>{config.name || 'Alex IA'}</span>
            <span ref={distSpanRef} className="text-[9px] text-zinc-400 font-normal ml-0.5">
              2m
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
                className="bg-black/75 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-bold text-emerald-300 whitespace-nowrap shadow"
              >
                🤝 Contigo
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

export default React.memo(AICompanion);
