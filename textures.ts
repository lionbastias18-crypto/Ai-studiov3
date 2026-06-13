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
    if (face === 'top' || face === 'bottom') {
      ctx.fillStyle = '#107a22';
      ctx.fillRect(0, 0, 16, 16);
      drawNoise(20);
    } else {
      ctx.fillStyle = '#0f5e1b';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#107a22';
      for(let x=2; x<16; x+=4) ctx.fillRect(x, 0, 2, 16);
      // Pinchos
      ctx.fillStyle = '#000000';
      for(let i=0; i<10; i++) {
          ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
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
    ctx.clearRect(0, 0, 16, 16);
    // Stick
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(7, 6, 2, 10);
    // Flame
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(7, 4, 2, 2);
    ctx.fillStyle = '#ff5500';
    ctx.fillRect(7, 3, 2, 1);
  } else if (blockType === BlockType.DOOR) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#3a2211';
    ctx.fillRect(2, 2, 12, 5);
    ctx.fillRect(2, 9, 12, 5);
    // Door knob
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(12, 8, 2, 2);
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
  } else if (blockType === BlockType.SWORD) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#836531';
    ctx.fillRect(5, 11, 6, 1);
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(7, 12, 2, 4);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(7, 2, 2, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 2, 1, 9);
  } else if (blockType === BlockType.PICKAXE) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(7, 5, 2, 11);
    ctx.fillStyle = '#a1a1a1';
    ctx.fillRect(4, 3, 8, 2);
    ctx.fillRect(3, 4, 1, 2);
    ctx.fillRect(11, 4, 1, 2);
  } else if (blockType === BlockType.AXE) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(7, 4, 2, 12);
    ctx.fillStyle = '#a1a1a1';
    ctx.fillRect(4, 2, 4, 4);
    ctx.fillRect(2, 3, 2, 2);
  } else if (blockType === BlockType.SHOVEL) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(7, 6, 2, 10);
    ctx.fillStyle = '#df9c5c';
    ctx.fillRect(6, 2, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 2, 1, 1);
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
    } else if (blockType === BlockType.DIAMOND_ORE) {
        material = new THREE.MeshLambertMaterial({
            map: side, emissive: '#4cebeb', emissiveIntensity: 0.1
        });
    } else if (blockType === BlockType.TORCH) {
        material = new THREE.MeshLambertMaterial({
            map: side, emissive: '#ffaa00', emissiveIntensity: 0.8, transparent: true, alphaTest: 0.5
        });
    } else if (blockType === BlockType.GRASS || blockType === BlockType.LOG || blockType === BlockType.CACTUS || 
               blockType === BlockType.MUSHROOM_RED || blockType === BlockType.MUSHROOM_BROWN || 
               blockType === BlockType.FLOWER_RED || blockType === BlockType.FLOWER_YELLOW ||
               blockType === BlockType.BED || blockType === BlockType.DOOR || blockType === BlockType.CRAFTING_TABLE ||
               blockType === BlockType.SWORD || blockType === BlockType.PICKAXE || blockType === BlockType.AXE || blockType === BlockType.SHOVEL) {
        const isTransparentFlora = blockType === BlockType.MUSHROOM_RED || blockType === BlockType.MUSHROOM_BROWN || 
                                   blockType === BlockType.FLOWER_RED || blockType === BlockType.FLOWER_YELLOW || 
                                   blockType === BlockType.DOOR ||
                                   blockType === BlockType.SWORD || blockType === BlockType.PICKAXE || blockType === BlockType.AXE || blockType === BlockType.SHOVEL;
        material = [
            new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: isTransparentFlora ? 0.5 : 0 }),
            new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: isTransparentFlora ? 0.5 : 0 }),
            new THREE.MeshLambertMaterial({ map: top, transparent: false, alphaTest: isTransparentFlora ? 0.5 : 0 }),
            new THREE.MeshLambertMaterial({ map: bottom, transparent: false, alphaTest: isTransparentFlora ? 0.5 : 0 }),
            new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: isTransparentFlora ? 0.5 : 0 }),
            new THREE.MeshLambertMaterial({ map: side, transparent: false, alphaTest: isTransparentFlora ? 0.5 : 0 }),
        ];
    } else {
        material = new THREE.MeshLambertMaterial({ map: side });
    }

    this.materials.set(blockType, material);
    return material;
  }
};
