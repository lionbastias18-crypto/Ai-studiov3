import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BlockType } from "../types";
import { BLOCK_COLORS } from "../constants";
import { isSoftwareWebGL } from "../utils/webglUtils";

interface MenuPanorama3DProps {
  showLogo?: boolean;
  onEnterCinemaMode?: () => void;
  isCinemaMode?: boolean;
}

// Pre-allocated math objects to guarantee ZERO GC allocations during animation loop
const _matrix = new THREE.Matrix4();

// Procedural 5x7 Voxel Grid Font for 3D Letters
const VOXEL_FONT: Record<string, string[]> = {
  A: [
    ".###.",
    "#...#",
    "#...#",
    "#####",
    "#...#",
    "#...#",
    "#...#"
  ],
  L: [
    "#....",
    "#....",
    "#....",
    "#....",
    "#....",
    "#....",
    "#####"
  ],
  P: [
    "####.",
    "#...#",
    "#...#",
    "####.",
    "#....",
    "#....",
    "#...."
  ],
  H: [
    "#...#",
    "#...#",
    "#...#",
    "#####",
    "#...#",
    "#...#",
    "#...#"
  ],
  M: [
    "#...#",
    "##.##",
    "#.#.#",
    "#...#",
    "#...#",
    "#...#",
    "#...#"
  ],
  O: [
    ".###.",
    "#...#",
    "#...#",
    "#...#",
    "#...#",
    "#...#",
    ".###."
  ],
  B: [
    "####.",
    "#...#",
    "#...#",
    "####.",
    "#...#",
    "#...#",
    "####."
  ],
  I: [
    "#####",
    "..#..",
    "..#..",
    "..#..",
    "..#..",
    "..#..",
    "#####"
  ],
  E: [
    "#####",
    "#....",
    "#....",
    "####.",
    "#....",
    "#....",
    "#####"
  ]
};

// Procedural texture generator for crisp Minecraft pixel-art blocks
function createPixelTexture(blockType: BlockType, face: "top" | "side" | "bottom" = "side"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;

  const base = BLOCK_COLORS[blockType] || "#888888";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);

  // Add subtle procedural noise
  const addNoise = (amount: number) => {
    const imgData = ctx.getImageData(0, 0, 16, 16);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + n));
      imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + n));
      imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  };

  if (blockType === BlockType.GRASS) {
    if (face === "top") {
      ctx.fillStyle = "#5ea632";
      ctx.fillRect(0, 0, 16, 16);
      addNoise(30);
    } else if (face === "side") {
      ctx.fillStyle = "#866043";
      ctx.fillRect(0, 0, 16, 16);
      addNoise(35);
      // Grass top overhang
      ctx.fillStyle = "#5ea632";
      for (let x = 0; x < 16; x++) {
        const h = 3 + Math.floor(Math.sin(x * 1.5) * 1.5 + Math.random() * 2);
        ctx.fillRect(x, 0, 1, Math.min(6, Math.max(2, h)));
      }
    } else {
      ctx.fillStyle = "#866043";
      ctx.fillRect(0, 0, 16, 16);
      addNoise(35);
    }
  } else if (blockType === BlockType.DIRT) {
    ctx.fillStyle = "#866043";
    ctx.fillRect(0, 0, 16, 16);
    addNoise(40);
  } else if (blockType === BlockType.STONE) {
    ctx.fillStyle = "#777777";
    ctx.fillRect(0, 0, 16, 16);
    addNoise(30);
    // Dark cracks
    ctx.fillStyle = "#555555";
    ctx.fillRect(3, 4, 3, 1);
    ctx.fillRect(5, 5, 2, 1);
    ctx.fillRect(10, 11, 4, 1);
  } else if (blockType === BlockType.LOG) {
    if (face === "top" || face === "bottom") {
      ctx.fillStyle = "#bc9862";
      ctx.fillRect(0, 0, 16, 16);
      ctx.strokeStyle = "#7a5c37";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(3, 3, 10, 10);
      ctx.strokeRect(6, 6, 4, 4);
    } else {
      ctx.fillStyle = "#6b4e2e";
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = "#4a331c";
      for (let x = 0; x < 16; x += 3) {
        ctx.fillRect(x, 0, 1, 16);
      }
      addNoise(20);
    }
  } else if (blockType === BlockType.LEAVES) {
    ctx.fillStyle = "#3a7a28";
    ctx.fillRect(0, 0, 16, 16);
    addNoise(45);
    ctx.fillStyle = "#265419";
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
    }
  } else if (blockType === BlockType.CHERRY_LEAVES) {
    ctx.fillStyle = "#f59ec5";
    ctx.fillRect(0, 0, 16, 16);
    addNoise(30);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 15; i++) {
      ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
    }
  } else if (blockType === BlockType.DIAMOND_ORE) {
    ctx.fillStyle = "#777777";
    ctx.fillRect(0, 0, 16, 16);
    addNoise(25);
    // Diamond specks
    ctx.fillStyle = "#55ffff";
    ctx.fillRect(3, 4, 3, 2);
    ctx.fillRect(10, 5, 2, 3);
    ctx.fillRect(5, 11, 4, 2);
    ctx.fillRect(11, 12, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Generate the 3D Voxel Letter Mesh
function createVoxelTextGroup(
  text: string,
  blockColor: string,
  bevelColor: string,
  scale = 0.18,
  depth = 0.9,
  disposables?: { geos: THREE.BufferGeometry[]; mats: THREE.Material[] }
): THREE.Group {
  const group = new THREE.Group();
  const charSpacing = 5.8;
  const totalWidth = text.length * charSpacing - 1;
  const startX = -(totalWidth * scale) / 2;

  const boxGeo = new THREE.BoxGeometry(scale * 0.96, scale * 0.96, scale * depth);
  const mainMat = new THREE.MeshLambertMaterial({ color: blockColor });
  const bevelMat = new THREE.MeshLambertMaterial({ color: bevelColor });
  disposables?.geos.push(boxGeo);
  disposables?.mats.push(mainMat, bevelMat);

  const coords: number[] = [];
  text.split("").forEach((char, charIdx) => {
    const grid = VOXEL_FONT[char.toUpperCase()];
    if (!grid) return;
    const charOffsetX = startX + charIdx * charSpacing * scale;
    for (let row = 0; row < grid.length; row++) {
      const line = grid[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "#") {
          coords.push(charOffsetX + col * scale, (grid.length - 1 - row) * scale, 0);
        }
      }
    }
  });

  const count = coords.length / 3;
  if (count > 0) {
    const mainInst = new THREE.InstancedMesh(boxGeo, mainMat, count);
    const bevelInst = new THREE.InstancedMesh(boxGeo, bevelMat, count);
    const scaleMat = new THREE.Matrix4().makeScale(0.95, 0.95, 0.95);
    const posMat = new THREE.Matrix4();

    for (let i = 0; i < count; i++) {
      const x = coords[i * 3];
      const y = coords[i * 3 + 1];
      const z = coords[i * 3 + 2];
      _matrix.makeTranslation(x, y, z);
      mainInst.setMatrixAt(i, _matrix);

      posMat.makeTranslation(x + scale * 0.15, y - scale * 0.15, z - scale * 0.4);
      _matrix.multiplyMatrices(posMat, scaleMat);
      bevelInst.setMatrixAt(i, _matrix);
    }
    mainInst.instanceMatrix.needsUpdate = true;
    bevelInst.instanceMatrix.needsUpdate = true;
    group.add(mainInst, bevelInst);
  }

  return group;
}

export const MenuPanorama3D: React.FC<MenuPanorama3DProps> = ({
  showLogo = true,
  onEnterCinemaMode,
  isCinemaMode = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splashIndex, setSplashIndex] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const isCinemaModeRef = useRef(isCinemaMode);
  isCinemaModeRef.current = isCinemaMode;

  const splashes = [
    "¡60 FPS Ultra Optimizado!",
    "¡Panorámica 3D en tiempo real!",
    "¡Con Iron Golem y Endermans!",
    "¡Bioma de Cerezo y Bosque Oscuro!",
    "¡Mundos infinitos en tu móvil!",
    "¡Aldeas con cofres y hornos!",
    "¡100% Voxel 3D sin lag!"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setSplashIndex((prev) => (prev + 1) % splashes.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [splashes.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = isSoftwareWebGL();

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#82bcf2");
    scene.fog = new THREE.FogExp2("#82bcf2", 0.024);

    const width = Math.max(1, container.clientWidth || window.innerWidth || 360);
    const height = Math.max(1, container.clientHeight || window.innerHeight || 640);

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 180);
    camera.position.set(0, 11, 0);

    // 2. Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: isSoftwareGl ? "low-power" : "high-performance",
        alpha: false,
        stencil: false
      });
    } catch (err) {
      console.warn("MenuPanorama3D WebGL unavailable, switching to scenic image fallback:", err);
      setWebglFailed(true);
      return;
    }
    setWebglFailed(false);
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 0.65 : Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!isSoftwareGl) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
    }

    renderer.domElement.style.touchAction = "none";
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setWebglFailed(true);
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      setWebglFailed(false);
    });

    container.appendChild(renderer.domElement);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight("#a4c8ed", 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight("#fff4d6", 1.25);
    sunLight.position.set(30, 45, 20);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight("#92c5f7", "#5c4033", 0.4);
    scene.add(hemiLight);

    // 4. Procedural Textures & Materials
    const grassTopTex = createPixelTexture(BlockType.GRASS, "top");
    const grassSideTex = createPixelTexture(BlockType.GRASS, "side");
    const grassBotTex = createPixelTexture(BlockType.GRASS, "bottom");

    const grassMatMaterials = [
      new THREE.MeshLambertMaterial({ map: grassSideTex }),
      new THREE.MeshLambertMaterial({ map: grassSideTex }),
      new THREE.MeshLambertMaterial({ map: grassTopTex }),
      new THREE.MeshLambertMaterial({ map: grassBotTex }),
      new THREE.MeshLambertMaterial({ map: grassSideTex }),
      new THREE.MeshLambertMaterial({ map: grassSideTex })
    ];

    const dirtTex = createPixelTexture(BlockType.DIRT);
    const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex });

    const stoneTex = createPixelTexture(BlockType.STONE);
    const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex });

    const woodSideTex = createPixelTexture(BlockType.LOG, "side");
    const woodTopTex = createPixelTexture(BlockType.LOG, "top");
    const logMatMaterials = [
      new THREE.MeshLambertMaterial({ map: woodSideTex }),
      new THREE.MeshLambertMaterial({ map: woodSideTex }),
      new THREE.MeshLambertMaterial({ map: woodTopTex }),
      new THREE.MeshLambertMaterial({ map: woodTopTex }),
      new THREE.MeshLambertMaterial({ map: woodSideTex }),
      new THREE.MeshLambertMaterial({ map: woodSideTex })
    ];

    const leavesTex = createPixelTexture(BlockType.LEAVES);
    const leavesMat = new THREE.MeshLambertMaterial({
      map: leavesTex,
      transparent: true,
      alphaTest: 0.2
    });

    const cherryLeavesTex = createPixelTexture(BlockType.CHERRY_LEAVES);
    const cherryLeavesMat = new THREE.MeshLambertMaterial({
      map: cherryLeavesTex,
      transparent: true,
      alphaTest: 0.2
    });

    const cloudMat = new THREE.MeshLambertMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.85
    });

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    // 5. Generate Circular Procedural Voxel Panorama Landscape (zero Vector3 heap allocations)
    const RADIUS = isSoftwareGl ? 22 : 26;
    const grassPositions: number[] = [];
    const dirtPositions: number[] = [];
    const stonePositions: number[] = [];
    const logPositions: number[] = [];
    const leavesPositions: number[] = [];
    const cherryLeavesPositions: number[] = [];

    const getTerrainH = (x: number, z: number) => {
      const distSq = x * x + z * z;
      const hill1 = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 3.5;
      const hill2 = Math.sin((x + z) * 0.08) * 2.2;
      const river = Math.sin(x * 0.2 + z * 0.05) * 2;
      let baseH = 5 + hill1 + hill2;
      if (Math.abs(river) < 1.2 && distSq > 16) {
        baseH -= 2.2;
      }
      return Math.round(baseH);
    };

    const radiusSq = RADIUS * RADIUS;
    for (let x = -RADIUS; x <= RADIUS; x++) {
      for (let z = -RADIUS; z <= RADIUS; z++) {
        if (x * x + z * z > radiusSq) continue;
        const surfaceH = getTerrainH(x, z);
        grassPositions.push(x, surfaceH, z);
        for (let y = surfaceH - 1; y >= Math.max(0, surfaceH - 2); y--) {
          dirtPositions.push(x, y, z);
        }
        for (let y = surfaceH - 3; y >= Math.max(0, surfaceH - 4); y--) {
          stonePositions.push(x, y, z);
        }
      }
    }

    const addTree = (tx: number, tz: number, isCherry = false) => {
      const ty = getTerrainH(tx, tz) + 1;
      const trunkH = isCherry ? 5 : 4 + (Math.abs(tx * tz) % 2);
      for (let y = 0; y < trunkH; y++) {
        logPositions.push(tx, ty + y, tz);
      }
      const leafList = isCherry ? cherryLeavesPositions : leavesPositions;
      for (let ly = -2; ly <= 1; ly++) {
        const rad = ly === 1 ? 1 : 2;
        for (let lx = -rad; lx <= rad; lx++) {
          for (let lz = -rad; lz <= rad; lz++) {
            if (Math.abs(lx) === rad && Math.abs(lz) === rad && Math.random() > 0.4) continue;
            leafList.push(tx + lx, ty + trunkH + ly, tz + lz);
          }
        }
      }
    };

    const treeCoords = [
      { x: -14, z: -10, cherry: false },
      { x: -8, z: 16, cherry: true },
      { x: 12, z: 12, cherry: false },
      { x: 18, z: -6, cherry: true },
      { x: 6, z: -18, cherry: false },
      { x: -18, z: 4, cherry: false },
      { x: 10, z: -15, cherry: true },
      { x: -12, z: -18, cherry: false },
      { x: 15, z: 18, cherry: false }
    ];
    treeCoords.forEach((t) => addTree(t.x, t.z, t.cherry));

    const createInstancedMesh = (
      positions: number[],
      material: THREE.Material | THREE.Material[]
    ) => {
      const count = positions.length / 3;
      if (count === 0) return null;
      const mesh = new THREE.InstancedMesh(boxGeo, material, count);
      for (let i = 0; i < count; i++) {
        _matrix.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        mesh.setMatrixAt(i, _matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return mesh;
    };

    const grassMesh = createInstancedMesh(grassPositions, grassMatMaterials);
    if (grassMesh) scene.add(grassMesh);

    const dirtMesh = createInstancedMesh(dirtPositions, dirtMat);
    if (dirtMesh) scene.add(dirtMesh);

    const stoneMesh = createInstancedMesh(stonePositions, stoneMat);
    if (stoneMesh) scene.add(stoneMesh);

    const logMesh = createInstancedMesh(logPositions, logMatMaterials);
    if (logMesh) scene.add(logMesh);

    const leavesMesh = createInstancedMesh(leavesPositions, leavesMat);
    if (leavesMesh) scene.add(leavesMesh);

    const cherryLeavesMesh = createInstancedMesh(cherryLeavesPositions, cherryLeavesMat);
    if (cherryLeavesMesh) scene.add(cherryLeavesMesh);

    // 6. Water Plane
    const waterGeo = new THREE.PlaneGeometry(RADIUS * 2, RADIUS * 2);
    const waterMat = new THREE.MeshLambertMaterial({
      color: "#2868b2",
      transparent: true,
      opacity: 0.72
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 4.3;
    scene.add(waterMesh);

    // 7. Volumetric Voxel Clouds Ring Overhead
    const cloudPositions: number[] = [];
    for (let cx = -35; cx <= 35; cx += 2) {
      for (let cz = -35; cz <= 35; cz += 2) {
        const cDistSq = cx * cx + cz * cz;
        if (cDistSq < 100 || cDistSq > 1296) continue;
        if (Math.sin(cx * 0.18) * Math.cos(cz * 0.18) > 0.35) {
          cloudPositions.push(cx, 26, cz);
        }
      }
    }
    const cloudMesh = createInstancedMesh(cloudPositions, cloudMat);
    if (cloudMesh) scene.add(cloudMesh);

    // 8. 3D Voxel Logo Group
    const logoAnchorGroup = new THREE.Group();
    camera.add(logoAnchorGroup);
    scene.add(camera);

    let logo3DGroup: THREE.Group | null = null;
    let rotatingGrassBlock: THREE.Mesh | null = null;
    let rotatingDiamondBlock: THREE.Mesh | null = null;
    const extraLogoResources: { geos: THREE.BufferGeometry[]; mats: THREE.Material[]; texs: THREE.Texture[] } = {
      geos: [],
      mats: [],
      texs: []
    };

    if (showLogo) {
      logo3DGroup = new THREE.Group();
      const alphaTitle = createVoxelTextGroup("ALPHA", "#dcdcdc", "#3a3a3a", 0.13, 1.2, extraLogoResources);
      alphaTitle.position.set(0, 0.45, 0);
      logo3DGroup.add(alphaTitle);

      const mobileSubtitle = createVoxelTextGroup("MOBILE", "#10b981", "#064e3b", 0.09, 1.0, extraLogoResources);
      mobileSubtitle.position.set(0, -0.4, 0);
      logo3DGroup.add(mobileSubtitle);

      const miniCubeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      extraLogoResources.geos.push(miniCubeGeo);
      rotatingGrassBlock = new THREE.Mesh(miniCubeGeo, grassMatMaterials);
      rotatingGrassBlock.position.set(-2.8, 0.35, 0);
      logo3DGroup.add(rotatingGrassBlock);

      const diamondTex = createPixelTexture(BlockType.DIAMOND_ORE);
      const diamondMat = new THREE.MeshLambertMaterial({ map: diamondTex });
      extraLogoResources.texs.push(diamondTex);
      extraLogoResources.mats.push(diamondMat);
      rotatingDiamondBlock = new THREE.Mesh(miniCubeGeo, diamondMat);
      rotatingDiamondBlock.position.set(2.8, 0.35, 0);
      logo3DGroup.add(rotatingDiamondBlock);

      const isMobileScreen = width < 640;
      const logoDist = isMobileScreen ? 4.5 : 4.0;
      const logoY = isMobileScreen ? 1.75 : 1.50;
      logo3DGroup.position.set(0, logoY, -logoDist);
      const baseScale = isMobileScreen ? 0.64 : 0.82;
      logo3DGroup.scale.set(baseScale, baseScale, baseScale);

      logoAnchorGroup.add(logo3DGroup);
    }

    // 9. Interactive Touch / Pointer / Keyboard / Gamepad Controls
    const PITCH_MIN = -1.25;
    const PITCH_MAX = 1.25;
    let isDragging = false;
    let activePointerId: number | null = null;
    let activeTouchId: number | null = null;
    let startX = 0;
    let startY = 0;
    let touchYawOffset = 0;
    let touchPitchOffset = -0.06;
    let targetTouchYaw = 0;
    let targetTouchPitch = -0.06;
    const heldKeys = new Set<string>();

    const clampPitch = (p: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, p));
    const isInteractiveTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return Boolean(el && el.closest("input, textarea, select, button, a, label, form, [role='dialog']"));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (activeTouchId !== null) return;
      isDragging = true;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      try {
        container.setPointerCapture?.(e.pointerId);
      } catch {}
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || activePointerId === null || e.pointerId !== activePointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;

      targetTouchYaw += dx * 0.0055;
      targetTouchPitch = clampPitch(targetTouchPitch + dy * 0.0055);
    };

    const onPointerUpOrCancel = (e?: PointerEvent) => {
      if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
      if (activePointerId !== null) {
        try {
          if (container.hasPointerCapture?.(activePointerId)) {
            container.releasePointerCapture(activePointerId);
          }
        } catch {}
      }
      isDragging = false;
      activePointerId = null;
    };

    // Dedicated Touch fallback in case a parent scroll container intercepts vertical pointermove
    const onTouchStart = (e: TouchEvent) => {
      if (activeTouchId !== null) return;
      if (isInteractiveTarget(e.target)) return;
      if (e.touches.length === 0) return;
      const t = e.changedTouches[0] || e.touches[0];
      activeTouchId = t.identifier;
      isDragging = true;
      activePointerId = null;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || activeTouchId === null) return;
      let matched: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchId) {
          matched = e.touches[i];
          break;
        }
      }
      if (!matched) return;
      if (e.cancelable) e.preventDefault();
      const dx = matched.clientX - startX;
      const dy = matched.clientY - startY;
      startX = matched.clientX;
      startY = matched.clientY;

      targetTouchYaw += dx * 0.0055;
      targetTouchPitch = clampPitch(targetTouchPitch + dy * 0.0055);
    };

    const onTouchEndOrCancel = (e: TouchEvent) => {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          activeTouchId = null;
          isDragging = false;
          break;
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isCinemaModeRef.current) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "w" ||
        e.key === "W" ||
        e.key === "s" ||
        e.key === "S" ||
        e.key === "a" ||
        e.key === "A" ||
        e.key === "d" ||
        e.key === "D"
      ) {
        heldKeys.add(e.key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.key);
    };

    const onWindowBlur = () => {
      isDragging = false;
      activePointerId = null;
      activeTouchId = null;
      heldKeys.clear();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUpOrCancel);
    window.addEventListener("pointercancel", onPointerUpOrCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEndOrCancel);
    container.addEventListener("touchcancel", onTouchEndOrCancel);

    // 10. Adaptive Animation Loop (throttled cleanly on software GL to prevent main-thread saturation)
    let animationFrameId = 0;
    let disposed = false;
    let lastRenderTs = performance.now();
    let elapsedTotal = 0;
    let autoYaw = 0;
    const minFrameMs = isSoftwareGl ? 45 : 16;

    const animate = (now: number) => {
      if (disposed) return;
      animationFrameId = requestAnimationFrame(animate);
      if (typeof document !== "undefined" && document.hidden) {
        lastRenderTs = now;
        return;
      }
      const elapsedMs = now - lastRenderTs;
      if (elapsedMs < minFrameMs) return;

      const delta = Math.min(elapsedMs / 1000, 0.1);
      lastRenderTs = now;
      elapsedTotal += delta;

      if (isCinemaModeRef.current) {
        // Keyboard camera look in Panorama mode
        if (heldKeys.has("ArrowUp") || heldKeys.has("w") || heldKeys.has("W")) {
          targetTouchPitch = clampPitch(targetTouchPitch + delta * 1.35);
        }
        if (heldKeys.has("ArrowDown") || heldKeys.has("s") || heldKeys.has("S")) {
          targetTouchPitch = clampPitch(targetTouchPitch - delta * 1.35);
        }
        if (heldKeys.has("ArrowLeft") || heldKeys.has("a") || heldKeys.has("A")) {
          targetTouchYaw += delta * 1.55;
        }
        if (heldKeys.has("ArrowRight") || heldKeys.has("d") || heldKeys.has("D")) {
          targetTouchYaw -= delta * 1.55;
        }

        // PS4 / Gamepad right-stick look in Panorama mode
        const pads = navigator.getGamepads?.();
        if (pads) {
          for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!pad || !pad.connected) continue;
            const rx = Math.abs(pad.axes[2] || 0) > 0.14 ? (pad.axes[2] || 0) : 0;
            const ry = Math.abs(pad.axes[3] || 0) > 0.14 ? (pad.axes[3] || 0) : 0;
            if (rx !== 0) targetTouchYaw -= rx * delta * 1.9;
            if (ry !== 0) targetTouchPitch = clampPitch(targetTouchPitch - ry * delta * 1.6);
            break;
          }
        }
      }

      autoYaw += delta * 0.055;
      touchYawOffset = THREE.MathUtils.damp(touchYawOffset, targetTouchYaw, 6.5, delta);
      touchPitchOffset = THREE.MathUtils.damp(touchPitchOffset, targetTouchPitch, 6.5, delta);

      const currentYaw = autoYaw + touchYawOffset;
      const currentPitch = clampPitch(Math.sin(elapsedTotal * 0.35) * 0.04 + touchPitchOffset);

      const lookDist = 20;
      const targetX = camera.position.x + Math.sin(currentYaw) * Math.cos(currentPitch) * lookDist;
      const targetY = camera.position.y + Math.sin(currentPitch) * lookDist;
      const targetZ = camera.position.z + Math.cos(currentYaw) * Math.cos(currentPitch) * lookDist;

      camera.lookAt(targetX, targetY, targetZ);

      if (logo3DGroup) {
        const isMobile = width < 640;
        const baseY = isMobile ? 1.75 : 1.50;
        logo3DGroup.position.y = baseY + Math.sin(elapsedTotal * 1.5) * 0.05;
        logo3DGroup.rotation.y = Math.sin(elapsedTotal * 0.8) * 0.05;
        logo3DGroup.rotation.x = Math.sin(elapsedTotal * 1.2) * 0.025;

        if (rotatingGrassBlock) {
          rotatingGrassBlock.rotation.x += delta * 0.9;
          rotatingGrassBlock.rotation.y += delta * 1.2;
        }
        if (rotatingDiamondBlock) {
          rotatingDiamondBlock.rotation.x -= delta * 0.8;
          rotatingDiamondBlock.rotation.y += delta * 1.1;
        }
      }

      if (cloudMesh) {
        cloudMesh.rotation.y = elapsedTotal * 0.008;
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 11. Responsive Resize
    const handleResize = () => {
      if (!container) return;
      const newWidth = Math.max(1, container.clientWidth || window.innerWidth || 360);
      const newHeight = Math.max(1, container.clientHeight || window.innerHeight || 640);

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);

      if (logo3DGroup) {
        const isMobile = newWidth < 640;
        const dist = isMobile ? 4.5 : 4.0;
        const y = isMobile ? 1.75 : 1.50;
        logo3DGroup.position.set(0, y, -dist);
        const scale = isMobile ? 0.64 : 0.82;
        logo3DGroup.scale.set(scale, scale, scale);
      }
    };

    window.addEventListener("resize", handleResize);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(container);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUpOrCancel);
      window.removeEventListener("pointercancel", onPointerUpOrCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEndOrCancel);
      container.removeEventListener("touchcancel", onTouchEndOrCancel);

      try {
        renderer.forceContextLoss?.();
      } catch {}
      renderer.dispose();
      boxGeo.dispose();
      waterGeo.dispose();
      extraLogoResources.geos.forEach((g) => g.dispose());
      extraLogoResources.mats.forEach((m) => m.dispose());
      extraLogoResources.texs.forEach((t) => t.dispose());

      grassMatMaterials.forEach((m) => m.dispose());
      logMatMaterials.forEach((m) => m.dispose());
      dirtMat.dispose();
      stoneMat.dispose();
      leavesMat.dispose();
      cherryLeavesMat.dispose();
      cloudMat.dispose();
      waterMat.dispose();

      grassTopTex.dispose();
      grassSideTex.dispose();
      grassBotTex.dispose();
      dirtTex.dispose();
      stoneTex.dispose();
      woodSideTex.dispose();
      woodTopTex.dispose();
      leavesTex.dispose();
      cherryLeavesTex.dispose();

      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [showLogo]);

  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-auto select-none touch-none bg-gradient-to-b from-sky-900 via-slate-900 to-zinc-950 ${isCinemaMode ? "z-30" : ""}`}>
      {/* Scenic fallback backdrop if Android WebView lacks WebGL */}
      {webglFailed && (
        <img
          src="./assets/aistudio/1794943627139_ac65a7dd.jpg"
          alt="Adventure Alpha Mobile"
          className="absolute inset-0 w-full h-full object-cover opacity-55 blur-[2px] scale-105 pointer-events-none"
        />
      )}

      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none" />

      {/* Cinematic Vignette & Atmospheric Top/Bottom Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/60 pointer-events-none" />

      {/* Bouncing Yellow Minecraft Splash Text (Positioned at bottom-right of 3D Logo like original Minecraft) */}
      {showLogo && !isCinemaMode && (
        <div className="absolute top-[13%] sm:top-[11%] left-1/2 translate-x-[50px] sm:translate-x-[105px] pointer-events-none z-20 flex flex-col items-center">
          <div
            className="text-[#ffff55] font-extrabold text-xs sm:text-sm tracking-wide font-mono px-2 py-0.5 select-none animate-pulse"
            style={{
              textShadow: "2px 2px 0px #3f3f00, 3px 3px 0px #000",
              transform: "rotate(-18deg) scale(1.05)",
              transformOrigin: "center center"
            }}
          >
            ★ {splashes[splashIndex]} ★
          </div>
        </div>
      )}

      {/* Cinema / Fullscreen Panorama Toggle Button (Top Right corner) */}
      {onEnterCinemaMode && (
        <button
          onClick={onEnterCinemaMode}
          className="absolute top-3 sm:top-4 right-3 sm:right-4 z-30 bg-black/80 hover:bg-black/95 text-white/95 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-full border border-white/25 text-[9.5px] sm:text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-lg transition-all active:scale-95"
          title={isCinemaMode ? "Mostrar Menú" : "Modo Panorámica (Ver mundo en pantalla completa)"}
        >
          <i className={`fas ${isCinemaMode ? "fa-eye-slash text-amber-400" : "fa-eye text-emerald-400"}`} />
          <span>{isCinemaMode ? "Cerrar Vista 3D" : "Ver Panorámica 3D"}</span>
        </button>
      )}

      {/* Gesture Hint for users when in Cinema Mode */}
      {isCinemaMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-black/80 px-4 py-2 rounded-full border border-white/15 text-white/85 font-mono text-xs uppercase tracking-wider flex items-center gap-2 animate-pulse">
          <i className="fas fa-hand-pointer text-emerald-400" />
          <span>Desliza para mirar alrededor • Toca el botón para volver</span>
        </div>
      )}
    </div>
  );
};
