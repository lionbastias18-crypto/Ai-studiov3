
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_COLORS, VIEW_DISTANCE, BLOCK_NAMES } from '../constants';
import { BlockType, EntityType, EntityData, Vector3D } from '../types';
import { playPlaceSound, playBreakSound, playStepSound, resumeAudio, playSleepSound, playHurtSound, playZombieSound, playCreeperSizzle, playExplosionSound, playBowShootSound, updateAmbientEnvironment } from '../services/audioService';
import { gameState } from '../store';
import { createNoise2D, createNoise3D } from 'simplex-noise';

// Seeded RNG for noise
const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

const createNoise = (seed: number) => {
    const rng = lcg(seed);
    const simplex = createNoise2D(rng);

    return (x: number, z: number) => {
        // Fractal Brownian Motion (fBm)
        let total = 0;
        let frequency = 0.015;
        let amplitude = 1.0;
        let maxValue = 0;
        for(let i = 0; i < 5; i++) {
            // simplex noise returns -1 to 1.
            // we'll map it to 0 to 1 for our calculations
            const n = (simplex(x * frequency, z * frequency) + 1) * 0.5;
            total += n * amplitude;
            maxValue += amplitude;
            amplitude *= 0.45;
            frequency *= 2.1;
        }
        
        // Normalize to [0, 1]
        let normalized = total / maxValue;
        
        // Push values away from the center to create more pronounced valleys and hills
        // by applying a smoothstep or power function
        const shift = Math.pow(normalized, 1.5); 
        
        // Scale to [0, 10] range
        let finalVal = shift * 10;
        if (finalVal < 0) finalVal = 0;
        return finalVal;
    };
};

const create3DNoise = (seed: number) => {
    const rng = lcg(seed);
    const simplex = createNoise3D(rng);
    return (x: number, y: number, z: number) => {
        return simplex(x, y, z);
    };
};

const caveNoise = (x: number, y: number, z: number) => {
    // Only generate caves underground (under height 52)
    if (y > 52) return 0.0;
    
    const { cave3D } = getNoiseForWorld(activeWorldId);
    
    // Scale coordinates. Lower values = larger, more continuous caves.
    // 0.035 for x and z, and 0.05 for y creates perfect organic winding corridors.
    const n = cave3D(x * 0.035, y * 0.05, z * 0.035);
    
    // Smooth transition: caves should fade out as they reach the surface to avoid breaking the terrain randomly
    // At y near 52, depthFactor goes to 0
    const depthFactor = Math.min(1.0, (52 - y) / 12);
    
    // An absolute threshold of 0.28 created spacious, beautiful 3D winding cave corridors (3-5 blocks wide)
    const threshold = 0.28 * depthFactor;
    
    if (Math.abs(n) < threshold) {
        return 1.0; // Hollow!
    }
    
    // Additional circular pocket caverns/chambers at deeper depths for extra exploration drama (3D large rooms)
    if (y < 30) {
        const nCavern = cave3D(x * 0.02, y * 0.03, z * 0.02);
        // Larger chambers at deeper layers
        if (nCavern > 0.42 * (1.1 + (y / 30) * 0.15)) {
            return 1.0;
        }
    }
    
    return 0.0;
};

let activeWorldId = 'temp';
let activeWorldType = 'normal';
const worldSeeds = new Map<string, { 
    noise: (x: number, z: number) => number; 
    biomeNoiseFun: (x: number, z: number) => number; 
    cave3D: (x: number, y: number, z: number) => number;
    seed: number 
}>();

const getSeededRandom = (seed: number, x: number, z: number, offset: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233 + offset + seed) * 43758.5453123;
  return s - Math.floor(s);
};

const getNoiseForWorld = (worldId: string) => {
  const existing = worldSeeds.get(worldId);
  if (existing) return existing;

  // Generate stable seed from worldId hash
  let hash = 0;
  for (let i = 0; i < worldId.length; i++) {
    hash = (hash << 5) - hash + worldId.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash) % 100000;
  
  const wNoise = createNoise(seed);
  const wBiomeNoise = createNoise(seed + 500);
  const wCave3D = create3DNoise(seed + 1000);
  
  const res = { noise: wNoise, biomeNoiseFun: wBiomeNoise, cave3D: wCave3D, seed };
  worldSeeds.set(worldId, res);
  return res;
};

const getWorldHeight = (x: number, z: number) => {
    const absX = Math.abs(x);
    const absZ = Math.abs(z);
    if (absX >= 1500 || absZ >= 1500 || activeWorldType === 'edge_farlands') {
        const noiseX = activeWorldType === 'edge_farlands' ? x + 15000 : x;
        const noiseZ = activeWorldType === 'edge_farlands' ? z + 15000 : z;
        const hFar = 95 + Math.floor(
            Math.sin(noiseX * 0.03) * 12 + 
            Math.cos(noiseZ * 0.03) * 12 +
            (activeWorldType === 'edge_farlands' ? Math.sin(noiseX * 0.15) * 6 + Math.cos(noiseZ * 0.15) * 6 : 0)
        );
        let h = Math.floor(hFar);
        if (h < 50) h = 50;
        if (h >= WORLD_HEIGHT - 3) h = WORLD_HEIGHT - 4;
        return { h, biome: 'mountains' };
    }

    const { noise, biomeNoiseFun } = getNoiseForWorld(activeWorldId);
    // bNoise helps distinguish biomes. It ranges from ~0 to 10.
    const bNoise = biomeNoiseFun(x * 0.005, z * 0.005);
    
    let biome = 'plains';
    if (bNoise < 3.0) biome = 'desert';
    else if (bNoise >= 6.5 && bNoise < 8.0) biome = 'mesa';
    else if (bNoise >= 8.0) biome = 'mountains';

    // noise now returns approximately 0 to 10. We will scale this UP!
    let n = noise(x, z); 
    
    // Smooth transition logic with VERY GENTLE variations
    // Let's multiply n to get higher variance
    n = n * 2.5; // n is now 0 to 25 roughly
    
    if (biome === 'mesa') {
        n = n * 1.5 + 8; // 8 to 45
    } else if (biome === 'desert') {
        n = n * 1.2 + 5; // 5 to 35
    } else if (biome === 'mountains') {
        // Huge mountains
        n = Math.pow(n * 0.15, 2.8) * 5.0 + 10;
    } else {
        // plains: rolling hills
        n = n * 1.2 + 4; // 4 to 34
    }
    
    // Very soft transition blending at margins to avoid any step/cliff cuts
    if (bNoise >= 8.0) {
        const blend = Math.min(1.0, (bNoise - 8.0) / 1.0); // 8.0 to 9.0 blends
        const mountainHeight = Math.pow(noise(x, z) * 2.5 * 0.15, 2.8) * 5.0 + 10;
        const plainsHeight = noise(x, z) * 2.5 * 1.2 + 4;
        n = plainsHeight * (1 - blend) + mountainHeight * blend;
    } else if (bNoise >= 5.5 && bNoise < 6.5) { // blend into mesa
        const blend = Math.min(1.0, (6.5 - bNoise) / 1.0);
        const mesaHeight = noise(x, z) * 2.5 * 1.5 + 8;
        const plainsHeight = noise(x, z) * 2.5 * 1.2 + 4;
        n = plainsHeight * blend + mesaHeight * (1 - blend);
    } else if (bNoise < 4.0 && bNoise >= 3.0) { // blend out of desert
        const blend = Math.min(1.0, (4.0 - bNoise) / 1.0);
        const desertHeight = noise(x, z) * 2.5 * 1.2 + 5;
        const plainsHeight = noise(x, z) * 2.5 * 1.2 + 4;
        n = plainsHeight * (1 - blend) + desertHeight * blend;
    }
    
    let h = Math.floor(n + 50);
    if (h < 50) h = 50;
    if (h >= WORLD_HEIGHT - 3) h = WORLD_HEIGHT - 4;

    return { h, biome };
};

interface VoxelWorldProps {
  currentBlock: BlockType;
  playerPos: Vector3D;
  onBlockChange: (pos: Vector3D) => void;
  moveVector: { x: number; y: number };
  lookOffsetRef: React.MutableRefObject<{ x: number, y: number }>;
  interactionMode: 'break' | 'place';
  isJumping: boolean;
  perspective?: 'first' | 'second' | 'third';
  fov?: number;
  ultraOptimization?: boolean;
  worldId?: string;
  initialEdits?: Record<string, number>;
  onBlockEdit?: (x: number, y: number, z: number, blockType: BlockType) => void;
  gameMode?: 'creative' | 'survival' | 'adventure' | 'creativo' | 'supervivencia' | 'aventura';
  worldType?: 'flat' | 'normal' | 'edge_farlands' | 'plano' | 'plano_infinito';
  onSelectBlock?: (block: BlockType) => void;
  onOpenCraftingTable?: () => void;
  survivalInventory?: Record<number, number>;
}

// Animal: Componente controlador de todo tipo de entidades (Pasivas y Hostiles), optimizado al maximo
const Animal: React.FC<{ 
  data: EntityData; 
  checkSolid: (x: number, y: number, z: number) => boolean;
  playerPosRef: React.MutableRefObject<Vector3D>;
  removeEntity: (id: string) => void;
  spawnArrow?: (pos: { x: number, y: number, z: number }, dir: THREE.Vector3) => void;
  chunksRef: React.MutableRefObject<Record<string, Uint8Array>>;
  setChunks: React.Dispatch<React.SetStateAction<Record<string, Uint8Array>>>;
  editsRef: React.MutableRefObject<Record<string, number>>;
  particlesRef: React.MutableRefObject<any[]>;
  gameTimeRef: React.MutableRefObject<number>;
  currentBlockRef: React.MutableRefObject<BlockType>;
}> = ({ data, checkSolid, playerPosRef, removeEntity, spawnArrow, chunksRef, setChunks, editsRef, particlesRef, gameTimeRef, currentBlockRef }) => {
  const meshRef = useRef<THREE.Group>(null);
  const velocityY = useRef(0);
  const knockbackRef = useRef({ x: 0, y: 0, z: 0 });
  
  // Game limits & configurations
  const [flashRed, setFlashRed] = useState(false);
  const entityHealth = useRef(data.type === EntityType.PIG || data.type === EntityType.SHEEP || data.type === EntityType.VILLAGER ? 10 : 20);

  // Timers and state refs
  const lastSoundPlayRef = useRef(0);
  const fuseTimerRef = useRef(0);
  const fuseActiveRef = useRef(false);
  const skCooldownRef = useRef(Math.random() * 2);
  const attackCooldownRef = useRef(0);
  
  const checkSolidRef = useRef(checkSolid);
  checkSolidRef.current = checkSolid;

  // Hurt handler when player left clicks/hits the entity
  const handleHit = () => {
    if (entityHealth.current <= 0) return;

    // Red flash highlight
    setFlashRed(true);
    setTimeout(() => setFlashRed(false), 200);

    // Play entity hurt sound
    playHurtSound();

    // Damage calculation based on tool (holding something is better)
    const held = currentBlockRef.current;
    let damage = 5;
    if (held === BlockType.SWORD) damage = 12;      // Minecraft-like espada damage
    else if (held === BlockType.PICKAXE) damage = 8; // Pico deals solid damage
    else if (held === BlockType.AXE) damage = 7;     // Hacha deals moderate damage
    else if (held === BlockType.SHOVEL) damage = 6;  // Pala deals slightly more than bare hand
    
    entityHealth.current -= damage;

    // Calculate realistic knockback away from player
    const pPos = playerPosRef.current;
    if (pPos) {
      const dx = data.pos.x - pPos.x;
      const dz = data.pos.z - pPos.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.01) {
        knockbackRef.current.x = (dx / len) * 7.5;
        knockbackRef.current.z = (dz / len) * 7.5;
        knockbackRef.current.y = 3.8; // pop outwards
      }
    }

    // Death hook
    if (entityHealth.current <= 0) {
      // Spawn standard smoke clouds at death spot
      const deathSmoke = [];
      const baseId = Date.now() + Math.random();
      for (let i = 0; i < 12; i++) {
        deathSmoke.push({
          id: baseId + i,
          x: data.pos.x + (Math.random() - 0.5) * 0.5,
          y: data.pos.y + 0.4 + (Math.random() - 0.5) * 0.5,
          z: data.pos.z + (Math.random() - 0.5) * 0.5,
          vx: (Math.random() - 0.5) * 1.5,
          vy: Math.random() * 1.5 + 0.5,
          vz: (Math.random() - 0.5) * 1.5,
          color: '#ffffff',
          size: 0.15 + Math.random() * 0.12,
          life: 0.6
        });
      }
      particlesRef.current.push(...deathSmoke);

      // Remove from map
      removeEntity(data.id);
    }
  };

  // Creeper TNT blast logic
  const explodeCreeper = () => {
    playExplosionSound();
    
    const ex = data.pos.x;
    const ey = data.pos.y;
    const ez = data.pos.z;

    // 1. Break blocks in a spherical 2.8 radius column smoothly
    const r = 3;
    const affectedCoords: { wx: number, wy: number, wz: number }[] = [];

    for (let x = -r; x <= r; x++) {
      for (let y = -r; y <= r; y++) {
        for (let z = -r; z <= r; z++) {
          if (x*x + y*y + z*z <= r*r) {
            const wx = Math.round(ex + x);
            const wy = Math.round(ey + y);
            const wz = Math.round(ez + z);

            const cx = Math.floor(wx / CHUNK_SIZE);
            const cz = Math.floor(wz / CHUNK_SIZE);
            const k = `${cx},${cz}`;

            if (chunksRef.current[k]) {
              const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
              const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
              if (wy >= 0 && wy < WORLD_HEIGHT) {
                const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
                const block = chunksRef.current[k][idx];

                if (block !== BlockType.AIR && block !== BlockType.BEDROCK) {
                  affectedCoords.push({ wx, wy, wz });
                }
              }
            }
          }
        }
      }
    }

    if (affectedCoords.length > 0) {
      setChunks(prev => {
        const next = { ...prev };
        affectedCoords.forEach(({ wx, wy, wz }) => {
          const cx = Math.floor(wx / CHUNK_SIZE);
          const cz = Math.floor(wz / CHUNK_SIZE);
          const k = `${cx},${cz}`;

          if (next[k]) {
            const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
            
            const freshData = new Uint8Array(next[k]);
            freshData[idx] = BlockType.AIR;
            next[k] = freshData;

            if (editsRef.current) {
              editsRef.current[`${wx},${wy},${wz}`] = BlockType.AIR;
            }
          }
        });
        return next;
      });

      // Spawn extensive block debris particles
      const exParticles: any[] = [];
      const baseId = Date.now() + Math.random();
      affectedCoords.slice(0, 18).forEach((coord, i) => {
        exParticles.push({
          id: baseId + i,
          x: coord.wx,
          y: coord.wy,
          z: coord.wz,
          vx: (Math.random() - 0.5) * 4.2,
          vy: Math.random() * 3.5 + 1.5,
          vz: (Math.random() - 0.5) * 4.2,
          color: '#555555',
          size: 0.12 + Math.random() * 0.14,
          life: 0.9
        });
      });
      particlesRef.current.push(...exParticles);
    }

    // 2. Blow damage to player
    const playerPos = playerPosRef.current;
    if (playerPos) {
      const dist = Math.sqrt(
        Math.pow(ex - playerPos.x, 2) +
        Math.pow(ey - playerPos.y, 2) +
        Math.pow(ez - playerPos.z, 2)
      );

      if (dist < 4.8) {
        const isCreativeVal = (gameState as any).gameMode === 'creative' || (gameState as any).gameMode === 'creativo';
        if (!isCreativeVal) {
          const damage = Math.max(1, Math.round((4.8 - dist) * 4));
          gameState.setHealth(gameState.health - damage);
          playHurtSound();
        }
      }
    }

    removeEntity(data.id);
  };

  // Skeleton archery bow fire
  const shootBow = () => {
    if (!spawnArrow) return;
    playBowShootSound();

    const headPos = { x: data.pos.x, y: data.pos.y + 1.2, z: data.pos.z };
    const playerPos = playerPosRef.current;
    if (!playerPos) return;

    // Standard normalized vectors pointing to target
    const dir = new THREE.Vector3(
      playerPos.x - headPos.x,
      playerPos.y + 0.3 - headPos.y, // torso level
      playerPos.z - headPos.z
    ).normalize();

    spawnArrow(headPos, dir);
  };

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const pPos = playerPosRef.current;
    if (!pPos || !checkSolidRef.current) return;

    const minDelta = Math.min(delta, 0.1);

    // --- Entity Distance Culling Optimization ---
    // If we are far from action, hide and pause loop entirely (huge FPS gain)
    const dist = Math.sqrt(
      Math.pow(data.pos.x - pPos.x, 2) +
      Math.pow(data.pos.z - pPos.z, 2)
    );

    if (dist > 35) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;

    const isHostile = data.type === EntityType.ZOMBIE || data.type === EntityType.SKELETON || data.type === EntityType.CREEPER;
    const isDay = Math.sin(gameTimeRef.current) > 0;
    if (isHostile && isDay) {
      // Burn or vanish during the day (zombies and skeletons burn, we'll just vanish them to "solve" it quickly)
      removeEntity(data.id);
      return;
    }

    // --- Arrow projectile engine ---
    if (data.type === EntityType.ARROW) {
      const vx = (data as any).vx || 0;
      const vy = (data as any).vy || 0;
      const vz = (data as any).vz || 0;

      // Realistic gravity
      const nextVy = vy - 9.8 * minDelta;
      (data as any).vy = nextVy;

      const nextX = data.pos.x + vx * minDelta;
      const nextY = data.pos.y + nextVy * minDelta;
      const nextZ = data.pos.z + vz * minDelta;

      // Collision checks with blocks (only 1 check per tick)
      if (checkSolidRef.current(Math.floor(nextX), Math.floor(nextY), Math.floor(nextZ))) {
        removeEntity(data.id);
        return;
      }

      // Check player hits
      const d3d = Math.sqrt(
        Math.pow(nextX - pPos.x, 2) +
        Math.pow(nextY - pPos.y, 2) +
        Math.pow(nextZ - pPos.z, 2)
      );

      if (d3d < 1.3) {
        const creative = (gameState as any).gameMode === 'creative' || (gameState as any).gameMode === 'creativo';
        if (!creative) {
          gameState.setHealth(gameState.health - 2);
          playHurtSound();
        }
        removeEntity(data.id);
        return;
      }

      // Projectile max life
      const remainingLife = ((data as any).life || 5.0) - minDelta;
      (data as any).life = remainingLife;
      if (remainingLife <= 0) {
        removeEntity(data.id);
        return;
      }

      data.pos.x = nextX;
      data.pos.y = nextY;
      data.pos.z = nextZ;

      meshRef.current.position.set(nextX, nextY, nextZ);

      // Point towards trajectory
      const spd = Math.sqrt(vx * vx + vz * vz);
      meshRef.current.rotation.y = Math.atan2(vx, vz);
      meshRef.current.rotation.x = -Math.atan2(nextVy, spd);
      return;
    }

    // --- Grounded & Gravity and Knockback physics for all mobs/animals ---
    // Handle knockback dampening
    if (knockbackRef.current.x !== 0 || knockbackRef.current.z !== 0 || knockbackRef.current.y !== 0) {
      knockbackRef.current.x *= 0.84;
      knockbackRef.current.z *= 0.84;
      knockbackRef.current.y -= 15.0 * minDelta;
      if (Math.abs(knockbackRef.current.x) < 0.1) knockbackRef.current.x = 0;
      if (Math.abs(knockbackRef.current.z) < 0.1) knockbackRef.current.z = 0;
      if (knockbackRef.current.y < -15.0) knockbackRef.current.y = -15.0;
    }

    // AI Chasing vs Wandering
    let speed = data.type === EntityType.PIG || data.type === EntityType.SHEEP || data.type === EntityType.VILLAGER ? 0.8 : 1.1;
    let targetRot = data.rot;
    let isAggro = false;

    if (data.type === EntityType.ZOMBIE || data.type === EntityType.CREEPER || data.type === EntityType.SKELETON) {
      if (dist < 16) {
        isAggro = true;
        targetRot = Math.atan2(pPos.x - data.pos.x, pPos.z - data.pos.z);
        
        if (data.type === EntityType.ZOMBIE) {
          speed = 1.4;
          // Play Zombie moan sound occasionally (every ~8-12 seconds)
          if (state.clock.elapsedTime - lastSoundPlayRef.current > 8 && Math.random() < 0.05) {
            playZombieSound();
            lastSoundPlayRef.current = state.clock.elapsedTime;
          }
        } else if (data.type === EntityType.CREEPER) {
          if (dist <= 2.8) {
            speed = 0; // stop to fuse
            if (!fuseActiveRef.current) {
              fuseActiveRef.current = true;
              playCreeperSizzle();
            }
            fuseTimerRef.current += minDelta;
            if (fuseTimerRef.current >= 1.5) {
              explodeCreeper();
              return;
            }
          } else {
            if (fuseActiveRef.current && dist > 3.8) {
              fuseActiveRef.current = false;
              fuseTimerRef.current = 0;
            }
            speed = 1.6;
          }
        } else if (data.type === EntityType.SKELETON) {
          if (dist < 7.0) {
            speed = -0.6; // Backpedal
          } else if (dist <= 10.5) {
            speed = 0; // Stay in range and aim
          } else {
            speed = 1.2;
          }

          // Aim bow & fire arrow every 2.4s
          skCooldownRef.current -= minDelta;
          if (skCooldownRef.current <= 0) {
            skCooldownRef.current = 2.4 + Math.random() * 0.4;
            shootBow();
          }
        }
      } else {
        if (fuseActiveRef.current) {
          fuseActiveRef.current = false;
          fuseTimerRef.current = 0;
        }
      }
    }

    if (!isAggro) {
      if (Math.random() < 0.006) {
        data.rot += (Math.random() - 0.5) * 3;
      }
      targetRot = data.rot;
    } else {
      data.rot = targetRot;
    }

    // Apply movement velocities
    let dx = Math.sin(targetRot) * speed * minDelta + knockbackRef.current.x * minDelta;
    let dz = Math.cos(targetRot) * speed * minDelta + knockbackRef.current.z * minDelta;

    velocityY.current -= 25.0 * minDelta;
    let dy = (velocityY.current + knockbackRef.current.y) * minDelta;

    let nextX = data.pos.x + dx;
    let nextY = data.pos.y + dy;
    let nextZ = data.pos.z + dz;

    // --- Low Overhead Fast Collision Check ---
    const rx = 0.25;
    const rz = 0.25;

    const checkFeetSolid = (px: number, py: number, pz: number) => {
      const checkY = Math.floor(py);
      return (
        checkSolidRef.current(Math.floor(px - rx), checkY, Math.floor(pz - rz)) ||
        checkSolidRef.current(Math.floor(px + rx), checkY, Math.floor(pz - rz)) ||
        checkSolidRef.current(Math.floor(px - rx), checkY, Math.floor(pz + rz)) ||
        checkSolidRef.current(Math.floor(px + rx), checkY, Math.floor(pz + rz))
      );
    };

    let isGrounded = false;
    if (dy <= 0) {
      if (checkFeetSolid(data.pos.x, nextY, data.pos.z)) {
        nextY = Math.ceil(nextY);
        velocityY.current = 0;
        isGrounded = true;
      }
    }

    const getHeightSolid = (px: number, py: number, pz: number) => {
      const checkY = Math.floor(py);
      return (
         checkSolidRef.current(Math.floor(px - rx), checkY, Math.floor(pz - rz)) ||
         checkSolidRef.current(Math.floor(px + rx), checkY, Math.floor(pz - rz)) ||
         checkSolidRef.current(Math.floor(px - rx), checkY, Math.floor(pz + rz)) ||
         checkSolidRef.current(Math.floor(px + rx), checkY, Math.floor(pz + rz))
      );
    };

    // Auto climb / blocks X
    const checkWallX = getHeightSolid(nextX, data.pos.y + 0.1, data.pos.z);
    if (checkWallX) {
      if (isGrounded && !getHeightSolid(nextX, data.pos.y + 1.1, data.pos.z)) {
        velocityY.current = 5.8; // jump wall!
      } else {
        dx = 0;
        nextX = data.pos.x;
        if (!isAggro) data.rot += Math.PI * 0.5; // Turn around
      }
    }

    // Auto climb / blocks Z
    const checkWallZ = getHeightSolid(data.pos.x, data.pos.y + 0.1, nextZ);
    if (checkWallZ) {
      if (isGrounded && !getHeightSolid(data.pos.x, data.pos.y + 1.1, nextZ)) {
        velocityY.current = 5.8; // jump wall!
      } else {
        dz = 0;
        nextZ = data.pos.z;
        if (!isAggro) data.rot += Math.PI * 0.5; // Turn around
      }
    }

    data.pos.x = nextX;
    data.pos.y = nextY;
    data.pos.z = nextZ;

    meshRef.current.position.set(nextX, nextY, nextZ);
    meshRef.current.rotation.y = targetRot;

    // Bounce walk animations
    const walkAnim = isGrounded && (dx !== 0 || dz !== 0) ? Math.abs(Math.sin(state.clock.elapsedTime * 9)) * 0.11 : 0;
    meshRef.current.position.y += walkAnim;

    // Contact hits from Zombies
    if (data.type === EntityType.ZOMBIE && dist < 1.1) {
      attackCooldownRef.current -= minDelta;
      if (attackCooldownRef.current <= 0) {
        attackCooldownRef.current = 1.0;
        const creative = (gameState as any).gameMode === 'creative' || (gameState as any).gameMode === 'creativo';
        if (!creative) {
          gameState.setHealth(gameState.health - 3);
          playHurtSound();
        }
      }
    } else if (attackCooldownRef.current > 0) {
      attackCooldownRef.current -= minDelta;
    }
  });

  const bodyColor = flashRed ? '#ff2020' : (data.type === EntityType.PIG ? '#ffafaf' : (data.type === EntityType.SHEEP ? '#ffffff' : '#307030'));

  // Render model based on EntityType
  return (
    <group 
      ref={meshRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        handleHit();
      }}
    >
      {/* 1. Pig Render Model */}
      {data.type === EntityType.PIG && (
        <>
          {/* Cuerpo */}
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[0.6, 0.5, 0.9]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Cabeza */}
          <mesh position={[0, 0.6, 0.5]}>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Ojos estilo Minecraft */}
          <mesh position={[-0.14, 0.64, 0.701]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.11, 0.64, 0.702]}>
            <boxGeometry args={[0.04, 0.04, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[0.14, 0.64, 0.701]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.11, 0.64, 0.702]}>
            <boxGeometry args={[0.04, 0.04, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          {/* Hocico rosa */}
          <mesh position={[0, 0.54, 0.725]}>
            <boxGeometry args={[0.18, 0.1, 0.08]} />
            <meshStandardMaterial color="#ff8080" />
          </mesh>
          {/* Patas (4) */}
          {[[-0.2, 0, 0.3], [0.2, 0, 0.3], [-0.2, 0, -0.3], [0.2, 0, -0.3]].map((p, i) => (
            <mesh key={i} position={p as any}>
              <boxGeometry args={[0.15, 0.4, 0.15]} />
              <meshStandardMaterial color="#e09090" />
            </mesh>
          ))}
        </>
      )}

      {/* 2. Sheep Render Model */}
      {data.type === EntityType.SHEEP && (
        <>
          {/* Cuerpo lanudo */}
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.65, 0.55, 0.9]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Cabeza */}
          <mesh position={[0, 0.65, 0.5]}>
            <boxGeometry args={[0.38, 0.38, 0.38]} />
            <meshStandardMaterial color="#ededed" />
          </mesh>
          {/* Ojos Sheep */}
          <mesh position={[-0.13, 0.68, 0.691]}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.10, 0.68, 0.692]}>
            <boxGeometry args={[0.035, 0.035, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[0.13, 0.68, 0.691]}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.10, 0.68, 0.692]}>
            <boxGeometry args={[0.035, 0.035, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          {/* Patas */}
          {[[-0.22, 0, 0.3], [0.22, 0, 0.3], [-0.22, 0, -0.3], [0.22, 0, -0.3]].map((p, i) => (
            <mesh key={i} position={p as any}>
              <boxGeometry args={[0.14, 0.4, 0.14]} />
              <meshStandardMaterial color="#cccccc" />
            </mesh>
          ))}
        </>
      )}

      {/* 2.5 Villager Render Model */}
      {data.type === EntityType.VILLAGER && (
        <>
          {/* Body */}
          <mesh position={[0, 0.75, 0]}>
            <boxGeometry args={[0.5, 0.9, 0.35]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#885533'} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 1.45, 0]}>
            <boxGeometry args={[0.4, 0.5, 0.4]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#eebb99'} />
          </mesh>
          {/* Ojos Emerald-Green */}
          <mesh position={[-0.12, 1.48, 0.201]}>
            <boxGeometry args={[0.07, 0.14, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.12, 1.48, 0.202]}>
            <boxGeometry args={[0.035, 0.08, 0.02]} />
            <meshStandardMaterial color="#10b981" />
          </mesh>
          <mesh position={[0.12, 1.48, 0.201]}>
            <boxGeometry args={[0.07, 0.14, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.12, 1.48, 0.202]}>
            <boxGeometry args={[0.035, 0.08, 0.02]} />
            <meshStandardMaterial color="#10b981" />
          </mesh>
          {/* Nose */}
          <mesh position={[0, 1.35, 0.25]}>
            <boxGeometry args={[0.1, 0.2, 0.1]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#cc9977'} />
          </mesh>
          {/* Arms (crossed) */}
          <mesh position={[0, 0.8, 0.2]}>
            <boxGeometry args={[0.6, 0.25, 0.25]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#774422'} />
          </mesh>
          {/* Legs */}
          <mesh position={[-0.15, 0.15, 0]}>
            <boxGeometry args={[0.2, 0.3, 0.25]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#553311'} />
          </mesh>
          <mesh position={[0.15, 0.15, 0]}>
            <boxGeometry args={[0.2, 0.3, 0.25]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#553311'} />
          </mesh>
        </>
      )}

      {/* 3. Zombie Render Model */}
      {data.type === EntityType.ZOMBIE && (
        <group position={[0, 0.4, 0]}>
          {/* Cabeza */}
          <mesh position={[0, 1.0, 0]}>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Ojos Zombie */}
          <mesh position={[-0.11, 1.04, 0.201]}>
            <boxGeometry args={[0.09, 0.05, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[0.11, 1.04, 0.201]}>
            <boxGeometry args={[0.09, 0.05, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[-0.11, 1.04, 0.202]}>
            <boxGeometry args={[0.045, 0.05, 0.02]} />
            <meshStandardMaterial color="#4ade80" />
          </mesh>
          <mesh position={[0.11, 1.04, 0.202]}>
            <boxGeometry args={[0.045, 0.05, 0.02]} />
            <meshStandardMaterial color="#4ade80" />
          </mesh>
          {/* Camisa */}
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.45, 0.5, 0.25]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#106090'} />
          </mesh>
          {/* Pantalon */}
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.42, 0.3, 0.24]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#222277'} />
          </mesh>
          {/* Brazos extendidos al frente */}
          <mesh position={[-0.26, 0.5, 0.25]}>
            <boxGeometry args={[0.12, 0.12, 0.4]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0.26, 0.5, 0.25]}>
            <boxGeometry args={[0.12, 0.12, 0.4]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Piernas */}
          <mesh position={[-0.1, -0.2, 0]}>
            <boxGeometry args={[0.15, 0.4, 0.15]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#222277'} />
          </mesh>
          <mesh position={[0.1, -0.2, 0]}>
            <boxGeometry args={[0.15, 0.4, 0.15]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#222277'} />
          </mesh>
        </group>
      )}

      {/* 4. Creeper Render Model */}
      {data.type === EntityType.CREEPER && (
        <group position={[0, 0, 0]}>
          {/* Cabeza */}
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Rostro de Creeper (Ojos y boca triste) */}
          <mesh position={[-0.11, 1.25, 0.201]}>
            <boxGeometry args={[0.09, 0.09, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[0.11, 1.25, 0.201]}>
            <boxGeometry args={[0.09, 0.09, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[0, 1.12, 0.201]}>
            <boxGeometry args={[0.12, 0.14, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[-0.08, 1.07, 0.201]}>
            <boxGeometry args={[0.08, 0.12, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          <mesh position={[0.08, 1.07, 0.201]}>
            <boxGeometry args={[0.08, 0.12, 0.02]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
          {/* Cuerpo largo */}
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.3, 0.7, 0.24]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Patas con garras (4) */}
          <mesh position={[-0.13, 0.1, 0.13]}>
            <boxGeometry args={[0.15, 0.2, 0.15]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0.13, 0.1, 0.13]}>
            <boxGeometry args={[0.15, 0.2, 0.15]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[-0.13, 0.1, -0.13]}>
            <boxGeometry args={[0.15, 0.2, 0.15]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0.13, 0.1, -0.13]}>
            <boxGeometry args={[0.15, 0.2, 0.15]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
        </group>
      )}

      {/* 5. Skeleton Render Model */}
      {data.type === EntityType.SKELETON && (
        <group position={[0, 0.4, 0]}>
          {/* Cabeza */}
          <mesh position={[0, 1.0, 0]}>
            <boxGeometry args={[0.35, 0.35, 0.35]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#d2d2d2'} />
          </mesh>
          {/* Cuencas Oculares Vacías de Esqueleto */}
          <mesh position={[-0.09, 1.05, 0.176]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
          <mesh position={[0.09, 1.05, 0.176]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
          <mesh position={[0, 0.92, 0.176]}>
            <boxGeometry args={[0.18, 0.03, 0.02]} />
            <meshStandardMaterial color="#555555" />
          </mesh>
          {/* Torso esqueleto */}
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.22, 0.5, 0.12]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#cecece'} />
          </mesh>
          {/* Brazos delgados */}
          <mesh position={[-0.15, 0.5, 0.2]}>
            <boxGeometry args={[0.06, 0.06, 0.32]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#bfbfbf'} />
          </mesh>
          <mesh position={[0.15, 0.5, 0.2]}>
            <boxGeometry args={[0.06, 0.06, 0.32]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#bfbfbf'} />
          </mesh>
          {/* Piernas esqueleto */}
          <mesh position={[-0.08, -0.22, 0]}>
            <boxGeometry args={[0.07, 0.44, 0.07]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#bfbfbf'} />
          </mesh>
          <mesh position={[0.08, -0.22, 0]}>
            <boxGeometry args={[0.07, 0.44, 0.07]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#bfbfbf'} />
          </mesh>
        </group>
      )}

      {/* 6. Arrow Projectile Render Model */}
      {data.type === EntityType.ARROW && (
        <group scale={[0.15, 0.15, 0.15]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 3.5, 4]} />
            <meshStandardMaterial color="#8b5a2b" />
          </mesh>
          {/* Cola de plumas */}
          <mesh position={[0, 0, -1.8]}>
            <boxGeometry args={[0.5, 0.5, 0.8]} />
            <meshStandardMaterial color="#fefefe" />
          </mesh>
          {/* Punta de metal */}
          <mesh position={[0, 0, 1.8]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 0.6, 4]} />
            <meshStandardMaterial color="#555555" />
          </mesh>
        </group>
      )}
    </group>
  );
};

import { TextureCache } from '../textures';

const SHARED_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

const ChunkLayer = React.memo<{ 
  type: BlockType; 
  instances: number[]; 
  onInteraction: (p: THREE.Vector3, n: THREE.Vector3, clientX: number, clientY: number)=>void;
  cx: number;
  cz: number;
  openDoors: Record<string, boolean>;
}>(({ type, instances, onInteraction, cx, cz, openDoors }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  useEffect(() => {
    const dummy = new THREE.Object3D();
    if (meshRef.current) {
      const count = instances.length / 3;
      for (let i = 0; i < count; i++) {
        const x = instances[i * 3];
        const y = instances[i * 3 + 1];
        const z = instances[i * 3 + 2];
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        if (type === BlockType.MUSHROOM_RED || type === BlockType.MUSHROOM_BROWN || type === BlockType.FLOWER_RED || type === BlockType.FLOWER_YELLOW) {
          dummy.position.y -= 0.35;
          dummy.scale.set(0.5, 0.5, 0.5);
        } else if (type === BlockType.TORCH) {
          dummy.position.y -= 0.2;
          dummy.scale.set(0.18, 0.6, 0.18);
        } else if (type === BlockType.BED) {
          dummy.position.y -= 0.175;
          dummy.scale.set(0.9, 0.65, 1.8);
        } else if (type === BlockType.DOOR) {
          const coordKey = `${x},${y},${z}`;
          const isOpen = !!openDoors[coordKey];
          if (isOpen) {
            dummy.position.set(x - 0.42, y + 0.5, z + 0.42);
            dummy.rotation.set(0, Math.PI / 2, 0); 
            dummy.scale.set(0.15, 2.0, 0.95);
          } else {
            dummy.position.set(x, y + 0.5, z);
            dummy.scale.set(0.95, 2.0, 0.15);
          }
        } else {
          dummy.scale.set(1, 1, 1);
        }
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.count = count;
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.computeBoundingSphere();
    }
  }, [instances, type, cx, cz, openDoors]);

  const material = TextureCache.getMaterial(type) || new THREE.MeshLambertMaterial({ color: BLOCK_COLORS[type] || '#ffffff' });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[SHARED_BOX_GEOMETRY, material as THREE.Material, instances.length / 3]}
      frustumCulled={true}
      onPointerDown={(e) => {
        e.stopPropagation();
        const intersect = e.intersections[0];
        if (intersect && intersect.face) {
          onInteraction(intersect.point, intersect.face.normal, e.clientX, e.clientY);
        }
      }}
    />
  );
});

interface ChunkProps {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  onInteraction: (pos: THREE.Vector3, n: THREE.Vector3, clientX: number, clientY: number) => void;
  openDoors: Record<string, boolean>;
}

const Chunk = React.memo<ChunkProps>(({ cx, cz, blocks, onInteraction, openDoors }) => {
  const blockData = useMemo(() => {
    const dataByType = new Map<BlockType, number[]>();
    
    const y_mult = 16;       // CHUNK_SIZE
    const x_mult = 1792;     // CHUNK_SIZE * WORLD_HEIGHT = 16 * 112

    // Helper to check if block is transparent / see-through / flora
    const isTransparent = (b: number) => 
      b === 0 || // AIR
      b === 5 || // LEAVES
      b === 7 || // WATER
      b === 10 || // MUSHROOM_RED
      b === 11 || // MUSHROOM_BROWN
      b === 19 || // FLOWER_RED
      b === 20 || // FLOWER_YELLOW
      b === 21 || // LAVA
      b === 26 || // BED
      b === 27 || // TORCH
      b === 28;  // DOOR

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const xMultOffset = x * x_mult;
      
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wz = cz * CHUNK_SIZE + z;
        const xz_offset = xMultOffset + z;
        
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const idx = xz_offset + (y * y_mult);
          const type = blocks[idx] as BlockType;
          if (type === BlockType.AIR) continue;
          
          let isExposed = false;
          if (x === 0 || x === 15 || y === 0 || y === 111 || z === 0 || z === 15) {
            isExposed = true;
          } else {
            const topType = blocks[idx + 16];
            const bottomType = blocks[idx - 16];
            const westType = blocks[idx + 1792];
            const eastType = blocks[idx - 1792];
            const northType = blocks[idx + 1];
            const southType = blocks[idx - 1];

            if (isTransparent(topType) ||
                isTransparent(bottomType) ||
                isTransparent(westType) ||
                isTransparent(eastType) ||
                isTransparent(northType) ||
                isTransparent(southType)) {
              isExposed = true;
            }
          }

          if (!isExposed) continue;

          // Skip rendering the top half of doors to prevent vertical double-door rendering overlap
          if (type === BlockType.DOOR) {
            if (y > 0) {
              const bBelow = blocks[idx - 16];
              if (bBelow === BlockType.DOOR) {
                continue;
              }
            }
          }

          let arr = dataByType.get(type);
          if (!arr) {
            arr = [];
            dataByType.set(type, arr);
          }
          arr.push(wx, y, wz);
        }
      }
    }
    return dataByType;
  }, [blocks, cx, cz]);

  return (
    <group>
      {Array.from(blockData.entries()).map(([type, instances]) => (
        <ChunkLayer key={type} type={type} instances={instances} onInteraction={onInteraction} cx={cx} cz={cz} openDoors={openDoors} />
      ))}
    </group>
  );
});

const Player: React.FC<{ 
  moveVector: { x: number; y: number }; 
  lookOffsetRef: React.MutableRefObject<{ x: number, y: number }>;
  onUpdatePos: (p: Vector3D) => void;
  isJumping: boolean;
  getCollisionHeight: (x: number, z: number, currentY: number) => number;
  checkSolid: (x: number, y: number, z: number) => boolean;
  perspective: 'first' | 'second' | 'third';
  gameMode?: 'creative' | 'survival' | 'adventure' | 'creativo' | 'supervivencia' | 'aventura';
  worldType?: string;
  chunks: Record<string, Uint8Array>;
  playerPosRef: React.MutableRefObject<Vector3D>;
  playerPos: Vector3D;
}> = ({ moveVector, lookOffsetRef, onUpdatePos, isJumping, getCollisionHeight, checkSolid, perspective, gameMode = 'survival', worldType = 'normal', chunks, playerPosRef, playerPos }) => {
  const { camera } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const playerGroupRef = useRef<THREE.Group>(null);
  const stepTimer = useRef(0);
  const lastStepPlayed = useRef(false);
  const lastStateUpdate = useRef(0);
  const velocityY = useRef(0);
  const initialized = useRef(false);
  const physPos = useRef(new THREE.Vector3(0, 80, 0));

  const isFlying = useRef(false);
  const wasJumping = useRef(false);
  const lastJumpTime = useRef(0);

  const checkSolidRef = useRef(checkSolid);
  checkSolidRef.current = checkSolid;
  const getCollisionHeightRef = useRef(getCollisionHeight);
  getCollisionHeightRef.current = getCollisionHeight;
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const moveVectorRef = useRef(moveVector);
  moveVectorRef.current = moveVector;
  const isJumpingRef = useRef(isJumping);
  isJumpingRef.current = isJumping;
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;
  const perspectiveRef = useRef(perspective);
  perspectiveRef.current = perspective;
  const onUpdatePosRef = useRef(onUpdatePos);
  onUpdatePosRef.current = onUpdatePos;

  // React to external teleport coordinates securely
  useEffect(() => {
    const dx = playerPos.x - physPos.current.x;
    const dy = playerPos.y - physPos.current.y;
    const dz = playerPos.z - physPos.current.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    // Over a small threshold indicates an external teleport rather than standard player step ticks
    if (distSq > 2.25) {
      physPos.current.set(playerPos.x, playerPos.y, playerPos.z);
      initialized.current = false; // Forces chunk reload & spawn-guard safety checks at the destination!
    }
  }, [playerPos.x, playerPos.y, playerPos.z]);

  const lastAmbientUpdate = useRef(0);

  const getBlockTypeAt = useCallback((x: number, y: number, z: number): BlockType => {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const chunkTable = chunksRef.current || chunks;
    const chunk = chunkTable[k];
    if (!chunk) return BlockType.AIR;
    const lx = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = Math.floor(y);
    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (ly * CHUNK_SIZE) + lz;
    return chunk[idx] || BlockType.AIR;
  }, [chunks]);

  useFrame((state, delta) => {
    if (!initialized.current) {
        physPos.current.set(playerPosRef.current.x, playerPosRef.current.y, playerPosRef.current.z);
        const pcx = Math.floor(physPos.current.x / CHUNK_SIZE);
        const pcz = Math.floor(physPos.current.z / CHUNK_SIZE);
        const startKey = `${pcx},${pcz}`;
        if (chunksRef.current && chunksRef.current[startKey]) {
            // Ensure spawn safely above the newly loaded terrain
            const terrainH = getCollisionHeightRef.current(physPos.current.x, physPos.current.z, physPos.current.y);
            physPos.current.y = Math.max(physPos.current.y, terrainH + 2);
            initialized.current = true;
        } else {
            // Stay suspended in place until starting chunk is fully generated
            return;
        }
    }
    const minDelta = Math.min(delta, 0.1);
    const lookSpeed = 0.004;
    
    // Slow down speed dynamically when approaching or entering Far Lands (X/Z boundaries)
    const currentAbsCoordForSpeed = Math.max(Math.abs(physPos.current.x), Math.abs(physPos.current.z));
    let moveSpeed = 6.0;
    if (currentAbsCoordForSpeed >= 1500) {
      moveSpeed = 1.6; // Caminata muy lenta (has llegado al límite)
    } else if (currentAbsCoordForSpeed >= 1400) {
      moveSpeed = 3.2; // Caminata un poco lenta
    }

    yaw.current -= lookOffsetRef.current.x * lookSpeed;
    pitch.current -= lookOffsetRef.current.y * lookSpeed;
    pitch.current = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch.current));

    lookOffsetRef.current.x = 0;
    lookOffsetRef.current.y = 0;

    // Movement directions decoupled from camera rotation to keep joystick working perfectly in all perspectives
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
    forward.normalize();
    right.normalize();

    const direction = new THREE.Vector3()
      .addScaledVector(forward, moveVectorRef.current.y)
      .addScaledVector(right, moveVectorRef.current.x);

    let px = physPos.current.x;
    let py = physPos.current.y;
    let pz = physPos.current.z;

    const r = 0.3; // radio del jugador (grosor)
    const hBottom = 1.5; // pies desde la camara
    const hTop = 0.3; // cabeza desde la camara
    const maxStep = 0.6; // maxima altura de escalon
    const eps = 0.001;

    let dx = 0;
    let dz = 0;

    if (direction.length() > 0) {
      direction.normalize().multiplyScalar(moveSpeed);
      dx = direction.x * minDelta;
      dz = direction.z * minDelta;
      
      stepTimer.current += minDelta * moveSpeed * 2.5;
      const bob = Math.sin(stepTimer.current);
      if (bob < -0.9 && !lastStepPlayed.current && Math.abs(velocityY.current) < 0.1) {
        const footBlock = getBlockTypeAt(px, py - 1.6, pz);
        playStepSound(footBlock, 0.04);
        lastStepPlayed.current = true;
      } else if (bob > 0) {
        lastStepPlayed.current = false;
      }
    }
    
    const isCreative = gameModeRef.current === 'creative' || gameModeRef.current === 'creativo';

    if (isCreative) {
      if (isJumpingRef.current && !wasJumping.current) {
        if (state.clock.elapsedTime - lastJumpTime.current < 0.3) {
          isFlying.current = !isFlying.current;
          if (isFlying.current) {
            velocityY.current = 0;
          }
        }
        lastJumpTime.current = state.clock.elapsedTime;
      }
    } else {
      isFlying.current = false;
    }
    wasJumping.current = isJumpingRef.current;

    let dy = 0;
    if (isFlying.current) {
      if (isJumpingRef.current) {
        velocityY.current = 8.0;
      } else {
        // stay still or sink very slowly
        velocityY.current = 0.0;
        // Check for squat if implemented, else let's just make them sink slightly
        if (pitch.current > 1.2 && direction.length() > 0) {
            // Looking down and walking sinks down
            velocityY.current = -5.0;
        } else if (Math.abs(dx) === 0 && Math.abs(dz) === 0) {
             velocityY.current = -1.0; 
        }
      }
      dy = velocityY.current * minDelta;
    } else {
      velocityY.current -= 25.0 * minDelta;
      dy = velocityY.current * minDelta;
    }

    // AABB Bounds
    let pMinX = px - r; let pMaxX = px + r;
    let pMinY = py - hBottom; let pMaxY = py + hTop;
    let pMinZ = pz - r; let pMaxZ = pz + r;

    // Obtener bloques para colision
    const getBlocks = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => {
        const blks = [];
        const floorMinX = Math.floor(minX - 1); const floorMaxX = Math.floor(maxX + 1);
        const floorMinY = Math.floor(minY - 1); const floorMaxY = Math.floor(maxY + 1);
        const floorMinZ = Math.floor(minZ - 1); const floorMaxZ = Math.floor(maxZ + 1);
        for (let bx = floorMinX; bx <= floorMaxX; bx++) {
            for (let by = floorMinY; by <= floorMaxY; by++) {
                for (let bz = floorMinZ; bz <= floorMaxZ; bz++) {
                    if (checkSolidRef.current(bx, by, bz)) {
                        blks.push({ minX: bx - 0.5, minY: by - 0.5, minZ: bz - 0.5, maxX: bx + 0.5, maxY: by + 0.5, maxZ: bz + 0.5 });
                    }
                }
            }
        }
        return blks;
    };

    const blocks = getBlocks(
        Math.min(pMinX, pMinX + dx), Math.min(pMinY, pMinY + dy), Math.min(pMinZ, pMinZ + dz),
        Math.max(pMaxX, pMaxX + dx), Math.max(pMaxY, pMaxY + dy), Math.max(pMaxZ, pMaxZ + dz)
    );

    let origDx = dx;
    let origDz = dz;
    let origDy = dy;

    // Colision Y
    for (const b of blocks) {
        if (pMaxX > b.minX && pMinX < b.maxX && pMaxZ > b.minZ && pMinZ < b.maxZ) {
            if (dy > 0 && pMaxY <= b.minY + 0.3) dy = Math.min(dy, b.minY - pMaxY - eps);
            else if (dy < 0 && pMinY >= b.maxY - 0.3) dy = Math.max(dy, b.maxY - pMinY + eps);
        }
    }
    pMinY += dy; pMaxY += dy;

    // Colision X
    for (const b of blocks) {
        if (pMaxY > b.minY && pMinY < b.maxY && pMaxZ > b.minZ && pMinZ < b.maxZ) {
            if (dx > 0 && pMaxX <= b.minX + 0.3) dx = Math.min(dx, b.minX - pMaxX - eps);
            else if (dx < 0 && pMinX >= b.maxX - 0.3) dx = Math.max(dx, b.maxX - pMinX + eps);
        }
    }
    pMinX += dx; pMaxX += dx;

    // Colision Z
    for (const b of blocks) {
        if (pMaxY > b.minY && pMinY < b.maxY && pMaxX > b.minX && pMinX < b.maxX) {
            if (dz > 0 && pMaxZ <= b.minZ + 0.3) dz = Math.min(dz, b.minZ - pMaxZ - eps);
            else if (dz < 0 && pMinZ >= b.maxZ - 0.3) dz = Math.max(dz, b.maxZ - pMinZ + eps);
        }
    }
    pMinZ += dz; pMaxZ += dz;

    let isGrounded = false;
    if (dy !== origDy) {
        if (origDy < 0 && dy > origDy) isGrounded = true; // hit floor
        velocityY.current = 0;
    }

    // Comportamiento Stepping (Subir bloques)
    if ((origDx !== dx || origDz !== dz) && isGrounded) {
        let stepY = maxStep;
        let stepDx = origDx;
        let stepDz = origDz;
        let pStepMinX = px - r; let pStepMaxX = px + r;
        let pStepMinY = py - hBottom; let pStepMaxY = py + hTop;
        let pStepMinZ = pz - r; let pStepMaxZ = pz + r;

        // Intentar subir
        for (const b of blocks) {
            if (pStepMaxX > b.minX && pStepMinX < b.maxX && pStepMaxZ > b.minZ && pStepMinZ < b.maxZ) {
                if (stepY > 0 && pStepMaxY <= b.minY + 0.3) stepY = Math.min(stepY, b.minY - pStepMaxY - eps);
            }
        }
        pStepMinY += stepY; pStepMaxY += stepY;

        // Mover en X arriba
        for (const b of blocks) {
            if (pStepMaxY > b.minY && pStepMinY < b.maxY && pStepMaxZ > b.minZ && pStepMinZ < b.maxZ) {
                if (stepDx > 0 && pStepMaxX <= b.minX + 0.3) stepDx = Math.min(stepDx, b.minX - pStepMaxX - eps);
                else if (stepDx < 0 && pStepMinX >= b.maxX - 0.3) stepDx = Math.max(stepDx, b.maxX - pStepMinX + eps);
            }
        }
        pStepMinX += stepDx; pStepMaxX += stepDx;

        // Mover en Z arriba
        for (const b of blocks) {
            if (pStepMaxY > b.minY && pStepMinY < b.maxY && pStepMaxX > b.minX && pStepMinX < b.maxX) {
                if (stepDz > 0 && pStepMaxZ <= b.minZ + 0.3) stepDz = Math.min(stepDz, b.minZ - pStepMaxZ - eps);
                else if (stepDz < 0 && pStepMinZ >= b.maxZ - 0.3) stepDz = Math.max(stepDz, b.maxZ - pStepMinZ + eps);
            }
        }
        pStepMinZ += stepDz; pStepMaxZ += stepDz;

        // Bajar al suelo nuevo
        let stepDownY = -stepY;
        for (const b of blocks) {
            if (pStepMaxX > b.minX && pStepMinX < b.maxX && pStepMaxZ > b.minZ && pStepMinZ < b.maxZ) {
                if (stepDownY < 0 && pStepMinY >= b.maxY - 0.3) stepDownY = Math.max(stepDownY, b.maxY - pStepMinY + eps);
            }
        }
        pStepMinY += stepDownY; pStepMaxY += stepDownY;

        // Si se movio más horizontalmente que antes, lo tomamos
        if (Math.abs(stepDx) + Math.abs(stepDz) > Math.abs(dx) + Math.abs(dz) + eps) {
            dx = stepDx;
            dz = stepDz;
            dy += stepY + stepDownY;
            pMinY = pStepMinY;
            pMaxY = pStepMaxY;
            pMinX = pStepMinX;
            pMaxX = pStepMaxX;
            pMinZ = pStepMinZ;
            pMaxZ = pStepMaxZ;
        }
    }

    px = pMinX + r;
    py = pMinY + hBottom;
    pz = pMinZ + r;

    const isFlat = worldType === 'flat' || worldType === 'plano' || worldType === 'plano_infinito';

    if (isJumpingRef.current && isGrounded && !isFlying.current) {
        velocityY.current = 8.5;
        if (!isCreative) {
            gameState.addExhaustion(0.1);
        }
    }

    // Exhaustion for walking
    if (isGrounded && (dx !== 0 || dz !== 0)) {
        if (!isCreative) {
            const dist = Math.sqrt(dx*dx + dz*dz);
            gameState.addExhaustion(dist * 0.05);
        }
    }

    if (isCreative) {
        if (gameState.health < 20) gameState.setHealth(20);
        if (gameState.food < 20) gameState.setFood(20);
        if (py < 0) {
            // Teleport back safely without dying in creative
            py = (isFlat ? 55 : getWorldHeight(0, 0).h) + 2;
            px = 0;
            pz = 0;
            velocityY.current = 0;
        }
    } else {
        gameState.applyStarvation(minDelta);
        if (py < 0) {
            gameState.setHealth(gameState.health - minDelta * 10);
        }
    }

    if (gameState.health <= 0) {
        px = 0;
        pz = 0;
        py = (isFlat ? 55 : getWorldHeight(0, 0).h) + 2;
        velocityY.current = 0;
        gameState.setHealth(20);
        gameState.setFood(20);
        gameState.exhaustion = 0;
    }

    // Small view bob effect visually attached to camera but doesn't affect physical Y
    physPos.current.set(px, py, pz);

    let visualY = py;
    if (isGrounded && direction.lengthSq() > 0) {
        visualY += Math.sin(stepTimer.current) * 0.04;
    }

    // Camera positioning based on perspective
    const radius = 3.5;
    const lookX = Math.sin(yaw.current) * Math.cos(pitch.current);
    const lookY = Math.sin(pitch.current);
    const lookZ = Math.cos(yaw.current) * Math.cos(pitch.current);

    if (perspectiveRef.current === 'second') {
      // Look from the front (facecam)
      camera.position.set(px + lookX * radius, visualY + 1.2 + lookY * 1.0, pz + lookZ * radius);
      camera.lookAt(px, visualY + 0.5, pz);
    } else if (perspectiveRef.current === 'third') {
      // Look from behind
      camera.position.set(px - lookX * radius, visualY + 1.2 - lookY * 1.0, pz - lookZ * radius);
      camera.lookAt(px, visualY + 0.5, pz);
    } else {
      // First person view
      camera.position.set(px, visualY, pz);
      camera.rotation.set(0, 0, 0, 'YXZ');
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
      camera.rotation.z = 0;
    }

    // Directly keep the player model perfectly snapped and rotated with the tick loop
    if (playerGroupRef.current) {
        playerGroupRef.current.position.set(px, py - 1.5, pz);
        playerGroupRef.current.rotation.set(0, yaw.current, 0);
    }

    const now = performance.now();
    if (now - lastStateUpdate.current > 100) {
        onUpdatePosRef.current({ x: px, y: py, z: pz });
        lastStateUpdate.current = now;
    }

    if (now - lastAmbientUpdate.current > 250) {
        lastAmbientUpdate.current = now;
        try {
          const isUnder = getBlockTypeAt(px, py, pz) === BlockType.WATER || getBlockTypeAt(px, py - 0.2, pz) === BlockType.WATER;
          const isNear = isUnder || 
            getBlockTypeAt(px, py - 1, pz) === BlockType.WATER || 
            getBlockTypeAt(px + 1, py - 1, pz) === BlockType.WATER ||
            getBlockTypeAt(px - 1, py - 1, pz) === BlockType.WATER ||
            getBlockTypeAt(px, py - 1, pz + 1) === BlockType.WATER ||
            getBlockTypeAt(px, py - 1, pz - 1) === BlockType.WATER;

          updateAmbientEnvironment(isUnder, isNear, py);
        } catch (e) {}
    }
  });

  if (perspective === 'first') return null;

  // Render a blocky player model when in second or third person perspective
  return (
    <group ref={playerGroupRef} position={[physPos.current.x, physPos.current.y - 1.5, physPos.current.z]} rotation={[0, yaw.current, 0]}>
      {/* Head */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshBasicMaterial color="#ffdbac" />
      </mesh>
      {/* Hair */}
      <mesh position={[0, 1.45, 0.05]}>
        <boxGeometry args={[0.42, 0.1, 0.42]} />
        <meshBasicMaterial color="#3d2314" />
      </mesh>
      {/* Eyes & Face accents */}
      <mesh position={[0, 1.3, 0.2]}>
        <boxGeometry args={[0.3, 0.08, 0.02]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Torso / Clothes (Teal shirt) */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[0.55, 0.7, 0.25]} />
        <meshBasicMaterial color="#008080" />
      </mesh>
      {/* Left arm */}
      <mesh position={[-0.35, 0.75, 0]}>
        <boxGeometry args={[0.12, 0.65, 0.2]} />
        <meshBasicMaterial color="#008080" />
      </mesh>
      {/* Right arm */}
      <mesh position={[0.35, 0.75, 0]}>
        <boxGeometry args={[0.12, 0.65, 0.2]} />
        <meshBasicMaterial color="#008080" />
      </mesh>
      {/* Left Leg (Blue pants) */}
      <mesh position={[-0.14, 0.2, 0]}>
        <boxGeometry args={[0.18, 0.4, 0.22]} />
        <meshBasicMaterial color="#0000ff" />
      </mesh>
      {/* Right Leg */}
      <mesh position={[0.14, 0.2, 0]}>
        <boxGeometry args={[0.18, 0.4, 0.22]} />
        <meshBasicMaterial color="#0000ff" />
      </mesh>
    </group>
  );
};

interface NightMobSpawnerProps {
  gameTimeRef: React.MutableRefObject<number>;
  entitiesRef: React.MutableRefObject<Record<string, EntityData[]>>;
  setEntities: React.Dispatch<React.SetStateAction<Record<string, EntityData[]>>>;
  playerPosRef: React.MutableRefObject<Vector3D>;
  chunksRef: React.MutableRefObject<Record<string, Uint8Array>>;
}

const NightMobSpawner: React.FC<NightMobSpawnerProps> = ({
  gameTimeRef,
  entitiesRef,
  setEntities,
  playerPosRef,
  chunksRef
}) => {
  const spawnerTimerRef = useRef(0);

  useFrame((state, delta) => {
    if (!playerPosRef.current) return;
    const minDelta = Math.min(delta, 0.1);
    spawnerTimerRef.current += minDelta;
    if (spawnerTimerRef.current > 4.0) {
      spawnerTimerRef.current = 0;
      const sunY = Math.sin(gameTimeRef.current) * 150;
      const isNight = sunY < 0; // properly night
      
      const isCreative = gameState.gameMode === 'creative' || gameState.gameMode === 'creativo';
      if (isNight && !isCreative) {
        const currentEntities = { ...entitiesRef.current };
        let hostileCount = 0;
        Object.values(currentEntities).flat().forEach((e: EntityData) => {
          if (e.type === EntityType.ZOMBIE || e.type === EntityType.SKELETON || e.type === EntityType.CREEPER) {
            hostileCount++;
          }
        });

        if (hostileCount < 5) {
          // Spawn a mob 16 to 28 blocks away from player safely
          const pX = playerPosRef.current.x;
          const pZ = playerPosRef.current.z;
          const angle = Math.random() * Math.PI * 2;
          const dist = 16 + Math.random() * 12;
          const spawnWx = Math.round(pX + Math.cos(angle) * dist);
          const spawnWz = Math.round(pZ + Math.sin(angle) * dist);

          const cx = Math.floor(spawnWx / CHUNK_SIZE);
          const cz = Math.floor(spawnWz / CHUNK_SIZE);
          const chunkKey = `${cx},${cz}`;

          if (chunksRef.current && chunksRef.current[chunkKey]) {
            const h = getWorldHeight(spawnWx, spawnWz).h + 1;
            if (h > 0 && h < WORLD_HEIGHT) {
              const rand = Math.random();
              let mType = EntityType.ZOMBIE;
              if (rand < 0.33) mType = EntityType.CREEPER;
              else if (rand < 0.66) mType = EntityType.SKELETON;

              const newId = `dynamic_hostile_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
              const newMob: EntityData = {
                id: newId,
                type: mType,
                pos: { x: spawnWx, y: h, z: spawnWz },
                rot: Math.random() * Math.PI * 2
              };

              const existingChunkMobs = currentEntities[chunkKey] || [];
              entitiesRef.current[chunkKey] = [...existingChunkMobs, newMob];
              setEntities({ ...entitiesRef.current });
            }
          }
        }
      }
    }
  });

  return null;
};

const VoxelWorld: React.FC<VoxelWorldProps> = ({ 
    currentBlock, playerPos, onBlockChange, moveVector, lookOffsetRef, interactionMode, isJumping,
    perspective = 'first', fov = 65, ultraOptimization = false,
    worldId, initialEdits, onBlockEdit,
    gameMode = 'survival', worldType = 'normal',
    onSelectBlock,
    onOpenCraftingTable,
    survivalInventory
}) => {
  activeWorldId = worldId || 'temp';
  activeWorldType = worldType || 'normal';
  const playerPosRef = useRef(playerPos);
  playerPosRef.current = playerPos;

  const currentBlockRef = useRef(currentBlock);
  currentBlockRef.current = currentBlock;
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;

  const onSelectBlockRef = useRef(onSelectBlock);
  onSelectBlockRef.current = onSelectBlock;

  const onOpenCraftingTableRef = useRef(onOpenCraftingTable);
  onOpenCraftingTableRef.current = onOpenCraftingTable;

  const survivalInventoryRef = useRef(survivalInventory);
  survivalInventoryRef.current = survivalInventory;

  const pendingChunksRef = useRef<string[]>([]);
  const processingQueueRef = useRef<boolean>(false);
  const asyncLoaderTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (asyncLoaderTimerRef.current) {
        clearTimeout(asyncLoaderTimerRef.current);
      }
    };
  }, []);

  const [chunks, setChunks] = useState<Record<string, Uint8Array>>({});
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  const [openDoors, setOpenDoors] = useState<Record<string, boolean>>({});
  const openDoorsRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    openDoorsRef.current = openDoors;
  }, [openDoors]);

  const onBlockEditRef = useRef(onBlockEdit);
  onBlockEditRef.current = onBlockEdit;

  const [entities, setEntities] = useState<Record<string, EntityData[]>>({});
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const lastGenerationCoords = useRef({ x: NaN, z: NaN });

  const editsRef = useRef<Record<string, number>>(initialEdits || {});

  const [inGameMessage, setInGameMessage] = useState<string | null>(null);
  const messageTimeoutRef = useRef<any>(null);

  const triggerInGameMessage = useCallback((msg: string) => {
    setInGameMessage(msg);
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = setTimeout(() => {
      setInGameMessage(null);
    }, 4000);
  }, []);

  const triggerInGameMessageRef = useRef(triggerInGameMessage);
  triggerInGameMessageRef.current = triggerInGameMessage;

  const gameTimeRef = useRef(1); // Start around dawn/morning (1.0 rad)

  useEffect(() => {
    gameState.onTimeSet = (time: 'day' | 'night') => {
      if (time === 'day') {
        gameTimeRef.current = 1.0; // Morning (Math.sin > 0)
        triggerInGameMessage("Tiempo establecido a: DÍA");
      } else {
        gameTimeRef.current = Math.PI + 1.0; // Night (Math.sin < 0)
        triggerInGameMessage("Tiempo establecido a: NOCHE");
      }
    };
    return () => {
      gameState.onTimeSet = null;
    };
  }, [triggerInGameMessage]);

  // --- LIQUID FLOW (WATER & LAVA) SYSTEM ---
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (!active) return;
      if (!playerPosRef.current) return;
      
      const px = Math.round(playerPosRef.current.x);
      const py = Math.round(playerPosRef.current.y);
      const pz = Math.round(playerPosRef.current.z);
      
      const rX = 14;
      const rY = 10;
      const rZ = 14;
      
      const currentChunks = chunksRef.current;
      const mutated: Record<string, Uint8Array> = {};
      const updates: {x: number, y: number, z: number, block: number}[] = [];
      
      const getSimBlock = (wx: number, wy: number, wz: number) => {
        if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.AIR;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const k = `${cx},${cz}`;
        const chunkData = mutated[k] !== undefined ? mutated[k] : currentChunks[k];
        if (!chunkData) return BlockType.AIR;
        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
        return chunkData[idx];
      };

      const getSourceDistance = (sx: number, sy: number, sz: number, liquidType: number) => {
        const maxSearch = liquidType === BlockType.WATER ? 4 : 2;
        const queue: {x: number, z: number, dist: number}[] = [{ x: sx, z: sz, dist: 0 }];
        const visited = new Set<string>();
        visited.add(`${sx},${sz}`);
        
        while (queue.length > 0) {
          const curr = queue.shift()!;
          const above = getSimBlock(curr.x, sy + 1, curr.z);
          
          if (above === liquidType || above === BlockType.AIR) {
            return curr.dist;
          }
          
          if (curr.dist >= maxSearch) continue;
          
          const dirs = [
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 }
          ];
          for (const d of dirs) {
            const nx = curr.x + d.dx;
            const nz = curr.z + d.dz;
            const key = `${nx},${nz}`;
            if (!visited.has(key)) {
              visited.add(key);
              if (getSimBlock(nx, sy, nz) === liquidType) {
                queue.push({ x: nx, z: nz, dist: curr.dist + 1 });
              }
            }
          }
        }
        return 999;
      };
      
      for (let y = Math.max(0, py - rY); y <= Math.min(WORLD_HEIGHT - 1, py + rY); y++) {
        for (let x = px - rX; x <= px + rX; x++) {
          for (let z = pz - rZ; z <= pz + rZ; z++) {
            const b = getSimBlock(x, y, z);
            if (b === BlockType.WATER || b === BlockType.LAVA) {
              const below = getSimBlock(x, y - 1, z);
              if (below === BlockType.AIR || below === BlockType.MUSHROOM_BROWN || below === BlockType.MUSHROOM_RED || below === BlockType.FLOWER_RED || below === BlockType.FLOWER_YELLOW) {
                updates.push({ x, y: y - 1, z, block: b });
              } else if (below === BlockType.WATER && b === BlockType.LAVA) {
                updates.push({ x, y: y - 1, z, block: BlockType.OBSIDIAN });
              } else if (below === BlockType.LAVA && b === BlockType.WATER) {
                updates.push({ x, y: y - 1, z, block: BlockType.OBSIDIAN });
              } else {
                const dist = getSourceDistance(x, y, z, b);
                const maxDist = b === BlockType.WATER ? 4 : 2;
                
                if (dist < maxDist) {
                  const dirs = [
                    { dx: 1, dz: 0 },
                    { dx: -1, dz: 0 },
                    { dx: 0, dz: 1 },
                    { dx: 0, dz: -1 }
                  ];
                  for (const d of dirs) {
                    const nx = x + d.dx;
                    const nz = z + d.dz;
                    const sideBlock = getSimBlock(nx, y, nz);
                    
                    if (sideBlock === BlockType.AIR || sideBlock === BlockType.MUSHROOM_BROWN || sideBlock === BlockType.MUSHROOM_RED || sideBlock === BlockType.FLOWER_RED || sideBlock === BlockType.FLOWER_YELLOW) {
                      updates.push({ x: nx, y, z: nz, block: b });
                    } else if (sideBlock === BlockType.WATER && b === BlockType.LAVA) {
                      updates.push({ x: nx, y, z: nz, block: BlockType.OBSIDIAN });
                    } else if (sideBlock === BlockType.LAVA && b === BlockType.WATER) {
                      updates.push({ x: nx, y, z: nz, block: BlockType.OBSIDIAN });
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      if (updates.length > 0) {
        const limitedUpdates = updates.slice(0, 10);
        for (const up of limitedUpdates) {
          const cx = Math.floor(up.x / CHUNK_SIZE);
          const cz = Math.floor(up.z / CHUNK_SIZE);
          const k = `${cx},${cz}`;
          
          if (!mutated[k]) {
            if (currentChunks[k]) {
              mutated[k] = new Uint8Array(currentChunks[k]);
            } else {
              continue;
            }
          }
          
          const lx = ((up.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const lz = ((up.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (up.y * CHUNK_SIZE) + lz;
          mutated[k][idx] = up.block;
          
          if (editsRef.current) {
            editsRef.current[`${up.x},${up.y},${up.z}`] = up.block;
          }
          if (onBlockEditRef.current) {
            onBlockEditRef.current(up.x, up.y, up.z, up.block);
          }
        }
        
        setChunks(prev => ({ ...prev, ...mutated }));
      }
    }, 550);
    
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [worldId]);

  const isSleepingRef = useRef(false);
  const [isSleeping, setIsSleeping] = useState(false);

  const mobSpawnTimerRef = useRef(0);

  const torchPositions = useMemo(() => {
    const list: { x: number; y: number; z: number }[] = [];
    try {
      for (const key in chunks) {
        const data = chunks[key];
        if (!data) continue;
        const [cx, cz] = key.split(',').map(Number);
        
        const y_mult = 16;
        const x_mult = 1792;
        
        for (let x = 0; x < 16; x++) {
          const wx = cx * CHUNK_SIZE + x;
          const xMultOffset = x * x_mult;
          for (let z = 0; z < 16; z++) {
            const wz = cz * CHUNK_SIZE + z;
            const xz_offset = xMultOffset + z;
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const idx = xz_offset + (y * y_mult);
              if (data[idx] === BlockType.TORCH) {
                list.push({ x: wx, y, z: wz });
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Error scanning torches", e);
    }
    return list;
  }, [chunks]);

  const closestTorches = useMemo(() => {
    if (!playerPos) return [];
    const withDistance = torchPositions.map(pos => {
      const dx = pos.x - playerPos.x;
      const dy = pos.y - playerPos.y;
      const dz = pos.z - playerPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      return { pos, distSq };
    });
    return withDistance
      .filter(item => item.distSq < 24 * 24)
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, 5)
      .map(item => item.pos);
  }, [torchPositions, playerPos.x, playerPos.y, playerPos.z]);

  React.useEffect(() => {
    editsRef.current = initialEdits || {};
  }, [worldId, initialEdits]);

  const isFlatWorld = worldType === 'flat' || worldType === 'plano' || worldType === 'plano_infinito';

  useEffect(() => {
    lastGenerationCoords.current = { x: NaN, z: NaN };
  }, [worldId]);

  const getCollisionHeight = useCallback((posX: number, posZ: number, currentY: number) => {
    const wx = Math.round(posX);
    const wz = Math.round(posZ);
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const chunk = chunksRef.current[k];
    
    // Limit to terrain gen if chunk isn't loaded
    if (!chunk) {
        if (isFlatWorld) {
            return 56; // 55 is grass block height
        }
        return getWorldHeight(wx, wz).h + 1;
    }

    const lx = ((Math.floor(wx) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(wz) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    // Buscamos el bloque más alto debajo de nuestra posición Y
    const startY = Math.min(WORLD_HEIGHT - 1, Math.max(0, Math.ceil(currentY + 1)));

    for (let y = startY; y >= 0; y--) {
        const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + lz;
        if (chunk[idx] !== BlockType.AIR) {
            return y + 1;
        }
    }
    return 0;
  }, [isFlatWorld]);

  const checkSolid = useCallback((wx: number, wy: number, wz: number) => {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const chunk = chunksRef.current[k];
    
    // Limit to terrain gen if chunk isn't loaded
    if (!chunk) {
        if (isFlatWorld) {
            return wy <= 55;
        }
        return wy <= getWorldHeight(wx, wz).h;
    }

    const lx = ((Math.floor(wx) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(wz) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const y = Math.floor(wy);
    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + lz;
    
    const b = chunk[idx];
    const isBaseSolid = b !== BlockType.AIR && b !== BlockType.WATER && 
           b !== BlockType.MUSHROOM_BROWN && b !== BlockType.MUSHROOM_RED &&
           b !== BlockType.FLOWER_RED && b !== BlockType.FLOWER_YELLOW &&
           b !== BlockType.DOOR;

    if (isBaseSolid) return true;

    // Check if the block directly below is a door (incorporating its 2-block height into collisions)
    if (y > 0) {
      const idxBelow = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 1) * CHUNK_SIZE) + lz;
      if (chunk[idxBelow] === BlockType.DOOR) {
        // If the block two blocks below is also a door, 'y-2' is the door base. Otherwise, 'y-1' is the base.
        let doorBaseY = y - 1;
        if (y - 1 > 0) {
          const idxTwoBelow = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 2) * CHUNK_SIZE) + lz;
          if (chunk[idxTwoBelow] === BlockType.DOOR) {
            doorBaseY = y - 2;
          }
        }
        const doorBaseKey = `${Math.round(wx)},${doorBaseY},${Math.round(wz)}`;
        if (openDoorsRef.current[doorBaseKey]) {
          return false;
        }
        return true;
      }
    }

    if (b === BlockType.DOOR) {
      // If the block directly below is also a door, this is the top half of the door and its base is 'y-1'
      let doorBaseY = y;
      if (y > 0) {
        const idxBelow = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 1) * CHUNK_SIZE) + lz;
        if (chunk[idxBelow] === BlockType.DOOR) {
          doorBaseY = y - 1;
        }
      }
      const doorBaseKey = `${Math.round(wx)},${doorBaseY},${Math.round(wz)}`;
      if (openDoorsRef.current[doorBaseKey]) {
        return false;
      }
      return true;
    }

    return false;
  }, [isFlatWorld]);

  const generateChunk = useCallback((cx: number, cz: number) => {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    try {
      if (isFlatWorld) {
      // Highly optimized flat world logic: jagged bedrock, deepslate, minerals, stone, dirt, grass
      const flatHeight = 55;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let y = 0; y <= flatHeight; y++) {
            const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;
            if (y === 0) {
              data[idx] = BlockType.BEDROCK;
            } else if (y <= 2) {
              const rBed = getSeededRandom(999, x + cx * CHUNK_SIZE, z + cz * CHUNK_SIZE, y);
              data[idx] = rBed < (3 - y) * 0.45 ? BlockType.BEDROCK : BlockType.TERRACOTTA_BROWN;
            } else if (y === flatHeight) {
              data[idx] = BlockType.GRASS;
            } else if (y >= flatHeight - 2) {
              data[idx] = BlockType.DIRT;
            } else {
              // Deep layers and minerals in flat world
              const isDeepSlate = y < 20;
              const oreRand = getSeededRandom(1234, x + cx * CHUNK_SIZE, z + cz * CHUNK_SIZE, y * 3.7);
              if (isDeepSlate) {
                if (oreRand < 0.012) data[idx] = BlockType.DIAMOND_ORE;
                else if (oreRand < 0.035) data[idx] = BlockType.REDSTONE_ORE;
                else if (oreRand < 0.065) data[idx] = BlockType.IRON_ORE;
                else data[idx] = BlockType.TERRACOTTA_BROWN; // Deep slate-like block
              } else {
                if (oreRand < 0.015) data[idx] = BlockType.IRON_ORE;
                else if (oreRand < 0.045) data[idx] = BlockType.COAL_ORE;
                else if (oreRand < 0.055) data[idx] = BlockType.SULFUR;
                else if (oreRand < 0.075) data[idx] = BlockType.COPPER_ORE;
                else data[idx] = BlockType.STONE;
              }
            }
          }
        }
      }
    } else {
      // Normal world logic
      const worldConf = getNoiseForWorld(worldId);
      const seed = worldConf.seed;

      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;
          
          const isFar = Math.abs(wx) >= 1500 || Math.abs(wz) >= 1500 || worldType === "edge_farlands";
          if (isFar) {
            const farX = worldType === "edge_farlands" ? wx + 15000 : wx;
            const farZ = worldType === "edge_farlands" ? wz + 15000 : wz;
            const gridDiv = worldType === "edge_farlands" ? 4 : 6;
            
            const hFar = 95 + Math.floor(
              Math.sin(farX * 0.03) * 12 + 
              Math.cos(farZ * 0.03) * 12 +
              (worldType === "edge_farlands" ? Math.sin(farX * 0.15) * 6 + Math.cos(farZ * 0.15) * 6 : 0)
            );
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;
              if (y > hFar) {
                data[idx] = BlockType.AIR;
              } else if (y === 0) {
                data[idx] = BlockType.BEDROCK;
              } else {
                const gridX = Math.floor(farX / gridDiv) % 2 === 0;
                const gridZ = Math.floor(farZ / gridDiv) % 2 === 0;
                const gridY = Math.floor(y / gridDiv) % 2 === 0;
                const isSolidWall = (gridX || gridZ) && !gridY;
                const holeProb = worldType === "edge_farlands" ? 0.28 : 0.18;
                const randomHole = getSeededRandom(seed + 888, farX, farZ, y) < holeProb;
                
                if (isSolidWall && !randomHole) {
                  if (y === hFar || (y < hFar && Math.floor(y / 12) % 3 === 2 && getSeededRandom(seed + 99, farX, farZ, y) < 0.3)) {
                    if (worldType === "edge_farlands" && getSeededRandom(seed + 123, farX, farZ, y) < 0.12) {
                      data[idx] = BlockType.OBSIDIAN;
                    } else {
                      data[idx] = BlockType.GRASS;
                    }
                  } else if (y > hFar - 4) {
                    data[idx] = BlockType.DIRT;
                  } else {
                    const rOre = getSeededRandom(seed + 15, farX, farZ, y);
                    if (rOre < 0.04) {
                      data[idx] = BlockType.DIAMOND_ORE;
                    } else if (rOre < 0.08) {
                      data[idx] = BlockType.GOLD_ORE;
                    } else if (rOre < 0.18) {
                      data[idx] = BlockType.IRON_ORE;
                    } else if (rOre < 0.3) {
                      data[idx] = BlockType.COAL_ORE;
                    } else {
                      data[idx] = BlockType.STONE;
                    }
                  }
                } else {
                  if (y <= 56) {
                    if (worldType === "edge_farlands" && getSeededRandom(seed + 456, farX, farZ, y) < 0.06) {
                      data[idx] = BlockType.LAVA;
                    } else {
                      data[idx] = BlockType.WATER;
                    }
                  } else {
                    data[idx] = BlockType.AIR;
                  }
                }
              }
            }
            continue;
          }
          
          const { h, biome } = getWorldHeight(wx, wz);
          
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;
            if (y === 0) { 
              data[idx] = BlockType.BEDROCK; 
              continue; 
            } else if (y <= 2) {
              const rBed = getSeededRandom(seed, wx, wz, y * 3.1);
              if (rBed < (3 - y) * 0.5) {
                data[idx] = BlockType.BEDROCK;
                continue;
              }
            }
            
            if (y <= h) {
              if (y === h) {
                 if (biome === 'desert') data[idx] = BlockType.SAND;
                 else if (biome === 'mesa') {
                     const layer = Math.floor(y / 2) % 6;
                     const colors = [BlockType.TERRACOTTA_BROWN, BlockType.TERRACOTTA_ORANGE, BlockType.TERRACOTTA_RED, BlockType.TERRACOTTA_YELLOW, BlockType.TERRACOTTA_WHITE, BlockType.TERRACOTTA_LIGHT_GRAY];
                     data[idx] = colors[layer];
                 }
                 else if (biome === 'mountains') {
                     if (h >= 75) {
                         data[idx] = BlockType.TERRACOTTA_WHITE; // Snow cap
                     } else if (h >= 68) {
                         data[idx] = BlockType.STONE; // Bare rock peaks
                     } else {
                         data[idx] = BlockType.GRASS; // Valleys
                     }
                 }
                 else {
                     if (h < 57) {
                         data[idx] = BlockType.SAND;
                     } else {
                         data[idx] = BlockType.GRASS;
                     }
                 }
              }
              else if (y < h && y > h - 3) {
                 if (biome === 'desert' || h < 57) data[idx] = BlockType.SAND;
                 else if (biome === 'mesa') data[idx] = BlockType.TERRACOTTA_ORANGE;
                 else if (biome === 'mountains') {
                     data[idx] = BlockType.STONE;
                 }
                 else data[idx] = BlockType.DIRT;
              }
              else { // y <= h - 3
                 if (caveNoise(wx, y, wz) > 0.5) {
                     if (y < 12) {
                         data[idx] = BlockType.LAVA;
                     } else {
                         data[idx] = BlockType.AIR;
                     }
                 }
                  else {
                      // Generate Deep Layers and dynamic mineral veins!
                      const isDeepSlate = y < 22;
                      const oreRand = getSeededRandom(seed, wx, wz, y * 4.3);
                      
                      if (isDeepSlate) {
                          // Deep Slate block + deep layer minerals (Diamond, Redstone, Iron, Gold, Coal)
                          if (oreRand < 0.012) {
                              data[idx] = BlockType.DIAMOND_ORE;
                          } else if (oreRand < 0.035) {
                              data[idx] = BlockType.REDSTONE_ORE;
                          } else if (oreRand < 0.06) {
                              data[idx] = BlockType.IRON_ORE;
                          } else if (oreRand < 0.08) {
                              data[idx] = BlockType.GOLD_ORE;
                          } else if (oreRand < 0.12) {
                              data[idx] = BlockType.COAL_ORE;
                          } else {
                              data[idx] = BlockType.TERRACOTTA_BROWN; // Slate Stone (dark slate color, nice texture)
                          }
                      } else {
                          // Regular stone layer ores (Coal, Iron, Gold, Sulfur, Copper)
                          if (oreRand < 0.015) {
                              data[idx] = BlockType.IRON_ORE;
                          } else if (oreRand < 0.038) {
                              data[idx] = BlockType.COAL_ORE;
                          } else if (oreRand < 0.046) {
                              data[idx] = BlockType.GOLD_ORE;
                          } else if (oreRand < 0.052) {
                              data[idx] = BlockType.SULFUR;
                          } else if (oreRand < 0.075) {
                              data[idx] = BlockType.COPPER_ORE;
                          } else {
                              data[idx] = BlockType.STONE;
                          }
                      }
                  }
              }
            } else {
              if (y <= 56) {
                 data[idx] = BlockType.WATER;
              }
            }
          }
          
          const r1 = getSeededRandom(seed, wx, wz, 10);
          const r2 = getSeededRandom(seed, wx, wz, 20);

           const isMushroom = r1 < 0.01;
          const isFlower = !isMushroom && r1 >= 0.01 && r1 < 0.055;
          const isVegBiome = biome === 'plains' || (biome === 'mountains' && h < 68);

          if (isVegBiome && h >= 57 && isMushroom && h + 1 < WORLD_HEIGHT) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + 1) * CHUNK_SIZE) + z;
              data[idx] = r2 > 0.5 ? BlockType.MUSHROOM_RED : BlockType.MUSHROOM_BROWN;
          } else if (isVegBiome && h >= 57 && isFlower && h + 1 < WORLD_HEIGHT) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + 1) * CHUNK_SIZE) + z;
              data[idx] = r2 > 0.5 ? BlockType.FLOWER_RED : BlockType.FLOWER_YELLOW;
          } else if (biome === 'desert' && h >= 57 && r1 < 0.005) {
              const th = 2 + Math.floor(r2 * 2);
              for (let ty = 1; ty <= th; ty++) {
                  if (h + ty >= WORLD_HEIGHT) break;
                  const lIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + ty) * CHUNK_SIZE) + z;
                  data[lIdx] = BlockType.CACTUS;
              }
          } else if (isVegBiome && h >= 57 && r1 >= 0.055 && r1 < 0.07 && !isMushroom && !isFlower) {
            const th = 4 + Math.floor(r2 * 2);
            for (let ty = 1; ty <= th; ty++) {
              if (h + ty >= WORLD_HEIGHT) break;
              const lIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + ty) * CHUNK_SIZE) + z;
              data[lIdx] = BlockType.LOG;
            }
            
            const leafStart = h + th - 2;
            const leafEnd = h + th + 1;
            for (let ly = leafStart; ly <= leafEnd; ly++) {
              if (ly >= WORLD_HEIGHT) continue;
              const radius = ly === leafEnd ? 1 : 2;
              for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                  if (lx === 0 && lz === 0 && ly <= h + th) continue;
                  
                  const rLeaf = getSeededRandom(seed, wx + lx, wz + lz, 30 + ly);
                  if (Math.abs(lx) === radius && Math.abs(lz) === radius && (rLeaf < 0.5 || ly === leafEnd)) continue;
                  
                  const wlx = x + lx;
                  const wlz = z + lz;
                  if (wlx >= 0 && wlx < CHUNK_SIZE && wlz >= 0 && wlz < CHUNK_SIZE) {
                    const leafIdx = (wlx * CHUNK_SIZE * WORLD_HEIGHT) + (ly * CHUNK_SIZE) + wlz;
                    if (data[leafIdx] === BlockType.AIR) {
                      data[leafIdx] = BlockType.LEAVES;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 1. Is this a Village Chunk?
      const rHutCheck = getSeededRandom(seed, cx, cz, 150);
      const isVillageChunk = !isFlatWorld && rHutCheck < 0.05;

      if (isVillageChunk) {
        const h1 = getWorldHeight(cx * CHUNK_SIZE + 3, cz * CHUNK_SIZE + 3).h;
        const h2 = getWorldHeight(cx * CHUNK_SIZE + 12, cz * CHUNK_SIZE + 12).h;
        
        if (h1 >= 57 && h2 >= 57) {
          const w1 = cx * CHUNK_SIZE + 3;
          const wz1 = cz * CHUNK_SIZE + 3;
          const biomeInfo = getWorldHeight(w1, wz1);
          const blockMaterial = biomeInfo.biome === 'desert' ? BlockType.SAND : BlockType.WOOD;
          const pathMaterial = biomeInfo.biome === 'desert' ? BlockType.STONE : BlockType.DIRT;

          // A. Draw village trails/paths running through the chunk
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 7; x <= 8; x++) {
              const wx = cx * CHUNK_SIZE + x;
              const wz = cz * CHUNK_SIZE + z;
              const ph = getWorldHeight(wx, wz).h;
              if (ph >= 57) {
                const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (ph * CHUNK_SIZE) + z;
                data[idx] = pathMaterial;
                for (let ay = 1; ay <= 6; ay++) {
                  if (ph + ay < WORLD_HEIGHT) {
                    const aboveIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((ph + ay) * CHUNK_SIZE) + z;
                    data[aboveIdx] = BlockType.AIR;
                  }
                }
              }
            }
          }

          // B. Add cozy paths connecting House 1 door and House 2 door to main trail
          for (let x = 3; x <= 6; x++) {
            const wx = cx * CHUNK_SIZE + x;
            const wz = cz * CHUNK_SIZE + 5;
            const ph = getWorldHeight(wx, wz).h;
            if (ph >= 57) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (ph * CHUNK_SIZE) + 5;
              data[idx] = pathMaterial;
              for (let ay = 1; ay <= 5; ay++) {
                if (ph + ay < WORLD_HEIGHT) {
                  data[(x * CHUNK_SIZE * WORLD_HEIGHT) + ((ph + ay) * CHUNK_SIZE) + 5] = BlockType.AIR;
                }
              }
            }
          }

          for (let x = 9; x <= 12; x++) {
            const wx = cx * CHUNK_SIZE + x;
            const wz = cz * CHUNK_SIZE + 9;
            const ph = getWorldHeight(wx, wz).h;
            if (ph >= 57) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (ph * CHUNK_SIZE) + 9;
              data[idx] = pathMaterial;
              for (let ay = 1; ay <= 5; ay++) {
                if (ph + ay < WORLD_HEIGHT) {
                  data[(x * CHUNK_SIZE * WORLD_HEIGHT) + ((ph + ay) * CHUNK_SIZE) + 9] = BlockType.AIR;
                }
              }
            }
          }

          // C. Multi-block House Construction
          const buildHouse = (sx: number, sz: number, floorY: number, size: number) => {
            for (let hx = 0; hx <= size; hx++) {
              for (let hz = 0; hz <= size; hz++) {
                const lx = sx + hx;
                const lz = sz + hz;
                if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                  for (let dy = 1; dy <= 5; dy++) {
                    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((floorY + dy) * CHUNK_SIZE) + lz;
                    data[idx] = BlockType.AIR;
                  }
                  for (let dy = 0; dy >= -5; dy--) {
                    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((floorY + dy) * CHUNK_SIZE) + lz;
                    if (data[idx] === BlockType.AIR || data[idx] === BlockType.WATER || data[idx] === BlockType.GRASS || data[idx] === BlockType.DIRT || data[idx] === BlockType.LEAVES) {
                      data[idx] = BlockType.STONE;
                    } else {
                      break;
                    }
                  }
                }
              }
            }

            // Floor base is Cobblestone
            for (let hx = 0; hx <= size; hx++) {
              for (let hz = 0; hz <= size; hz++) {
                const lx = sx + hx;
                const lz = sz + hz;
                if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                  const floorIdx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (floorY * CHUNK_SIZE) + lz;
                  data[floorIdx] = BlockType.STONE;
                }
              }
            }

            // Build Walls (Heights 1 to 4)
            for (let hx = 0; hx <= size; hx++) {
              for (let hz = 0; hz <= size; hz++) {
                const lx = sx + hx;
                const lz = sz + hz;
                if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                  for (let hy = 1; hy <= 4; hy++) {
                    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((floorY + hy) * CHUNK_SIZE) + lz;
                    
                    if (hx === 0 || hx === size || hz === 0 || hz === size) {
                      const isCorner = (hx === 0 || hx === size) && (hz === 0 || hz === size);
                      const isDoor = hx === Math.floor(size/2) && hz === size;
                      const isWindow = (hy === 2) && (
                        (hx === 0 && hz === Math.floor(size/2)) || 
                        (hx === size && hz === Math.floor(size/2)) || 
                        (hz === 0 && hx === Math.floor(size/2))
                      );
                      
                      if (isDoor) {
                        data[idx] = BlockType.AIR;
                        if (hy === 1 || hy === 2) {
                          data[idx] = BlockType.DOOR;
                        }
                      } else if (isWindow) {
                        data[idx] = BlockType.AIR; // Window opening
                      } else {
                        // Foundation or main layer
                        if (hy === 1) {
                          data[idx] = isCorner ? BlockType.LOG : BlockType.STONE;
                        } else {
                          data[idx] = isCorner ? BlockType.LOG : BlockType.WOOD;
                        }
                      }
                    } else {
                      data[idx] = BlockType.AIR;
                      // Place furniture inside the cozy house
                      if (hy === 1) {
                        if (hx === 1 && hz === 1) {
                          data[idx] = BlockType.BED;
                        } else if (hx === size - 1 && hz === 1) {
                          data[idx] = BlockType.CRAFTING_TABLE;
                        }
                      } else if (hy === 2) {
                        if (hx === 1 && hz === size - 1) {
                          data[idx] = BlockType.TORCH;
                        }
                      }
                    }
                  }

                  // Pitched Cozy Roof (Heights 5 and 6)
                  const pPeak = Math.floor(size / 2);
                  const idxRoof5 = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((floorY + 5) * CHUNK_SIZE) + lz;
                  const idxRoof6 = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((floorY + 6) * CHUNK_SIZE) + lz;
                  
                  // Roof Row 5: slope side layers
                  if (hx >= 0 && hx <= size && hz >= 0 && hz <= size) {
                    if (hx === pPeak) {
                      data[idxRoof5] = BlockType.WOOD;
                      data[idxRoof6] = BlockType.LOG; // Ridge center bar
                    } else if (hx === 0 || hx === size) {
                      data[idxRoof5] = BlockType.STONE; // Cobblestone border
                    } else {
                      data[idxRoof5] = BlockType.WOOD; // Planks slope
                    }
                  }
                }
              }
            }
          };

          buildHouse(1, 1, h1, 4);
          buildHouse(10, 10, h2, 4);

          // D. Lamppost Setup
          const wellH = getWorldHeight(cx * CHUNK_SIZE + 7, cz * CHUNK_SIZE + 7).h;
          if (wellH >= 57) {
            for (let dy = 1; dy <= 3; dy++) {
              if (wellH + dy < WORLD_HEIGHT) {
                data[(7 * CHUNK_SIZE * WORLD_HEIGHT) + ((wellH + dy) * CHUNK_SIZE) + 7] = BlockType.LOG;
              }
            }
            if (wellH + 4 < WORLD_HEIGHT) {
              data[(7 * CHUNK_SIZE * WORLD_HEIGHT) + ((wellH + 4) * CHUNK_SIZE) + 7] = BlockType.TORCH;
            }
          }
        }
      }
    }

    // Overlay all client edits for this specific chunk (highly optimized)
    if (editsRef.current) {
      const minWx = cx * CHUNK_SIZE;
      const maxWx = minWx + CHUNK_SIZE;
      const minWz = cz * CHUNK_SIZE;
      const maxWz = minWz + CHUNK_SIZE;
      
      for (const editKey in editsRef.current) {
        if (!Object.prototype.hasOwnProperty.call(editsRef.current, editKey)) continue;
        const parts = editKey.split(',');
        if (parts.length !== 3) continue;
        const wx = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        const wz = parseInt(parts[2], 10);
        
        if (wx >= minWx && wx < maxWx && wz >= minWz && wz < maxWz && y >= 0 && y < WORLD_HEIGHT) {
          const lx = wx - minWx;
          const lz = wz - minWz;
          const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + lz;
          data[idx] = editsRef.current[editKey];
        }
      }
    }
    } catch(e) { console.error("Chunk Error", e); }

    return data;
  }, [isFlatWorld, worldId]);

  const generateEntities = useCallback((cx: number, cz: number) => {
    const chunkEntities: EntityData[] = [];
    if (isFlatWorld) return chunkEntities; // No wild animals/mobs in flat worlds

    const worldConf = getNoiseForWorld(worldId);
    const chunkSeed = worldConf.seed;

    // 1. Passive Animals Spawning (30% probability, plus rare villagers)
    const r1 = getSeededRandom(chunkSeed, cx, cz, 100);
    const rHutCheck = getSeededRandom(chunkSeed, cx, cz, 150); // Same check roughly to see if there's a village
    
    if (r1 < 0.30 || rHutCheck < 0.05) { // higher chance of some entity if there are villagers
        const r2 = getSeededRandom(chunkSeed, cx, cz, 200);
        const isVillageChunk = rHutCheck < 0.05;
        const count = isVillageChunk ? 2 + Math.floor(r2 * 3) : 1 + Math.floor(r2 * 2);
        
        for (let i = 0; i < count; i++) {
            const rx = getSeededRandom(chunkSeed, cx, cz, 300 + i * 10);
            const rz = getSeededRandom(chunkSeed, cx, cz, 400 + i * 10);
            const rType = getSeededRandom(chunkSeed, cx, cz, 500 + i * 10);
            const rRot = getSeededRandom(chunkSeed, cx, cz, 600 + i * 10);

            let lx = rx * CHUNK_SIZE;
            let lz = rz * CHUNK_SIZE;
            let wx = cx * CHUNK_SIZE + lx;
            let wz = cz * CHUNK_SIZE + lz;
            let h = getWorldHeight(wx, wz).h + 1;
            
            let eType = rType > 0.5 ? EntityType.PIG : EntityType.SHEEP;
            if (isVillageChunk && rType < 0.8) {
              eType = EntityType.VILLAGER;
              // Spawn exactly inside/next to House 1 or House 2!
              if (i === 0) {
                wx = cx * CHUNK_SIZE + 3;
                wz = cz * CHUNK_SIZE + 2;
                h = getWorldHeight(wx, wz).h + 1.5;
              } else if (i === 1) {
                wx = cx * CHUNK_SIZE + 12;
                wz = cz * CHUNK_SIZE + 11;
                h = getWorldHeight(wx, wz).h + 1.5;
              } else {
                wx = cx * CHUNK_SIZE + 7;
                wz = cz * CHUNK_SIZE + 7;
                h = getWorldHeight(wx, wz).h + 1.5;
              }
            }
            
            chunkEntities.push({
                id: `passive_${cx},${cz},${i}`,
                type: eType,
                pos: { x: wx, y: h, z: wz },
                rot: rRot * Math.PI * 2
            });
        }
    }

    // 2. Hostile Monsters Spawning (25% probability)
    const rHostile = getSeededRandom(chunkSeed, cx, cz, 700);
    if (rHostile < 0.25) {
        const rCount = getSeededRandom(chunkSeed, cx, cz, 850);
        const count = 1 + Math.floor(rCount * 2); // 1 to 2 hostiles
        for (let i = 0; i < count; i++) {
            const rx = getSeededRandom(chunkSeed, cx, cz, 900 + i * 27);
            const rz = getSeededRandom(chunkSeed, cx, cz, 1000 + i * 27);
            const rType = getSeededRandom(chunkSeed, cx, cz, 1100 + i * 27);
            const rRot = getSeededRandom(chunkSeed, cx, cz, 1200 + i * 27);

            const lx = rx * CHUNK_SIZE;
            const lz = rz * CHUNK_SIZE;
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            const h = getWorldHeight(wx, wz).h + 1;

            let mType = EntityType.ZOMBIE;
            if (rType < 0.35) mType = EntityType.CREEPER;
            else if (rType < 0.70) mType = EntityType.SKELETON;

            chunkEntities.push({
                id: `hostile_${cx},${cz},${i}`,
                type: mType,
                pos: { x: wx, y: h, z: wz },
                rot: rRot * Math.PI * 2
            });
        }
    }

    return chunkEntities;
  }, [isFlatWorld, worldId]);

  useEffect(() => {
    const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
    const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
    
    // Check if we are still in same chunk
    if (pcx === lastGenerationCoords.current.x && pcz === lastGenerationCoords.current.z) return;
    lastGenerationCoords.current = { x: pcx, z: pcz };

    const neededKeys = new Set<string>();
    const toEnqueue: { k: string; cx: number; cz: number; dist: number }[] = [];
    const SYNC_RADIUS = 1; // Load immediate 3x3 chunks synchronously so player doesn't fall through
    const hasLoadedAny = Object.keys(chunksRef.current).length > 0;

    const viewDist = ultraOptimization ? 1 : VIEW_DISTANCE;

    for (let x = -viewDist; x <= viewDist; x++) {
      for (let z = -viewDist; z <= viewDist; z++) {
        const cx = pcx + x;
        const cz = pcz + z;
        const k = `${cx},${cz}`;
        neededKeys.add(k);

        const dist = Math.abs(x) + Math.abs(z);

        if (chunksRef.current[k]) {
          // Keep existing chunk
        } else {
          // If in immediate 3x3 radius, or if the world has no chunks generated yet, generate synchronously
          if (dist <= SYNC_RADIUS || !hasLoadedAny) {
            const rawC = generateChunk(cx, cz);
            const rawE = generateEntities(cx, cz);
            chunksRef.current[k] = rawC;
            entitiesRef.current[k] = rawE;
          } else {
            toEnqueue.push({ k, cx, cz, dist });
          }
        }
      }
    }

    // Prune far-away chunks to free up GPU and system memory and avoid rendering stutter
    const PRUNE_DISTANCE = viewDist + 1;
    for (const key in chunksRef.current) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > PRUNE_DISTANCE || Math.abs(cz - pcz) > PRUNE_DISTANCE) {
        delete chunksRef.current[key];
        delete entitiesRef.current[key];
      }
    }

    // Keep only currently needed/alive chunks in active state
    const nextChunks: Record<string, Uint8Array> = {};
    const nextEntities: Record<string, EntityData[]> = {};
    for (const key in chunksRef.current) {
      if (neededKeys.has(key)) {
        nextChunks[key] = chunksRef.current[key];
        nextEntities[key] = entitiesRef.current[key] || [];
      }
    }

    setChunks(nextChunks);
    setEntities(nextEntities);

    // Sort the missing chunks by proximity (Manhattan distance) to load nearest first
    toEnqueue.sort((a, b) => a.dist - b.dist);
    pendingChunksRef.current = toEnqueue.map(item => item.k);

    // Cancel any ongoing async chunk loader scheduled
    if (asyncLoaderTimerRef.current) {
      clearTimeout(asyncLoaderTimerRef.current);
      asyncLoaderTimerRef.current = null;
    }

    // Run active queue processor
    if (pendingChunksRef.current.length > 0) {
      processingQueueRef.current = true;

      const processNextChunk = () => {
        if (pendingChunksRef.current.length === 0) {
          processingQueueRef.current = false;
          return;
        }

        const nextKey = pendingChunksRef.current.shift();
        if (!nextKey) {
          processingQueueRef.current = false;
          return;
        }

        const [cx, cz] = nextKey.split(',').map(Number);
        const currPcx = Math.floor(playerPosRef.current.x / CHUNK_SIZE);
        const currPcz = Math.floor(playerPosRef.current.z / CHUNK_SIZE);

        // Double check if chunk is still in active player's View Distance boundary
        if (Math.abs(cx - currPcx) <= viewDist && Math.abs(cz - currPcz) <= viewDist) {
          const newC = generateChunk(cx, cz);
          const newE = generateEntities(cx, cz);

          chunksRef.current[nextKey] = newC;
          entitiesRef.current[nextKey] = newE;

          setChunks(prev => {
            const freshPcx = Math.floor(playerPosRef.current.x / CHUNK_SIZE);
            const freshPcz = Math.floor(playerPosRef.current.z / CHUNK_SIZE);
            if (Math.abs(cx - freshPcx) > viewDist || Math.abs(cz - freshPcz) > viewDist) {
              return prev;
            }
            return { ...prev, [nextKey]: newC };
          });

          setEntities(prev => {
            const freshPcx = Math.floor(playerPosRef.current.x / CHUNK_SIZE);
            const freshPcz = Math.floor(playerPosRef.current.z / CHUNK_SIZE);
            if (Math.abs(cx - freshPcx) > viewDist || Math.abs(cz - freshPcz) > viewDist) {
              return prev;
            }
            return { ...prev, [nextKey]: newE };
          });
        }

        // Stagger next generation nicely (e.g. 10ms for ultra smoothness)
        const delay = ultraOptimization ? 24 : 10;
        asyncLoaderTimerRef.current = setTimeout(processNextChunk, delay);
      };

      asyncLoaderTimerRef.current = setTimeout(processNextChunk, 16);
    } else {
      processingQueueRef.current = false;
    }
  }, [Math.floor(playerPos.x / CHUNK_SIZE), Math.floor(playerPos.z / CHUNK_SIZE), generateChunk, generateEntities, ultraOptimization]);

  const particlesRef = useRef<any[]>([]);
  const pointerGestureRef = useRef<{
    startX: number;
    startY: number;
    point: THREE.Vector3;
    normal: THREE.Vector3;
    resolved: boolean;
    timeoutId: any;
  } | null>(null);

  const lastTapRef = useRef<{ time: number; pos: THREE.Vector3 } | null>(null);

  const executePick = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    // Shift target inwards to hit the actual block being intersected
    const target = point.clone().sub(normal.clone().multiplyScalar(0.1));
    const wx = Math.round(target.x);
    const wy = Math.round(target.y);
    const wz = Math.round(target.z);

    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const currentChunks = chunksRef.current;
    if (!currentChunks[k]) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = wy;
    if (ly < 0 || ly >= WORLD_HEIGHT) return;

    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (ly * CHUNK_SIZE) + lz;
    const block = currentChunks[k][idx];
    if (block !== BlockType.AIR && block !== BlockType.BEDROCK) {
      if (onSelectBlockRef.current) {
        onSelectBlockRef.current(block);
        triggerInGameMessageRef.current(`Bloque agarrado: ${BLOCK_NAMES[block]}`);
      }
    }
  }, []);

  const executeBreak = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    if (gameModeRef.current === 'adventure' || gameModeRef.current === 'aventura') {
      return;
    }

    // Limit reach distance using stable playerPosRef
    const currPos = playerPosRef.current;
    const playerVec = new THREE.Vector3(currPos.x, currPos.y, currPos.z);
    if (playerVec.distanceTo(point) > 6) return;

    // Shift target inwards to hit the actual block being intersected
    const target = point.clone().sub(normal.clone().multiplyScalar(0.1));
    const wx = Math.round(target.x);
    const wy = Math.round(target.y);
    const wz = Math.round(target.z);

    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const currentChunks = chunksRef.current;
    if (!currentChunks[k]) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = wy;
    if (ly < 0 || ly >= WORLD_HEIGHT) return;

    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (ly * CHUNK_SIZE) + lz;
    const brokenBlock = currentChunks[k][idx];
    if (brokenBlock === BlockType.AIR || brokenBlock === BlockType.BEDROCK) return;

    // Break block
    const newData = new Uint8Array(currentChunks[k]);
    newData[idx] = BlockType.AIR;

    if (brokenBlock === BlockType.DOOR) {
      if (ly > 0) {
        const idxBelow = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((ly - 1) * CHUNK_SIZE) + lz;
        if (newData[idxBelow] === BlockType.DOOR) {
          newData[idxBelow] = BlockType.AIR;
          if (editsRef.current) editsRef.current[`${wx},${wy - 1},${wz}`] = BlockType.AIR;
          if (onBlockEditRef.current) (onBlockEditRef.current as any)(wx, wy - 1, wz, BlockType.AIR, BlockType.DOOR);
        }
      }
      if (ly < WORLD_HEIGHT - 1) {
        const idxAbove = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((ly + 1) * CHUNK_SIZE) + lz;
        if (newData[idxAbove] === BlockType.DOOR) {
          newData[idxAbove] = BlockType.AIR;
          if (editsRef.current) editsRef.current[`${wx},${wy + 1},${wz}`] = BlockType.AIR;
          if (onBlockEditRef.current) (onBlockEditRef.current as any)(wx, wy + 1, wz, BlockType.AIR, BlockType.DOOR);
        }
      }
    }

    setChunks(prev => ({ ...prev, [k]: newData }));

    if (editsRef.current) {
      editsRef.current[`${wx},${wy},${wz}`] = BlockType.AIR;
    }
    if (onBlockEditRef.current) {
      (onBlockEditRef.current as any)(wx, wy, wz, BlockType.AIR, brokenBlock);
    }
    
    playBreakSound(brokenBlock);

    // Spawn block breaking particles (with simple optimization)
    const color = BLOCK_COLORS[brokenBlock as BlockType] || '#888888';
    const newParticles = [];
    const baseId = Date.now() + Math.random();
    for (let i = 0; i < 8; i++) {
      newParticles.push({
        id: baseId + i,
        x: wx + (Math.random() - 0.5) * 0.4,
        y: wy + (Math.random() - 0.5) * 0.4,
        z: wz + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 2.5,
        vy: Math.random() * 2 + 1.5,
        vz: (Math.random() - 0.5) * 2.5,
        color,
        size: 0.12 + Math.random() * 0.12,
        life: 1.0
      });
    }
    particlesRef.current.push(...newParticles);
  }, []);

  const executePlace = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    if (gameModeRef.current === 'adventure' || gameModeRef.current === 'aventura') {
      return;
    }

    // Limit reach distance using stable playerPosRef
    const currPos = playerPosRef.current;
    const playerVec = new THREE.Vector3(currPos.x, currPos.y, currPos.z);
    if (playerVec.distanceTo(point) > 6) return;

    const blockToPlace = currentBlockRef.current;
    const currentChunks = chunksRef.current;

    // Survival inventory check
    if (gameModeRef.current === 'survival' || gameModeRef.current === 'supervivencia') {
      const currentInv = survivalInventoryRef.current || {};
      const count = currentInv[blockToPlace] || 0;
      if (count <= 0) {
        triggerInGameMessageRef.current("¡No tienes este bloque en tu inventario! Consíguelo o fabrícalo.");
        return;
      }
    }

    // --- BED & CRAFTING TABLE INTERACTION ---
    const clickTarget = point.clone().sub(normal.clone().multiplyScalar(0.1));
    const clickWx = Math.round(clickTarget.x);
    const clickWy = Math.round(clickTarget.y);
    const clickWz = Math.round(clickTarget.z);

    const clickCx = Math.floor(clickWx / CHUNK_SIZE);
    const clickCz = Math.floor(clickWz / CHUNK_SIZE);
    const clickK = `${clickCx},${clickCz}`;

    if (currentChunks[clickK]) {
      const clickLx = ((clickWx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const clickLz = ((clickWz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const clickidx = (clickLx * CHUNK_SIZE * WORLD_HEIGHT) + (clickWy * CHUNK_SIZE) + clickLz;
      const clickedBlock = currentChunks[clickK][clickidx];

      // --- WOODEN DOOR TOGGLING ---
      let doorBaseY = -1;
      if (clickedBlock === BlockType.DOOR) {
        if (clickWy > 0) {
          const idxBelow = (clickLx * CHUNK_SIZE * WORLD_HEIGHT) + ((clickWy - 1) * CHUNK_SIZE) + clickLz;
          if (currentChunks[clickK][idxBelow] === BlockType.DOOR) {
            doorBaseY = clickWy - 1;
          } else {
            doorBaseY = clickWy;
          }
        } else {
          doorBaseY = clickWy;
        }
      } else if (clickWy > 0) {
        const idxBelow = (clickLx * CHUNK_SIZE * WORLD_HEIGHT) + ((clickWy - 1) * CHUNK_SIZE) + clickLz;
        if (currentChunks[clickK][idxBelow] === BlockType.DOOR) {
          doorBaseY = clickWy - 1;
        }
      }

      if (doorBaseY !== -1) {
        const doorKey = `${clickWx},${doorBaseY},${clickWz}`;
        const isCurrentlyOpen = !!openDoorsRef.current[doorKey];
        setOpenDoors(prev => ({
          ...prev,
          [doorKey]: !isCurrentlyOpen
        }));
        playPlaceSound(BlockType.DOOR);
        triggerInGameMessageRef.current(isCurrentlyOpen ? "🚪 Puerta cerrada" : "🚪 Puerta abierta");
        return;
      }

      if (clickedBlock === BlockType.CRAFTING_TABLE) {
        if (onOpenCraftingTableRef.current) {
          onOpenCraftingTableRef.current();
        } else {
          triggerInGameMessageRef.current("¡Mesas de crafteo están activas!");
        }
        return;
      }

      if (clickedBlock === BlockType.BED) {
        const isNight = Math.sin(gameTimeRef.current) < 0;
        if (!isNight) {
          triggerInGameMessageRef.current("¡Solo puedes dormir por la noche!");
        } else {
          playSleepSound();
          isSleepingRef.current = true;
          setIsSleeping(true);
          triggerInGameMessageRef.current("Zzz... Durmiendo en la cama. Pasando la noche...");
        }
        return;
      }
    }

    // Helper to turn Lava adjacent to Water (or vice-versa) into Obsidian
    const checkObsidianConversion = (wx: number, wy: number, wz: number, placed: BlockType, chunksCopyToMutate: Record<string, Uint8Array>) => {
      if (placed !== BlockType.WATER && placed !== BlockType.LAVA) return;
      
      const dirs = [
        { dx: 0, dy: 1, dz: 0 },
        { dx: 0, dy: -1, dz: 0 },
        { dx: 1, dy: 0, dz: 0 },
        { dx: -1, dy: 0, dz: 0 },
        { dx: 0, dy: 0, dz: 1 },
        { dx: 0, dy: 0, dz: -1 }
      ];
      
      for (const d of dirs) {
        const nx = wx + d.dx;
        const ny = wy + d.dy;
        const nz = wz + d.dz;
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        
        const ncx = Math.floor(nx / CHUNK_SIZE);
        const ncz = Math.floor(nz / CHUNK_SIZE);
        const nk = `${ncx},${ncz}`;
        
        const chunkData = chunksCopyToMutate[nk] !== undefined ? chunksCopyToMutate[nk] : chunksRef.current[nk];
        if (!chunkData) continue;
        
        const nlx = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const nlz = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const nidx = (nlx * CHUNK_SIZE * WORLD_HEIGHT) + (ny * CHUNK_SIZE) + nlz;
        const neighborBlock = chunkData[nidx];
        
        if (placed === BlockType.WATER && neighborBlock === BlockType.LAVA) {
          const chunkCopy = chunksCopyToMutate[nk] !== undefined ? chunksCopyToMutate[nk] : new Uint8Array(chunkData);
          chunkCopy[nidx] = BlockType.OBSIDIAN;
          chunksCopyToMutate[nk] = chunkCopy;
          if (editsRef.current) editsRef.current[`${nx},${ny},${nz}`] = BlockType.OBSIDIAN;
          if (onBlockEditRef.current) onBlockEditRef.current(nx, ny, nz, BlockType.OBSIDIAN);
        } else if (placed === BlockType.LAVA && neighborBlock === BlockType.WATER) {
          const placedCx = Math.floor(wx / CHUNK_SIZE);
          const placedCz = Math.floor(wz / CHUNK_SIZE);
          const placedK = `${placedCx},${placedCz}`;
          const placedCopy = chunksCopyToMutate[placedK] !== undefined ? chunksCopyToMutate[placedK] : new Uint8Array(chunksRef.current[placedK]);
          const placedLx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const placedLz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const placedIdx = (placedLx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + placedLz;
          placedCopy[placedIdx] = BlockType.OBSIDIAN;
          chunksCopyToMutate[placedK] = placedCopy;
          if (editsRef.current) editsRef.current[`${wx},${wy},${wz}`] = BlockType.OBSIDIAN;
          if (onBlockEditRef.current) onBlockEditRef.current(wx, wy, wz, BlockType.OBSIDIAN);
          break;
        }
      }
    };

    // --- BUCKET COLLECT LOGIC (SCOOP WATER / LAVA) ---
    if (blockToPlace === BlockType.BUCKET_EMPTY) {
      const clickTarget = point.clone().sub(normal.clone().multiplyScalar(0.1));
      const clickWx = Math.round(clickTarget.x);
      const clickWy = Math.round(clickTarget.y);
      const clickWz = Math.round(clickTarget.z);

      const clickCx = Math.floor(clickWx / CHUNK_SIZE);
      const clickCz = Math.floor(clickWz / CHUNK_SIZE);
      const clickK = `${clickCx},${clickCz}`;

      if (currentChunks[clickK]) {
        const clickLx = ((clickWx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const clickLz = ((clickWz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const clickidx = (clickLx * CHUNK_SIZE * WORLD_HEIGHT) + (clickWy * CHUNK_SIZE) + clickLz;
        const clickedBlock = currentChunks[clickK][clickidx];

        if (clickedBlock === BlockType.WATER) {
          const newData = new Uint8Array(currentChunks[clickK]);
          newData[clickidx] = BlockType.AIR;
          setChunks(prev => ({ ...prev, [clickK]: newData }));
          if (editsRef.current) editsRef.current[`${clickWx},${clickWy},${clickWz}`] = BlockType.AIR;
          if (onBlockEditRef.current) onBlockEditRef.current(clickWx, clickWy, clickWz, BlockType.AIR);
          if (onSelectBlockRef.current) onSelectBlockRef.current(BlockType.BUCKET_WATER);
          playPlaceSound(BlockType.WATER);
          return;
        } else if (clickedBlock === BlockType.LAVA) {
          const newData = new Uint8Array(currentChunks[clickK]);
          newData[clickidx] = BlockType.AIR;
          setChunks(prev => ({ ...prev, [clickK]: newData }));
          if (editsRef.current) editsRef.current[`${clickWx},${clickWy},${clickWz}`] = BlockType.AIR;
          if (onBlockEditRef.current) onBlockEditRef.current(clickWx, clickWy, clickWz, BlockType.AIR);
          if (onSelectBlockRef.current) onSelectBlockRef.current(BlockType.BUCKET_LAVA);
          playPlaceSound(BlockType.LAVA);
          return;
        }
      }
      return;
    }

    // --- STANDARD BLOCK PLACEMENT ---
    if (blockToPlace === BlockType.SWORD || blockToPlace === BlockType.PICKAXE || blockToPlace === BlockType.AXE || blockToPlace === BlockType.SHOVEL) {
      triggerInGameMessageRef.current("⚔️ ¡No puedes colocar herramientas! Úsalas para atacar mobs o talar.");
      return;
    }

    const target = point.clone().add(normal.clone().multiplyScalar(0.1));

    // Do not allow placing blocks inside the player volume
    if (Math.abs(target.x - currPos.x) < 0.8 && Math.abs(target.z - currPos.z) < 0.8 && target.y >= currPos.y - 2 && target.y <= currPos.y + 1) return;

    const wx = Math.round(target.x);
    const wy = Math.round(target.y);
    const wz = Math.round(target.z);

    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    if (!currentChunks[k]) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = wy;
    if (ly < 0 || ly >= WORLD_HEIGHT) return;

    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (ly * CHUNK_SIZE) + lz;
    if (currentChunks[k][idx] !== BlockType.AIR) return;

    // Door twin-block placement check
    if (blockToPlace === BlockType.DOOR) {
      if (ly >= WORLD_HEIGHT - 1) return;
      const idxAbove = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((ly + 1) * CHUNK_SIZE) + lz;
      if (currentChunks[k][idxAbove] !== BlockType.AIR) {
        triggerInGameMessageRef.current("🚫 ¡No hay suficiente espacio para colocar una puerta de 2 de alto!");
        return;
      }
    }

    let blockToActuallyPlace = blockToPlace;
    let isBucketPlacement = false;
    if (blockToPlace === BlockType.BUCKET_WATER) {
      blockToActuallyPlace = BlockType.WATER;
      isBucketPlacement = true;
    } else if (blockToPlace === BlockType.BUCKET_LAVA) {
      blockToActuallyPlace = BlockType.LAVA;
      isBucketPlacement = true;
    }

    const mutatedChunks: Record<string, Uint8Array> = {
      [k]: new Uint8Array(currentChunks[k])
    };
    mutatedChunks[k][idx] = blockToActuallyPlace;

    if (blockToPlace === BlockType.DOOR) {
      const idxAbove = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((ly + 1) * CHUNK_SIZE) + lz;
      mutatedChunks[k][idxAbove] = BlockType.DOOR;
      if (editsRef.current) {
        editsRef.current[`${wx},${wy + 1},${wz}`] = BlockType.DOOR;
      }
      if (onBlockEditRef.current) {
        onBlockEditRef.current(wx, wy + 1, wz, BlockType.DOOR);
      }
    }

    if (editsRef.current) {
      editsRef.current[`${wx},${wy},${wz}`] = blockToActuallyPlace;
    }
    if (onBlockEditRef.current) {
      onBlockEditRef.current(wx, wy, wz, blockToActuallyPlace);
    }

    checkObsidianConversion(wx, wy, wz, blockToActuallyPlace, mutatedChunks);

    setChunks(prev => ({ ...prev, ...mutatedChunks }));

    if (isBucketPlacement && onSelectBlockRef.current) {
      onSelectBlockRef.current(BlockType.BUCKET_EMPTY);
    }

    playPlaceSound(blockToActuallyPlace);
  }, []);

  const removeEntity = useCallback((id: string) => {
    setEntities(prev => {
      const next: Record<string, EntityData[]> = {};
      let changed = false;
      for (const k in prev) {
        if (!Object.prototype.hasOwnProperty.call(prev, k)) continue;
        const filtered = prev[k].filter(e => e.id !== id);
        if (filtered.length !== prev[k].length) {
          changed = true;
        }
        next[k] = filtered;
      }
      return changed ? next : prev;
    });
  }, []);

  const spawnArrow = useCallback((pos: { x: number, y: number, z: number }, dir: THREE.Vector3) => {
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cz = Math.floor(pos.z / CHUNK_SIZE);
    const k = `${cx},${cz}`;

    const arrowId = `arrow_${Date.now()}_${Math.random()}`;
    const newArrow: EntityData = {
      id: arrowId,
      type: EntityType.ARROW,
      pos: { ...pos },
      rot: Math.atan2(dir.x, dir.z),
    };
    (newArrow as any).vx = dir.x * 12;
    (newArrow as any).vy = dir.y * 12 + 1.2;
    (newArrow as any).vz = dir.z * 12;
    (newArrow as any).life = 5.0;

    setEntities(prev => {
      const list = prev[k] || [];
      return {
        ...prev,
        [k]: [...list, newArrow]
      };
    });
  }, []);

  const handleInteraction = useCallback((pos: THREE.Vector3, normal: THREE.Vector3, clientX: number, clientY: number) => {
    const now = Date.now();
    if (lastTapRef.current && (now - lastTapRef.current.time < 300)) {
      if (pointerGestureRef.current?.timeoutId) {
        clearTimeout(pointerGestureRef.current.timeoutId);
      }
      executePick(pos, normal);
      pointerGestureRef.current = {
        startX: clientX,
        startY: clientY,
        point: pos.clone(),
        normal: normal.clone(),
        resolved: true,
        timeoutId: null
      };
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = { time: now, pos: pos.clone() };

    // Clear any previous scheduled breaker
    if (pointerGestureRef.current?.timeoutId) {
      clearTimeout(pointerGestureRef.current.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      if (pointerGestureRef.current && !pointerGestureRef.current.resolved) {
        pointerGestureRef.current.resolved = true;
        executeBreak(pointerGestureRef.current.point, pointerGestureRef.current.normal);
      }
    }, 280); // 280ms threshold for hold-to-break

    pointerGestureRef.current = {
      startX: clientX,
      startY: clientY,
      point: pos.clone(),
      normal: normal.clone(),
      resolved: false,
      timeoutId
    };
  }, [executeBreak, executePick]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-2 right-20 bg-black/50 text-white font-mono text-xs p-1 pointer-events-none z-50 rounded">
        Chunks loaded: {Object.keys(chunks).length}
      </div>
      <Canvas 
        id="voxel-canvas"
        dpr={ultraOptimization ? 0.75 : [1, 1.5]}
        camera={{ fov: fov, position: [playerPos.x !== undefined ? playerPos.x : 0, playerPos.y !== undefined ? playerPos.y : 80, playerPos.z !== undefined ? playerPos.z : 0] }} 
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onPointerDown={resumeAudio}
        onPointerMove={(e) => {
          if (pointerGestureRef.current && !pointerGestureRef.current.resolved) {
            const dx = e.clientX - pointerGestureRef.current.startX;
            const dy = e.clientY - pointerGestureRef.current.startY;
            if (Math.sqrt(dx * dx + dy * dy) > 15) {
              if (pointerGestureRef.current.timeoutId) {
                clearTimeout(pointerGestureRef.current.timeoutId);
              }
              pointerGestureRef.current.resolved = true;
            }
          }
        }}
        onPointerUp={(e) => {
          if (pointerGestureRef.current && !pointerGestureRef.current.resolved) {
            if (pointerGestureRef.current.timeoutId) {
              clearTimeout(pointerGestureRef.current.timeoutId);
            }
            pointerGestureRef.current.resolved = true;
            executePlace(pointerGestureRef.current.point, pointerGestureRef.current.normal);
          }
        }}
      >
        <MinecraftEnvironment 
          gameTimeRef={gameTimeRef} 
          isSleepingRef={isSleepingRef} 
          setIsSleeping={setIsSleeping} 
          ultraOptimization={ultraOptimization} 
          playerPosRef={playerPosRef}
        />

        <NightMobSpawner 
          gameTimeRef={gameTimeRef} 
          entitiesRef={entitiesRef} 
          setEntities={setEntities} 
          playerPosRef={playerPosRef} 
          chunksRef={chunksRef} 
        />
        
        {Object.entries(chunks).map(([k, d]) => {
          const [cx, cz] = k.split(',').map(Number);
          return <Chunk key={k} cx={cx} cz={cz} blocks={d} onInteraction={handleInteraction} openDoors={openDoors} />;
        })}

        {/* Explicitly type the mapped entity to EntityData to fix 'unknown' type error */}
        {Object.values(entities).flat().map((entity: EntityData) => (
          <Animal 
            key={entity.id} 
            data={entity} 
            checkSolid={checkSolid} 
            playerPosRef={playerPosRef}
            removeEntity={removeEntity}
            spawnArrow={spawnArrow}
            chunksRef={chunksRef}
            setChunks={setChunks}
            editsRef={editsRef}
            particlesRef={particlesRef}
            gameTimeRef={gameTimeRef}
            currentBlockRef={currentBlockRef}
          />
        ))}

        {closestTorches.map((torch, idx) => (
          <pointLight 
            key={`torch-light-${idx}-${torch.x}-${torch.y}-${torch.z}`} 
            position={[torch.x, torch.y + 0.35, torch.z]} 
            color="#ff9a2e" 
            intensity={6} 
            distance={11} 
            decay={1.4} 
          />
        ))}

        <Player moveVector={moveVector} lookOffsetRef={lookOffsetRef} onUpdatePos={onBlockChange} isJumping={isJumping} getCollisionHeight={getCollisionHeight} checkSolid={checkSolid} perspective={perspective} gameMode={gameMode} worldType={worldType} chunks={chunks} playerPosRef={playerPosRef} playerPos={playerPos} />
        <ParticleSystem particlesRef={particlesRef} />
        <fog attach="fog" args={['#87ceeb', ultraOptimization ? 8 : 15, ultraOptimization ? 28 : 45]} />
      </Canvas>

      {/* Screen message banner (Minecraft-like Toast) */}
      {inGameMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded-md border border-white/10 text-white font-sans text-sm pointer-events-none select-none z-50 animate-bounce tracking-wide shadow-2xl">
          {inGameMessage}
        </div>
      )}

      {/* Full screen sleeping vignette & darkness filter */}
      {isSleeping && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center pointer-events-none select-none z-[9999] transition-opacity duration-1000">
          <div className="text-white font-mono text-xl tracking-widest animate-pulse">
            Zzz... Durmiendo
          </div>
          <div className="text-xs text-neutral-400 mt-2">
            Pasando la noche...
          </div>
        </div>
      )}
    </div>
  );
};

interface MinecraftEnvironmentProps {
  gameTimeRef: React.MutableRefObject<number>;
  isSleepingRef: React.MutableRefObject<boolean>;
  setIsSleeping: (s: boolean) => void;
  ultraOptimization: boolean;
  playerPosRef: React.MutableRefObject<Vector3D>;
}

const MinecraftEnvironment: React.FC<MinecraftEnvironmentProps> = ({ 
  gameTimeRef, 
  isSleepingRef, 
  setIsSleeping,
  ultraOptimization,
  playerPosRef
}) => {
  const skyRef = useRef<any>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const pointLightRef = useRef<THREE.PointLight>(null);
  const sunPosRef = useRef<[number, number, number]>([100, 20, 100]);
  const lastBiomeCheckRef = useRef<number>(0);
  const currentBiomeRef = useRef<string>('plains');

  useFrame((state, delta) => {
    // 1. Advance time
    if (isSleepingRef.current) {
      gameTimeRef.current += delta * 4; // speed up time enormously!
      if (gameTimeRef.current >= Math.PI * 2) {
        gameTimeRef.current -= Math.PI * 2;
      }
      // Wake up at early dawn (around 0.6 rads)
      if (gameTimeRef.current > 0.4 && gameTimeRef.current < Math.PI) {
        isSleepingRef.current = false;
        setIsSleeping(false);
      }
    } else {
      // Normal progression: full cycle in ~240 (4 mins)
      gameTimeRef.current += (delta * Math.PI) / 120;
      if (gameTimeRef.current >= Math.PI * 2) {
        gameTimeRef.current -= Math.PI * 2;
      }
    }

    const t = gameTimeRef.current;
    
    // Y-axis orbit for the sun/moon to make beautiful sunrises and sunsets!
    const sunX = Math.cos(t) * 150;
    const sunY = Math.sin(t) * 150;
    const sunZ = 50;

    sunPosRef.current = [sunX, sunY, sunZ];
    if (skyRef.current && skyRef.current.material && skyRef.current.material.uniforms && skyRef.current.material.uniforms.sunPosition) {
      skyRef.current.material.uniforms.sunPosition.value.set(sunX, sunY, sunZ);
    }

    let ambientIntensity = 0.08;
    let dirIntensity = 0.08;
    let dirColor = '#ffffff';
    let fogColor = '#06050e';

    if (sunY > 0) {
      // Day
      const dayFactor = Math.sin(t);
      ambientIntensity = 0.15 + 0.70 * dayFactor;
      dirIntensity = 0.8 * dayFactor;
      dirColor = '#fff5e1';

      if (sunY < 40) {
        // Sunrise / Sunset transition colors
        const mixRatio = sunY / 40;
        // Warm orange sky transition
        const r = Math.floor(255 * (1 - mixRatio) + 135 * mixRatio);
        const g = Math.floor(110 * (1 - mixRatio) + 206 * mixRatio);
        const b = Math.floor(70 * (1 - mixRatio) + 235 * mixRatio);
        fogColor = `rgb(${r}, ${g}, ${b})`;
      } else {
        fogColor = '#87ceeb';
      }
    } else {
      // Night (Minecraft style blue tint)
      const nightFactor = Math.abs(Math.sin(t));
      ambientIntensity = 0.12;
      dirIntensity = 0.25 * nightFactor;
      dirColor = '#7e90c7'; // moonlight blue shade
      fogColor = '#0b101c';
    }
    
    // Depth and Biome based fog modifier
    const pPos = playerPosRef.current;
    if (pPos) {
      if (pPos.y < 50) {
        // Deep underground
        const depthRatio = Math.max(0, pPos.y / 50);
        fogColor = '#000000'; // Dark fog at bottom
            } else if (sunY > 0) {
        // Evaluate biome colors (throttled to once every 500ms to increase frame rate from 5fps to 60fps!)
        const nowMs = performance.now();
        if (nowMs - lastBiomeCheckRef.current > 500) {
          lastBiomeCheckRef.current = nowMs;
          const { biome } = getWorldHeight(pPos.x, pPos.z);
          currentBiomeRef.current = biome;
        }
        
        const biome = currentBiomeRef.current;
        let targetFogColor = '#87ceeb'; // Default sky
        if (biome === 'desert') targetFogColor = '#ebd6a7';
        else if (biome === 'mesa') targetFogColor = '#d19462';
        else if (biome === 'mountains') targetFogColor = '#a8c2d1';
        
        // Blend fogColor with target based on sunY for sunrise/sunset
        if (sunY >= 40) {
            fogColor = targetFogColor;
        } else {
            // Keep the warm sunset transition but slightly tint it with the biome color
            // This is a naive blend, we'll keep it simple for now
        }
      }
    }

    // Optimized Real Lights: Dim ambient and direction lights when deep underground
    let depthDimming = 1.0;
    if (pPos) {
      if (pPos.y < 56) {
        depthDimming = Math.max(0.04, (pPos.y - 12) / 44);
      }
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = ambientIntensity * depthDimming;
    }
    if (dirLightRef.current) {
      dirLightRef.current.intensity = dirIntensity * depthDimming;
      dirLightRef.current.color.set(dirColor);
      if (sunY > 0) {
        dirLightRef.current.position.set(sunX, sunY, sunZ);
      } else {
        dirLightRef.current.position.set(-sunX, -sunY, -sunZ);
      }
    }

    if (pointLightRef.current && pPos) {
      const isUnderground = pPos.y < 52;
      const isNight = sunY < 0;

      if (isUnderground || isNight) {
        pointLightRef.current.visible = true;
        pointLightRef.current.position.set(pPos.x, pPos.y + 0.8, pPos.z);
        if (isUnderground) {
          const undergroundFactor = Math.max(0.1, (52 - pPos.y) / 40);
          pointLightRef.current.intensity = 3.6 * undergroundFactor;
          pointLightRef.current.distance = 28;
        } else {
          pointLightRef.current.intensity = 2.4;
          pointLightRef.current.distance = 20;
        }
      } else {
        pointLightRef.current.visible = false;
      }
    }

    if (state.scene.fog && 'color' in state.scene.fog) {
      (state.scene.fog as any).color.set(fogColor);
    }

    if (state.scene) {
      if (!state.scene.background) {
        state.scene.background = new THREE.Color(fogColor);
      } else if (state.scene.background instanceof THREE.Color) {
        state.scene.background.set(fogColor);
      }
    }
  });

  return (
    <>
      <Sky ref={skyRef} sunPosition={sunPosRef.current} />
      {/* Stars only render fully when it's dark */}
      <Stars count={ultraOptimization ? 120 : 350} radius={100} depth={50} factor={4} saturation={0.5} fade />
      <ambientLight ref={ambientLightRef} intensity={0.9} />
      <directionalLight ref={dirLightRef} position={[10, 20, 10]} intensity={0.8} />
      <pointLight ref={pointLightRef} color="#ffb03a" distance={20} decay={1.2} intensity={0} />
    </>
  );
};

const PARTICLE_DUMMY = new THREE.Object3D();
const PARTICLE_COLOR = new THREE.Color();

const ParticleSystem: React.FC<{
  particlesRef: React.MutableRefObject<any[]>;
}> = ({ particlesRef }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame((state, delta) => {
    const list = particlesRef.current;
    if (list.length === 0) {
      if (meshRef.current) {
        meshRef.current.count = 0;
      }
      return;
    }

    const minDelta = Math.min(delta, 0.1);
    
    // 1. Update particle physics in-place (incredibly fast, zero storage allocation)
    let activeCount = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= minDelta * 2.5;
      if (p.life > 0) {
        p.x += p.vx * minDelta;
        p.y += p.vy * minDelta - 4.5 * minDelta; // gravity
        p.z += p.vz * minDelta;
        
        list[activeCount] = p;
        activeCount++;
      }
    }
    list.length = activeCount;

    // 2. Render active particles inside InstancedMesh
    if (meshRef.current) {
      const maxToRender = Math.min(activeCount, 150);
      for (let i = 0; i < maxToRender; i++) {
        const p = list[i];
        PARTICLE_DUMMY.position.set(p.x, p.y, p.z);
        PARTICLE_DUMMY.scale.set(p.size, p.size, p.size);
        PARTICLE_DUMMY.updateMatrix();
        meshRef.current.setMatrixAt(i, PARTICLE_DUMMY.matrix);
        
        PARTICLE_COLOR.set(p.color);
        meshRef.current.setColorAt(i, PARTICLE_COLOR);
      }
      meshRef.current.count = maxToRender;
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null as any, null as any, 150]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial transparent opacity={0.8} />
    </instancedMesh>
  );
};

export default VoxelWorld;
