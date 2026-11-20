import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { CharacterSkinId, CustomCharacterConfig } from '../types';
import {
  CHARACTER_SKINS,
  CharacterSkinPreset,
  resolveCharacterSkin,
} from './CharacterModel';

export interface CharacterPreviewCardProps {
  lang: string;
  characterSkin: CharacterSkinId;
  customSkin: CustomCharacterConfig;
  ownedSkins: CharacterSkinId[];
  indefCoins: number;
  vipActive: boolean;
  onSelectSkin: (skin: CharacterSkinId) => void;
  onUpdateCustomSkin: (next: CustomCharacterConfig) => void;
  onOpenShopForSkin: (skinId: CharacterSkinId) => void;
  hidden?: boolean;
  layoutMode?: 'floating' | 'inline';
  cardClassName?: string;
  stageHeightClass?: string;
}

const SKIN_TONES = ['#fde2c8', '#fbc5a1', '#e5a87e', '#c68642', '#8d5524', '#4e2f1a'];
const CLOTH_SWATCHES = [
  '#059669', '#0284c7', '#dc2626', '#9333ea', '#f59e0b',
  '#ec4899', '#18181b', '#f8fafc', '#4f46e5', '#14b8a6',
];
const HAIR_SWATCHES = ['#2d1609', '#09090b', '#78350f', '#fbbf24', '#dc2626', '#f8fafc', '#7c3aed', '#06b6d4'];
const EYE_SWATCHES = ['#38bdf8', '#10b981', '#2563eb', '#78350f', '#c084fc', '#ef4444', '#facc15', '#00ffcc'];

interface RigAnimationHandles {
  characterGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  capeMesh: THREE.Mesh | null;
}

const detectSoftwareGL = (): boolean => {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
};

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  rot?: [number, number, number]
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) {
    mesh.rotation.set(rot[0], rot[1], rot[2]);
  }
  parent.add(mesh);
  return mesh;
}

/**
 * Builds the exact composite 3D PBR hero + glowing pedestal cleanly in pure Three.js
 * so opening/closing the studio or editing swatches updates meshes in-place without
 * spawning multiple WebGL contexts.
 */
function buildHeroPedestalStage(
  skinId: CharacterSkinId,
  customSkin: CustomCharacterConfig
): { root: THREE.Group; handles: RigAnimationHandles; skin: CharacterSkinPreset } {
  const skin = resolveCharacterSkin(skinId, customSkin);
  const isMetallicChest = skinId === 'knight' || skinId === 'titan' || skinId === 'angel' || skinId === 'poseidon' || skinId === 'obsidian';

  const root = new THREE.Group();

  // Hexagonal studio pedestal
  const baseMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.65, metalness: 0.35 });
  const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.1, 6), baseMat);
  baseMesh.position.set(0, -0.06, 0);
  root.add(baseMesh);

  const glowColor = skin.badgeColor || '#10b981';
  const ringMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.5,
  });
  const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.02, 6), ringMat);
  ringMesh.position.set(0, -0.005, 0);
  root.add(ringMesh);

  // Character container facing camera (+Z toward viewer after turntable pi rotation)
  const characterGroup = new THREE.Group();
  characterGroup.rotation.y = Math.PI;
  root.add(characterGroup);

  const skinMat = new THREE.MeshStandardMaterial({ color: skin.skin, roughness: 0.78, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: skin.hair, roughness: 0.88 });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: skin.shirt,
    roughness: isMetallicChest ? 0.28 : 0.82,
    metalness: isMetallicChest ? 0.72 : 0.05,
  });
  const shirtAccentMat = new THREE.MeshStandardMaterial({
    color: skin.shirtAccent,
    roughness: 0.65,
    metalness: isMetallicChest ? 0.5 : 0.1,
  });
  const pantsMat = new THREE.MeshStandardMaterial({ color: skin.pants, roughness: 0.85 });
  const shoesMat = new THREE.MeshStandardMaterial({ color: skin.shoes, roughness: 0.6 });
  const soleMat = new THREE.MeshStandardMaterial({ color: skin.sole, roughness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.4, metalness: 0.3 });

  // 1. HEAD
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.15, 0);
  characterGroup.add(headGroup);

  addBox(headGroup, [0.4, 0.4, 0.4], [0, 0.21, 0], skinMat);

  if (skin.gear === 'headphones') {
    const visorFrame = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.25, metalness: 0.7 });
    const visorGlow = new THREE.MeshStandardMaterial({
      color: skin.accent,
      emissive: skin.accent,
      emissiveIntensity: 1.1,
      roughness: 0.15,
    });
    addBox(headGroup, [0.32, 0.075, 0.025], [0, 0.22, -0.203], visorFrame);
    addBox(headGroup, [0.1, 0.042, 0.012], [-0.08, 0.22, -0.214], visorGlow);
    addBox(headGroup, [0.1, 0.042, 0.012], [0.08, 0.22, -0.214], visorGlow);
  } else {
    const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const irisMat = new THREE.MeshStandardMaterial({
      color: skin.eyes,
      emissive: skinId === 'mage' || skinId === 'shadow' ? skin.eyes : '#000000',
      emissiveIntensity: skinId === 'mage' || skinId === 'shadow' ? 0.9 : 0,
      roughness: 0.25,
    });
    addBox(headGroup, [0.08, 0.055, 0.01], [-0.085, 0.22, -0.202], eyeWhite);
    addBox(headGroup, [0.08, 0.055, 0.01], [0.085, 0.22, -0.202], eyeWhite);
    addBox(headGroup, [0.045, 0.048, 0.01], [-0.08, 0.22, -0.207], irisMat);
    addBox(headGroup, [0.045, 0.048, 0.01], [0.08, 0.22, -0.207], irisMat);
    addBox(headGroup, [0.095, 0.02, 0.012], [-0.085, 0.27, -0.204], hairMat);
    addBox(headGroup, [0.095, 0.02, 0.012], [0.085, 0.27, -0.204], hairMat);
  }

  if (skinId === 'shadow') {
    const maskMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.88 });
    addBox(headGroup, [0.41, 0.15, 0.41], [0, 0.11, -0.198], maskMat);
  } else {
    addBox(headGroup, [0.04, 0.04, 0.018], [0, 0.155, -0.204], new THREE.MeshStandardMaterial({ color: '#d89b76', roughness: 0.78 }));
    addBox(headGroup, [0.11, 0.022, 0.01], [0, 0.095, -0.202], new THREE.MeshStandardMaterial({ color: '#8c583a', roughness: 0.75 }));
  }

  // Hair cap & tufts
  addBox(headGroup, [0.42, 0.16, 0.42], [0, 0.34, 0.02], hairMat);
  addBox(headGroup, [0.12, 0.08, 0.035], [-0.1, 0.32, -0.205], hairMat);
  addBox(headGroup, [0.14, 0.09, 0.035], [0.08, 0.31, -0.205], hairMat);
  addBox(headGroup, [0.035, 0.24, 0.36], [-0.2, 0.24, 0.03], hairMat);
  addBox(headGroup, [0.035, 0.24, 0.36], [0.2, 0.24, 0.03], hairMat);
  addBox(headGroup, [0.4, 0.28, 0.035], [0, 0.22, 0.205], hairMat);

  // Headgear
  if (skin.gear === 'headphones') {
    const shell = new THREE.MeshStandardMaterial({ color: '#18181b', metalness: 0.6, roughness: 0.3 });
    const padGlow = new THREE.MeshStandardMaterial({ color: skin.accent, emissive: skin.accent, emissiveIntensity: 1.2 });
    addBox(headGroup, [0.045, 0.16, 0.16], [-0.225, 0.22, 0], shell);
    addBox(headGroup, [0.045, 0.16, 0.16], [0.225, 0.22, 0], shell);
    addBox(headGroup, [0.45, 0.04, 0.09], [0, 0.43, 0], shell);
    addBox(headGroup, [0.015, 0.07, 0.07], [-0.245, 0.22, 0], padGlow);
    addBox(headGroup, [0.015, 0.07, 0.07], [0.245, 0.22, 0], padGlow);
  } else if (skin.gear === 'crown') {
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 0.43, 0);
    headGroup.add(crownGroup);
    const goldMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.9, roughness: 0.2 });
    const gemMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.7, roughness: 0.15 });
    addBox(crownGroup, [0.43, 0.07, 0.43], [0, 0, 0], goldMat);
    addBox(crownGroup, [0.08, 0.06, 0.04], [0, 0.055, -0.19], gemMat);
    addBox(crownGroup, [0.06, 0.06, 0.06], [-0.17, 0.055, -0.17], goldMat);
    addBox(crownGroup, [0.06, 0.06, 0.06], [0.17, 0.055, -0.17], goldMat);
  } else if (skin.gear === 'goggles') {
    const gGroup = new THREE.Group();
    gGroup.position.set(0, 0.34, -0.215);
    headGroup.add(gGroup);
    addBox(gGroup, [0.38, 0.08, 0.03], [0, 0, 0], new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.65 }));
    const lensMat = new THREE.MeshStandardMaterial({ color: '#34d399', metalness: 0.35, roughness: 0.15 });
    addBox(gGroup, [0.11, 0.065, 0.02], [-0.085, 0, -0.015], lensMat);
    addBox(gGroup, [0.11, 0.065, 0.02], [0.085, 0, -0.015], lensMat);
  } else if (skin.gear === 'hood') {
    const hoodMat = new THREE.MeshStandardMaterial({ color: skin.shirt, roughness: 0.85 });
    addBox(headGroup, [0.45, 0.1, 0.46], [0, 0.41, 0.02], hoodMat);
    addBox(headGroup, [0.45, 0.38, 0.06], [0, 0.23, 0.22], hoodMat);
  } else if (skin.gear === 'headband') {
    addBox(headGroup, [0.43, 0.065, 0.43], [0, 0.31, 0], new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.75 }));
    addBox(headGroup, [0.14, 0.045, 0.015], [0, 0.31, -0.218], new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.85, roughness: 0.22 }));
  }

  // 2. TORSO & BACK GEAR
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.45, 0);
  characterGroup.add(torsoGroup);

  addBox(torsoGroup, [0.52, 0.68, 0.26], [0, 0.35, 0], shirtMat);
  addBox(torsoGroup, [0.24, 0.18, 0.02], [0, 0.52, -0.133], shirtAccentMat);
  addBox(torsoGroup, [0.02, 0.14, 0.012], [-0.075, 0.42, -0.135], accentMat);
  addBox(torsoGroup, [0.02, 0.14, 0.012], [0.075, 0.42, -0.135], accentMat);
  addBox(torsoGroup, [0.54, 0.07, 0.28], [0, 0.04, 0], new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.55 }));
  addBox(torsoGroup, [0.11, 0.07, 0.02], [0, 0.04, -0.142], new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.9, roughness: 0.2 }));

  let capeMesh: THREE.Mesh | null = null;
  if (skin.backGear === 'backpack') {
    const packGroup = new THREE.Group();
    packGroup.position.set(0, 0.34, 0.18);
    torsoGroup.add(packGroup);
    addBox(packGroup, [0.34, 0.44, 0.14], [0, 0, 0], new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.78 }));
    addBox(packGroup, [0.24, 0.18, 0.06], [0, -0.09, 0.08], new THREE.MeshStandardMaterial({ color: '#4a2e16', roughness: 0.82 }));
    addBox(packGroup, [0.06, 0.05, 0.02], [0, 0.04, 0.08], new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.85, roughness: 0.25 }));
  } else if (skin.backGear === 'satchel') {
    addBox(torsoGroup, [0.26, 0.32, 0.1], [0.08, 0.26, 0.16], new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.75 }));
  } else if (skin.backGear === 'sheath') {
    const sheathGroup = new THREE.Group();
    sheathGroup.position.set(0, 0.4, 0.16);
    sheathGroup.rotation.set(0, 0, -0.55);
    torsoGroup.add(sheathGroup);
    addBox(sheathGroup, [0.07, 0.65, 0.05], [0, 0, 0], new THREE.MeshStandardMaterial({ color: '#27272a', metalness: 0.6, roughness: 0.35 }));
    addBox(sheathGroup, [0.14, 0.04, 0.07], [0, 0.35, 0], new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 }));
  } else if (skin.backGear === 'cape') {
    capeMesh = addBox(
      torsoGroup,
      [0.48, 0.82, 0.035],
      [0, 0.25, 0.16],
      new THREE.MeshStandardMaterial({ color: skin.capeColor || '#dc2626', roughness: 0.85 }),
      [0.08, 0, 0]
    );
  }

  // 3. LEFT ARM
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.34, 1.09, 0);
  characterGroup.add(leftArm);
  addBox(leftArm, [0.16, 0.38, 0.22], [0, -0.18, 0], shirtMat);
  addBox(leftArm, [0.17, 0.05, 0.23], [0, -0.36, 0], shirtAccentMat);
  addBox(leftArm, [0.15, 0.18, 0.2], [0, -0.47, 0], skinMat);

  // 4. RIGHT ARM
  const rightArm = new THREE.Group();
  rightArm.position.set(0.34, 1.09, 0);
  characterGroup.add(rightArm);
  addBox(rightArm, [0.16, 0.38, 0.22], [0, -0.18, 0], shirtMat);
  addBox(rightArm, [0.17, 0.05, 0.23], [0, -0.36, 0], shirtAccentMat);
  addBox(rightArm, [0.15, 0.18, 0.2], [0, -0.47, 0], skinMat);

  // 5. LEFT LEG & RIGHT LEG
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.13, 0.45, 0);
  characterGroup.add(leftLeg);
  addBox(leftLeg, [0.22, 0.34, 0.23], [0, -0.17, 0], pantsMat);
  addBox(leftLeg, [0.22, 0.1, 0.26], [0, -0.38, -0.015], shoesMat);
  addBox(leftLeg, [0.23, 0.025, 0.27], [0, -0.44, -0.015], soleMat);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.13, 0.45, 0);
  characterGroup.add(rightLeg);
  addBox(rightLeg, [0.22, 0.34, 0.23], [0, -0.17, 0], pantsMat);
  addBox(rightLeg, [0.22, 0.1, 0.26], [0, -0.38, -0.015], shoesMat);
  addBox(rightLeg, [0.23, 0.025, 0.27], [0, -0.44, -0.015], soleMat);

  return {
    root,
    handles: {
      characterGroup,
      headGroup,
      leftArm,
      rightArm,
      capeMesh,
    },
    skin,
  };
}

/**
 * Interactive 3D-shaded software voxel fallback ONLY used if a browser literally has zero WebGL.
 * Supports full 360-degree drag rotation & live color/accessory preview so it never collapses to a flat box.
 */
const InteractiveFallback3DPreview: React.FC<{
  skin: CharacterSkinPreset;
  yaw: number;
  size?: 'compact' | 'large';
}> = ({ skin, yaw, size = 'compact' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw isometric 3D shaded voxel figure projected at yaw
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const scale = size === 'large' ? 78 : 54;
    const cx = w / 2;
    const baseY = h * 0.84;

    const project = (x: number, y: number, z: number) => {
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const sx = cx + rx * scale;
      const sy = baseY - y * scale + rz * scale * 0.18;
      return { sx, sy, depth: rz };
    };

    const shadeHex = (hex: string, factor: number) => {
      const clean = hex.replace('#', '');
      const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
      if (Number.isNaN(n)) return hex;
      const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
      const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
      const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
      return `rgb(${r},${g},${b})`;
    };

    interface BoxPart {
      x: number; y: number; z: number;
      dx: number; dy: number; dz: number;
      color: string;
    }

    const parts: BoxPart[] = [
      // Legs
      { x: -0.13, y: 0.24, z: 0, dx: 0.21, dy: 0.44, dz: 0.23, color: skin.pants },
      { x: 0.13, y: 0.24, z: 0, dx: 0.21, dy: 0.44, dz: 0.23, color: skin.pants },
      { x: -0.13, y: 0.05, z: 0, dx: 0.22, dy: 0.1, dz: 0.26, color: skin.shoes },
      { x: 0.13, y: 0.05, z: 0, dx: 0.22, dy: 0.1, dz: 0.26, color: skin.shoes },
      // Torso
      { x: 0, y: 0.8, z: 0, dx: 0.5, dy: 0.68, dz: 0.26, color: skin.shirt },
      // Arms
      { x: -0.34, y: 0.85, z: 0, dx: 0.16, dy: 0.56, dz: 0.21, color: skin.shirt },
      { x: 0.34, y: 0.85, z: 0, dx: 0.16, dy: 0.56, dz: 0.21, color: skin.shirt },
      // Head
      { x: 0, y: 1.36, z: 0, dx: 0.4, dy: 0.4, dz: 0.4, color: skin.skin },
      { x: 0, y: 1.5, z: -0.02, dx: 0.42, dy: 0.15, dz: 0.42, color: skin.hair },
      // Eyes on front face (+Z in preview space after rotation)
      { x: -0.08, y: 1.37, z: 0.21, dx: 0.07, dy: 0.05, dz: 0.02, color: skin.eyes },
      { x: 0.08, y: 1.37, z: 0.21, dx: 0.07, dy: 0.05, dz: 0.02, color: skin.eyes },
    ];

    if (skin.backGear === 'cape') {
      parts.push({ x: 0, y: 0.72, z: -0.17, dx: 0.46, dy: 0.82, dz: 0.05, color: skin.capeColor || '#dc2626' });
    } else if (skin.backGear === 'backpack') {
      parts.push({ x: 0, y: 0.8, z: -0.19, dx: 0.34, dy: 0.44, dz: 0.14, color: '#6b4423' });
    }
    if (skin.gear === 'crown') {
      parts.push({ x: 0, y: 1.6, z: 0, dx: 0.43, dy: 0.08, dz: 0.43, color: '#fbbf24' });
    } else if (skin.gear === 'headphones') {
      parts.push({ x: -0.23, y: 1.38, z: 0, dx: 0.05, dy: 0.16, dz: 0.16, color: skin.accent });
      parts.push({ x: 0.23, y: 1.38, z: 0, dx: 0.05, dy: 0.16, dz: 0.16, color: skin.accent });
    }

    // Painter sort back-to-front
    const sorted = parts
      .map((p) => ({ p, d: p.x * sinY + p.z * cosY }))
      .sort((a, b) => a.d - b.d);

    // Pedestal glow
    ctx.fillStyle = 'rgba(16,185,129,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 4, scale * 0.6, scale * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const { p } of sorted) {
      const hx = p.dx / 2;
      const hy = p.dy / 2;
      const hz = p.dz / 2;
      const corners = [
        project(p.x - hx, p.y - hy, p.z - hz),
        project(p.x + hx, p.y - hy, p.z - hz),
        project(p.x + hx, p.y + hy, p.z - hz),
        project(p.x - hx, p.y + hy, p.z - hz),
        project(p.x - hx, p.y - hy, p.z + hz),
        project(p.x + hx, p.y - hy, p.z + hz),
        project(p.x + hx, p.y + hy, p.z + hz),
        project(p.x - hx, p.y + hy, p.z + hz),
      ];
      const faces = [
        { idx: [0, 1, 2, 3], shade: 0.85 },
        { idx: [4, 5, 6, 7], shade: 1.0 },
        { idx: [0, 3, 7, 4], shade: 0.72 },
        { idx: [1, 2, 6, 5], shade: 0.92 },
        { idx: [3, 2, 6, 7], shade: 1.08 },
      ];
      const sortedFaces = faces
        .map((f) => ({
          ...f,
          depth: f.idx.reduce((acc, i) => acc + corners[i].depth, 0) / 4,
        }))
        .sort((a, b) => a.depth - b.depth);

      for (const f of sortedFaces) {
        ctx.beginPath();
        ctx.moveTo(corners[f.idx[0]].sx, corners[f.idx[0]].sy);
        for (let k = 1; k < 4; k++) {
          ctx.lineTo(corners[f.idx[k]].sx, corners[f.idx[k]].sy);
        }
        ctx.closePath();
        ctx.fillStyle = shadeHex(p.color, f.shade);
        ctx.fill();
      }
    }
  }, [skin, yaw, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size === 'large' ? 280 : 180}
      height={size === 'large' ? 240 : 160}
      className="w-full h-full object-contain pointer-events-none"
    />
  );
};

export const CharacterPreviewCard: React.FC<CharacterPreviewCardProps> = ({
  lang,
  characterSkin,
  customSkin,
  ownedSkins,
  vipActive,
  onSelectSkin,
  onUpdateCustomSkin,
  onOpenShopForSkin,
  hidden = false,
  layoutMode = 'floating',
  cardClassName,
  stageHeightClass,
}) => {
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'style' | 'gear'>('presets');
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [fallbackYaw, setFallbackYaw] = useState(0.35);

  const dragYawRef = useRef(0);
  const autoYawRef = useRef(0.35);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  // Two empty host containers; ONE persistent WebGL <canvas> moves smoothly between them!
  const cardStageHostRef = useRef<HTMLDivElement | null>(null);
  const studioStageHostRef = useRef<HTMLDivElement | null>(null);

  const stageControllerRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    pedestalRoot: THREE.Group;
    rimLight: THREE.DirectionalLight;
    handles: RigAnimationHandles | null;
    currentStageObj: THREE.Group | null;
    updateSize: (el: HTMLDivElement | null) => void;
    rebuildCharacter: (sid: CharacterSkinId, cfg: CustomCharacterConfig) => void;
    dispose: () => void;
  } | null>(null);

  const resolvedSkin = resolveCharacterSkin(characterSkin, customSkin);
  const allPresets = Object.values(CHARACTER_SKINS);
  const shopSkinIds: CharacterSkinId[] = ['dragon', 'angel', 'titan', 'poseidon', 'obsidian'];

  const isSkinUnlocked = (id: CharacterSkinId) => {
    if (!shopSkinIds.includes(id)) return true;
    if (id === 'obsidian') return ownedSkins.includes('obsidian');
    return vipActive || ownedSkins.includes(id);
  };

  // Single persistent Three.js WebGLRenderer lifecycle (NEVER torn down on modal open/close or swatch edits)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let disposed = false;
    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

    const initRenderer = () => {
      if (disposed) return;

      const isSoftwareGl = detectSoftwareGL();
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: !isSoftwareGl,
          powerPreference: 'low-power',
          preserveDrawingBuffer: false,
        });
      } catch {
        setWebglUnavailable(true);
        return;
      }

      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.pointerEvents = 'none';

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
      camera.position.set(0, 0.35, 2.75);

      const hemiLight = new THREE.HemisphereLight('#dbeafe', '#1e293b', 0.9);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight('#fff7ed', 1.35);
      keyLight.position.set(3, 5, 4);
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight('#38bdf8', 0.8);
      rimLight.position.set(-3, 3, -4);
      scene.add(rimLight);

      const fillLight = new THREE.PointLight('#ffffff', 0.65);
      fillLight.position.set(0, 1.4, -2.5);
      scene.add(fillLight);

      const pedestalRoot = new THREE.Group();
      pedestalRoot.position.set(0, -0.82, 0);
      pedestalRoot.rotation.set(0, 0.35, 0);
      scene.add(pedestalRoot);

      const controller = {
        renderer,
        scene,
        camera,
        pedestalRoot,
        rimLight,
        handles: null as RigAnimationHandles | null,
        currentStageObj: null as THREE.Group | null,
        updateSize: (targetHost: HTMLDivElement | null) => {
          if (!targetHost || !renderer) return;
          const w = Math.max(80, targetHost.clientWidth || 180);
          const h = Math.max(80, targetHost.clientHeight || 180);
          camera.aspect = w / h;
          camera.position.z = w > 240 ? 2.55 : 2.75;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        },
        rebuildCharacter: (sid: CharacterSkinId, cfg: CustomCharacterConfig) => {
          if (controller.currentStageObj) {
            pedestalRoot.remove(controller.currentStageObj);
            disposeObjectTree(controller.currentStageObj);
            controller.currentStageObj = null;
            controller.handles = null;
          }
          const built = buildHeroPedestalStage(sid, cfg);
          controller.currentStageObj = built.root;
          controller.handles = built.handles;
          rimLight.color.set(built.skin.badgeColor || '#38bdf8');
          pedestalRoot.add(built.root);
        },
        dispose: () => {
          cancelAnimationFrame(rafId);
          if (recoveryTimer) clearTimeout(recoveryTimer);
          resizeObserver?.disconnect();
          if (controller.currentStageObj) {
            pedestalRoot.remove(controller.currentStageObj);
            disposeObjectTree(controller.currentStageObj);
          }
          if (renderer) {
            if (renderer.domElement.parentElement) {
              renderer.domElement.parentElement.removeChild(renderer.domElement);
            }
            try {
              renderer.forceContextLoss?.();
            } catch {}
            renderer.dispose();
          }
        },
      };

      stageControllerRef.current = controller;
      setWebglUnavailable(false);

      // Build initial character
      controller.rebuildCharacter(characterSkin, customSkin);

      // Mount canvas into active host immediately
      const activeHost = isCustomizerOpen ? studioStageHostRef.current : cardStageHostRef.current;
      if (activeHost) {
        activeHost.innerHTML = '';
        activeHost.appendChild(renderer.domElement);
        controller.updateSize(activeHost);
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          const host = renderer?.domElement.parentElement as HTMLDivElement | null;
          if (host) controller.updateSize(host);
        });
        if (cardStageHostRef.current) resizeObserver.observe(cardStageHostRef.current);
        if (studioStageHostRef.current) resizeObserver.observe(studioStageHostRef.current);
      }

      // Context loss & self-healing recovery (never traps user in 2D!)
      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        if (disposed) return;
        setWebglUnavailable(true);
        if (recoveryTimer) clearTimeout(recoveryTimer);
        recoveryTimer = setTimeout(() => {
          if (!disposed) {
            controller.dispose();
            stageControllerRef.current = null;
            initRenderer();
          }
        }, 350);
      });

      renderer.domElement.addEventListener('webglcontextrestored', () => {
        if (!disposed) setWebglUnavailable(false);
      });

      let lastTs = performance.now();
      let elapsed = 0;

      const animate = (now: number) => {
        if (disposed || !renderer) return;
        rafId = requestAnimationFrame(animate);

        const delta = Math.min(0.1, Math.max(0.001, (now - lastTs) / 1000));
        lastTs = now;
        elapsed += delta;

        if (hiddenRef.current || (typeof document !== 'undefined' && document.hidden)) return;

        if (!isDraggingRef.current) {
          autoYawRef.current += delta * 0.48;
        }
        pedestalRoot.rotation.y = autoYawRef.current + dragYawRef.current;
        pedestalRoot.position.y = -0.82 + Math.sin(elapsed * 2.1) * 0.015;

        const h = controller.handles;
        if (h) {
          const breath = Math.sin(elapsed * 2.4) * 0.04;
          h.headGroup.rotation.y = Math.sin(elapsed * 1.1) * 0.12;
          h.headGroup.rotation.x = Math.sin(elapsed * 1.6) * 0.04;
          h.leftArm.rotation.x = Math.sin(elapsed * 1.8) * 0.08;
          h.leftArm.rotation.z = -0.06 - breath * 0.4;
          h.rightArm.rotation.x = -Math.sin(elapsed * 1.8) * 0.08;
          h.rightArm.rotation.z = 0.06 + breath * 0.4;
          if (h.capeMesh) {
            h.capeMesh.rotation.x = 0.12 + Math.sin(elapsed * 2.4) * 0.05;
          }
        }

        renderer.render(scene, camera);
      };

      rafId = requestAnimationFrame(animate);
    };

    initRenderer();

    return () => {
      disposed = true;
      stageControllerRef.current?.dispose();
      stageControllerRef.current = null;
    };
    // Mount WebGL stage once for Card+Studio lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-place 3D mesh update whenever skin/colors/accessories change (ZERO WebGL context recreation)
  useEffect(() => {
    stageControllerRef.current?.rebuildCharacter(characterSkin, customSkin);
  }, [characterSkin, customSkin]);

  // Move the persistent WebGL <canvas> seamlessly between compact Card host and open Studio modal host
  useLayoutEffect(() => {
    const controller = stageControllerRef.current;
    if (!controller || webglUnavailable) return;

    const targetHost = isCustomizerOpen ? studioStageHostRef.current : cardStageHostRef.current;
    if (!targetHost) return;

    if (controller.renderer.domElement.parentElement !== targetHost) {
      targetHost.innerHTML = '';
      targetHost.appendChild(controller.renderer.domElement);
    }
    controller.updateSize(targetHost);
    const rafResize = requestAnimationFrame(() => controller.updateSize(targetHost));
    return () => cancelAnimationFrame(rafResize);
  }, [isCustomizerOpen, webglUnavailable, layoutMode]);

  // Subtle auto-rotation for interactive software 3D fallback if WebGL is disabled
  useEffect(() => {
    if (!webglUnavailable || hidden) return;
    const id = setInterval(() => {
      if (!isDraggingRef.current) {
        setFallbackYaw((y) => y + 0.04);
      }
    }, 33);
    return () => clearInterval(id);
  }, [webglUnavailable, hidden]);

  const handleRandomizeCustom = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const gears: CustomCharacterConfig['gear'][] = ['none', 'headphones', 'crown', 'goggles', 'hood', 'headband'];
    const backGears: CustomCharacterConfig['backGear'][] = ['none', 'backpack', 'cape', 'satchel', 'sheath'];
    const accent = pick(EYE_SWATCHES);
    onSelectSkin('custom');
    onUpdateCustomSkin({
      skin: pick(SKIN_TONES),
      hair: pick(HAIR_SWATCHES),
      eyes: accent,
      shirt: pick(CLOTH_SWATCHES),
      shirtAccent: pick(CLOTH_SWATCHES),
      pants: pick(['#18181b', '#1e293b', '#1e3a8a', '#3f6212', '#475569', '#292524']),
      shoes: pick(['#f8fafc', '#18181b', '#52525b', '#78350f']),
      sole: accent,
      accent,
      gear: pick(gears),
      backGear: pick(backGears),
      capeColor: pick(CLOTH_SWATCHES),
    });
  };

  useEffect(() => {
    if (!savedNotice) return;
    const t = setTimeout(() => setSavedNotice(false), 1600);
    return () => clearTimeout(t);
  }, [savedNotice]);

  const handleStageDragStart = (clientX: number) => {
    isDraggingRef.current = true;
    dragStartXRef.current = clientX;
  };

  const handleStageDragMove = (clientX: number) => {
    if (!isDraggingRef.current) return;
    const dx = clientX - dragStartXRef.current;
    dragStartXRef.current = clientX;
    dragYawRef.current += dx * 0.015;
    if (webglUnavailable) {
      setFallbackYaw((y) => y + dx * 0.018);
    }
  };

  const handleStageDragEnd = () => {
    isDraggingRef.current = false;
  };

  return (
    <>
      {/* 3D Character Showcase & Customizer Card */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={
          layoutMode === 'inline'
            ? `relative z-20 flex flex-col items-center shrink-0 transition-all duration-300 ${
                hidden ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'
              }`
            : `absolute right-2 sm:right-5 top-14 sm:top-16 z-30 flex flex-col items-end transition-all duration-300 ${
                hidden ? 'opacity-0 pointer-events-none translate-x-10' : 'opacity-100 translate-x-0'
              }`
        }
      >
        <div
          className={`${
            cardClassName ||
            (layoutMode === 'inline'
              ? 'w-[146px] sm:w-[196px]'
              : 'w-[154px] sm:w-[218px] lg:w-[254px] max-h-[calc(100dvh-76px)]')
          } bg-zinc-950/94 border border-white/15 rounded-2xl shadow-2xl overflow-y-auto flex flex-col`}
        >
          {/* Card Header */}
          <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-white/[0.04] border-b border-white/10 flex items-center justify-between gap-1.5 shrink-0">
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9.5px] font-mono uppercase tracking-widest text-emerald-400 font-bold truncate">
                {lang === 'es' ? 'Tu Personaje' : 'Your Hero'}
              </p>
              <p className="text-[11px] sm:text-sm font-black text-white truncate">
                {lang === 'es' ? resolvedSkin.nameEs : resolvedSkin.nameEn}
              </p>
            </div>
            <span
              className="w-3 h-3 rounded-full shrink-0 border border-white/40"
              style={{ backgroundColor: resolvedSkin.badgeColor }}
            />
          </div>

          {/* Live 3D Rotating Character Stage */}
          <div
            className={`relative w-full ${
              stageHeightClass ||
              (layoutMode === 'inline'
                ? 'h-[112px] sm:h-[152px]'
                : 'h-[138px] sm:h-[192px] lg:h-[238px]')
            } bg-gradient-to-b from-slate-900/70 via-zinc-900/80 to-zinc-950/95 cursor-grab active:cursor-grabbing touch-none shrink-0`}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleStageDragStart(e.clientX);
            }}
            onPointerMove={(e) => handleStageDragMove(e.clientX)}
            onPointerUp={handleStageDragEnd}
            onPointerLeave={handleStageDragEnd}
          >
            {webglUnavailable ? (
              <InteractiveFallback3DPreview skin={resolvedSkin} yaw={fallbackYaw} size="compact" />
            ) : (
              <div ref={cardStageHostRef} className="w-full h-full" />
            )}

            <div className="pointer-events-none absolute bottom-1.5 left-2.5 right-2.5 flex items-center justify-between text-[8.5px] font-mono text-zinc-400">
              <span>{lang === 'es' ? 'Arrastra 360°' : 'Drag 360°'}</span>
              {characterSkin === 'custom' && (
                <span className="text-purple-300 font-bold uppercase">CUSTOM</span>
              )}
            </div>
          </div>

          {/* Action Footer inside Right Card */}
          <div className="p-2.5 bg-zinc-950/90 border-t border-white/10 flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsCustomizerOpen(true)}
              className="w-full py-2 sm:py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-95 text-white font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <i className="fas fa-palette text-[11px]" />
              <span>{lang === 'es' ? 'Personalizar' : 'Customize'}</span>
            </button>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {(['cyber', 'knight', 'explorer', 'custom'] as CharacterSkinId[]).map((sid) => {
                const p = resolveCharacterSkin(sid, customSkin);
                const active = characterSkin === sid;
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => onSelectSkin(sid)}
                    title={lang === 'es' ? p.nameEs : p.nameEn}
                    className={`flex-1 py-1 px-1 rounded-lg border text-[8px] sm:text-[9px] font-bold uppercase truncate transition cursor-pointer ${
                      active
                        ? 'bg-emerald-500/25 border-emerald-400 text-white'
                        : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sid === 'custom' ? (lang === 'es' ? 'Mío' : 'Own') : p.nameEn.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Full Unobstructed Character Customizer Studio Overlay (Portaled to document.body) */}
      {isCustomizerOpen && typeof document !== 'undefined' && createPortal(
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setIsCustomizerOpen(false)}
          className="fixed inset-0 bg-black/88 z-[100020] flex flex-col items-center justify-start overflow-y-auto overscroll-contain safe-area-inset p-2 sm:p-4 pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] my-auto bg-zinc-950 border-2 border-emerald-500/45 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-white"
          >
            {/* Studio Header */}
            <div className="px-3.5 sm:px-5 py-2 sm:py-3 border-b border-white/10 bg-white/[0.03] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0">
                  <i className="fas fa-user-astronaut text-sm sm:text-base" />
                </div>
                <div className="text-left min-w-0">
                  <h2 className="text-sm sm:text-xl font-black minecraft-font uppercase tracking-tight text-white truncate">
                    {lang === 'es' ? 'Personalizar Personaje 3D' : 'Customize 3D Hero'}
                  </h2>
                  <p className="text-[10px] sm:text-[11px] font-mono text-zinc-400 truncate">
                    {lang === 'es'
                      ? 'Los cambios se aplican en tiempo real en tu mundo y multijugador'
                      : 'Changes sync live in gameplay and multiplayer'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomizerOpen(false)}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0"
                aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Responsive Split Studio Content */}
            <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12 overflow-y-auto md:overflow-hidden">
              {/* Left/Top: Large Live 3D Turntable Stage */}
              <div className="md:col-span-5 shrink-0 md:shrink md:min-h-0 md:overflow-y-auto bg-gradient-to-b from-slate-900/90 via-zinc-900 to-zinc-950 border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between p-2.5 sm:p-3">
                <div className="flex items-center justify-between text-xs px-1 shrink-0">
                  <span className="font-black text-white uppercase truncate">
                    {lang === 'es' ? resolvedSkin.nameEs : resolvedSkin.nameEn}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {lang === 'es' ? 'Arrastra 360°' : 'Drag 360°'}
                  </span>
                </div>

                <div
                  className="w-full h-[155px] sm:h-[205px] md:flex-1 md:min-h-[140px] cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleStageDragStart(e.clientX);
                  }}
                  onPointerMove={(e) => handleStageDragMove(e.clientX)}
                  onPointerUp={handleStageDragEnd}
                  onPointerLeave={handleStageDragEnd}
                >
                  {webglUnavailable ? (
                    <InteractiveFallback3DPreview skin={resolvedSkin} yaw={fallbackYaw} size="large" />
                  ) : (
                    <div ref={studioStageHostRef} className="w-full h-full" />
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={handleRandomizeCustom}
                    className="flex-1 py-1.5 sm:py-2 px-3 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/40 text-purple-200 font-bold text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <i className="fas fa-dice" />
                    <span>{lang === 'es' ? 'Aleatorio' : 'Randomize'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSavedNotice(true);
                      setIsCustomizerOpen(false);
                    }}
                    className="flex-1 py-1.5 sm:py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase cursor-pointer transition"
                  >
                    {lang === 'es' ? 'Listo' : 'Done'}
                  </button>
                </div>
              </div>

              {/* Right/Bottom: Scrollable Tabs & Controls */}
              <div className="md:col-span-7 flex flex-col md:min-h-0 p-2.5 sm:p-4 gap-2.5 sm:gap-3 md:overflow-hidden">
                {/* Tabs */}
                <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10 shrink-0">
                  {[
                    { id: 'presets', label: lang === 'es' ? 'Skins' : 'Skins', icon: 'fa-masks-theater' },
                    { id: 'style', label: lang === 'es' ? 'Colores' : 'Colors', icon: 'fa-droplet' },
                    { id: 'gear', label: lang === 'es' ? 'Accesorios' : 'Gear', icon: 'fa-hat-wizard' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`py-2 rounded-lg text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <i className={`fas ${tab.icon} text-xs`} />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 md:min-h-0 md:overflow-y-auto pr-1 flex flex-col gap-3">
                  {activeTab === 'presets' && (
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 pb-1">
                      {allPresets.map((preset) => {
                        const unlocked = isSkinUnlocked(preset.id);
                        const active = characterSkin === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              if (unlocked) {
                                onSelectSkin(preset.id);
                              } else {
                                setIsCustomizerOpen(false);
                                onOpenShopForSkin(preset.id);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                              active
                                ? 'bg-emerald-500/20 border-emerald-400 shadow-md'
                                : unlocked
                                  ? 'bg-zinc-900/80 border-white/10 hover:border-white/30'
                                  : 'bg-zinc-900/40 border-amber-500/30 hover:border-amber-400'
                            }`}
                          >
                            <span
                              className="w-8 h-8 rounded-lg border border-white/25 shrink-0 flex items-center justify-center text-xs"
                              style={{ backgroundColor: preset.id === 'custom' ? customSkin.shirt : preset.shirt }}
                            >
                              {!unlocked && <i className="fas fa-lock text-amber-300 drop-shadow" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white truncate">
                                {lang === 'es' ? preset.nameEs : preset.nameEn}
                              </p>
                              <p className="text-[10px] font-mono text-zinc-400 uppercase truncate">
                                {unlocked
                                  ? active
                                    ? (lang === 'es' ? 'Equipado' : 'Equipped')
                                    : (lang === 'es' ? 'Disponible' : 'Unlocked')
                                  : (lang === 'es' ? 'Desbloquear en Tienda VIP' : 'Unlock in VIP Shop')}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeTab === 'style' && (
                    <div className="flex flex-col gap-3 text-left pb-2">
                      {[
                        { key: 'skin' as const, label: lang === 'es' ? 'Tono de Piel' : 'Skin Tone', swatches: SKIN_TONES },
                        { key: 'hair' as const, label: lang === 'es' ? 'Cabello' : 'Hair', swatches: HAIR_SWATCHES },
                        { key: 'eyes' as const, label: lang === 'es' ? 'Ojos y Brillo' : 'Eyes & Accent', swatches: EYE_SWATCHES },
                        { key: 'shirt' as const, label: lang === 'es' ? 'Camisa / Armadura' : 'Shirt', swatches: CLOTH_SWATCHES },
                        { key: 'pants' as const, label: lang === 'es' ? 'Pantalón' : 'Pants', swatches: CLOTH_SWATCHES },
                        { key: 'shoes' as const, label: lang === 'es' ? 'Calzado' : 'Shoes', swatches: ['#f8fafc', '#18181b', '#78350f', '#dc2626', '#0284c7', '#10b981'] },
                      ].map((row) => (
                        <div key={row.key} className="bg-zinc-900/70 border border-white/5 rounded-xl p-2.5 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-200">{row.label}</span>
                            <input
                              type="color"
                              value={customSkin[row.key]}
                              onChange={(e) => {
                                onSelectSkin('custom');
                                const val = e.target.value;
                                onUpdateCustomSkin({
                                  ...customSkin,
                                  [row.key]: val,
                                  ...(row.key === 'eyes' ? { accent: val, sole: val } : {}),
                                });
                              }}
                              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                              title={row.label}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {row.swatches.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => {
                                  onSelectSkin('custom');
                                  onUpdateCustomSkin({
                                    ...customSkin,
                                    [row.key]: hex,
                                    ...(row.key === 'eyes' ? { accent: hex, sole: hex } : {}),
                                  });
                                }}
                                className={`w-6 h-6 rounded-lg border transition cursor-pointer ${
                                  customSkin[row.key].toLowerCase() === hex.toLowerCase()
                                    ? 'border-white scale-110 ring-2 ring-emerald-400'
                                    : 'border-white/20 hover:scale-105'
                                }`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'gear' && (
                    <div className="flex flex-col gap-3 text-left pb-2">
                      <div className="bg-zinc-900/70 border border-white/5 rounded-xl p-3">
                        <span className="text-xs font-bold text-zinc-200 block mb-2">
                          {lang === 'es' ? 'Accesorio de Cabeza' : 'Headgear'}
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { id: 'none', label: lang === 'es' ? 'Ninguno' : 'None' },
                            { id: 'headphones', label: lang === 'es' ? 'Visor/Cascos' : 'Cyber' },
                            { id: 'crown', label: lang === 'es' ? 'Corona' : 'Crown' },
                            { id: 'goggles', label: lang === 'es' ? 'Gafas' : 'Goggles' },
                            { id: 'hood', label: lang === 'es' ? 'Capucha' : 'Hood' },
                            { id: 'headband', label: lang === 'es' ? 'Cinta' : 'Ninja' },
                          ].map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                onSelectSkin('custom');
                                onUpdateCustomSkin({
                                  ...customSkin,
                                  gear: g.id as CustomCharacterConfig['gear'],
                                });
                              }}
                              className={`py-2 px-1.5 rounded-lg border text-[10px] font-bold uppercase truncate cursor-pointer ${
                                customSkin.gear === g.id
                                  ? 'bg-emerald-600/30 border-emerald-400 text-white'
                                  : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-zinc-900/70 border border-white/5 rounded-xl p-3">
                        <span className="text-xs font-bold text-zinc-200 block mb-2">
                          {lang === 'es' ? 'Accesorio de Espalda' : 'Back Gear'}
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { id: 'none', label: lang === 'es' ? 'Ninguno' : 'None' },
                            { id: 'cape', label: lang === 'es' ? 'Capa' : 'Cape' },
                            { id: 'backpack', label: lang === 'es' ? 'Mochila' : 'Pack' },
                            { id: 'satchel', label: lang === 'es' ? 'Bolso' : 'Satchel' },
                            { id: 'sheath', label: lang === 'es' ? 'Katana' : 'Katana' },
                          ].map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                onSelectSkin('custom');
                                onUpdateCustomSkin({
                                  ...customSkin,
                                  backGear: b.id as CustomCharacterConfig['backGear'],
                                });
                              }}
                              className={`py-2 px-1.5 rounded-lg border text-[10px] font-bold uppercase truncate cursor-pointer ${
                                customSkin.backGear === b.id
                                  ? 'bg-emerald-600/30 border-emerald-400 text-white'
                                  : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {customSkin.backGear === 'cape' && (
                        <div className="bg-zinc-900/70 border border-white/5 rounded-xl p-3">
                          <span className="text-xs font-bold text-zinc-200 block mb-2">
                            {lang === 'es' ? 'Color de Capa' : 'Cape Color'}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {CLOTH_SWATCHES.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => {
                                  onSelectSkin('custom');
                                  onUpdateCustomSkin({ ...customSkin, capeColor: hex });
                                }}
                                className={`w-6 h-6 rounded-lg border cursor-pointer ${
                                  customSkin.capeColor.toLowerCase() === hex.toLowerCase()
                                    ? 'border-white scale-110 ring-2 ring-emerald-400'
                                    : 'border-white/20'
                                }`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onSelectSkin('custom');
                          setSavedNotice(true);
                          setIsCustomizerOpen(false);
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
                      >
                        {savedNotice
                          ? (lang === 'es' ? '¡Apariencia Guardada!' : 'Appearance Saved!')
                          : (lang === 'es' ? 'Guardar y Aplicar Skin' : 'Save & Apply Skin')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
