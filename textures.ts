import * as THREE from 'three';
import { BlockType } from './types';
import { BLOCK_COLORS } from './constants';

const createProceduralTexture = (
  blockType: BlockType, 
  face: 'top' | 'side' | 'bottom'
): THREE.CanvasTexture | null => {
  if (blockType === BlockType.AIR) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const baseColor = BLOCK_COLORS[blockType] || '#ffffff';
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 16, 16);

  try {
    // Funciones de utilidad para manipular el color (oscurecer/aclarar)
    const hex2rgb = (hex: string) => {
      const v = parseInt(hex.replace('#', ''), 16);
      return [v >> 16 & 255, v >> 8 & 255, v & 255];
    };

    const drawNoise = (intensity: number, alpha: number = 0.1) => {
      try {
        const imgData = ctx.getImageData(0, 0, 16, 16);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const noise = (Math.random() - 0.5) * intensity;
          imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
          imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] + noise));
          imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (e) {
        // Fallback for tainted canvas
      }
    };

  // Generate Minecraft-like textures
  if (blockType === BlockType.GRASS) {
    if (face === 'top') {
      ctx.fillStyle = '#5c9e31'; // Verde más vivo
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(30);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#866043'; // Dirt
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
    } else { // side
      ctx.fillStyle = '#866043'; // Dirt
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
      
      // Añadir la textura de césped en la parte superior (con poco de ruido)
      ctx.fillStyle = '#5c9e31';
      for(let x=0; x<16; x++) {
        let depth = 3 + Math.floor(Math.random() * 3);
        if (Math.random() > 0.8) depth += 1;
        ctx.fillRect(x, 0, 1, depth);
      }
    }
  } else if (blockType === BlockType.LOG) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#b7935f';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#5e432c';
      ctx.lineWidth = 1;
      for(let r=2; r<8; r+=2) {
          ctx.beginPath();
          ctx.arc(8, 8, r, 0, Math.PI * 2);
          ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#4c3823'; // Bark
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(15);
      ctx.fillStyle = '#392817';
      for (let x = 0; x < 16; x += 2) {
        if (Math.random() > 0.3) ctx.fillRect(x, 0, 1, 16);
      }
    }
  } else if (blockType === BlockType.WOOD) {
    ctx.fillStyle = '#a47e54';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(15);
    ctx.fillStyle = '#85633e';
    for(let y=0; y<16; y+=4) {
      ctx.fillRect(0, y, 16, 1);
    }
    // Clavos
    ctx.fillStyle = '#4a3621';
    for(let y=0; y<16; y+=4) {
      if (Math.random() > 0.5) ctx.fillRect(2, y + 1, 1, 1);
      if (Math.random() > 0.5) ctx.fillRect(14, y + 2, 1, 1);
    }
  } else if (blockType === BlockType.DIRT) {
    ctx.fillStyle = '#866043';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(40);
  } else if (blockType === BlockType.STONE) {
    ctx.fillStyle = '#7d7d7d';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(35);
  } else if (blockType === BlockType.COAL_ORE || blockType === BlockType.IRON_ORE || blockType === BlockType.GOLD_ORE || blockType === BlockType.REDSTONE_ORE || blockType === BlockType.DIAMOND_ORE || blockType === BlockType.COPPER_ORE || blockType === BlockType.SULFUR) {
    // Stone base for all ores
    ctx.fillStyle = '#7d7d7d';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(35);
    
    // Speckles
    const oreColor = BLOCK_COLORS[blockType] || '#ffffff';
    ctx.fillStyle = oreColor;
    
    // Consistent spots using custom simple hash
    const seed = blockType;
    for (let i = 0; i < 9; i++) {
      const pseudoVal1 = Math.abs(Math.sin(seed + i * 1.7));
      const pseudoVal2 = Math.abs(Math.cos(seed + i * 2.9));
      const x = Math.floor(pseudoVal1 * 12) + 2;
      const y = Math.floor(pseudoVal2 * 12) + 2;
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  } else if (blockType === BlockType.BEDROCK) {
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(90);
  } else if (blockType === BlockType.SAND) {
    ctx.fillStyle = '#dbd3a2';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(25);
  } else if (blockType === BlockType.LEAVES) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#3a6b24';
    ctx.fillRect(0, 0, 16, 16);
    for(let i=0; i<40; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#2d541c' : '#4d8a2f';
        ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
    }
  } else if (blockType === BlockType.MUSHROOM_RED || blockType === BlockType.MUSHROOM_BROWN) {
    ctx.clearRect(0, 0, 16, 16);
    const capColor = blockType === BlockType.MUSHROOM_RED ? '#ef5350' : '#8d6e63';
    const spotColor = blockType === BlockType.MUSHROOM_RED ? '#ffffff' : '#d7ccc8';
    const stalkColor = '#f5f5f5';

    if (face === 'top') {
      ctx.fillStyle = capColor;
      ctx.fillRect(3, 3, 10, 10);
      ctx.fillRect(4, 2, 8, 12);
      ctx.fillRect(2, 4, 12, 8);
      ctx.fillStyle = spotColor;
      ctx.fillRect(4, 4, 2, 2);
      ctx.fillRect(10, 5, 2, 2);
      ctx.fillRect(5, 9, 2, 2);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#d7ccc8';
      ctx.fillRect(6, 6, 4, 4);
    } else {
      ctx.fillStyle = stalkColor;
      ctx.fillRect(6, 10, 4, 6);
      ctx.fillStyle = capColor;
      ctx.fillRect(6, 4, 4, 1);
      ctx.fillRect(5, 5, 6, 1);
      ctx.fillRect(4, 6, 8, 1);
      ctx.fillRect(3, 7, 10, 1);
      ctx.fillRect(3, 8, 10, 1);
      ctx.fillRect(4, 9, 8, 1);
      ctx.fillStyle = spotColor;
      ctx.fillRect(5, 6, 1, 1);
      ctx.fillRect(9, 6, 1, 1);
      ctx.fillRect(4, 8, 1, 1);
      ctx.fillRect(7, 7, 1, 1);
      ctx.fillRect(11, 8, 1, 1);
    }
  } else if (blockType === BlockType.FLOWER_RED || blockType === BlockType.FLOWER_YELLOW) {
    ctx.clearRect(0, 0, 16, 16);
    const petalColor = blockType === BlockType.FLOWER_RED ? '#ff3b30' : '#ffcc00';
    const centerColor = blockType === BlockType.FLOWER_RED ? '#ffcc00' : '#ff9500';
    const stemColor = '#34c759';

    if (face === 'top') {
      ctx.fillStyle = petalColor;
      ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = centerColor;
      ctx.fillRect(7, 7, 2, 2);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#228b22';
      ctx.fillRect(6, 6, 4, 4);
    } else {
      // Side texture of flower
      ctx.fillStyle = stemColor;
      ctx.fillRect(7, 8, 2, 8); // main stem
      ctx.fillRect(5, 10, 2, 1); // left leaf
      ctx.fillRect(9, 12, 2, 1); // right leaf

      // Petals bloom
      ctx.fillStyle = petalColor;
      ctx.fillRect(5, 4, 6, 4); // main head
      ctx.fillRect(4, 5, 8, 2); // wider
      
      // Center of flower
      ctx.fillStyle = centerColor;
      ctx.fillRect(7, 5, 2, 2);
    }
  } else if (blockType === BlockType.CACTUS) {
    if (face === 'top') {
      ctx.fillStyle = '#0f6a1e';
      ctx.fillRect(0, 0, 16, 16);
      // Outer ribbed rim
      ctx.fillStyle = '#0a4a14';
      for (let i = 0; i < 16; i += 4) {
        ctx.fillRect(i, 0, 1, 16);
        ctx.fillRect(0, i, 16, 1);
      }
      // Lighter green crown core
      ctx.fillStyle = '#4e9c38';
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = '#6ec24f';
      ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#2d7524';
      ctx.fillRect(6, 7, 4, 2);
      ctx.fillRect(7, 6, 2, 4);
      // Corner highlight dots
      ctx.fillStyle = '#d9ecc7';
      ctx.fillRect(1, 1, 1, 1);
      ctx.fillRect(14, 1, 1, 1);
      ctx.fillRect(1, 14, 1, 1);
      ctx.fillRect(14, 14, 1, 1);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#2e6b24';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#124e19';
      ctx.fillRect(0, 0, 16, 2);
      ctx.fillRect(0, 14, 16, 2);
      ctx.fillRect(0, 0, 2, 16);
      ctx.fillRect(14, 0, 2, 16);
      ctx.fillStyle = '#538e3a';
      ctx.fillRect(4, 4, 8, 8);
    } else {
      // Crisp fluted vertical cactus ribs (deterministic pixel art)
      ctx.fillStyle = '#0f611c';
      ctx.fillRect(0, 0, 16, 16);
      for (let x = 0; x < 16; x++) {
        const mod = x % 4;
        if (mod === 0) ctx.fillStyle = '#093f11';
        else if (mod === 1) ctx.fillStyle = '#147a25';
        else if (mod === 2) ctx.fillStyle = '#249433';
        else ctx.fillStyle = '#10661e';
        ctx.fillRect(x, 0, 1, 16);
      }
      // Deterministic cream spines with dark roots
      const spines: Array<[number, number]> = [
        [2, 2], [10, 1], [6, 5], [14, 4],
        [2, 9], [10, 8], [6, 12], [14, 11],
        [2, 14], [10, 14]
      ];
      for (const [sx, sy] of spines) {
        ctx.fillStyle = '#072d0c';
        ctx.fillRect(sx, sy, 1, 1);
        ctx.fillStyle = '#e7f0c9';
        ctx.fillRect(Math.max(0, sx - 1), sy, 1, 1);
        ctx.fillRect(sx, Math.max(0, sy - 1), 1, 1);
      }
    }
  } else if (blockType === BlockType.LAVA) {
    ctx.fillStyle = '#ff4500';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(30);
    ctx.fillStyle = '#ffaa00';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), Math.floor(Math.random() * 4 + 1), 1);
    }
  } else if (blockType === BlockType.OBSIDIAN) {
    ctx.fillStyle = '#150d1e';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(25);
    ctx.fillStyle = '#30184a';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 2, 2);
    }
  } else if (blockType === BlockType.TORCH) {
    // Full-canvas opaque face textures tailored to the 0.16x0.68x0.16 torch box
    if (face === 'top') {
      // Glowing ember/flame tip viewed from above
      ctx.fillStyle = '#e65100';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#ff9100';
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(5, 5, 6, 6);
    } else if (face === 'bottom') {
      // Solid wooden stick base
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#472b16';
      ctx.fillRect(2, 2, 4, 12);
      ctx.fillRect(10, 0, 3, 16);
      ctx.fillStyle = '#754c29';
      ctx.fillRect(6, 0, 4, 16);
    } else {
      // Side face: blazing flame crown (y=0..4), charcoal band (y=4..6), wood-grain handle (y=6..16)
      // Flame crown
      ctx.fillStyle = '#ff6d00';
      ctx.fillRect(0, 0, 16, 4);
      ctx.fillStyle = '#ffab00';
      ctx.fillRect(2, 0, 12, 4);
      ctx.fillStyle = '#ffe082';
      ctx.fillRect(4, 0, 8, 3);
      ctx.fillStyle = '#fffde7';
      ctx.fillRect(5, 1, 6, 2);
      // Glowing ember/charcoal collar
      ctx.fillStyle = '#2b1b12';
      ctx.fillRect(0, 4, 16, 2);
      ctx.fillStyle = '#ff7043';
      ctx.fillRect(3, 4, 3, 1);
      ctx.fillRect(10, 4, 4, 1);
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(0, 5, 16, 1);
      // Wood-grain stick shaft across full UV width
      ctx.fillStyle = '#6d4423';
      ctx.fillRect(0, 6, 16, 10);
      ctx.fillStyle = '#86562e';
      ctx.fillRect(3, 6, 4, 10);
      ctx.fillRect(11, 6, 3, 10);
      ctx.fillStyle = '#4f3016';
      ctx.fillRect(0, 6, 2, 10);
      ctx.fillRect(8, 6, 2, 10);
      ctx.fillRect(14, 6, 2, 10);
      // Subtle horizontal plank joints for pixel crispness
      ctx.fillStyle = '#3d2410';
      ctx.fillRect(0, 10, 4, 1);
      ctx.fillRect(9, 13, 5, 1);
    }
  } else if (blockType === BlockType.DOOR) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#7a4d28';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#5c381b';
      ctx.fillRect(0, 0, 16, 2);
      ctx.fillRect(0, 14, 16, 2);
      ctx.fillRect(0, 0, 2, 16);
      ctx.fillRect(14, 0, 2, 16);
    } else {
      canvas.width = 16;
      canvas.height = 32;
      ctx.clearRect(0, 0, 16, 32);

      // Base oak wood
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(0, 0, 16, 32);

      // Vertical plank variation & highlights
      ctx.fillStyle = '#9c6836';
      ctx.fillRect(2, 1, 3, 30);
      ctx.fillRect(7, 1, 2, 30);
      ctx.fillRect(11, 1, 3, 30);
      ctx.fillStyle = '#734820';
      ctx.fillRect(5, 1, 1, 30);
      ctx.fillRect(10, 1, 1, 30);

      // Outer dark oak bevel frame
      ctx.fillStyle = '#4e2f16';
      ctx.fillRect(0, 0, 16, 1);
      ctx.fillRect(0, 31, 16, 1);
      ctx.fillRect(0, 0, 1, 32);
      ctx.fillRect(15, 0, 1, 32);

      // Upper window recess frame + 4 real alphaTest transparent window panes
      ctx.fillStyle = '#5a361a';
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = '#6c4221';
      ctx.fillRect(3, 3, 10, 10);
      // Center oak mullions stay solid, 4 glass panes punched cleanly via clearRect
      ctx.clearRect(3, 3, 4, 4);
      ctx.clearRect(9, 3, 4, 4);
      ctx.clearRect(3, 9, 4, 4);
      ctx.clearRect(9, 9, 4, 4);

      // Subtle crossbar shadow + middle rail
      ctx.fillStyle = '#5a361a';
      ctx.fillRect(2, 14, 12, 2);

      // Lower carved recessed panel
      ctx.fillStyle = '#5a361a';
      ctx.fillRect(3, 17, 10, 12);
      ctx.fillStyle = '#744822';
      ctx.fillRect(4, 18, 8, 10);
      ctx.fillStyle = '#633c1b';
      ctx.fillRect(5, 19, 6, 8);

      // Iron hinges (left side)
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(0, 5, 2, 3);
      ctx.fillRect(0, 23, 2, 3);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(1, 6, 1, 1);
      ctx.fillRect(1, 24, 1, 1);

      // Brass door plate & handle (right side)
      ctx.fillStyle = '#78350f';
      ctx.fillRect(12, 14, 2, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(11, 15, 3, 1);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(13, 16, 1, 1);
    }
  } else if (blockType === BlockType.BED) {
    if (face === 'top') {
      ctx.fillStyle = '#e53935'; 
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#ffffff'; 
      ctx.fillRect(2, 2, 12, 4);
      drawNoise(10);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#8d6e63'; 
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(10);
    } else {
      ctx.fillStyle = '#e53935'; 
      ctx.fillRect(0, 0, 16, 8);
      ctx.fillStyle = '#8d6e63'; 
      ctx.fillRect(0, 8, 16, 8);
      ctx.fillStyle = '#3e2723'; 
      ctx.fillRect(1, 10, 2, 6);
      ctx.fillRect(13, 10, 2, 6);
      drawNoise(10);
    }
  } else if (blockType === BlockType.CRAFTING_TABLE) {
    if (face === 'top') {
      ctx.fillStyle = '#b37c4d'; // Wood background
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#4e3315'; // Dark grid borders
      ctx.fillRect(0, 0, 16, 1);
      ctx.fillRect(0, 0, 1, 16);
      ctx.fillRect(15, 0, 1, 16);
      ctx.fillRect(0, 15, 16, 1);
      // Let's draw a nice checker tool grid
      ctx.fillRect(5, 0, 1, 16);
      ctx.fillRect(10, 0, 1, 16);
      ctx.fillRect(0, 5, 16, 1);
      ctx.fillRect(0, 10, 16, 1);
      drawNoise(15);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#5c3a21'; // plain wood bottom
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(15);
    } else {
      // Crafting Table Side
      ctx.fillStyle = '#ab7d4d'; // Wood base
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#5c3a21'; // planks lines
      ctx.fillRect(0, 0, 16, 2);
      ctx.fillRect(0, 14, 16, 2);
      // Side details: tools
      ctx.fillStyle = '#cccccc'; // iron mallet
      ctx.fillRect(3, 4, 3, 2);
      ctx.fillRect(4, 3, 1, 4);
      ctx.fillStyle = '#3a2211'; // tool handle
      ctx.fillRect(3, 7, 1, 3);
      ctx.fillRect(12, 4, 1, 6); // another tool handle
      ctx.fillStyle = '#df5522'; // saw top
      ctx.fillRect(10, 3, 4, 2);
      drawNoise(15);
    }
  } else if (blockType === BlockType.COPPER_BLOCK || blockType === BlockType.OXIDIZED_COPPER) {
    const isOxidized = blockType === BlockType.OXIDIZED_COPPER;
    const baseColor = isOxidized ? '#4fa493' : '#ca6a3f';
    const darkEdge = isOxidized ? '#387c70' : '#a8512c';
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(25);
    // Draw bevel borders
    ctx.fillStyle = darkEdge;
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillRect(0, 15, 16, 1);
    // Draw rivets
    ctx.fillStyle = isOxidized ? '#31695f' : '#883b1d';
    ctx.fillRect(2, 2, 2, 2);
    ctx.fillRect(12, 2, 2, 2);
    ctx.fillRect(2, 12, 2, 2);
    ctx.fillRect(12, 12, 2, 2);
  } else if (
    blockType === BlockType.SWORD || blockType === BlockType.WOOD_SWORD || blockType === BlockType.STONE_SWORD || blockType === BlockType.GOLD_SWORD || blockType === BlockType.DIAMOND_SWORD ||
    blockType === BlockType.PICKAXE || blockType === BlockType.WOOD_PICKAXE || blockType === BlockType.IRON_PICKAXE || blockType === BlockType.GOLD_PICKAXE || blockType === BlockType.DIAMOND_PICKAXE ||
    blockType === BlockType.AXE || blockType === BlockType.STONE_AXE || blockType === BlockType.IRON_AXE || blockType === BlockType.GOLD_AXE || blockType === BlockType.DIAMOND_AXE ||
    blockType === BlockType.SHOVEL || blockType === BlockType.WOOD_SHOVEL || blockType === BlockType.IRON_SHOVEL || blockType === BlockType.GOLD_SHOVEL || blockType === BlockType.DIAMOND_SHOVEL
  ) {
    ctx.clearRect(0, 0, 16, 16);
    const getPalette = () => {
      if (blockType === BlockType.WOOD_SWORD || blockType === BlockType.WOOD_PICKAXE || blockType === BlockType.AXE || blockType === BlockType.WOOD_SHOVEL) {
        return { main: '#b6895b', hi: '#d6aa79', dark: '#7c5531' };
      }
      if (blockType === BlockType.STONE_SWORD || blockType === BlockType.PICKAXE || blockType === BlockType.STONE_AXE || blockType === BlockType.SHOVEL) {
        return { main: '#94a3b8', hi: '#cbd5e1', dark: '#475569' };
      }
      if (blockType === BlockType.GOLD_SWORD || blockType === BlockType.GOLD_PICKAXE || blockType === BlockType.GOLD_AXE || blockType === BlockType.GOLD_SHOVEL) {
        return { main: '#facc15', hi: '#fef08a', dark: '#ca8a04' };
      }
      if (blockType === BlockType.DIAMOND_SWORD || blockType === BlockType.DIAMOND_PICKAXE || blockType === BlockType.DIAMOND_AXE || blockType === BlockType.DIAMOND_SHOVEL) {
        return { main: '#22d3ee', hi: '#a5f3fc', dark: '#0284c7' };
      }
      return { main: '#e2e8f0', hi: '#ffffff', dark: '#64748b' };
    };
    const pal = getPalette();
    const isSword = blockType === BlockType.SWORD || blockType === BlockType.WOOD_SWORD || blockType === BlockType.STONE_SWORD || blockType === BlockType.GOLD_SWORD || blockType === BlockType.DIAMOND_SWORD;
    const isPick = blockType === BlockType.PICKAXE || blockType === BlockType.WOOD_PICKAXE || blockType === BlockType.IRON_PICKAXE || blockType === BlockType.GOLD_PICKAXE || blockType === BlockType.DIAMOND_PICKAXE;
    const isAxe = blockType === BlockType.AXE || blockType === BlockType.STONE_AXE || blockType === BlockType.IRON_AXE || blockType === BlockType.GOLD_AXE || blockType === BlockType.DIAMOND_AXE;

    if (isSword) {
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(7, 12, 2, 4);
      ctx.fillStyle = pal.dark;
      ctx.fillRect(4, 11, 8, 1);
      ctx.fillStyle = pal.main;
      ctx.fillRect(7, 2, 2, 9);
      ctx.fillStyle = pal.hi;
      ctx.fillRect(7, 2, 1, 9);
    } else if (isPick) {
      ctx.fillStyle = '#6a4423';
      ctx.fillRect(7, 5, 2, 11);
      ctx.fillStyle = pal.main;
      ctx.fillRect(4, 2, 8, 2);
      ctx.fillStyle = pal.dark;
      ctx.fillRect(2, 3, 2, 3);
      ctx.fillRect(12, 3, 2, 3);
      ctx.fillStyle = pal.hi;
      ctx.fillRect(5, 2, 6, 1);
    } else if (isAxe) {
      ctx.fillStyle = '#6a4423';
      ctx.fillRect(7, 4, 2, 12);
      ctx.fillStyle = pal.main;
      ctx.fillRect(3, 2, 5, 4);
      ctx.fillRect(2, 3, 2, 3);
      ctx.fillStyle = pal.hi;
      ctx.fillRect(2, 3, 1, 3);
    } else {
      ctx.fillStyle = '#6a4423';
      ctx.fillRect(7, 6, 2, 10);
      ctx.fillStyle = pal.main;
      ctx.fillRect(5, 2, 6, 4);
      ctx.fillStyle = pal.hi;
      ctx.fillRect(6, 2, 2, 3);
    }
  } else if (blockType === BlockType.JUKEBOX) {
    if (face === 'top') {
      // Wood top base
      ctx.fillStyle = '#513725';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(10);
      
      // Brass corner screws
      ctx.fillStyle = '#caaa33';
      ctx.fillRect(1, 1, 1, 1);
      ctx.fillRect(14, 1, 1, 1);
      ctx.fillRect(1, 14, 1, 1);
      ctx.fillRect(14, 14, 1, 1);
      
      // Dark turntable circle
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.arc(8, 8, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Needle arm
      ctx.fillStyle = '#9e9e9e';
      ctx.fillRect(4, 4, 2, 1);
      ctx.fillRect(5, 5, 1, 3);
      
      // Center neon/turquoise core
      ctx.fillStyle = '#00ffd2';
      ctx.fillRect(8, 8, 1, 1);
    } else { // side and bottom
      // Dark wood paneling with stripes/border
      ctx.fillStyle = '#412c1e';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(12);
      
      // Outer border
      ctx.fillStyle = '#2c1e14';
      ctx.strokeRect(1, 1, 14, 14);
      
      // Inner speaker design
      ctx.fillStyle = '#1e140d';
      ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#2c1e14';
      ctx.fillRect(5, 5, 6, 6);
    }
  } else if (
    blockType === BlockType.MUSIC_DISC_CAT ||
    blockType === BlockType.MUSIC_DISC_CHIRP ||
    blockType === BlockType.MUSIC_DISC_BLOCKS ||
    blockType === BlockType.MUSIC_DISC_MELLOHI
  ) {
    ctx.clearRect(0, 0, 16, 16);
    // Draw vinyl record disc item
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(8, 8, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Grooves
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(8, 8, 4, 0, Math.PI * 2);
    ctx.stroke();
    
    // Center label color corresponding to the disc type
    let labelColor = '#ffffff';
    if (blockType === BlockType.MUSIC_DISC_CAT) labelColor = '#00ffcc';
    else if (blockType === BlockType.MUSIC_DISC_CHIRP) labelColor = '#ff3366';
    else if (blockType === BlockType.MUSIC_DISC_BLOCKS) labelColor = '#ffcc00';
    else if (blockType === BlockType.MUSIC_DISC_MELLOHI) labelColor = '#aa33ff';
    
    ctx.fillStyle = labelColor;
    ctx.beginPath();
    ctx.arc(8, 8, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Hole
    ctx.fillStyle = '#000000';
    ctx.fillRect(7, 7, 2, 2);
  } else if (blockType === BlockType.SNOW) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(15);
    ctx.fillStyle = '#f0f4f8';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
    }
  } else if (blockType === BlockType.AUTUMN_GRASS) {
    if (face === 'top') {
      ctx.fillStyle = '#b05f20';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(30);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#866043';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
    } else {
      ctx.fillStyle = '#866043';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
      ctx.fillStyle = '#b05f20';
      for(let x=0; x<16; x++) {
        let depth = 3 + Math.floor(Math.random() * 3);
        if (Math.random() > 0.8) depth += 1;
        ctx.fillRect(x, 0, 1, depth);
      }
    }
  } else if (blockType === BlockType.AUTUMN_LEAVES) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#d35400';
    ctx.fillRect(0, 0, 16, 16);
    for(let i=0; i<40; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#e67e22' : '#ba4a00';
        ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
    }
  } else if (blockType === BlockType.GREY_LOG) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#bfbfbf';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#737373';
      ctx.lineWidth = 1;
      for(let r=2; r<8; r+=2) {
          ctx.beginPath();
          ctx.arc(8, 8, r, 0, Math.PI * 2);
          ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#828282';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(15);
      ctx.fillStyle = '#595959';
      for (let x = 0; x < 16; x += 2) {
        if (Math.random() > 0.3) ctx.fillRect(x, 0, 1, 16);
      }
    }
  } else if (blockType === BlockType.GREY_WOOD) {
    ctx.fillStyle = '#a6a6a6';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(15);
    ctx.fillStyle = '#737373';
    for(let y=0; y<16; y+=4) {
      ctx.fillRect(0, y, 16, 1);
    }
    ctx.fillStyle = '#545454';
    for(let y=0; y<16; y+=4) {
      if (Math.random() > 0.5) ctx.fillRect(2, y + 1, 1, 1);
      if (Math.random() > 0.5) ctx.fillRect(14, y + 2, 1, 1);
    }
  } else if (blockType === BlockType.AUTUMN_FLOWER) {
    ctx.clearRect(0, 0, 16, 16);
    const petalColor = '#e67e22';
    const centerColor = '#f1c40f';
    const stemColor = '#7e5109';
    if (face === 'top') {
      ctx.fillStyle = petalColor;
      ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = centerColor;
      ctx.fillRect(7, 7, 2, 2);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#512e08';
      ctx.fillRect(6, 6, 4, 4);
    } else {
      ctx.fillStyle = stemColor;
      ctx.fillRect(7, 8, 2, 8);
      ctx.fillStyle = petalColor;
      ctx.fillRect(5, 5, 6, 3);
      ctx.fillStyle = centerColor;
      ctx.fillRect(7, 6, 2, 1);
    }
  } else if (blockType === BlockType.NETHERRACK) {
    ctx.fillStyle = '#5c1d1d';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(65);
    ctx.fillStyle = '#421414';
    for (let i = 0; i < 15; i++) {
      ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 1);
    }
  } else if (blockType === BlockType.SOUL_SAND) {
    ctx.fillStyle = '#4c392f';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(30);
    ctx.fillStyle = '#2d221c';
    for (let s = 0; s < 2; s++) {
      const sx = s * 7 + 3;
      const sy = 4 + Math.floor(Math.random() * 4);
      ctx.fillRect(sx, sy, 3, 3);
      ctx.fillRect(sx + 1, sy - 1, 1, 1);
    }
  } else if (blockType === BlockType.GLOWSTONE) {
    ctx.fillStyle = '#e8a834';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(45);
    ctx.fillStyle = '#fce49d';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    }
    ctx.fillStyle = '#b5791c';
    for(let i=0; i<16; i+=4) {
      ctx.fillRect(i, 0, 1, 16);
      ctx.fillRect(0, i, 16, 1);
    }
  } else if (blockType === BlockType.NETHER_QUARTZ_ORE) {
    ctx.fillStyle = '#5c1d1d';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(55);
    ctx.fillStyle = '#eae3db';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(Math.floor(Math.random()*14) + 1, Math.floor(Math.random()*14) + 1, 2, 1);
    }
  } else if (blockType === BlockType.NETHER_BRICKS) {
    ctx.fillStyle = '#2c1115';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(20);
    ctx.fillStyle = '#140608';
    for (let y = 0; y < 16; y += 4) {
      ctx.fillRect(0, y, 16, 1);
      for (let x = (y % 8 === 0 ? 0 : 4); x < 16; x += 8) {
        ctx.fillRect(x, y, 1, 4);
      }
    }
  } else if (blockType === BlockType.CRIMSON_NYLIUM) {
    if (face === 'top') {
      ctx.fillStyle = '#a01c2c';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(35);
      ctx.fillStyle = '#5c0f1b';
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
      }
    } else if (face === 'bottom') {
      ctx.fillStyle = '#5c1d1d';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(55);
    } else {
      ctx.fillStyle = '#5c1d1d';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(55);
      ctx.fillStyle = '#a01c2c';
      for(let x=0; x<16; x++) {
        let depth = 2 + Math.floor(Math.random() * 3);
        ctx.fillRect(x, 0, 1, depth);
      }
    }
  } else if (blockType === BlockType.WARPED_NYLIUM) {
    if (face === 'top') {
      ctx.fillStyle = '#158585';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(35);
      ctx.fillStyle = '#0a4242';
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
      }
    } else if (face === 'bottom') {
      ctx.fillStyle = '#5c1d1d';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(55);
    } else {
      ctx.fillStyle = '#5c1d1d';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(55);
      ctx.fillStyle = '#158585';
      for(let x=0; x<16; x++) {
        let depth = 2 + Math.floor(Math.random() * 3);
        ctx.fillRect(x, 0, 1, depth);
      }
    }
  } else if (blockType === BlockType.PORTAL) {
    ctx.fillStyle = '#4c1766';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(50);
    ctx.fillStyle = '#aa33ff';
    for (let i = 0; i < 15; i++) {
      ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    }
  } else if (blockType === BlockType.MOSS) {
    ctx.fillStyle = '#456a21';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(25);
    ctx.fillStyle = '#2d4c12';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(Math.floor(Math.random() * 14), Math.floor(Math.random() * 14), 2, 2);
    }
  } else if (blockType === BlockType.VINES) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#2e5a1c';
    for (let i = 0; i < 4; i++) {
      const startX = 3 + i * 4 + Math.floor(Math.random() * 2);
      ctx.fillRect(startX, 0, 1, 16);
      for (let y = 0; y < 16; y += 3) {
        if (Math.random() > 0.3) {
          ctx.fillRect(startX - 1, y, 1, 1);
        }
        if (Math.random() > 0.3) {
          ctx.fillRect(startX + 1, y + 1, 1, 1);
        }
      }
    }
  } else if (blockType === BlockType.CUSHION) {
    ctx.fillStyle = '#e57373';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(20);
    // Draw cross stitching
    ctx.fillStyle = '#ffcdd2';
    ctx.fillRect(7, 3, 2, 10);
    ctx.fillRect(3, 7, 10, 2);
  } else if (blockType === BlockType.WOOL || blockType === BlockType.WOOL_STAIRS) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(30);
    // Draw wool curls pattern
    ctx.fillStyle = '#e0e0e0';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(Math.floor(Math.random()*14), Math.floor(Math.random()*14), 2, 2);
    }
  } else if (blockType === BlockType.CONCRETE || blockType === BlockType.CONCRETE_STAIRS) {
    ctx.fillStyle = '#90a4ae';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(8); // Concrete is very smooth
  } else if (blockType === BlockType.GRAVEL) {
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(30);
    ctx.fillStyle = '#78909c';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect(Math.floor(Math.random()*14), Math.floor(Math.random()*14), 2, 1);
    }
  } else if (blockType === BlockType.FIRE) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#ff5722';
    ctx.fillRect(1, 4, 14, 12);
    ctx.fillStyle = '#ff9800';
    ctx.fillRect(3, 6, 10, 10);
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(6, 9, 4, 7);
  } else if (blockType === BlockType.SUGAR_CANE) {
    ctx.clearRect(0, 0, 16, 16);
    if (face === 'top' || face === 'bottom') {
      // Top/Bottom cut bamboo-green stalk cross section (avoids void top face glitch)
      ctx.fillStyle = '#4e912a';
      ctx.fillRect(3, 3, 10, 10);
      ctx.fillStyle = '#78bf42';
      ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#b4e384';
      ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = '#92d159';
      ctx.fillRect(7, 7, 2, 2);
    } else {
      // Crisp double-stalk sugar cane with shaded ribs, nodes, and crisp leaves
      const drawStalk = (sx: number, w: number) => {
        ctx.fillStyle = '#6db83a';
        ctx.fillRect(sx, 0, w, 16);
        ctx.fillStyle = '#9de05c';
        ctx.fillRect(sx, 0, 1, 16);
        ctx.fillStyle = '#448224';
        ctx.fillRect(sx + w - 1, 0, 1, 16);
        // Segmented nodes
        ctx.fillStyle = '#336619';
        ctx.fillRect(sx, 3, w, 1);
        ctx.fillRect(sx, 9, w, 1);
        ctx.fillRect(sx, 14, w, 1);
        ctx.fillStyle = '#b5e878';
        ctx.fillRect(sx + 1, 4, Math.max(1, w - 2), 1);
        ctx.fillRect(sx + 1, 10, Math.max(1, w - 2), 1);
      };
      drawStalk(2, 5);
      drawStalk(9, 5);
      // Small diagonal leaves for crisp silhouette
      ctx.fillStyle = '#5da632';
      ctx.fillRect(0, 4, 2, 2);
      ctx.fillRect(7, 2, 2, 2);
      ctx.fillRect(14, 7, 2, 2);
      ctx.fillRect(7, 11, 2, 2);
    }
  } else if (blockType === BlockType.BAMBOO) {
    ctx.clearRect(0, 0, 16, 16);
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#4e912a';
      ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = '#92d159';
      ctx.fillRect(6, 6, 4, 4);
    } else {
      ctx.fillStyle = '#5cb83d';
      ctx.fillRect(5, 0, 6, 16);
      ctx.fillStyle = '#8ee068';
      ctx.fillRect(6, 0, 2, 16);
      ctx.fillStyle = '#3d8225';
      ctx.fillRect(5, 5, 6, 1);
      ctx.fillRect(5, 11, 6, 1);
      ctx.fillStyle = '#6ec94b';
      ctx.fillRect(3, 6, 2, 2);
      ctx.fillRect(11, 2, 2, 2);
    }
  } else if (blockType === BlockType.CHEST) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#78350f';
      ctx.strokeRect(1, 1, 14, 14);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#78350f';
      ctx.strokeRect(1, 1, 14, 14);
      // Draw latch
      ctx.fillStyle = '#d1d5db';
      ctx.fillRect(7, 6, 2, 4);
    }
  } else if (blockType === BlockType.FROG_EGGS) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#a1e3b6';
    for (let i = 0; i < 4; i++) {
      const ex = 4 + (i % 2) * 6;
      const ey = 4 + Math.floor(i / 2) * 6;
      ctx.fillStyle = 'rgba(161,227,182,0.6)';
      ctx.fillRect(ex - 1, ey - 1, 4, 4);
      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(ex, ey, 2, 2);
    }
  } else if (blockType === BlockType.CHERRY_LOG) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#ffe0b2';
      ctx.fillRect(0, 0, 16, 16);
      ctx.strokeStyle = '#f48fb1';
      ctx.strokeRect(3, 3, 10, 10);
    } else {
      ctx.fillStyle = '#f48fb1';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(15);
    }
  } else if (blockType === BlockType.CHERRY_LEAVES) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#ff80ab';
    ctx.fillRect(0, 0, 16, 16);
    for(let i=0; i<30; i++) {
      ctx.fillStyle = '#ff4081';
      ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
    }
  } else if (blockType === BlockType.CHERRY_WOOD) {
    ctx.fillStyle = '#ffccd5';
    ctx.fillRect(0, 0, 16, 16);
    drawNoise(10);
    ctx.fillStyle = '#ff80ab';
    ctx.fillRect(0, 4, 16, 1);
    ctx.fillRect(0, 10, 16, 1);
  } else if (blockType === BlockType.DARK_LOG) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(0, 0, 16, 16);
      ctx.strokeStyle = '#3e2723';
      ctx.strokeRect(3, 3, 10, 10);
    } else {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(15);
    }
  } else if (blockType === BlockType.DARK_LEAVES) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#1a237e';
    ctx.fillRect(0, 0, 16, 16);
    for(let i=0; i<30; i++) {
      ctx.fillStyle = '#0d47a1';
      ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
    }
  } else if (blockType === BlockType.DARK_GRASS) {
    if (face === 'top') {
      ctx.fillStyle = '#212121';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
    } else if (face === 'bottom') {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(45);
    } else {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(45);
      ctx.fillStyle = '#212121';
      for(let x=0; x<16; x++) {
        let depth = 3 + Math.floor(Math.random() * 3);
        ctx.fillRect(x, 0, 1, depth);
      }
    }
  } else if (blockType === BlockType.FURNACE) {
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
    } else if (face === 'side') { // Front face
      ctx.fillStyle = '#37474f';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#263238';
      ctx.fillRect(2, 2, 12, 12);
      // Furnace mouth / grate
      ctx.fillStyle = '#ff5722';
      ctx.fillRect(4, 8, 8, 4);
    } else {
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(40);
    }
  } else if (blockType === BlockType.CARTOGRAPHY_TABLE) {
    if (face === 'top') {
      ctx.fillStyle = '#d7ccc8';
      ctx.fillRect(0, 0, 16, 16);
      // Draw grid lines
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(4, 0, 1, 16);
      ctx.fillRect(10, 0, 1, 16);
      ctx.fillRect(0, 5, 16, 1);
      // Compass drawing on map
      ctx.fillStyle = '#e53935';
      ctx.fillRect(8, 8, 2, 2);
    } else {
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(15);
    }
  } else if (String(BlockType[blockType]).startsWith('TERRACOTTA')) {
    drawNoise(15);
  } else {
    // Otros bloques (ej. agua, flores)
    drawNoise(20);
  }
} catch (e) {}

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// Singleton cache para texturas y materiales para evitar regenerar
export const TextureCache = {
  materials: new Map<BlockType, THREE.Material | THREE.Material[]>(),

  getMaterial(blockType: BlockType): THREE.Material | THREE.Material[] | null {
    if (blockType === BlockType.AIR) return null;
    if (this.materials.has(blockType)) return this.materials.get(blockType)!;

    // Generar texturas
    const top = createProceduralTexture(blockType, 'top');
    const side = createProceduralTexture(blockType, 'side');
    const bottom = createProceduralTexture(blockType, 'bottom');

    if (!top || !side || !bottom) return null;

    let material: THREE.Material | THREE.Material[];

    const baseProps = { roughness: 1, metalness: 0 };

    if (blockType === BlockType.WATER) {
        material = new THREE.MeshLambertMaterial({
            color: '#3b5ed9', transparent: true, opacity: 0.7
        });
    } else if (blockType === BlockType.LAVA) {
        material = new THREE.MeshLambertMaterial({
            color: '#ff5500', emissive: '#992200', map: side
        });
    } else if (blockType === BlockType.OBSIDIAN) {
        material = new THREE.MeshLambertMaterial({
            color: '#15101a', map: side
        });
    } else if (blockType === BlockType.REDSTONE_ORE) {
        material = new THREE.MeshLambertMaterial({
            map: side, emissive: '#ff2200', emissiveIntensity: 0.3
        });
    } else if (blockType === BlockType.GLOWSTONE) {
        material = new THREE.MeshLambertMaterial({
            map: side, emissive: '#b58428', emissiveIntensity: 0.6
        });
    } else if (blockType === BlockType.PORTAL) {
        material = new THREE.MeshLambertMaterial({
            map: side, emissive: '#aa33ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.8
        });
    } else if (blockType === BlockType.DIAMOND_ORE) {
        material = new THREE.MeshLambertMaterial({
            map: side, emissive: '#4cebeb', emissiveIntensity: 0.1
        });
    } else if (blockType === BlockType.TORCH) {
        const torchSideMat = new THREE.MeshLambertMaterial({
            map: side, emissive: '#ff7b14', emissiveIntensity: 0.55
        });
        const torchTopMat = new THREE.MeshLambertMaterial({
            map: top, emissive: '#ffbe33', emissiveIntensity: 1.2
        });
        const torchBottomMat = new THREE.MeshLambertMaterial({
            map: bottom
        });
        material = [torchSideMat, torchSideMat, torchTopMat, torchBottomMat, torchSideMat, torchSideMat];
    } else if (blockType === BlockType.GRASS || blockType === BlockType.LOG || blockType === BlockType.CACTUS || 
               blockType === BlockType.MUSHROOM_RED || blockType === BlockType.MUSHROOM_BROWN || 
               blockType === BlockType.FLOWER_RED || blockType === BlockType.FLOWER_YELLOW ||
               blockType === BlockType.BED || blockType === BlockType.DOOR || blockType === BlockType.CRAFTING_TABLE ||
               blockType === BlockType.SWORD || blockType === BlockType.PICKAXE || blockType === BlockType.AXE || blockType === BlockType.SHOVEL ||
               blockType === BlockType.WOOD_SWORD || blockType === BlockType.WOOD_PICKAXE || blockType === BlockType.WOOD_SHOVEL ||
               blockType === BlockType.STONE_SWORD || blockType === BlockType.STONE_AXE ||
               blockType === BlockType.IRON_PICKAXE || blockType === BlockType.IRON_AXE || blockType === BlockType.IRON_SHOVEL ||
               blockType === BlockType.GOLD_SWORD || blockType === BlockType.GOLD_PICKAXE || blockType === BlockType.GOLD_AXE || blockType === BlockType.GOLD_SHOVEL ||
               blockType === BlockType.DIAMOND_SWORD || blockType === BlockType.DIAMOND_PICKAXE || blockType === BlockType.DIAMOND_AXE || blockType === BlockType.DIAMOND_SHOVEL ||
               blockType === BlockType.JUKEBOX || blockType === BlockType.MUSIC_DISC_CAT || blockType === BlockType.MUSIC_DISC_CHIRP ||
               blockType === BlockType.MUSIC_DISC_BLOCKS || blockType === BlockType.MUSIC_DISC_MELLOHI ||
               blockType === BlockType.AUTUMN_GRASS || blockType === BlockType.GREY_LOG || blockType === BlockType.AUTUMN_FLOWER ||
               blockType === BlockType.CRIMSON_NYLIUM || blockType === BlockType.WARPED_NYLIUM ||
               blockType === BlockType.VINES || blockType === BlockType.CUSHION || blockType === BlockType.CHEST ||
               blockType === BlockType.FURNACE || blockType === BlockType.CARTOGRAPHY_TABLE ||
               blockType === BlockType.CHERRY_LOG || blockType === BlockType.DARK_LOG || blockType === BlockType.DARK_GRASS ||
               blockType === BlockType.FIRE || blockType === BlockType.SUGAR_CANE || blockType === BlockType.BAMBOO ||
               blockType === BlockType.FROG_EGGS) {
        const isTransparentFlora = blockType === BlockType.MUSHROOM_RED || blockType === BlockType.MUSHROOM_BROWN || 
                                   blockType === BlockType.FLOWER_RED || blockType === BlockType.FLOWER_YELLOW || 
                                   blockType === BlockType.AUTUMN_FLOWER ||
                                   blockType === BlockType.DOOR ||
                                   blockType === BlockType.SWORD || blockType === BlockType.PICKAXE || blockType === BlockType.AXE || blockType === BlockType.SHOVEL ||
                                   blockType === BlockType.WOOD_SWORD || blockType === BlockType.WOOD_PICKAXE || blockType === BlockType.WOOD_SHOVEL ||
                                   blockType === BlockType.STONE_SWORD || blockType === BlockType.STONE_AXE ||
                                   blockType === BlockType.IRON_PICKAXE || blockType === BlockType.IRON_AXE || blockType === BlockType.IRON_SHOVEL ||
                                   blockType === BlockType.GOLD_SWORD || blockType === BlockType.GOLD_PICKAXE || blockType === BlockType.GOLD_AXE || blockType === BlockType.GOLD_SHOVEL ||
                                   blockType === BlockType.DIAMOND_SWORD || blockType === BlockType.DIAMOND_PICKAXE || blockType === BlockType.DIAMOND_AXE || blockType === BlockType.DIAMOND_SHOVEL ||
                                   blockType === BlockType.MUSIC_DISC_CAT || blockType === BlockType.MUSIC_DISC_CHIRP ||
                                   blockType === BlockType.MUSIC_DISC_BLOCKS || blockType === BlockType.MUSIC_DISC_MELLOHI ||
                                   blockType === BlockType.VINES || blockType === BlockType.FIRE ||
                                   blockType === BlockType.SUGAR_CANE || blockType === BlockType.BAMBOO ||
                                   blockType === BlockType.FROG_EGGS;
        // Use strict alphaTest cutouts with transparent: false and DoubleSide on flora/cutouts
        // to eliminate InstancedMesh alpha-sorting glitches and invisible faces behind water/blocks.
        material = isTransparentFlora
          ? [
              new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
              new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
              new THREE.MeshLambertMaterial({ map: top, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
              new THREE.MeshLambertMaterial({ map: bottom, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
              new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
              new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
            ]
          : [
              new THREE.MeshLambertMaterial({ map: side }),
              new THREE.MeshLambertMaterial({ map: side }),
              new THREE.MeshLambertMaterial({ map: top }),
              new THREE.MeshLambertMaterial({ map: bottom }),
              new THREE.MeshLambertMaterial({ map: side }),
              new THREE.MeshLambertMaterial({ map: side }),
            ];
    } else {
        material = new THREE.MeshLambertMaterial({ map: side });
    }

    this.materials.set(blockType, material);
    return material;
  }
};
