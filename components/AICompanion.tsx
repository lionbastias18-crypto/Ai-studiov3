import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_COLORS } from '../constants';
import { AICompanionConfig, BlockType, EntityData, EntityType, Vector3D } from '../types';
import { CharacterModel, resolveCharacterSkin } from './CharacterModel';
import {
  playAttackSwingSound,
  playBreakSound,
  playHurtSound,
  playPlaceSound,
  playStepSound,
} from '../services/audioService';

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
  hitEntityById: (id: string) => boolean;
  onBlockEditRef: React.MutableRefObject<
    ((x: number, y: number, z: number, block: BlockType, previousBlock?: BlockType, silent?: boolean) => void) | undefined
  >;
  companionPosRef: React.MutableRefObject<Vector3D>;
  companionBagRef: React.MutableRefObject<Record<number, number>>;
  tpTrigger: number;
  onBuildComplete?: () => void;
  onCompanionSpeak?: (msg: string) => void;
}

const HOSTILE_SET = new Set<EntityType>([
  EntityType.ZOMBIE,
  EntityType.CREEPER,
  EntityType.SKELETON,
  EntityType.SNOW_SKELETON,
  EntityType.SWAMP_SKELETON,
  EntityType.ENDERMAN,
  EntityType.HOGLIN,
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

const getBlockPriority = (b: BlockType): number => {
  switch (b) {
    case BlockType.DIAMOND_ORE:
      return 100;
    case BlockType.GOLD_ORE:
      return 85;
    case BlockType.IRON_ORE:
      return 80;
    case BlockType.COAL_ORE:
    case BlockType.COPPER_ORE:
      return 70;
    case BlockType.LOG:
    case BlockType.DARK_LOG:
    case BlockType.CHERRY_LOG:
    case BlockType.GREY_LOG:
      return 65;
    case BlockType.STONE:
      return 40;
    case BlockType.DIRT:
    case BlockType.SAND:
    case BlockType.GRASS:
      return 20;
    default:
      return 0;
  }
};

const getBestToolForBlock = (b: BlockType): BlockType => {
  if (
    b === BlockType.LOG ||
    b === BlockType.DARK_LOG ||
    b === BlockType.CHERRY_LOG ||
    b === BlockType.GREY_LOG ||
    b === BlockType.WOOD
  ) {
    return BlockType.DIAMOND_AXE;
  }
  if (b === BlockType.DIRT || b === BlockType.SAND || b === BlockType.GRASS || b === BlockType.GRAVEL) {
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
  tpTrigger,
  onBuildComplete,
  onCompanionSpeak,
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

  const [heldBlock, setHeldBlock] = useState<BlockType>(BlockType.DIAMOND_SWORD);
  const heldBlockRef = useRef<BlockType>(BlockType.DIAMOND_SWORD);

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
  const stuckTimerRef = useRef(0);
  const lastStepToggleRef = useRef(false);
  const lastLavaHurtMsRef = useRef(0);
  const lastTorchPlaceMsRef = useRef(0);

  // AI brain state
  const scanTimerRef = useRef(0);
  const targetHostileRef = useRef<EntityData | null>(null);
  const lastAttackMsRef = useRef(0);
  const mineTargetRef = useRef<{ x: number; y: number; z: number; block: BlockType; progress: number } | null>(null);
  const buildQueueRef = useRef<BuildStep[]>([]);
  const lastBuildStepMsRef = useRef(0);
  const exploreGoalRef = useRef<{ x: number; z: number; untilMs: number } | null>(null);
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
    return chunk[(lx * CHUNK_SIZE * WORLD_HEIGHT) + (ry * CHUNK_SIZE) + lz] as BlockType;
  };

  const setWorldBlock = (wx: number, wy: number, wz: number, block: BlockType, emitParticles = true): boolean => {
    if (wy < 1 || wy >= WORLD_HEIGHT - 1) return false;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const existing = chunksRef.current[k];
    if (!existing) return false;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
    const prev = existing[idx] as BlockType;
    if (prev === block || prev === BlockType.BEDROCK) return false;

    const fresh = new Uint8Array(existing);
    fresh[idx] = block;
    chunksRef.current[k] = fresh;
    savedChunksRef.current[k] = fresh;
    setChunks((prevChunks) => ({ ...prevChunks, [k]: fresh }));

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
    const startY = Math.min(WORLD_HEIGHT - 3, Math.max(4, Math.round(hintY + 8)));
    const minY = Math.max(2, Math.round(hintY - 12));
    for (let y = startY; y >= minY; y--) {
      if (checkSolid(wx, y, wz) && !checkSolid(wx, y + 1, wz) && !checkSolid(wx, y + 2, wz)) {
        return y + 2.02;
      }
    }
    return hintY + 1;
  };

  const prepareShelterBlueprint = () => {
    const lp = playerPosRef.current;
    const baseX = Math.round(lp.x + 5);
    const baseZ = Math.round(lp.z + 5);
    let groundY = Math.round(lp.y - 2);
    for (let y = Math.min(WORLD_HEIGHT - 6, Math.round(lp.y + 4)); y >= Math.max(3, Math.round(lp.y - 8)); y--) {
      if (checkSolid(baseX, y, baseZ) && !checkSolid(baseX, y + 1, baseZ)) {
        groundY = y;
        break;
      }
    }

    const steps: BuildStep[] = [];
    // 5x5 wooden floor
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        steps.push({ x: baseX + dx, y: groundY, z: baseZ + dz, block: BlockType.WOOD });
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
          steps.push({
            x: baseX + dx,
            y: groundY + h,
            z: baseZ + dz,
            block: isCorner ? BlockType.LOG : BlockType.WOOD,
          });
        }
      }
    }
    // Roof
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        steps.push({ x: baseX + dx, y: groundY + 4, z: baseZ + dz, block: BlockType.TERRACOTTA_BROWN });
      }
    }
    // Door, chest, crafting table, torches
    steps.push({ x: baseX, y: groundY + 1, z: baseZ - 2, block: BlockType.DOOR });
    steps.push({ x: baseX, y: groundY + 2, z: baseZ - 2, block: BlockType.DOOR });
    steps.push({ x: baseX - 1, y: groundY + 1, z: baseZ + 1, block: BlockType.CRAFTING_TABLE });
    steps.push({ x: baseX + 1, y: groundY + 1, z: baseZ + 1, block: BlockType.CHEST });
    steps.push({ x: baseX - 1, y: groundY + 2, z: baseZ - 1, block: BlockType.TORCH });
    steps.push({ x: baseX + 1, y: groundY + 2, z: baseZ + 1, block: BlockType.TORCH });

    buildQueueRef.current = steps;
  };

  // Spawn next to player when enabled
  useEffect(() => {
    if (!config.enabled) return;
    const lp = playerPosRef.current;
    const sx = Math.round(lp.x + 2.2);
    const sz = Math.round(lp.z + 2.2);
    const sy = findSafeSurfaceY(sx, sz, lp.y);
    posRef.current = { x: sx, y: sy, z: sz };
    velYRef.current = 0;
    companionPosRef.current = { ...posRef.current };
    stayAnchorRef.current = { ...posRef.current };
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
    stayAnchorRef.current = { ...posRef.current };
    companionPosRef.current = { ...posRef.current };
  }, [tpTrigger, config.enabled]);

  // React to mode changes
  useEffect(() => {
    if (!config.enabled) return;
    if (lastModeRef.current !== config.mode) {
      lastModeRef.current = config.mode;
      mineTargetRef.current = null;
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

    const distToPlayer = Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z);

    // Keep companion within world simulation when moving across chunks
    if (config.mode !== 'stay' && (distToPlayer > 46 || pos.y < 1)) {
      const nx = lp.x + 2.2;
      const nz = lp.z + 2.2;
      pos.x = nx;
      pos.z = nz;
      pos.y = findSafeSurfaceY(Math.round(nx), Math.round(nz), lp.y);
      velYRef.current = 0;
      mineTargetRef.current = null;
    }

    // Periodic environment & mob scan (4Hz)
    scanTimerRef.current += minDelta;
    if (scanTimerRef.current >= 0.25) {
      scanTimerRef.current = 0;

      // 1. Detect nearest hostile mob around companion or player
      const combatRadius = config.mode === 'guard' ? 16 : config.mode === 'stay' ? 5.5 : 10.5;
      let bestMob: EntityData | null = null;
      let bestDistSq = combatRadius * combatRadius;
      const buckets = entitiesRef.current;
      for (const ck in buckets) {
        const list = buckets[ck];
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) {
          const ent = list[i];
          if (!ent || !ent.pos || !HOSTILE_SET.has(ent.type)) continue;
          const dCompSq =
            (ent.pos.x - pos.x) * (ent.pos.x - pos.x) +
            (ent.pos.y - (pos.y - 1.5)) * (ent.pos.y - (pos.y - 1.5)) +
            (ent.pos.z - pos.z) * (ent.pos.z - pos.z);
          const dPlaySq =
            (ent.pos.x - lp.x) * (ent.pos.x - lp.x) +
            (ent.pos.z - lp.z) * (ent.pos.z - lp.z);
          const scoreDist = Math.min(dCompSq, dPlaySq + 4);
          if (dCompSq <= bestDistSq && scoreDist <= bestDistSq) {
            bestDistSq = scoreDist;
            bestMob = ent;
          }
        }
      }
      targetHostileRef.current = bestMob;

      // 2. If in gather mode and no target block, find nearest ore/tree/stone
      if ((config.mode === 'gather' || config.mode === 'explore') && !bestMob && !mineTargetRef.current) {
        let bestBlockPos: { x: number; y: number; z: number; block: BlockType; score: number } | null = null;
        const baseX = Math.round(pos.x);
        const baseY = Math.round(pos.y - 1);
        const baseZ = Math.round(pos.z);
        const radius = config.mode === 'gather' ? 8 : 5;

        for (let ox = -radius; ox <= radius; ox += 1) {
          for (let oz = -radius; oz <= radius; oz += 1) {
            for (let oy = -2; oy <= 4; oy += 1) {
              const wx = baseX + ox;
              const wy = baseY + oy;
              const wz = baseZ + oz;
              if (wy <= 2 || wy >= WORLD_HEIGHT - 2) continue;
              const blk = getBlockAt(wx, wy, wz);
              const prio = getBlockPriority(blk);
              if (prio <= 0) continue;
              // In explore mode only stop for ores or logs occasionally
              if (config.mode === 'explore' && prio < 65) continue;
              const dist = Math.hypot(ox, oy, oz);
              const score = prio - dist * 4.5;
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
        }
      }

      // 3. Auto-light dark spots at night / caves when nearby
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
            if (setWorldBlock(tx, ty, tz, BlockType.TORCH, false)) {
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

    const hostile = targetHostileRef.current;
    if (hostile && hostile.pos) {
      // Combat behavior!
      statusLabel = '⚔️ Combate';
      updateHeldBlock(BlockType.DIAMOND_SWORD);
      lookTarget = { x: hostile.pos.x, y: hostile.pos.y + 1.0, z: hostile.pos.z };
      const distMob = Math.hypot(hostile.pos.x - pos.x, hostile.pos.z - pos.z);
      const kiteDist = hostile.type === EntityType.CREEPER ? 2.6 : 1.7;
      moveGoalX = hostile.pos.x;
      moveGoalZ = hostile.pos.z;
      desiredDist = kiteDist;
      moveSpeed = 5.6;

      if (distMob <= 3.3 && Math.abs(hostile.pos.y - (pos.y - 1.5)) <= 2.6 && nowMs - lastAttackMsRef.current > 650) {
        lastAttackMsRef.current = nowMs;
        swingProgressRef.current = 1.0;
        playAttackSwingSound();
        hitEntityById(hostile.id);
      }
    } else if (config.mode === 'build') {
      if (buildQueueRef.current.length === 0) {
        onCompanionSpeak?.(`🏠 ¡Listo! Ya terminé nuestro refugio cerca de ti.`);
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
          // Step slightly back so AI doesn't trap itself inside a block
          moveGoalX = pos.x - (step.x - pos.x);
          moveGoalZ = pos.z - (step.z - pos.z);
          desiredDist = 0;
        }

        if (dStep <= 4.8 && nowMs - lastBuildStepMsRef.current >= 280) {
          lastBuildStepMsRef.current = nowMs;
          const currentAtStep = getBlockAt(step.x, step.y, step.z);
          if (currentAtStep === BlockType.AIR || currentAtStep === BlockType.WATER) {
            // Avoid suffocating the player inside solid blocks
            const overlapsPlayer =
              Math.abs(step.x - lp.x) < 0.75 &&
              Math.abs(step.z - lp.z) < 0.75 &&
              step.y >= lp.y - 1.5 &&
              step.y <= lp.y + 0.3 &&
              step.block !== BlockType.DOOR &&
              step.block !== BlockType.TORCH;
            if (!overlapsPlayer) {
              setWorldBlock(step.x, step.y, step.z, step.block, true);
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
      if (actualNow === BlockType.AIR || actualNow === BlockType.BEDROCK) {
        mineTargetRef.current = null;
      } else {
        statusLabel = m.block === BlockType.LOG || m.block === BlockType.DARK_LOG || m.block === BlockType.CHERRY_LOG ? '🪵 Talando' : '⛏️ Minando';
        updateHeldBlock(getBestToolForBlock(m.block));
        lookTarget = { x: m.x, y: m.y, z: m.z };
        const dMine = Math.hypot(m.x - pos.x, m.z - pos.z);
        if (dMine > 2.8) {
          moveGoalX = m.x;
          moveGoalZ = m.z;
          desiredDist = 2.0;
          moveSpeed = 4.9;
        } else {
          m.progress += minDelta;
          if (swingProgressRef.current <= 0.05) {
            swingProgressRef.current = 1.0;
          }
          if (m.progress >= 0.65) {
            if (setWorldBlock(m.x, m.y, m.z, BlockType.AIR, true)) {
              playBreakSound(actualNow);
              companionBagRef.current[actualNow] = (companionBagRef.current[actualNow] || 0) + 1;
            }
            mineTargetRef.current = null;
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
      if (!exploreGoalRef.current || nowMs > exploreGoalRef.current.untilMs || Math.hypot(exploreGoalRef.current.x - pos.x, exploreGoalRef.current.z - pos.z) < 1.5) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 7 + Math.random() * 9;
        exploreGoalRef.current = {
          x: lp.x + Math.cos(ang) * dist,
          z: lp.z + Math.sin(ang) * dist,
          untilMs: nowMs + 6000,
        };
      }
      if (distToPlayer > 22) {
        moveGoalX = lp.x;
        moveGoalZ = lp.z;
        desiredDist = 5;
        moveSpeed = 5.4;
      } else {
        moveGoalX = exploreGoalRef.current.x;
        moveGoalZ = exploreGoalRef.current.z;
        desiredDist = 0.8;
        moveSpeed = 4.2;
      }
    } else {
      // 'follow' or 'guard' or 'gather' idle near player
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

    // --- Water & Lava check ---
    const blockFeet = getBlockAt(pos.x, pos.y - 1.4, pos.z);
    const blockWaist = getBlockAt(pos.x, pos.y - 0.8, pos.z);
    const isInWater = blockFeet === BlockType.WATER || blockWaist === BlockType.WATER;
    const isInLava = blockFeet === BlockType.LAVA || blockWaist === BlockType.LAVA;

    if (isInWater) {
      statusLabel = '🏊 Nadando';
      moveSpeed *= 0.82;
    }
    if (isInLava && nowMs - lastLavaHurtMsRef.current > 800) {
      lastLavaHurtMsRef.current = nowMs;
      velYRef.current = 6.2;
      playHurtSound();
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

    // Gravity / Swim Buoyancy
    if (isInWater) {
      const targetVy = blockWaist === BlockType.WATER ? 3.4 : 0.4;
      velYRef.current = THREE.MathUtils.damp(velYRef.current, targetVy, 8, minDelta);
    } else {
      velYRef.current = Math.max(-24, velYRef.current - 24 * minDelta);
    }

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

    // If really stuck for > 2s, hop slightly toward player
    if (stuckTimerRef.current > 2.2) {
      stuckTimerRef.current = 0;
      mineTargetRef.current = null;
      exploreGoalRef.current = null;
      if (isGroundedRef.current) velYRef.current = 8.0;
    }

    pos.x = nx;
    pos.y = ny;
    pos.z = nz;
    companionPosRef.current.x = nx;
    companionPosRef.current.y = ny;
    companionPosRef.current.z = nz;

    // Apply transform to 3D rig (feet sit at ny - 1.5)
    groupRef.current.position.set(nx, ny - 1.5, nz);
    groupRef.current.rotation.set(0, yawRef.current, 0);

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

      // Subtle step sound only when close to player
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

  return (
    <group ref={groupRef} position={[posRef.current.x, posRef.current.y - 1.5, posRef.current.z]}>
      <Html position={[0, 2.05, 0]} center distanceFactor={18} zIndexRange={[10, 50]}>
        <div
          className="flex flex-col items-center gap-0.5 pointer-events-none select-none"
        >
          <div
            className="flex items-center gap-1.5 bg-zinc-950/90 px-2.5 py-0.5 rounded-md text-white font-mono text-[11px] font-bold whitespace-nowrap uppercase tracking-wider shadow-lg"
            style={{ border: `1px solid ${skinPreset.badgeColor}88` }}
          >
            <span className="text-[10px]">🤖</span>
            <span style={{ color: skinPreset.badgeColor }}>{config.name || 'Alex IA'}</span>
            <span ref={distSpanRef} className="text-[9px] text-zinc-400 font-normal ml-0.5">
              2m
            </span>
          </div>
          <span
            ref={statusSpanRef}
            className="bg-black/75 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-bold text-emerald-300 whitespace-nowrap shadow"
          >
            🤝 Contigo
          </span>
        </div>
      </Html>

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
    </group>
  );
};

export default React.memo(AICompanion);
