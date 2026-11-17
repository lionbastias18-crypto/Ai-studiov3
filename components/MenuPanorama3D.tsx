import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BlockType } from "../types";
import { BLOCK_COLORS } from "../constants";

interface MenuPanorama3DProps {
  showLogo?: boolean;
  onEnterCinemaMode?: () => void;
  isCinemaMode?: boolean;
}

// Pre-allocated math objects to guarantee ZERO GC allocations during animation loop
const _vec3 = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

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
  depth = 0.9
): THREE.Group {
  const group = new THREE.Group();
  const charSpacing = 5.8;
  const totalWidth = text.length * charSpacing - 1;
  const startX = -(totalWidth * scale) / 2;

  const boxGeo = new THREE.BoxGeometry(scale * 0.96, scale * 0.96, scale * depth);
  const mainMat = new THREE.MeshLambertMaterial({ color: blockColor });
  const bevelMat = new THREE.MeshLambertMaterial({ color: bevelColor });

  // Merge characters into this group
  text.split("").forEach((char, charIdx) => {
    const grid = VOXEL_FONT[char.toUpperCase()];
    if (!grid) return;

    const charOffsetX = startX + charIdx * charSpacing * scale;

    for (let row = 0; row < grid.length; row++) {
      const line = grid[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "#") {
          // Main extruded voxel
          const posX = charOffsetX + col * scale;
          const posY = (grid.length - 1 - row) * scale;
          const posZ = 0;

          const mesh = new THREE.Mesh(boxGeo, mainMat);
          mesh.position.set(posX, posY, posZ);
          group.add(mesh);

          // Subtle dark drop-shadow voxel behind
          const shadowMesh = new THREE.Mesh(boxGeo, bevelMat);
          shadowMesh.position.set(posX + scale * 0.15, posY - scale * 0.15, posZ - scale * 0.4);
          shadowMesh.scale.set(0.95, 0.95, 0.95);
          group.add(shadowMesh);
        }
      }
    }
  });

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

    // Detect software WebGL to adapt pixel ratio and effects
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
        if (!gl) return true;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : (gl as WebGLRenderingContext).RENDERER;
        const gpu = String((gl as WebGLRenderingContext).getParameter(param));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#82bcf2"); // Minecraft day sky color
    scene.fog = new THREE.FogExp2("#82bcf2", 0.024);

    const width = Math.max(1, container.clientWidth || window.innerWidth || 360);
    const height = Math.max(1, container.clientHeight || window.innerHeight || 640);

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 200);
    camera.position.set(0, 11, 0);

    // 2. Renderer (wrapped cleanly so low-memory Android WebViews never crash to a black screen)
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: "high-performance",
        alpha: false
      });
    } catch (err) {
      console.warn("MenuPanorama3D WebGL unavailable, switching to scenic image fallback:", err);
      setWebglFailed(true);
      return;
    }
    setWebglFailed(false);
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

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

    // 5. Generate Circular Procedural Voxel Panorama Landscape
    const RADIUS = 28;
    const grassPositions: THREE.Vector3[] = [];
    const dirtPositions: THREE.Vector3[] = [];
    const stonePositions: THREE.Vector3[] = [];
    const logPositions: THREE.Vector3[] = [];
    const leavesPositions: THREE.Vector3[] = [];
    const cherryLeavesPositions: THREE.Vector3[] = [];

    // Terrain generator function
    const getTerrainH = (x: number, z: number) => {
      const dist = Math.sqrt(x * x + z * z);
      // Valley at center where camera sits, rolling hills around
      const hill1 = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 3.5;
      const hill2 = Math.sin((x + z) * 0.08) * 2.2;
      const river = Math.sin(x * 0.2 + z * 0.05) * 2;
      let baseH = 5 + hill1 + hill2;
      if (Math.abs(river) < 1.2 && dist > 4) {
        baseH -= 2.2; // River cutting through
      }
      return Math.round(baseH);
    };

    // Populate terrain columns
    for (let x = -RADIUS; x <= RADIUS; x++) {
      for (let z = -RADIUS; z <= RADIUS; z++) {
        const d = Math.sqrt(x * x + z * z);
        if (d > RADIUS) continue;

        const surfaceH = getTerrainH(x, z);

        // Grass at top
        grassPositions.push(new THREE.Vector3(x, surfaceH, z));

        // Dirt underneath
        for (let y = surfaceH - 1; y >= Math.max(0, surfaceH - 2); y--) {
          dirtPositions.push(new THREE.Vector3(x, y, z));
        }

        // Stone below dirt
        for (let y = surfaceH - 3; y >= Math.max(0, surfaceH - 4); y--) {
          stonePositions.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    // Tree generation function
    const addTree = (tx: number, tz: number, isCherry = false) => {
      const ty = getTerrainH(tx, tz) + 1;
      const trunkH = isCherry ? 5 : 4 + (Math.abs(tx * tz) % 2);

      // Trunk
      for (let y = 0; y < trunkH; y++) {
        logPositions.push(new THREE.Vector3(tx, ty + y, tz));
      }

      // Leaves canopy
      const leafList = isCherry ? cherryLeavesPositions : leavesPositions;
      for (let ly = -2; ly <= 1; ly++) {
        const rad = ly === 1 ? 1 : 2;
        for (let lx = -rad; lx <= rad; lx++) {
          for (let lz = -rad; lz <= rad; lz++) {
            if (Math.abs(lx) === rad && Math.abs(lz) === rad && Math.random() > 0.4) continue;
            leafList.push(new THREE.Vector3(tx + lx, ty + trunkH + ly, tz + lz));
          }
        }
      }
    };

    // Plant trees across the landscape
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

    // Create InstancedMeshes for optimal single-drawcall rendering
    const createInstancedMesh = (
      positions: THREE.Vector3[],
      material: THREE.Material | THREE.Material[]
    ) => {
      if (positions.length === 0) return null;
      const mesh = new THREE.InstancedMesh(boxGeo, material, positions.length);
      positions.forEach((pos, idx) => {
        _matrix.setPosition(pos);
        mesh.setMatrixAt(idx, _matrix);
      });
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
    const cloudPositions: THREE.Vector3[] = [];
    for (let cx = -35; cx <= 35; cx += 2) {
      for (let cz = -35; cz <= 35; cz += 2) {
        const cDist = Math.sqrt(cx * cx + cz * cz);
        if (cDist < 10 || cDist > 36) continue;
        if (Math.sin(cx * 0.18) * Math.cos(cz * 0.18) > 0.35) {
          cloudPositions.push(new THREE.Vector3(cx, 26, cz));
        }
      }
    }
    const cloudMesh = createInstancedMesh(cloudPositions, cloudMat);
    if (cloudMesh) scene.add(cloudMesh);

    // 8. 3D Voxel Logo Group
    const logoAnchorGroup = new THREE.Group();
    camera.add(logoAnchorGroup);
    scene.add(camera);

    // Setup 3D Logo (Only if showLogo is true)
    let logo3DGroup: THREE.Group | null = null;
    let rotatingGrassBlock: THREE.Mesh | null = null;
    let rotatingDiamondBlock: THREE.Mesh | null = null;

    if (showLogo) {
      logo3DGroup = new THREE.Group();

      // Top title: "ALPHA" (Minecraft stone/silver block style with dark bevel)
      const alphaTitle = createVoxelTextGroup("ALPHA", "#dcdcdc", "#3a3a3a", 0.13, 1.2);
      alphaTitle.position.set(0, 0.45, 0);
      logo3DGroup.add(alphaTitle);

      // Subtitle: "MOBILE" (Vibrant Emerald Green block style)
      const mobileSubtitle = createVoxelTextGroup("MOBILE", "#10b981", "#064e3b", 0.09, 1.0);
      mobileSubtitle.position.set(0, -0.4, 0);
      logo3DGroup.add(mobileSubtitle);

      // Rotating 3D Grass Block next to the logo
      const miniCubeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      rotatingGrassBlock = new THREE.Mesh(miniCubeGeo, grassMatMaterials);
      rotatingGrassBlock.position.set(-2.8, 0.35, 0);
      logo3DGroup.add(rotatingGrassBlock);

      // Rotating 3D Diamond Ore Block on the right side
      const diamondTex = createPixelTexture(BlockType.DIAMOND_ORE);
      const diamondMat = new THREE.MeshLambertMaterial({ map: diamondTex });
      rotatingDiamondBlock = new THREE.Mesh(miniCubeGeo, diamondMat);
      rotatingDiamondBlock.position.set(2.8, 0.35, 0);
      logo3DGroup.add(rotatingDiamondBlock);

      // Position in front of the camera (responsive to screen aspect ratio)
      const isMobileScreen = width < 640;
      const logoDist = isMobileScreen ? 4.5 : 4.0;
      const logoY = isMobileScreen ? 1.75 : 1.50;
      logo3DGroup.position.set(0, logoY, -logoDist);
      const baseScale = isMobileScreen ? 0.64 : 0.82;
      logo3DGroup.scale.set(baseScale, baseScale, baseScale);

      logoAnchorGroup.add(logo3DGroup);
    }

    // 9. Interactive Touch / Drag Controls (pan around panorama with touch!)
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let touchYawOffset = 0;
    let touchPitchOffset = 0;
    let targetTouchYaw = 0;
    let targetTouchPitch = 0;

    const onPointerDown = (e: PointerEvent) => {
      // Allow drag on background to pan panorama
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;

      targetTouchYaw += dx * 0.005;
      targetTouchPitch = Math.max(-0.4, Math.min(0.4, targetTouchPitch + dy * 0.003));
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // 10. Animation Loop (60 FPS, silky smooth, zero GC)
    let animationFrameId = 0;
    let clock = new THREE.Clock();
    let autoYaw = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = Math.min(clock.getDelta(), 0.1);
      const time = clock.getElapsedTime();

      // Cinematic gentle rotation (like Minecraft title screen)
      autoYaw += delta * 0.055;

      // Smooth damping for user swipe
      touchYawOffset = THREE.MathUtils.damp(touchYawOffset, targetTouchYaw, 4.0, delta);
      touchPitchOffset = THREE.MathUtils.damp(touchPitchOffset, targetTouchPitch, 4.0, delta);

      const currentYaw = autoYaw + touchYawOffset;
      const currentPitch = Math.sin(time * 0.35) * 0.06 + touchPitchOffset;

      // Compute camera target (slight downward pitch to reveal the rich landscape below while logo floats high)
      const lookDist = 20;
      const targetX = camera.position.x + Math.sin(currentYaw) * Math.cos(currentPitch) * lookDist;
      const targetY = camera.position.y + Math.sin(currentPitch) * lookDist - 1.1;
      const targetZ = camera.position.z + Math.cos(currentYaw) * Math.cos(currentPitch) * lookDist;

      camera.lookAt(targetX, targetY, targetZ);

      // Animate 3D Logo floating and block rotations
      if (logo3DGroup) {
        const isMobile = width < 640;
        const baseY = isMobile ? 1.75 : 1.50;
        logo3DGroup.position.y = baseY + Math.sin(time * 1.5) * 0.05;
        logo3DGroup.rotation.y = Math.sin(time * 0.8) * 0.05;
        logo3DGroup.rotation.x = Math.sin(time * 1.2) * 0.025;

        if (rotatingGrassBlock) {
          rotatingGrassBlock.rotation.x += delta * 0.9;
          rotatingGrassBlock.rotation.y += delta * 1.2;
        }
        if (rotatingDiamondBlock) {
          rotatingDiamondBlock.rotation.x -= delta * 0.8;
          rotatingDiamondBlock.rotation.y += delta * 1.1;
        }
      }

      // Drift clouds slowly
      if (cloudMesh) {
        cloudMesh.rotation.y = time * 0.008;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 11. Responsive Resize (with ResizeObserver for Android WebView & virtual orientation changes)
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

    // Cleanup resources cleanly when unmounting (Zero memory leaks)
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      try {
        renderer.forceContextLoss?.();
      } catch {}
      renderer.dispose();
      boxGeo.dispose();
      waterGeo.dispose();

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
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto select-none bg-gradient-to-b from-sky-900 via-slate-900 to-zinc-950">
      {/* Scenic fallback backdrop if Android WebView lacks WebGL */}
      {webglFailed && (
        <img
          src="./assets/aistudio/1794943627139_ac65a7dd.jpg"
          alt="Adventure Alpha Mobile"
          className="absolute inset-0 w-full h-full object-cover opacity-55 blur-[2px] scale-105 pointer-events-none"
        />
      )}

      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

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
          className="absolute top-4 right-4 z-30 bg-black/65 hover:bg-black/85 text-white/90 hover:text-white px-3 py-1.5 rounded-full border border-white/20 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all active:scale-95"
          title={isCinemaMode ? "Mostrar Menú" : "Modo Panorámica (Ver mundo en pantalla completa)"}
        >
          <i className={`fas ${isCinemaMode ? "fa-eye-slash text-amber-400" : "fa-eye text-emerald-400"}`} />
          <span>{isCinemaMode ? "Cerrar Vista 3D" : "Ver Panorámica 3D"}</span>
        </button>
      )}

      {/* Gesture Hint for users when in Cinema Mode */}
      {isCinemaMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white/80 font-mono text-xs uppercase tracking-wider flex items-center gap-2 animate-pulse">
          <i className="fas fa-hand-pointer text-emerald-400" />
          <span>Desliza para mirar alrededor • Toca el botón para volver</span>
        </div>
      )}
    </div>
  );
};
