
import React, { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_COLORS, VIEW_DISTANCE, BLOCK_NAMES } from '../constants';
import { BlockType, EntityType, EntityData, Vector3D, NoiseConfig, PerformanceConfig, CharacterSkinId, CustomCharacterConfig, ActivePlayerInfo, AICompanionConfig } from '../types';
import { playPlaceSound, playBreakSound, playStepSound, resumeAudio, playSleepSound, playHurtSound, playZombieSound, playCreeperSizzle, playExplosionSound, playBowShootSound, updateAmbientEnvironment, playJukeboxMusic, stopJukeboxMusic, stopAllJukeboxMusic, playCatSound, playAttackSwingSound } from '../services/audioService';
import { CharacterModel, FirstPersonHand, CHARACTER_SKINS, resolveCharacterSkin } from './CharacterModel';
import AICompanion from './AICompanion';
import { gameState } from '../store';
import { createNoise2D, createNoise3D } from 'simplex-noise';

// High-performance bounded height cache
const worldHeightCache = new Map<string, { h: number; biome: string }>();

export const clearNoiseCaches = () => {
    worldHeightCache.clear();
};

// Reusable scratch math objects to eliminate per-frame GC allocations
const CHUNK_DUMMY = new THREE.Object3D();
const EMPTY_OPEN_DOORS: Record<string, boolean> = {};
const EMPTY_DOOR_AXES: Record<string, boolean> = {};
const PLAYER_FWD_SCRATCH = new THREE.Vector3();
const PLAYER_RIGHT_SCRATCH = new THREE.Vector3();
const PLAYER_DIR_SCRATCH = new THREE.Vector3();
const ANIMAL_BOW_DIR = new THREE.Vector3();
const PLAYER_BOX_POOL = Array.from({ length: 128 }, () => ({
  minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0
}));

let _cachedIsSoftwareGL: boolean | null = null;
const detectSoftwareGL = (): boolean => {
  if (_cachedIsSoftwareGL !== null) return _cachedIsSoftwareGL;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      _cachedIsSoftwareGL = true;
      return true;
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    _cachedIsSoftwareGL = /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render/i.test(renderer);
  } catch {
    _cachedIsSoftwareGL = false;
  }
  return _cachedIsSoftwareGL;
};

// Seeded RNG for noise
const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

const createNoise = (seed: number) => {
    const rng = lcg(seed);
    const simplex = createNoise2D(rng);

    return (x: number, z: number) => {
        // Fractal Brownian Motion (fBm) with gentle, walkable frequencies
        let total = 0;
        let frequency = 0.0075; // Smooth, broad rolling hills rather than sharp spikes
        let amplitude = 1.0;
        let maxValue = 0;
        for(let i = 0; i < 4; i++) {
            // simplex noise returns -1 to 1, map to 0 to 1
            const n = (simplex(x * frequency, z * frequency) + 1) * 0.5;
            total += n * amplitude;
            maxValue += amplitude;
            amplitude *= 0.4;
            frequency *= 2.0;
        }
        
        // Normalize to [0, 1]
        let normalized = total / (maxValue || 1);
        
        // Gentle power curve to avoid steep, impassable cliffs
        const shift = Math.pow(normalized, 1.25); 
        
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

export const DEFAULT_NOISE_CONFIG: NoiseConfig = {
  simplex3DEnabled: true,
  simplex3DThreshold: 0.28,
  simplex3DScaleX: 0.035,
  simplex3DScaleY: 0.05,
  simplex3DScaleZ: 0.035,

  ridgedEnabled: true,
  ridgedFreq: 0.012,
  ridgedAmp: 8.0,
  ridgedWeight: 0.4,

  fbmEnabled: true,
  fbmOctaves: 5,
  fbmFreq: 0.015,
  fbmAmp: 1.0,
  fbmLacunarity: 2.1,
  fbmGain: 0.45,

  tempEnabled: true,
  tempFreq: 0.008,
};

let activeNoiseConfig: NoiseConfig = DEFAULT_NOISE_CONFIG;

const createBase2DNoise = (seed: number) => {
    const rng = lcg(seed);
    return createNoise2D(rng);
};

const calculateRidgedNoise = (x: number, z: number, ridgedNoiseFun?: (x: number, z: number) => number) => {
    const config = activeNoiseConfig || DEFAULT_NOISE_CONFIG;
    if (!config.ridgedEnabled) return 0.0;

    const fn = ridgedNoiseFun || getNoiseForWorld(activeWorldId).ridgedNoiseFun;
    const freq = config.ridgedFreq ?? 0.012;
    const amp = config.ridgedAmp ?? 8.0;
    const n = fn(x * freq, z * freq);
    
    // Ridged noise: 1.0 - abs(noise) creates sharp crests/ridges
    const ridgedVal = 1.0 - Math.abs(n);
    return ridgedVal * ridgedVal * amp;
};

const calculateFbmNoise = (x: number, z: number, fbmNoiseFun?: (x: number, z: number) => number) => {
    const config = activeNoiseConfig || DEFAULT_NOISE_CONFIG;
    if (!config.fbmEnabled) return 0.0;

    const fn = fbmNoiseFun || getNoiseForWorld(activeWorldId).fbmNoiseFun;
    let total = 0;
    let freq = config.fbmFreq ?? 0.015;
    let amp = config.fbmAmp ?? 1.0;
    const lacunarity = config.fbmLacunarity ?? 2.1;
    const gain = config.fbmGain ?? 0.45;
    let maxValue = 0;

    const octaves = Math.max(1, Math.min(8, config.fbmOctaves ?? 5));
    for (let i = 0; i < octaves; i++) {
        const n = fn(x * freq, z * freq);
        total += n * amp;
        maxValue += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    
    return (total / (maxValue || 1)) * 10.0; // scale to a reasonable height variation
};

const calculateTemperatureNoise = (x: number, z: number, tempNoiseFun?: (x: number, z: number) => number) => {
    const config = activeNoiseConfig || DEFAULT_NOISE_CONFIG;
    if (!config.tempEnabled) return 0.5;

    const fn = tempNoiseFun || getNoiseForWorld(activeWorldId).tempNoiseFun;
    const freq = config.tempFreq ?? 0.008;
    const n = fn(x * freq, z * freq);
    return (n + 1) * 0.5; // map to [0, 1]
};

const caveNoise = (x: number, y: number, z: number, cave3DOverride?: (x: number, y: number, z: number) => number) => {
    // Only generate caves underground (under height 52)
    if (y > 52) return 0.0;

    const config = activeNoiseConfig || DEFAULT_NOISE_CONFIG;
    if (!config.simplex3DEnabled) {
        return 0.0;
    }

    const cave3D = cave3DOverride || getNoiseForWorld(activeWorldId).cave3D;
    
    // Scale coordinates
    const scaleX = config.simplex3DScaleX ?? 0.035;
    const scaleY = config.simplex3DScaleY ?? 0.05;
    const scaleZ = config.simplex3DScaleZ ?? 0.035;
    const n = cave3D(x * scaleX, y * scaleY, z * scaleZ);
    
    // Smooth transition
    const depthFactor = Math.min(1.0, (52 - y) / 12);
    
    // Configurable threshold
    const threshold = (config.simplex3DThreshold ?? 0.28) * depthFactor;
    
    if (Math.abs(n) < threshold) {
        return 1.0; // Hollow!
    }
    
    // Additional circular pocket caverns/chambers
    if (y < 30) {
        const nCavern = cave3D(x * 0.02, y * 0.03, z * 0.02);
        if (nCavern > 0.42 * (1.1 + (y / 30) * 0.15)) {
            return 1.0;
        }
    }
    
    return 0.0;
};

let activeWorldId = 'temp';
let activeWorldType = 'normal';
let activeDimension = 'overworld';
let activeUserRole = 'user';
let activeBiomeConfig: { surface: number; underground: number; flora: number } | null = null;

const worldSeeds = new Map<string, { 
    noise: (x: number, z: number) => number; 
    biomeNoiseFun: (x: number, z: number) => number; 
    cave3D: (x: number, y: number, z: number) => number;
    ridgedNoiseFun: (x: number, z: number) => number;
    fbmNoiseFun: (x: number, z: number) => number;
    tempNoiseFun: (x: number, z: number) => number;
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
  const wRidged = createBase2DNoise(seed + 1500);
  const wFbm = createBase2DNoise(seed + 2000);
  const wTemp = createBase2DNoise(seed + 2500);
  
  const res = { 
    noise: wNoise, 
    biomeNoiseFun: wBiomeNoise, 
    cave3D: wCave3D, 
    ridgedNoiseFun: wRidged,
    fbmNoiseFun: wFbm,
    tempNoiseFun: wTemp,
    seed 
  };
  worldSeeds.set(worldId, res);
  return res;
};

const computeBiomeHeights = (baseNoise: number, fbm: number, ridged: number) => {
    return {
        desert: 5 + baseNoise * 0.7 + fbm * 0.03 + ridged * 0.01,
        mesa: 6 + baseNoise * 1.0 + fbm * 0.05 + ridged * 0.02,
        plains: 5 + baseNoise * 0.6 + fbm * 0.04 + ridged * 0.02,
        autumn: 6 + baseNoise * 0.9 + fbm * 0.06 + ridged * 0.02,
        mountains: 10 + baseNoise * 1.8 + fbm * 0.15 + ridged * 0.1,
    };
};

const _getWorldHeight = (x: number, z: number) => {
    // Check for custom editable biome region (large region X: 400 to 800, Z: 400 to 800)
    const isAuthorizedForEditableBiome = activeUserRole === 'owner' || activeUserRole === 'staff' || activeUserRole === 'mod';
    if (isAuthorizedForEditableBiome && x >= 400 && x <= 800 && z >= 400 && z <= 800) {
        const { noise } = getNoiseForWorld(activeWorldId);
        let n = noise(x * 0.005, z * 0.005) * 8.0;
        let h = Math.floor(62 + n);
        if (h < 50) h = 50;
        if (h >= WORLD_HEIGHT - 3) h = WORLD_HEIGHT - 4;
        return { h, biome: 'editable' };
    }

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

    const worldConf = getNoiseForWorld(activeWorldId);
    const { noise, biomeNoiseFun, ridgedNoiseFun, fbmNoiseFun, tempNoiseFun } = worldConf;
    // bNoise helps distinguish biomes. It ranges from ~0 to 10.
    const bNoise = biomeNoiseFun(x * 0.75, z * 0.75);
    
    // 1. Temperature Noise (if enabled) influences biome distribution
    const config = activeNoiseConfig || DEFAULT_NOISE_CONFIG;
    let biome = 'plains';
    let n = 0;

    // Evaluate column base noises ONCE per (x, z) instead of 5x redundantly
    const baseNoise = noise(x, z);
    const fbm = config.fbmEnabled ? calculateFbmNoise(x, z, fbmNoiseFun) : 0;
    const ridged = config.ridgedEnabled ? calculateRidgedNoise(x, z, ridgedNoiseFun) : 0;
    const bh = computeBiomeHeights(baseNoise, fbm, ridged);

    if (config.tempEnabled) {
        const tempVal = calculateTemperatureNoise(x, z, tempNoiseFun);
        
        // Define smooth weight zones for Temperature
        let wCold = 0;
        let wHot = 0;
        let wTemperate = 0;

        if (tempVal <= 0.30) {
            wCold = 1.0;
        } else if (tempVal >= 0.40 && tempVal <= 0.60) {
            wTemperate = 1.0;
        } else if (tempVal >= 0.70) {
            wHot = 1.0;
        } else if (tempVal > 0.30 && tempVal < 0.40) {
            const t = (tempVal - 0.30) / 0.10;
            wCold = 1.0 - t;
            wTemperate = t;
        } else { // tempVal > 0.60 && tempVal < 0.70
            const t = (tempVal - 0.60) / 0.10;
            wTemperate = 1.0 - t;
            wHot = t;
        }

        // Biome blending within each zone
        let cold_mountains = 0;
        let cold_plains = 0;
        if (bNoise <= 1.8) {
            cold_mountains = 1.0;
        } else if (bNoise >= 2.8) {
            cold_plains = 1.0;
        } else {
            const t = (bNoise - 1.8) / 1.0;
            cold_mountains = 1.0 - t;
            cold_plains = t;
        }
        const coldHeight = bh.mountains * cold_mountains + bh.plains * cold_plains;

        let hot_desert = 0;
        let hot_mesa = 0;
        if (bNoise <= 3.5) {
            hot_desert = 1.0;
        } else if (bNoise >= 4.5) {
            hot_mesa = 1.0;
        } else {
            const t = (bNoise - 3.5) / 1.0;
            hot_desert = 1.0 - t;
            hot_mesa = t;
        }
        const hotHeight = bh.desert * hot_desert + bh.mesa * hot_mesa;

        let temp_plains = 0;
        let temp_autumn = 0;
        let temp_mountains = 0;
        if (bNoise <= 4.0) {
            temp_plains = 1.0;
        } else if (bNoise > 4.0 && bNoise < 5.0) {
            const t = (bNoise - 4.0) / 1.0;
            temp_plains = 1.0 - t;
            temp_autumn = t;
        } else if (bNoise >= 5.0 && bNoise <= 8.5) {
            temp_autumn = 1.0;
        } else if (bNoise > 8.5 && bNoise < 9.2) {
            const t = (bNoise - 8.5) / 0.7;
            temp_autumn = 1.0 - t;
            temp_mountains = t;
        } else {
            temp_mountains = 1.0;
        }
        const temperateHeight = bh.plains * temp_plains + bh.autumn * temp_autumn + bh.mountains * temp_mountains;

        // Smoothly combine the zones
        n = coldHeight * wCold + hotHeight * wHot + temperateHeight * wTemperate;

        // Determine dominant biome for metadata
        if (wCold > 0.5) {
            biome = cold_mountains > cold_plains ? 'mountains' : 'plains';
        } else if (wHot > 0.5) {
            biome = hot_desert > hot_mesa ? 'desert' : 'mesa';
        } else {
            if (temp_plains > temp_autumn && temp_plains > temp_mountains) {
                biome = 'plains';
            } else if (temp_autumn > temp_plains && temp_autumn > temp_mountains) {
                biome = 'autumn';
            } else {
                biome = 'mountains';
            }
        }
    } else {
        // Standard non-temperature biome selection with smooth transitions
        let std_desert = 0;
        let std_mesa = 0;
        let std_plains = 0;
        let std_autumn = 0;
        let std_mountains = 0;

        if (bNoise <= 3.0) {
            std_desert = 1.0;
        } else if (bNoise > 3.0 && bNoise < 4.0) {
            const t = (bNoise - 3.0) / 1.0;
            std_desert = 1.0 - t;
            std_mesa = t;
        } else if (bNoise >= 4.0 && bNoise <= 5.5) {
            std_mesa = 1.0;
        } else if (bNoise > 5.5 && bNoise < 6.5) {
            const t = (bNoise - 5.5) / 1.0;
            std_mesa = 1.0 - t;
            std_plains = t;
        } else if (bNoise >= 6.5 && bNoise <= 8.0) {
            std_plains = 1.0;
        } else if (bNoise > 8.0 && bNoise < 9.0) {
            const t = (bNoise - 8.0) / 1.0;
            std_plains = 1.0 - t;
            std_autumn = t;
        } else if (bNoise >= 9.0 && bNoise <= 9.3) {
            std_autumn = 1.0;
        } else {
            std_mountains = 1.0;
        }

        n = bh.desert * std_desert + 
            bh.mesa * std_mesa + 
            bh.plains * std_plains + 
            bh.autumn * std_autumn + 
            bh.mountains * std_mountains;

        if (std_desert > 0.5) biome = 'desert';
        else if (std_mesa > 0.5) biome = 'mesa';
        else if (std_plains > 0.5) biome = 'plains';
        else if (std_autumn > 0.5) biome = 'autumn';
        else biome = 'mountains';
    }
    
    let continuousH = n + 50;

    // --- BIOME RE-MAPPING & LAKES / SEAS GENERATION ---
    if (activeDimension !== 'nether' && activeWorldType !== 'flat' && activeWorldType !== 'plano' && activeWorldType !== 'plano_infinito') {
      const worldConf = getNoiseForWorld(activeWorldId);
      const bNoiseVal = worldConf.fbmNoiseFun(x * 0.0045 + 12.3, z * 0.0045 - 7.1); // true [-1, 1] wide biome bands
      if (bNoiseVal < -0.58) {
        biome = 'desert';
      } else if (bNoiseVal < -0.34) {
        biome = 'swamp';
        continuousH = 54.6 + Math.sin(x * 0.05) * 1.2 + Math.cos(z * 0.06) * 0.8; // wet swamp pools & reeds
      } else if (bNoiseVal < -0.14) {
        biome = 'jungle';
      } else if (bNoiseVal < 0.02) {
        biome = 'bamboo_jungle';
      } else if (bNoiseVal < 0.22) {
        biome = 'cherry';
      } else if (bNoiseVal < 0.42) {
        biome = 'dark';
      } else if (bNoiseVal < 0.62) {
        biome = 'snow';
      }

      // Smoothly limit land elevations so landscapes remain scenic and walkable
      if (biome !== 'mountains') {
        if (continuousH > 68) {
          continuousH = 68 + (continuousH - 68) * 0.25;
        }
      } else {
        if (continuousH > 82) {
          continuousH = 82 + (continuousH - 82) * 0.25;
        }
      }

      // Keep immediate spawn plaza around (0, 0) dry while allowing nearby lakes & coasts beyond 18 blocks
      const distOriginSq = x * x + z * z;
      const spawnSafe =
        distOriginSq <= 324
          ? 0
          : distOriginSq >= 1444
            ? 1
            : (Math.sqrt(distOriginSq) - 18) / 20;

      if (spawnSafe > 0) {
        // 1. Seas & Oceans (broad continental basins below SEA_LEVEL = 56)
        const oceanNoise = worldConf.tempNoiseFun(x * 0.0042 + 17.5, z * 0.0042 - 31.2);
        if (oceanNoise < -0.10) {
          const tCoast = Math.min(1, (-0.10 - oceanNoise) / 0.36);
          const seaTarget = 56.5 - Math.pow(tCoast, 1.15) * 15.5; // slopes from beach (56) down to seabed (41)
          const blend = Math.min(1, tCoast * 1.35) * spawnSafe;
          continuousH = continuousH * (1 - blend) + Math.min(continuousH, seaTarget) * blend;
        }

        // 2. Inland Lakes (natural freshwater basins in plains, forests, jungle, cherry, autumn, snow)
        if (biome !== 'mountains') {
          const lakeNoise =
            worldConf.fbmNoiseFun(x * 0.016 - 43.1, z * 0.016 + 29.7) +
            worldConf.ridgedNoiseFun(x * 0.03 + 7, z * 0.03 - 9) * 0.12;
          if (lakeNoise < -0.28) {
            const tLake = Math.min(1, (-0.28 - lakeNoise) / 0.28);
            continuousH -= tLake * 7.2 * spawnSafe;
          }
        }
      }
    }

    let h = Math.floor(continuousH);
    if (h < 40) h = 40;
    if (h >= WORLD_HEIGHT - 3) h = WORLD_HEIGHT - 4;

    return { h, biome };
};

const getWorldHeight = (x: number, z: number) => {
    const cacheKey = `${x},${z}`;
    const cached = worldHeightCache.get(cacheKey);
    if (cached) return cached;

    if (worldHeightCache.size > 80000) {
        worldHeightCache.clear();
    }

    const res = _getWorldHeight(x, z);
    worldHeightCache.set(cacheKey, res);
    return res;
};

interface VillageLayoutInfo {
  centerCx: number;
  centerCz: number;
  rcx: number;
  rcz: number;
  ox: number;
  oz: number;
  villageY: number;
  isDesert: boolean;
}

const getVillageLayoutInfo = (
  cx: number,
  cz: number,
  seed: number,
  isFlatWorld: boolean,
  activeDimension: string
): VillageLayoutInfo | null => {
  if (isFlatWorld || activeDimension === 'nether') return null;

  const vgx = Math.floor(cx / 3);
  const vgz = Math.floor(cz / 3);
  const centerCx = vgx * 3 + 1;
  const centerCz = vgz * 3 + 1;
  const rcx = cx - centerCx;
  const rcz = cz - centerCz;

  // Keep corner chunks untouched natural terrain; only generate village in + shape (center + 4 cardinal chunks)
  if (Math.abs(rcx) === 1 && Math.abs(rcz) === 1) return null;

  const rVillage = getSeededRandom(seed + 77, centerCx, centerCz, 151);
  if (rVillage >= 0.18) return null;

  const ox = centerCx * CHUNK_SIZE;
  const oz = centerCz * CHUNK_SIZE;

  const hCenter = getWorldHeight(ox + 8, oz + 8).h;
  const hWest = getWorldHeight(ox - 8, oz + 8).h;
  const hEast = getWorldHeight(ox + 24, oz + 8).h;
  const hNorth = getWorldHeight(ox + 8, oz - 8).h;
  const hSouth = getWorldHeight(ox + 8, oz + 20).h;

  const minH = Math.min(hCenter, hWest, hEast, hNorth, hSouth);
  const maxH = Math.max(hCenter, hWest, hEast, hNorth, hSouth);
  if (minH < 57 || maxH - minH > 12) return null;

  const villageY = Math.round((hCenter * 2 + hWest + hEast + hNorth + hSouth) / 6);
  const isDesert = getWorldHeight(ox + 8, oz + 8).biome === 'desert';

  return { centerCx, centerCz, rcx, rcz, ox, oz, villageY, isDesert };
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
  isZooming?: boolean;
  ultraOptimization?: boolean;
  worldId?: string;
  initialEdits?: Record<string, number>;
  onBlockEdit?: (x: number, y: number, z: number, blockType: BlockType, oldBlockType?: BlockType, isSystemUpdate?: boolean) => void;
  gameMode?: 'creative' | 'survival' | 'adventure' | 'spectator' | 'creativo' | 'supervivencia' | 'aventura' | 'espectador';
  worldType?: 'flat' | 'normal' | 'edge_farlands' | 'plano' | 'plano_infinito';
  onSelectBlock?: (block: BlockType) => void;
  onOpenCraftingTable?: () => void;
  onOpenFurnace?: () => void;
  onOpenCartographyTable?: () => void;
  onOpenChest?: () => void;
  onUseMap?: () => void;
  survivalInventory?: Record<number, number>;
  onUpdateSurvivalInventory?: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  weather?: 'clear' | 'rain' | 'snow' | 'thunderstorm' | 'snow_rain';
  dimension?: 'overworld' | 'nether';
  onPortalTeleport?: () => void;
  activePlayers?: ActivePlayerInfo[];
  autoJumpEnabled?: boolean;
  userRole?: string;
  biomeConfig?: { surface: number; underground: number; flora: number } | null;
  noiseConfig?: NoiseConfig;
  perfConfig?: PerformanceConfig;
  attackTrigger?: number;
  placeTrigger?: number;
  buildBrush?: 'single' | 'line3' | 'wall3x2';
  characterSkin?: CharacterSkinId;
  customSkin?: CustomCharacterConfig;
  playerPoseRef?: React.MutableRefObject<{ yaw: number; pitch: number }>;
  externalMoveVectorRef?: React.MutableRefObject<{ x: number; y: number }>;
  aiCompanionConfig?: AICompanionConfig;
  aiCompanionTpTrigger?: number;
  aiCompanionPosRef?: React.MutableRefObject<Vector3D>;
  aiCompanionBagRef?: React.MutableRefObject<Record<number, number>>;
  onAICompanionBuildComplete?: () => void;
  onAICompanionSpeak?: (msg: string) => void;
}

// Exact physical collision bounds aligned cleanly with each entity model so NO part of any mob penetrates blocks
export const getEntityCollisionBounds = (
  type: EntityType
): { halfW: number; halfFront: number; halfBack: number; height: number } => {
  switch (type) {
    case EntityType.CHICKEN:
      return { halfW: 0.25, halfFront: 0.35, halfBack: 0.28, height: 0.66 };
    case EntityType.FROG:
      return { halfW: 0.24, halfFront: 0.20, halfBack: 0.19, height: 0.34 };
    case EntityType.CAT:
      return { halfW: 0.24, halfFront: 0.38, halfBack: 0.56, height: 0.60 };
    case EntityType.WOLF:
      return { halfW: 0.26, halfFront: 0.56, halfBack: 0.54, height: 0.72 };
    case EntityType.PIG:
      return { halfW: 0.34, halfFront: 0.80, halfBack: 0.53, height: 0.84 };
    case EntityType.SHEEP:
      return { halfW: 0.36, halfFront: 0.75, halfBack: 0.56, height: 0.92 };
    case EntityType.VILLAGER:
      return { halfW: 0.34, halfFront: 0.34, halfBack: 0.24, height: 1.75 };
    case EntityType.ZOMBIE:
      return { halfW: 0.36, halfFront: 0.46, halfBack: 0.24, height: 1.62 };
    case EntityType.SKELETON:
    case EntityType.SNOW_SKELETON:
    case EntityType.SWAMP_SKELETON:
      return { halfW: 0.28, halfFront: 0.44, halfBack: 0.24, height: 1.66 };
    case EntityType.CREEPER:
      return { halfW: 0.28, halfFront: 0.26, halfBack: 0.24, height: 1.38 };
    case EntityType.ZOMBIFIED_PIGLIN:
      return { halfW: 0.35, halfFront: 0.52, halfBack: 0.24, height: 1.62 };
    case EntityType.HOGLIN:
      return { halfW: 0.48, halfFront: 1.15, halfBack: 0.66, height: 1.16 };
    case EntityType.IRON_GOLEM:
      return { halfW: 0.76, halfFront: 0.40, halfBack: 0.34, height: 2.44 };
    case EntityType.ENDERMAN:
      return { halfW: 0.28, halfFront: 0.28, halfBack: 0.24, height: 3.06 };
    default:
      return { halfW: 0.35, halfFront: 0.35, halfBack: 0.35, height: 1.8 };
  }
};

// Pre-allocated AABB box pool for zero-GC entity voxel collision sweeps
const ENTITY_BOX_POOL = Array.from({ length: 64 }, () => ({
  minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0
}));

// Universal hitbox dimensions kept strictly within each entity's physical bounds so hitboxes never clip through walls or floors
export const getEntityHitbox = (type: EntityType): { width: number; height: number; depth: number; centerY: number; centerZ: number } => {
  switch (type) {
    case EntityType.CHICKEN:
      return { width: 0.48, height: 0.64, depth: 0.60, centerY: 0.33, centerZ: 0.03 };
    case EntityType.FROG:
      return { width: 0.46, height: 0.32, depth: 0.38, centerY: 0.17, centerZ: 0.0 };
    case EntityType.CAT:
      return { width: 0.44, height: 0.58, depth: 0.88, centerY: 0.30, centerZ: -0.08 };
    case EntityType.WOLF:
      return { width: 0.48, height: 0.70, depth: 1.04, centerY: 0.36, centerZ: 0.01 };
    case EntityType.PIG:
      return { width: 0.66, height: 0.82, depth: 1.28, centerY: 0.42, centerZ: 0.13 };
    case EntityType.SHEEP:
      return { width: 0.70, height: 0.90, depth: 1.26, centerY: 0.46, centerZ: 0.10 };
    case EntityType.VILLAGER:
      return { width: 0.66, height: 1.72, depth: 0.56, centerY: 0.87, centerZ: 0.04 };
    case EntityType.ZOMBIE:
      return { width: 0.70, height: 1.60, depth: 0.68, centerY: 0.81, centerZ: 0.10 };
    case EntityType.SKELETON:
    case EntityType.SNOW_SKELETON:
    case EntityType.SWAMP_SKELETON:
      return { width: 0.54, height: 1.64, depth: 0.66, centerY: 0.83, centerZ: 0.09 };
    case EntityType.CREEPER:
      return { width: 0.54, height: 1.36, depth: 0.48, centerY: 0.69, centerZ: 0.0 };
    case EntityType.ZOMBIFIED_PIGLIN:
      return { width: 0.68, height: 1.60, depth: 0.74, centerY: 0.81, centerZ: 0.12 };
    case EntityType.HOGLIN:
      return { width: 0.94, height: 1.14, depth: 1.76, centerY: 0.58, centerZ: 0.24 };
    case EntityType.IRON_GOLEM:
      return { width: 1.48, height: 2.40, depth: 0.72, centerY: 1.21, centerZ: 0.03 };
    case EntityType.ENDERMAN:
      return { width: 0.54, height: 3.04, depth: 0.50, centerY: 1.53, centerZ: 0.0 };
    default:
      return { width: 0.68, height: 1.76, depth: 0.68, centerY: 0.89, centerZ: 0.0 };
  }
};

export const getMaxEntityHealth = (type: EntityType): number => {
  switch (type) {
    case EntityType.CHICKEN:
      return 6;
    case EntityType.FROG:
      return 8;
    case EntityType.PIG:
    case EntityType.SHEEP:
      return 10;
    case EntityType.CAT:
      return 12;
    case EntityType.WOLF:
      return 16;
    case EntityType.VILLAGER:
      return 26;
    case EntityType.IRON_GOLEM:
      return 80;
    case EntityType.HOGLIN:
      return 36;
    case EntityType.ENDERMAN:
      return 40;
    default:
      return 20;
  }
};

// Global registry mapping entity ID to its handleHit callback for melee assist
const globalEntityHitHandlers = new Map<string, () => void>();

// Animal: Componente controlador de todo tipo de entidades (Pasivas y Hostiles), optimizado al maximo
const Animal = React.memo<{ 
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
  perfConfig?: PerformanceConfig;
  onBlockEditRef?: React.MutableRefObject<any>;
  entitiesRef?: React.MutableRefObject<any>;
  weatherRef?: React.MutableRefObject<'clear' | 'rain' | 'snow' | 'thunderstorm' | 'snow_rain'>;
}>(({ data, checkSolid, playerPosRef, removeEntity, spawnArrow, chunksRef, setChunks, editsRef, particlesRef, gameTimeRef, currentBlockRef, perfConfig, onBlockEditRef, entitiesRef, weatherRef }) => {
  const meshRef = useRef<THREE.Group>(null);
  const velocityY = useRef(0);
  const knockbackRef = useRef({ x: 0, y: 0, z: 0 });
  
  // Game limits & configurations
  const [flashRed, setFlashRed] = useState(false);
  const [fusePulse, setFusePulse] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const isBurningRef = useRef(false);
  const entityHealth = useRef(getMaxEntityHealth(data.type));

  // Timers and state refs
  const lastSoundPlayRef = useRef(0);
  const fuseTimerRef = useRef(0);
  const fuseActiveRef = useRef(false);
  const skCooldownRef = useRef(Math.random() * 2);
  const attackCooldownRef = useRef(0);
  const burnDamageTimerRef = useRef(0);
  const burnParticleTimerRef = useRef(0);
  const waterDamageTimerRef = useRef(0);
  const waterParticleTimerRef = useRef(0);
  const endermanFleeCdRef = useRef(0);
  const accumDeltaRef = useRef(0);
  const aiFrameSkipRef = useRef(Math.floor(Math.random() * 3));
  const shelteredCacheRef = useRef<{ ts: number; val: boolean }>({ ts: -1, val: false });
  const golemScanCacheRef = useRef<{ ts: number; targetId: string | null }>({ ts: -1, targetId: null });
  const bounds = useMemo(() => getEntityCollisionBounds(data.type), [data.type]);
  const hitbox = useMemo(() => getEntityHitbox(data.type), [data.type]);

  // Procedural 60fps limb/head/tail animation refs (zero React re-renders)
  const headGroupRef = useRef<THREE.Group>(null);
  const limbFLRef = useRef<THREE.Group>(null);
  const limbFRRef = useRef<THREE.Group>(null);
  const limbBLRef = useRef<THREE.Group>(null);
  const limbBRRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const animPhaseRef = useRef(Math.random() * Math.PI * 2);
  const animAmpRef = useRef(0);
  
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

    // Neutral mobs retaliate when struck in non-creative modes
    const gm = (gameState as any).gameMode;
    const isPlayerImmune = gm === 'creative' || gm === 'creativo' || gm === 'spectator' || gm === 'espectador';
    if (!isPlayerImmune && (data.type === EntityType.ZOMBIFIED_PIGLIN || data.type === EntityType.ENDERMAN)) {
      (data as any).isAngry = true;
    }

    // Damage calculation based on crafted tool tier & category
    const held = currentBlockRef.current;
    let damage = 4;
    switch (held) {
      case BlockType.DIAMOND_SWORD: damage = 20; break;
      case BlockType.SWORD: damage = 15; break; // Espada de Hierro
      case BlockType.GOLD_SWORD: damage = 14; break;
      case BlockType.STONE_SWORD: damage = 11; break;
      case BlockType.WOOD_SWORD: damage = 8; break;
      case BlockType.DIAMOND_AXE: damage = 16; break;
      case BlockType.IRON_AXE: damage = 12; break;
      case BlockType.GOLD_AXE: damage = 11; break;
      case BlockType.STONE_AXE: damage = 9; break;
      case BlockType.AXE: damage = 7; break; // Hacha de Madera
      case BlockType.DIAMOND_PICKAXE: damage = 12; break;
      case BlockType.IRON_PICKAXE: damage = 10; break;
      case BlockType.GOLD_PICKAXE: damage = 9; break;
      case BlockType.PICKAXE: damage = 8; break; // Pico de Piedra
      case BlockType.WOOD_PICKAXE: damage = 6; break;
      case BlockType.DIAMOND_SHOVEL: damage = 10; break;
      case BlockType.IRON_SHOVEL: damage = 8; break;
      case BlockType.GOLD_SHOVEL: damage = 7; break;
      case BlockType.SHOVEL: damage = 6; break; // Pala de Piedra
      case BlockType.WOOD_SHOVEL: damage = 5; break;
      default: damage = 4;
    }
    
    entityHealth.current -= damage;

    // Calculate realistic knockback away from player
    const pPos = playerPosRef.current;
    if (pPos) {
      const dx = data.pos.x - pPos.x;
      const dz = data.pos.z - pPos.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.01) {
        const kbFactor = data.type === EntityType.IRON_GOLEM ? 0.35 : 1.0;
        knockbackRef.current.x = (dx / len) * 7.5 * kbFactor;
        knockbackRef.current.z = (dz / len) * 7.5 * kbFactor;
        knockbackRef.current.y = 3.8 * kbFactor; // pop outwards
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

  // Register in global hit handlers map for 100% reliable melee assist and crosshair hits
  useEffect(() => {
    globalEntityHitHandlers.set(data.id, handleHit);
    return () => {
      globalEntityHitHandlers.delete(data.id);
    };
  }, [data.id]);

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
      const currentChunks = chunksRef.current;
      const mutated: Record<string, Uint8Array> = {};
      affectedCoords.forEach(({ wx, wy, wz }) => {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const k = `${cx},${cz}`;
        const base = mutated[k] || currentChunks[k];
        if (base) {
          const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
          const oldBlock = base[idx];
          if (!mutated[k]) {
            mutated[k] = new Uint8Array(base);
          }
          mutated[k][idx] = BlockType.AIR;

          if (editsRef.current) {
            editsRef.current[`${wx},${wy},${wz}`] = BlockType.AIR;
          }
          if (onBlockEditRef?.current && oldBlock !== BlockType.AIR) {
            onBlockEditRef.current(wx, wy, wz, BlockType.AIR, oldBlock, true);
          }
        }
      });

      const mutatedKeys = Object.keys(mutated);
      if (mutatedKeys.length > 0) {
        for (let i = 0; i < mutatedKeys.length; i++) {
          const mk = mutatedKeys[i];
          chunksRef.current[mk] = mutated[mk];
        }
        setChunks(prev => ({ ...prev, ...mutated }));
      }

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
        const gm = (gameState as any).gameMode;
        const isPlayerImmune = gm === 'creative' || gm === 'creativo' || gm === 'spectator' || gm === 'espectador';
        if (!isPlayerImmune) {
          const damage = Math.max(2, Math.round((4.8 - dist) * 3.2));
          gameState.setHealth(Math.max(0, gameState.health - damage));
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

    // Standard normalized vectors pointing to target (reusing scratch vector)
    ANIMAL_BOW_DIR.set(
      playerPos.x - headPos.x,
      playerPos.y + 0.35 - headPos.y,
      playerPos.z - headPos.z
    ).normalize();

    spawnArrow(headPos, ANIMAL_BOW_DIR);
  };

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const pPos = playerPosRef.current;
    if (!pPos || !checkSolidRef.current) return;

    const rawDelta = Math.min(delta, 0.1);
    const gm = (gameState as any).gameMode;
    const isPlayerImmune = gm === 'creative' || gm === 'creativo' || gm === 'spectator' || gm === 'espectador';

    // --- Entity Distance Culling & LOD Throttling ---
    const ddx = data.pos.x - pPos.x;
    const ddz = data.pos.z - pPos.z;
    const distSq = ddx * ddx + ddz * ddz;
    const simBlocks = (perfConfig?.simulationDistance ?? 2) * CHUNK_SIZE;
    const isHostileAny =
      data.type === EntityType.ZOMBIE ||
      data.type === EntityType.SKELETON ||
      data.type === EntityType.SNOW_SKELETON ||
      data.type === EntityType.SWAMP_SKELETON ||
      data.type === EntityType.CREEPER ||
      data.type === EntityType.ENDERMAN ||
      data.type === EntityType.HOGLIN ||
      data.type === EntityType.ZOMBIFIED_PIGLIN;
    const burnsInSun =
      data.type === EntityType.ZOMBIE ||
      data.type === EntityType.SKELETON ||
      data.type === EntityType.SNOW_SKELETON ||
      data.type === EntityType.SWAMP_SKELETON;

    if (distSq > simBlocks * simBlocks) {
      meshRef.current.visible = false;
      // Auto despawn far away hostile mobs to save performance
      const despawnLim = simBlocks + 32;
      if (isHostileAny && distSq > despawnLim * despawnLim) {
        removeEntity(data.id);
      }
      return;
    }
    meshRef.current.visible = true;

    // Distant mobs (>16 blocks) simulate every 3rd frame cleanly with accumulated delta
    accumDeltaRef.current += rawDelta;
    if (distSq > 256 && data.type !== EntityType.ARROW) {
      aiFrameSkipRef.current = (aiFrameSkipRef.current + 1) % 3;
      if (aiFrameSkipRef.current !== 0) return;
    }
    const minDelta = Math.min(accumDeltaRef.current, 0.12);
    accumDeltaRef.current = 0;

    const dist = Math.sqrt(distSq);

    const getBlockAtWorld = (bx: number, by: number, bz: number): BlockType => {
      if (!chunksRef?.current || by < 0 || by >= WORLD_HEIGHT) return BlockType.AIR;
      const chunk = chunksRef.current[`${Math.floor(bx / CHUNK_SIZE)},${Math.floor(bz / CHUNK_SIZE)}`];
      if (!chunk) return BlockType.AIR;
      const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk[(lx * CHUNK_SIZE * WORLD_HEIGHT) + (by * CHUNK_SIZE) + lz] as BlockType;
    };

    const isShelteredFromSky = (bx: number, posY: number, bz: number): boolean => {
      const nowPerf = performance.now();
      if (nowPerf - shelteredCacheRef.current.ts < 350) {
        return shelteredCacheRef.current.val;
      }
      const startY = Math.max(0, Math.round(posY + 1.2));
      const endY = Math.min(WORLD_HEIGHT - 1, Math.round(posY + 18));
      let sheltered = false;
      for (let y = startY; y <= endY; y++) {
        if (checkSolidRef.current(bx, y, bz)) {
          sheltered = true;
          break;
        }
      }
      shelteredCacheRef.current.ts = nowPerf;
      shelteredCacheRef.current.val = sheltered;
      return sheltered;
    };

    const curWeather = weatherRef?.current || 'clear';
    const isRainingNow = curWeather === 'rain' || curWeather === 'thunderstorm' || curWeather === 'snow_rain';
    const curBx = Math.round(data.pos.x);
    const curBz = Math.round(data.pos.z);
    const inWaterRightNow =
      getBlockAtWorld(curBx, Math.round(data.pos.y + 0.15), curBz) === BlockType.WATER ||
      getBlockAtWorld(curBx, Math.round(data.pos.y + 0.85), curBz) === BlockType.WATER;

    const isDay = Math.sin(gameTimeRef.current) > 0;
    const shouldBurnInSun =
      burnsInSun &&
      isDay &&
      !inWaterRightNow &&
      !isRainingNow &&
      !isShelteredFromSky(curBx, data.pos.y, curBz);

    if (shouldBurnInSun) {
      if (!isBurningRef.current) {
        isBurningRef.current = true;
        setIsBurning(true);
      }

      burnParticleTimerRef.current += minDelta;
      if (burnParticleTimerRef.current >= 0.16) {
        burnParticleTimerRef.current = 0;
        const baseId = Date.now() + Math.random();
        particlesRef.current.push(
          {
            id: baseId,
            x: data.pos.x + (Math.random() - 0.5) * 0.45,
            y: data.pos.y + 0.4 + Math.random() * 1.1,
            z: data.pos.z + (Math.random() - 0.5) * 0.45,
            vx: (Math.random() - 0.5) * 0.35,
            vy: 1.4 + Math.random() * 0.9,
            vz: (Math.random() - 0.5) * 0.35,
            color: Math.random() < 0.5 ? '#ff6d00' : '#ffab00',
            size: 0.12 + Math.random() * 0.08,
            life: 0.55
          },
          {
            id: baseId + 0.1,
            x: data.pos.x + (Math.random() - 0.5) * 0.4,
            y: data.pos.y + 1.1 + Math.random() * 0.5,
            z: data.pos.z + (Math.random() - 0.5) * 0.4,
            vx: (Math.random() - 0.5) * 0.25,
            vy: 1.7 + Math.random() * 0.7,
            vz: (Math.random() - 0.5) * 0.25,
            color: '#374151',
            size: 0.11,
            life: 0.65
          }
        );
      }

      burnDamageTimerRef.current += minDelta;
      if (burnDamageTimerRef.current >= 0.85) {
        burnDamageTimerRef.current = 0;
        entityHealth.current -= 4;
        setFlashRed(true);
        setTimeout(() => setFlashRed(false), 180);
        playHurtSound();
        if (entityHealth.current <= 0) {
          const ashParticles: any[] = [];
          const baseId = Date.now() + Math.random();
          for (let i = 0; i < 12; i++) {
            ashParticles.push({
              id: baseId + i,
              x: data.pos.x + (Math.random() - 0.5) * 0.5,
              y: data.pos.y + 0.5 + Math.random() * 0.9,
              z: data.pos.z + (Math.random() - 0.5) * 0.5,
              vx: (Math.random() - 0.5) * 1.4,
              vy: Math.random() * 1.6 + 0.6,
              vz: (Math.random() - 0.5) * 1.4,
              color: i % 2 === 0 ? '#ff6d00' : '#e5e7eb',
              size: 0.14,
              life: 0.6
            });
          }
          particlesRef.current.push(...ashParticles);
          removeEntity(data.id);
          return;
        }
      }
    } else if (isBurningRef.current) {
      isBurningRef.current = false;
      setIsBurning(false);
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
      if (checkSolidRef.current(Math.round(nextX), Math.round(nextY), Math.round(nextZ))) {
        removeEntity(data.id);
        return;
      }

      // Check player hits (arrows pass harmlessly through Creative/Spectator players)
      if (!isPlayerImmune) {
        const d3d = Math.sqrt(
          Math.pow(nextX - pPos.x, 2) +
          Math.pow(nextY - pPos.y, 2) +
          Math.pow(nextZ - pPos.z, 2)
        );

        if (d3d < 1.25) {
          gameState.setHealth(Math.max(0, gameState.health - 2));
          playHurtSound();
          removeEntity(data.id);
          return;
        }
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
    if (knockbackRef.current.x !== 0 || knockbackRef.current.z !== 0 || knockbackRef.current.y !== 0) {
      knockbackRef.current.x *= 0.84;
      knockbackRef.current.z *= 0.84;
      knockbackRef.current.y -= 15.0 * minDelta;
      if (Math.abs(knockbackRef.current.x) < 0.1) knockbackRef.current.x = 0;
      if (Math.abs(knockbackRef.current.z) < 0.1) knockbackRef.current.z = 0;
      if (knockbackRef.current.y < -15.0) knockbackRef.current.y = -15.0;
    }

    // AI Chasing vs Wandering
    let speed =
      data.type === EntityType.PIG || data.type === EntityType.SHEEP || data.type === EntityType.VILLAGER || data.type === EntityType.CHICKEN
        ? 0.85
        : data.type === EntityType.CAT || data.type === EntityType.WOLF || data.type === EntityType.FROG
          ? 1.2
          : 1.1;
    let targetRot = data.rot;
    let isAggro = false;

    // --- Chicken egg laying logic ---
    if (data.type === EntityType.CHICKEN) {
      if (!(data as any).lastEgg) {
        (data as any).lastEgg = state.clock.elapsedTime + Math.random() * 15;
      }
      if (state.clock.elapsedTime - (data as any).lastEgg > 25) {
        (data as any).lastEgg = state.clock.elapsedTime;
        const wx = Math.round(data.pos.x);
        const wy = Math.round(data.pos.y - 0.5);
        const wz = Math.round(data.pos.z);
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const k = `${cx},${cz}`;
        if (chunksRef.current[k]) {
          const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          if (wy >= 0 && wy < WORLD_HEIGHT) {
            const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
            if (chunksRef.current[k][idx] === BlockType.AIR) {
              const fresh = new Uint8Array(chunksRef.current[k]);
              fresh[idx] = BlockType.CHICKEN_EGG;
              chunksRef.current[k] = fresh;
              setChunks(prev => ({ ...prev, [k]: fresh }));
              if (editsRef.current) {
                editsRef.current[`${wx},${wy},${wz}`] = BlockType.CHICKEN_EGG;
              }
              if (onBlockEditRef?.current) {
                onBlockEditRef.current(wx, wy, wz, BlockType.CHICKEN_EGG, undefined, true);
              }
            }
          }
        }
      }
    }

    // --- Frog jumping logic ---
    if (data.type === EntityType.FROG) {
      if (Math.random() < 0.018 && Math.abs(velocityY.current) < 0.01) {
        velocityY.current = 5.2;
        data.rot += (Math.random() - 0.5) * 2;
      }
    }

    // --- Wolf follow logic ---
    if (data.type === EntityType.WOLF) {
      if (dist < 10) {
        isAggro = true;
        targetRot = Math.atan2(pPos.x - data.pos.x, pPos.z - data.pos.z);
        speed = dist < 2.5 ? 0 : 1.35;
      }
    }

    // --- Enderman teleport, water-fearing & attack logic (ignores Creative/Spectator players) ---
    let endermanWetPanic = false;
    if (data.type === EntityType.ENDERMAN) {
      endermanFleeCdRef.current = Math.max(0, endermanFleeCdRef.current - minDelta);

      const teleportEndermanToDryLand = (minRadius = 4, maxRadius = 11, preferSheltered = false): boolean => {
        for (let attempt = 0; attempt < 18; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const rDist = minRadius + Math.random() * (maxRadius - minRadius);
          const originX = preferSheltered ? data.pos.x : pPos.x;
          const originZ = preferSheltered ? data.pos.z : pPos.z;
          const tx = Math.round(originX + Math.cos(angle) * rDist);
          const tz = Math.round(originZ + Math.sin(angle) * rDist);
          const tInfo = getWorldHeight(tx, tz);
          if (tInfo.h < 56) continue;
          const groundBlockY = Math.round(tInfo.h);
          const ty = tInfo.h + 0.5;
          if (ty <= 0 || ty + 3.2 >= WORLD_HEIGHT) continue;

          // Ensure dry solid ground, no water at or around feet, and full 3.2-block vertical clearance
          const groundBlk = getBlockAtWorld(tx, groundBlockY, tz);
          if (groundBlk === BlockType.WATER || groundBlk === BlockType.LAVA || groundBlk === BlockType.AIR) continue;
          const hasDryClearance =
            !checkSolidRef.current(tx, groundBlockY + 1, tz) &&
            !checkSolidRef.current(tx, groundBlockY + 2, tz) &&
            !checkSolidRef.current(tx, groundBlockY + 3, tz) &&
            !checkSolidRef.current(tx, groundBlockY + 4, tz) &&
            getBlockAtWorld(tx, groundBlockY + 1, tz) !== BlockType.WATER &&
            getBlockAtWorld(tx, groundBlockY + 2, tz) !== BlockType.WATER &&
            getBlockAtWorld(tx + 1, groundBlockY + 1, tz) !== BlockType.WATER &&
            getBlockAtWorld(tx - 1, groundBlockY + 1, tz) !== BlockType.WATER &&
            getBlockAtWorld(tx, groundBlockY + 1, tz + 1) !== BlockType.WATER &&
            getBlockAtWorld(tx, groundBlockY + 1, tz - 1) !== BlockType.WATER;

          if (!hasDryClearance) continue;
          if (preferSheltered && attempt < 10 && !isShelteredFromSky(tx, ty, tz)) continue;

          const tpParticles: any[] = [];
          const baseId = Date.now() + Math.random();
          for (let i = 0; i < 10; i++) {
            tpParticles.push(
              {
                id: baseId + i,
                x: data.pos.x + (Math.random() - 0.5),
                y: data.pos.y + 1.2 + (Math.random() - 0.5),
                z: data.pos.z + (Math.random() - 0.5),
                vx: (Math.random() - 0.5) * 1.5,
                vy: Math.random() * 1.5,
                vz: (Math.random() - 0.5) * 1.5,
                color: '#d500f9',
                size: 0.12,
                life: 0.55
              },
              {
                id: baseId + 100 + i,
                x: tx + (Math.random() - 0.5),
                y: ty + 1.2 + (Math.random() - 0.5),
                z: tz + (Math.random() - 0.5),
                vx: (Math.random() - 0.5) * 1.5,
                vy: Math.random() * 1.5,
                vz: (Math.random() - 0.5) * 1.5,
                color: '#d500f9',
                size: 0.12,
                life: 0.6
              }
            );
          }
          particlesRef.current.push(...tpParticles);
          data.pos.x = tx;
          data.pos.y = ty;
          data.pos.z = tz;
          velocityY.current = 0;
          return true;
        }
        return false;
      };

      const isTouchWater =
        inWaterRightNow ||
        getBlockAtWorld(curBx, Math.round(data.pos.y - 0.15), curBz) === BlockType.WATER ||
        getBlockAtWorld(curBx, Math.round(data.pos.y + 1.6), curBz) === BlockType.WATER;
      const isWetByRain = isRainingNow && !isShelteredFromSky(curBx, data.pos.y, curBz);

      if (isTouchWater || isWetByRain) {
        endermanWetPanic = true;
        (data as any).isAngry = false;
        isAggro = false;
        speed = 2.6;

        // Tremble & panic hop away from water
        if (velocityY.current <= 0.05) {
          velocityY.current = 4.6;
        }

        waterParticleTimerRef.current += minDelta;
        if (waterParticleTimerRef.current >= 0.14) {
          waterParticleTimerRef.current = 0;
          const pid = Date.now() + Math.random();
          particlesRef.current.push(
            {
              id: pid,
              x: data.pos.x + (Math.random() - 0.5) * 0.6,
              y: data.pos.y + 0.6 + Math.random() * 1.8,
              z: data.pos.z + (Math.random() - 0.5) * 0.6,
              vx: (Math.random() - 0.5) * 1.4,
              vy: 1.5 + Math.random(),
              vz: (Math.random() - 0.5) * 1.4,
              color: '#d500f9',
              size: 0.13,
              life: 0.5
            },
            {
              id: pid + 0.2,
              x: data.pos.x + (Math.random() - 0.5) * 0.5,
              y: data.pos.y + 0.2 + Math.random() * 0.5,
              z: data.pos.z + (Math.random() - 0.5) * 0.5,
              vx: (Math.random() - 0.5) * 1.2,
              vy: 1.0 + Math.random() * 0.6,
              vz: (Math.random() - 0.5) * 1.2,
              color: '#38bdf8',
              size: 0.11,
              life: 0.45
            }
          );
        }

        waterDamageTimerRef.current += minDelta;
        if (waterDamageTimerRef.current >= 0.55) {
          waterDamageTimerRef.current = 0;
          entityHealth.current -= 4;
          setFlashRed(true);
          setTimeout(() => setFlashRed(false), 180);
          playHurtSound();

          if (entityHealth.current <= 0) {
            removeEntity(data.id);
            return;
          }
          // Immediately teleport onto dry land (or under cover if raining)
          teleportEndermanToDryLand(4, 13, isWetByRain);
        }
      } else {
        if (isPlayerImmune) {
          (data as any).isAngry = false;
        } else {
          const isAngry = dist < 11 && ((data as any).isAngry || Math.random() < 0.03);
          if (isAngry) {
            (data as any).isAngry = true;
            isAggro = true;
            targetRot = Math.atan2(pPos.x - data.pos.x, pPos.z - data.pos.z);
            speed = 2.05;

            if (!(data as any).lastTeleport) (data as any).lastTeleport = state.clock.elapsedTime;
            if (state.clock.elapsedTime - (data as any).lastTeleport > 5.5 && Math.random() < 0.28) {
              (data as any).lastTeleport = state.clock.elapsedTime;
              teleportEndermanToDryLand(4, 8.5, false);
            }
          }
        }

        // Proactive water aversion: scan ahead for lakes/rivers/water blocks and turn away BEFORE stepping in
        const scanYaw = isAggro ? targetRot : data.rot;
        const fwdX = Math.sin(scanYaw);
        const fwdZ = Math.cos(scanYaw);
        let seesWaterAhead = false;
        for (let step = 1; step <= 3; step++) {
          const sx = Math.round(data.pos.x + fwdX * step);
          const sz = Math.round(data.pos.z + fwdZ * step);
          const syFloor = Math.round(data.pos.y - 0.5);
          const syBody = Math.round(data.pos.y + 0.3);
          if (
            getBlockAtWorld(sx, syFloor, sz) === BlockType.WATER ||
            getBlockAtWorld(sx, syBody, sz) === BlockType.WATER
          ) {
            seesWaterAhead = true;
            break;
          }
        }

        if (seesWaterAhead) {
          if (isAggro && endermanFleeCdRef.current <= 0) {
            // Do not walk into water to reach player — freeze at shore or teleport onto dry ground
            speed = 0;
            endermanFleeCdRef.current = 1.6;
            teleportEndermanToDryLand(4, 9, false);
          } else {
            // Turn sharply away from the water while wandering
            data.rot += Math.PI * 0.85;
            targetRot = data.rot;
            speed = 0.2;
          }
        }
      }
    }

    // --- Zombified Piglin neutral/hostile logic (ignores Creative/Spectator players) ---
    if (data.type === EntityType.ZOMBIFIED_PIGLIN) {
      if (isPlayerImmune) {
        (data as any).isAngry = false;
      } else {
        const isAngry = (data as any).isAngry;
        if (isAngry && dist < 16) {
          isAggro = true;
          targetRot = Math.atan2(pPos.x - data.pos.x, pPos.z - data.pos.z);
          speed = 1.85;
        }
      }
    }

    // --- Iron Golem defender logic ---
    if (data.type === EntityType.IRON_GOLEM && entitiesRef?.current) {
      const nowPerf = performance.now();
      let nearestHostile: EntityData | null = null;
      let minHDist = 16;
      const entMap = entitiesRef.current;
      if (nowPerf - golemScanCacheRef.current.ts >= 250 || !golemScanCacheRef.current.targetId) {
        golemScanCacheRef.current.ts = nowPerf;
        for (const ek in entMap) {
          const list = entMap[ek];
          if (!Array.isArray(list)) continue;
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (
              e.id !== data.id &&
              (e.type === EntityType.ZOMBIE ||
                e.type === EntityType.SKELETON ||
                e.type === EntityType.CREEPER ||
                e.type === EntityType.ZOMBIFIED_PIGLIN ||
                e.type === EntityType.SNOW_SKELETON ||
                e.type === EntityType.SWAMP_SKELETON)
            ) {
              const hdx = e.pos.x - data.pos.x;
              const hdz = e.pos.z - data.pos.z;
              const hdistSq = hdx * hdx + hdz * hdz;
              if (hdistSq < minHDist * minHDist) {
                minHDist = Math.sqrt(hdistSq);
                nearestHostile = e;
              }
            }
          }
        }
        golemScanCacheRef.current.targetId = nearestHostile ? nearestHostile.id : null;
      } else if (golemScanCacheRef.current.targetId) {
        const cachedId = golemScanCacheRef.current.targetId;
        for (const ek in entMap) {
          const list = entMap[ek];
          if (!Array.isArray(list)) continue;
          for (let i = 0; i < list.length; i++) {
            if (list[i].id === cachedId) {
              const e = list[i];
              const hdx = e.pos.x - data.pos.x;
              const hdz = e.pos.z - data.pos.z;
              const hdist = Math.sqrt(hdx * hdx + hdz * hdz);
              if (hdist < minHDist) {
                minHDist = hdist;
                nearestHostile = e;
              }
              break;
            }
          }
          if (nearestHostile) break;
        }
      }

      if (nearestHostile) {
        const hostile: EntityData = nearestHostile;
        isAggro = true;
        targetRot = Math.atan2(hostile.pos.x - data.pos.x, hostile.pos.z - data.pos.z);
        speed = 1.65;

        if (minHDist < 2.0) {
          if (!(data as any).lastAttackTime) (data as any).lastAttackTime = 0;
          if (state.clock.elapsedTime - (data as any).lastAttackTime > 0.9) {
            (data as any).lastAttackTime = state.clock.elapsedTime;
            playHurtSound();
            (hostile as any)._golemHits = ((hostile as any)._golemHits || 0) + 1;
            if ((hostile as any)._golemHits >= 2) {
              removeEntity(hostile.id);
            }
          }
        }
      }
    }

    if (data.type === EntityType.CAT) {
      if (state.clock.elapsedTime - lastSoundPlayRef.current > 12 && Math.random() < 0.04) {
        playCatSound();
        lastSoundPlayRef.current = state.clock.elapsedTime;
      }
    }

    // --- Hoglin logic (ignores Creative/Spectator players) ---
    if (data.type === EntityType.HOGLIN) {
      if (!isPlayerImmune && dist < 18) {
        isAggro = true;
        targetRot = Math.atan2(pPos.x - data.pos.x, pPos.z - data.pos.z);
        speed = 2.15;
      }
    }

    // --- Hostile Overworld Mobs (ignores Creative/Spectator players completely) ---
    if (
      data.type === EntityType.ZOMBIE ||
      data.type === EntityType.CREEPER ||
      data.type === EntityType.SKELETON ||
      data.type === EntityType.SNOW_SKELETON ||
      data.type === EntityType.SWAMP_SKELETON
    ) {
      if (!isPlayerImmune && dist < 16) {
        isAggro = true;
        targetRot = Math.atan2(pPos.x - data.pos.x, pPos.z - data.pos.z);

        if (data.type === EntityType.ZOMBIE) {
          speed = 1.5;
          if (state.clock.elapsedTime - lastSoundPlayRef.current > 8 && Math.random() < 0.05) {
            playZombieSound();
            lastSoundPlayRef.current = state.clock.elapsedTime;
          }
        } else if (data.type === EntityType.CREEPER) {
          if (dist <= 2.8) {
            speed = 0;
            if (!fuseActiveRef.current) {
              fuseActiveRef.current = true;
              setFusePulse(true);
              playCreeperSizzle();
            }
            fuseTimerRef.current += minDelta;
            if (fuseTimerRef.current >= 1.5) {
              explodeCreeper();
              return;
            }
          } else {
            if (fuseActiveRef.current && dist > 4.0) {
              fuseActiveRef.current = false;
              fuseTimerRef.current = 0;
              setFusePulse(false);
            }
            speed = 1.65;
          }
        } else {
          // Skeleton, Snow Skeleton, Swamp Skeleton
          if (dist < 6.5) {
            speed = -0.65;
          } else if (dist <= 11.5) {
            speed = 0;
          } else {
            speed = 1.25;
          }

          skCooldownRef.current -= minDelta;
          if (skCooldownRef.current <= 0) {
            skCooldownRef.current = 2.1 + Math.random() * 0.4;
            shootBow();
          }
        }
      } else {
        if (fuseActiveRef.current) {
          fuseActiveRef.current = false;
          fuseTimerRef.current = 0;
          setFusePulse(false);
        }
      }
    }

    // Resolve facing yaw before collision sweep so rotated entity extent never clips through blocks
    if (!isAggro) {
      if (Math.random() < 0.006) {
        data.rot += (Math.random() - 0.5) * 3;
      }
      targetRot = data.rot;
    } else {
      data.rot = targetRot;
    }

    let yawRotDiff = targetRot - meshRef.current.rotation.y;
    while (yawRotDiff > Math.PI) yawRotDiff -= Math.PI * 2;
    while (yawRotDiff < -Math.PI) yawRotDiff += Math.PI * 2;
    const nextYaw = meshRef.current.rotation.y + yawRotDiff * Math.min(1, minDelta * 10);
    meshRef.current.rotation.y = nextYaw;

    // Entity oriented physical AABB extents at current rendered yaw
    const cosY = Math.cos(nextYaw);
    const sinY = Math.sin(nextYaw);
    const absCos = Math.abs(cosY);
    const absSin = Math.abs(sinY);
    const minOffX = -bounds.halfW * absCos + Math.min(bounds.halfFront * sinY, -bounds.halfBack * sinY);
    const maxOffX = bounds.halfW * absCos + Math.max(bounds.halfFront * sinY, -bounds.halfBack * sinY);
    const minOffZ = -bounds.halfW * absSin + Math.min(bounds.halfFront * cosY, -bounds.halfBack * cosY);
    const maxOffZ = bounds.halfW * absSin + Math.max(bounds.halfFront * cosY, -bounds.halfBack * cosY);

    // Subtle swim buoyancy when inside lakes/seas (Endermen hate water and never calmly swim!)
    let isInWater = false;
    if (chunksRef?.current && data.type !== EntityType.ENDERMAN) {
      const wwx = Math.round(data.pos.x);
      const wwy = Math.round(data.pos.y + 0.25);
      const wwz = Math.round(data.pos.z);
      const wChunk = chunksRef.current[`${Math.floor(wwx / CHUNK_SIZE)},${Math.floor(wwz / CHUNK_SIZE)}`];
      if (wChunk && wwy >= 0 && wwy < WORLD_HEIGHT) {
        const wlx = ((wwx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const wlz = ((wwz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (wChunk[(wlx * CHUNK_SIZE * WORLD_HEIGHT) + (wwy * CHUNK_SIZE) + wlz] === BlockType.WATER) {
          isInWater = true;
          velocityY.current = Math.max(velocityY.current, 1.9);
          if (!isAggro && data.type !== EntityType.FROG && Math.random() < 0.08) {
            data.rot += Math.PI * 0.75;
          }
        }
      }
    }

    // Apply movement velocities
    let dx = Math.sin(targetRot) * speed * minDelta + knockbackRef.current.x * minDelta;
    let dz = Math.cos(targetRot) * speed * minDelta + knockbackRef.current.z * minDelta;

    velocityY.current = Math.max(-28, velocityY.current - 25.0 * minDelta);
    let dy = (velocityY.current + knockbackRef.current.y) * minDelta;

    let px = data.pos.x;
    let py = data.pos.y;
    let pz = data.pos.z;

    // Step 1: De-penetrate if entity spawned/rotated into any solid block
    {
      const curMinX = px + minOffX;
      const curMaxX = px + maxOffX;
      const curMinY = py;
      const curMaxY = py + bounds.height;
      const curMinZ = pz + minOffZ;
      const curMaxZ = pz + maxOffZ;

      const sBx0 = Math.floor(curMinX + 0.5 + 1e-4);
      const sBx1 = Math.floor(curMaxX + 0.5 - 1e-4);
      const sBy0 = Math.floor(curMinY + 0.5 + 0.04);
      const sBy1 = Math.floor(curMaxY + 0.5 - 0.04);
      const sBz0 = Math.floor(curMinZ + 0.5 + 1e-4);
      const sBz1 = Math.floor(curMaxZ + 0.5 - 1e-4);

      for (let bx = sBx0; bx <= sBx1; bx++) {
        for (let by = sBy0; by <= sBy1; by++) {
          for (let bz = sBz0; bz <= sBz1; bz++) {
            if (!checkSolidRef.current(bx, by, bz)) continue;
            const eMinX = px + minOffX;
            const eMaxX = px + maxOffX;
            const eMinY = py;
            const eMaxY = py + bounds.height;
            const eMinZ = pz + minOffZ;
            const eMaxZ = pz + maxOffZ;

            const bMinX = bx - 0.5, bMaxX = bx + 0.5;
            const bMinY = by - 0.5, bMaxY = by + 0.5;
            const bMinZ = bz - 0.5, bMaxZ = bz + 0.5;

            if (eMaxX <= bMinX + 1e-4 || eMinX >= bMaxX - 1e-4 ||
                eMaxY <= bMinY + 0.02 || eMinY >= bMaxY - 0.02 ||
                eMaxZ <= bMinZ + 1e-4 || eMinZ >= bMaxZ - 1e-4) {
              continue;
            }

            const pushLeft = bMinX - eMaxX - 0.002;
            const pushRight = bMaxX - eMinX + 0.002;
            const pushX = Math.abs(pushLeft) < Math.abs(pushRight) ? pushLeft : pushRight;

            const pushBack = bMinZ - eMaxZ - 0.002;
            const pushFront = bMaxZ - eMinZ + 0.002;
            const pushZ = Math.abs(pushBack) < Math.abs(pushFront) ? pushBack : pushFront;

            if (Math.abs(pushX) <= Math.abs(pushZ)) {
              px += pushX;
            } else {
              pz += pushZ;
            }
          }
        }
      }
    }

    // Step 2: Populate pre-allocated solid voxel pool along full swept volume
    let eMinX = px + minOffX;
    let eMaxX = px + maxOffX;
    let eMinY = py;
    let eMaxY = py + bounds.height;
    let eMinZ = pz + minOffZ;
    let eMaxZ = pz + maxOffZ;

    let blockCount = 0;
    const minBx = Math.floor(Math.min(eMinX, eMinX + dx) - 0.5);
    const maxBx = Math.floor(Math.max(eMaxX, eMaxX + dx) + 1.5);
    const minBy = Math.floor(Math.min(eMinY, eMinY + dy) - 0.5);
    const maxBy = Math.floor(Math.max(eMaxY, eMaxY + dy) + 2.5);
    const minBz = Math.floor(Math.min(eMinZ, eMinZ + dz) - 0.5);
    const maxBz = Math.floor(Math.max(eMaxZ, eMaxZ + dz) + 1.5);

    for (let bx = minBx; bx <= maxBx && blockCount < ENTITY_BOX_POOL.length; bx++) {
      for (let by = minBy; by <= maxBy && blockCount < ENTITY_BOX_POOL.length; by++) {
        for (let bz = minBz; bz <= maxBz && blockCount < ENTITY_BOX_POOL.length; bz++) {
          if (checkSolidRef.current(bx, by, bz)) {
            const box = ENTITY_BOX_POOL[blockCount++];
            box.minX = bx - 0.5;
            box.minY = by - 0.5;
            box.minZ = bz - 0.5;
            box.maxX = bx + 0.5;
            box.maxY = by + 0.5;
            box.maxZ = bz + 0.5;
          }
        }
      }
    }

    const eps = 0.001;
    const origDx = dx;
    const origDy = dy;
    const origDz = dz;

    // Axis 1: Vertical Y sweep (floors & ceilings)
    for (let i = 0; i < blockCount; i++) {
      const b = ENTITY_BOX_POOL[i];
      if (eMaxX > b.minX + eps && eMinX < b.maxX - eps && eMaxZ > b.minZ + eps && eMinZ < b.maxZ - eps) {
        if (dy > 0 && eMaxY <= b.minY + 0.35) {
          dy = Math.min(dy, b.minY - eMaxY - eps);
        } else if (dy < 0 && eMinY >= b.maxY - 0.35) {
          dy = Math.max(dy, b.maxY - eMinY + eps);
        }
      }
    }
    eMinY += dy;
    eMaxY += dy;

    let isGrounded = isInWater;
    if (origDy < 0 && dy > origDy + 1e-5) {
      velocityY.current = 0;
      isGrounded = true;
    } else if (origDy > 0 && dy < origDy - 1e-5) {
      velocityY.current = 0;
    }

    // Axis 2: Horizontal X sweep
    for (let i = 0; i < blockCount; i++) {
      const b = ENTITY_BOX_POOL[i];
      if (eMaxY > b.minY + 0.01 && eMinY < b.maxY - 0.01 && eMaxZ > b.minZ + eps && eMinZ < b.maxZ - eps) {
        if (dx > 0 && eMaxX <= b.minX + 0.4) {
          dx = Math.min(dx, b.minX - eMaxX - eps);
        } else if (dx < 0 && eMinX >= b.maxX - 0.4) {
          dx = Math.max(dx, b.maxX - eMinX + eps);
        }
      }
    }
    eMinX += dx;
    eMaxX += dx;

    // Axis 3: Horizontal Z sweep
    for (let i = 0; i < blockCount; i++) {
      const b = ENTITY_BOX_POOL[i];
      if (eMaxY > b.minY + 0.01 && eMinY < b.maxY - 0.01 && eMaxX > b.minX + eps && eMinX < b.maxX - eps) {
        if (dz > 0 && eMaxZ <= b.minZ + 0.4) {
          dz = Math.min(dz, b.minZ - eMaxZ - eps);
        } else if (dz < 0 && eMinZ >= b.maxZ - 0.4) {
          dz = Math.max(dz, b.maxZ - eMinZ + eps);
        }
      }
    }
    eMinZ += dz;
    eMaxZ += dz;

    const nextX = px + dx;
    const nextY = eMinY;
    const nextZ = pz + dz;

    const blockedX = Math.abs(origDx) > 1e-4 && Math.abs(dx - origDx) > 1e-4;
    const blockedZ = Math.abs(origDz) > 1e-4 && Math.abs(dz - origDz) > 1e-4;

    if (blockedX || blockedZ) {
      if (isGrounded) {
        // Test if stepping up 1 block at attempted target clears full entity height & footprint
        const stepMinX = px + origDx + minOffX + 0.02;
        const stepMaxX = px + origDx + maxOffX - 0.02;
        const stepMinY = nextY + 1.02;
        const stepMaxY = stepMinY + bounds.height;
        const stepMinZ = pz + origDz + minOffZ + 0.02;
        const stepMaxZ = pz + origDz + maxOffZ - 0.02;

        let canStepJump = true;
        const sbX0 = Math.floor(stepMinX + 0.5 + 1e-4);
        const sbX1 = Math.floor(stepMaxX + 0.5 - 1e-4);
        const sbY0 = Math.floor(stepMinY + 0.5 + 1e-4);
        const sbY1 = Math.floor(stepMaxY + 0.5 - 1e-4);
        const sbZ0 = Math.floor(stepMinZ + 0.5 + 1e-4);
        const sbZ1 = Math.floor(stepMaxZ + 0.5 - 1e-4);
        for (let bx = sbX0; bx <= sbX1 && canStepJump; bx++) {
          for (let by = sbY0; by <= sbY1 && canStepJump; by++) {
            for (let bz = sbZ0; bz <= sbZ1 && canStepJump; bz++) {
              if (checkSolidRef.current(bx, by, bz)) {
                canStepJump = false;
              }
            }
          }
        }
        if (canStepJump && velocityY.current <= 0.1) {
          velocityY.current = 7.8;
        } else if (!isAggro) {
          data.rot += Math.PI * 0.55;
        }
      } else if (!isAggro) {
        data.rot += Math.PI * 0.55;
      }
    }

    data.pos.x = nextX;
    data.pos.y = nextY;
    data.pos.z = nextZ;

    meshRef.current.position.set(
      nextX + (endermanWetPanic ? (Math.random() - 0.5) * 0.09 : 0),
      nextY,
      nextZ + (endermanWetPanic ? (Math.random() - 0.5) * 0.09 : 0)
    );

    // Subtle grounded walk bob, procedural limb gait, & Creeper swell (feet stay grounded)
    const moveMag = Math.sqrt(dx * dx + dz * dz);
    const isMoving = isGrounded && moveMag > 0.0005;
    const targetAmp = isMoving ? 1 : 0;
    animAmpRef.current += (targetAmp - animAmpRef.current) * Math.min(1, minDelta * 12);
    if (isMoving) {
      animPhaseRef.current += Math.min(0.55, moveMag * 15.0 + minDelta * 3.8);
    }

    const elapsed = state.clock.elapsedTime;
    const swing = Math.sin(animPhaseRef.current) * animAmpRef.current;
    const idleBreath = Math.sin(elapsed * 2.6 + (data.pos.x + data.pos.z) * 0.5);

    const walkAnim = isMoving ? Math.abs(Math.sin(animPhaseRef.current)) * 0.022 : 0;
    meshRef.current.position.y += walkAnim;
    meshRef.current.rotation.z = isMoving ? Math.sin(animPhaseRef.current) * 0.026 : 0;

    if (headGroupRef.current) {
      if (data.type === EntityType.CHICKEN) {
        headGroupRef.current.rotation.x = Math.sin(elapsed * 4.2) * 0.09 + swing * 0.08;
      } else {
        headGroupRef.current.rotation.x = idleBreath * 0.04;
      }
    }

    if (data.type === EntityType.FROG) {
      const jumpKick = !isGrounded ? 0.72 : 0;
      if (limbBLRef.current) limbBLRef.current.rotation.x = jumpKick + swing * 0.3;
      if (limbBRRef.current) limbBRRef.current.rotation.x = jumpKick + swing * 0.3;
      if (limbFLRef.current) limbFLRef.current.rotation.x = -jumpKick * 0.45 - swing * 0.25;
      if (limbFRRef.current) limbFRRef.current.rotation.x = -jumpKick * 0.45 + swing * 0.25;
    } else if (data.type === EntityType.CHICKEN) {
      if (limbFLRef.current) limbFLRef.current.rotation.x = swing * 0.7;
      if (limbFRRef.current) limbFRRef.current.rotation.x = -swing * 0.7;
      const wingFlap = !isGrounded
        ? Math.sin(elapsed * 26) * 0.8 + 0.55
        : Math.abs(swing) * 0.32 + Math.max(0, idleBreath) * 0.06;
      if (armLRef.current) armLRef.current.rotation.z = wingFlap;
      if (armRRef.current) armRRef.current.rotation.z = -wingFlap;
    } else {
      // Quadrupeds (diagonal gait when BL/BR exist) & Bipeds (FL/FR legs + armL/armR swing)
      if (limbFLRef.current) limbFLRef.current.rotation.x = swing * 0.58;
      if (limbFRRef.current) limbFRRef.current.rotation.x = -swing * 0.58;
      if (limbBLRef.current) limbBLRef.current.rotation.x = -swing * 0.58;
      if (limbBRRef.current) limbBRRef.current.rotation.x = swing * 0.58;

      if (data.type === EntityType.ZOMBIE) {
        if (armLRef.current) armLRef.current.rotation.x = -Math.PI * 0.48 + swing * 0.14 + idleBreath * 0.05;
        if (armRRef.current) armRRef.current.rotation.x = -Math.PI * 0.48 - swing * 0.14 - idleBreath * 0.05;
      } else if (data.type === EntityType.SKELETON || data.type === EntityType.SNOW_SKELETON || data.type === EntityType.SWAMP_SKELETON) {
        if (armLRef.current) armLRef.current.rotation.x = -Math.PI * 0.44 + idleBreath * 0.04;
        if (armRRef.current) armRRef.current.rotation.x = -Math.PI * 0.48 + swing * 0.08;
      } else if (data.type === EntityType.IRON_GOLEM) {
        if (armLRef.current) armLRef.current.rotation.x = -swing * 0.68;
        if (armRRef.current) armRRef.current.rotation.x = swing * 0.68;
      } else if (data.type === EntityType.ENDERMAN) {
        const rageLift = (data as any).isAngry ? -0.35 : 0;
        if (armLRef.current) armLRef.current.rotation.x = rageLift - swing * 0.36 + idleBreath * 0.05;
        if (armRRef.current) armRRef.current.rotation.x = rageLift + swing * 0.36 - idleBreath * 0.05;
      } else if (data.type === EntityType.ZOMBIFIED_PIGLIN) {
        if (armLRef.current) armLRef.current.rotation.x = -Math.PI * 0.25 + swing * 0.45;
        if (armRRef.current) armRRef.current.rotation.x = -Math.PI * 0.38 - swing * 0.45;
      } else {
        if (armLRef.current) armLRef.current.rotation.x = -swing * 0.5;
        if (armRRef.current) armRRef.current.rotation.x = swing * 0.5;
      }
    }

    if (tailRef.current) {
      if (data.type === EntityType.CAT || data.type === EntityType.WOLF) {
        tailRef.current.rotation.y = Math.sin(elapsed * 6.5 + data.pos.x) * 0.28 + swing * 0.18;
      } else if (data.type === EntityType.PIG || data.type === EntityType.HOGLIN) {
        tailRef.current.rotation.z = Math.sin(elapsed * 8) * 0.2 + swing * 0.22;
      }
    }

    if (data.type === EntityType.CREEPER && fuseActiveRef.current) {
      const swell = 1 + Math.abs(Math.sin(fuseTimerRef.current * 20)) * 0.14;
      meshRef.current.scale.set(swell, swell * 0.96, swell);
    } else {
      meshRef.current.scale.set(1, 1, 1);
    }

    // Melee contact hits (ONLY when player is NOT in Creative/Spectator mode!)
    if (!isPlayerImmune) {
      const isZombieHit = data.type === EntityType.ZOMBIE && dist < 1.25;
      const isHoglinHit = data.type === EntityType.HOGLIN && dist < 1.5;
      const isEndermanHit = data.type === EntityType.ENDERMAN && (data as any).isAngry && dist < 1.4;
      const isPiglinHit = data.type === EntityType.ZOMBIFIED_PIGLIN && (data as any).isAngry && dist < 1.3;
      const isSkelMelee =
        (data.type === EntityType.SKELETON || data.type === EntityType.SNOW_SKELETON || data.type === EntityType.SWAMP_SKELETON) &&
        dist < 1.05;

      if (isZombieHit || isHoglinHit || isEndermanHit || isPiglinHit || isSkelMelee) {
        attackCooldownRef.current -= minDelta;
        if (attackCooldownRef.current <= 0) {
          attackCooldownRef.current = isHoglinHit ? 1.15 : 1.0;
          const meleeDmg = isHoglinHit || isEndermanHit ? 4 : isSkelMelee ? 2 : 3;
          gameState.setHealth(Math.max(0, gameState.health - meleeDmg));
          playHurtSound();
        }
      } else if (attackCooldownRef.current > 0) {
        attackCooldownRef.current -= minDelta;
      }
    } else if (attackCooldownRef.current > 0) {
      attackCooldownRef.current -= minDelta;
    }
  });

  const bodyColor =
    flashRed
      ? '#ff2020'
      : data.type === EntityType.CREEPER && fusePulse
        ? '#c8facc'
        : data.type === EntityType.PIG
          ? '#ffafaf'
          : data.type === EntityType.SHEEP
            ? '#ffffff'
            : '#307030';

  // Render model based on EntityType
  return (
    <group 
      ref={meshRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        handleHit();
      }}
    >
      {/* Hitbox matched tightly to entity collision bounds so clicks never clip through walls or floors */}
      <mesh
        position={[0, hitbox.centerY, hitbox.centerZ]}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleHit();
        }}
      >
        <boxGeometry args={[hitbox.width, hitbox.height, hitbox.depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Visible 3D Fire Aura when Zombie/Skeleton is burning in daylight */}
      {isBurning && (
        <group>
          <mesh position={[0, 0.72, 0.22]}>
            <boxGeometry args={[0.38, 0.95, 0.08]} />
            <meshBasicMaterial color="#ff6d00" transparent opacity={0.82} />
          </mesh>
          <mesh position={[0, 0.78, -0.22]}>
            <boxGeometry args={[0.38, 0.9, 0.08]} />
            <meshBasicMaterial color="#ff9100" transparent opacity={0.8} />
          </mesh>
          <mesh position={[-0.24, 0.7, 0]}>
            <boxGeometry args={[0.08, 0.85, 0.36]} />
            <meshBasicMaterial color="#ffab00" transparent opacity={0.78} />
          </mesh>
          <mesh position={[0.24, 0.7, 0]}>
            <boxGeometry args={[0.08, 0.85, 0.36]} />
            <meshBasicMaterial color="#ff6d00" transparent opacity={0.78} />
          </mesh>
          <mesh position={[0, 1.38, 0]}>
            <boxGeometry args={[0.42, 0.45, 0.42]} />
            <meshBasicMaterial color="#ffd54f" transparent opacity={0.55} />
          </mesh>
        </group>
      )}

      {/* 1. Pig Render Model */}
      {data.type === EntityType.PIG && (
        <group position={[0, 0, 0]}>
          {/* Cuerpo con lomo y vientre esculpidos */}
          <mesh position={[0, 0.49, 0]}>
            <boxGeometry args={[0.60, 0.48, 0.86]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0, 0.735, -0.02]}>
            <boxGeometry args={[0.48, 0.04, 0.74]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#f48fb1'} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <boxGeometry args={[0.48, 0.06, 0.72]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#e895a0'} />
          </mesh>
          {/* Cabeza animada */}
          <group ref={headGroupRef} position={[0, 0.58, 0.40]}>
            <mesh position={[0, 0.02, 0.12]}>
              <boxGeometry args={[0.42, 0.40, 0.40]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
            {/* Orejas caídas con interior */}
            <mesh position={[-0.22, 0.11, 0.06]} rotation={[0.1, 0, 0.28]}>
              <boxGeometry args={[0.06, 0.14, 0.12]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f48fb1'} />
            </mesh>
            <mesh position={[0.22, 0.11, 0.06]} rotation={[0.1, 0, -0.28]}>
              <boxGeometry args={[0.06, 0.14, 0.12]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f48fb1'} />
            </mesh>
            {/* Cejas */}
            <mesh position={[-0.13, 0.13, 0.322]}>
              <boxGeometry args={[0.10, 0.03, 0.02]} />
              <meshStandardMaterial color="#e58090" />
            </mesh>
            <mesh position={[0.13, 0.13, 0.322]}>
              <boxGeometry args={[0.10, 0.03, 0.02]} />
              <meshStandardMaterial color="#e58090" />
            </mesh>
            {/* Ojos */}
            <mesh position={[-0.14, 0.06, 0.321]}>
              <boxGeometry args={[0.085, 0.08, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[-0.115, 0.06, 0.324]}>
              <boxGeometry args={[0.04, 0.05, 0.02]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0.14, 0.06, 0.321]}>
              <boxGeometry args={[0.085, 0.08, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0.115, 0.06, 0.324]}>
              <boxGeometry args={[0.04, 0.05, 0.02]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            {/* Hocico 3D con borde y fosas */}
            <mesh position={[0, -0.05, 0.345]}>
              <boxGeometry args={[0.21, 0.13, 0.07]} />
              <meshStandardMaterial color="#ff8598" />
            </mesh>
            <mesh position={[0, -0.05, 0.376]}>
              <boxGeometry args={[0.19, 0.11, 0.015]} />
              <meshStandardMaterial color="#f06292" />
            </mesh>
            <mesh position={[-0.05, -0.04, 0.384]}>
              <boxGeometry args={[0.038, 0.045, 0.01]} />
              <meshStandardMaterial color="#7a1b3c" />
            </mesh>
            <mesh position={[0.05, -0.04, 0.384]}>
              <boxGeometry args={[0.038, 0.045, 0.01]} />
              <meshStandardMaterial color="#7a1b3c" />
            </mesh>
          </group>
          {/* Colita rizada animada */}
          <group ref={tailRef} position={[0, 0.56, -0.43]}>
            <mesh position={[0, 0.02, -0.04]} rotation={[0.45, 0, 0.35]}>
              <boxGeometry args={[0.065, 0.11, 0.065]} />
              <meshStandardMaterial color="#f48fb1" />
            </mesh>
            <mesh position={[0.03, 0.08, -0.06]} rotation={[-0.3, 0, -0.4]}>
              <boxGeometry args={[0.05, 0.06, 0.05]} />
              <meshStandardMaterial color="#ec407a" />
            </mesh>
          </group>
          {/* Patas articuladas con pezuñas */}
          {[
            { ref: limbFLRef, pos: [-0.19, 0.30, 0.28] as [number, number, number] },
            { ref: limbFRRef, pos: [0.19, 0.30, 0.28] as [number, number, number] },
            { ref: limbBLRef, pos: [-0.19, 0.30, -0.28] as [number, number, number] },
            { ref: limbBRRef, pos: [0.19, 0.30, -0.28] as [number, number, number] }
          ].map((leg, i) => (
            <group key={`pig-leg-${i}`} ref={leg.ref} position={leg.pos}>
              <mesh position={[0, -0.12, 0]}>
                <boxGeometry args={[0.15, 0.24, 0.15]} />
                <meshStandardMaterial color={flashRed ? '#ff2020' : '#e09090'} />
              </mesh>
              <mesh position={[0, -0.27, 0]}>
                <boxGeometry args={[0.158, 0.06, 0.158]} />
                <meshStandardMaterial color="#6d3b3b" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 2. Sheep Render Model */}
      {data.type === EntityType.SHEEP && (
        <group position={[0, 0, 0]}>
          {/* Cuerpo lanudo multicapa */}
          <mesh position={[0, 0.54, 0]}>
            <boxGeometry args={[0.64, 0.52, 0.88]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0, 0.82, -0.02]}>
            <boxGeometry args={[0.52, 0.08, 0.74]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#f8fafc'} />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.68, 0.38, 0.70]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#f1f5f9'} />
          </mesh>
          {/* Cuello lanudo y cabeza animada */}
          <group ref={headGroupRef} position={[0, 0.66, 0.42]}>
            <mesh position={[0, 0.02, 0.02]}>
              <boxGeometry args={[0.42, 0.40, 0.22]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
            <mesh position={[0, 0.02, 0.14]}>
              <boxGeometry args={[0.36, 0.36, 0.34]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f0d8c8'} />
            </mesh>
            {/* Copete esponjoso */}
            <mesh position={[0, 0.19, 0.12]}>
              <boxGeometry args={[0.40, 0.10, 0.38]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
            {/* Orejas */}
            <mesh position={[-0.21, 0.06, 0.12]} rotation={[0, 0, 0.22]}>
              <boxGeometry args={[0.07, 0.10, 0.10]} />
              <meshStandardMaterial color="#e2c2b0" />
            </mesh>
            <mesh position={[0.21, 0.06, 0.12]} rotation={[0, 0, -0.22]}>
              <boxGeometry args={[0.07, 0.10, 0.10]} />
              <meshStandardMaterial color="#e2c2b0" />
            </mesh>
            {/* Ojos y hocico */}
            <mesh position={[-0.12, 0.04, 0.311]}>
              <boxGeometry args={[0.075, 0.075, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[-0.095, 0.04, 0.315]}>
              <boxGeometry args={[0.038, 0.045, 0.02]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0.12, 0.04, 0.311]}>
              <boxGeometry args={[0.075, 0.075, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0.095, 0.04, 0.315]}>
              <boxGeometry args={[0.038, 0.045, 0.02]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0, -0.06, 0.312]}>
              <boxGeometry args={[0.14, 0.08, 0.02]} />
              <meshStandardMaterial color="#e6bfb0" />
            </mesh>
          </group>
          {/* Cola lanuda */}
          <group ref={tailRef} position={[0, 0.58, -0.46]}>
            <mesh>
              <boxGeometry args={[0.18, 0.16, 0.10]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
          </group>
          {/* Patas articuladas con puño de lana */}
          {[
            { ref: limbFLRef, pos: [-0.21, 0.32, 0.28] as [number, number, number] },
            { ref: limbFRRef, pos: [0.21, 0.32, 0.28] as [number, number, number] },
            { ref: limbBLRef, pos: [-0.21, 0.32, -0.28] as [number, number, number] },
            { ref: limbBRRef, pos: [0.21, 0.32, -0.28] as [number, number, number] }
          ].map((leg, i) => (
            <group key={`sheep-leg-${i}`} ref={leg.ref} position={leg.pos}>
              <mesh position={[0, -0.06, 0]}>
                <boxGeometry args={[0.17, 0.14, 0.17]} />
                <meshStandardMaterial color={bodyColor} />
              </mesh>
              <mesh position={[0, -0.20, 0]}>
                <boxGeometry args={[0.13, 0.16, 0.13]} />
                <meshStandardMaterial color="#d8c0b0" />
              </mesh>
              <mesh position={[0, -0.30, 0]}>
                <boxGeometry args={[0.138, 0.04, 0.138]} />
                <meshStandardMaterial color="#6b5c53" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 2.5 Villager Render Model */}
      {data.type === EntityType.VILLAGER && (
        <group position={[0, 0, 0]}>
          {/* Robe Body + Shoulder Drape + Apron + Emerald Belt */}
          <mesh position={[0, 0.82, 0]}>
            <boxGeometry args={[0.50, 0.88, 0.34]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#7b4a2b'} />
          </mesh>
          <mesh position={[0, 1.18, 0]}>
            <boxGeometry args={[0.54, 0.16, 0.38]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#5d371f'} />
          </mesh>
          <mesh position={[0, 0.65, 0.175]}>
            <boxGeometry args={[0.32, 0.48, 0.025]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#dfd0b8'} />
          </mesh>
          <mesh position={[0, 0.74, 0]}>
            <boxGeometry args={[0.52, 0.08, 0.36]} />
            <meshStandardMaterial color="#15803d" />
          </mesh>
          <mesh position={[0, 0.74, 0.185]}>
            <boxGeometry args={[0.10, 0.09, 0.02]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          {/* Cabeza animada con sombrero aldeano */}
          <group ref={headGroupRef} position={[0, 1.26, 0]}>
            <mesh position={[0, 0.23, 0]}>
              <boxGeometry args={[0.40, 0.46, 0.40]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#eebb99'} />
            </mesh>
            {/* Sombrero de paja suave */}
            <mesh position={[0, 0.40, 0]}>
              <boxGeometry args={[0.58, 0.04, 0.56]} />
              <meshStandardMaterial color="#d4a359" />
            </mesh>
            <mesh position={[0, 0.46, 0]}>
              <boxGeometry args={[0.42, 0.08, 0.42]} />
              <meshStandardMaterial color="#c28e42" />
            </mesh>
            {/* Uniceja + Ojos Esmeralda + Nariz prominente */}
            <mesh position={[0, 0.33, 0.205]}>
              <boxGeometry args={[0.32, 0.055, 0.025]} />
              <meshStandardMaterial color="#4a2c18" />
            </mesh>
            <mesh position={[-0.11, 0.25, 0.203]}>
              <boxGeometry args={[0.08, 0.10, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[-0.10, 0.25, 0.206]}>
              <boxGeometry args={[0.045, 0.065, 0.02]} />
              <meshStandardMaterial color="#10b981" />
            </mesh>
            <mesh position={[0.11, 0.25, 0.203]}>
              <boxGeometry args={[0.08, 0.10, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0.10, 0.25, 0.206]}>
              <boxGeometry args={[0.045, 0.065, 0.02]} />
              <meshStandardMaterial color="#10b981" />
            </mesh>
            <mesh position={[0, 0.13, 0.24]}>
              <boxGeometry args={[0.11, 0.19, 0.10]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#d69e7e'} />
            </mesh>
          </group>
          {/* Brazos cruzados con puños */}
          <mesh position={[0, 0.90, 0.19]}>
            <boxGeometry args={[0.58, 0.22, 0.22]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#6c3f23'} />
          </mesh>
          <mesh position={[-0.22, 0.90, 0.20]}>
            <boxGeometry args={[0.07, 0.23, 0.23]} />
            <meshStandardMaterial color="#4e2d18" />
          </mesh>
          <mesh position={[0.22, 0.90, 0.20]}>
            <boxGeometry args={[0.07, 0.23, 0.23]} />
            <meshStandardMaterial color="#4e2d18" />
          </mesh>
          {/* Piernas articuladas y botas */}
          <group ref={limbFLRef} position={[-0.13, 0.38, 0]}>
            <mesh position={[0, -0.15, 0]}>
              <boxGeometry args={[0.18, 0.30, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#4a2c1a'} />
            </mesh>
            <mesh position={[0, -0.34, 0.02]}>
              <boxGeometry args={[0.19, 0.08, 0.25]} />
              <meshStandardMaterial color="#2c190d" />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.13, 0.38, 0]}>
            <mesh position={[0, -0.15, 0]}>
              <boxGeometry args={[0.18, 0.30, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#4a2c1a'} />
            </mesh>
            <mesh position={[0, -0.34, 0.02]}>
              <boxGeometry args={[0.19, 0.08, 0.25]} />
              <meshStandardMaterial color="#2c190d" />
            </mesh>
          </group>
        </group>
      )}

      {/* 2.5b Cat Render Model */}
      {data.type === EntityType.CAT && (
        <group position={[0, 0, 0]}>
          {/* Body + Tabby Stripes + White Bib */}
          <mesh position={[0, 0.27, 0]}>
            <boxGeometry args={[0.22, 0.21, 0.50]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#d97706'} />
          </mesh>
          <mesh position={[0, 0.376, -0.12]}>
            <boxGeometry args={[0.224, 0.02, 0.05]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[0, 0.376, 0.02]}>
            <boxGeometry args={[0.224, 0.02, 0.05]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[0, 0.376, 0.14]}>
            <boxGeometry args={[0.224, 0.02, 0.05]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[0, 0.24, 0.19]}>
            <boxGeometry args={[0.17, 0.18, 0.15]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {/* Cabeza animada con bigotes y orejas rosadas */}
          <group ref={headGroupRef} position={[0, 0.38, 0.24]}>
            <mesh position={[0, 0.04, 0.03]}>
              <boxGeometry args={[0.22, 0.20, 0.20]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#d97706'} />
            </mesh>
            <mesh position={[-0.07, 0.165, 0.02]}>
              <boxGeometry args={[0.055, 0.07, 0.055]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#d97706'} />
            </mesh>
            <mesh position={[-0.07, 0.16, 0.05]}>
              <boxGeometry args={[0.03, 0.04, 0.01]} />
              <meshStandardMaterial color="#f9a8d4" />
            </mesh>
            <mesh position={[0.07, 0.165, 0.02]}>
              <boxGeometry args={[0.055, 0.07, 0.055]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#d97706'} />
            </mesh>
            <mesh position={[0.07, 0.16, 0.05]}>
              <boxGeometry args={[0.03, 0.04, 0.01]} />
              <meshStandardMaterial color="#f9a8d4" />
            </mesh>
            {/* Hocico + nariz + bigotes */}
            <mesh position={[0, 0.005, 0.132]}>
              <boxGeometry args={[0.10, 0.07, 0.04]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, 0.02, 0.152]}>
              <boxGeometry args={[0.04, 0.028, 0.015]} />
              <meshStandardMaterial color="#f472b6" />
            </mesh>
            <mesh position={[-0.095, 0.01, 0.138]}>
              <boxGeometry args={[0.09, 0.012, 0.01]} />
              <meshStandardMaterial color="#fef3c7" />
            </mesh>
            <mesh position={[0.095, 0.01, 0.138]}>
              <boxGeometry args={[0.09, 0.012, 0.01]} />
              <meshStandardMaterial color="#fef3c7" />
            </mesh>
            {/* Ojos Esmeralda */}
            <mesh position={[-0.055, 0.06, 0.132]}>
              <boxGeometry args={[0.048, 0.045, 0.01]} />
              <meshStandardMaterial color="#10b981" />
            </mesh>
            <mesh position={[-0.055, 0.06, 0.135]}>
              <boxGeometry args={[0.018, 0.04, 0.01]} />
              <meshStandardMaterial color="#064e3b" />
            </mesh>
            <mesh position={[0.055, 0.06, 0.132]}>
              <boxGeometry args={[0.048, 0.045, 0.01]} />
              <meshStandardMaterial color="#10b981" />
            </mesh>
            <mesh position={[0.055, 0.06, 0.135]}>
              <boxGeometry args={[0.018, 0.04, 0.01]} />
              <meshStandardMaterial color="#064e3b" />
            </mesh>
          </group>
          {/* Patas articuladas con patitas blancas */}
          {[
            { ref: limbFLRef, pos: [-0.075, 0.20, 0.17] as [number, number, number], front: true },
            { ref: limbFRRef, pos: [0.075, 0.20, 0.17] as [number, number, number], front: true },
            { ref: limbBLRef, pos: [-0.075, 0.20, -0.17] as [number, number, number], front: false },
            { ref: limbBRRef, pos: [0.075, 0.20, -0.17] as [number, number, number], front: false }
          ].map((leg, i) => (
            <group key={`cat-leg-${i}`} ref={leg.ref} position={leg.pos}>
              <mesh position={[0, -0.075, 0]}>
                <boxGeometry args={[0.055, 0.15, 0.055]} />
                <meshStandardMaterial color={flashRed ? '#ff2020' : (leg.front ? '#e58e26' : '#d97706')} />
              </mesh>
              <mesh position={[0, -0.175, 0]}>
                <boxGeometry args={[0.058, 0.05, 0.062]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          {/* Cola articulada elegante */}
          <group ref={tailRef} position={[0, 0.30, -0.25]} rotation={[0.55, 0, 0]}>
            <mesh position={[0, 0, -0.09]}>
              <boxGeometry args={[0.045, 0.045, 0.18]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#b45309'} />
            </mesh>
            <mesh position={[0, 0.025, -0.21]} rotation={[0.35, 0, 0]}>
              <boxGeometry args={[0.046, 0.046, 0.08]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        </group>
      )}

      {/* 2.6 Hoglin Render Model */}
      {data.type === EntityType.HOGLIN && (
        <group position={[0, 0, 0]}>
          {/* Cuerpo robusto + melena espinosa */}
          <mesh position={[0, 0.65, 0]}>
            <boxGeometry args={[0.88, 0.72, 1.24]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#642020'} />
          </mesh>
          <mesh position={[0, 0.30, 0]}>
            <boxGeometry args={[0.72, 0.08, 1.05]} />
            <meshStandardMaterial color="#3b1010" />
          </mesh>
          {/* Cresta dorsal segmentada */}
          {[-0.38, -0.12, 0.14, 0.38].map((mz, idx) => (
            <mesh key={`hog-mane-${idx}`} position={[0, 1.05, mz]} rotation={[-0.2, 0, 0]}>
              <boxGeometry args={[0.16, 0.16, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#2a0a0a'} />
            </mesh>
          ))}
          {/* Cabeza acorazada + colmillos */}
          <group ref={headGroupRef} position={[0, 0.72, 0.56]}>
            <mesh position={[0, 0.02, 0.14]}>
              <boxGeometry args={[0.64, 0.60, 0.64]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#521717'} />
            </mesh>
            {/* Hocico jabalí con fosas */}
            <mesh position={[0, -0.13, 0.48]}>
              <boxGeometry args={[0.34, 0.22, 0.16]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#7a2e2e'} />
            </mesh>
            <mesh position={[-0.08, -0.11, 0.562]}>
              <boxGeometry args={[0.055, 0.07, 0.015]} />
              <meshStandardMaterial color="#240808" />
            </mesh>
            <mesh position={[0.08, -0.11, 0.562]}>
              <boxGeometry args={[0.055, 0.07, 0.015]} />
              <meshStandardMaterial color="#240808" />
            </mesh>
            {/* Orejas caídas peludas */}
            <mesh position={[-0.37, 0.10, 0.12]} rotation={[0.1, 0, 0.28]}>
              <boxGeometry args={[0.08, 0.32, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#451212'} />
            </mesh>
            <mesh position={[0.37, 0.10, 0.12]} rotation={[0.1, 0, -0.28]}>
              <boxGeometry args={[0.08, 0.32, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#451212'} />
            </mesh>
            {/* Ojos brillantes + cejas */}
            <mesh position={[-0.22, 0.15, 0.465]}>
              <boxGeometry args={[0.12, 0.05, 0.02]} />
              <meshStandardMaterial color="#2b0909" />
            </mesh>
            <mesh position={[0.22, 0.15, 0.465]}>
              <boxGeometry args={[0.12, 0.05, 0.02]} />
              <meshStandardMaterial color="#2b0909" />
            </mesh>
            <mesh position={[-0.22, 0.09, 0.462]}>
              <boxGeometry args={[0.08, 0.07, 0.02]} />
              <meshStandardMaterial color="#fcd34d" emissive="#b45309" emissiveIntensity={1.6} />
            </mesh>
            <mesh position={[0.22, 0.09, 0.462]}>
              <boxGeometry args={[0.08, 0.07, 0.02]} />
              <meshStandardMaterial color="#fcd34d" emissive="#b45309" emissiveIntensity={1.6} />
            </mesh>
            {/* Colmillos curvos marfil */}
            <mesh position={[-0.23, -0.14, 0.51]} rotation={[-0.25, 0, 0.12]}>
              <boxGeometry args={[0.085, 0.32, 0.085]} />
              <meshStandardMaterial color="#f5f5f4" />
            </mesh>
            <mesh position={[0.23, -0.14, 0.51]} rotation={[-0.25, 0, -0.12]}>
              <boxGeometry args={[0.085, 0.32, 0.085]} />
              <meshStandardMaterial color="#f5f5f4" />
            </mesh>
          </group>
          {/* Cola corta peluda */}
          <group ref={tailRef} position={[0, 0.68, -0.61]}>
            <mesh rotation={[-0.4, 0, 0]}>
              <boxGeometry args={[0.08, 0.22, 0.07]} />
              <meshStandardMaterial color="#3b1010" />
            </mesh>
          </group>
          {/* Patas articuladas con pezuñas negras */}
          {[
            { ref: limbFLRef, pos: [-0.31, 0.44, 0.40] as [number, number, number] },
            { ref: limbFRRef, pos: [0.31, 0.44, 0.40] as [number, number, number] },
            { ref: limbBLRef, pos: [-0.31, 0.44, -0.40] as [number, number, number] },
            { ref: limbBRRef, pos: [0.31, 0.44, -0.40] as [number, number, number] }
          ].map((leg, idx) => (
            <group key={`hogleg-${idx}`} ref={leg.ref} position={leg.pos}>
              <mesh position={[0, -0.18, 0]}>
                <boxGeometry args={[0.22, 0.36, 0.22]} />
                <meshStandardMaterial color={flashRed ? '#ff2020' : '#4a1515'} />
              </mesh>
              <mesh position={[0, -0.40, 0]}>
                <boxGeometry args={[0.23, 0.08, 0.23]} />
                <meshStandardMaterial color="#1f0a0a" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 3. Zombie Render Model */}
      {data.type === EntityType.ZOMBIE && (
        <group position={[0, 0, 0]}>
          {/* Cabeza animada con ceño fruncido y marcas de putrefacción */}
          <group ref={headGroupRef} position={[0, 1.14, 0]}>
            <mesh position={[0, 0.20, 0]}>
              <boxGeometry args={[0.40, 0.40, 0.40]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
            <mesh position={[0, 0.33, 0.201]}>
              <boxGeometry args={[0.38, 0.08, 0.015]} />
              <meshStandardMaterial color="#1f4d20" />
            </mesh>
            <mesh position={[0.10, 0.29, -0.195]}>
              <boxGeometry args={[0.18, 0.14, 0.02]} />
              <meshStandardMaterial color="#1b4332" />
            </mesh>
            {/* Ojos profundos zombie */}
            <mesh position={[-0.105, 0.23, 0.202]}>
              <boxGeometry args={[0.095, 0.055, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
            <mesh position={[0.105, 0.23, 0.202]}>
              <boxGeometry args={[0.095, 0.055, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
            <mesh position={[-0.105, 0.23, 0.204]}>
              <boxGeometry args={[0.04, 0.045, 0.02]} />
              <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0.105, 0.23, 0.204]}>
              <boxGeometry args={[0.04, 0.045, 0.02]} />
              <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={0.35} />
            </mesh>
            {/* Boca entreabierta */}
            <mesh position={[0, 0.10, 0.202]}>
              <boxGeometry args={[0.14, 0.04, 0.015]} />
              <meshStandardMaterial color="#183619" />
            </mesh>
          </group>
          {/* Camisa turquesa rasgada + costilla visible + cinturón */}
          <mesh position={[0, 0.87, 0]}>
            <boxGeometry args={[0.44, 0.54, 0.24]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#0f766e'} />
          </mesh>
          <mesh position={[0.08, 0.88, 0.123]}>
            <boxGeometry args={[0.16, 0.22, 0.015]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0, 0.60, 0]}>
            <boxGeometry args={[0.45, 0.06, 0.25]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          {/* Brazos extendidos animados con mangas */}
          <group ref={armLRef} position={[-0.285, 1.06, 0.02]}>
            <mesh position={[0, -0.07, 0]}>
              <boxGeometry args={[0.13, 0.18, 0.13]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#0f766e'} />
            </mesh>
            <mesh position={[0, -0.26, 0]}>
              <boxGeometry args={[0.125, 0.24, 0.125]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.285, 1.06, 0.02]}>
            <mesh position={[0, -0.07, 0]}>
              <boxGeometry args={[0.13, 0.18, 0.13]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#0f766e'} />
            </mesh>
            <mesh position={[0, -0.26, 0]}>
              <boxGeometry args={[0.125, 0.24, 0.125]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
          </group>
          {/* Piernas articuladas (pantalón índigo y zapatos) */}
          <group ref={limbFLRef} position={[-0.11, 0.56, 0]}>
            <mesh position={[0, -0.24, 0]}>
              <boxGeometry args={[0.16, 0.48, 0.16]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#1e3a8a'} />
            </mesh>
            <mesh position={[0, -0.52, 0.01]}>
              <boxGeometry args={[0.165, 0.08, 0.18]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.11, 0.56, 0]}>
            <mesh position={[0, -0.24, 0]}>
              <boxGeometry args={[0.16, 0.48, 0.16]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#1e3a8a'} />
            </mesh>
            <mesh position={[0, -0.52, 0.01]}>
              <boxGeometry args={[0.165, 0.08, 0.18]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          </group>
        </group>
      )}

      {/* 4. Creeper Render Model */}
      {data.type === EntityType.CREEPER && (
        <group position={[0, 0, 0]}>
          {/* Cabeza animada con camuflaje multicapa */}
          <group ref={headGroupRef} position={[0, 0.94, 0]}>
            <mesh position={[0, 0.20, 0]}>
              <boxGeometry args={[0.40, 0.40, 0.40]} />
              <meshStandardMaterial color={bodyColor} emissive={fusePulse ? '#a3e635' : '#000000'} emissiveIntensity={fusePulse ? 0.65 : 0} />
            </mesh>
            {/* Camuflaje hoja/musgo */}
            <mesh position={[0.11, 0.36, 0.10]}>
              <boxGeometry args={[0.14, 0.09, 0.15]} />
              <meshStandardMaterial color="#1e4d1e" />
            </mesh>
            <mesh position={[-0.12, 0.28, -0.14]}>
              <boxGeometry args={[0.13, 0.13, 0.13]} />
              <meshStandardMaterial color="#14532d" />
            </mesh>
            <mesh position={[-0.15, 0.12, 0.11]}>
              <boxGeometry args={[0.11, 0.10, 0.10]} />
              <meshStandardMaterial color="#4ade80" />
            </mesh>
            {/* Rostro icónico con relieve */}
            <mesh position={[-0.105, 0.28, 0.202]}>
              <boxGeometry args={[0.09, 0.09, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
            <mesh position={[0.105, 0.28, 0.202]}>
              <boxGeometry args={[0.09, 0.09, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
            <mesh position={[0, 0.17, 0.202]}>
              <boxGeometry args={[0.12, 0.12, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
            <mesh position={[-0.08, 0.12, 0.202]}>
              <boxGeometry args={[0.07, 0.12, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
            <mesh position={[0.08, 0.12, 0.202]}>
              <boxGeometry args={[0.07, 0.12, 0.02]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
          </group>
          {/* Torso alto con textura camuflaje */}
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.31, 0.72, 0.24]} />
            <meshStandardMaterial color={bodyColor} emissive={fusePulse ? '#a3e635' : '#000000'} emissiveIntensity={fusePulse ? 0.5 : 0} />
          </mesh>
          <mesh position={[-0.06, 0.68, 0.122]}>
            <boxGeometry args={[0.12, 0.16, 0.015]} />
            <meshStandardMaterial color="#166534" />
          </mesh>
          <mesh position={[0.07, 0.44, -0.122]}>
            <boxGeometry args={[0.12, 0.18, 0.015]} />
            <meshStandardMaterial color="#14532d" />
          </mesh>
          {/* Patas articuladas con garras oscuras */}
          {[
            { ref: limbFLRef, pos: [-0.13, 0.22, 0.13] as [number, number, number] },
            { ref: limbFRRef, pos: [0.13, 0.22, 0.13] as [number, number, number] },
            { ref: limbBLRef, pos: [-0.13, 0.22, -0.13] as [number, number, number] },
            { ref: limbBRRef, pos: [0.13, 0.22, -0.13] as [number, number, number] }
          ].map((fp, idx) => (
            <group key={`creep-foot-${idx}`} ref={fp.ref} position={fp.pos}>
              <mesh position={[0, -0.09, 0]}>
                <boxGeometry args={[0.15, 0.18, 0.15]} />
                <meshStandardMaterial color={bodyColor} />
              </mesh>
              <mesh position={[0, -0.20, 0]}>
                <boxGeometry args={[0.158, 0.04, 0.158]} />
                <meshStandardMaterial color="#143314" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 5. Skeleton Render Model (anatomía ósea + carcaj + Arco 3D) */}
      {data.type === EntityType.SKELETON && (
        <group position={[0, 0, 0]}>
          {/* Cráneo detallado */}
          <group ref={headGroupRef} position={[0, 1.20, 0]}>
            <mesh position={[0, 0.18, 0]}>
              <boxGeometry args={[0.36, 0.36, 0.36]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#d6d3d1'} />
            </mesh>
            <mesh position={[-0.09, 0.22, 0.182]}>
              <boxGeometry args={[0.085, 0.075, 0.02]} />
              <meshStandardMaterial color="#0f0f0f" />
            </mesh>
            <mesh position={[0.09, 0.22, 0.182]}>
              <boxGeometry args={[0.085, 0.075, 0.02]} />
              <meshStandardMaterial color="#0f0f0f" />
            </mesh>
            <mesh position={[0, 0.15, 0.182]}>
              <boxGeometry args={[0.04, 0.05, 0.015]} />
              <meshStandardMaterial color="#1f1f1f" />
            </mesh>
            <mesh position={[0, 0.07, 0.182]}>
              <boxGeometry args={[0.20, 0.045, 0.015]} />
              <meshStandardMaterial color="#404040" />
            </mesh>
          </group>
          {/* Columna + Caja torácica 3D (4 pares de costillas) + Pelvis */}
          <mesh position={[0, 0.89, -0.02]}>
            <boxGeometry args={[0.07, 0.62, 0.07]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#c7c3be'} />
          </mesh>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[0.32, 0.06, 0.13]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#d6d3d1'} />
          </mesh>
          {[1.05, 0.95, 0.85, 0.75].map((ry, rIdx) => (
            <mesh key={`skel-rib-${rIdx}`} position={[0, ry, 0.01]}>
              <boxGeometry args={[0.28, 0.045, 0.15]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#e5e7eb'} />
            </mesh>
          ))}
          <mesh position={[0, 0.61, 0]}>
            <boxGeometry args={[0.28, 0.08, 0.14]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#bfbfbf'} />
          </mesh>
          {/* Carcaj con flechas a la espalda */}
          <group position={[-0.08, 0.92, -0.12]} rotation={[0.08, 0, -0.35]}>
            <mesh>
              <boxGeometry args={[0.09, 0.34, 0.08]} />
              <meshStandardMaterial color="#6d4c41" />
            </mesh>
            <mesh position={[0, 0.19, 0]}>
              <boxGeometry args={[0.06, 0.08, 0.05]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          </group>
          {/* Brazos delgados articulados */}
          <group ref={armLRef} position={[-0.19, 1.12, 0.02]}>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[0.065, 0.36, 0.065]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#c7c3be'} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.19, 1.12, 0.02]}>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[0.065, 0.36, 0.065]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#c7c3be'} />
            </mesh>
            {/* Arco curvado con cuerda y flecha lista */}
            <group position={[0.02, -0.34, 0.03]} rotation={[Math.PI * 0.45, 0, 0]}>
              <mesh position={[0, 0, 0.03]}>
                <boxGeometry args={[0.04, 0.24, 0.04]} />
                <meshStandardMaterial color="#6d4c41" />
              </mesh>
              <mesh position={[0, 0.16, -0.02]} rotation={[0.42, 0, 0]}>
                <boxGeometry args={[0.035, 0.16, 0.035]} />
                <meshStandardMaterial color="#5d4037" />
              </mesh>
              <mesh position={[0, -0.16, -0.02]} rotation={[-0.42, 0, 0]}>
                <boxGeometry args={[0.035, 0.16, 0.035]} />
                <meshStandardMaterial color="#5d4037" />
              </mesh>
              <mesh position={[0, 0, -0.06]}>
                <boxGeometry args={[0.015, 0.42, 0.015]} />
                <meshStandardMaterial color="#e5e7eb" />
              </mesh>
              <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
                <boxGeometry args={[0.02, 0.22, 0.02]} />
                <meshStandardMaterial color="#a16207" />
              </mesh>
            </group>
          </group>
          {/* Piernas articuladas */}
          <group ref={limbFLRef} position={[-0.08, 0.58, 0]}>
            <mesh position={[0, -0.29, 0]}>
              <boxGeometry args={[0.075, 0.58, 0.075]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#c7c3be'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.08, 0.58, 0]}>
            <mesh position={[0, -0.29, 0]}>
              <boxGeometry args={[0.075, 0.58, 0.075]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#c7c3be'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 6. Arrow Projectile Render Model */}
      {data.type === EntityType.ARROW && (
        <group scale={[0.15, 0.15, 0.15]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 3.5, 4]} />
            <meshStandardMaterial color="#8b5a2b" />
          </mesh>
          <mesh position={[0, 0, -1.8]}>
            <boxGeometry args={[0.5, 0.5, 0.8]} />
            <meshStandardMaterial color="#fefefe" />
          </mesh>
          <mesh position={[0, 0, 1.8]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 0.6, 4]} />
            <meshStandardMaterial color="#555555" />
          </mesh>
        </group>
      )}

      {/* 7. Wolf Render Model */}
      {data.type === EntityType.WOLF && (
        <group position={[0, 0, 0]}>
          {/* Torso + manto oscuro + collar rojo con medalla dorada */}
          <mesh position={[0, 0.34, -0.02]}>
            <boxGeometry args={[0.28, 0.26, 0.52]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#d1d5db'} />
          </mesh>
          <mesh position={[0, 0.475, -0.04]}>
            <boxGeometry args={[0.24, 0.035, 0.44]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#64748b'} />
          </mesh>
          <mesh position={[0, 0.37, 0.19]}>
            <boxGeometry args={[0.33, 0.31, 0.14]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#e5e7eb'} />
          </mesh>
          <mesh position={[0, 0.36, 0.265]}>
            <boxGeometry args={[0.31, 0.28, 0.045]} />
            <meshStandardMaterial color="#dc2626" />
          </mesh>
          <mesh position={[0, 0.25, 0.29]}>
            <boxGeometry args={[0.06, 0.06, 0.02]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          {/* Cabeza animada */}
          <group ref={headGroupRef} position={[0, 0.42, 0.31]}>
            <mesh position={[0, 0.03, 0.03]}>
              <boxGeometry args={[0.25, 0.24, 0.24]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#d1d5db'} />
            </mesh>
            <mesh position={[-0.075, 0.07, 0.151]}>
              <boxGeometry args={[0.045, 0.04, 0.015]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0.075, 0.07, 0.151]}>
              <boxGeometry args={[0.045, 0.04, 0.015]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[-0.085, 0.18, -0.01]}>
              <boxGeometry args={[0.065, 0.095, 0.06]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#64748b'} />
            </mesh>
            <mesh position={[0.085, 0.18, -0.01]}>
              <boxGeometry args={[0.065, 0.095, 0.06]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#64748b'} />
            </mesh>
            {/* Hocico largo y nariz */}
            <mesh position={[0, -0.02, 0.185]}>
              <boxGeometry args={[0.12, 0.095, 0.12]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#9ca3af'} />
            </mesh>
            <mesh position={[0, 0.005, 0.248]}>
              <boxGeometry args={[0.05, 0.04, 0.025]} />
              <meshStandardMaterial color="#09090b" />
            </mesh>
          </group>
          {/* Cola esponjosa animada */}
          <group ref={tailRef} position={[0, 0.40, -0.28]} rotation={[-0.45, 0, 0]}>
            <mesh position={[0, 0, -0.10]}>
              <boxGeometry args={[0.085, 0.085, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#9ca3af'} />
            </mesh>
            <mesh position={[0, 0, -0.23]}>
              <boxGeometry args={[0.075, 0.075, 0.07]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          </group>
          {/* Patas articuladas */}
          {[
            { ref: limbFLRef, pos: [-0.085, 0.24, 0.16] as [number, number, number] },
            { ref: limbFRRef, pos: [0.085, 0.24, 0.16] as [number, number, number] },
            { ref: limbBLRef, pos: [-0.085, 0.24, -0.18] as [number, number, number] },
            { ref: limbBRRef, pos: [0.085, 0.24, -0.18] as [number, number, number] }
          ].map((leg, idx) => (
            <group key={`wolf-leg-${idx}`} ref={leg.ref} position={leg.pos}>
              <mesh position={[0, -0.10, 0]}>
                <boxGeometry args={[0.075, 0.20, 0.075]} />
                <meshStandardMaterial color={flashRed ? '#ff2020' : '#cbd5e1'} />
              </mesh>
              <mesh position={[0, -0.22, 0.01]}>
                <boxGeometry args={[0.08, 0.04, 0.09]} />
                <meshStandardMaterial color="#64748b" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 8. Frog Render Model */}
      {data.type === EntityType.FROG && (
        <group position={[0, 0, 0]}>
          {/* Cuerpo anfibio bitono + saco vocal */}
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.32, 0.16, 0.32]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#558b2f'} />
          </mesh>
          <mesh position={[0, 0.075, 0.01]}>
            <boxGeometry args={[0.28, 0.05, 0.28]} />
            <meshStandardMaterial color="#ecfccb" />
          </mesh>
          <mesh position={[-0.07, 0.225, -0.04]}>
            <boxGeometry args={[0.09, 0.02, 0.10]} />
            <meshStandardMaterial color="#33691e" />
          </mesh>
          <mesh position={[0.08, 0.225, 0.03]}>
            <boxGeometry args={[0.08, 0.02, 0.08]} />
            <meshStandardMaterial color="#33691e" />
          </mesh>
          <mesh position={[0, 0.09, 0.135]}>
            <boxGeometry args={[0.24, 0.08, 0.09]} />
            <meshStandardMaterial color="#fde68a" />
          </mesh>
          {/* Cabeza/Ojos saltones */}
          <group ref={headGroupRef} position={[0, 0.20, 0.08]}>
            <mesh position={[-0.09, 0.05, 0]}>
              <boxGeometry args={[0.095, 0.095, 0.095]} />
              <meshStandardMaterial color="#fbbf24" />
            </mesh>
            <mesh position={[0.09, 0.05, 0]}>
              <boxGeometry args={[0.095, 0.095, 0.095]} />
              <meshStandardMaterial color="#fbbf24" />
            </mesh>
            <mesh position={[-0.09, 0.05, 0.049]}>
              <boxGeometry args={[0.055, 0.028, 0.01]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0.09, 0.05, 0.049]}>
              <boxGeometry args={[0.055, 0.028, 0.01]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
          </group>
          {/* Patas traseras dobladas y delanteras articuladas */}
          <group ref={limbBLRef} position={[-0.17, 0.11, -0.07]}>
            <mesh position={[0, -0.03, 0]}>
              <boxGeometry args={[0.09, 0.12, 0.19]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#3f6212'} />
            </mesh>
            <mesh position={[-0.02, -0.10, 0.03]}>
              <boxGeometry args={[0.10, 0.02, 0.12]} />
              <meshStandardMaterial color="#65a30d" />
            </mesh>
          </group>
          <group ref={limbBRRef} position={[0.17, 0.11, -0.07]}>
            <mesh position={[0, -0.03, 0]}>
              <boxGeometry args={[0.09, 0.12, 0.19]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#3f6212'} />
            </mesh>
            <mesh position={[0.02, -0.10, 0.03]}>
              <boxGeometry args={[0.10, 0.02, 0.12]} />
              <meshStandardMaterial color="#65a30d" />
            </mesh>
          </group>
          <group ref={limbFLRef} position={[-0.12, 0.10, 0.11]}>
            <mesh position={[0, -0.05, 0]}>
              <boxGeometry args={[0.055, 0.10, 0.055]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#65a30d'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.12, 0.10, 0.11]}>
            <mesh position={[0, -0.05, 0]}>
              <boxGeometry args={[0.055, 0.10, 0.055]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#65a30d'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 9. Enderman Render Model */}
      {data.type === EntityType.ENDERMAN && (
        <group position={[0, 0, 0]} scale={[0.85, 1.15, 0.85]}>
          {/* Cabeza y mandíbula articulada */}
          <group ref={headGroupRef} position={[0, 2.22, 0]}>
            <mesh position={[0, 0.16, 0]}>
              <boxGeometry args={[0.32, 0.30, 0.32]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#141414'} />
            </mesh>
            <mesh position={[0, 0.02, 0.01]}>
              <boxGeometry args={[0.28, 0.06, 0.28]} />
              <meshStandardMaterial color="#09090b" />
            </mesh>
            {/* Ojos púrpura resplandecientes con pupila */}
            <mesh position={[-0.085, 0.16, 0.162]}>
              <boxGeometry args={[0.09, 0.028, 0.01]} />
              <meshStandardMaterial color="#d500f9" emissive="#d500f9" emissiveIntensity={2.8} />
            </mesh>
            <mesh position={[-0.085, 0.16, 0.166]}>
              <boxGeometry args={[0.035, 0.028, 0.01]} />
              <meshStandardMaterial color="#fae8ff" emissive="#ffffff" emissiveIntensity={3.0} />
            </mesh>
            <mesh position={[0.085, 0.16, 0.162]}>
              <boxGeometry args={[0.09, 0.028, 0.01]} />
              <meshStandardMaterial color="#d500f9" emissive="#d500f9" emissiveIntensity={2.8} />
            </mesh>
            <mesh position={[0.085, 0.16, 0.166]}>
              <boxGeometry args={[0.035, 0.028, 0.01]} />
              <meshStandardMaterial color="#fae8ff" emissive="#ffffff" emissiveIntensity={3.0} />
            </mesh>
          </group>
          {/* Torso anguloso + núcleo del Vacío */}
          <mesh position={[0, 1.80, 0]}>
            <boxGeometry args={[0.28, 0.80, 0.16]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#18181b'} />
          </mesh>
          <mesh position={[0, 2.12, 0]}>
            <boxGeometry args={[0.38, 0.14, 0.19]} />
            <meshStandardMaterial color="#1f1f23" />
          </mesh>
          <mesh position={[0, 1.88, 0.084]}>
            <boxGeometry args={[0.09, 0.16, 0.01]} />
            <meshStandardMaterial color="#7e22ce" emissive="#a855f7" emissiveIntensity={1.4} />
          </mesh>
          {/* Brazos larguísimos articulados */}
          <group ref={armLRef} position={[-0.22, 2.12, 0]}>
            <mesh position={[0, -0.66, 0]}>
              <boxGeometry args={[0.06, 1.32, 0.06]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#141414'} />
            </mesh>
            <mesh position={[0, -0.65, 0]}>
              <boxGeometry args={[0.075, 0.06, 0.075]} />
              <meshStandardMaterial color="#581c87" />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.22, 2.12, 0]}>
            <mesh position={[0, -0.66, 0]}>
              <boxGeometry args={[0.06, 1.32, 0.06]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#141414'} />
            </mesh>
            <mesh position={[0, -0.65, 0]}>
              <boxGeometry args={[0.075, 0.06, 0.075]} />
              <meshStandardMaterial color="#581c87" />
            </mesh>
          </group>
          {/* Piernas larguísimas articuladas */}
          <group ref={limbFLRef} position={[-0.08, 1.38, 0]}>
            <mesh position={[0, -0.69, 0]}>
              <boxGeometry args={[0.06, 1.38, 0.06]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#111111'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.08, 1.38, 0]}>
            <mesh position={[0, -0.69, 0]}>
              <boxGeometry args={[0.06, 1.38, 0.06]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#111111'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 10. Zombified Piglin Render Model */}
      {data.type === EntityType.ZOMBIFIED_PIGLIN && (
        <group position={[0, 0, 0]}>
          {/* Cabeza asimétrica (flesh rosa + parche verde y hueso) */}
          <group ref={headGroupRef} position={[0, 1.14, 0]}>
            <mesh position={[0, 0.21, 0]}>
              <boxGeometry args={[0.42, 0.40, 0.40]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f06292'} />
            </mesh>
            <mesh position={[-0.11, 0.22, 0.16]}>
              <boxGeometry args={[0.21, 0.28, 0.10]} />
              <meshStandardMaterial color="#4d7c0f" />
            </mesh>
            <mesh position={[-0.13, 0.31, 0.205]}>
              <boxGeometry args={[0.10, 0.09, 0.02]} />
              <meshStandardMaterial color="#e7e5e4" />
            </mesh>
            {/* Orejas caídas (una sana y una verde) */}
            <mesh position={[-0.22, 0.23, 0.02]} rotation={[0, 0, 0.26]}>
              <boxGeometry args={[0.05, 0.18, 0.14]} />
              <meshStandardMaterial color="#4d7c0f" />
            </mesh>
            <mesh position={[0.22, 0.23, 0.02]} rotation={[0, 0, -0.26]}>
              <boxGeometry args={[0.05, 0.18, 0.14]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#ec407a'} />
            </mesh>
            {/* Hocico y colmillos */}
            <mesh position={[0, 0.12, 0.215]}>
              <boxGeometry args={[0.20, 0.12, 0.06]} />
              <meshStandardMaterial color="#db2777" />
            </mesh>
            <mesh position={[-0.095, 0.06, 0.23]}>
              <boxGeometry args={[0.035, 0.07, 0.035]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0.095, 0.06, 0.23]}>
              <boxGeometry args={[0.035, 0.07, 0.035]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[-0.11, 0.25, 0.212]}>
              <boxGeometry args={[0.07, 0.045, 0.015]} />
              <meshStandardMaterial color="#fef08a" emissive="#ca8a04" emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0.11, 0.25, 0.212]}>
              <boxGeometry args={[0.07, 0.045, 0.015]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
          </group>
          {/* Torso con parche podrido y taparrabos */}
          <mesh position={[0, 0.87, 0]}>
            <boxGeometry args={[0.44, 0.54, 0.24]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#f48fb1'} />
          </mesh>
          <mesh position={[0.08, 0.90, 0.122]}>
            <boxGeometry args={[0.18, 0.22, 0.015]} />
            <meshStandardMaterial color="#4d7c0f" />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.46, 0.14, 0.26]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          {/* Brazos articulados + brazalete dorado + Espada de Oro 3D */}
          <group ref={armLRef} position={[-0.28, 1.06, 0]}>
            <mesh position={[0, -0.22, 0]}>
              <boxGeometry args={[0.13, 0.44, 0.13]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#4d7c0f'} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.28, 1.06, 0]}>
            <mesh position={[0, -0.22, 0]}>
              <boxGeometry args={[0.13, 0.44, 0.13]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f06292'} />
            </mesh>
            <mesh position={[0, -0.34, 0]}>
              <boxGeometry args={[0.145, 0.07, 0.145]} />
              <meshStandardMaterial color="#f59e0b" />
            </mesh>
            {/* Espada de Oro con guarda */}
            <group position={[0.02, -0.42, 0.22]} rotation={[0.45, 0, 0]}>
              <mesh position={[0, 0, -0.14]}>
                <boxGeometry args={[0.04, 0.04, 0.10]} />
                <meshStandardMaterial color="#78350f" />
              </mesh>
              <mesh position={[0, 0, -0.07]}>
                <boxGeometry args={[0.14, 0.045, 0.035]} />
                <meshStandardMaterial color="#f59e0b" />
              </mesh>
              <mesh position={[0, 0, 0.12]}>
                <boxGeometry args={[0.055, 0.025, 0.34]} />
                <meshStandardMaterial color="#fcd34d" emissive="#b45309" emissiveIntensity={0.45} />
              </mesh>
            </group>
          </group>
          {/* Piernas articuladas */}
          <group ref={limbFLRef} position={[-0.10, 0.56, 0]}>
            <mesh position={[0, -0.28, 0]}>
              <boxGeometry args={[0.16, 0.56, 0.16]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f06292'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.10, 0.56, 0]}>
            <mesh position={[0, -0.28, 0]}>
              <boxGeometry args={[0.16, 0.56, 0.16]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#4d7c0f'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 11. Iron Golem Render Model */}
      {data.type === EntityType.IRON_GOLEM && (
        <group position={[0, 0, 0]} scale={[1.2, 1.2, 1.2]}>
          {/* Torso masivo acorazado + hombreras + enredaderas + amapola roja */}
          <mesh position={[0, 1.18, 0]}>
            <boxGeometry args={[0.82, 0.80, 0.50]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#eceff1'} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.78, 0]}>
            <boxGeometry args={[0.64, 0.14, 0.40]} />
            <meshStandardMaterial color="#90a4ae" />
          </mesh>
          {/* Enredadera y amapola en el pecho */}
          <mesh position={[-0.10, 1.16, 0.256]}>
            <boxGeometry args={[0.56, 0.36, 0.015]} />
            <meshStandardMaterial color="#4caf50" />
          </mesh>
          <mesh position={[0.20, 1.06, 0.27]}>
            <boxGeometry args={[0.04, 0.12, 0.02]} />
            <meshStandardMaterial color="#2e7d32" />
          </mesh>
          <mesh position={[0.20, 1.14, 0.275]}>
            <boxGeometry args={[0.10, 0.10, 0.03]} />
            <meshStandardMaterial color="#e53935" />
          </mesh>
          {/* Cabeza animada */}
          <group ref={headGroupRef} position={[0, 1.56, 0.08]}>
            <mesh position={[0, 0.16, 0]}>
              <boxGeometry args={[0.32, 0.34, 0.32]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#eceff1'} />
            </mesh>
            <mesh position={[0, 0.23, 0.165]}>
              <boxGeometry args={[0.28, 0.055, 0.02]} />
              <meshStandardMaterial color="#78909c" />
            </mesh>
            <mesh position={[0, 0.06, 0.175]}>
              <boxGeometry args={[0.075, 0.16, 0.075]} />
              <meshStandardMaterial color="#cfd8dc" />
            </mesh>
            <mesh position={[-0.075, 0.14, 0.163]}>
              <boxGeometry args={[0.05, 0.05, 0.015]} />
              <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[0.075, 0.14, 0.163]}>
              <boxGeometry args={[0.05, 0.05, 0.015]} />
              <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.8} />
            </mesh>
          </group>
          {/* Brazos enormes articulados con hombreras y antebrazos */}
          <group ref={armLRef} position={[-0.51, 1.44, 0.02]}>
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[0.22, 0.22, 0.26]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#b0bec5'} />
            </mesh>
            <mesh position={[0, -0.52, 0]}>
              <boxGeometry args={[0.19, 1.00, 0.20]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#cfd8dc'} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.51, 1.44, 0.02]}>
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[0.22, 0.22, 0.26]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#b0bec5'} />
            </mesh>
            <mesh position={[0, -0.52, 0]}>
              <boxGeometry args={[0.19, 1.00, 0.20]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#cfd8dc'} />
            </mesh>
          </group>
          {/* Piernas gruesas articuladas */}
          <group ref={limbFLRef} position={[-0.20, 0.72, 0]}>
            <mesh position={[0, -0.36, 0]}>
              <boxGeometry args={[0.22, 0.72, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#b0bec5'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.20, 0.72, 0]}>
            <mesh position={[0, -0.36, 0]}>
              <boxGeometry args={[0.22, 0.72, 0.22]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#b0bec5'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 12. Snow Skeleton (Stray) Render Model */}
      {data.type === EntityType.SNOW_SKELETON && (
        <group position={[0, 0, 0]}>
          {/* Cabeza con capucha desgarrada y ojos glaciales */}
          <group ref={headGroupRef} position={[0, 1.20, 0]}>
            <mesh position={[0, 0.18, 0]}>
              <boxGeometry args={[0.35, 0.35, 0.35]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#93c5fd'} />
            </mesh>
            <mesh position={[0, 0.22, -0.02]}>
              <boxGeometry args={[0.41, 0.34, 0.40]} />
              <meshStandardMaterial color="#334155" transparent opacity={0.88} />
            </mesh>
            <mesh position={[-0.085, 0.21, 0.178]}>
              <boxGeometry args={[0.08, 0.055, 0.02]} />
              <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.8} />
            </mesh>
            <mesh position={[0.085, 0.21, 0.178]}>
              <boxGeometry args={[0.08, 0.055, 0.02]} />
              <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.8} />
            </mesh>
          </group>
          {/* Columna, costillas heladas y capa desgarrada */}
          <mesh position={[0, 0.89, -0.02]}>
            <boxGeometry args={[0.07, 0.62, 0.07]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#94a3b8'} />
          </mesh>
          {[1.05, 0.95, 0.85, 0.75].map((ry, rIdx) => (
            <mesh key={`stray-rib-${rIdx}`} position={[0, ry, 0.01]}>
              <boxGeometry args={[0.28, 0.045, 0.14]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#bfdbfe'} />
            </mesh>
          ))}
          <mesh position={[0, 1.13, -0.02]}>
            <boxGeometry args={[0.36, 0.12, 0.22]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          <mesh position={[0, 0.85, -0.10]}>
            <boxGeometry args={[0.30, 0.55, 0.04]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          {/* Brazos y Arco Helado */}
          <group ref={armLRef} position={[-0.19, 1.12, 0.02]}>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[0.065, 0.36, 0.065]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#94a3b8'} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.19, 1.12, 0.02]}>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[0.065, 0.36, 0.065]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#94a3b8'} />
            </mesh>
            <group position={[0.02, -0.34, 0.03]} rotation={[Math.PI * 0.45, 0, 0]}>
              <mesh position={[0, 0, 0.03]}>
                <boxGeometry args={[0.04, 0.24, 0.04]} />
                <meshStandardMaterial color="#38bdf8" />
              </mesh>
              <mesh position={[0, 0.16, -0.02]} rotation={[0.42, 0, 0]}>
                <boxGeometry args={[0.035, 0.16, 0.035]} />
                <meshStandardMaterial color="#475569" />
              </mesh>
              <mesh position={[0, -0.16, -0.02]} rotation={[-0.42, 0, 0]}>
                <boxGeometry args={[0.035, 0.16, 0.035]} />
                <meshStandardMaterial color="#475569" />
              </mesh>
              <mesh position={[0, 0, -0.06]}>
                <boxGeometry args={[0.015, 0.42, 0.015]} />
                <meshStandardMaterial color="#a5f3fc" />
              </mesh>
            </group>
          </group>
          {/* Piernas articuladas */}
          <group ref={limbFLRef} position={[-0.08, 0.58, 0]}>
            <mesh position={[0, -0.29, 0]}>
              <boxGeometry args={[0.075, 0.58, 0.075]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#94a3b8'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.08, 0.58, 0]}>
            <mesh position={[0, -0.29, 0]}>
              <boxGeometry args={[0.075, 0.58, 0.075]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#94a3b8'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 13. Swamp Skeleton (Bogged) Render Model */}
      {data.type === EntityType.SWAMP_SKELETON && (
        <group position={[0, 0, 0]}>
          {/* Cráneo musgoso con hongos 3D */}
          <group ref={headGroupRef} position={[0, 1.20, 0]}>
            <mesh position={[0, 0.18, 0]}>
              <boxGeometry args={[0.35, 0.35, 0.35]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#7cb342'} />
            </mesh>
            {/* Hongo rojo y hongo marrón en el cráneo */}
            <mesh position={[0.08, 0.37, -0.04]}>
              <boxGeometry args={[0.04, 0.06, 0.04]} />
              <meshStandardMaterial color="#d6d3d1" />
            </mesh>
            <mesh position={[0.08, 0.41, -0.04]}>
              <boxGeometry args={[0.13, 0.05, 0.13]} />
              <meshStandardMaterial color="#dc2626" />
            </mesh>
            <mesh position={[-0.08, 0.37, 0.06]}>
              <boxGeometry args={[0.09, 0.05, 0.09]} />
              <meshStandardMaterial color="#854d0e" />
            </mesh>
            <mesh position={[-0.085, 0.21, 0.178]}>
              <boxGeometry args={[0.08, 0.075, 0.02]} />
              <meshStandardMaterial color="#1c1917" />
            </mesh>
            <mesh position={[0.085, 0.21, 0.178]}>
              <boxGeometry args={[0.08, 0.075, 0.02]} />
              <meshStandardMaterial color="#1c1917" />
            </mesh>
          </group>
          {/* Costillas musgosas + lianas colgantes */}
          <mesh position={[0, 0.89, -0.02]}>
            <boxGeometry args={[0.07, 0.62, 0.07]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#65a30d'} />
          </mesh>
          {[1.05, 0.95, 0.85, 0.75].map((ry, rIdx) => (
            <mesh key={`bogged-rib-${rIdx}`} position={[0, ry, 0.01]}>
              <boxGeometry args={[0.28, 0.045, 0.14]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#84cc16'} />
            </mesh>
          ))}
          <mesh position={[-0.12, 0.78, 0.09]}>
            <boxGeometry args={[0.04, 0.34, 0.03]} />
            <meshStandardMaterial color="#365314" />
          </mesh>
          {/* Brazos y Arco Musgoso */}
          <group ref={armLRef} position={[-0.19, 1.12, 0.02]}>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[0.065, 0.36, 0.065]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#7cb342'} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.19, 1.12, 0.02]}>
            <mesh position={[0, -0.18, 0]}>
              <boxGeometry args={[0.065, 0.36, 0.065]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#7cb342'} />
            </mesh>
            <group position={[0.02, -0.34, 0.03]} rotation={[Math.PI * 0.45, 0, 0]}>
              <mesh position={[0, 0, 0.03]}>
                <boxGeometry args={[0.04, 0.24, 0.04]} />
                <meshStandardMaterial color="#3f6212" />
              </mesh>
              <mesh position={[0, 0.16, -0.02]} rotation={[0.42, 0, 0]}>
                <boxGeometry args={[0.035, 0.16, 0.035]} />
                <meshStandardMaterial color="#365314" />
              </mesh>
              <mesh position={[0, -0.16, -0.02]} rotation={[-0.42, 0, 0]}>
                <boxGeometry args={[0.035, 0.16, 0.035]} />
                <meshStandardMaterial color="#365314" />
              </mesh>
              <mesh position={[0, 0, -0.06]}>
                <boxGeometry args={[0.015, 0.42, 0.015]} />
                <meshStandardMaterial color="#bef264" />
              </mesh>
            </group>
          </group>
          {/* Piernas musgosas articuladas */}
          <group ref={limbFLRef} position={[-0.08, 0.58, 0]}>
            <mesh position={[0, -0.29, 0]}>
              <boxGeometry args={[0.075, 0.58, 0.075]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#65a30d'} />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.08, 0.58, 0]}>
            <mesh position={[0, -0.29, 0]}>
              <boxGeometry args={[0.075, 0.58, 0.075]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#65a30d'} />
            </mesh>
          </group>
        </group>
      )}

      {/* 14. Chicken Render Model */}
      {data.type === EntityType.CHICKEN && (
        <group position={[0, 0, 0]}>
          {/* Cuerpo emplumado + abanico de cola */}
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[0.30, 0.26, 0.38]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#ffffff'} />
          </mesh>
          <mesh position={[0, 0.37, -0.22]} rotation={[0.45, 0, 0]}>
            <boxGeometry args={[0.16, 0.14, 0.09]} />
            <meshStandardMaterial color={flashRed ? '#ff2020' : '#e2e8f0'} />
          </mesh>
          {/* Cabeza animada con cresta doble, pico doble y barbilla roja */}
          <group ref={headGroupRef} position={[0, 0.38, 0.15]}>
            <mesh position={[0, 0.10, 0.02]}>
              <boxGeometry args={[0.19, 0.22, 0.19]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#ffffff'} />
            </mesh>
            <mesh position={[0, 0.23, 0.03]}>
              <boxGeometry args={[0.04, 0.07, 0.13]} />
              <meshStandardMaterial color="#e53935" />
            </mesh>
            <mesh position={[0, 0.26, 0.01]}>
              <boxGeometry args={[0.04, 0.04, 0.06]} />
              <meshStandardMaterial color="#dc2626" />
            </mesh>
            <mesh position={[-0.06, 0.14, 0.116]}>
              <boxGeometry args={[0.035, 0.035, 0.01]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0.06, 0.14, 0.116]}>
              <boxGeometry args={[0.035, 0.035, 0.01]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            <mesh position={[0, 0.095, 0.145]}>
              <boxGeometry args={[0.11, 0.04, 0.09]} />
              <meshStandardMaterial color="#fbbf24" />
            </mesh>
            <mesh position={[0, 0.06, 0.135]}>
              <boxGeometry args={[0.09, 0.03, 0.07]} />
              <meshStandardMaterial color="#f59e0b" />
            </mesh>
            <mesh position={[0, 0.005, 0.10]}>
              <boxGeometry args={[0.06, 0.08, 0.045]} />
              <meshStandardMaterial color="#e53935" />
            </mesh>
          </group>
          {/* Alas que aletean al caer o caminar */}
          <group ref={armLRef} position={[-0.155, 0.36, 0]}>
            <mesh position={[-0.02, -0.09, 0]}>
              <boxGeometry args={[0.045, 0.18, 0.24]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f1f5f9'} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.155, 0.36, 0]}>
            <mesh position={[0.02, -0.09, 0]}>
              <boxGeometry args={[0.045, 0.18, 0.24]} />
              <meshStandardMaterial color={flashRed ? '#ff2020' : '#f1f5f9'} />
            </mesh>
          </group>
          {/* Patas naranjas articuladas */}
          <group ref={limbFLRef} position={[-0.065, 0.15, 0]}>
            <mesh position={[0, -0.07, 0]}>
              <boxGeometry args={[0.035, 0.14, 0.035]} />
              <meshStandardMaterial color="#fbbf24" />
            </mesh>
            <mesh position={[0, -0.14, 0.025]}>
              <boxGeometry args={[0.07, 0.02, 0.08]} />
              <meshStandardMaterial color="#f59e0b" />
            </mesh>
          </group>
          <group ref={limbFRRef} position={[0.065, 0.15, 0]}>
            <mesh position={[0, -0.07, 0]}>
              <boxGeometry args={[0.035, 0.14, 0.035]} />
              <meshStandardMaterial color="#fbbf24" />
            </mesh>
            <mesh position={[0, -0.14, 0.025]}>
              <boxGeometry args={[0.07, 0.02, 0.08]} />
              <meshStandardMaterial color="#f59e0b" />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
});

import { TextureCache } from '../textures';

const SHARED_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const DoorStateContext = React.createContext<Record<string, boolean>>(EMPTY_OPEN_DOORS);

const ChunkLayer = React.memo<{ 
  type: BlockType; 
  instances: number[]; 
  onInteraction: (p: THREE.Vector3, n: THREE.Vector3, clientX: number, clientY: number, button?: number) => void;
  cx: number;
  cz: number;
  openDoors: Record<string, boolean>;
  doorAxes: Record<string, boolean>;
  currentBlockRef: React.MutableRefObject<BlockType>;
}>(({ type, instances, onInteraction, cx, cz, openDoors, doorAxes, currentBlockRef }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = instances.length / 3;
  // Monotonic capacity per (cx, cz, type) bucket so breaking a block NEVER tears down/recreates the InstancedMesh
  const maxCapRef = useRef(128);
  const prevLayerKeyRef = useRef('');
  const layerKey = `${cx},${cz},${type}`;
  if (prevLayerKeyRef.current !== layerKey) {
    prevLayerKeyRef.current = layerKey;
    maxCapRef.current = 128;
  }
  const targetCap = Math.max(128, Math.ceil(Math.max(1, count) / 256) * 256);
  if (targetCap > maxCapRef.current) {
    maxCapRef.current = targetCap;
  }
  const capacity = maxCapRef.current;

  useLayoutEffect(() => {
    if (meshRef.current) {
      for (let i = 0; i < count; i++) {
        const x = instances[i * 3];
        const y = instances[i * 3 + 1];
        const z = instances[i * 3 + 2];
        CHUNK_DUMMY.position.set(x, y, z);
        CHUNK_DUMMY.rotation.set(0, 0, 0);
        if (type === BlockType.MUSHROOM_RED || type === BlockType.MUSHROOM_BROWN || type === BlockType.FLOWER_RED || type === BlockType.FLOWER_YELLOW) {
          CHUNK_DUMMY.position.y -= 0.35;
          CHUNK_DUMMY.scale.set(0.5, 0.5, 0.5);
        } else if (type === BlockType.TORCH) {
          CHUNK_DUMMY.position.y -= 0.16;
          CHUNK_DUMMY.scale.set(0.16, 0.68, 0.16);
        } else if (type === BlockType.BED) {
          CHUNK_DUMMY.position.y -= 0.175;
          CHUNK_DUMMY.scale.set(0.9, 0.65, 1.8);
        } else if (type === BlockType.DOOR) {
          const coordKey = `${x},${y},${z}`;
          const isOpen = !!openDoors[coordKey];
          const axisZ = !!doorAxes[coordKey];
          // Keep door scale consistent on local X (1.0) & Z (0.16) so 90deg rotation never cancels out!
          CHUNK_DUMMY.scale.set(1.0, 2.0, 0.16);
          if (axisZ) {
            if (isOpen) {
              CHUNK_DUMMY.position.set(x, y + 0.5, z - 0.41);
              CHUNK_DUMMY.rotation.set(0, 0, 0);
            } else {
              CHUNK_DUMMY.position.set(x, y + 0.5, z);
              CHUNK_DUMMY.rotation.set(0, Math.PI / 2, 0);
            }
          } else {
            if (isOpen) {
              CHUNK_DUMMY.position.set(x - 0.41, y + 0.5, z);
              CHUNK_DUMMY.rotation.set(0, Math.PI / 2, 0);
            } else {
              CHUNK_DUMMY.position.set(x, y + 0.5, z);
              CHUNK_DUMMY.rotation.set(0, 0, 0);
            }
          }
        } else if (type === BlockType.CACTUS) {
          CHUNK_DUMMY.scale.set(0.875, 1, 0.875);
        } else if (type === BlockType.SUGAR_CANE || type === BlockType.BAMBOO) {
          CHUNK_DUMMY.scale.set(0.75, 1, 0.75);
        } else {
          CHUNK_DUMMY.scale.set(1, 1, 1);
        }
        CHUNK_DUMMY.updateMatrix();
        meshRef.current.setMatrixAt(i, CHUNK_DUMMY.matrix);
      }
      meshRef.current.count = count;
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.computeBoundingSphere();
      if (meshRef.current.boundingSphere) {
        meshRef.current.boundingSphere.radius += 1.0;
      }
    }
  }, [instances, count, type, cx, cz, openDoors, doorAxes]);

  const material = useMemo(
    () => TextureCache.getMaterial(type) || new THREE.MeshLambertMaterial({ color: BLOCK_COLORS[type] || '#ffffff' }),
    [type]
  );

  const meshArgs = useMemo(
    () => [SHARED_BOX_GEOMETRY, material as THREE.Material, capacity] as const,
    [material, capacity]
  );

  const liquidAwareRaycast = useCallback(
    function (this: THREE.InstancedMesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
      if ((type === BlockType.WATER || type === BlockType.LAVA) && currentBlockRef.current !== BlockType.BUCKET_EMPTY) {
        return;
      }
      THREE.InstancedMesh.prototype.raycast.call(this, raycaster, intersects);
    },
    [type, currentBlockRef]
  );

  return (
    <instancedMesh 
      ref={meshRef} 
      args={meshArgs}
      frustumCulled={true}
      raycast={liquidAwareRaycast}
      onPointerDown={(e) => {
        e.stopPropagation();
        const intersect = e.intersections[0];
        if (intersect && intersect.face) {
          onInteraction(intersect.point, intersect.face.normal, e.clientX, e.clientY, e.button);
        }
      }}
    />
  );
});

const DoorChunkLayer = React.memo<{
  type: BlockType;
  instances: number[];
  onInteraction: (p: THREE.Vector3, n: THREE.Vector3, clientX: number, clientY: number, button?: number) => void;
  cx: number;
  cz: number;
  doorAxes: Record<string, boolean>;
  currentBlockRef: React.MutableRefObject<BlockType>;
}>(({ type, instances, onInteraction, cx, cz, doorAxes, currentBlockRef }) => {
  const openDoors = React.useContext(DoorStateContext);
  return (
    <ChunkLayer
      type={type}
      instances={instances}
      onInteraction={onInteraction}
      cx={cx}
      cz={cz}
      openDoors={openDoors}
      doorAxes={doorAxes}
      currentBlockRef={currentBlockRef}
    />
  );
});

interface ChunkProps {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  neighborPX?: Uint8Array;
  neighborNX?: Uint8Array;
  neighborPZ?: Uint8Array;
  neighborNZ?: Uint8Array;
  onInteraction: (pos: THREE.Vector3, n: THREE.Vector3, clientX: number, clientY: number, button?: number) => void;
  currentBlockRef: React.MutableRefObject<BlockType>;
}

const isChunkBlockTransparent = (b: number) =>
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
  b === 28 || // DOOR
  b === 61 || // PORTAL
  b === BlockType.FIRE ||
  b === BlockType.VINES ||
  b === BlockType.SUGAR_CANE ||
  b === BlockType.BAMBOO ||
  b === BlockType.FROG_EGGS ||
  b === BlockType.CHICKEN_EGG ||
  b === BlockType.CHERRY_LEAVES ||
  b === BlockType.DARK_LEAVES;

const isBlockExposedTo = (type: BlockType, nb: number): boolean => {
  if (type === BlockType.WATER && nb === BlockType.WATER) return false;
  if (type === BlockType.LAVA && nb === BlockType.LAVA) return false;
  return isChunkBlockTransparent(nb);
};

const Chunk = React.memo<ChunkProps>(({ cx, cz, blocks, neighborPX, neighborNX, neighborPZ, neighborNZ, onInteraction, currentBlockRef }) => {
  const { layers, doorAxes } = useMemo(() => {
    const map = new Map<BlockType, number[]>();
    const dAxes: Record<string, boolean> = {};
    const y_mult = CHUNK_SIZE;
    const x_mult = CHUNK_SIZE * WORLD_HEIGHT;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const xMultOffset = x * x_mult;
      const atEdgePX = x === 15;
      const atEdgeNX = x === 0;
      
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wz = cz * CHUNK_SIZE + z;
        const xz_offset = xMultOffset + z;
        const atEdgePZ = z === 15;
        const atEdgeNZ = z === 0;
        
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const idx = xz_offset + (y * y_mult);
          const type = blocks[idx] as BlockType;
          if (type === 0) continue;

          const topExposed = y === WORLD_HEIGHT - 1 ? true : isBlockExposedTo(type, blocks[idx + y_mult]);
          const bottomExposed = y === 0 ? false : isBlockExposedTo(type, blocks[idx - y_mult]);
          const nbPX = atEdgePX ? (neighborPX ? neighborPX[(y * y_mult) + z] : 0) : blocks[idx + x_mult];
          const pxExposed = atEdgePX ? (neighborPX ? isBlockExposedTo(type, nbPX) : true) : isBlockExposedTo(type, nbPX);
          const nbNX = atEdgeNX ? (neighborNX ? neighborNX[(15 * x_mult) + (y * y_mult) + z] : 0) : blocks[idx - x_mult];
          const nxExposed = atEdgeNX ? (neighborNX ? isBlockExposedTo(type, nbNX) : true) : isBlockExposedTo(type, nbNX);
          const nbPZ = atEdgePZ ? (neighborPZ ? neighborPZ[xMultOffset + (y * y_mult)] : 0) : blocks[idx + 1];
          const pzExposed = atEdgePZ ? (neighborPZ ? isBlockExposedTo(type, nbPZ) : true) : isBlockExposedTo(type, nbPZ);
          const nbNZ = atEdgeNZ ? (neighborNZ ? neighborNZ[xMultOffset + (y * y_mult) + 15] : 0) : blocks[idx - 1];
          const nzExposed = atEdgeNZ ? (neighborNZ ? isBlockExposedTo(type, nbNZ) : true) : isBlockExposedTo(type, nbNZ);

          if (!topExposed && !bottomExposed && !pxExposed && !nxExposed && !pzExposed && !nzExposed) {
            continue;
          }

          // Skip rendering the top half of doors to prevent vertical double-door rendering overlap
          if (type === BlockType.DOOR && y > 0 && blocks[idx - y_mult] === BlockType.DOOR) {
            continue;
          }

          if (type === BlockType.DOOR) {
            const xWalls = (!isChunkBlockTransparent(nbPX) ? 1 : 0) + (!isChunkBlockTransparent(nbNX) ? 1 : 0);
            const zWalls = (!isChunkBlockTransparent(nbPZ) ? 1 : 0) + (!isChunkBlockTransparent(nbNZ) ? 1 : 0);
            if (zWalls > xWalls) {
              dAxes[`${wx},${y},${wz}`] = true;
            }
          }

          let arr = map.get(type);
          if (!arr) {
            arr = [];
            map.set(type, arr);
          }
          arr.push(wx, y, wz);
        }
      }
    }
    return { layers: Array.from(map.entries()), doorAxes: dAxes };
  }, [blocks, cx, cz, neighborPX, neighborNX, neighborPZ, neighborNZ]);

  return (
    <group>
      {layers.map(([type, instances]) =>
        type === BlockType.DOOR ? (
          <DoorChunkLayer
            key={type}
            type={type}
            instances={instances}
            onInteraction={onInteraction}
            cx={cx}
            cz={cz}
            doorAxes={doorAxes}
            currentBlockRef={currentBlockRef}
          />
        ) : (
          <ChunkLayer
            key={type}
            type={type}
            instances={instances}
            onInteraction={onInteraction}
            cx={cx}
            cz={cz}
            openDoors={EMPTY_OPEN_DOORS}
            doorAxes={EMPTY_DOOR_AXES}
            currentBlockRef={currentBlockRef}
          />
        )
      )}
    </group>
  );
});

interface OtherPlayerProps extends ActivePlayerInfo {
  localPlayerPosRef: React.MutableRefObject<Vector3D>;
}

const OtherPlayer = React.memo<OtherPlayerProps>(({
  id,
  name,
  pos,
  yaw = 0,
  pitch = 0,
  skinId = 'cyber',
  customSkin,
  heldBlock,
  attackSeq = 0,
  localPlayerPosRef,
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

  const smoothPosRef = useRef({
    x: typeof pos?.x === 'number' && !isNaN(pos.x) ? pos.x : 0,
    y: typeof pos?.y === 'number' && !isNaN(pos.y) ? pos.y : 80,
    z: typeof pos?.z === 'number' && !isNaN(pos.z) ? pos.z : 0,
  });
  const smoothYawRef = useRef(yaw);
  const swingProgressRef = useRef(0);
  const lastAttackSeqRef = useRef(attackSeq);
  const walkPhaseRef = useRef(0);

  useEffect(() => {
    if (attackSeq > lastAttackSeqRef.current) {
      lastAttackSeqRef.current = attackSeq;
      swingProgressRef.current = 1.0;
    }
  }, [attackSeq]);

  const targetX = typeof pos?.x === 'number' && !isNaN(pos.x) ? pos.x : 0;
  const targetY = typeof pos?.y === 'number' && !isNaN(pos.y) ? pos.y : 80;
  const targetZ = typeof pos?.z === 'number' && !isNaN(pos.z) ? pos.z : 0;

  const skinPreset = resolveCharacterSkin(skinId, customSkin);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const minDelta = Math.min(delta, 0.1);

    const prevX = smoothPosRef.current.x;
    const prevZ = smoothPosRef.current.z;

    smoothPosRef.current.x = THREE.MathUtils.damp(smoothPosRef.current.x, targetX, 10, minDelta);
    smoothPosRef.current.y = THREE.MathUtils.damp(smoothPosRef.current.y, targetY - 1.5, 12, minDelta);
    smoothPosRef.current.z = THREE.MathUtils.damp(smoothPosRef.current.z, targetZ, 10, minDelta);

    groupRef.current.position.set(
      smoothPosRef.current.x,
      smoothPosRef.current.y,
      smoothPosRef.current.z
    );

    // Shortest-angle yaw interpolation
    const diffYaw = Math.atan2(Math.sin(yaw - smoothYawRef.current), Math.cos(yaw - smoothYawRef.current));
    smoothYawRef.current += diffYaw * (1 - Math.exp(-12 * minDelta));
    groupRef.current.rotation.set(0, smoothYawRef.current, 0);

    // Detect real movement speed from position delta
    const moveDist = Math.hypot(targetX - prevX, targetZ - prevZ);
    const isMoving = moveDist > 0.03;
    const timeVal = state.clock.getElapsedTime();

    if (isMoving) {
      walkPhaseRef.current += minDelta * 12.0;
      const angle = Math.sin(walkPhaseRef.current) * 0.55;
      if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, angle, 15, minDelta);
      if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, -angle, 15, minDelta);
      if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, -angle, 15, minDelta);
      if (rightArmRef.current && swingProgressRef.current <= 0) {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, angle, 15, minDelta);
      }
      if (torsoGroupRef.current) {
        torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(torsoGroupRef.current.rotation.x, -0.06, 10, minDelta);
      }
      if (capeRef.current) {
        capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.35 + Math.sin(timeVal * 10) * 0.08, 10, minDelta);
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
      if (torsoGroupRef.current) {
        torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(torsoGroupRef.current.rotation.x, 0, 10, minDelta);
      }
      if (capeRef.current) {
        capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.08 + breath, 8, minDelta);
      }
    }

    if (headGroupRef.current) {
      headGroupRef.current.rotation.x = THREE.MathUtils.damp(headGroupRef.current.rotation.x, pitch * 0.6, 12, minDelta);
    }

    // Remote player attack animation
    if (swingProgressRef.current > 0) {
      swingProgressRef.current = Math.max(0, swingProgressRef.current - minDelta * 6.5);
      const swing = Math.sin((1 - swingProgressRef.current) * Math.PI);
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -swing * 1.55;
        rightArmRef.current.rotation.y = -swing * 0.4;
      }
    }

    // Live distance label update without triggering React renders
    if (distSpanRef.current && localPlayerPosRef.current) {
      const lp = localPlayerPosRef.current;
      const dist = Math.round(Math.hypot(targetX - lp.x, targetY - lp.y, targetZ - lp.z));
      const text = `${dist}m`;
      if (distSpanRef.current.textContent !== text) {
        distSpanRef.current.textContent = text;
      }
    }
  });

  return (
    <group ref={groupRef} position={[targetX, targetY - 1.5, targetZ]}>
      {/* Floating high-visibility name tag */}
      <Html position={[0, 1.95, 0]} center distanceFactor={18} zIndexRange={[10, 50]}>
        <div
          className="flex items-center gap-1.5 bg-zinc-950/90 px-2.5 py-1 rounded-md text-white font-mono text-[11px] font-bold whitespace-nowrap pointer-events-none select-none uppercase tracking-wider shadow-lg"
          style={{ border: `1px solid ${skinPreset.badgeColor}66` }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: skinPreset.badgeColor }}
          />
          <span style={{ color: skinPreset.badgeColor }}>{name}</span>
          <span ref={distSpanRef} className="text-[9px] text-zinc-400 font-normal ml-0.5">
            0m
          </span>
        </div>
      </Html>

      <CharacterModel
        skinId={skinId}
        customSkin={customSkin}
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
});

const Player: React.FC<{ 
  moveVector: { x: number; y: number }; 
  lookOffsetRef: React.MutableRefObject<{ x: number, y: number }>;
  onUpdatePos: (p: Vector3D) => void;
  isJumping: boolean;
  getCollisionHeight: (x: number, z: number, currentY: number) => number;
  checkSolid: (x: number, y: number, z: number) => boolean;
  perspective: 'first' | 'second' | 'third';
  gameMode?: 'creative' | 'survival' | 'adventure' | 'spectator' | 'creativo' | 'supervivencia' | 'aventura' | 'espectador';
  worldType?: string;
  chunks: Record<string, Uint8Array>;
  playerPosRef: React.MutableRefObject<Vector3D>;
  playerPos: Vector3D;
  onPortalTeleport?: () => void;
  autoJumpEnabled?: boolean;
  isZooming?: boolean;
  fov?: number;
  particlesRef?: React.MutableRefObject<any[]>;
  attackTrigger?: number;
  characterSkin?: CharacterSkinId;
  customSkin?: CustomCharacterConfig;
  currentBlock?: BlockType;
  playerPoseRef?: React.MutableRefObject<{ yaw: number; pitch: number }>;
  externalMoveVectorRef?: React.MutableRefObject<{ x: number; y: number }>;
}> = ({ moveVector, lookOffsetRef, onUpdatePos, isJumping, getCollisionHeight, checkSolid, perspective, gameMode = 'survival', worldType = 'normal', chunks, playerPosRef, playerPos, onPortalTeleport, autoJumpEnabled = true, isZooming = false, fov = 65, particlesRef, attackTrigger, characterSkin = 'cyber', customSkin, currentBlock, playerPoseRef, externalMoveVectorRef }) => {
  const onPortalTeleportRef = useRef(onPortalTeleport);
  onPortalTeleportRef.current = onPortalTeleport;
  const { camera } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const playerGroupRef = useRef<THREE.Group>(null);
  const torsoGroupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const capeRef = useRef<THREE.Mesh>(null);
  const isMovingRef = useRef(false);
  const stepTimer = useRef(0);
  const lastStepPlayed = useRef(false);
  const lastStateUpdate = useRef(0);
  const velocityY = useRef(0);
  const initialized = useRef(false);
  const physPos = useRef(new THREE.Vector3(0, 80, 0));

  const armSwingProgress = useRef(0);
  const firstPersonSwingRef = useRef(0);
  const lastAttackTriggerRef = useRef(attackTrigger || 0);
  useEffect(() => {
    if (attackTrigger && attackTrigger > (lastAttackTriggerRef.current || 0)) {
      lastAttackTriggerRef.current = attackTrigger;
      armSwingProgress.current = 1.0;
      firstPersonSwingRef.current = 1.0;
    }
  }, [attackTrigger]);

  const isFlying = useRef(false);
  const wasJumping = useRef(false);
  const lastJumpTime = useRef(0);
  const autoJumpCooldownRef = useRef(0);
  const portalTimerRef = useRef(0);
  const lavaDamageTimerRef = useRef(0);

  const checkSolidRef = useRef(checkSolid);
  checkSolidRef.current = checkSolid;
  const getCollisionHeightRef = useRef(getCollisionHeight);
  getCollisionHeightRef.current = getCollisionHeight;
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const internalMoveVectorRef = useRef(moveVector);
  internalMoveVectorRef.current = moveVector;
  const moveVectorRef = externalMoveVectorRef || internalMoveVectorRef;
  const isJumpingRef = useRef(isJumping);
  isJumpingRef.current = isJumping;
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;
  const perspectiveRef = useRef(perspective);
  perspectiveRef.current = perspective;
  const isSpectator = gameMode === 'spectator' || gameMode === 'espectador';
  const onUpdatePosRef = useRef(onUpdatePos);
  onUpdatePosRef.current = onUpdatePos;
  const recentReportedRef = useRef<Vector3D[]>([]);

  // React ONLY to genuine external teleports (/tp, respawn, portal), ignoring our own movement echoes
  useEffect(() => {
    const reported = recentReportedRef.current;
    for (let i = 0; i < reported.length; i++) {
      const r = reported[i];
      const d = (playerPos.x - r.x) * (playerPos.x - r.x) + (playerPos.y - r.y) * (playerPos.y - r.y) + (playerPos.z - r.z) * (playerPos.z - r.z);
      if (d < 0.04) {
        return;
      }
    }
    const dx = playerPos.x - physPos.current.x;
    const dy = playerPos.y - physPos.current.y;
    const dz = playerPos.z - physPos.current.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    // Over a threshold indicates an actual external teleport rather than standard player step ticks
    if (distSq > 4.0) {
      physPos.current.set(playerPos.x, playerPos.y, playerPos.z);
      velocityY.current = 0;
      initialized.current = false; // Ensures terrain & chunks are ready at teleport destination
    }
  }, [playerPos.x, playerPos.y, playerPos.z]);

  const lastAmbientUpdate = useRef(0);

  const getBlockTypeAt = useCallback((x: number, y: number, z: number): BlockType => {
    const wx = Math.round(x);
    const wy = Math.round(y);
    const wz = Math.round(z);
    if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    const chunkTable = chunksRef.current;
    const chunk = chunkTable[k];
    if (!chunk) return BlockType.AIR;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
    return chunk[idx] || BlockType.AIR;
  }, []);

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
    const minDelta = Math.min(delta, 0.05);
    const lookSpeed = 0.004;
    
    // Slow down speed dynamically when approaching or entering Far Lands (X/Z boundaries)
    const currentAbsCoordForSpeed = Math.max(Math.abs(physPos.current.x), Math.abs(physPos.current.z));
    let moveSpeed = 6.0;
    if (currentAbsCoordForSpeed >= 2000) {
      const ratio = Math.min(1.0, (currentAbsCoordForSpeed - 2000) / 300);
      moveSpeed = 6.0 - ratio * (6.0 - 0.9);
    } else if (currentAbsCoordForSpeed >= 1500) {
      moveSpeed = 3.0;
    } else if (currentAbsCoordForSpeed >= 1400) {
      moveSpeed = 4.5;
    }

    yaw.current -= lookOffsetRef.current.x * lookSpeed;
    pitch.current -= lookOffsetRef.current.y * lookSpeed;
    pitch.current = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch.current));

    lookOffsetRef.current.x = 0;
    lookOffsetRef.current.y = 0;

    // Movement directions decoupled from camera rotation (reusing scratch vectors, fast 2D trig)
    const sinY = Math.sin(yaw.current);
    const cosY = Math.cos(yaw.current);
    PLAYER_FWD_SCRATCH.set(-sinY, 0, -cosY);
    PLAYER_RIGHT_SCRATCH.set(cosY, 0, -sinY);
    PLAYER_DIR_SCRATCH.set(0, 0, 0)
      .addScaledVector(PLAYER_FWD_SCRATCH, moveVectorRef.current.y)
      .addScaledVector(PLAYER_RIGHT_SCRATCH, moveVectorRef.current.x);

    let px = physPos.current.x;
    let py = physPos.current.y;
    let pz = physPos.current.z;
    const startPx = px;
    const startPz = pz;

    const r = 0.3;
    const hBottom = 1.5;
    const hTop = 0.3;
    const eps = 0.001;

    const isCreative = gameModeRef.current === 'creative' || gameModeRef.current === 'creativo';
    const isSpectator = gameModeRef.current === 'spectator' || gameModeRef.current === 'espectador';

    // Water detection at feet, waist, and eyes
    const blockAtFeet = !isSpectator && getBlockTypeAt(px, py - 1.42, pz) === BlockType.WATER;
    const blockAtWaist = !isSpectator && getBlockTypeAt(px, py - 0.85, pz) === BlockType.WATER;
    const blockAtHead = !isSpectator && getBlockTypeAt(px, py - 0.05, pz) === BlockType.WATER;
    const isInWater = blockAtFeet || blockAtWaist || blockAtHead;
    const isHeadUnderwater = blockAtHead;
    const isDeepSwim = blockAtWaist || blockAtHead;

    if (isInWater && !isFlying.current) {
      moveSpeed *= gameState.aquaticPerk ? 1.18 : 0.76;
    }

    let dx = 0;
    let dz = 0;
    let intentUnitX = 0;
    let intentUnitZ = 0;
    const dirLen = PLAYER_DIR_SCRATCH.length();

    if (dirLen > 0.02) {
      const inputScale = Math.min(1.0, dirLen);
      intentUnitX = PLAYER_DIR_SCRATCH.x / dirLen;
      intentUnitZ = PLAYER_DIR_SCRATCH.z / dirLen;
      dx = intentUnitX * moveSpeed * inputScale * minDelta;
      dz = intentUnitZ * moveSpeed * inputScale * minDelta;
    } else {
      PLAYER_DIR_SCRATCH.set(0, 0, 0);
    }

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
    } else if (isSpectator) {
      isFlying.current = true;
    } else {
      isFlying.current = false;
    }
    wasJumping.current = isJumpingRef.current;

    let dy = 0;
    if (isFlying.current) {
      if (isJumpingRef.current) {
        velocityY.current = 8.0;
      } else if (isSpectator) {
        if (dirLen > 0.02) {
          velocityY.current = Math.sin(pitch.current) * moveSpeed * Math.min(1.0, dirLen);
        } else {
          velocityY.current = 0;
        }
      } else {
        velocityY.current = 0.0;
        if (pitch.current < -1.0 && dirLen > 0.02) {
          velocityY.current = -5.0;
        }
      }
      dy = velocityY.current * minDelta;
    } else if (isInWater) {
      // Swimming & buoyancy physics in water
      const swimUpSpeed = gameState.aquaticPerk ? 5.8 : 4.7;
      if (isJumpingRef.current) {
        if (!isHeadUnderwater && isDeepSwim) {
          // Strong surface bob / shore exit jump
          velocityY.current = Math.max(velocityY.current, 5.7);
        } else {
          velocityY.current = THREE.MathUtils.damp(velocityY.current, swimUpSpeed, 11, minDelta);
        }
      } else if (dirLen > 0.05 && Math.abs(pitch.current) > 0.22 && isDeepSwim) {
        // Dive or rise along look pitch when swimming forward
        const pitchVy = Math.sin(pitch.current) * (gameState.aquaticPerk ? 5.2 : 3.9);
        velocityY.current = THREE.MathUtils.damp(velocityY.current, pitchVy, 8, minDelta);
      } else if (isHeadUnderwater) {
        // Gentle neutral sink when underwater and idle
        velocityY.current = THREE.MathUtils.damp(velocityY.current, -0.85, 6, minDelta);
      } else if (blockAtWaist) {
        // Float steadily right at the water surface
        velocityY.current = THREE.MathUtils.damp(velocityY.current, -0.15, 8, minDelta);
      } else {
        // Shallow water (feet only): lighter water gravity so walking into shore feels natural
        velocityY.current = Math.max(-6.5, velocityY.current - 11.0 * minDelta);
      }
      velocityY.current = Math.max(-6.5, Math.min(6.8, velocityY.current));
      dy = velocityY.current * minDelta;
    } else {
      velocityY.current -= 25.0 * minDelta;
      dy = velocityY.current * minDelta;
    }

    // AABB Bounds
    let pMinX = px - r; let pMaxX = px + r;
    let pMinY = py - hBottom; let pMaxY = py + hTop;
    let pMinZ = pz - r; let pMaxZ = pz + r;

    // Populate pre-allocated box pool (expand maxBy by +2 to guarantee 2-block and 3+ block walls are covered for auto-jump probe)
    let blockCount = 0;
    const minBx = Math.floor(Math.min(pMinX, pMinX + dx) - 1);
    const maxBx = Math.floor(Math.max(pMaxX, pMaxX + dx) + 1);
    const minBy = Math.floor(Math.min(pMinY, pMinY + dy) - 1);
    const maxBy = Math.floor(Math.max(pMaxY, pMaxY + dy) + 2);
    const minBz = Math.floor(Math.min(pMinZ, pMinZ + dz) - 1);
    const maxBz = Math.floor(Math.max(pMaxZ, pMaxZ + dz) + 1);
    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        for (let bz = minBz; bz <= maxBz; bz++) {
          if (checkSolidRef.current(bx, by, bz) && blockCount < PLAYER_BOX_POOL.length) {
            const box = PLAYER_BOX_POOL[blockCount++];
            box.minX = bx - 0.5;
            box.minY = by - 0.5;
            box.minZ = bz - 0.5;
            box.maxX = bx + 0.5;
            box.maxY = by + 0.5;
            box.maxZ = bz + 0.5;
          }
        }
      }
    }

    let origDx = dx;
    let origDz = dz;
    let origDy = dy;

    let isGrounded = false;

    if (isSpectator) {
      pMinY += dy; pMaxY += dy;
      pMinX += dx; pMaxX += dx;
      pMinZ += dz; pMaxZ += dz;
    } else {
      for (let i = 0; i < blockCount; i++) {
          const b = PLAYER_BOX_POOL[i];
          if (pMaxX > b.minX && pMinX < b.maxX && pMaxZ > b.minZ && pMinZ < b.maxZ) {
              if (dy > 0 && pMaxY <= b.minY + 0.3) dy = Math.min(dy, b.minY - pMaxY - eps);
              else if (dy < 0 && pMinY >= b.maxY - 0.3) dy = Math.max(dy, b.maxY - pMinY + eps);
          }
      }
      pMinY += dy; pMaxY += dy;

      for (let i = 0; i < blockCount; i++) {
          const b = PLAYER_BOX_POOL[i];
          if (pMaxY > b.minY && pMinY < b.maxY && pMaxZ > b.minZ && pMinZ < b.maxZ) {
              if (dx > 0 && pMaxX <= b.minX + 0.3) dx = Math.min(dx, b.minX - pMaxX - eps);
              else if (dx < 0 && pMinX >= b.maxX - 0.3) dx = Math.max(dx, b.maxX - pMinX + eps);
          }
      }
      pMinX += dx; pMaxX += dx;

      for (let i = 0; i < blockCount; i++) {
          const b = PLAYER_BOX_POOL[i];
          if (pMaxY > b.minY && pMinY < b.maxY && pMaxX > b.minX && pMinX < b.maxX) {
              if (dz > 0 && pMaxZ <= b.minZ + 0.3) dz = Math.min(dz, b.minZ - pMaxZ - eps);
              else if (dz < 0 && pMinZ >= b.maxZ - 0.3) dz = Math.max(dz, b.maxZ - pMinZ + eps);
          }
      }
      pMinZ += dz; pMaxZ += dz;

      if (dy !== origDy) {
          if (origDy < 0 && dy > origDy) isGrounded = true;
          velocityY.current = 0;
      }
    }

    px = pMinX + r;
    py = pMinY + hBottom;
    pz = pMinZ + r;

    const actualMoved = Math.hypot(px - startPx, pz - startPz);
    if (actualMoved > 0.001 && !isFlying.current) {
      stepTimer.current += actualMoved * 2.5;
      const bob = Math.sin(stepTimer.current);
      if (!isDeepSwim && isGrounded && bob < -0.9 && !lastStepPlayed.current) {
        const footBlock = getBlockTypeAt(px, py - 1.6, pz);
        playStepSound(footBlock, 0.04);
        lastStepPlayed.current = true;
      } else if (bob > 0) {
        lastStepPlayed.current = false;
      }
    }

    const isFlat = worldType === 'flat' || worldType === 'plano' || worldType === 'plano_infinito';

    if (autoJumpCooldownRef.current > 0) {
      autoJumpCooldownRef.current = Math.max(0, autoJumpCooldownRef.current - minDelta);
    }

    // Auto-Jump: ONLY trigger when intentionally pushing into a strictly 1-block climbable ledge with clear headroom
    if (autoJumpEnabled && (isGrounded || (isInWater && !isHeadUnderwater)) && !isFlying.current && dirLen > 0.12 && autoJumpCooldownRef.current <= 0) {
        const isBlockedX = origDx !== dx && Math.abs(dx) < Math.abs(origDx) - 0.001 && Math.abs(intentUnitX) > 0.35;
        const isBlockedZ = origDz !== dz && Math.abs(dz) < Math.abs(origDz) - 0.001 && Math.abs(intentUnitZ) > 0.35;
        if (isBlockedX || isBlockedZ) {
            const stepProbeDx = isBlockedX ? Math.sign(origDx) * 0.22 : 0;
            const stepProbeDz = isBlockedZ ? Math.sign(origDz) * 0.22 : 0;

            const fwdMinX = px + stepProbeDx - r + 0.02;
            const fwdMaxX = px + stepProbeDx + r - 0.02;
            const fwdMinZ = pz + stepProbeDz - r + 0.02;
            const fwdMaxZ = pz + stepProbeDz + r - 0.02;

            const elevatedMinY = pMinY + 1.05;
            const elevatedMaxY = pMaxY + 1.05;
            const headAboveMinY = pMaxY + 0.03;
            const headAboveMaxY = pMaxY + 1.1;

            let canClearStep = true;
            let hasLowStepObstacle = false;

            for (let i = 0; i < blockCount; i++) {
                const b = PLAYER_BOX_POOL[i];
                if (pMaxX - 0.02 > b.minX && pMinX + 0.02 < b.maxX && pMaxZ - 0.02 > b.minZ && pMinZ + 0.02 < b.maxZ) {
                    if (headAboveMaxY > b.minY && headAboveMinY < b.maxY) {
                        canClearStep = false;
                        break;
                    }
                }
                if (fwdMaxX > b.minX && fwdMinX < b.maxX && fwdMaxZ > b.minZ && fwdMinZ < b.maxZ) {
                    if (elevatedMaxY > b.minY && elevatedMinY < b.maxY) {
                        canClearStep = false;
                        break;
                    }
                    if (pMinY + 0.98 > b.minY && pMinY + 0.04 < b.maxY) {
                        hasLowStepObstacle = true;
                    }
                }
            }

            if (canClearStep && hasLowStepObstacle) {
                velocityY.current = isInWater ? 6.6 : 8.5;
                autoJumpCooldownRef.current = 0.28;
                if (!isCreative) {
                    gameState.addExhaustion(0.1);
                }
            }
        }
    }

    if (isJumpingRef.current && isGrounded && !isFlying.current && !isDeepSwim) {
        velocityY.current = 8.5;
        if (!isCreative) {
            gameState.addExhaustion(0.1);
        }
    }

    // Swimming bubble & splash particles
    if (isInWater && (dirLen > 0.05 || isJumpingRef.current || Math.abs(velocityY.current) > 0.7) && particlesRef && particlesRef.current && Math.random() < 0.22) {
      particlesRef.current.push({
        id: Date.now() + Math.random(),
        x: px + (Math.random() - 0.5) * 0.6,
        y: isHeadUnderwater ? (py - 0.4 + Math.random() * 0.5) : (py - 0.8 + Math.random() * 0.35),
        z: pz + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 0.4,
        vy: isHeadUnderwater ? (0.65 + Math.random() * 0.45) : (0.9 + Math.random() * 0.6),
        vz: (Math.random() - 0.5) * 0.4,
        color: Math.random() > 0.45 ? '#7dd3fc' : '#e0f2fe',
        size: isHeadUnderwater ? 0.075 : 0.095,
        life: 0.55
      });
    }

    // Oxygen / drowning update
    if (!isSpectator) {
      const tookDrownDamage = gameState.updateWaterState(isInWater, isHeadUnderwater, minDelta);
      if (tookDrownDamage) {
        playHurtSound();
      }
    } else {
      gameState.updateWaterState(false, false, minDelta);
    }

    // Exhaustion for walking or swimming
    if ((isGrounded || isInWater) && (dx !== 0 || dz !== 0)) {
        if (!isCreative) {
            const dist = Math.sqrt(dx*dx + dz*dz);
            gameState.addExhaustion(dist * (isInWater ? 0.065 : 0.05));
        }
    }

    if (isCreative || isSpectator) {
        if (gameState.health < 20) gameState.setHealth(20);
        if (gameState.food < 20) gameState.setFood(20);
        if (py < 0 && isCreative) {
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
        if (gameState.isRegenerating && particlesRef && particlesRef.current && Math.random() < 0.06) {
          particlesRef.current.push({
            id: Date.now() + Math.random(),
            x: px + (Math.random() - 0.5) * 0.7,
            y: py - 0.2 + Math.random() * 0.9,
            z: pz + (Math.random() - 0.5) * 0.7,
            vx: (Math.random() - 0.5) * 0.1,
            vy: 0.35 + Math.random() * 0.25,
            vz: (Math.random() - 0.5) * 0.1,
            color: Math.random() > 0.4 ? '#ef4444' : '#10b981',
            size: 0.08,
            life: 0.7
          });
        }
    }

    if (gameState.health <= 0) {
        px = 0;
        pz = 0;
        py = (isFlat ? 55 : getWorldHeight(0, 0).h) + 2;
        velocityY.current = 0;
        gameState.setHealth(20);
        gameState.setFood(20);
        gameState.air = 20;
        gameState.exhaustion = 0;
    }

    // Lava and Portal fluid checks
    try {
      let isInsidePortal = false;
      for (let pdy = -1.6; pdy <= 0.2; pdy += 0.4) {
        if (getBlockTypeAt(px, py + pdy, pz) === BlockType.PORTAL) {
          isInsidePortal = true;
          break;
        }
      }
      if (isInsidePortal) {
        portalTimerRef.current += minDelta;
        if (portalTimerRef.current >= 1.5) {
          portalTimerRef.current = 0;
          if (onPortalTeleportRef.current) {
            onPortalTeleportRef.current();
          }
        }
      } else {
        portalTimerRef.current = 0;
      }

      const isInsideLava = getBlockTypeAt(px, py, pz) === BlockType.LAVA || 
                           getBlockTypeAt(px, py - 0.8, pz) === BlockType.LAVA || 
                           getBlockTypeAt(px, py - 1.5, pz) === BlockType.LAVA;
      if (isInsideLava && !isCreative && !isSpectator) {
        lavaDamageTimerRef.current += minDelta;
        if (lavaDamageTimerRef.current >= 0.5) {
          lavaDamageTimerRef.current = 0;
          gameState.setHealth(Math.max(0, gameState.health - 4));
          playHurtSound();
        }
      } else {
        lavaDamageTimerRef.current = 0;
      }
    } catch (e) {}

    // Small view bob effect visually attached to camera but doesn't affect physical Y
    physPos.current.set(px, py, pz);
    playerPosRef.current.x = px;
    playerPosRef.current.y = py;
    playerPosRef.current.z = pz;

    let visualY = py;
    if ((isGrounded || isInWater) && actualMoved > 0.001) {
        visualY += Math.sin(stepTimer.current) * (isInWater ? 0.03 : 0.04);
    }

    // Camera positioning based on perspective (forward is (-sin(yaw), sin(pitch), -cos(yaw)))
    const radius = 3.8;
    const fwdX = -Math.sin(yaw.current) * Math.cos(pitch.current);
    const fwdY = Math.sin(pitch.current);
    const fwdZ = -Math.cos(yaw.current) * Math.cos(pitch.current);

    if (perspectiveRef.current === 'second') {
      camera.position.set(px + fwdX * radius, visualY + 0.65 + fwdY * 1.1, pz + fwdZ * radius);
      camera.lookAt(px, visualY - 0.1, pz);
    } else if (perspectiveRef.current === 'third') {
      camera.position.set(px - fwdX * radius, visualY + 0.9 - fwdY * 1.1, pz - fwdZ * radius);
      camera.lookAt(px + fwdX * 2.5, visualY + fwdY * 2.0, pz + fwdZ * 2.5);
    } else {
      camera.position.set(px, visualY, pz);
      camera.rotation.set(0, 0, 0, 'YXZ');
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
      camera.rotation.z = 0;
    }

    if (playerPoseRef) {
      playerPoseRef.current.yaw = yaw.current;
      playerPoseRef.current.pitch = pitch.current;
    }

    const targetFov = isZooming ? 15 : fov;
    const pCamera = camera as any;
    if (pCamera && pCamera.fov !== undefined && pCamera.fov !== targetFov) {
      pCamera.fov = targetFov;
      pCamera.updateProjectionMatrix();
    }

    const isMoving = Math.abs(moveVectorRef.current.x) > 0.01 || Math.abs(moveVectorRef.current.y) > 0.01;
    isMovingRef.current = isMoving && (isGrounded || isInWater);

    // Directly keep the player model perfectly snapped and rotated with the tick loop
    if (playerGroupRef.current) {
        playerGroupRef.current.position.set(px, py - 1.5, pz);
        playerGroupRef.current.rotation.set(0, yaw.current, 0);

        const timeVal = state.clock.getElapsedTime();
        const swingSpeed = 13.0;
        const swingAmp = 0.56;

        if (isDeepSwim && !isGrounded && !isFlying.current) {
          // Animated 3D Swimming Pose (front-crawl arm strokes + flutter kicks)
          const swimRate = isMoving ? 9.5 : 4.2;
          const armCrawl = Math.sin(timeVal * swimRate) * (isMoving ? 0.9 : 0.4);
          const legKick = Math.sin(timeVal * (swimRate * 1.35)) * (isMoving ? 0.62 : 0.25);

          if (torsoGroupRef.current) {
            torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(
              torsoGroupRef.current.rotation.x,
              isMoving ? -0.62 : -0.22,
              10,
              minDelta
            );
          }
          if (leftArmRef.current) {
            leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, -1.1 + armCrawl, 14, minDelta);
            leftArmRef.current.rotation.z = THREE.MathUtils.damp(leftArmRef.current.rotation.z, -0.32, 12, minDelta);
          }
          if (rightArmRef.current && armSwingProgress.current <= 0) {
            rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, -1.1 - armCrawl, 14, minDelta);
            rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, 0.32, 12, minDelta);
          }
          if (leftLegRef.current) {
            leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, 0.35 + legKick, 14, minDelta);
          }
          if (rightLegRef.current) {
            rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, 0.35 - legKick, 14, minDelta);
          }
          if (capeRef.current) {
            capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.45 + Math.sin(timeVal * 7) * 0.14, 10, minDelta);
          }
          if (headGroupRef.current) {
            headGroupRef.current.rotation.x = THREE.MathUtils.damp(headGroupRef.current.rotation.x, pitch.current * 0.55 + 0.3, 12, minDelta);
            headGroupRef.current.rotation.y = THREE.MathUtils.damp(headGroupRef.current.rotation.y, Math.sin(timeVal * swimRate) * 0.08, 10, minDelta);
          }
        } else if (isMoving && isGrounded) {
          const angle = Math.sin(timeVal * swingSpeed) * swingAmp;
          if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, -angle, 18, minDelta);
          if (rightArmRef.current && armSwingProgress.current <= 0) {
            rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, angle, 18, minDelta);
          }
          if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, angle, 18, minDelta);
          if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, -angle, 18, minDelta);
          if (torsoGroupRef.current) {
            torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(torsoGroupRef.current.rotation.x, -0.07, 12, minDelta);
          }
          if (capeRef.current) {
            capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.38 + Math.sin(timeVal * 11) * 0.08, 12, minDelta);
          }
          if (headGroupRef.current) {
            headGroupRef.current.rotation.y = Math.sin(timeVal * 3.5) * 0.04;
            headGroupRef.current.rotation.x = THREE.MathUtils.damp(headGroupRef.current.rotation.x, pitch.current * 0.6 + Math.abs(Math.cos(timeVal * swingSpeed)) * 0.04, 14, minDelta);
          }
        } else {
          const breathVal = Math.sin(timeVal * 2.2) * 0.03;
          if (leftArmRef.current) {
            leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, 0, 12, minDelta);
            leftArmRef.current.rotation.z = THREE.MathUtils.damp(leftArmRef.current.rotation.z, -0.05 - breathVal, 12, minDelta);
          }
          if (rightArmRef.current && armSwingProgress.current <= 0) {
            rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, 0, 12, minDelta);
            rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, 0.05 + breathVal, 12, minDelta);
            rightArmRef.current.rotation.y = THREE.MathUtils.damp(rightArmRef.current.rotation.y, 0, 12, minDelta);
          }
          if (leftLegRef.current) {
            leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, 0, 12, minDelta);
          }
          if (rightLegRef.current) {
            rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, 0, 12, minDelta);
          }
          if (torsoGroupRef.current) {
            torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(torsoGroupRef.current.rotation.x, 0, 10, minDelta);
          }
          if (capeRef.current) {
            capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.08 + breathVal, 8, minDelta);
          }
          if (headGroupRef.current) {
            headGroupRef.current.rotation.y = THREE.MathUtils.damp(headGroupRef.current.rotation.y, 0, 10, minDelta);
            headGroupRef.current.rotation.x = THREE.MathUtils.damp(headGroupRef.current.rotation.x, pitch.current * 0.6 + breathVal * 0.5, 14, minDelta);
          }
        }

        // Mid-air flying/falling spreading arm poses (when not submerged swimming)
        if (!isGrounded && !isFlying.current && !isDeepSwim) {
          const fallVel = velocityY.current;
          const targetSpread = Math.min(0.45, Math.max(0.12, Math.abs(fallVel) * 0.12));
          if (leftArmRef.current) {
            leftArmRef.current.rotation.z = THREE.MathUtils.damp(leftArmRef.current.rotation.z, -targetSpread - 0.15, 14, minDelta);
            leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, -0.25, 14, minDelta);
          }
          if (rightArmRef.current && armSwingProgress.current <= 0) {
            rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, targetSpread + 0.15, 14, minDelta);
            rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, -0.25, 14, minDelta);
          }
          if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, 0.22, 14, minDelta);
          if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, -0.14, 14, minDelta);
          if (capeRef.current) capeRef.current.rotation.x = THREE.MathUtils.damp(capeRef.current.rotation.x, 0.55, 10, minDelta);
        }

        // Active attack melee swing animation
        if (armSwingProgress.current > 0) {
          armSwingProgress.current = Math.max(0, armSwingProgress.current - minDelta * 6.5);
          const swing = Math.sin((1 - armSwingProgress.current) * Math.PI);
          if (rightArmRef.current) {
            rightArmRef.current.rotation.x = -swing * 1.65;
            rightArmRef.current.rotation.y = -swing * 0.45;
          }
          if (torsoGroupRef.current) {
            torsoGroupRef.current.rotation.y = swing * 0.22;
          }
        } else if (torsoGroupRef.current) {
          torsoGroupRef.current.rotation.y = THREE.MathUtils.damp(torsoGroupRef.current.rotation.y, 0, 14, minDelta);
        }
    }

    const now = performance.now();
    if (now - lastStateUpdate.current > 100) {
        const reportedPos = { x: px, y: py, z: pz };
        recentReportedRef.current.push(reportedPos);
        if (recentReportedRef.current.length > 8) {
          recentReportedRef.current.shift();
        }
        onUpdatePosRef.current(reportedPos);
        lastStateUpdate.current = now;
    }

    if (now - lastAmbientUpdate.current > 250) {
        lastAmbientUpdate.current = now;
        try {
          const isUnder = isHeadUnderwater || getBlockTypeAt(px, py - 0.2, pz) === BlockType.WATER;
          const isNear = isUnder || isInWater ||
            getBlockTypeAt(px, py - 1, pz) === BlockType.WATER || 
            getBlockTypeAt(px + 1, py - 1, pz) === BlockType.WATER ||
            getBlockTypeAt(px - 1, py - 1, pz) === BlockType.WATER ||
            getBlockTypeAt(px, py - 1, pz + 1) === BlockType.WATER ||
            getBlockTypeAt(px, py - 1, pz - 1) === BlockType.WATER;

          updateAmbientEnvironment(isUnder, isNear, py);
        } catch (e) {}
    }
  });

  if (isSpectator) return null;

  if (perspective === 'first') {
    return (
      <FirstPersonHand
        skinId={characterSkin}
        customSkin={customSkin}
        heldBlock={currentBlock}
        visible={true}
        isMovingRef={isMovingRef}
        armSwingRef={firstPersonSwingRef}
      />
    );
  }

  return (
    <group ref={playerGroupRef} position={[physPos.current.x, physPos.current.y - 1.5, physPos.current.z]} rotation={[0, yaw.current, 0]}>
      <CharacterModel
        skinId={characterSkin}
        customSkin={customSkin}
        heldBlock={currentBlock}
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
            const terrain = getWorldHeight(spawnWx, spawnWz);
            const h = terrain.h + 0.5;
            const groundY = Math.round(terrain.h);
            const spawnChunk = chunksRef.current[chunkKey];
            const slx = ((spawnWx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const slz = ((spawnWz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const b1 =
              groundY + 1 < WORLD_HEIGHT
                ? spawnChunk[(slx * CHUNK_SIZE * WORLD_HEIGHT) + ((groundY + 1) * CHUNK_SIZE) + slz]
                : BlockType.BEDROCK;
            const b2 =
              groundY + 2 < WORLD_HEIGHT
                ? spawnChunk[(slx * CHUNK_SIZE * WORLD_HEIGHT) + ((groundY + 2) * CHUNK_SIZE) + slz]
                : BlockType.BEDROCK;
            const spawnHasClearance =
              terrain.h >= 56 &&
              h > 0 &&
              h + 2.5 < WORLD_HEIGHT &&
              b1 === BlockType.AIR &&
              b2 === BlockType.AIR;
            if (spawnHasClearance) {
              const rand = Math.random();
              let mType = EntityType.ZOMBIE;
              if (rand < 0.12) mType = EntityType.ENDERMAN;
              else if (rand < 0.38) mType = EntityType.CREEPER;
              else if (rand < 0.70) {
                if (terrain.biome === 'snow') mType = EntityType.SNOW_SKELETON;
                else if (terrain.biome === 'swamp') mType = EntityType.SWAMP_SKELETON;
                else mType = EntityType.SKELETON;
              }

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

const TARGET_EDGE_GEO = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012));
const TARGET_GHOST_GEO = new THREE.BoxGeometry(0.985, 0.985, 0.985);
const RAY_DIR_SCRATCH = new THREE.Vector3();

const getBrushOffsets = (
  brush: 'single' | 'line3' | 'wall3x2',
  lookX: number,
  lookZ: number
): [number, number, number][] => {
  if (brush === 'single') return [[0, 0, 0]];
  // Perpendicular horizontal axis based on dominant facing direction
  const absX = Math.abs(lookX);
  const absZ = Math.abs(lookZ);
  const sideX = absX >= absZ ? 0 : 1;
  const sideZ = absX >= absZ ? 1 : 0;
  if (brush === 'line3') {
    return [
      [-sideX, 0, -sideZ],
      [0, 0, 0],
      [sideX, 0, sideZ],
    ];
  }
  // wall3x2: 3 wide x 2 tall
  return [
    [-sideX, 0, -sideZ],
    [0, 0, 0],
    [sideX, 0, sideZ],
    [-sideX, 1, -sideZ],
    [0, 1, 0],
    [sideX, 1, sideZ],
  ];
};

const isInteractiveBlock = (blk: number) =>
  blk === BlockType.DOOR ||
  blk === BlockType.CRAFTING_TABLE ||
  blk === BlockType.FURNACE ||
  blk === BlockType.CARTOGRAPHY_TABLE ||
  blk === BlockType.CHEST ||
  blk === BlockType.BED ||
  blk === BlockType.JUKEBOX;

const isHandheldWeaponOrTool = (blk: number) =>
  blk === BlockType.SWORD ||
  blk === BlockType.PICKAXE ||
  blk === BlockType.AXE ||
  blk === BlockType.SHOVEL ||
  blk === BlockType.WOOD_SWORD ||
  blk === BlockType.WOOD_PICKAXE ||
  blk === BlockType.WOOD_SHOVEL ||
  blk === BlockType.STONE_SWORD ||
  blk === BlockType.STONE_AXE ||
  blk === BlockType.IRON_PICKAXE ||
  blk === BlockType.IRON_AXE ||
  blk === BlockType.IRON_SHOVEL ||
  blk === BlockType.GOLD_SWORD ||
  blk === BlockType.GOLD_PICKAXE ||
  blk === BlockType.GOLD_AXE ||
  blk === BlockType.GOLD_SHOVEL ||
  blk === BlockType.DIAMOND_SWORD ||
  blk === BlockType.DIAMOND_PICKAXE ||
  blk === BlockType.DIAMOND_AXE ||
  blk === BlockType.DIAMOND_SHOVEL;

const isToolBlock = (blk: number) =>
  isHandheldWeaponOrTool(blk) ||
  blk === BlockType.MAP ||
  blk === BlockType.LOCATOR_MAP;

interface AimedVoxelTarget {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  hitX: number;
  hitY: number;
  hitZ: number;
  placeX: number;
  placeY: number;
  placeZ: number;
  hitBlock: BlockType;
  lookX: number;
  lookZ: number;
}

const TargetBlockHighlight: React.FC<{
  chunksRef: React.MutableRefObject<Record<string, Uint8Array>>;
  currentBlockRef: React.MutableRefObject<BlockType>;
  buildBrushRef: React.MutableRefObject<'single' | 'line3' | 'wall3x2'>;
  interactionModeRef: React.MutableRefObject<'break' | 'place'>;
  aimedVoxelRef: React.MutableRefObject<AimedVoxelTarget | null>;
  playerPosRef: React.MutableRefObject<Vector3D>;
}> = ({
  chunksRef,
  currentBlockRef,
  buildBrushRef,
  interactionModeRef,
  aimedVoxelRef,
  playerPosRef,
}) => {
  const wireframeRef = useRef<THREE.LineSegments>(null);
  const wireMatRef = useRef<THREE.LineBasicMaterial>(null);
  const ghostGroupRef = useRef<THREE.Group>(null);
  const ghostMeshesRef = useRef<(THREE.Mesh | null)[]>([]);
  const ghostMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const reusablePoint = useMemo(() => new THREE.Vector3(), []);
  const reusableNormal = useMemo(() => new THREE.Vector3(), []);
  const persistentTargetRef = useRef<AimedVoxelTarget>({
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    hitX: 0,
    hitY: 0,
    hitZ: 0,
    placeX: 0,
    placeY: 0,
    placeZ: 0,
    hitBlock: BlockType.AIR,
    lookX: 0,
    lookZ: 0,
  });

  useFrame(({ camera }) => {
    const wire = wireframeRef.current;
    const ghostGroup = ghostGroupRef.current;
    if (!wire || !ghostGroup) return;

    camera.getWorldDirection(RAY_DIR_SCRATCH);
    const ox = camera.position.x;
    const oy = camera.position.y;
    const oz = camera.position.z;
    const dx = RAY_DIR_SCRATCH.x;
    const dy = RAY_DIR_SCRATCH.y;
    const dz = RAY_DIR_SCRATCH.z;

    let vx = Math.round(ox);
    let vy = Math.round(oy);
    let vz = Math.round(oz);

    const stepX = dx >= 0 ? 1 : -1;
    const stepY = dy >= 0 ? 1 : -1;
    const stepZ = dz >= 0 ? 1 : -1;

    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX = dx !== 0 ? (vx + stepX * 0.5 - ox) / dx : Infinity;
    let tMaxY = dy !== 0 ? (vy + stepY * 0.5 - oy) / dy : Infinity;
    let tMaxZ = dz !== 0 ? (vz + stepZ * 0.5 - oz) / dz : Infinity;

    const maxDist = 7.5;
    let t = 0;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    let hitBlk = BlockType.AIR;
    const currentChunks = chunksRef.current;
    const wantsLiquid = currentBlockRef.current === BlockType.BUCKET_EMPTY;

    for (let step = 0; step < 24; step++) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          t = tMaxX;
          tMaxX += tDeltaX;
          vx += stepX;
          nx = -stepX; ny = 0; nz = 0;
        } else {
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          vz += stepZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          t = tMaxY;
          tMaxY += tDeltaY;
          vy += stepY;
          nx = 0; ny = -stepY; nz = 0;
        } else {
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          vz += stepZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      }

      if (t > maxDist || vy < 0 || vy >= WORLD_HEIGHT) break;

      const cx = Math.floor(vx / CHUNK_SIZE);
      const cz = Math.floor(vz / CHUNK_SIZE);
      const chunk = currentChunks[`${cx},${cz}`];
      if (!chunk) continue;

      const lx = ((vx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((vz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const blk = chunk[(lx * CHUNK_SIZE * WORLD_HEIGHT) + (vy * CHUNK_SIZE) + lz] as BlockType;

      if (blk !== BlockType.AIR && (wantsLiquid || (blk !== BlockType.WATER && blk !== BlockType.LAVA))) {
        hitBlk = blk;
        break;
      }
    }

    if (hitBlk === BlockType.AIR) {
      aimedVoxelRef.current = null;
      wire.visible = false;
      ghostGroup.visible = false;
      return;
    }

    reusablePoint.set(ox + dx * t, oy + dy * t, oz + dz * t);
    reusableNormal.set(nx, ny, nz);

    const placeX = vx + nx;
    const placeY = vy + ny;
    const placeZ = vz + nz;

    const target = persistentTargetRef.current;
    target.point.copy(reusablePoint);
    target.normal.copy(reusableNormal);
    target.hitX = vx;
    target.hitY = vy;
    target.hitZ = vz;
    target.placeX = placeX;
    target.placeY = placeY;
    target.placeZ = placeZ;
    target.hitBlock = hitBlk;
    target.lookX = dx;
    target.lookZ = dz;
    aimedVoxelRef.current = target;

    wire.visible = true;
    wire.position.set(vx, vy, vz);
    const interactive = isInteractiveBlock(hitBlk);
    if (wireMatRef.current) {
      wireMatRef.current.color.set(
        interactive
          ? '#fbbf24'
          : interactionModeRef.current === 'break'
            ? '#ef4444'
            : '#e2e8f0'
      );
    }

    const held = currentBlockRef.current;
    const showGhosts = !interactive && !isToolBlock(held) && held !== BlockType.BUCKET_EMPTY;

    if (!showGhosts || placeY < 0 || placeY >= WORLD_HEIGHT) {
      ghostGroup.visible = false;
      return;
    }

    const offsets = getBrushOffsets(buildBrushRef.current, dx, dz);
    const currPos = playerPosRef.current;
    const pMinX = currPos.x - 0.28, pMaxX = currPos.x + 0.28;
    const pMinY = currPos.y - 1.48, pMaxY = currPos.y + 0.22;
    const pMinZ = currPos.z - 0.28, pMaxZ = currPos.z + 0.28;

    ghostGroup.visible = true;
    if (ghostMatRef.current) {
      ghostMatRef.current.color.set(BLOCK_COLORS[held] || '#34d399');
    }

    for (let i = 0; i < 6; i++) {
      const m = ghostMeshesRef.current[i];
      if (!m) continue;
      if (i < offsets.length) {
        const tx = placeX + offsets[i][0];
        const ty = placeY + offsets[i][1];
        const tz = placeZ + offsets[i][2];
        const overlaps =
          tx + 0.5 > pMinX && tx - 0.5 < pMaxX &&
          ty + 0.5 > pMinY && ty - 0.5 < pMaxY &&
          tz + 0.5 > pMinZ && tz - 0.5 < pMaxZ;
        if (!overlaps && ty >= 0 && ty < WORLD_HEIGHT) {
          m.visible = true;
          m.position.set(tx, ty, tz);
        } else {
          m.visible = false;
        }
      } else {
        m.visible = false;
      }
    }
  });

  return (
    <>
      <lineSegments ref={wireframeRef} geometry={TARGET_EDGE_GEO} visible={false} renderOrder={2}>
        <lineBasicMaterial ref={wireMatRef} color="#e2e8f0" transparent opacity={0.9} depthTest />
      </lineSegments>
      <group ref={ghostGroupRef} visible={false}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            ref={(el) => { ghostMeshesRef.current[i] = el; }}
            geometry={TARGET_GHOST_GEO}
            renderOrder={1}
          >
            <meshBasicMaterial
              ref={i === 0 ? ghostMatRef : undefined}
              color="#34d399"
              transparent
              opacity={0.38}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </>
  );
};

const VoxelWorld: React.FC<VoxelWorldProps> = ({ 
    currentBlock, playerPos, onBlockChange, moveVector, lookOffsetRef, interactionMode, isJumping,
    perspective = 'first', fov = 65, isZooming = false, ultraOptimization = false,
    worldId, initialEdits, onBlockEdit,
    gameMode = 'survival', worldType = 'normal',
    onSelectBlock,
    onOpenCraftingTable,
    onOpenFurnace,
    onOpenCartographyTable,
    onOpenChest,
    onUseMap,
    survivalInventory,
    onUpdateSurvivalInventory,
    weather = 'clear',
    dimension = 'overworld',
    onPortalTeleport,
    activePlayers,
    autoJumpEnabled = true,
    userRole = 'user',
    biomeConfig = null,
    noiseConfig,
    perfConfig,
    attackTrigger,
    placeTrigger,
    buildBrush = 'single',
    characterSkin = 'cyber',
    customSkin,
    playerPoseRef,
    externalMoveVectorRef,
    aiCompanionConfig,
    aiCompanionTpTrigger = 0,
    aiCompanionPosRef,
    aiCompanionBagRef,
    onAICompanionBuildComplete,
    onAICompanionSpeak
}) => {
  activeWorldId = worldId || 'temp';
  activeWorldType = worldType || 'normal';
  activeDimension = dimension;
  activeUserRole = userRole;
  activeBiomeConfig = biomeConfig;
  activeNoiseConfig = noiseConfig || DEFAULT_NOISE_CONFIG;
  const playerPosRef = useRef(playerPos);
  const lastWorldReportedRef = useRef<Vector3D[]>([]);
  const handlePlayerBlockChange = useCallback((p: Vector3D) => {
    lastWorldReportedRef.current.push(p);
    if (lastWorldReportedRef.current.length > 8) {
      lastWorldReportedRef.current.shift();
    }
    onBlockChange(p);
  }, [onBlockChange]);
  useEffect(() => {
    const reported = lastWorldReportedRef.current;
    for (let i = 0; i < reported.length; i++) {
      const r = reported[i];
      const d = (playerPos.x - r.x) * (playerPos.x - r.x) + (playerPos.y - r.y) * (playerPos.y - r.y) + (playerPos.z - r.z) * (playerPos.z - r.z);
      if (d < 0.04) {
        return;
      }
    }
    playerPosRef.current = { ...playerPos };
  }, [playerPos]);

  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  const currentBlockRef = useRef(currentBlock);
  currentBlockRef.current = currentBlock;
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  const buildBrushRef = useRef<'single' | 'line3' | 'wall3x2'>(buildBrush);
  buildBrushRef.current = buildBrush;
  const aimedVoxelRef = useRef<AimedVoxelTarget | null>(null);

  const onSelectBlockRef = useRef(onSelectBlock);
  onSelectBlockRef.current = onSelectBlock;

  const onOpenCraftingTableRef = useRef(onOpenCraftingTable);
  onOpenCraftingTableRef.current = onOpenCraftingTable;

  const onOpenFurnaceRef = useRef(onOpenFurnace);
  onOpenFurnaceRef.current = onOpenFurnace;

  const onOpenCartographyTableRef = useRef(onOpenCartographyTable);
  onOpenCartographyTableRef.current = onOpenCartographyTable;

  const onOpenChestRef = useRef(onOpenChest);
  onOpenChestRef.current = onOpenChest;

  const onUseMapRef = useRef(onUseMap);
  onUseMapRef.current = onUseMap;

  const survivalInventoryRef = useRef(survivalInventory);
  survivalInventoryRef.current = survivalInventory;

  const onUpdateSurvivalInventoryRef = useRef(onUpdateSurvivalInventory);
  onUpdateSurvivalInventoryRef.current = onUpdateSurvivalInventory;

  const [playingJukeboxes, setPlayingJukeboxes] = useState<Record<string, BlockType>>({});
  const playingJukeboxesRef = useRef<Record<string, BlockType>>({});
  playingJukeboxesRef.current = playingJukeboxes;

  const pendingChunksRef = useRef<string[]>([]);
  const processingQueueRef = useRef<boolean>(false);
  const asyncLoaderTimerRef = useRef<any>(null);

  // Bounded, event-driven fluid & fire simulation state (eliminates infinite water flooding)
  const fluidLevelRef = useRef<Map<string, number>>(new Map());
  const activeFluidCellsRef = useRef<Set<string>>(new Set());
  const activeFireCellsRef = useRef<Set<string>>(new Set());
  const chunkTorchesCacheRef = useRef<Map<string, { data: Uint8Array; torches: { x: number; y: number; z: number }[] }>>(new Map());
  const torchPositionsRef = useRef<{ x: number; y: number; z: number }[]>([]);

  useEffect(() => {
    return () => {
      if (asyncLoaderTimerRef.current) {
        clearTimeout(asyncLoaderTimerRef.current);
      }
      stopAllJukeboxMusic();
    };
  }, []);

  const [chunks, setChunks] = useState<Record<string, Uint8Array>>({});
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const fallbackCompanionPosRef = useRef<Vector3D>({ x: 0, y: 80, z: 0 });
  const fallbackCompanionBagRef = useRef<Record<number, number>>({});
  const hitEntityById = useCallback((id: string) => {
    const hitFn = globalEntityHitHandlers.get(id);
    if (hitFn) {
      hitFn();
      return true;
    }
    return false;
  }, []);

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

  const savedChunksRef = useRef<Record<string, Uint8Array>>({});
  const savedEntitiesRef = useRef<Record<string, EntityData[]>>({});
  const editsByChunkRef = useRef<Map<string, Map<number, number>>>(new Map());
  const prevIncomingEditsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    chunksRef.current = {};
    entitiesRef.current = {};
    savedChunksRef.current = {};
    savedEntitiesRef.current = {};
    editsByChunkRef.current.clear();
    prevIncomingEditsRef.current = {};
    openDoorsRef.current = {};
    setOpenDoors({});
    fluidLevelRef.current.clear();
    activeFluidCellsRef.current.clear();
    activeFireCellsRef.current.clear();
    chunkTorchesCacheRef.current.clear();
    torchPositionsRef.current = [];
    setChunks({});
    setEntities({});
    lastGenerationCoords.current = { x: NaN, z: NaN };
    pendingChunksRef.current = [];
    clearNoiseCaches();
  }, [dimension, worldId]);

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

  const enqueueFluidNeighbors = useCallback((wx: number, wy: number, wz: number, chunkOverride?: Record<string, Uint8Array>) => {
    const currentChunks = chunksRef.current;
    const offsets = [
      [0, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (let i = 0; i < offsets.length; i++) {
      const nx = wx + offsets[i][0];
      const ny = wy + offsets[i][1];
      const nz = wz + offsets[i][2];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const cx = Math.floor(nx / CHUNK_SIZE);
      const cz = Math.floor(nz / CHUNK_SIZE);
      const k = `${cx},${cz}`;
      const chunkData = (chunkOverride && chunkOverride[k]) || currentChunks[k];
      if (!chunkData) continue;
      const lx = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (ny * CHUNK_SIZE) + lz;
      const blk = chunkData[idx];
      if (blk === BlockType.WATER || blk === BlockType.LAVA) {
        const key = `${nx},${ny},${nz}`;
        if (!fluidLevelRef.current.has(key)) {
          fluidLevelRef.current.set(key, 0);
        }
        if (activeFluidCellsRef.current.size < 250) {
          activeFluidCellsRef.current.add(key);
        }
      } else if (blk === BlockType.FIRE) {
        if (activeFireCellsRef.current.size < 100) {
          activeFireCellsRef.current.add(`${nx},${ny},${nz}`);
        }
      }
    }
  }, []);

  // --- BOUNDED EVENT-DRIVEN LIQUID (WATER & LAVA) & FIRE SYSTEM ---
  useEffect(() => {
    let active = true;
    const flammableBlocks = new Set([
      BlockType.WOOD, BlockType.LOG, BlockType.LEAVES,
      BlockType.CHERRY_LOG, BlockType.CHERRY_LEAVES, BlockType.CHERRY_WOOD,
      BlockType.DARK_LOG, BlockType.DARK_LEAVES, BlockType.VINES,
      BlockType.AUTUMN_LEAVES, BlockType.GREY_LOG, BlockType.GREY_WOOD,
      BlockType.SUGAR_CANE, BlockType.BAMBOO, BlockType.CUSHION,
      BlockType.WOOL, BlockType.WOOL_STAIRS
    ]);

    const isReplaceable = (b: number) =>
      b === BlockType.AIR ||
      b === BlockType.MUSHROOM_BROWN ||
      b === BlockType.MUSHROOM_RED ||
      b === BlockType.FLOWER_RED ||
      b === BlockType.FLOWER_YELLOW ||
      b === BlockType.FIRE;

    const timer = setInterval(() => {
      if (!active) return;
      if (activeFluidCellsRef.current.size === 0 && activeFireCellsRef.current.size === 0) return;

      const currentChunks = chunksRef.current;
      const mutated: Record<string, Uint8Array> = {};
      const updatesMap = new Map<string, { x: number; y: number; z: number; block: number; nextLevel?: number }>();

      const getSimBlock = (wx: number, wy: number, wz: number) => {
        if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.BEDROCK;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const k = `${cx},${cz}`;
        const chunkData = mutated[k] !== undefined ? mutated[k] : currentChunks[k];
        if (!chunkData) return BlockType.BEDROCK;
        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
        return chunkData[idx];
      };

      // 1. Process up to 14 active fluid cells per tick
      const batchFluidKeys: string[] = [];
      for (const key of activeFluidCellsRef.current) {
        batchFluidKeys.push(key);
        if (batchFluidKeys.length >= 14) break;
      }
      for (const key of batchFluidKeys) {
        activeFluidCellsRef.current.delete(key);
        const parts = key.split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const z = Number(parts[2]);

        const b = getSimBlock(x, y, z);
        if (b !== BlockType.WATER && b !== BlockType.LAVA) continue;

        const maxDist = b === BlockType.WATER ? 4 : 2;
        const level = fluidLevelRef.current.get(key) ?? 0;

        if (y > 1) {
          const below = getSimBlock(x, y - 1, z);
          if ((below === BlockType.WATER && b === BlockType.LAVA) || (below === BlockType.LAVA && b === BlockType.WATER)) {
            updatesMap.set(`${x},${y - 1},${z}`, { x, y: y - 1, z, block: BlockType.OBSIDIAN });
            continue;
          }
          if (isReplaceable(below)) {
            const belowKey = `${x},${y - 1},${z}`;
            // Only vertical source column (level === 0) preserves level 0; cascading spills stay bounded
            const nextFallLevel = level === 0 ? 0 : Math.min(maxDist, level);
            updatesMap.set(belowKey, { x, y: y - 1, z, block: b, nextLevel: nextFallLevel });
            continue;
          }
        }

        // Below is solid or existing liquid: spread horizontally only while level < maxDist
        if (level < maxDist) {
          const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          const nextLevel = level + 1;
          for (let d = 0; d < dirs.length; d++) {
            const nx = x + dirs[d][0];
            const nz = z + dirs[d][1];
            const sideBlock = getSimBlock(nx, y, nz);
            const sideKey = `${nx},${y},${nz}`;

            if ((sideBlock === BlockType.WATER && b === BlockType.LAVA) || (sideBlock === BlockType.LAVA && b === BlockType.WATER)) {
              updatesMap.set(sideKey, { x: nx, y, z: nz, block: BlockType.OBSIDIAN });
            } else if (isReplaceable(sideBlock)) {
              const existingPending = updatesMap.get(sideKey);
              if (!existingPending || (existingPending.nextLevel ?? 99) > nextLevel) {
                updatesMap.set(sideKey, { x: nx, y, z: nz, block: b, nextLevel });
              }
            } else if (sideBlock === b) {
              const existingLevel = fluidLevelRef.current.get(sideKey);
              if (existingLevel !== undefined && existingLevel > nextLevel) {
                fluidLevelRef.current.set(sideKey, nextLevel);
                if (activeFluidCellsRef.current.size < 250) {
                  activeFluidCellsRef.current.add(sideKey);
                }
              }
            }
          }
        }
      }

      // 2. Process up to 8 active fire cells per tick
      const batchFireKeys: string[] = [];
      for (const fKey of activeFireCellsRef.current) {
        batchFireKeys.push(fKey);
        if (batchFireKeys.length >= 8) break;
      }
      for (const fKey of batchFireKeys) {
        const parts = fKey.split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const z = Number(parts[2]);
        if (getSimBlock(x, y, z) !== BlockType.FIRE) {
          activeFireCellsRef.current.delete(fKey);
          continue;
        }
        const neighbors = [
          [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]
        ];
        for (let n = 0; n < neighbors.length; n++) {
          const nx = x + neighbors[n][0];
          const ny = y + neighbors[n][1];
          const nz = z + neighbors[n][2];
          if (ny < 0 || ny >= WORLD_HEIGHT) continue;
          const nb = getSimBlock(nx, ny, nz);
          if (flammableBlocks.has(nb) && Math.random() < 0.22) {
            const nKey = `${nx},${ny},${nz}`;
            updatesMap.set(nKey, { x: nx, y: ny, z: nz, block: BlockType.FIRE });
            if (activeFireCellsRef.current.size < 100) activeFireCellsRef.current.add(nKey);
          }
        }
        if (Math.random() < 0.35) {
          activeFireCellsRef.current.delete(fKey);
          updatesMap.set(fKey, { x, y, z, block: BlockType.AIR });
        }
      }

      if (updatesMap.size > 0) {
        for (const [uKey, up] of updatesMap.entries()) {
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

          if (up.block === BlockType.WATER || up.block === BlockType.LAVA) {
            const lvl = up.nextLevel ?? 0;
            fluidLevelRef.current.set(uKey, lvl);
            if (activeFluidCellsRef.current.size < 250) {
              activeFluidCellsRef.current.add(uKey);
            }
          }

          if (editsRef.current) {
            editsRef.current[uKey] = up.block;
          }
          if (onBlockEditRef.current) {
            onBlockEditRef.current(up.x, up.y, up.z, up.block, undefined, true);
          }
        }

        const mutatedKeys = Object.keys(mutated);
        if (mutatedKeys.length > 0) {
          for (let i = 0; i < mutatedKeys.length; i++) {
            const mk = mutatedKeys[i];
            chunksRef.current[mk] = mutated[mk];
            savedChunksRef.current[mk] = mutated[mk];
          }
          setChunks(prev => ({ ...prev, ...mutated }));
        }
      }
    }, 350);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [worldId]);

  const isSleepingRef = useRef(false);
  const [isSleeping, setIsSleeping] = useState(false);

  const mobSpawnTimerRef = useRef(0);

  // Incremental per-chunk torch index (zero re-scan on unmodified chunks)
  useEffect(() => {
    const allTorches: { x: number; y: number; z: number }[] = [];
    const y_mult = CHUNK_SIZE;
    const x_mult = CHUNK_SIZE * WORLD_HEIGHT;

    for (const key in chunks) {
      const data = chunks[key];
      if (!data) continue;
      const cached = chunkTorchesCacheRef.current.get(key);
      if (cached && cached.data === data) {
        for (let i = 0; i < cached.torches.length; i++) {
          allTorches.push(cached.torches[i]);
        }
        continue;
      }

      const [cx, cz] = key.split(',').map(Number);
      const localTorches: { x: number; y: number; z: number }[] = [];
      for (let x = 0; x < 16; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const xMultOffset = x * x_mult;
        for (let z = 0; z < 16; z++) {
          const wz = cz * CHUNK_SIZE + z;
          const xz_offset = xMultOffset + z;
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            if (data[xz_offset + (y * y_mult)] === BlockType.TORCH) {
              localTorches.push({ x: wx, y, z: wz });
            }
          }
        }
      }
      chunkTorchesCacheRef.current.set(key, { data, torches: localTorches });
      for (let i = 0; i < localTorches.length; i++) {
        allTorches.push(localTorches[i]);
      }
    }

    // Prune unloaded chunks from torch cache
    for (const cachedKey of chunkTorchesCacheRef.current.keys()) {
      if (!chunks[cachedKey]) {
        chunkTorchesCacheRef.current.delete(cachedKey);
      }
    }

    torchPositionsRef.current = allTorches;
  }, [chunks]);

  React.useEffect(() => {
    const incomingEdits = initialEdits || {};
    editsRef.current = incomingEdits;
    const prevIncoming = prevIncomingEditsRef.current;

    const currentChunks = chunksRef.current;
    const saved = savedChunksRef.current;
    const hasLoadedChunks = currentChunks && Object.keys(currentChunks).length > 0;
    const changedChunkKeys = new Set<string>();
    const updatedChunksMap: Record<string, Uint8Array> = {};
    const indexMap = editsByChunkRef.current;

    for (const editKey in incomingEdits) {
      if (!Object.prototype.hasOwnProperty.call(incomingEdits, editKey)) continue;
      const targetBlock = incomingEdits[editKey];
      // Fast O(1) skip for previously indexed & unchanged edit entries
      if (prevIncoming[editKey] === targetBlock) continue;

      const c1 = editKey.indexOf(',');
      const c2 = c1 !== -1 ? editKey.indexOf(',', c1 + 1) : -1;
      if (c1 === -1 || c2 === -1) continue;
      const wx = parseInt(editKey.slice(0, c1), 10);
      const wy = parseInt(editKey.slice(c1 + 1, c2), 10);
      const wz = parseInt(editKey.slice(c2 + 1), 10);
      if (isNaN(wx) || isNaN(wy) || isNaN(wz) || wy < 0 || wy >= WORLD_HEIGHT) continue;

      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const k = `${cx},${cz}`;
      const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;

      let chunkEditBucket = indexMap.get(k);
      if (!chunkEditBucket) {
        chunkEditBucket = new Map<number, number>();
        indexMap.set(k, chunkEditBucket);
      }
      chunkEditBucket.set(idx, targetBlock);

      if (hasLoadedChunks) {
        const existingChunk = updatedChunksMap[k] || currentChunks[k];
        if (existingChunk) {
          if (existingChunk[idx] !== targetBlock) {
            if (!updatedChunksMap[k]) {
              updatedChunksMap[k] = new Uint8Array(existingChunk);
            }
            updatedChunksMap[k][idx] = targetBlock;
            changedChunkKeys.add(k);
            if (targetBlock === BlockType.WATER || targetBlock === BlockType.LAVA) {
              fluidLevelRef.current.set(editKey, 0);
              if (activeFluidCellsRef.current.size < 250) activeFluidCellsRef.current.add(editKey);
            } else if (targetBlock === BlockType.AIR) {
              enqueueFluidNeighbors(wx, wy, wz, updatedChunksMap);
            }
          }
        } else if (saved && saved[k] && saved[k][idx] !== targetBlock) {
          saved[k][idx] = targetBlock;
        }
      } else if (saved && saved[k] && saved[k][idx] !== targetBlock) {
        saved[k][idx] = targetBlock;
      }
    }

    prevIncomingEditsRef.current = incomingEdits;

    if (changedChunkKeys.size > 0) {
      for (const k of changedChunkKeys) {
        chunksRef.current[k] = updatedChunksMap[k];
        savedChunksRef.current[k] = updatedChunksMap[k];
      }
      setChunks((prev) => ({
        ...prev,
        ...updatedChunksMap,
      }));
    }
  }, [worldId, initialEdits, enqueueFluidNeighbors]);

  const isFlatWorld = worldType === 'flat' || worldType === 'plano' || worldType === 'plano_infinito';

  useEffect(() => {
    lastGenerationCoords.current = { x: NaN, z: NaN };
  }, [worldId]);

  const getCollisionHeight = useCallback((posX: number, posZ: number, currentY: number) => {
    // 3000 block boundary: collision no longer exists, causing the player to fall into the void!
    if (Math.max(Math.abs(posX), Math.abs(posZ)) >= 3000) {
      return 0;
    }

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
        const b = chunk[idx];
        const isNonSolid = b === BlockType.AIR || b === BlockType.WATER || b === BlockType.LAVA || b === BlockType.PORTAL ||
            b === BlockType.MUSHROOM_RED || b === BlockType.MUSHROOM_BROWN ||
            b === BlockType.FLOWER_RED || b === BlockType.FLOWER_YELLOW ||
            b === BlockType.TORCH || b === BlockType.FIRE || b === BlockType.VINES ||
            b === BlockType.SUGAR_CANE || b === BlockType.BAMBOO || b === BlockType.FROG_EGGS ||
            b === BlockType.CHICKEN_EGG;
        if (!isNonSolid) {
            return y + 1;
        }
    }
    return 0;
  }, [isFlatWorld]);

  const checkSolid = useCallback((wx: number, wy: number, wz: number) => {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;

    // 3000 block boundary: collision no longer exists, causing the player to fall into the void!
    if (Math.max(Math.abs(wx), Math.abs(wz)) >= 3000) {
      return false;
    }

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
    const isBaseSolid = b !== BlockType.AIR && b !== BlockType.WATER && b !== BlockType.LAVA &&
           b !== BlockType.MUSHROOM_BROWN && b !== BlockType.MUSHROOM_RED &&
           b !== BlockType.FLOWER_RED && b !== BlockType.FLOWER_YELLOW &&
           b !== BlockType.TORCH && b !== BlockType.FIRE && b !== BlockType.VINES &&
           b !== BlockType.SUGAR_CANE && b !== BlockType.BAMBOO && b !== BlockType.FROG_EGGS &&
           b !== BlockType.CHICKEN_EGG && b !== BlockType.DOOR && b !== BlockType.PORTAL;

    if (isBaseSolid) return true;

    // Only extend a single-block legacy door upward by 1 block (never block the 3rd air voxel above a 2-block door!)
    if (y > 0 && b === BlockType.AIR) {
      const idxBelow = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 1) * CHUNK_SIZE) + lz;
      if (chunk[idxBelow] === BlockType.DOOR) {
        const idxTwoBelow = y > 1 ? (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 2) * CHUNK_SIZE) + lz : -1;
        if (idxTwoBelow === -1 || chunk[idxTwoBelow] !== BlockType.DOOR) {
          const doorBaseKey = `${Math.round(wx)},${y - 1},${Math.round(wz)}`;
          if (openDoorsRef.current[doorBaseKey]) {
            return false;
          }
          return true;
        }
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
    const k = `${cx},${cz}`;
    if (savedChunksRef.current[k]) {
      const cached = savedChunksRef.current[k];
      const chunkEdits = editsByChunkRef.current.get(k);
      if (chunkEdits) {
        chunkEdits.forEach((blk, idx) => {
          cached[idx] = blk;
        });
      }
      return cached;
    }
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

      if (activeDimension === 'nether') {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const wx = cx * CHUNK_SIZE + x;
            const wz = cz * CHUNK_SIZE + z;

            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;

              // 1. Bedrock boundaries (ceil and floor)
              if (y === 0 || y === WORLD_HEIGHT - 1) {
                data[idx] = BlockType.BEDROCK;
                continue;
              }
              if (y <= 2 || y >= WORLD_HEIGHT - 3) {
                const rBed = getSeededRandom(seed, wx, wz, y * 7);
                if (rBed < 0.5) {
                  data[idx] = BlockType.BEDROCK;
                  continue;
                }
              }

              // 2. Cavern 3D Noise carving
              const dNoise = worldConf.cave3D(wx * 0.025, y * 0.05, wz * 0.025);
              const heightFactor = Math.abs(y - 64) / 64; 
              const threshold = 0.38 + heightFactor * 0.22;
              const isSolid = dNoise < threshold;

              if (isSolid) {
                data[idx] = BlockType.NETHERRACK;

                // Seeded ore generation
                const rOre = getSeededRandom(seed + 999, wx, wz, y);
                if (rOre < 0.035) {
                  data[idx] = BlockType.NETHER_QUARTZ_ORE;
                } else if (rOre < 0.045) {
                  data[idx] = BlockType.NETHER_BRICKS; 
                }
              } else {
                if (y <= 32) {
                  data[idx] = BlockType.LAVA;
                } else {
                  data[idx] = BlockType.AIR;
                }
              }
            }
          }
        }

        // 3. Second pass: decorate surfaces (Nylium, Soul sand, Glowstone)
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const wx = cx * CHUNK_SIZE + x;
            const wz = cz * CHUNK_SIZE + z;

            for (let y = 3; y < WORLD_HEIGHT - 4; y++) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;
              const b = data[idx];

              if (b === BlockType.NETHERRACK) {
                const idxAbove = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((y + 1) * CHUNK_SIZE) + z;
                if (data[idxAbove] === BlockType.AIR) {
                  const bNoise = worldConf.biomeNoiseFun(wx * 0.022, wz * 0.022);
                  if (bNoise < -0.32) {
                    data[idx] = BlockType.CRIMSON_NYLIUM;
                  } else if (bNoise > 0.32) {
                    data[idx] = BlockType.WARPED_NYLIUM;
                  } else if (bNoise > -0.08 && bNoise < 0.08) {
                    data[idx] = BlockType.SOUL_SAND;
                    if (y > 2) {
                      const idxBelow1 = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 1) * CHUNK_SIZE) + z;
                      if (data[idxBelow1] === BlockType.NETHERRACK) data[idxBelow1] = BlockType.SOUL_SAND;
                    }
                  }
                }
              } else if (b === BlockType.AIR) {
                const idxAbove = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((y + 1) * CHUNK_SIZE) + z;
                if (data[idxAbove] === BlockType.NETHERRACK) {
                  const rGlow = getSeededRandom(seed + 111, wx, wz, y);
                  if (rGlow < 0.035) {
                    data[idx] = BlockType.GLOWSTONE;
                    if (y > 4) {
                      const idxBelow1 = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((y - 1) * CHUNK_SIZE) + z;
                      if (data[idxBelow1] === BlockType.AIR) data[idxBelow1] = BlockType.GLOWSTONE;
                    }
                  }
                }
              }
            }
          }
        }

        return data;
      }

      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;
          
          const absCoord = Math.max(Math.abs(wx), Math.abs(wz));
          
          if (absCoord >= 2300) {
            // Pure water up to Y = 56, and air above
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;
              if (y === 0) {
                data[idx] = BlockType.BEDROCK;
              } else if (y <= 56) {
                data[idx] = BlockType.WATER;
              } else {
                data[idx] = BlockType.AIR;
              }
            }
            continue;
          }
          
          if (absCoord >= 2000) {
            // Gradual corruption: more air blocks, water below Y = 56
            const { h } = getWorldHeight(wx, wz);
            const ratio = Math.min(1.0, (absCoord - 2000) / 300);
            
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z;
              if (y === 0) {
                data[idx] = BlockType.BEDROCK;
                continue;
              }
              
              const randVal = getSeededRandom(seed + 999, wx, wz, y);
              if (y <= h) {
                if (randVal < ratio) {
                  data[idx] = y <= 56 ? BlockType.WATER : BlockType.AIR;
                } else {
                  if (y === h) {
                    data[idx] = BlockType.GRASS;
                  } else if (y > h - 3) {
                    data[idx] = BlockType.DIRT;
                  } else {
                    data[idx] = BlockType.STONE;
                  }
                }
              } else {
                data[idx] = BlockType.AIR;
              }
            }
            continue;
          }
          
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
              const seaRand = getSeededRandom(seed, wx, wz, 71);
              if (y === h) {
                 if (biome === 'editable') {
                     data[idx] = activeBiomeConfig?.surface ?? BlockType.MOSS;
                 }
                 else if (h <= 55) {
                     // Seabed / Lakebed materials
                     if (biome === 'swamp') {
                         data[idx] = seaRand < 0.4 ? BlockType.DIRT : BlockType.MOSS;
                     } else {
                         data[idx] = seaRand < 0.68 ? BlockType.SAND : (seaRand < 0.88 ? BlockType.GRAVEL : BlockType.DIRT);
                     }
                 }
                 else if (biome === 'desert') data[idx] = BlockType.SAND;
                 else if (biome === 'mesa') {
                     const layer = Math.floor(y / 2) % 6;
                     const colors = [BlockType.TERRACOTTA_BROWN, BlockType.TERRACOTTA_ORANGE, BlockType.TERRACOTTA_RED, BlockType.TERRACOTTA_YELLOW, BlockType.TERRACOTTA_WHITE, BlockType.TERRACOTTA_LIGHT_GRAY];
                     data[idx] = colors[layer];
                 }
                 else if (biome === 'mountains' || biome === 'snow') {
                     if (h >= 75 || biome === 'snow') {
                         data[idx] = BlockType.SNOW; // Real snow blocks
                     } else if (h >= 68) {
                         data[idx] = BlockType.STONE;
                     } else if (h === 56) {
                         data[idx] = BlockType.GRAVEL;
                     } else {
                         data[idx] = BlockType.GRASS;
                     }
                 }
                 else if (biome === 'autumn') {
                     if (h < 57) data[idx] = BlockType.SAND;
                     else data[idx] = BlockType.AUTUMN_GRASS;
                 }
                 else if (biome === 'dark') {
                     if (h < 57) data[idx] = BlockType.SAND;
                     else data[idx] = BlockType.DARK_GRASS;
                 }
                 else if (biome === 'swamp') {
                     data[idx] = BlockType.MOSS;
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
                 if (biome === 'editable') {
                     data[idx] = activeBiomeConfig?.underground ?? BlockType.DIRT;
                 }
                 else if (biome === 'desert' || h < 57) data[idx] = h <= 54 && seaRand > 0.72 ? BlockType.GRAVEL : BlockType.SAND;
                 else if (biome === 'mesa') data[idx] = BlockType.TERRACOTTA_ORANGE;
                 else if (biome === 'mountains') {
                     data[idx] = BlockType.STONE;
                 }
                 else data[idx] = BlockType.DIRT;
              }
              else { // y <= h - 3
                 if (caveNoise(wx, y, wz, worldConf.cave3D) > 0.5) {
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
                          } else if (oreRand < 0.17) {
                              data[idx] = BlockType.GRAVEL; // natural gravel generation!
                          } else {
                              data[idx] = BlockType.TERRACOTTA_BROWN;
                          }
                      } else {
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
                          } else if (oreRand < 0.14) {
                              data[idx] = BlockType.GRAVEL; // natural gravel generation!
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

          if (biome === 'editable' && h >= 57 && r1 < 0.05 && h + 1 < WORLD_HEIGHT) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + 1) * CHUNK_SIZE) + z;
              data[idx] = activeBiomeConfig?.flora ?? BlockType.VINES;
          }

          const isMushroom = r1 < 0.01;
          const isFlower = !isMushroom && r1 >= 0.01 && r1 < 0.055;
          const isVegBiome = biome === 'plains' || biome === 'autumn' || (biome === 'mountains' && h < 68) || biome === 'cherry' || biome === 'dark' || biome === 'jungle';

          // Frog eggs in Swamp
          if (biome === 'swamp' && h === 55 && r1 < 0.05) {
            const eggIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (56 * CHUNK_SIZE) + z;
            if (data[eggIdx] === BlockType.AIR || data[eggIdx] === BlockType.WATER) {
              data[eggIdx] = BlockType.FROG_EGGS;
            }
          }

          // Sugar Cane grows sparsely only on shorelines directly adjacent to water (SEA_LEVEL = 56)
          if ((biome === 'plains' || biome === 'swamp' || biome === 'jungle' || biome === 'bamboo_jungle') && h === 56) {
            const rSc = getSeededRandom(seed + 412, wx, wz, 77);
            if (rSc < 0.025) {
              const hasWaterNeighbor =
                getWorldHeight(wx + 1, wz).h < 56 ||
                getWorldHeight(wx - 1, wz).h < 56 ||
                getWorldHeight(wx, wz + 1).h < 56 ||
                getWorldHeight(wx, wz - 1).h < 56;
              if (hasWaterNeighbor) {
                const scHeight = 1 + Math.floor(r2 * 2.5);
                for (let sh = 1; sh <= scHeight; sh++) {
                  if (h + sh < WORLD_HEIGHT) {
                    const scIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + sh) * CHUNK_SIZE) + z;
                    if (data[scIdx] === BlockType.AIR) {
                      data[scIdx] = BlockType.SUGAR_CANE;
                    }
                  }
                }
              }
            }
          }

          // Bamboo stalks in bamboo jungle
          if (biome === 'bamboo_jungle' && h >= 56 && r1 < 0.18) {
            const bamHeight = 3 + Math.floor(r2 * 4);
            for (let bh = 1; bh <= bamHeight; bh++) {
              if (h + bh < WORLD_HEIGHT) {
                const bamIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + bh) * CHUNK_SIZE) + z;
                data[bamIdx] = BlockType.BAMBOO;
              }
            }
          }

          if (isVegBiome && h >= 57 && isMushroom && h + 1 < WORLD_HEIGHT) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + 1) * CHUNK_SIZE) + z;
              data[idx] = r2 > 0.5 ? BlockType.MUSHROOM_RED : BlockType.MUSHROOM_BROWN;
          } else if (isVegBiome && h >= 57 && isFlower && h + 1 < WORLD_HEIGHT) {
              const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + 1) * CHUNK_SIZE) + z;
              if (biome === 'autumn') {
                  data[idx] = BlockType.AUTUMN_FLOWER;
              } else {
                  data[idx] = r2 > 0.5 ? BlockType.FLOWER_RED : BlockType.FLOWER_YELLOW;
              }
          } else if (biome === 'desert' && h >= 57 && r1 < 0.005) {
              const th = 2 + Math.floor(r2 * 2);
              for (let ty = 1; ty <= th; ty++) {
                  if (h + ty >= WORLD_HEIGHT) break;
                  const lIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + ty) * CHUNK_SIZE) + z;
                  data[lIdx] = BlockType.CACTUS;
              }
          } else if (isVegBiome && h >= 57 && r1 >= 0.055 && r1 < 0.075 && !isMushroom && !isFlower) {
            // GROWING BIOME TREES (Cherry, Dark, Autumn, Jungle, Plains)
            const th = 4 + Math.floor(r2 * 3);
            let trunkBlock = BlockType.LOG;
            let leavesBlock = BlockType.LEAVES;
            
            if (biome === 'autumn') {
              trunkBlock = BlockType.GREY_LOG;
              leavesBlock = BlockType.AUTUMN_LEAVES;
            } else if (biome === 'cherry') {
              trunkBlock = BlockType.CHERRY_LOG;
              leavesBlock = BlockType.CHERRY_LEAVES;
            } else if (biome === 'dark') {
              trunkBlock = BlockType.DARK_LOG;
              leavesBlock = BlockType.DARK_LEAVES;
            }

            for (let ty = 1; ty <= th; ty++) {
              if (h + ty >= WORLD_HEIGHT) break;
              const lIdx = (x * CHUNK_SIZE * WORLD_HEIGHT) + ((h + ty) * CHUNK_SIZE) + z;
              data[lIdx] = trunkBlock;
              // Wrap vines on jungle trees!
              if (biome === 'jungle' && ty > 2 && ty < th - 1) {
                const dirs = [
                  { dx: 1, dz: 0 },
                  { dx: -1, dz: 0 },
                  { dx: 0, dz: 1 },
                  { dx: 0, dz: -1 }
                ];
                dirs.forEach(d => {
                  const vx = x + d.dx;
                  const vz = z + d.dz;
                  if (vx >= 0 && vx < CHUNK_SIZE && vz >= 0 && vz < CHUNK_SIZE) {
                    const vineIdx = (vx * CHUNK_SIZE * WORLD_HEIGHT) + ((h + ty) * CHUNK_SIZE) + vz;
                    if (data[vineIdx] === BlockType.AIR) {
                      data[vineIdx] = BlockType.VINES;
                    }
                  }
                });
              }
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
                      data[leafIdx] = leavesBlock;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // --- MINESHAFTS GENERATION ---
      const isMineshaftChunk = getSeededRandom(seed + 300, cx, cz, 444) < 0.05 && !isFlatWorld;
      if (isMineshaftChunk) {
        const my = 24;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let dy = 0; dy < 3; dy++) {
            const idxCenter = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((my + dy) * CHUNK_SIZE) + 8;
            data[idxCenter] = BlockType.AIR;
            const idxLeft = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((my + dy) * CHUNK_SIZE) + 7;
            data[idxLeft] = BlockType.AIR;
            const idxRight = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((my + dy) * CHUNK_SIZE) + 9;
            data[idxRight] = BlockType.AIR;
          }
          if (lx % 5 === 0) {
            const pillarL = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (my * CHUNK_SIZE) + 7;
            const pillarR = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (my * CHUNK_SIZE) + 9;
            const arch = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((my + 2) * CHUNK_SIZE) + 8;
            data[pillarL] = BlockType.LOG;
            data[pillarR] = BlockType.LOG;
            data[arch] = BlockType.WOOD;
          }
          const trackIdx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((my - 1) * CHUNK_SIZE) + 8;
          data[trackIdx] = BlockType.STONE;
        }
        const mcIdx = (8 * CHUNK_SIZE * WORLD_HEIGHT) + (my * CHUNK_SIZE) + 8;
        data[mcIdx] = BlockType.CHEST;
      }

      // --- DESERT TEMPLE/PYRAMID GENERATION ---
      const villageInfo = getVillageLayoutInfo(cx, cz, seed, isFlatWorld, activeDimension);
      const rHutCheck = getSeededRandom(seed, cx, cz, 150);
      const isDesertPyramid = !isFlatWorld && activeDimension !== 'nether' && !villageInfo && rHutCheck < 0.025 && !isMineshaftChunk;
      if (isDesertPyramid) {
        const dh = getWorldHeight(cx * CHUNK_SIZE + 8, cz * CHUNK_SIZE + 8).h;
        if (dh >= 57) {
          const baseSize = 5;
          for (let dy = 0; dy <= 4; dy++) {
            const size = baseSize - dy;
            const py = dh + dy;
            for (let px = 8 - size; px <= 8 + size; px++) {
              for (let pz = 8 - size; pz <= 8 + size; pz++) {
                if (px >= 0 && px < CHUNK_SIZE && pz >= 0 && pz < CHUNK_SIZE) {
                  const pidx = (px * CHUNK_SIZE * WORLD_HEIGHT) + (py * CHUNK_SIZE) + pz;
                  data[pidx] = dy === 0 ? BlockType.TERRACOTTA_ORANGE : BlockType.TERRACOTTA_YELLOW;
                }
              }
            }
          }
          // Inside chamber
          for (let dy = 0; dy <= 1; dy++) {
            const py = dh + dy;
            const pidx = (8 * CHUNK_SIZE * WORLD_HEIGHT) + (py * CHUNK_SIZE) + 8;
            data[pidx] = BlockType.AIR;
          }
          const chestIdx = (8 * CHUNK_SIZE * WORLD_HEIGHT) + (dh * CHUNK_SIZE) + 8;
          data[chestIdx] = BlockType.CHEST;
        }
      }

      // 1. SPACIOUS MULTI-CHUNK VILLAGE GENERATION (Central Fountain Plaza + Well-Separated Houses on Outer Avenues)
      if (villageInfo) {
        const { rcx, rcz, villageY, isDesert } = villageInfo;
        const wallMat = isDesert ? BlockType.SAND : BlockType.WOOD;
        const cornerMat = isDesert ? BlockType.TERRACOTTA_ORANGE : BlockType.LOG;
        const pathMaterial = isDesert ? BlockType.SAND : BlockType.STONE;
        const groundFill = isDesert ? BlockType.SAND : BlockType.DIRT;
        const lawnMat = isDesert ? BlockType.SAND : BlockType.GRASS;

        const setChunkBlock = (x: number, y: number, z: number, b: BlockType) => {
          if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < WORLD_HEIGHT) {
            data[(x * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + z] = b;
          }
        };

        const clearAirColumn = (x: number, startY: number, height: number, z: number) => {
          for (let dy = 0; dy < height; dy++) {
            setChunkBlock(x, startY + dy, z, BlockType.AIR);
          }
        };

        const ensureFoundation = (x: number, topY: number, z: number, topBlock: BlockType, fillBlock: BlockType) => {
          setChunkBlock(x, topY, z, topBlock);
          for (let dy = 1; dy <= 12; dy++) {
            const fy = topY - dy;
            if (fy < 1) break;
            const idx = (x * CHUNK_SIZE * WORLD_HEIGHT) + (fy * CHUNK_SIZE) + z;
            const cur = data[idx];
            if (cur === BlockType.AIR || cur === BlockType.WATER || cur === BlockType.LEAVES) {
              data[idx] = fillBlock;
            } else if (dy >= 3) {
              break;
            }
          }
          clearAirColumn(x, topY + 1, 9, z);
        };

        const placeLamp = (lx: number, lz: number) => {
          ensureFoundation(lx, villageY, lz, BlockType.STONE, groundFill);
          setChunkBlock(lx, villageY + 1, lz, BlockType.STONE);
          setChunkBlock(lx, villageY + 2, lz, BlockType.LOG);
          setChunkBlock(lx, villageY + 3, lz, BlockType.LOG);
          setChunkBlock(lx, villageY + 4, lz, BlockType.TORCH);
        };

        const buildCottage = (sx: number, sz: number, floorY: number, size: number, doorSide: 'south' | 'east' | 'west') => {
          for (let hx = 0; hx <= size; hx++) {
            for (let hz = 0; hz <= size; hz++) {
              ensureFoundation(sx + hx, floorY, sz + hz, BlockType.STONE, BlockType.STONE);
            }
          }

          const mid = Math.floor(size / 2);
          for (let hx = 0; hx <= size; hx++) {
            for (let hz = 0; hz <= size; hz++) {
              const lx = sx + hx;
              const lz = sz + hz;
              for (let hy = 1; hy <= 4; hy++) {
                if (hx === 0 || hx === size || hz === 0 || hz === size) {
                  const isCorner = (hx === 0 || hx === size) && (hz === 0 || hz === size);
                  const isDoor =
                    (doorSide === 'south' && hx === mid && hz === size) ||
                    (doorSide === 'east' && hx === size && hz === mid) ||
                    (doorSide === 'west' && hx === 0 && hz === mid);
                  const isChimney = hx === 0 && hz === 1 && doorSide !== 'west';
                  const isWindow =
                    !isDoor &&
                    hy === 2 &&
                    ((hx === 0 && hz === mid) ||
                      (hx === size && hz === mid) ||
                      (hz === 0 && hx === mid) ||
                      (hz === size && hx === mid));

                  if (isChimney) {
                    setChunkBlock(lx, floorY + hy, lz, BlockType.STONE);
                  } else if (isDoor) {
                    if (hy === 1 || hy === 2) {
                      setChunkBlock(lx, floorY + hy, lz, BlockType.DOOR);
                    } else {
                      setChunkBlock(lx, floorY + hy, lz, wallMat);
                    }
                  } else if (isWindow) {
                    setChunkBlock(lx, floorY + hy, lz, BlockType.AIR);
                  } else if (hy === 1) {
                    setChunkBlock(lx, floorY + hy, lz, isCorner ? cornerMat : BlockType.STONE);
                  } else {
                    setChunkBlock(lx, floorY + hy, lz, isCorner ? cornerMat : wallMat);
                  }
                } else {
                  setChunkBlock(lx, floorY + hy, lz, BlockType.AIR);
                  if (hy === 1) {
                    if (hx === 1 && hz === 1) setChunkBlock(lx, floorY + hy, lz, BlockType.BED);
                    else if (hx === size - 1 && hz === 1) setChunkBlock(lx, floorY + hy, lz, BlockType.CRAFTING_TABLE);
                    else if (hx === 1 && hz === size - 1) setChunkBlock(lx, floorY + hy, lz, BlockType.FURNACE);
                    else if (hx === size - 1 && hz === size - 1) setChunkBlock(lx, floorY + hy, lz, BlockType.CHEST);
                  } else if (hy === 2 && hx === 1 && hz === 1) {
                    setChunkBlock(lx, floorY + hy, lz, BlockType.TORCH);
                  }
                }
              }

              const pPeak = Math.floor(size / 2);
              const isChimney = hx === 0 && hz === 1 && doorSide !== 'west';
              if (isChimney) {
                setChunkBlock(lx, floorY + 5, lz, BlockType.STONE);
                setChunkBlock(lx, floorY + 6, lz, BlockType.STONE);
                setChunkBlock(lx, floorY + 7, lz, BlockType.STONE);
                setChunkBlock(lx, floorY + 8, lz, BlockType.TORCH);
              } else if (hx === pPeak) {
                setChunkBlock(lx, floorY + 5, lz, wallMat);
                setChunkBlock(lx, floorY + 6, lz, cornerMat);
              } else if (hx === 0 || hx === size) {
                setChunkBlock(lx, floorY + 5, lz, BlockType.STONE);
              } else {
                setChunkBlock(lx, floorY + 5, lz, wallMat);
              }
            }
          }

          if (doorSide === 'south') {
            clearAirColumn(sx + mid, floorY + 1, 5, sz + size + 1);
            for (let hy = 1; hy <= 3; hy++) {
              setChunkBlock(sx + mid - 1, floorY + hy, sz + size + 1, cornerMat);
              setChunkBlock(sx + mid + 1, floorY + hy, sz + size + 1, cornerMat);
            }
            for (let px = mid - 1; px <= mid + 1; px++) {
              setChunkBlock(sx + px, floorY + 4, sz + size + 1, wallMat);
            }
            ensureFoundation(sx + mid, floorY, sz + size + 1, pathMaterial, groundFill);
          } else if (doorSide === 'east') {
            clearAirColumn(sx + size + 1, floorY + 1, 5, sz + mid);
            ensureFoundation(sx + size + 1, floorY, sz + mid, pathMaterial, groundFill);
          } else if (doorSide === 'west') {
            clearAirColumn(sx - 1, floorY + 1, 5, sz + mid);
            ensureFoundation(sx - 1, floorY, sz + mid, pathMaterial, groundFill);
          }

          setChunkBlock(sx + 1, floorY - 1, sz + 1, BlockType.DIAMOND_ORE);
        };

        const buildBlacksmith = (sx: number, sz: number, floorY: number) => {
          for (let hx = 0; hx <= 4; hx++) {
            for (let hz = 0; hz <= 4; hz++) {
              ensureFoundation(sx + hx, floorY, sz + hz, BlockType.STONE, BlockType.STONE);
            }
          }
          for (let hx = 0; hx <= 4; hx++) {
            for (let hz = 0; hz <= 4; hz++) {
              const lx = sx + hx;
              const lz = sz + hz;
              for (let hy = 1; hy <= 3; hy++) {
                if (hx === 0 || hx === 4 || hz === 0 || hz === 4) {
                  const isDoor = hx === 2 && hz === 0; // Door facing North toward East Avenue
                  const isWindow = hy === 2 && hx === 4 && hz === 2;
                  if (isDoor) {
                    if (hy === 1 || hy === 2) setChunkBlock(lx, floorY + hy, lz, BlockType.DOOR);
                    else setChunkBlock(lx, floorY + hy, lz, BlockType.STONE);
                  } else if (isWindow) {
                    setChunkBlock(lx, floorY + hy, lz, BlockType.AIR);
                  } else {
                    setChunkBlock(lx, floorY + hy, lz, BlockType.STONE);
                  }
                } else {
                  setChunkBlock(lx, floorY + hy, lz, BlockType.AIR);
                }
              }
            }
          }
          setChunkBlock(sx + 1, floorY + 1, sz + 3, BlockType.FURNACE);
          setChunkBlock(sx + 2, floorY + 1, sz + 3, BlockType.FURNACE);
          setChunkBlock(sx + 3, floorY + 1, sz + 1, BlockType.CHEST);
          setChunkBlock(sx + 1, floorY + 1, sz + 1, BlockType.CRAFTING_TABLE);
          setChunkBlock(sx + 3, floorY + 1, sz + 3, BlockType.LAVA);
          setChunkBlock(sx + 2, floorY + 2, sz + 1, BlockType.TORCH);

          for (let hx = 0; hx <= 4; hx++) {
            for (let hz = 0; hz <= 4; hz++) {
              setChunkBlock(sx + hx, floorY + 4, sz + hz, BlockType.STONE);
            }
          }
          setChunkBlock(sx + 1, floorY + 5, sz + 3, BlockType.STONE);
          setChunkBlock(sx + 1, floorY + 6, sz + 3, BlockType.TORCH);
          ensureFoundation(sx + 2, floorY, sz - 1, pathMaterial, groundFill);
        };

        const buildLibrary = (sx: number, sz: number, floorY: number) => {
          for (let hx = 0; hx <= 4; hx++) {
            for (let hz = 0; hz <= 4; hz++) {
              ensureFoundation(sx + hx, floorY, sz + hz, BlockType.STONE, BlockType.STONE);
            }
          }
          for (let hx = 0; hx <= 4; hx++) {
            for (let hz = 0; hz <= 4; hz++) {
              const lx = sx + hx;
              const lz = sz + hz;
              for (let hy = 1; hy <= 3; hy++) {
                if (hx === 0 || hx === 4 || hz === 0 || hz === 4) {
                  const isCorner = (hx === 0 || hx === 4) && (hz === 0 || hz === 4);
                  const isDoor = hx === 2 && hz === 4; // Door facing South toward East Avenue
                  const isWindow = hy === 2 && ((hx === 0 && hz === 2) || (hx === 4 && hz === 2));
                  if (isDoor) {
                    if (hy === 1 || hy === 2) setChunkBlock(lx, floorY + hy, lz, BlockType.DOOR);
                    else setChunkBlock(lx, floorY + hy, lz, wallMat);
                  } else if (isWindow) {
                    setChunkBlock(lx, floorY + hy, lz, BlockType.AIR);
                  } else {
                    setChunkBlock(lx, floorY + hy, lz, isCorner ? cornerMat : wallMat);
                  }
                } else {
                  setChunkBlock(lx, floorY + hy, lz, BlockType.AIR);
                }
              }
            }
          }
          setChunkBlock(sx + 2, floorY + 1, sz + 1, BlockType.CARTOGRAPHY_TABLE);
          setChunkBlock(sx + 3, floorY + 1, sz + 1, BlockType.JUKEBOX);
          setChunkBlock(sx + 3, floorY + 1, sz + 3, BlockType.CHEST);
          setChunkBlock(sx + 1, floorY + 1, sz + 1, BlockType.BED);
          setChunkBlock(sx + 2, floorY + 2, sz + 1, BlockType.TORCH);

          for (let hx = 0; hx <= 4; hx++) {
            for (let hz = 0; hz <= 4; hz++) {
              const isPeak = hx >= 1 && hx <= 3 && hz >= 1 && hz <= 3;
              setChunkBlock(sx + hx, floorY + 4, sz + hz, wallMat);
              if (isPeak) setChunkBlock(sx + hx, floorY + 5, sz + hz, cornerMat);
            }
          }
          ensureFoundation(sx + 2, floorY, sz + 5, pathMaterial, groundFill);
        };

        if (rcx === 0 && rcz === 0) {
          // CENTRAL FOUNTAIN PLAZA (Entire 16x16 chunk dedicated to open square + fountain, zero houses crowding it!)
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              const isMainAvenue = (lx >= 7 && lx <= 8) || (lz >= 7 && lz <= 8);
              const isInnerPlaza = lx >= 3 && lx <= 12 && lz >= 3 && lz <= 12;
              const isCornerLawn = (lx <= 1 || lx >= 14) && (lz <= 1 || lz >= 14);
              if (isCornerLawn) {
                const edgeH = getWorldHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz).h;
                const blendY = Math.round(villageY * 0.65 + edgeH * 0.35);
                ensureFoundation(lx, blendY, lz, lawnMat, groundFill);
              } else {
                ensureFoundation(lx, villageY, lz, (isMainAvenue || isInnerPlaza) ? pathMaterial : lawnMat, groundFill);
              }
            }
          }

          // Central Village Fountain / Well (Pozo de la Aldea) at x=6..9, z=6..9
          for (let wx = 6; wx <= 9; wx++) {
            for (let wz = 6; wz <= 9; wz++) {
              for (let dy = -8; dy <= 0; dy++) {
                setChunkBlock(wx, villageY + dy, wz, BlockType.STONE);
              }
              const isCenter = (wx === 7 || wx === 8) && (wz === 7 || wz === 8);
              if (isCenter) {
                setChunkBlock(wx, villageY, wz, BlockType.WATER);
                setChunkBlock(wx, villageY + 1, wz, BlockType.WATER);
                clearAirColumn(wx, villageY + 2, 7, wz);
              } else {
                setChunkBlock(wx, villageY + 1, wz, BlockType.STONE);
                clearAirColumn(wx, villageY + 2, 7, wz);
              }
            }
          }
          [[6, 6], [6, 9], [9, 6], [9, 9]].forEach(([px, pz]) => {
            for (let dy = 2; dy <= 4; dy++) {
              setChunkBlock(px, villageY + dy, pz, BlockType.LOG);
            }
          });
          for (let rx = 6; rx <= 9; rx++) {
            for (let rz = 6; rz <= 9; rz++) {
              setChunkBlock(rx, villageY + 5, rz, BlockType.WOOD);
            }
          }
          setChunkBlock(7, villageY + 6, 7, BlockType.STONE);
          setChunkBlock(8, villageY + 6, 7, BlockType.STONE);
          setChunkBlock(7, villageY + 6, 8, BlockType.STONE);
          setChunkBlock(8, villageY + 6, 8, BlockType.STONE);
          setChunkBlock(7, villageY + 4, 7, BlockType.TORCH);

          // Symmetrical plaza streetlamps & corner flowerbeds well back from fountain
          placeLamp(3, 3);
          placeLamp(12, 3);
          placeLamp(3, 12);
          placeLamp(12, 12);
          setChunkBlock(3, villageY + 1, 5, BlockType.FLOWER_YELLOW);
          setChunkBlock(12, villageY + 1, 5, BlockType.FLOWER_RED);
          setChunkBlock(3, villageY + 1, 10, BlockType.FLOWER_RED);
          setChunkBlock(12, villageY + 1, 10, BlockType.FLOWER_YELLOW);
        } else if (rcx === -1 && rcz === 0) {
          // WEST QUARTER: Cottage + Crop Farm (13 blocks clear of central fountain!)
          for (let lx = 3; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              const isAvenue = lz >= 7 && lz <= 8;
              ensureFoundation(lx, villageY, lz, isAvenue ? pathMaterial : lawnMat, groundFill);
            }
          }
          // Smooth west avenue ramp toward outer terrain (lx = 0..2)
          [2, 1, 0].forEach((lx, idx) => {
            const t = (idx + 1) * 0.25;
            for (let lz = 7; lz <= 8; lz++) {
              const edgeH = getWorldHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz).h;
              const roadY = Math.round(villageY * (1 - t) + edgeH * t);
              ensureFoundation(lx, roadY, lz, pathMaterial, groundFill);
            }
          });

          // Residential Cottage at lx=5..9, lz=1..5 with porch onto West Avenue
          buildCottage(5, 1, villageY, 4, 'south');

          // Crop Farm at lx=5..9, lz=10..14 with gate onto West Avenue
          for (let fx = 5; fx <= 9; fx++) {
            for (let fz = 10; fz <= 14; fz++) {
              for (let dy = -8; dy <= -1; dy++) {
                setChunkBlock(fx, villageY + dy, fz, BlockType.DIRT);
              }
              const isGate = fx === 7 && fz === 10;
              const isBorder = (fx === 5 || fx === 9 || fz === 10 || fz === 14) && !isGate;
              const isWaterCanal = fx === 7 && fz >= 11 && fz <= 13;
              if (isGate) {
                setChunkBlock(fx, villageY, fz, pathMaterial);
                clearAirColumn(fx, villageY + 1, 6, fz);
              } else if (isBorder) {
                setChunkBlock(fx, villageY, fz, BlockType.LOG);
                clearAirColumn(fx, villageY + 1, 6, fz);
              } else if (isWaterCanal) {
                setChunkBlock(fx, villageY, fz, BlockType.WATER);
                clearAirColumn(fx, villageY + 1, 6, fz);
              } else {
                setChunkBlock(fx, villageY, fz, BlockType.DIRT);
                const crop = (fx + fz) % 3 === 0 ? BlockType.FLOWER_YELLOW : ((fx + fz) % 3 === 1 ? BlockType.FLOWER_RED : BlockType.MUSHROOM_BROWN);
                setChunkBlock(fx, villageY + 1, fz, crop);
                clearAirColumn(fx, villageY + 2, 5, fz);
              }
            }
          }
          ensureFoundation(7, villageY, 9, pathMaterial, groundFill);
          setChunkBlock(5, villageY + 1, 10, BlockType.CRAFTING_TABLE);
          placeLamp(12, 6);
          placeLamp(12, 9);
        } else if (rcx === 1 && rcz === 0) {
          // EAST QUARTER: Library & Blacksmith Forge (13 blocks clear of central fountain!)
          for (let lx = 0; lx <= 12; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              const isAvenue = lz >= 7 && lz <= 8;
              ensureFoundation(lx, villageY, lz, isAvenue ? pathMaterial : lawnMat, groundFill);
            }
          }
          // Smooth east avenue ramp toward outer terrain (lx = 13..15)
          [13, 14, 15].forEach((lx, idx) => {
            const t = (idx + 1) * 0.25;
            for (let lz = 7; lz <= 8; lz++) {
              const edgeH = getWorldHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz).h;
              const roadY = Math.round(villageY * (1 - t) + edgeH * t);
              ensureFoundation(lx, roadY, lz, pathMaterial, groundFill);
            }
          });

          buildLibrary(6, 1, villageY);
          buildBlacksmith(6, 10, villageY);
          placeLamp(3, 6);
          placeLamp(3, 9);
        } else if (rcx === 0 && rcz === -1) {
          // NORTH QUARTER: Two well-spaced North Avenue Houses (11+ blocks north of central fountain!)
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 5; lz < CHUNK_SIZE; lz++) {
              const isAvenue = lx >= 7 && lx <= 8;
              ensureFoundation(lx, villageY, lz, isAvenue ? pathMaterial : lawnMat, groundFill);
            }
          }
          [4, 3, 2, 1, 0].forEach((lz, idx) => {
            const t = (idx + 1) * 0.18;
            for (let lx = 7; lx <= 8; lx++) {
              const edgeH = getWorldHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz).h;
              const roadY = Math.round(villageY * (1 - t) + edgeH * t);
              ensureFoundation(lx, roadY, lz, pathMaterial, groundFill);
            }
          });

          buildCottage(1, 7, villageY, 4, 'east');
          buildCottage(10, 7, villageY, 4, 'west');
          placeLamp(6, 13);
          placeLamp(9, 13);
        } else if (rcx === 0 && rcz === 1) {
          // SOUTH QUARTER: Welcoming South Entrance Avenue blended into natural terrain
          for (let lz = 0; lz <= 10; lz++) {
            const t = Math.max(0, (lz - 2) / 9);
            for (let lx = 6; lx <= 9; lx++) {
              const isAvenue = lx >= 7 && lx <= 8;
              const edgeH = getWorldHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz).h;
              const roadY = Math.round(villageY * (1 - t) + edgeH * t);
              ensureFoundation(lx, roadY, lz, isAvenue ? pathMaterial : lawnMat, groundFill);
            }
          }
          placeLamp(6, 3);
          placeLamp(9, 3);
        }
      }
    }

    // Apply Far Lands corruption post-processing for overworld
    if (activeDimension !== 'nether') {
      const chunkSeed = getNoiseForWorld(worldId).seed;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const wz = cz * CHUNK_SIZE + lz;
          const maxCoord = Math.max(Math.abs(wx), Math.abs(wz));

          if (maxCoord >= 2000) {
            // Calculate corruption probability scaling from 0 at 2000 to 1 at 2300
            const corrFactor = Math.min(1, Math.max(0, (maxCoord - 2000) / 300));
            
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (y * CHUNK_SIZE) + lz;
              const block = data[idx];
              if (block === BlockType.BEDROCK) continue; // Keep bedrock intact

              if (maxCoord >= 2300) {
                // At >= 2300: pure water up to sea level (64), and air above
                if (y <= 64) {
                  data[idx] = BlockType.WATER;
                } else {
                  data[idx] = BlockType.AIR;
                }
              } else {
                // Between 2000 and 2300: corrupt with corrFactor probability
                const rand = getSeededRandom(1122 + chunkSeed, wx, wz, y);
                if (rand < corrFactor) {
                  if (y <= 64) {
                    data[idx] = BlockType.WATER;
                  } else {
                    data[idx] = BlockType.AIR;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Overlay all client edits for this specific chunk in O(edits_in_chunk)
    const chunkEdits = editsByChunkRef.current.get(k);
    if (chunkEdits) {
      chunkEdits.forEach((blk, idx) => {
        data[idx] = blk;
      });
    }
    } catch(e) { console.error("Chunk Error", e); }

    savedChunksRef.current[k] = data;
    return data;
  }, [isFlatWorld, worldId]);

  const _generateEntities = useCallback((cx: number, cz: number) => {
    const chunkEntities: EntityData[] = [];
    if (isFlatWorld) return chunkEntities; // No wild animals/mobs in flat worlds

    const worldConf = getNoiseForWorld(worldId);
    const chunkSeed = worldConf.seed;

    if (activeDimension === 'nether') {
      const rNether = getSeededRandom(chunkSeed, cx, cz, 777);
      if (rNether < 0.45) {
        const count = 1 + Math.floor(getSeededRandom(chunkSeed, cx, cz, 888) * 3);
        for (let i = 0; i < count; i++) {
          const rx = getSeededRandom(chunkSeed, cx, cz, 900 + i * 27);
          const rz = getSeededRandom(chunkSeed, cx, cz, 1000 + i * 27);
          const rRot = getSeededRandom(chunkSeed, cx, cz, 1200 + i * 27);
          const rType = getSeededRandom(chunkSeed, cx, cz, 1300 + i * 27);

          const wx = cx * CHUNK_SIZE + Math.floor(rx * (CHUNK_SIZE - 2) + 1);
          const wz = cz * CHUNK_SIZE + Math.floor(rz * (CHUNK_SIZE - 2) + 1);
          
          const bNoise = worldConf.biomeNoiseFun(wx * 0.022, wz * 0.022);
          const spawnH = 34 + Math.floor(Math.abs(bNoise) * 30);

          chunkEntities.push({
            id: `nether_${rType < 0.6 ? 'piglin' : 'hoglin'}_${cx},${cz},${i}`,
            type: rType < 0.6 ? EntityType.ZOMBIFIED_PIGLIN : EntityType.HOGLIN,
            pos: { x: wx, y: spawnH + 2, z: wz },
            rot: rRot * Math.PI * 2
          });
        }
      }
      return chunkEntities;
    }

    // 1. Passive Animals Spawning (30% probability, plus villagers/golem/cat in village quarters)
    const r1 = getSeededRandom(chunkSeed, cx, cz, 100);
    const villageInfo = getVillageLayoutInfo(cx, cz, chunkSeed, isFlatWorld, activeDimension);
    const hasVillageResidents =
      villageInfo !== null &&
      ((villageInfo.rcx === 0 && villageInfo.rcz === 0) ||
        (villageInfo.rcx === -1 && villageInfo.rcz === 0) ||
        (villageInfo.rcx === 1 && villageInfo.rcz === 0) ||
        (villageInfo.rcx === 0 && villageInfo.rcz === -1));

    if (r1 < 0.30 || hasVillageResidents) {
        const r2 = getSeededRandom(chunkSeed, cx, cz, 200);
        const villageSpawnCount =
          villageInfo?.rcx === 0 && villageInfo?.rcz === 0
            ? 3
            : villageInfo?.rcx === -1 || villageInfo?.rcx === 1
              ? 2
              : 1;
        const count = hasVillageResidents ? villageSpawnCount : 1 + Math.floor(r2 * 2);
        
        for (let i = 0; i < count; i++) {
            const rx = getSeededRandom(chunkSeed, cx, cz, 300 + i * 10);
            const rz = getSeededRandom(chunkSeed, cx, cz, 400 + i * 10);
            const rType = getSeededRandom(chunkSeed, cx, cz, 500 + i * 10);
            const rRot = getSeededRandom(chunkSeed, cx, cz, 600 + i * 10);

            const lx = rx * CHUNK_SIZE;
            const lz = rz * CHUNK_SIZE;
            let wx = cx * CHUNK_SIZE + lx;
            let wz = cz * CHUNK_SIZE + lz;
            const bInfo = getWorldHeight(wx, wz);
            let h = bInfo.h + 0.5;
            
            let eType = rType < 0.33 ? EntityType.PIG : (rType < 0.66 ? EntityType.SHEEP : EntityType.CHICKEN);
            if (bInfo.biome === 'autumn' && rType < 0.45) {
              eType = EntityType.WOLF;
            } else if (bInfo.biome === 'swamp' && rType < 0.65) {
              eType = EntityType.FROG;
            }

            if (hasVillageResidents && villageInfo) {
              const vY = villageInfo.villageY + 0.5;
              if (villageInfo.rcx === 0 && villageInfo.rcz === 0) {
                if (i === 0) {
                  eType = EntityType.IRON_GOLEM;
                  wx = cx * CHUNK_SIZE + 7.5;
                  wz = cz * CHUNK_SIZE + 4.5;
                  h = vY;
                } else if (i === 1) {
                  eType = EntityType.VILLAGER;
                  wx = cx * CHUNK_SIZE + 4.5;
                  wz = cz * CHUNK_SIZE + 7.5;
                  h = vY;
                } else {
                  eType = EntityType.CAT;
                  wx = cx * CHUNK_SIZE + 10.5;
                  wz = cz * CHUNK_SIZE + 5.5;
                  h = vY;
                }
              } else if (villageInfo.rcx === -1 && villageInfo.rcz === 0) {
                if (i === 0) {
                  eType = EntityType.VILLAGER;
                  wx = cx * CHUNK_SIZE + 7.5;
                  wz = cz * CHUNK_SIZE + 6.5;
                  h = vY;
                } else {
                  eType = EntityType.VILLAGER;
                  wx = cx * CHUNK_SIZE + 7.5;
                  wz = cz * CHUNK_SIZE + 9.2;
                  h = vY;
                }
              } else if (villageInfo.rcx === 1 && villageInfo.rcz === 0) {
                if (i === 0) {
                  eType = EntityType.VILLAGER;
                  wx = cx * CHUNK_SIZE + 8.5;
                  wz = cz * CHUNK_SIZE + 6.5;
                  h = vY;
                } else {
                  eType = EntityType.VILLAGER;
                  wx = cx * CHUNK_SIZE + 8.5;
                  wz = cz * CHUNK_SIZE + 9.2;
                  h = vY;
                }
              } else {
                eType = EntityType.VILLAGER;
                wx = cx * CHUNK_SIZE + 7.5;
                wz = cz * CHUNK_SIZE + 9.5;
                h = vY;
              }
            } else if (bInfo.h < 56 && !(eType === EntityType.FROG && bInfo.h >= 55)) {
              // Avoid spawning land passive mobs submerged underwater in deep lakes/seas
              continue;
            }
            
            chunkEntities.push({
                id: `passive_${cx},${cz},${i}`,
                type: eType,
                pos: { x: wx, y: h, z: wz },
                rot: rRot * Math.PI * 2
            });
        }
    }

    // 2. Hostile Monsters Spawning ONLY at night (never spawn outdoors during the day!)
    const isCurrentlyDay = Math.sin(gameTimeRef.current) >= 0;
    const rHostile = getSeededRandom(chunkSeed, cx, cz, 700);
    if (!isCurrentlyDay && rHostile < 0.25) {
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
            const bInfo = getWorldHeight(wx, wz);
            if (bInfo.h < 56) continue; // Keep hostile monsters on dry terrain instead of seabed
            const h = bInfo.h + 0.5;

            let mType = EntityType.ZOMBIE;
            if (rType < 0.08) {
              mType = EntityType.ENDERMAN;
            } else if (rType < 0.35) {
              mType = EntityType.CREEPER;
            } else if (rType < 0.70) {
              if (bInfo.biome === 'snow') {
                mType = EntityType.SNOW_SKELETON;
              } else if (bInfo.biome === 'swamp') {
                mType = EntityType.SWAMP_SKELETON;
              } else {
                mType = EntityType.SKELETON;
              }
            }

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

  const generateEntities = useCallback((cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    if (savedEntitiesRef.current[k]) {
      return savedEntitiesRef.current[k];
    }
    const res = _generateEntities(cx, cz);
    savedEntitiesRef.current[k] = res;
    return res;
  }, [_generateEntities]);

  useEffect(() => {
    const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
    const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
    
    // Check if we are still in same chunk
    if (pcx === lastGenerationCoords.current.x && pcz === lastGenerationCoords.current.z) return;
    lastGenerationCoords.current = { x: pcx, z: pcz };

    const neededKeys = new Set<string>();
    const toEnqueue: { k: string; cx: number; cz: number; dist: number }[] = [];
    let hasLoadedAny = false;
    for (const _k in chunksRef.current) {
      hasLoadedAny = true;
      break;
    }
    const SYNC_RADIUS = hasLoadedAny ? 0 : 1; // Full 3x3 only at spawn; only standing chunk sync while walking
    const finalSyncRadius = ultraOptimization ? 0 : SYNC_RADIUS;

    const viewDist = ultraOptimization ? 1 : (perfConfig?.renderDistance ?? VIEW_DISTANCE);

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
          if (dist <= finalSyncRadius) {
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
      const comma = key.indexOf(',');
      const cx = parseInt(key.slice(0, comma), 10);
      const cz = parseInt(key.slice(comma + 1), 10);
      if (Math.abs(cx - pcx) > PRUNE_DISTANCE || Math.abs(cz - pcz) > PRUNE_DISTANCE) {
        delete chunksRef.current[key];
        delete entitiesRef.current[key];
      }
    }

    // Keep only currently needed/alive chunks in active state without triggering no-op re-renders
    setChunks(prev => {
      const nextChunks: Record<string, Uint8Array> = {};
      let changed = false;
      let nextCount = 0;
      for (const key in chunksRef.current) {
        if (neededKeys.has(key)) {
          const val = chunksRef.current[key] || prev[key];
          nextChunks[key] = val;
          nextCount++;
          if (prev[key] !== val) changed = true;
        }
      }
      if (!changed && nextCount === Object.keys(prev).length) {
        return prev;
      }
      return nextChunks;
    });

    const nextEntities: Record<string, EntityData[]> = {};
    for (const key in chunksRef.current) {
      if (neededKeys.has(key)) {
        nextEntities[key] = entitiesRef.current[key] || [];
      }
    }
    setEntities(nextEntities);

    // Sort the missing chunks by proximity (Manhattan distance) to load nearest first
    toEnqueue.sort((a, b) => a.dist - b.dist);
    pendingChunksRef.current = toEnqueue.map(item => item.k);

    // Cancel any ongoing async chunk loader scheduled
    if (asyncLoaderTimerRef.current) {
      clearTimeout(asyncLoaderTimerRef.current);
      asyncLoaderTimerRef.current = null;
    }

    // Run active queue processor with per-frame CPU budget to avoid frame spikes
    if (pendingChunksRef.current.length > 0) {
      processingQueueRef.current = true;

      const processNextChunk = () => {
        if (pendingChunksRef.current.length === 0) {
          processingQueueRef.current = false;
          return;
        }

        const batchStartMs = performance.now();
        const maxBatches = ultraOptimization ? 1 : (perfConfig?.maxConcurrentChunks ?? 2);
        const updatesToApply: Record<string, Uint8Array> = {};
        const entityUpdatesToApply: Record<string, EntityData[]> = {};
        let processedCount = 0;

        while (
          processedCount < maxBatches &&
          pendingChunksRef.current.length > 0 &&
          (processedCount === 0 || performance.now() - batchStartMs < 5.5)
        ) {
          const nextKey = pendingChunksRef.current.shift();
          if (!nextKey) break;
          const comma = nextKey.indexOf(',');
          const cx = parseInt(nextKey.slice(0, comma), 10);
          const cz = parseInt(nextKey.slice(comma + 1), 10);
          const currPcx = Math.floor(playerPosRef.current.x / CHUNK_SIZE);
          const currPcz = Math.floor(playerPosRef.current.z / CHUNK_SIZE);

          if (Math.abs(cx - currPcx) <= viewDist && Math.abs(cz - currPcz) <= viewDist && !chunksRef.current[nextKey]) {
            const newC = generateChunk(cx, cz);
            const newE = generateEntities(cx, cz);

            chunksRef.current[nextKey] = newC;
            entitiesRef.current[nextKey] = newE;

            updatesToApply[nextKey] = newC;
            entityUpdatesToApply[nextKey] = newE;
            processedCount++;
          }
        }

        if (processedCount > 0) {
          setChunks(prev => {
            const freshPcx = Math.floor(playerPosRef.current.x / CHUNK_SIZE);
            const freshPcz = Math.floor(playerPosRef.current.z / CHUNK_SIZE);
            const nextState = { ...prev };
            let updated = false;
            for (const key in updatesToApply) {
              const comma = key.indexOf(',');
              const cx = parseInt(key.slice(0, comma), 10);
              const cz = parseInt(key.slice(comma + 1), 10);
              if (Math.abs(cx - freshPcx) <= viewDist && Math.abs(cz - freshPcz) <= viewDist) {
                nextState[key] = chunksRef.current[key] || updatesToApply[key];
                updated = true;
              }
            }
            return updated ? nextState : prev;
          });

          setEntities(prev => {
            const freshPcx = Math.floor(playerPosRef.current.x / CHUNK_SIZE);
            const freshPcz = Math.floor(playerPosRef.current.z / CHUNK_SIZE);
            const nextState = { ...prev };
            let updated = false;
            for (const key in entityUpdatesToApply) {
              const comma = key.indexOf(',');
              const cx = parseInt(key.slice(0, comma), 10);
              const cz = parseInt(key.slice(comma + 1), 10);
              if (Math.abs(cx - freshPcx) <= viewDist && Math.abs(cz - freshPcz) <= viewDist) {
                nextState[key] = entityUpdatesToApply[key];
                updated = true;
              }
            }
            return updated ? nextState : prev;
          });
        }

        if (pendingChunksRef.current.length === 0) {
          processingQueueRef.current = false;
          return;
        }
        const elapsedMs = performance.now() - batchStartMs;
        const delay = Math.max(ultraOptimization ? 28 : 16, Math.min(48, Math.round(elapsedMs * 1.5)));
        asyncLoaderTimerRef.current = setTimeout(processNextChunk, delay);
      };

      asyncLoaderTimerRef.current = setTimeout(processNextChunk, 16);
    } else {
      processingQueueRef.current = false;
    }
  }, [Math.floor(playerPos.x / CHUNK_SIZE), Math.floor(playerPos.z / CHUNK_SIZE), generateChunk, generateEntities, ultraOptimization, perfConfig]);

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
    if (block !== BlockType.AIR && block !== BlockType.BEDROCK && block !== BlockType.WATER && block !== BlockType.LAVA) {
      if (onSelectBlockRef.current) {
        onSelectBlockRef.current(block);
        triggerInGameMessageRef.current(`Bloque agarrado: ${BLOCK_NAMES[block]}`);
      }
    }
  }, []);

  const executeBreak = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    if (gameModeRef.current === 'adventure' || gameModeRef.current === 'aventura' || gameModeRef.current === 'spectator' || gameModeRef.current === 'espectador') {
      return;
    }

    // Limit reach distance using stable playerPosRef
    const currPos = playerPosRef.current;
    const playerVec = new THREE.Vector3(currPos.x, currPos.y, currPos.z);
    if (playerVec.distanceTo(point) > 7.5) return;

    // Melee Hitbox Assist: only intercept break if click point is strictly inside/close to the entity's actual hitbox
    if (entitiesRef && entitiesRef.current) {
      let hitEntId: string | null = null;
      let minEntDist = 1.05;

      const entChunks = Object.values(entitiesRef.current);
      for (const entList of entChunks) {
        if (!Array.isArray(entList)) continue;
        for (const ent of entList) {
          if (!ent || !ent.pos || ent.type === EntityType.ARROW) continue;
          const hb = getEntityHitbox(ent.type);
          const halfW = hb.width * 0.5 + 0.12;
          const halfH = hb.height * 0.5 + 0.12;
          const halfD = hb.depth * 0.5 + 0.12;
          const entCY = ent.pos.y + hb.centerY;
          const dx = Math.abs(point.x - ent.pos.x);
          const dy = Math.abs(point.y - entCY);
          const dz = Math.abs(point.z - ent.pos.z);
          if (dx <= Math.max(halfW, halfD) && dy <= halfH && dz <= Math.max(halfW, halfD)) {
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < minEntDist) {
              minEntDist = dist;
              hitEntId = ent.id;
            }
          }
        }
      }

      if (hitEntId && globalEntityHitHandlers.has(hitEntId)) {
        const hitFn = globalEntityHitHandlers.get(hitEntId);
        if (hitFn) {
          hitFn();
          return; // Damaged the entity - do not break the block behind it!
        }
      }
    }

    // Shift target inwards to hit the intersected voxel, with tight fallback for thin blocks like open doors
    const currentChunks = chunksRef.current;
    const probeVoxel = (offset: number) => {
      const t = point.clone().sub(normal.clone().multiplyScalar(offset));
      const tx = Math.round(t.x);
      const ty = Math.round(t.y);
      const tz = Math.round(t.z);
      if (ty < 0 || ty >= WORLD_HEIGHT) return null;
      const tcx = Math.floor(tx / CHUNK_SIZE);
      const tcz = Math.floor(tz / CHUNK_SIZE);
      const tk = `${tcx},${tcz}`;
      const tc = currentChunks[tk];
      if (!tc) return null;
      const tlx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const tlz = ((tz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const tidx = (tlx * CHUNK_SIZE * WORLD_HEIGHT) + (ty * CHUNK_SIZE) + tlz;
      return { wx: tx, wy: ty, wz: tz, k: tk, lx: tlx, ly: ty, lz: tlz, idx: tidx, block: tc[tidx] as BlockType };
    };

    let hit = probeVoxel(0.1);
    if (!hit || hit.block === BlockType.AIR || hit.block === BlockType.WATER || hit.block === BlockType.LAVA) {
      const shallowHit = probeVoxel(0.02);
      if (shallowHit && shallowHit.block !== BlockType.AIR && shallowHit.block !== BlockType.WATER && shallowHit.block !== BlockType.LAVA) {
        hit = shallowHit;
      }
    }
    if (!hit || hit.block === BlockType.AIR || hit.block === BlockType.BEDROCK || hit.block === BlockType.WATER || hit.block === BlockType.LAVA) return;

    const { wx, wy, wz, k, lx, ly, lz, idx, block: brokenBlock } = hit;

    // Break block
    const newData = new Uint8Array(currentChunks[k]);
    newData[idx] = BlockType.AIR;

    if (brokenBlock === BlockType.DOOR) {
      const doorKeysToClear = [`${wx},${wy},${wz}`];
      if (ly > 0) {
        const idxBelow = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((ly - 1) * CHUNK_SIZE) + lz;
        if (newData[idxBelow] === BlockType.DOOR) {
          newData[idxBelow] = BlockType.AIR;
          doorKeysToClear.push(`${wx},${wy - 1},${wz}`);
          if (editsRef.current) editsRef.current[`${wx},${wy - 1},${wz}`] = BlockType.AIR;
          if (onBlockEditRef.current) (onBlockEditRef.current as any)(wx, wy - 1, wz, BlockType.AIR, BlockType.DOOR);
        }
      }
      if (ly < WORLD_HEIGHT - 1) {
        const idxAbove = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((ly + 1) * CHUNK_SIZE) + lz;
        if (newData[idxAbove] === BlockType.DOOR) {
          newData[idxAbove] = BlockType.AIR;
          doorKeysToClear.push(`${wx},${wy + 1},${wz}`);
          if (editsRef.current) editsRef.current[`${wx},${wy + 1},${wz}`] = BlockType.AIR;
          if (onBlockEditRef.current) (onBlockEditRef.current as any)(wx, wy + 1, wz, BlockType.AIR, BlockType.DOOR);
        }
      }
      setOpenDoors(prev => {
        let changed = false;
        const next = { ...prev };
        for (const dk of doorKeysToClear) {
          if (dk in next) {
            delete next[dk];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    // Commit chunksRef & savedChunksRef synchronously before triggering React state or callbacks
    chunksRef.current[k] = newData;
    savedChunksRef.current[k] = newData;
    setChunks(prev => ({ ...prev, [k]: newData }));
    enqueueFluidNeighbors(wx, wy, wz, { [k]: newData });

    if (editsRef.current) {
      editsRef.current[`${wx},${wy},${wz}`] = BlockType.AIR;
    }
    if (onBlockEditRef.current) {
      (onBlockEditRef.current as any)(wx, wy, wz, BlockType.AIR, brokenBlock);
    }

    if (brokenBlock === BlockType.JUKEBOX) {
      const jbKey = `${wx},${wy},${wz}`;
      const activeDisc = playingJukeboxesRef.current[jbKey];
      if (activeDisc) {
        stopJukeboxMusic(jbKey);
        setPlayingJukeboxes(prev => {
          const copy = { ...prev };
          delete copy[jbKey];
          return copy;
        });
        if (gameModeRef.current === 'survival' || gameModeRef.current === 'supervivencia') {
          if (onUpdateSurvivalInventoryRef.current) {
            onUpdateSurvivalInventoryRef.current(prev => ({
              ...prev,
              [activeDisc]: (prev[activeDisc] || 0) + 1
            }));
          }
        }
        triggerInGameMessageRef.current(`💿 Tocadiscos destruido. Recuperado: ${BLOCK_NAMES[activeDisc]}`);
      }
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
  }, [enqueueFluidNeighbors]);

  const performMeleeAttack = useCallback(() => {
    resumeAudio();
    playAttackSwingSound();

    const currPos = playerPosRef.current;
    if (!currPos) return;

    // 1. Search for any entity within reach (4.5 blocks)
    if (entitiesRef && entitiesRef.current) {
      let hitEntId: string | null = null;
      let minEntDist = 4.5;

      const entChunks = Object.values(entitiesRef.current);
      for (const entList of entChunks) {
        if (!Array.isArray(entList)) continue;
        for (const ent of entList) {
          if (!ent || !ent.pos || ent.type === EntityType.ARROW) continue;
          const hb = getEntityHitbox(ent.type);
          const entCY = ent.pos.y + hb.centerY;
          const dx = ent.pos.x - currPos.x;
          const dy = entCY - (currPos.y + 1.6);
          const dz = ent.pos.z - currPos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < minEntDist) {
            minEntDist = dist;
            hitEntId = ent.id;
          }
        }
      }

      if (hitEntId && globalEntityHitHandlers.has(hitEntId)) {
        const hitFn = globalEntityHitHandlers.get(hitEntId);
        if (hitFn) {
          hitFn();
          triggerInGameMessageRef.current("¡Ataque asestado!");
          return;
        }
      }
    }

    // 2. If no entity nearby, hit aimed crosshair block (or pointer fallback)
    if (aimedVoxelRef.current) {
      executeBreak(aimedVoxelRef.current.point, aimedVoxelRef.current.normal);
    } else if (pointerGestureRef.current?.point && pointerGestureRef.current?.normal) {
      executeBreak(pointerGestureRef.current.point, pointerGestureRef.current.normal);
    }
  }, [executeBreak]);

  const lastAttackTriggerRef = useRef(attackTrigger || 0);
  useEffect(() => {
    if (attackTrigger && attackTrigger > (lastAttackTriggerRef.current || 0)) {
      lastAttackTriggerRef.current = attackTrigger;
      performMeleeAttack();
    }
  }, [attackTrigger, performMeleeAttack]);

  const executePlace = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    if (gameModeRef.current === 'adventure' || gameModeRef.current === 'aventura' || gameModeRef.current === 'spectator' || gameModeRef.current === 'espectador') {
      return;
    }

    // Limit reach distance using stable playerPosRef
    const currPos = playerPosRef.current;
    const playerVec = new THREE.Vector3(currPos.x, currPos.y, currPos.z);
    if (playerVec.distanceTo(point) > 7.5) return;

    const blockToPlace = currentBlockRef.current;
    const currentChunks = chunksRef.current;

    // --- INTERACTIVE BLOCKS FIRST (Door, Jukebox, Crafting Table, Furnace, Cartography Table, Chest, Bed) ---
    // Run BEFORE survival item quantity check so doors/tables/beds always open even on empty/0-count slots!
    const probeClick = (offset: number) => {
      const t = point.clone().sub(normal.clone().multiplyScalar(offset));
      const tx = Math.round(t.x);
      const ty = Math.round(t.y);
      const tz = Math.round(t.z);
      if (ty < 0 || ty >= WORLD_HEIGHT) return null;
      const tcx = Math.floor(tx / CHUNK_SIZE);
      const tcz = Math.floor(tz / CHUNK_SIZE);
      const tk = `${tcx},${tcz}`;
      const tc = currentChunks[tk];
      if (!tc) return null;
      const tlx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const tlz = ((tz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const tidx = (tlx * CHUNK_SIZE * WORLD_HEIGHT) + (ty * CHUNK_SIZE) + tlz;
      return { wx: tx, wy: ty, wz: tz, k: tk, lx: tlx, lz: tlz, idx: tidx, block: tc[tidx] as BlockType };
    };

    let clickHit = probeClick(0.1);
    if (!clickHit || clickHit.block === BlockType.AIR) {
      const shallowClick = probeClick(0.02);
      if (shallowClick && shallowClick.block !== BlockType.AIR) {
        clickHit = shallowClick;
      }
    }

    if (clickHit) {
      const { wx: clickWx, wy: clickWy, wz: clickWz, k: clickK, lx: clickLx, lz: clickLz, block: clickedBlock } = clickHit;

      // --- WOODEN DOOR TOGGLING ---
      if (clickedBlock === BlockType.DOOR) {
        let doorBaseY = clickWy;
        if (clickWy > 0) {
          const idxBelow = (clickLx * CHUNK_SIZE * WORLD_HEIGHT) + ((clickWy - 1) * CHUNK_SIZE) + clickLz;
          if (currentChunks[clickK][idxBelow] === BlockType.DOOR) {
            doorBaseY = clickWy - 1;
          }
        }
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

      if (clickedBlock === BlockType.JUKEBOX) {
        const jbKey = `${clickWx},${clickWy},${clickWz}`;
        const activeDisc = playingJukeboxesRef.current[jbKey];

        if (activeDisc) {
          // --- EJECT ACTIVE DISC ---
          stopJukeboxMusic(jbKey);
          
          setPlayingJukeboxes(prev => {
            const copy = { ...prev };
            delete copy[jbKey];
            return copy;
          });

          if (gameModeRef.current === 'survival' || gameModeRef.current === 'supervivencia') {
            if (onUpdateSurvivalInventoryRef.current) {
              onUpdateSurvivalInventoryRef.current(prev => ({
                ...prev,
                [activeDisc]: (prev[activeDisc] || 0) + 1
              }));
            }
          }

          playPlaceSound(BlockType.WOOD);
          triggerInGameMessageRef.current(`💿 Disco expulsado: ${BLOCK_NAMES[activeDisc]}`);
        } else {
          // --- INSERT MUSIC DISC ---
          const heldBlock = currentBlockRef.current;
          const isDisc = heldBlock === BlockType.MUSIC_DISC_CAT ||
                         heldBlock === BlockType.MUSIC_DISC_CHIRP ||
                         heldBlock === BlockType.MUSIC_DISC_BLOCKS ||
                         heldBlock === BlockType.MUSIC_DISC_MELLOHI;

          if (isDisc) {
            if (gameModeRef.current === 'survival' || gameModeRef.current === 'supervivencia') {
              const currentInv = survivalInventoryRef.current || {};
              const count = currentInv[heldBlock] || 0;
              if (count <= 0) {
                triggerInGameMessageRef.current("¡No tienes este disco en tu inventario!");
                return;
              }

              if (onUpdateSurvivalInventoryRef.current) {
                onUpdateSurvivalInventoryRef.current(prev => {
                  const next = {
                    ...prev,
                    [heldBlock]: Math.max(0, (prev[heldBlock] || 0) - 1)
                  };
                  if (next[heldBlock] <= 0 && currentBlockRef.current === heldBlock) {
                    const another = Object.keys(next).map(Number).find((k) => next[k] > 0);
                    if (another && onSelectBlockRef.current) {
                      onSelectBlockRef.current(another);
                    }
                  }
                  return next;
                });
              }
            }

            setPlayingJukeboxes(prev => ({
              ...prev,
              [jbKey]: heldBlock
            }));

            playJukeboxMusic(jbKey, heldBlock);
            triggerInGameMessageRef.current(`🎵 Sonando ahora: ${BLOCK_NAMES[heldBlock]}`);
          } else {
            triggerInGameMessageRef.current("📻 El Tocadiscos está vacío. Inserta un Disco de Música.");
          }
        }
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

      if (clickedBlock === BlockType.FURNACE) {
        if (onOpenFurnaceRef.current) {
          onOpenFurnaceRef.current();
        } else {
          triggerInGameMessageRef.current("🔥 ¡Horno abierto!");
        }
        return;
      }

      if (clickedBlock === BlockType.CARTOGRAPHY_TABLE) {
        if (onOpenCartographyTableRef.current) {
          onOpenCartographyTableRef.current();
        } else {
          triggerInGameMessageRef.current("🗺️ ¡Mesa de cartografía abierta!");
        }
        return;
      }

      if (clickedBlock === BlockType.CHEST) {
        if (onOpenChestRef.current) {
          onOpenChestRef.current();
        } else {
          triggerInGameMessageRef.current("📦 ¡Cofre abierto!");
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
          chunksRef.current[clickK] = newData;
          savedChunksRef.current[clickK] = newData;
          setChunks(prev => ({ ...prev, [clickK]: newData }));
          if (editsRef.current) editsRef.current[`${clickWx},${clickWy},${clickWz}`] = BlockType.AIR;
          if (onBlockEditRef.current) onBlockEditRef.current(clickWx, clickWy, clickWz, BlockType.AIR);
          if (onSelectBlockRef.current) onSelectBlockRef.current(BlockType.BUCKET_WATER);
          playPlaceSound(BlockType.WATER);
          return;
        } else if (clickedBlock === BlockType.LAVA) {
          const newData = new Uint8Array(currentChunks[clickK]);
          newData[clickidx] = BlockType.AIR;
          chunksRef.current[clickK] = newData;
          savedChunksRef.current[clickK] = newData;
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
    if (isHandheldWeaponOrTool(blockToPlace)) {
      triggerInGameMessageRef.current("⚔️ ¡Es una herramienta/arma! Úsala para atacar mobs o minar.");
      return;
    }

    const target = point.clone().add(normal.clone().multiplyScalar(0.1));

    const baseWx = Math.round(target.x);
    const baseWy = Math.round(target.y);
    const baseWz = Math.round(target.z);

    let blockToActuallyPlace = blockToPlace;
    let isBucketPlacement = false;
    if (blockToPlace === BlockType.BUCKET_WATER) {
      blockToActuallyPlace = BlockType.WATER;
      isBucketPlacement = true;
    } else if (blockToPlace === BlockType.BUCKET_LAVA) {
      blockToActuallyPlace = BlockType.LAVA;
      isBucketPlacement = true;
    } else if (blockToPlace === BlockType.FLINT_AND_STEEL) {
      blockToActuallyPlace = BlockType.FIRE;
    }

    // Use build brush (1x1, 3-wide row, or 3x2 house wall) for normal blocks
    const useBrush =
      blockToPlace !== BlockType.DOOR &&
      !isBucketPlacement &&
      blockToPlace !== BlockType.FLINT_AND_STEEL &&
      blockToPlace !== BlockType.BED;

    const yawNow = playerPoseRef?.current?.yaw ?? 0;
    const lookX = -Math.sin(yawNow);
    const lookZ = -Math.cos(yawNow);
    const offsets = useBrush ? getBrushOffsets(buildBrushRef.current, lookX, lookZ) : [[0, 0, 0] as [number, number, number]];

    const isSurvival = gameModeRef.current === 'survival' || gameModeRef.current === 'supervivencia';
    let remainingInv = isSurvival ? ((survivalInventoryRef.current || {})[blockToPlace] || 0) : Infinity;

    const pMinX = currPos.x - 0.28, pMaxX = currPos.x + 0.28;
    const pMinY = currPos.y - 1.48, pMaxY = currPos.y + 0.22;
    const pMinZ = currPos.z - 0.28, pMaxZ = currPos.z + 0.28;

    const mutatedChunks: Record<string, Uint8Array> = {};
    let placedCount = 0;

    for (let o = 0; o < offsets.length; o++) {
      if (isSurvival && remainingInv <= 0) break;

      const wx = baseWx + offsets[o][0];
      const wy = baseWy + offsets[o][1];
      const wz = baseWz + offsets[o][2];
      if (wy < 0 || wy >= WORLD_HEIGHT) continue;

      // Exact AABB check against player body so walls, floors, and jump-pillaring work smoothly
      const overlapsPlayer =
        wx + 0.5 > pMinX && wx - 0.5 < pMaxX &&
        wy + 0.5 > pMinY && wy - 0.5 < pMaxY &&
        wz + 0.5 > pMinZ && wz - 0.5 < pMaxZ;
      if (overlapsPlayer) continue;

      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const k = `${cx},${cz}`;
      const baseChunk = mutatedChunks[k] || currentChunks[k];
      if (!baseChunk) continue;

      const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const idx = (lx * CHUNK_SIZE * WORLD_HEIGHT) + (wy * CHUNK_SIZE) + lz;
      const existingBlk = baseChunk[idx];
      if (existingBlk !== BlockType.AIR && existingBlk !== BlockType.WATER && existingBlk !== BlockType.LAVA) continue;

      // Door twin-block placement check
      if (blockToPlace === BlockType.DOOR) {
        if (wy >= WORLD_HEIGHT - 1) continue;
        const idxAbove = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((wy + 1) * CHUNK_SIZE) + lz;
        const aboveBlk = baseChunk[idxAbove];
        if (aboveBlk !== BlockType.AIR && aboveBlk !== BlockType.WATER) {
          triggerInGameMessageRef.current("🚫 ¡No hay suficiente espacio para colocar una puerta de 2 de alto!");
          continue;
        }
      }

      if (!mutatedChunks[k]) {
        mutatedChunks[k] = new Uint8Array(baseChunk);
      }
      mutatedChunks[k][idx] = blockToActuallyPlace;
      placedCount++;
      if (isSurvival) remainingInv--;

      if (blockToPlace === BlockType.DOOR) {
        const idxAbove = (lx * CHUNK_SIZE * WORLD_HEIGHT) + ((wy + 1) * CHUNK_SIZE) + lz;
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

      // Seed bounded fluid / fire simulation if liquid or fire was placed
      const placedKey = `${wx},${wy},${wz}`;
      if (mutatedChunks[k][idx] === BlockType.WATER || mutatedChunks[k][idx] === BlockType.LAVA) {
        fluidLevelRef.current.set(placedKey, 0);
        if (activeFluidCellsRef.current.size < 250) {
          activeFluidCellsRef.current.add(placedKey);
        }
      } else if (mutatedChunks[k][idx] === BlockType.FIRE) {
        if (activeFireCellsRef.current.size < 100) {
          activeFireCellsRef.current.add(placedKey);
        }
      }
    }

    if (placedCount === 0) return;

    for (const mk in mutatedChunks) {
      chunksRef.current[mk] = mutatedChunks[mk];
      savedChunksRef.current[mk] = mutatedChunks[mk];
    }
    setChunks(prev => ({ ...prev, ...mutatedChunks }));

    if (isBucketPlacement && onSelectBlockRef.current) {
      onSelectBlockRef.current(BlockType.BUCKET_EMPTY);
    }

    playPlaceSound(blockToActuallyPlace);
  }, []);

  const lastPlaceTriggerRef = useRef(placeTrigger || 0);
  useEffect(() => {
    if (placeTrigger && placeTrigger > (lastPlaceTriggerRef.current || 0)) {
      lastPlaceTriggerRef.current = placeTrigger;
      if (aimedVoxelRef.current) {
        executePlace(aimedVoxelRef.current.point, aimedVoxelRef.current.normal);
      }
    }
  }, [placeTrigger, executePlace]);

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

  const handleInteraction = useCallback((pos: THREE.Vector3, normal: THREE.Vector3, clientX: number, clientY: number, button?: number) => {
    // Desktop Right-Click (button === 2): Place / Interact immediately
    if (button === 2) {
      if (pointerGestureRef.current?.timeoutId) {
        clearTimeout(pointerGestureRef.current.timeoutId);
      }
      pointerGestureRef.current = {
        startX: clientX,
        startY: clientY,
        point: pos.clone(),
        normal: normal.clone(),
        resolved: true,
        timeoutId: null
      };
      executePlace(pos, normal);
      return;
    }

    // Desktop Middle-Click (button === 1): Pick block
    if (button === 1) {
      executePick(pos, normal);
      pointerGestureRef.current = {
        startX: clientX,
        startY: clientY,
        point: pos.clone(),
        normal: normal.clone(),
        resolved: true,
        timeoutId: null
      };
      return;
    }

    const now = Date.now();
    if (lastTapRef.current && (now - lastTapRef.current.time < 280)) {
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
  }, [executeBreak, executePick, executePlace]);

  const isSoftwareGL = useMemo(() => detectSoftwareGL(), []);

  const visibleEntities = useMemo(() => {
    const allEntities: EntityData[] = [];
    for (const ek in entities) {
      const list = entities[ek];
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          allEntities.push(list[i]);
        }
      }
    }
    const pPos = playerPosRef.current;
    if (pPos && allEntities.length > 1) {
      allEntities.sort((a, b) => {
        const da = (a.pos.x - pPos.x) * (a.pos.x - pPos.x) + (a.pos.z - pPos.z) * (a.pos.z - pPos.z);
        const db = (b.pos.x - pPos.x) * (b.pos.x - pPos.x) + (b.pos.z - pPos.z) * (b.pos.z - pPos.z);
        return da - db;
      });
    }
    const maxEnts = perfConfig?.maxEntities ?? 15;
    return allEntities.slice(0, maxEnts);
  }, [entities, perfConfig?.maxEntities, Math.floor(playerPos.x / CHUNK_SIZE), Math.floor(playerPos.z / CHUNK_SIZE)]);

  return (
    <div
      className="absolute inset-0 w-full h-full overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute top-2 right-20 bg-black/50 text-white font-mono text-xs p-1 pointer-events-none z-50 rounded">
        Chunks loaded: {Object.keys(chunks).length}
      </div>
      <Canvas 
        id="voxel-canvas"
        style={{ width: '100%', height: '100%', display: 'block' }}
        dpr={isSoftwareGL || ultraOptimization ? 0.75 : (perfConfig?.effectsQuality === 'high' ? [1, 1.25] : 1)}
        camera={{
          fov: fov,
          near: 0.1,
          far: Math.max(96, (perfConfig?.renderDistance ?? VIEW_DISTANCE) * CHUNK_SIZE + 48),
          position: [playerPos.x !== undefined ? playerPos.x : 0, playerPos.y !== undefined ? playerPos.y : 80, playerPos.z !== undefined ? playerPos.z : 0],
        }} 
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: false }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={resumeAudio}
        onPointerMove={(e) => {
          if (pointerGestureRef.current && !pointerGestureRef.current.resolved) {
            const dx = e.clientX - pointerGestureRef.current.startX;
            const dy = e.clientY - pointerGestureRef.current.startY;
            if (Math.sqrt(dx * dx + dy * dy) > 24) {
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
            if (e.button === 0 && interactionModeRef.current === 'break') {
              executeBreak(pointerGestureRef.current.point, pointerGestureRef.current.normal);
            } else {
              executePlace(pointerGestureRef.current.point, pointerGestureRef.current.normal);
            }
          }
        }}
      >
        <ScreenshotBridge />
        <TargetBlockHighlight
          chunksRef={chunksRef}
          currentBlockRef={currentBlockRef}
          buildBrushRef={buildBrushRef}
          interactionModeRef={interactionModeRef}
          aimedVoxelRef={aimedVoxelRef}
          playerPosRef={playerPosRef}
        />
        <MinecraftEnvironment 
          gameTimeRef={gameTimeRef} 
          isSleepingRef={isSleepingRef} 
          setIsSleeping={setIsSleeping} 
          ultraOptimization={ultraOptimization || isSoftwareGL} 
          lightingQuality={perfConfig?.lightingQuality ?? 'low'}
          playerPosRef={playerPosRef}
          weatherRef={weatherRef}
          currentBlockRef={currentBlockRef}
        />

        <WeatherSystem
          playerPosRef={playerPosRef}
          weatherRef={weatherRef}
          ultraOptimization={ultraOptimization || isSoftwareGL}
          effectsQuality={perfConfig?.effectsQuality ?? 'low'}
        />

        <NightMobSpawner 
          gameTimeRef={gameTimeRef} 
          entitiesRef={entitiesRef} 
          setEntities={setEntities} 
          playerPosRef={playerPosRef} 
          chunksRef={chunksRef} 
        />
        
        <DoorStateContext.Provider value={openDoors}>
          {Object.entries(chunks).map(([k, d]) => {
            const [cx, cz] = k.split(',').map(Number);
            return (
              <Chunk
                key={k}
                cx={cx}
                cz={cz}
                blocks={d}
                neighborPX={chunks[`${cx + 1},${cz}`]}
                neighborNX={chunks[`${cx - 1},${cz}`]}
                neighborPZ={chunks[`${cx},${cz + 1}`]}
                neighborNZ={chunks[`${cx},${cz - 1}`]}
                onInteraction={handleInteraction}
                currentBlockRef={currentBlockRef}
              />
            );
          })}
        </DoorStateContext.Provider>

        {visibleEntities.map((entity: EntityData) => (
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
            perfConfig={perfConfig}
            onBlockEditRef={onBlockEditRef}
            entitiesRef={entitiesRef}
            weatherRef={weatherRef}
          />
        ))}

        {/* Fixed torch pool updated imperatively in useFrame (zero shader recompiles) */}
        <TorchLightPool
          torchPositionsRef={torchPositionsRef}
          playerPosRef={playerPosRef}
          maxLights={ultraOptimization || isSoftwareGL ? 1 : (perfConfig?.lightingQuality === 'high' ? 4 : 2)}
          particlesRef={particlesRef}
          particlesEnabled={perfConfig?.particlesEnabled ?? true}
        />

        {activePlayers && activePlayers.filter(p => (p.dimension || 'overworld').toLowerCase() === (dimension || 'overworld').toLowerCase()).map((p) => (
          <OtherPlayer
            key={p.id}
            id={p.id}
            name={p.name}
            pos={p.pos}
            yaw={p.yaw}
            pitch={p.pitch}
            skinId={p.skinId}
            customSkin={p.customSkin}
            heldBlock={p.heldBlock}
            attackSeq={p.attackSeq}
            dimension={p.dimension}
            localPlayerPosRef={playerPosRef}
          />
        ))}

        <Player moveVector={moveVector} lookOffsetRef={lookOffsetRef} onUpdatePos={handlePlayerBlockChange} isJumping={isJumping} getCollisionHeight={getCollisionHeight} checkSolid={checkSolid} perspective={perspective} gameMode={gameMode} worldType={worldType} chunks={chunks} playerPosRef={playerPosRef} playerPos={playerPos} onPortalTeleport={onPortalTeleport} autoJumpEnabled={autoJumpEnabled} isZooming={isZooming} fov={fov} particlesRef={particlesRef} attackTrigger={attackTrigger} characterSkin={characterSkin} customSkin={customSkin} currentBlock={currentBlock} playerPoseRef={playerPoseRef} externalMoveVectorRef={externalMoveVectorRef} />
        {aiCompanionConfig?.enabled && (
          <AICompanion
            config={aiCompanionConfig}
            playerPosRef={playerPosRef}
            chunksRef={chunksRef}
            savedChunksRef={savedChunksRef}
            setChunks={setChunks}
            editsRef={editsRef}
            entitiesRef={entitiesRef}
            particlesRef={particlesRef}
            gameTimeRef={gameTimeRef}
            checkSolid={checkSolid}
            hitEntityById={hitEntityById}
            onBlockEditRef={onBlockEditRef}
            companionPosRef={aiCompanionPosRef || fallbackCompanionPosRef}
            companionBagRef={aiCompanionBagRef || fallbackCompanionBagRef}
            tpTrigger={aiCompanionTpTrigger}
            onBuildComplete={onAICompanionBuildComplete}
            onCompanionSpeak={onAICompanionSpeak}
          />
        )}
        <ParticleSystem particlesRef={particlesRef} enabled={perfConfig?.particlesEnabled ?? true} />
        <JukeboxEmitter playingJukeboxesRef={playingJukeboxesRef} particlesRef={particlesRef} />
        <fog attach="fog" args={['#87ceeb', ultraOptimization ? 8 : 15, ultraOptimization ? 28 : 45]} />
      </Canvas>

      {/* Screen message banner (Minecraft-like Toast) */}
      {inGameMessage && (
        <div className="fixed inset-x-0 top-14 sm:top-16 px-4 flex justify-center pointer-events-none select-none z-[120]">
          <div className="max-w-[90vw] sm:max-w-md bg-black/85 px-4 py-2 rounded-xl border border-white/15 text-white font-sans text-xs sm:text-sm text-center break-words leading-snug tracking-wide shadow-2xl">
            {inGameMessage}
          </div>
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

interface JukeboxEmitterProps {
  playingJukeboxesRef: React.MutableRefObject<Record<string, BlockType>>;
  particlesRef: React.MutableRefObject<any[]>;
}

const JukeboxEmitter: React.FC<JukeboxEmitterProps> = ({ playingJukeboxesRef, particlesRef }) => {
  const lastEmitRef = useRef<number>(0);

  useFrame((state) => {
    const now = state.clock.getElapsedTime();
    // Emit note particles every 0.35 seconds
    if (now - lastEmitRef.current > 0.35) {
      lastEmitRef.current = now;
      const jukeboxes = playingJukeboxesRef.current;
      const jbKeys = Object.keys(jukeboxes);
      if (jbKeys.length === 0) return;

      const colors = ['#00ffcc', '#ff3366', '#ffcc00', '#aa33ff', '#33ccff', '#ff66ff'];

      jbKeys.forEach(key => {
        const [wx, wy, wz] = key.split(',').map(Number);
        
        // Spawn 1-2 musical note particles
        const count = Math.random() > 0.5 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const px = wx + (Math.random() * 0.4 - 0.2);
          const py = wy + 0.6; // Slightly above top of the Jukebox
          const pz = wz + (Math.random() * 0.4 - 0.2);

          const vx = (Math.random() - 0.5) * 1.0;
          const vy = 6.8 + Math.random() * 1.5; // High initial velocity to float upwards against gravity (4.5)
          const vz = (Math.random() - 0.5) * 1.0;

          const color = colors[Math.floor(Math.random() * colors.length)];

          particlesRef.current.push({
            id: Date.now() + Math.random(),
            x: px,
            y: py,
            z: pz,
            vx,
            vy,
            vz,
            color,
            size: 0.16 + Math.random() * 0.08,
            life: 1.0 + Math.random() * 0.4
          });
        }
      });
    }
  });

  return null;
};

const ScreenshotBridge: React.FC = () => {
  const { gl, scene, camera, setSize } = useThree();
  useEffect(() => {
    (window as any).__captureVoxelScreenshot = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    };
    const syncViewportSize = () => {
      const parent = gl.domElement.parentElement;
      const w = parent?.clientWidth || window.innerWidth;
      const h = parent?.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        setSize(w, h);
        gl.domElement.style.width = '100%';
        gl.domElement.style.height = '100%';
        gl.domElement.style.display = 'block';
        if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
          const pCam = camera as THREE.PerspectiveCamera;
          pCam.aspect = w / h;
          pCam.updateProjectionMatrix();
        }
      }
    };
    syncViewportSize();
    window.addEventListener('resize', syncViewportSize);
    window.addEventListener('orientationchange', syncViewportSize);
    window.visualViewport?.addEventListener('resize', syncViewportSize);
    return () => {
      window.removeEventListener('resize', syncViewportSize);
      window.removeEventListener('orientationchange', syncViewportSize);
      window.visualViewport?.removeEventListener('resize', syncViewportSize);
      if ((window as any).__captureVoxelScreenshot) {
        delete (window as any).__captureVoxelScreenshot;
      }
    };
  }, [gl, scene, camera, setSize]);
  return null;
};

interface WeatherSystemProps {
  playerPosRef: React.MutableRefObject<Vector3D>;
  weatherRef: React.MutableRefObject<'clear' | 'rain' | 'snow' | 'thunderstorm' | 'snow_rain'>;
  ultraOptimization: boolean;
  effectsQuality?: 'low' | 'high';
}

const WeatherSystem: React.FC<WeatherSystemProps> = ({ playerPosRef, weatherRef, ultraOptimization, effectsQuality = 'low' }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = ultraOptimization ? 150 : (effectsQuality === 'high' ? 700 : 300);
  const lastAppliedWeatherRef = useRef<string>('');
  
  // Create buffers for particle positions and metadata
  const [positions, speeds, sways, types] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const spd = new Float32Array(particleCount);
    const swy = new Float32Array(particleCount);
    const typ = new Float32Array(particleCount); // 0 = rain, 1 = snow
    
    for (let i = 0; i < particleCount; i++) {
      // Box coordinates relative to player center: X [-25, 25], Y [-10, 25], Z [-25, 25]
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 35 - 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
      
      spd[i] = 1.0 + Math.random() * 2.0; // speed multiplier
      swy[i] = Math.random() * Math.PI * 2; // sway offset
      typ[i] = Math.random() > 0.5 ? 1 : 0; // split for snow-rain mix
    }
    return [pos, spd, swy, typ];
  }, [particleCount]);

  // Texture helper or simple standard circle material
  const particleTexture = useMemo(() => {
    // Generate a simple round soft dot texture using HTML canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 16);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }, []);

  const lastWeatherBiomeCheckRef = useRef(0);
  const cachedWeatherBiomeRef = useRef('plains');

  useFrame((state, delta) => {
    const activeWeather = weatherRef.current;
    if (activeWeather === 'clear' || !pointsRef.current) {
      if (pointsRef.current) pointsRef.current.visible = false;
      return;
    }
    
    pointsRef.current.visible = true;
    const pPos = playerPosRef.current;
    const geom = pointsRef.current.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const t = state.clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    
    const nowMs = performance.now();
    if (nowMs - lastWeatherBiomeCheckRef.current > 500) {
      lastWeatherBiomeCheckRef.current = nowMs;
      cachedWeatherBiomeRef.current = getWorldHeight(pPos.x, pPos.z).biome;
    }
    const biome = cachedWeatherBiomeRef.current;
    const currentY = pPos.y;
    
    let effectiveWeather = activeWeather;
    if (biome === 'mountains') {
      // Rain and Thunderstorm turn into SNOW in mountains
      if (activeWeather === 'rain' || activeWeather === 'thunderstorm' || activeWeather === 'snow_rain') {
        effectiveWeather = 'snow';
      }
    } else if (currentY >= 80) {
      // High altitude (above Y 80) is always snow or snow_rain
      if (activeWeather === 'rain' || activeWeather === 'thunderstorm') {
        effectiveWeather = 'snow_rain';
      }
    }

    // Update material only when effective weather changes
    if (lastAppliedWeatherRef.current !== effectiveWeather) {
      lastAppliedWeatherRef.current = effectiveWeather;
      const material = pointsRef.current.material as THREE.PointsMaterial;
      if (effectiveWeather === 'snow') {
        material.color.set('#ffffff');
        material.size = ultraOptimization ? 0.25 : 0.4;
      } else if (effectiveWeather === 'rain' || effectiveWeather === 'thunderstorm') {
        material.color.set('#78a4c0');
        material.size = ultraOptimization ? 0.15 : 0.22;
      } else {
        material.color.set('#d0e3f0');
        material.size = ultraOptimization ? 0.2 : 0.32;
      }
    }

    const posArray = posAttr.array as Float32Array;
    
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      
      // Calculate absolute positions of particles
      let wx = posArray[idx] + pPos.x;
      let wy = posArray[idx + 1] + pPos.y;
      let wz = posArray[idx + 2] + pPos.z;
      
      // Determine movement behavior based on effective weather type
      let speedY = 0;
      let swayX = 0;
      let swayZ = 0;
      
      const isSnowParticle = effectiveWeather === 'snow' || (effectiveWeather === 'snow_rain' && types[i] === 1);
      
      if (isSnowParticle) {
        // Snow drift physics: slow descent + sin/cos sway
        speedY = -2.5 * speeds[i];
        swayX = Math.sin(t * 1.5 + sways[i]) * 1.8;
        swayZ = Math.cos(t * 1.1 + sways[i]) * 1.8;
      } else {
        // Rain falling fast
        speedY = -18.0 * speeds[i];
      }
      
      // Apply delta time movement
      wy += speedY * dt;
      wx += swayX * dt;
      wz += swayZ * dt;
      
      // Keep particles relative to player boundary box
      if (wy < pPos.y - 12) {
        wy = pPos.y + 22 + Math.random() * 5;
        wx = pPos.x + (Math.random() - 0.5) * 45;
        wz = pPos.z + (Math.random() - 0.5) * 45;
      }
      
      // Also recycle horizontal bounds if player is sprinting/moving fast
      if (Math.abs(wx - pPos.x) > 25) {
        wx = pPos.x + (wx < pPos.x ? 25 : -25);
      }
      if (Math.abs(wz - pPos.z) > 25) {
        wz = pPos.z + (wz < pPos.z ? 25 : -25);
      }
      
      // Store back as relative offsets to player
      posArray[idx] = wx - pPos.x;
      posArray[idx + 1] = wy - pPos.y;
      posArray[idx + 2] = wz - pPos.z;
    }
    
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        map={particleTexture}
        transparent={true}
        depthWrite={false}
        size={0.3}
        sizeAttenuation={true}
      />
    </points>
  );
};

const ENV_SUNRISE_COLOR = new THREE.Color();

interface MinecraftEnvironmentProps {
  gameTimeRef: React.MutableRefObject<number>;
  isSleepingRef: React.MutableRefObject<boolean>;
  setIsSleeping: (s: boolean) => void;
  ultraOptimization: boolean;
  lightingQuality?: 'low' | 'high';
  playerPosRef: React.MutableRefObject<Vector3D>;
  weatherRef: React.MutableRefObject<'clear' | 'rain' | 'snow' | 'thunderstorm' | 'snow_rain'>;
  currentBlockRef: React.MutableRefObject<BlockType>;
}

const MinecraftEnvironment: React.FC<MinecraftEnvironmentProps> = ({ 
  gameTimeRef, 
  isSleepingRef, 
  setIsSleeping,
  ultraOptimization,
  lightingQuality = 'low',
  playerPosRef,
  weatherRef,
  currentBlockRef
}) => {
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const pointLightRef = useRef<THREE.PointLight>(null);
  const sunPosRef = useRef<[number, number, number]>([100, 20, 100]);
  const lastBiomeCheckRef = useRef<number>(0);
  const currentBiomeRef = useRef<string>('plains');
  const [lightningFlash, setLightningFlash] = useState(false);
  const lastStrikeRef = useRef<number>(0);

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
      // Longer realistic cycle: Daytime (~10 mins / 600s), Nighttime (~3.5 mins / 210s)
      const isDaytime = Math.sin(gameTimeRef.current) >= 0;
      gameTimeRef.current += (delta * Math.PI) / (isDaytime ? 600 : 210);
      if (gameTimeRef.current >= Math.PI * 2) {
        gameTimeRef.current -= Math.PI * 2;
      }
    }

    const t = gameTimeRef.current;
    
    // Y-axis orbit for the sun/moon to make beautiful sunrises and sunsets!
    const sunX = Math.cos(t) * 150;
    const sunY = Math.sin(t) * 150;
    const sunZ = 50;

    sunPosRef.current[0] = sunX;
    sunPosRef.current[1] = sunY;
    sunPosRef.current[2] = sunZ;

    let ambientIntensity = 0.08;
    let dirIntensity = 0.08;
    let dirColor = '#ffffff';
    let fogColor: string | THREE.Color = '#06050e';

    if (sunY > 0) {
      // Day
      const dayFactor = Math.sin(t);
      ambientIntensity = 0.15 + 0.70 * dayFactor;
      dirIntensity = 0.8 * dayFactor;
      dirColor = '#fff5e1';

      if (sunY < 40) {
        // Sunrise / Sunset transition colors without per-frame string alloc
        const mixRatio = sunY / 40;
        ENV_SUNRISE_COLOR.setRGB(
          (255 * (1 - mixRatio) + 135 * mixRatio) / 255,
          (110 * (1 - mixRatio) + 206 * mixRatio) / 255,
          (70 * (1 - mixRatio) + 235 * mixRatio) / 255
        );
        fogColor = ENV_SUNRISE_COLOR;
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
    
    if (activeDimension === 'nether') {
      ambientIntensity = 0.55;
      dirIntensity = 0.05;
      dirColor = '#601111';
      fogColor = '#240606';
    }
    
    // Depth and Biome based fog modifier
    const pPos = playerPosRef.current;
    if (pPos) {
      if (pPos.y < 38) {
        // Deep underground caves
        fogColor = '#0b0e14';
      } else if (sunY > 0) {
        // Evaluate biome colors (throttled once every 500ms to increase frame rate)
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
        else if (biome === 'autumn') targetFogColor = '#cfb59b'; // Soft warm autumnal sky
        
        // Blend fogColor with target based on sunY for sunrise/sunset
        if (sunY >= 40) {
            fogColor = targetFogColor;
        }
      }
    }

    // Evaluate weather factors for lighting and fog (reuse throttled biome)
    const activeWeather = weatherRef.current;
    let effectiveWeather = activeWeather;
    if (pPos) {
      const biome = currentBiomeRef.current;
      const currentY = pPos.y;
      
      if (biome === 'mountains') {
        if (activeWeather === 'rain' || activeWeather === 'thunderstorm' || activeWeather === 'snow_rain') {
          effectiveWeather = 'snow';
        }
      } else if (currentY >= 80) {
        if (activeWeather === 'rain' || activeWeather === 'thunderstorm') {
          effectiveWeather = 'snow_rain';
        }
      }
    }

    let weatherIntensityFactor = 1.0;
    if (effectiveWeather === 'rain' || effectiveWeather === 'snow' || effectiveWeather === 'snow_rain') {
      weatherIntensityFactor = 0.55;
    } else if (effectiveWeather === 'thunderstorm') {
      weatherIntensityFactor = 0.35;
    }
    
    ambientIntensity *= weatherIntensityFactor;
    dirIntensity *= weatherIntensityFactor;

    // Apply gloomy sky colors when sun is out
    if (effectiveWeather !== 'clear' && sunY > 0) {
      let targetWeatherSky = '#4a5568'; // gloomy gray for rain
      if (effectiveWeather === 'snow' || effectiveWeather === 'snow_rain') {
        targetWeatherSky = '#b0bec5'; // softer snow white-gray
      } else if (effectiveWeather === 'thunderstorm') {
        targetWeatherSky = '#212121'; // dark storm clouds
      }
      
      fogColor = targetWeatherSky;
    }

    // Thunderstorm lightning strikes
    const nowMs = performance.now();
    if (effectiveWeather === 'thunderstorm' && nowMs - lastStrikeRef.current > 4000) {
      if (Math.random() < 0.003) {
        lastStrikeRef.current = nowMs;
        setLightningFlash(true);
        setTimeout(() => setLightningFlash(false), 90 + Math.random() * 100);
        
        // Occasional double strike!
        if (Math.random() > 0.4) {
          setTimeout(() => {
            setLightningFlash(true);
            setTimeout(() => setLightningFlash(false), 45);
          }, 200);
        }
      }
    }

    if (lightningFlash) {
      fogColor = '#e1f5fe'; // brilliant neon blue-white lightning flash!
      ambientIntensity = 1.6;
      dirIntensity = 1.6;
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
      const holdingTorch = currentBlockRef.current === BlockType.TORCH;

      if (holdingTorch) {
        const flicker = Math.sin(state.clock.elapsedTime * 9.5) * 0.9 + Math.cos(state.clock.elapsedTime * 15) * 0.4;
        pointLightRef.current.visible = true;
        pointLightRef.current.position.set(pPos.x, pPos.y + 0.95, pPos.z);
        pointLightRef.current.color.set('#ffb347');
        pointLightRef.current.intensity = 14 + flicker;
        pointLightRef.current.distance = 19;
        pointLightRef.current.decay = 0.9;
      } else if (isUnderground || isNight) {
        pointLightRef.current.visible = true;
        pointLightRef.current.position.set(pPos.x, pPos.y + 0.8, pPos.z);
        pointLightRef.current.color.set('#ffb03a');
        pointLightRef.current.decay = 1.2;
        if (isUnderground) {
          const undergroundFactor = Math.max(0.1, (52 - pPos.y) / 40);
          pointLightRef.current.intensity = 3.2 * undergroundFactor;
          pointLightRef.current.distance = 24;
        } else {
          pointLightRef.current.intensity = 2.0;
          pointLightRef.current.distance = 18;
        }
      } else {
        pointLightRef.current.visible = false;
      }
    }

    if (state.scene.fog && 'color' in state.scene.fog) {
      if (fogColor instanceof THREE.Color) {
        (state.scene.fog as THREE.Fog).color.copy(fogColor);
      } else {
        (state.scene.fog as THREE.Fog).color.set(fogColor);
      }
    }

    if (state.scene) {
      if (!state.scene.background) {
        state.scene.background = fogColor instanceof THREE.Color ? fogColor.clone() : new THREE.Color(fogColor);
      } else if (state.scene.background instanceof THREE.Color) {
        if (fogColor instanceof THREE.Color) {
          state.scene.background.copy(fogColor);
        } else {
          state.scene.background.set(fogColor);
        }
      }
    }
  });

  return (
    <>
      {activeDimension === 'overworld' && <Stars count={ultraOptimization ? 60 : (lightingQuality === 'high' ? 300 : 120)} radius={100} depth={50} factor={4} saturation={0.5} fade />}
      <ambientLight ref={ambientLightRef} intensity={0.9} />
      <directionalLight ref={dirLightRef} position={[10, 20, 10]} intensity={0.8} />
      <pointLight ref={pointLightRef} color="#ffb03a" distance={20} decay={1.2} intensity={0} />
    </>
  );
};

// Fixed 4-light torch pool: zero mount/unmount shader recompiles, illuminates caves, houses, and nights
const TorchLightPool: React.FC<{
  torchPositionsRef: React.MutableRefObject<{ x: number; y: number; z: number }[]>;
  playerPosRef: React.MutableRefObject<Vector3D>;
  maxLights: number;
  particlesRef: React.MutableRefObject<any[]>;
  particlesEnabled: boolean;
}> = ({ torchPositionsRef, playerPosRef, maxLights, particlesRef, particlesEnabled }) => {
  const light0Ref = useRef<THREE.PointLight>(null);
  const light1Ref = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);
  const light3Ref = useRef<THREE.PointLight>(null);
  const selectedRef = useRef<({ x: number; y: number; z: number } | null)[]>([null, null, null, null]);
  const lastCheckRef = useRef(0);
  const lastEmberRef = useRef(0);

  useFrame((state) => {
    const lightRefs = [light0Ref.current, light1Ref.current, light2Ref.current, light3Ref.current];
    const now = performance.now();
    const torches = torchPositionsRef.current;
    const pPos = playerPosRef.current;

    if (!pPos || torches.length === 0) {
      for (let k = 0; k < 4; k++) {
        selectedRef.current[k] = null;
        if (lightRefs[k] && lightRefs[k]!.intensity !== 0) lightRefs[k]!.intensity = 0;
      }
      return;
    }

    if (now - lastCheckRef.current >= 100) {
      lastCheckRef.current = now;
      const topCoords: ({ x: number; y: number; z: number } | null)[] = [null, null, null, null];
      const topDistSq = [26 * 26, 26 * 26, 26 * 26, 26 * 26];

      for (let i = 0; i < torches.length; i++) {
        const t = torches[i];
        const dx = t.x - pPos.x;
        const dy = t.y - pPos.y;
        const dz = t.z - pPos.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq >= topDistSq[3]) continue;

        for (let slot = 0; slot < maxLights; slot++) {
          if (dSq < topDistSq[slot]) {
            for (let shift = maxLights - 1; shift > slot; shift--) {
              topCoords[shift] = topCoords[shift - 1];
              topDistSq[shift] = topDistSq[shift - 1];
            }
            topCoords[slot] = t;
            topDistSq[slot] = dSq;
            break;
          }
        }
      }

      for (let k = 0; k < 4; k++) {
        selectedRef.current[k] = k < maxLights ? topCoords[k] : null;
        const l = lightRefs[k];
        if (l) {
          const target = selectedRef.current[k];
          if (target) {
            l.position.set(target.x, target.y + 0.35, target.z);
          } else {
            l.intensity = 0;
          }
        }
      }
    }

    // Smooth candle-flicker modulation every frame
    const elapsed = state.clock.elapsedTime;
    for (let k = 0; k < maxLights; k++) {
      const l = lightRefs[k];
      if (l && selectedRef.current[k]) {
        const flicker = Math.sin(elapsed * 8.5 + k * 1.9) * 1.3 + Math.cos(elapsed * 14.3 + k * 0.7) * 0.7;
        l.intensity = 16.5 + flicker;
      }
    }

    // Subtle rising flame embers on nearest lit torches
    if (particlesEnabled && now - lastEmberRef.current >= 260 && particlesRef.current.length < 120) {
      lastEmberRef.current = now;
      for (let k = 0; k < Math.min(2, maxLights); k++) {
        const target = selectedRef.current[k];
        if (target && Math.random() < 0.65) {
          particlesRef.current.push({
            id: now + k + Math.random(),
            x: target.x + (Math.random() - 0.5) * 0.14,
            y: target.y + 0.25,
            z: target.z + (Math.random() - 0.5) * 0.14,
            vx: (Math.random() - 0.5) * 0.22,
            vy: 1.55 + Math.random() * 0.65,
            vz: (Math.random() - 0.5) * 0.22,
            color: Math.random() > 0.35 ? '#ffab00' : '#ff5722',
            size: 0.055 + Math.random() * 0.035,
            life: 0.55,
          });
        }
      }
    }
  });

  return (
    <>
      <pointLight ref={light0Ref} color="#ffaa3b" intensity={0} distance={20} decay={0.9} />
      <pointLight ref={light1Ref} color="#ffaa3b" intensity={0} distance={20} decay={0.9} />
      <pointLight ref={light2Ref} color="#ffaa3b" intensity={0} distance={20} decay={0.9} />
      <pointLight ref={light3Ref} color="#ffaa3b" intensity={0} distance={20} decay={0.9} />
    </>
  );
};

const PARTICLE_DUMMY = new THREE.Object3D();
const PARTICLE_COLOR = new THREE.Color();

const ParticleSystem: React.FC<{
  particlesRef: React.MutableRefObject<any[]>;
  enabled?: boolean;
}> = ({ particlesRef, enabled = true }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame((state, delta) => {
    const list = particlesRef.current;
    if (!enabled || list.length === 0) {
      if (!enabled && list.length > 0) list.length = 0;
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

export default React.memo(VoxelWorld);
