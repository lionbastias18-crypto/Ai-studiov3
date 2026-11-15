import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BlockType, CharacterSkinId, CustomCharacterConfig } from '../types';
import { BLOCK_COLORS } from '../constants';

export interface CharacterSkinPreset {
  id: CharacterSkinId;
  nameEs: string;
  nameEn: string;
  badgeColor: string;
  skin: string;
  hair: string;
  eyes: string;
  shirt: string;
  shirtAccent: string;
  pants: string;
  shoes: string;
  sole: string;
  accent: string;
  gear: 'headphones' | 'crown' | 'goggles' | 'hood' | 'none' | 'headband';
  backGear: 'backpack' | 'cape' | 'satchel' | 'sheath' | 'none';
  capeColor?: string;
}

export const CHARACTER_SKINS: Record<CharacterSkinId, CharacterSkinPreset> = {
  cyber: {
    id: 'cyber',
    nameEs: 'Cyber Gamer',
    nameEn: 'Cyber Gamer',
    badgeColor: '#00ffcc',
    skin: '#fbc5a1',
    hair: '#2d1609',
    eyes: '#00ffcc',
    shirt: '#ff3366',
    shirtAccent: '#c81d4e',
    pants: '#18181b',
    shoes: '#f8fafc',
    sole: '#ff3366',
    accent: '#00ffcc',
    gear: 'headphones',
    backGear: 'backpack',
  },
  knight: {
    id: 'knight',
    nameEs: 'Caballero Real',
    nameEn: 'Royal Knight',
    badgeColor: '#fbbf24',
    skin: '#f5cfa8',
    hair: '#4a2c18',
    eyes: '#38bdf8',
    shirt: '#94a3b8',
    shirtAccent: '#1d4ed8',
    pants: '#475569',
    shoes: '#334155',
    sole: '#fbbf24',
    accent: '#fbbf24',
    gear: 'crown',
    backGear: 'cape',
    capeColor: '#dc2626',
  },
  explorer: {
    id: 'explorer',
    nameEs: 'Explorador',
    nameEn: 'Explorer',
    badgeColor: '#10b981',
    skin: '#e8b48a',
    hair: '#5c3a21',
    eyes: '#10b981',
    shirt: '#b45309',
    shirtAccent: '#059669',
    pants: '#3f6212',
    shoes: '#573b26',
    sole: '#1c1917',
    accent: '#34d399',
    gear: 'goggles',
    backGear: 'satchel',
  },
  mage: {
    id: 'mage',
    nameEs: 'Mago del Nether',
    nameEn: 'Nether Mage',
    badgeColor: '#c084fc',
    skin: '#e2c4b0',
    hair: '#1e1b4b',
    eyes: '#c084fc',
    shirt: '#312e81',
    shirtAccent: '#7e22ce',
    pants: '#1e1b4b',
    shoes: '#2e1065',
    sole: '#f59e0b',
    accent: '#f59e0b',
    gear: 'hood',
    backGear: 'cape',
    capeColor: '#6b21a8',
  },
  classic: {
    id: 'classic',
    nameEs: 'Aventurero',
    nameEn: 'Adventurer',
    badgeColor: '#38bdf8',
    skin: '#e5a87e',
    hair: '#3b2314',
    eyes: '#2563eb',
    shirt: '#0284c7',
    shirtAccent: '#0369a1',
    pants: '#1e3a8a',
    shoes: '#52525b',
    sole: '#18181b',
    accent: '#eab308',
    gear: 'none',
    backGear: 'backpack',
  },
  shadow: {
    id: 'shadow',
    nameEs: 'Ninja Sombra',
    nameEn: 'Shadow Ninja',
    badgeColor: '#ef4444',
    skin: '#eab696',
    hair: '#09090b',
    eyes: '#f59e0b',
    shirt: '#18181b',
    shirtAccent: '#dc2626',
    pants: '#09090b',
    shoes: '#27272a',
    sole: '#dc2626',
    accent: '#ef4444',
    gear: 'headband',
    backGear: 'sheath',
  },
  dragon: {
    id: 'dragon',
    nameEs: 'Dragón Carmesí',
    nameEn: 'Crimson Dragon',
    badgeColor: '#f97316',
    skin: '#f2b895',
    hair: '#7f1d1d',
    eyes: '#facc15',
    shirt: '#991b1b',
    shirtAccent: '#f97316',
    pants: '#1c1917',
    shoes: '#450a0a',
    sole: '#fb923c',
    accent: '#fbbf24',
    gear: 'crown',
    backGear: 'cape',
    capeColor: '#b91c1c',
  },
  angel: {
    id: 'angel',
    nameEs: 'Arcángel Celestial',
    nameEn: 'Celestial Angel',
    badgeColor: '#38bdf8',
    skin: '#fde0c8',
    hair: '#fef08a',
    eyes: '#38bdf8',
    shirt: '#f8fafc',
    shirtAccent: '#eab308',
    pants: '#e2e8f0',
    shoes: '#f1f5f9',
    sole: '#fbbf24',
    accent: '#fde047',
    gear: 'crown',
    backGear: 'cape',
    capeColor: '#38bdf8',
  },
  titan: {
    id: 'titan',
    nameEs: 'Titán Esmeralda',
    nameEn: 'Emerald Titan',
    badgeColor: '#10b981',
    skin: '#d9a786',
    hair: '#064e3b',
    eyes: '#34d399',
    shirt: '#065f46',
    shirtAccent: '#10b981',
    pants: '#1e293b',
    shoes: '#0f172a',
    sole: '#34d399',
    accent: '#6ee7b7',
    gear: 'goggles',
    backGear: 'sheath',
  },
  poseidon: {
    id: 'poseidon',
    nameEs: 'Señor de los Mares',
    nameEn: 'Lord of the Seas',
    badgeColor: '#06b6d4',
    skin: '#f0c4a0',
    hair: '#0e7490',
    eyes: '#22d3ee',
    shirt: '#0284c7',
    shirtAccent: '#eab308',
    pants: '#0c4a6e',
    shoes: '#0f172a',
    sole: '#22d3ee',
    accent: '#22d3ee',
    gear: 'crown',
    backGear: 'cape',
    capeColor: '#06b6d4',
  },
  obsidian: {
    id: 'obsidian',
    nameEs: 'Monarca Obsidiana',
    nameEn: 'Obsidian Monarch',
    badgeColor: '#a855f7',
    skin: '#d8b4fe',
    hair: '#1e1b4b',
    eyes: '#e879f9',
    shirt: '#1f1638',
    shirtAccent: '#9333ea',
    pants: '#0f0a1e',
    shoes: '#18181b',
    sole: '#c084fc',
    accent: '#e879f9',
    gear: 'crown',
    backGear: 'cape',
    capeColor: '#7e22ce',
  },
  custom: {
    id: 'custom',
    nameEs: 'Personalizado',
    nameEn: 'Custom Hero',
    badgeColor: '#a855f7',
    skin: '#f5cfa8',
    hair: '#2d1609',
    eyes: '#38bdf8',
    shirt: '#059669',
    shirtAccent: '#fbbf24',
    pants: '#1e293b',
    shoes: '#f8fafc',
    sole: '#10b981',
    accent: '#34d399',
    gear: 'none',
    backGear: 'cape',
    capeColor: '#7c3aed',
  },
};

export const DEFAULT_CUSTOM_SKIN: CustomCharacterConfig = {
  skin: '#f5cfa8',
  hair: '#2d1609',
  eyes: '#38bdf8',
  shirt: '#059669',
  shirtAccent: '#fbbf24',
  pants: '#1e293b',
  shoes: '#f8fafc',
  sole: '#10b981',
  accent: '#34d399',
  gear: 'none',
  backGear: 'cape',
  capeColor: '#7c3aed',
};

export const resolveCharacterSkin = (
  skinId?: CharacterSkinId,
  customSkin?: CustomCharacterConfig
): CharacterSkinPreset => {
  if (skinId === 'custom' && customSkin) {
    return {
      ...CHARACTER_SKINS.custom,
      ...customSkin,
      id: 'custom',
      badgeColor: customSkin.accent || '#a855f7',
    };
  }
  return (skinId && CHARACTER_SKINS[skinId]) || CHARACTER_SKINS.cyber;
};

const noRaycast = () => {};

// Tool tier lookup for 3D held item visuals
const getHeldToolInfo = (blockType: BlockType): {
  kind: 'sword' | 'pickaxe' | 'axe' | 'shovel';
  blade: string;
  guard: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
} | null => {
  const tiers = {
    wood: { blade: '#b6895b', guard: '#6d4423', emissive: '#000000', emissiveIntensity: 0, metalness: 0.05, roughness: 0.88 },
    stone: { blade: '#94a3b8', guard: '#475569', emissive: '#000000', emissiveIntensity: 0, metalness: 0.25, roughness: 0.72 },
    iron: { blade: '#e2e8f0', guard: '#64748b', emissive: '#1e293b', emissiveIntensity: 0.08, metalness: 0.85, roughness: 0.24 },
    gold: { blade: '#facc15', guard: '#b45309', emissive: '#ca8a04', emissiveIntensity: 0.18, metalness: 0.9, roughness: 0.18 },
    diamond: { blade: '#38bdf8', guard: '#0369a1', emissive: '#0284c7', emissiveIntensity: 0.28, metalness: 0.78, roughness: 0.18 },
  };
  switch (blockType) {
    case BlockType.WOOD_SWORD: return { kind: 'sword', ...tiers.wood };
    case BlockType.STONE_SWORD: return { kind: 'sword', ...tiers.stone };
    case BlockType.SWORD: return { kind: 'sword', ...tiers.iron };
    case BlockType.GOLD_SWORD: return { kind: 'sword', ...tiers.gold };
    case BlockType.DIAMOND_SWORD: return { kind: 'sword', ...tiers.diamond };

    case BlockType.WOOD_PICKAXE: return { kind: 'pickaxe', ...tiers.wood };
    case BlockType.PICKAXE: return { kind: 'pickaxe', ...tiers.stone };
    case BlockType.IRON_PICKAXE: return { kind: 'pickaxe', ...tiers.iron };
    case BlockType.GOLD_PICKAXE: return { kind: 'pickaxe', ...tiers.gold };
    case BlockType.DIAMOND_PICKAXE: return { kind: 'pickaxe', ...tiers.diamond };

    case BlockType.AXE: return { kind: 'axe', ...tiers.wood };
    case BlockType.STONE_AXE: return { kind: 'axe', ...tiers.stone };
    case BlockType.IRON_AXE: return { kind: 'axe', ...tiers.iron };
    case BlockType.GOLD_AXE: return { kind: 'axe', ...tiers.gold };
    case BlockType.DIAMOND_AXE: return { kind: 'axe', ...tiers.diamond };

    case BlockType.WOOD_SHOVEL: return { kind: 'shovel', ...tiers.wood };
    case BlockType.SHOVEL: return { kind: 'shovel', ...tiers.stone };
    case BlockType.IRON_SHOVEL: return { kind: 'shovel', ...tiers.iron };
    case BlockType.GOLD_SHOVEL: return { kind: 'shovel', ...tiers.gold };
    case BlockType.DIAMOND_SHOVEL: return { kind: 'shovel', ...tiers.diamond };
    default: return null;
  }
};

// Held 3D item/block in character hand (reusable in 3rd person, OtherPlayer, and 1st person)
export const HeldItemMesh: React.FC<{ blockType?: BlockType; disableRaycast?: boolean }> = ({
  blockType,
  disableRaycast = false,
}) => {
  if (blockType === undefined || blockType === BlockType.AIR) return null;

  const rc = disableRaycast ? noRaycast : undefined;
  const color = BLOCK_COLORS[blockType] || '#a47e54';
  const toolInfo = getHeldToolInfo(blockType);

  if (toolInfo?.kind === 'sword') {
    return (
      <group position={[0, -0.04, -0.14]} rotation={[-Math.PI / 4, 0, 0]}>
        <mesh position={[0, -0.06, 0]} raycast={rc}>
          <boxGeometry args={[0.04, 0.14, 0.04]} />
          <meshStandardMaterial color="#5c3a21" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.02, 0]} raycast={rc}>
          <boxGeometry args={[0.15, 0.036, 0.055]} />
          <meshStandardMaterial color={toolInfo.guard} metalness={toolInfo.metalness} roughness={toolInfo.roughness} />
        </mesh>
        <mesh position={[0, 0.22, 0]} raycast={rc}>
          <boxGeometry args={[0.056, 0.36, 0.024]} />
          <meshStandardMaterial
            color={toolInfo.blade}
            metalness={toolInfo.metalness}
            roughness={toolInfo.roughness}
            emissive={toolInfo.emissive}
            emissiveIntensity={toolInfo.emissiveIntensity}
          />
        </mesh>
      </group>
    );
  }

  if (toolInfo?.kind === 'pickaxe') {
    return (
      <group position={[0, -0.04, -0.14]} rotation={[-Math.PI / 4, 0, 0]}>
        <mesh position={[0, 0.08, 0]} raycast={rc}>
          <boxGeometry args={[0.036, 0.34, 0.036]} />
          <meshStandardMaterial color="#6a4d36" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.24, 0]} raycast={rc}>
          <boxGeometry args={[0.24, 0.052, 0.05]} />
          <meshStandardMaterial
            color={toolInfo.blade}
            metalness={toolInfo.metalness}
            roughness={toolInfo.roughness}
            emissive={toolInfo.emissive}
            emissiveIntensity={toolInfo.emissiveIntensity}
          />
        </mesh>
        <mesh position={[-0.125, 0.205, 0]} raycast={rc}>
          <boxGeometry args={[0.05, 0.06, 0.045]} />
          <meshStandardMaterial color={toolInfo.blade} metalness={toolInfo.metalness} roughness={toolInfo.roughness} />
        </mesh>
        <mesh position={[0.125, 0.205, 0]} raycast={rc}>
          <boxGeometry args={[0.05, 0.06, 0.045]} />
          <meshStandardMaterial color={toolInfo.blade} metalness={toolInfo.metalness} roughness={toolInfo.roughness} />
        </mesh>
      </group>
    );
  }

  if (toolInfo?.kind === 'axe') {
    return (
      <group position={[0, -0.04, -0.14]} rotation={[-Math.PI / 4, 0, 0]}>
        <mesh position={[0, 0.08, 0]} raycast={rc}>
          <boxGeometry args={[0.036, 0.34, 0.036]} />
          <meshStandardMaterial color="#6a4d36" roughness={0.85} />
        </mesh>
        <mesh position={[0.05, 0.22, 0]} raycast={rc}>
          <boxGeometry args={[0.13, 0.12, 0.046]} />
          <meshStandardMaterial
            color={toolInfo.blade}
            metalness={toolInfo.metalness}
            roughness={toolInfo.roughness}
            emissive={toolInfo.emissive}
            emissiveIntensity={toolInfo.emissiveIntensity}
          />
        </mesh>
        <mesh position={[0.105, 0.19, 0]} raycast={rc}>
          <boxGeometry args={[0.045, 0.07, 0.04]} />
          <meshStandardMaterial color={toolInfo.blade} metalness={toolInfo.metalness} roughness={toolInfo.roughness} />
        </mesh>
      </group>
    );
  }

  if (toolInfo?.kind === 'shovel') {
    return (
      <group position={[0, -0.04, -0.14]} rotation={[-Math.PI / 4, 0, 0]}>
        <mesh position={[0, 0.07, 0]} raycast={rc}>
          <boxGeometry args={[0.035, 0.32, 0.035]} />
          <meshStandardMaterial color="#6a4d36" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.23, 0]} raycast={rc}>
          <boxGeometry args={[0.105, 0.125, 0.038]} />
          <meshStandardMaterial
            color={toolInfo.blade}
            metalness={toolInfo.metalness}
            roughness={toolInfo.roughness}
            emissive={toolInfo.emissive}
            emissiveIntensity={toolInfo.emissiveIntensity}
          />
        </mesh>
      </group>
    );
  }

  if (blockType === BlockType.TORCH) {
    return (
      <group position={[0, -0.03, -0.1]} rotation={[-Math.PI / 6, 0, 0]}>
        <mesh position={[0, 0.055, 0]} raycast={rc}>
          <boxGeometry args={[0.048, 0.21, 0.048]} />
          <meshStandardMaterial color="#6d4423" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.165, 0]} raycast={rc}>
          <boxGeometry args={[0.054, 0.03, 0.054]} />
          <meshStandardMaterial color="#2b1b12" emissive="#ff5500" emissiveIntensity={0.35} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.205, 0]} raycast={rc}>
          <boxGeometry args={[0.058, 0.065, 0.058]} />
          <meshStandardMaterial color="#ffcc33" emissive="#ff8800" emissiveIntensity={1.6} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.242, 0]} raycast={rc}>
          <boxGeometry args={[0.034, 0.032, 0.034]} />
          <meshStandardMaterial color="#fff9c4" emissive="#ffe066" emissiveIntensity={2.0} roughness={0.1} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[0, -0.04, -0.12]} rotation={[0.2, 0.45, 0]} raycast={rc}>
      <boxGeometry args={[0.17, 0.17, 0.17]} />
      <meshStandardMaterial color={color} roughness={0.72} metalness={0.08} />
    </mesh>
  );
};

export interface CharacterModelRefs {
  headGroupRef?: React.RefObject<THREE.Group | null>;
  torsoGroupRef?: React.RefObject<THREE.Group | null>;
  leftArmRef?: React.RefObject<THREE.Group | null>;
  rightArmRef?: React.RefObject<THREE.Group | null>;
  leftLegRef?: React.RefObject<THREE.Group | null>;
  rightLegRef?: React.RefObject<THREE.Group | null>;
  capeRef?: React.RefObject<THREE.Mesh | null>;
}

interface CharacterModelProps {
  skinId?: CharacterSkinId;
  customSkin?: CustomCharacterConfig;
  heldBlock?: BlockType;
  refs?: CharacterModelRefs;
  showContactShadow?: boolean;
  isKnight?: boolean;
}

/**
 * Rich composite PBR 3D character mesh oriented forward toward -Z
 * (matching Three.js camera & movement yaw=0 forward vector).
 * Grounded at local y=0 (feet bottom = 0, top of head = ~1.62).
 */
export const CharacterModel: React.FC<CharacterModelProps> = ({
  skinId = 'cyber',
  customSkin,
  heldBlock,
  refs,
  showContactShadow = true,
}) => {
  const skin = resolveCharacterSkin(skinId, customSkin);
  const isMetallicChest = skinId === 'knight' || skinId === 'titan' || skinId === 'angel' || skinId === 'poseidon' || skinId === 'obsidian';

  const shadowTex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, 'rgba(0,0,0,0.48)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  return (
    <group>
      {/* Contact ground shadow */}
      {showContactShadow && shadowTex && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[0.95, 0.95]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.85} />
        </mesh>
      )}

      {/* 1. HEAD & ACCESSORIES (Neck pivot at y = 1.15) */}
      <group ref={refs?.headGroupRef} name="headGroup" position={[0, 1.15, 0]}>
        {/* Base Head */}
        <mesh position={[0, 0.21, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={skin.skin} roughness={0.78} metalness={0.02} />
        </mesh>

        {/* Expressive Eyes & Brows facing -Z */}
        {skin.gear === 'headphones' ? (
          <>
            {/* Cyber Visor Frame */}
            <mesh position={[0, 0.22, -0.203]}>
              <boxGeometry args={[0.32, 0.075, 0.025]} />
              <meshStandardMaterial color="#0f172a" roughness={0.25} metalness={0.7} />
            </mesh>
            {/* Glowing Visor Lenses */}
            <mesh position={[-0.08, 0.22, -0.214]}>
              <boxGeometry args={[0.1, 0.042, 0.012]} />
              <meshStandardMaterial color={skin.accent} emissive={skin.accent} emissiveIntensity={1.1} roughness={0.15} />
            </mesh>
            <mesh position={[0.08, 0.22, -0.214]}>
              <boxGeometry args={[0.1, 0.042, 0.012]} />
              <meshStandardMaterial color={skin.accent} emissive={skin.accent} emissiveIntensity={1.1} roughness={0.15} />
            </mesh>
          </>
        ) : (
          <>
            {/* Left & Right Eye Whites */}
            <mesh position={[-0.085, 0.22, -0.202]}>
              <boxGeometry args={[0.08, 0.055, 0.01]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            <mesh position={[0.085, 0.22, -0.202]}>
              <boxGeometry args={[0.08, 0.055, 0.01]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            {/* Colored Irises */}
            <mesh position={[-0.08, 0.22, -0.207]}>
              <boxGeometry args={[0.045, 0.048, 0.01]} />
              <meshStandardMaterial
                color={skin.eyes}
                emissive={skinId === 'mage' || skinId === 'shadow' ? skin.eyes : '#000000'}
                emissiveIntensity={skinId === 'mage' || skinId === 'shadow' ? 0.9 : 0}
                roughness={0.25}
              />
            </mesh>
            <mesh position={[0.08, 0.22, -0.207]}>
              <boxGeometry args={[0.045, 0.048, 0.01]} />
              <meshStandardMaterial
                color={skin.eyes}
                emissive={skinId === 'mage' || skinId === 'shadow' ? skin.eyes : '#000000'}
                emissiveIntensity={skinId === 'mage' || skinId === 'shadow' ? 0.9 : 0}
                roughness={0.25}
              />
            </mesh>
            {/* Eyebrows */}
            <mesh position={[-0.085, 0.27, -0.204]}>
              <boxGeometry args={[0.095, 0.02, 0.012]} />
              <meshStandardMaterial color={skin.hair} roughness={0.85} />
            </mesh>
            <mesh position={[0.085, 0.27, -0.204]}>
              <boxGeometry args={[0.095, 0.02, 0.012]} />
              <meshStandardMaterial color={skin.hair} roughness={0.85} />
            </mesh>
          </>
        )}

        {/* Nose & subtle smile/mask */}
        {skinId === 'shadow' ? (
          <mesh position={[0, 0.11, -0.198]}>
            <boxGeometry args={[0.41, 0.15, 0.41]} />
            <meshStandardMaterial color="#18181b" roughness={0.88} />
          </mesh>
        ) : (
          <>
            <mesh position={[0, 0.155, -0.204]}>
              <boxGeometry args={[0.04, 0.04, 0.018]} />
              <meshStandardMaterial color="#d89b76" roughness={0.78} />
            </mesh>
            <mesh position={[0, 0.095, -0.202]}>
              <boxGeometry args={[0.11, 0.022, 0.01]} />
              <meshStandardMaterial color="#8c583a" roughness={0.75} />
            </mesh>
          </>
        )}

        {/* 3D Layered Hair Cap & Fringe */}
        <mesh position={[0, 0.34, 0.02]}>
          <boxGeometry args={[0.42, 0.16, 0.42]} />
          <meshStandardMaterial color={skin.hair} roughness={0.88} />
        </mesh>
        {/* Front Hair Tufts */}
        <mesh position={[-0.1, 0.32, -0.205]}>
          <boxGeometry args={[0.12, 0.08, 0.035]} />
          <meshStandardMaterial color={skin.hair} roughness={0.88} />
        </mesh>
        <mesh position={[0.08, 0.31, -0.205]}>
          <boxGeometry args={[0.14, 0.09, 0.035]} />
          <meshStandardMaterial color={skin.hair} roughness={0.88} />
        </mesh>
        {/* Side & Back Hair */}
        <mesh position={[-0.2, 0.24, 0.03]}>
          <boxGeometry args={[0.035, 0.24, 0.36]} />
          <meshStandardMaterial color={skin.hair} roughness={0.88} />
        </mesh>
        <mesh position={[0.2, 0.24, 0.03]}>
          <boxGeometry args={[0.035, 0.24, 0.36]} />
          <meshStandardMaterial color={skin.hair} roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.22, 0.205]}>
          <boxGeometry args={[0.4, 0.28, 0.035]} />
          <meshStandardMaterial color={skin.hair} roughness={0.88} />
        </mesh>

        {/* Skin-Specific Headgear */}
        {skin.gear === 'headphones' && (
          <>
            <mesh position={[-0.225, 0.22, 0]}>
              <boxGeometry args={[0.045, 0.16, 0.16]} />
              <meshStandardMaterial color="#18181b" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0.225, 0.22, 0]}>
              <boxGeometry args={[0.045, 0.16, 0.16]} />
              <meshStandardMaterial color="#18181b" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.43, 0]}>
              <boxGeometry args={[0.45, 0.04, 0.09]} />
              <meshStandardMaterial color="#18181b" metalness={0.7} roughness={0.28} />
            </mesh>
            <mesh position={[-0.245, 0.22, 0]}>
              <boxGeometry args={[0.015, 0.07, 0.07]} />
              <meshStandardMaterial color={skin.accent} emissive={skin.accent} emissiveIntensity={1.2} />
            </mesh>
            <mesh position={[0.245, 0.22, 0]}>
              <boxGeometry args={[0.015, 0.07, 0.07]} />
              <meshStandardMaterial color={skin.accent} emissive={skin.accent} emissiveIntensity={1.2} />
            </mesh>
          </>
        )}

        {skin.gear === 'crown' && (
          <group position={[0, 0.43, 0]}>
            <mesh>
              <boxGeometry args={[0.43, 0.07, 0.43]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.055, -0.19]}>
              <boxGeometry args={[0.08, 0.06, 0.04]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.7} roughness={0.15} />
            </mesh>
            <mesh position={[-0.17, 0.055, -0.17]}>
              <boxGeometry args={[0.06, 0.06, 0.06]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[0.17, 0.055, -0.17]}>
              <boxGeometry args={[0.06, 0.06, 0.06]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        )}

        {skin.gear === 'goggles' && (
          <group position={[0, 0.34, -0.215]}>
            <mesh>
              <boxGeometry args={[0.38, 0.08, 0.03]} />
              <meshStandardMaterial color="#78350f" roughness={0.65} />
            </mesh>
            <mesh position={[-0.085, 0, -0.015]}>
              <boxGeometry args={[0.11, 0.065, 0.02]} />
              <meshStandardMaterial color="#34d399" metalness={0.35} roughness={0.15} />
            </mesh>
            <mesh position={[0.085, 0, -0.015]}>
              <boxGeometry args={[0.11, 0.065, 0.02]} />
              <meshStandardMaterial color="#34d399" metalness={0.35} roughness={0.15} />
            </mesh>
          </group>
        )}

        {skin.gear === 'hood' && (
          <group>
            <mesh position={[0, 0.41, 0.02]}>
              <boxGeometry args={[0.45, 0.1, 0.46]} />
              <meshStandardMaterial color={skin.shirt} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.23, 0.22]}>
              <boxGeometry args={[0.45, 0.38, 0.06]} />
              <meshStandardMaterial color={skin.shirt} roughness={0.85} />
            </mesh>
          </group>
        )}

        {skin.gear === 'headband' && (
          <group>
            <mesh position={[0, 0.31, 0]}>
              <boxGeometry args={[0.43, 0.065, 0.43]} />
              <meshStandardMaterial color={skin.accent} roughness={0.75} />
            </mesh>
            <mesh position={[0, 0.31, -0.218]}>
              <boxGeometry args={[0.14, 0.045, 0.015]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.22} />
            </mesh>
          </group>
        )}
      </group>

      {/* 2. TORSO & BACKPACK / CAPE (Waist-to-shoulder, centered at y=0.78) */}
      <group ref={refs?.torsoGroupRef} name="torsoGroup" position={[0, 0.45, 0]}>
        {/* Main Shirt / Armor */}
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.52, 0.68, 0.26]} />
          <meshStandardMaterial
            color={skin.shirt}
            roughness={isMetallicChest ? 0.28 : 0.82}
            metalness={isMetallicChest ? 0.72 : 0.05}
          />
        </mesh>

        {/* Chest Emblem / Collar / Trim facing -Z */}
        <mesh position={[0, 0.52, -0.133]}>
          <boxGeometry args={[0.24, 0.18, 0.02]} />
          <meshStandardMaterial color={skin.shirtAccent} roughness={0.65} metalness={isMetallicChest ? 0.5 : 0.1} />
        </mesh>
        {/* Hoodie / Jacket collar & strings */}
        <mesh position={[-0.075, 0.42, -0.135]}>
          <boxGeometry args={[0.02, 0.14, 0.012]} />
          <meshStandardMaterial color={skin.accent} roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0.075, 0.42, -0.135]}>
          <boxGeometry args={[0.02, 0.14, 0.012]} />
          <meshStandardMaterial color={skin.accent} roughness={0.4} metalness={0.3} />
        </mesh>

        {/* Waist Belt + Metallic Buckle */}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.54, 0.07, 0.28]} />
          <meshStandardMaterial color="#1f2937" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.04, -0.142]}>
          <boxGeometry args={[0.11, 0.07, 0.02]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Back Accessories (+Z is back when facing -Z) */}
        {skin.backGear === 'backpack' && (
          <group position={[0, 0.34, 0.18]}>
            <mesh>
              <boxGeometry args={[0.34, 0.44, 0.14]} />
              <meshStandardMaterial color="#6b4423" roughness={0.78} />
            </mesh>
            <mesh position={[0, -0.09, 0.08]}>
              <boxGeometry args={[0.24, 0.18, 0.06]} />
              <meshStandardMaterial color="#4a2e16" roughness={0.82} />
            </mesh>
            <mesh position={[0, 0.04, 0.08]}>
              <boxGeometry args={[0.06, 0.05, 0.02]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.25} />
            </mesh>
          </group>
        )}

        {skin.backGear === 'satchel' && (
          <group position={[0.08, 0.26, 0.16]}>
            <mesh>
              <boxGeometry args={[0.26, 0.32, 0.1]} />
              <meshStandardMaterial color="#78350f" roughness={0.75} />
            </mesh>
          </group>
        )}

        {skin.backGear === 'sheath' && (
          <group position={[0, 0.4, 0.16]} rotation={[0, 0, -0.55]}>
            <mesh>
              <boxGeometry args={[0.07, 0.65, 0.05]} />
              <meshStandardMaterial color="#27272a" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[0.14, 0.04, 0.07]} />
              <meshStandardMaterial color="#dc2626" roughness={0.5} />
            </mesh>
          </group>
        )}

        {skin.backGear === 'cape' && (
          <mesh ref={refs?.capeRef} position={[0, 0.25, 0.16]} rotation={[0.08, 0, 0]}>
            <boxGeometry args={[0.48, 0.82, 0.035]} />
            <meshStandardMaterial color={skin.capeColor || '#dc2626'} roughness={0.85} />
          </mesh>
        )}
      </group>

      {/* 3. LEFT ARM (Shoulder pivot at x = -0.34, y = 1.09) */}
      <group ref={refs?.leftArmRef} name="leftArm" position={[-0.34, 1.09, 0]}>
        {/* Shoulder pad / Sleeve */}
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.16, 0.38, 0.22]} />
          <meshStandardMaterial
            color={skin.shirt}
            roughness={isMetallicChest ? 0.3 : 0.82}
            metalness={isMetallicChest ? 0.7 : 0.05}
          />
        </mesh>
        {/* Cuff accent */}
        <mesh position={[0, -0.36, 0]}>
          <boxGeometry args={[0.17, 0.05, 0.23]} />
          <meshStandardMaterial color={skin.shirtAccent} roughness={0.65} />
        </mesh>
        {/* Forearm / Hand */}
        <mesh position={[0, -0.47, 0]}>
          <boxGeometry args={[0.15, 0.18, 0.2]} />
          <meshStandardMaterial color={skin.skin} roughness={0.78} />
        </mesh>
      </group>

      {/* 4. RIGHT ARM (Shoulder pivot at x = +0.34, y = 1.09) */}
      <group ref={refs?.rightArmRef} name="rightArm" position={[0.34, 1.09, 0]}>
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.16, 0.38, 0.22]} />
          <meshStandardMaterial
            color={skin.shirt}
            roughness={isMetallicChest ? 0.3 : 0.82}
            metalness={isMetallicChest ? 0.7 : 0.05}
          />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <boxGeometry args={[0.17, 0.05, 0.23]} />
          <meshStandardMaterial color={skin.shirtAccent} roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.47, 0]}>
          <boxGeometry args={[0.15, 0.18, 0.2]} />
          <meshStandardMaterial color={skin.skin} roughness={0.78} />
        </mesh>

        {/* Held Block / Tool attached to Right Hand */}
        <group position={[0, -0.52, -0.02]}>
          <HeldItemMesh blockType={heldBlock} />
        </group>
      </group>

      {/* 5. LEFT LEG (Hip pivot at x = -0.13, y = 0.45) */}
      <group ref={refs?.leftLegRef} name="leftLeg" position={[-0.13, 0.45, 0]}>
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.22, 0.34, 0.23]} />
          <meshStandardMaterial color={skin.pants} roughness={0.85} />
        </mesh>
        {/* Sneaker / Boot */}
        <mesh position={[0, -0.38, -0.015]}>
          <boxGeometry args={[0.22, 0.1, 0.26]} />
          <meshStandardMaterial color={skin.shoes} roughness={0.6} />
        </mesh>
        {/* Sole */}
        <mesh position={[0, -0.44, -0.015]}>
          <boxGeometry args={[0.23, 0.025, 0.27]} />
          <meshStandardMaterial color={skin.sole} roughness={0.5} />
        </mesh>
      </group>

      {/* 6. RIGHT LEG (Hip pivot at x = +0.13, y = 0.45) */}
      <group ref={refs?.rightLegRef} name="rightLeg" position={[0.13, 0.45, 0]}>
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.22, 0.34, 0.23]} />
          <meshStandardMaterial color={skin.pants} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.38, -0.015]}>
          <boxGeometry args={[0.22, 0.1, 0.26]} />
          <meshStandardMaterial color={skin.shoes} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.44, -0.015]}>
          <boxGeometry args={[0.23, 0.025, 0.27]} />
          <meshStandardMaterial color={skin.sole} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
};

interface FirstPersonHandProps {
  skinId?: CharacterSkinId;
  customSkin?: CustomCharacterConfig;
  heldBlock?: BlockType;
  visible: boolean;
  isMovingRef: React.MutableRefObject<boolean>;
  armSwingRef: React.MutableRefObject<number>;
}

/**
 * Animated first-person arm + held item attached smoothly to camera transform.
 * Raycasting is strictly disabled so it never blocks world interactions.
 */
export const FirstPersonHand: React.FC<FirstPersonHandProps> = ({
  skinId = 'cyber',
  customSkin,
  heldBlock,
  visible,
  isMovingRef,
  armSwingRef,
}) => {
  const handRootRef = useRef<THREE.Group>(null);
  const armBobGroupRef = useRef<THREE.Group>(null);
  const skin = resolveCharacterSkin(skinId, customSkin);

  useFrame((state, delta) => {
    if (!visible || !handRootRef.current || !armBobGroupRef.current) return;

    // Snap root directly to camera world transform
    handRootRef.current.position.copy(state.camera.position);
    handRootRef.current.quaternion.copy(state.camera.quaternion);

    const t = state.clock.getElapsedTime();
    const moving = isMovingRef.current;

    const bobX = moving ? Math.cos(t * 9.0) * 0.022 : Math.sin(t * 1.8) * 0.004;
    const bobY = moving ? Math.abs(Math.sin(t * 9.0)) * -0.024 : Math.cos(t * 1.8) * 0.004;

    const swingAmt = armSwingRef.current > 0 ? Math.sin((1 - armSwingRef.current) * Math.PI) : 0;

    armBobGroupRef.current.position.set(
      0.38 + bobX - swingAmt * 0.14,
      -0.34 + bobY - swingAmt * 0.06,
      -0.55 - swingAmt * 0.16
    );
    armBobGroupRef.current.rotation.set(
      0.35 - swingAmt * 1.15,
      -0.25 + swingAmt * 0.45,
      0.15 + swingAmt * 0.35
    );

    if (armSwingRef.current > 0) {
      armSwingRef.current = Math.max(0, armSwingRef.current - delta * 6.5);
    }
  });

  if (!visible) return null;

  return (
    <group ref={handRootRef}>
      <group ref={armBobGroupRef}>
        {/* Sleeve */}
        <mesh position={[0.04, -0.08, 0.14]} rotation={[0.4, 0, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.13, 0.13, 0.26]} />
          <meshStandardMaterial color={skin.shirt} roughness={0.82} />
        </mesh>
        {/* Forearm / Hand */}
        <mesh position={[0.02, -0.02, -0.04]} rotation={[0.1, 0, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.12, 0.12, 0.2]} />
          <meshStandardMaterial color={skin.skin} roughness={0.78} />
        </mesh>
        {/* Held Block / Tool */}
        <group position={[-0.03, 0.05, -0.06]} rotation={[0.2, 0.5, -0.1]}>
          <HeldItemMesh blockType={heldBlock} disableRaycast />
        </group>
      </group>
    </group>
  );
};
