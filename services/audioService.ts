
import { BlockType } from "../types";

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const playPlaceSound = (blockType?: BlockType) => {
  const ctx = initAudio();
  if (ctx.state === 'suspended') return;
  const currentTime = ctx.currentTime;

  const type = blockType !== undefined ? blockType : BlockType.GRASS;

  if (type === BlockType.WATER || type === BlockType.LAVA) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, currentTime + 0.15);

      gain.gain.setValueAtTime(0.15, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, currentTime);
      filter.frequency.exponentialRampToValueAtTime(200, currentTime + 0.1);

      noiseGain.gain.setValueAtTime(0.1, currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.15);
      noise.start();
    } catch (e) {}
  } 
  else if (
    type === BlockType.STONE || 
    type === BlockType.BEDROCK || 
    type === BlockType.OBSIDIAN || 
    type === BlockType.COAL_ORE || 
    type === BlockType.IRON_ORE || 
    type === BlockType.GOLD_ORE || 
    type === BlockType.REDSTONE_ORE || 
    type === BlockType.DIAMOND_ORE ||
    type === BlockType.COPPER_ORE ||
    type === BlockType.COPPER_BLOCK ||
    type === BlockType.OXIDIZED_COPPER
  ) {
    try {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, currentTime);
      osc.frequency.setValueAtTime(90, currentTime + 0.05);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(400, currentTime);
      osc2.frequency.exponentialRampToValueAtTime(150, currentTime + 0.05);

      gain.gain.setValueAtTime(0.2, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.07);

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.07);
      osc2.start();
      osc2.stop(currentTime + 0.07);
    } catch (e) {}
  } 
  else if (
    type === BlockType.WOOD || 
    type === BlockType.LOG || 
    type === BlockType.CRAFTING_TABLE || 
    type === BlockType.DOOR ||
    type === BlockType.BED
  ) {
    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, currentTime + 0.08);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, currentTime);

      gain.gain.setValueAtTime(0.25, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.08);
    } catch (e) {}
  } 
  else if (type === BlockType.SAND) {
    try {
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, currentTime);
      filter.Q.setValueAtTime(1.5, currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch (e) {}
  } 
  else {
    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, currentTime + 0.1);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, currentTime);

      gain.gain.setValueAtTime(0.2, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.1);

      const bufferSize = ctx.sampleRate * 0.04;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(250, currentTime);
      noiseGain.gain.setValueAtTime(0.06, currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.04);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.1);
      noise.start();
    } catch (e) {}
  }
};

export const playBreakSound = (blockType?: BlockType) => {
  const ctx = initAudio();
  if (ctx.state === 'suspended') return;
  const currentTime = ctx.currentTime;

  const type = blockType !== undefined ? blockType : BlockType.GRASS;

  if (type === BlockType.WATER || type === BlockType.LAVA) {
    try {
      const bufferSize = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300, currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, currentTime + 0.18);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.2);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch (e) {}
  } 
  else if (
    type === BlockType.STONE || 
    type === BlockType.BEDROCK || 
    type === BlockType.OBSIDIAN || 
    type === BlockType.COAL_ORE || 
    type === BlockType.IRON_ORE || 
    type === BlockType.GOLD_ORE || 
    type === BlockType.REDSTONE_ORE || 
    type === BlockType.DIAMOND_ORE ||
    type === BlockType.COPPER_ORE ||
    type === BlockType.COPPER_BLOCK ||
    type === BlockType.OXIDIZED_COPPER
  ) {
    try {
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600, currentTime);
      filter.frequency.exponentialRampToValueAtTime(150, currentTime + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, currentTime + 0.08);
      oscGain.gain.setValueAtTime(0.15, currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      noise.start();
      osc.start();
      osc.stop(currentTime + 0.08);
    } catch (e) {}
  } 
  else if (
    type === BlockType.WOOD || 
    type === BlockType.LOG || 
    type === BlockType.CRAFTING_TABLE || 
    type === BlockType.DOOR ||
    type === BlockType.BED
  ) {
    try {
      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, currentTime);
      filter.frequency.exponentialRampToValueAtTime(90, currentTime + 0.10);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.12);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(90, currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, currentTime + 0.10);
      oscGain.gain.setValueAtTime(0.2, currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.10);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      noise.start();
      osc.start();
      osc.stop(currentTime + 0.10);
    } catch (e) {}
  } 
  else if (type === BlockType.SAND) {
    try {
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, currentTime);
      filter.frequency.exponentialRampToValueAtTime(400, currentTime + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch (e) {}
  } 
  else {
    try {
      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(250, currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, currentTime + 0.10);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.12);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(75, currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, currentTime + 0.10);
      oscGain.gain.setValueAtTime(0.18, currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.10);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      noise.start();
      osc.start();
      osc.stop(currentTime + 0.10);
    } catch (e) {}
  }
};

export const playStepSound = (blockType: BlockType, volume = 0.04) => {
  const ctx = initAudio();
  if (ctx.state === 'suspended') return;

  const currentTime = ctx.currentTime;

  // Diferentes sintetizadores según el tipo de bloque / material
  if (blockType === BlockType.WATER) {
    // Sonido de salpicado / nadar en agua
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80, currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, currentTime + 0.15);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, currentTime);

      // Ruido de salpicadura
      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();

      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(450, currentTime);
      noiseFilter.frequency.exponentialRampToValueAtTime(120, currentTime + 0.10);

      noiseGain.gain.setValueAtTime(volume * 0.65, currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.10);

      gain.gain.setValueAtTime(volume, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.15);
      noise.start();
    } catch (e) {}
  } 
  else if (
    blockType === BlockType.STONE || 
    blockType === BlockType.BEDROCK || 
    blockType === BlockType.OBSIDIAN || 
    blockType === BlockType.COAL_ORE || 
    blockType === BlockType.IRON_ORE || 
    blockType === BlockType.GOLD_ORE || 
    blockType === BlockType.REDSTONE_ORE || 
    blockType === BlockType.DIAMOND_ORE
  ) {
    // Sonido de piedra / mineral (clicky, rígido, agudo)
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(110, currentTime);
      osc1.frequency.exponentialRampToValueAtTime(75, currentTime + 0.05);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(500, currentTime);
      osc2.frequency.exponentialRampToValueAtTime(180, currentTime + 0.035);

      gain.gain.setValueAtTime(volume * 0.75, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.05);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc1.stop(currentTime + 0.05);
      osc2.start();
      osc2.stop(currentTime + 0.035);
    } catch (e) {}
  } 
  else if (
    blockType === BlockType.WOOD || 
    blockType === BlockType.LOG || 
    blockType === BlockType.CRAFTING_TABLE || 
    blockType === BlockType.DOOR
  ) {
    // Madera (sordo, cálido, hueco)
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(95, currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, currentTime + 0.07);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, currentTime);

      gain.gain.setValueAtTime(volume * 1.4, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.07);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.07);
    } catch (e) {}
  } 
  else if (blockType === BlockType.SAND) {
    // Arena (raspado de partículas de alta frecuencia)
    try {
      const bufferSize = ctx.sampleRate * 0.07;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, currentTime);
      filter.Q.setValueAtTime(2.2, currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * 0.9, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.07);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch (e) {}
  } 
  else {
    // Hierba / Tierra / Hojas / Tipo Estándar (crujiente de baja frecuencia)
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, currentTime + 0.065);

      // Añadimos un pequeño crujido de hojas/tierra
      const bufferSize = ctx.sampleRate * 0.035;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();

      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(220, currentTime);

      noiseGain.gain.setValueAtTime(volume * 0.35, currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.035);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, currentTime);

      gain.gain.setValueAtTime(volume * 1.1, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.065);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.start();
      osc.stop(currentTime + 0.065);
      noise.start();
    } catch (e) {}
  }
};

// --- CONTROLES DE AMBIENTE DEL ENTORNO ---
let windNode: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;
let windFilter: BiquadFilterNode | null = null;
let windLfo: OscillatorNode | null = null;

let waterAmbientNode: AudioBufferSourceNode | null = null;
let waterAmbientGain: GainNode | null = null;
let waterAmbientFilter: BiquadFilterNode | null = null;

let isAmbientStarted = false;

const createNoiseBuffer = (ctx: AudioContext, duration = 3.0) => {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

export const startAmbientSounds = () => {
  const ctx = initAudio();
  if (isAmbientStarted) return;
  isAmbientStarted = true;

  try {
    const noiseBuffer = createNoiseBuffer(ctx, 3.0);

    // --- VIENTO DE FONDO (WIND) ---
    windNode = ctx.createBufferSource();
    windNode.buffer = noiseBuffer;
    windNode.loop = true;

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.setValueAtTime(1.5, ctx.currentTime);
    windFilter.frequency.setValueAtTime(350, ctx.currentTime);

    windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.015, ctx.currentTime); // volumen suave

    // Oscilador que altera la frecuencia del viento para dar ráfagas naturales
    windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.setValueAtTime(0.07, ctx.currentTime); // oscila cada ~14 segundos

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(180, ctx.currentTime); // barre +/- 180 Hz

    windLfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);

    windNode.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);

    windLfo.start();
    windNode.start();

    // --- AMBIENTE DE AGUA (WATER BUBBLES) ---
    waterAmbientNode = ctx.createBufferSource();
    waterAmbientNode.buffer = noiseBuffer;
    waterAmbientNode.loop = true;

    waterAmbientFilter = ctx.createBiquadFilter();
    waterAmbientFilter.type = 'lowpass';
    waterAmbientFilter.frequency.setValueAtTime(100, ctx.currentTime);

    waterAmbientGain = ctx.createGain();
    waterAmbientGain.gain.setValueAtTime(0, ctx.currentTime); // por defecto inaudible

    waterAmbientNode.connect(waterAmbientFilter);
    waterAmbientFilter.connect(waterAmbientGain);
    waterAmbientGain.connect(ctx.destination);

    waterAmbientNode.start();
  } catch (e) {
    console.error("Error al iniciar los sonidos ambientales:", e);
  }
};

export const updateAmbientEnvironment = (isUnderwater: boolean, isNearWater: boolean, altitude: number) => {
  const ctx = initAudio();
  if (ctx.state === 'suspended' || !isAmbientStarted) return;

  try {
    // El viento es más fuerte a gran altitud, y más silencioso (mufled) bajo el agua
    const baseVolume = 0.012;
    const altitudeFactor = Math.max(0, (altitude - 55) * 0.0003);
    const targetWindVolume = isUnderwater ? 0.002 : (baseVolume + altitudeFactor);
    const targetWindFrequency = isUnderwater ? 120 : 350;
    
    // El sonido submarino sube de volumen al entrar al agua o al estar cerca
    const targetWaterVolume = isUnderwater ? 0.035 : (isNearWater ? 0.01 : 0);

    if (windGain) {
      windGain.gain.setTargetAtTime(targetWindVolume, ctx.currentTime, 0.8);
    }
    if (windFilter) {
      windFilter.frequency.setTargetAtTime(targetWindFrequency, ctx.currentTime, 0.5);
    }
    if (waterAmbientGain) {
      waterAmbientGain.gain.setTargetAtTime(targetWaterVolume, ctx.currentTime, 0.6);
    }
  } catch (e) {}
};

export const resumeAudio = () => {
  initAudio();
  playBackgroundMusic();
  startAmbientSounds();
  if (currentMusicMode === 'soundtrack') {
    ensureSoundtrackPlaying();
  }
  if (isCustomMusicPlayingState && customBgMusic) {
    customBgMusic.play().catch(e => console.log("Resuming custom music failed:", e));
  }
};

let bgMusicStarted = false;
export type MusicMode = 'soundtrack' | 'c418' | 'chiptune' | 'custom';
export type MusicContextScene = 'menu' | 'world';

const MENU_SOUNDTRACK = {
  url: '/assets/aistudio/Winter_Menu_Waltz_5b9b04b1.mp3',
  title: 'Winter Menu Waltz (Menú)'
};

const WORLD_SOUNDTRACKS = [
  {
    url: '/assets/aistudio/Adventure_Overworld_7730af55.mp3',
    title: 'Adventure Overworld'
  },
  {
    url: '/assets/aistudio/Christmas_Overworld_ed19576f.mp3',
    title: 'Christmas Overworld'
  }
];

let currentMusicMode: MusicMode = 'soundtrack';
let currentMusicScene: MusicContextScene = 'menu';
let worldTrackIdx = 0;
let soundtrackAudio: HTMLAudioElement | null = null;
let soundtrackCurrentUrl: string | null = null;
let soundtrackNeedsGestureUnlock = false;

let customBgMusic: HTMLAudioElement | null = null;
let customBgMusicVolume = 0.5;
let customMusicName: string | null = null;
let isCustomMusicPlayingState = false;

// Web Audio API Music Master & Sequencer State
let musicMasterGain: GainNode | null = null;
let musicSchedulerTimer: any = null;
let currentTrackIndex = 0;
let currentTrackName = MENU_SOUNDTRACK.title;
let chiptuneTimeoutId: any = null;
let chiptuneStep = 0;
let chiptuneNextTime = 0.0;
const CHIPTUNE_STEP_DURATION = 0.24;

const stopSoundtrackAudio = () => {
  if (soundtrackAudio) {
    soundtrackAudio.onended = null;
    soundtrackAudio.pause();
  }
};

const getActiveSoundtrackEntry = () => {
  if (currentMusicScene === 'menu') {
    return { ...MENU_SOUNDTRACK, loop: true };
  }
  const track = WORLD_SOUNDTRACKS[worldTrackIdx % WORLD_SOUNDTRACKS.length];
  return { ...track, loop: false };
};

const syncSoundtrackPlayback = (forceSwitch = false) => {
  if (typeof window === 'undefined' || currentMusicMode !== 'soundtrack') return;
  const entry = getActiveSoundtrackEntry();
  currentTrackName = entry.title;

  if (!soundtrackAudio) {
    soundtrackAudio = new Audio();
  }

  soundtrackAudio.volume = customBgMusicVolume;
  soundtrackAudio.loop = entry.loop;

  if (forceSwitch || soundtrackCurrentUrl !== entry.url) {
    soundtrackCurrentUrl = entry.url;
    soundtrackAudio.src = entry.url;
    soundtrackAudio.currentTime = 0;
  }

  if (currentMusicScene === 'world') {
    soundtrackAudio.onended = () => {
      if (currentMusicMode === 'soundtrack' && currentMusicScene === 'world') {
        worldTrackIdx = (worldTrackIdx + 1) % WORLD_SOUNDTRACKS.length;
        syncSoundtrackPlayback(true);
      }
    };
  } else {
    soundtrackAudio.onended = null;
  }

  if (soundtrackAudio.paused || forceSwitch) {
    const playPromise = soundtrackAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          soundtrackNeedsGestureUnlock = false;
        })
        .catch(() => {
          soundtrackNeedsGestureUnlock = true;
        });
    }
  }
};

const ensureSoundtrackPlaying = () => {
  if (currentMusicMode !== 'soundtrack') return;
  if (!soundtrackAudio || soundtrackAudio.paused || soundtrackNeedsGestureUnlock) {
    syncSoundtrackPlayback(false);
  }
};

if (typeof window !== 'undefined') {
  const unlockMusicOnGesture = () => {
    if (currentMusicMode === 'soundtrack' && (!soundtrackAudio || soundtrackAudio.paused || soundtrackNeedsGestureUnlock)) {
      ensureSoundtrackPlaying();
    }
  };
  window.addEventListener('pointerdown', unlockMusicOnGesture, { passive: true });
  window.addEventListener('keydown', unlockMusicOnGesture, { passive: true });
}

export const setMusicContext = (scene: MusicContextScene) => {
  const changed = currentMusicScene !== scene;
  currentMusicScene = scene;
  if (currentMusicMode === 'soundtrack') {
    if (changed) {
      syncSoundtrackPlayback(true);
    } else {
      ensureSoundtrackPlaying();
    }
  }
};

interface AmbientChord {
  timeOffset: number; // in seconds
  pianoNotes: number[]; // MIDI notes
  padNotes?: number[];
  bassNote?: number;
  bellNotes?: { time: number; note: number }[];
}

interface AmbientTrack {
  name: string;
  duration: number; // total duration of music in seconds
  pauseDuration: number; // calm silence before next theme
  chords: AmbientChord[];
}

const AMBIENT_TRACKS: AmbientTrack[] = [
  {
    name: "C418 - Sweden Calm (Piano & Ambiente)",
    duration: 38,
    pauseDuration: 12,
    chords: [
      {
        timeOffset: 0.5,
        pianoNotes: [60, 64, 67, 72],
        padNotes: [48, 55, 60],
        bassNote: 36,
        bellNotes: [{ time: 2.2, note: 79 }, { time: 3.5, note: 76 }]
      },
      {
        timeOffset: 5.0,
        pianoNotes: [57, 60, 65, 69],
        padNotes: [41, 53, 57],
        bassNote: 41,
        bellNotes: [{ time: 6.8, note: 77 }, { time: 8.2, note: 72 }]
      },
      {
        timeOffset: 10.0,
        pianoNotes: [57, 64, 67, 71],
        padNotes: [45, 52, 57],
        bassNote: 33,
        bellNotes: [{ time: 11.8, note: 76 }, { time: 13.4, note: 74 }]
      },
      {
        timeOffset: 15.0,
        pianoNotes: [55, 59, 62, 67],
        padNotes: [43, 50, 55],
        bassNote: 35,
        bellNotes: [{ time: 17.2, note: 79 }, { time: 18.6, note: 83 }]
      },
      {
        timeOffset: 20.0,
        pianoNotes: [52, 59, 64, 67],
        padNotes: [40, 47, 52],
        bassNote: 40,
        bellNotes: [{ time: 22.0, note: 76 }, { time: 23.5, note: 71 }]
      },
      {
        timeOffset: 25.0,
        pianoNotes: [53, 57, 60, 65, 72],
        padNotes: [41, 48, 53],
        bassNote: 41,
        bellNotes: [{ time: 27.2, note: 77 }, { time: 28.8, note: 72 }]
      },
      {
        timeOffset: 30.5,
        pianoNotes: [48, 55, 60, 64, 71],
        padNotes: [36, 48, 55],
        bassNote: 36,
        bellNotes: [{ time: 33.0, note: 84 }, { time: 35.0, note: 79 }]
      }
    ]
  },
  {
    name: "C418 - Wet Hands (Manos Húmedas)",
    duration: 36,
    pauseDuration: 12,
    chords: [
      {
        timeOffset: 0.5,
        pianoNotes: [50, 57, 62, 65],
        padNotes: [38, 50, 57],
        bassNote: 38,
        bellNotes: [{ time: 1.8, note: 74 }, { time: 3.2, note: 77 }, { time: 4.4, note: 81 }]
      },
      {
        timeOffset: 5.5,
        pianoNotes: [46, 53, 58, 62, 65],
        padNotes: [34, 46, 53],
        bassNote: 34,
        bellNotes: [{ time: 7.2, note: 74 }, { time: 8.8, note: 77 }]
      },
      {
        timeOffset: 11.0,
        pianoNotes: [41, 48, 53, 60, 65],
        padNotes: [41, 53, 60],
        bassNote: 41,
        bellNotes: [{ time: 12.8, note: 72 }, { time: 14.5, note: 69 }]
      },
      {
        timeOffset: 16.5,
        pianoNotes: [48, 55, 60, 64, 67],
        padNotes: [36, 48, 55],
        bassNote: 36,
        bellNotes: [{ time: 18.2, note: 76 }, { time: 20.0, note: 79 }]
      },
      {
        timeOffset: 22.0,
        pianoNotes: [43, 50, 55, 58, 62],
        padNotes: [43, 55, 62],
        bassNote: 43,
        bellNotes: [{ time: 24.0, note: 74 }, { time: 25.8, note: 70 }]
      },
      {
        timeOffset: 28.0,
        pianoNotes: [50, 57, 62, 69, 74],
        padNotes: [38, 50, 57],
        bassNote: 38,
        bellNotes: [{ time: 30.5, note: 81 }, { time: 33.0, note: 74 }]
      }
    ]
  },
  {
    name: "C418 - Subwoofer Lullaby (Atardecer Voxel)",
    duration: 40,
    pauseDuration: 14,
    chords: [
      {
        timeOffset: 0.5,
        pianoNotes: [52, 59, 64, 67],
        padNotes: [40, 52, 59],
        bassNote: 28,
        bellNotes: [{ time: 2.2, note: 76 }, { time: 3.8, note: 79 }]
      },
      {
        timeOffset: 6.0,
        pianoNotes: [48, 55, 60, 64, 71],
        padNotes: [36, 48, 55],
        bassNote: 36,
        bellNotes: [{ time: 7.8, note: 79 }, { time: 9.5, note: 83 }]
      },
      {
        timeOffset: 12.0,
        pianoNotes: [43, 50, 55, 59, 67],
        padNotes: [43, 55, 59],
        bassNote: 31,
        bellNotes: [{ time: 14.0, note: 74 }, { time: 15.8, note: 79 }]
      },
      {
        timeOffset: 18.0,
        pianoNotes: [47, 54, 59, 62, 66],
        padNotes: [35, 47, 54],
        bassNote: 35,
        bellNotes: [{ time: 20.0, note: 74 }, { time: 21.8, note: 71 }]
      },
      {
        timeOffset: 24.0,
        pianoNotes: [45, 52, 57, 60, 67],
        padNotes: [45, 57, 64],
        bassNote: 33,
        bellNotes: [{ time: 26.2, note: 72 }, { time: 28.0, note: 76 }]
      },
      {
        timeOffset: 31.0,
        pianoNotes: [40, 47, 52, 59, 64, 76],
        padNotes: [28, 40, 52],
        bassNote: 28,
        bellNotes: [{ time: 33.5, note: 83 }, { time: 36.0, note: 76 }]
      }
    ]
  }
];

const midiToFreq = (midi: number): number => {
  return 440 * Math.pow(2, (midi - 69) / 12);
};

const playPianoNote = (
  ctx: AudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  velocity = 0.8,
  dur = 3.5
) => {
  try {
    const freq = midiToFreq(midi);
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.0015, time);

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 2.0, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseCutoff = Math.min(3000, freq * 3.2 + velocity * 1000);
    filter.frequency.setValueAtTime(baseCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.1), time + dur);

    const noteGain = ctx.createGain();
    const peakVol = velocity * 0.13;
    noteGain.gain.setValueAtTime(0.0001, time);
    noteGain.gain.linearRampToValueAtTime(peakVol, time + 0.025);
    noteGain.gain.exponentialRampToValueAtTime(peakVol * 0.42, time + 0.35);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.32;
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);

    const osc3Gain = ctx.createGain();
    osc3Gain.gain.value = 0.10;
    osc3.connect(osc3Gain);
    osc3Gain.connect(filter);

    osc1.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc3.start(time);

    osc1.stop(time + dur);
    osc2.stop(time + dur);
    osc3.stop(time + dur);
  } catch (e) {}
};

const playPadChord = (
  ctx: AudioContext,
  dest: AudioNode,
  notes: number[],
  time: number,
  dur = 5.5
) => {
  try {
    notes.forEach((midi, idx) => {
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const detune = (idx % 2 === 0 ? 1 : -1) * 3.5;
      osc.detune.setValueAtTime(detune, time);
      osc.frequency.setValueAtTime(freq, time);

      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(520, time);
      padFilter.frequency.linearRampToValueAtTime(780, time + dur * 0.4);
      padFilter.frequency.linearRampToValueAtTime(420, time + dur);

      const gain = ctx.createGain();
      const padVol = 0.042;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(padVol, time + 1.2);
      gain.gain.linearRampToValueAtTime(padVol * 0.8, time + dur * 0.65);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      osc.connect(padFilter);
      padFilter.connect(gain);
      gain.connect(dest);

      osc.start(time);
      osc.stop(time + dur);
    });
  } catch (e) {}
};

const playSubBass = (
  ctx: AudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  dur = 4.5
) => {
  try {
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    const gain = ctx.createGain();
    const bassVol = 0.11;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(bassVol, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur);
  } catch (e) {}
};

const playBellTone = (
  ctx: AudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  dur = 2.8
) => {
  try {
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    const harmOsc = ctx.createOscillator();
    harmOsc.type = 'sine';
    harmOsc.frequency.setValueAtTime(freq * 3.0, time);

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.16;
    harmOsc.connect(harmGain);

    const gain = ctx.createGain();
    const bellVol = 0.038;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(bellVol, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    harmGain.connect(gain);
    gain.connect(dest);

    osc.start(time);
    harmOsc.start(time);
    osc.stop(time + dur);
    harmOsc.stop(time + dur);
  } catch (e) {}
};

const getMusicMasterGain = (ctx: AudioContext): GainNode => {
  if (!musicMasterGain) {
    musicMasterGain = ctx.createGain();
    musicMasterGain.gain.setValueAtTime(customBgMusicVolume, ctx.currentTime);
    musicMasterGain.connect(ctx.destination);
  }
  return musicMasterGain;
};

const stopProceduralSequencer = () => {
  if (musicSchedulerTimer) {
    clearTimeout(musicSchedulerTimer);
    musicSchedulerTimer = null;
  }
  if (chiptuneTimeoutId) {
    clearTimeout(chiptuneTimeoutId);
    chiptuneTimeoutId = null;
  }
};

const startC418MusicLoop = () => {
  stopProceduralSequencer();
  const ctx = initAudio();
  if (!ctx || ctx.state === 'suspended' || currentMusicMode !== 'c418') return;

  const masterGain = getMusicMasterGain(ctx);
  const track = AMBIENT_TRACKS[currentTrackIndex % AMBIENT_TRACKS.length];
  currentTrackName = track.name;

  const startTime = ctx.currentTime + 0.1;

  track.chords.forEach((chord) => {
    const chordTime = startTime + chord.timeOffset;

    chord.pianoNotes.forEach((midi, noteIdx) => {
      const noteDelay = noteIdx * 0.038;
      playPianoNote(ctx, masterGain, midi, chordTime + noteDelay, 0.75 - noteIdx * 0.05);
    });

    if (chord.padNotes && chord.padNotes.length > 0) {
      playPadChord(ctx, masterGain, chord.padNotes, chordTime, 5.0);
    }

    if (chord.bassNote) {
      playSubBass(ctx, masterGain, chord.bassNote, chordTime, 4.5);
    }

    if (chord.bellNotes) {
      chord.bellNotes.forEach((bell) => {
        playBellTone(ctx, masterGain, bell.note, startTime + bell.time);
      });
    }
  });

  const nextTrackDelayMs = (track.duration + track.pauseDuration) * 1000;
  musicSchedulerTimer = setTimeout(() => {
    if (currentMusicMode === 'c418') {
      currentTrackIndex = (currentTrackIndex + 1) % AMBIENT_TRACKS.length;
      startC418MusicLoop();
    }
  }, nextTrackDelayMs);
};

const startChiptuneSequencer = () => {
  stopProceduralSequencer();
  const ctx = initAudio();
  if (!ctx || ctx.state === 'suspended' || currentMusicMode !== 'chiptune') return;

  currentTrackName = "Retro Chiptune - Aventura Pixel 8-Bit";
  chiptuneNextTime = ctx.currentTime + 0.1;
  chiptuneStep = 0;

  const scheduleLoop = () => {
    if (currentMusicMode !== 'chiptune') return;
    while (chiptuneNextTime < ctx.currentTime + 0.35) {
      scheduleChiptuneStep(chiptuneStep, chiptuneNextTime, ctx);
      chiptuneNextTime += CHIPTUNE_STEP_DURATION;
      chiptuneStep = (chiptuneStep + 1) % 32;
    }
    chiptuneTimeoutId = setTimeout(scheduleLoop, 100);
  };
  scheduleLoop();
};

const scheduleChiptuneStep = (step: number, time: number, ctx: AudioContext) => {
  if (currentMusicMode !== 'chiptune') return;
  const masterGain = getMusicMasterGain(ctx);

  const bassNotes = [
    130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 130.81,
    98.00,  98.00,  98.00,  98.00,  98.00,  98.00,  98.00,  98.00,
    110.00, 110.00, 110.00, 110.00, 110.00, 110.00, 110.00, 110.00,
    87.31,  87.31,  87.31,  87.31,  87.31,  87.31,  87.31,  87.31
  ];

  const melodyNotes = [
    523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 523.25, 783.99,
    493.88, 587.33, 783.99, 987.77,  783.99, 587.33, 493.88, 783.99,
    440.00, 523.25, 659.25, 880.00,  659.25, 523.25, 440.00, 659.25,
    349.23, 440.00, 523.25, 698.46,  523.25, 440.00, 349.23, 523.25
  ];

  if (step % 2 === 0 || step % 4 === 1) {
    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gainNode = ctx.createGain();

      osc.type = 'square';
      let freq = melodyNotes[step];
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, time);

      gainNode.gain.setValueAtTime(0.0001, time);
      gainNode.gain.linearRampToValueAtTime(0.065, time + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGain);

      osc.start(time);
      osc.stop(time + 0.20);
    } catch (e) {}
  }

  if (step % 2 === 0) {
    try {
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();

      bassOsc.type = 'triangle';
      let bassFreq = bassNotes[step];
      if (step % 4 === 2) bassFreq *= 2.0;

      bassOsc.frequency.setValueAtTime(bassFreq, time);

      bassGain.gain.setValueAtTime(0.0001, time);
      bassGain.gain.linearRampToValueAtTime(0.12, time + 0.02);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      bassOsc.connect(bassGain);
      bassGain.connect(masterGain);

      bassOsc.start(time);
      bassOsc.stop(time + 0.24);
    } catch (e) {}
  }
};

export const setMusicMode = (mode: MusicMode) => {
  currentMusicMode = mode;

  if (mode === 'soundtrack') {
    stopProceduralSequencer();
    if (customBgMusic) customBgMusic.pause();
    isCustomMusicPlayingState = false;
    syncSoundtrackPlayback(true);
  } else if (mode === 'c418') {
    stopSoundtrackAudio();
    if (customBgMusic) customBgMusic.pause();
    isCustomMusicPlayingState = false;
    startC418MusicLoop();
  } else if (mode === 'chiptune') {
    stopSoundtrackAudio();
    if (customBgMusic) customBgMusic.pause();
    isCustomMusicPlayingState = false;
    startChiptuneSequencer();
  } else if (mode === 'custom') {
    stopSoundtrackAudio();
    stopProceduralSequencer();
    if (customBgMusic) {
      customBgMusic.play().catch(e => console.log("Custom audio play blocked:", e));
      isCustomMusicPlayingState = true;
    }
  }
};

export const getCurrentMusicMode = (): MusicMode => currentMusicMode;

export const getMusicTrackTitle = (): string => {
  if (currentMusicMode === 'custom') {
    return customMusicName ? `MP3: ${customMusicName}` : "Música Personalizada";
  }
  if (currentMusicMode === 'soundtrack') {
    return getActiveSoundtrackEntry().title;
  }
  return currentTrackName;
};

export const skipToNextTrack = () => {
  if (currentMusicMode === 'soundtrack') {
    if (currentMusicScene === 'world') {
      worldTrackIdx = (worldTrackIdx + 1) % WORLD_SOUNDTRACKS.length;
      syncSoundtrackPlayback(true);
    } else if (soundtrackAudio) {
      soundtrackAudio.currentTime = 0;
      syncSoundtrackPlayback(false);
    }
  } else if (currentMusicMode === 'c418') {
    currentTrackIndex = (currentTrackIndex + 1) % AMBIENT_TRACKS.length;
    startC418MusicLoop();
  }
};

export const setUseProceduralMusic = (use: boolean) => {
  if (use) {
    setMusicMode('soundtrack');
  } else {
    setMusicMode('custom');
  }
};

export const getUseProceduralMusic = () => currentMusicMode !== 'custom';

export const setCustomBackgroundMusicFile = (file: File) => {
  try {
    stopSoundtrackAudio();
    if (customBgMusic) {
      customBgMusic.pause();
      customBgMusic.src = "";
    }
    stopProceduralSequencer();
    const url = URL.createObjectURL(file);
    customBgMusic = new Audio(url);
    customBgMusic.loop = true;
    customBgMusic.volume = customBgMusicVolume;
    customMusicName = file.name;
    
    currentMusicMode = 'custom';
    isCustomMusicPlayingState = true;
    
    customBgMusic.play().catch(e => console.log("Custom audio autoplay blocked:", e));
  } catch (err) {
    console.error("Error setting custom background music file:", err);
  }
};

export const playCustomBackgroundMusic = () => {
  isCustomMusicPlayingState = true;
  currentMusicMode = 'custom';
  stopSoundtrackAudio();
  stopProceduralSequencer();
  if (customBgMusic) {
    customBgMusic.play().catch(e => console.log("Custom audio play blocked:", e));
  }
};

export const pauseCustomBackgroundMusic = () => {
  isCustomMusicPlayingState = false;
  if (customBgMusic) {
    customBgMusic.pause();
  }
  stopProceduralSequencer();
};

export const setCustomBackgroundMusicVolume = (vol: number) => {
  customBgMusicVolume = Math.max(0, Math.min(1, vol));
  if (soundtrackAudio) {
    soundtrackAudio.volume = customBgMusicVolume;
  }
  if (customBgMusic) {
    customBgMusic.volume = customBgMusicVolume;
  }
  const ctx = initAudio();
  if (musicMasterGain && ctx) {
    musicMasterGain.gain.setValueAtTime(customBgMusicVolume, ctx.currentTime);
  }
};

export const getCustomBackgroundMusicVolume = () => customBgMusicVolume;
export const getCustomMusicName = () => customMusicName;
export const isCustomMusicPlaying = () => isCustomMusicPlayingState;
export const isCustomMusicLoaded = () => customBgMusic !== null;

export const playBackgroundMusic = () => {
  if (currentMusicMode === 'soundtrack') {
    bgMusicStarted = true;
    ensureSoundtrackPlaying();
    return;
  }
  const ctx = initAudio();
  if (!ctx || bgMusicStarted) return;
  bgMusicStarted = true;

  if (currentMusicMode === 'c418') {
    startC418MusicLoop();
  } else if (currentMusicMode === 'chiptune') {
    startChiptuneSequencer();
  } else if (currentMusicMode === 'custom' && customBgMusic) {
    customBgMusic.play().catch(e => console.log("Custom audio play blocked:", e));
  }
};

export const playSleepSound = () => {
  const ctx = initAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 1.0);
  osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 2.0);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.5);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1.5);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 2.0);
};

export const playAttackSwingSound = () => {
  try {
    const ctx = initAudio();
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.12);
  } catch (e) {}
};

export const playHurtSound = () => {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(130, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
};

export const playZombieSound = () => {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(55, ctx.currentTime + 0.4);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, ctx.currentTime);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
};

export const playCatSound = () => {
  try {
    const ctx = initAudio();
    const currentTime = ctx.currentTime;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, currentTime);
    osc.frequency.exponentialRampToValueAtTime(750, currentTime + 0.12);
    osc.frequency.exponentialRampToValueAtTime(380, currentTime + 0.35);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(900, currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1500, currentTime + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(760, currentTime + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, currentTime);
    filter.frequency.exponentialRampToValueAtTime(900, currentTime + 0.35);

    gain.gain.setValueAtTime(0, currentTime);
    gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.08);
    gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.35);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc2.start();
    osc.stop(currentTime + 0.35);
    osc2.stop(currentTime + 0.35);
  } catch (e) {}
};

export const playCreeperSizzle = () => {
  try {
    const ctx = initAudio();
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4000, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  } catch (e) {}
};

export const playExplosionSound = () => {
  try {
    const ctx = initAudio();
    const bufferSize = ctx.sampleRate * 0.8;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.8);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  } catch (e) {}
};

export const playBowShootSound = () => {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
};

// --- PROCEDURAL JUKEBOX & MUSIC DISC SYSTEM ---

interface ActiveJukebox {
  intervalId: any;
  nodes: any[];
}

const activeJukeboxes: Record<string, ActiveJukebox> = {};

export const playJukeboxMusic = (jukeboxKey: string, discType: BlockType) => {
  try {
    const ctx = initAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Ensure any existing music for this specific jukebox coordinate is stopped cleanly
    stopJukeboxMusic(jukeboxKey);

    let bpm = 120;
    let melody: number[] = [];
    let bass: number[] = [];
    let waveType: OscillatorType = 'triangle';
    let bassWaveType: OscillatorType = 'sine';

    if (discType === BlockType.MUSIC_DISC_CAT) {
      bpm = 125;
      // Bright, cheerful major scale bouncy theme
      melody = [64, 66, 68, 71, 73, 71, 68, 66, 64, 68, 71, 73, 76, 73, 71, 68];
      bass = [40, 40, 44, 44, 45, 45, 47, 47];
      waveType = 'triangle';
      bassWaveType = 'sine';
    } else if (discType === BlockType.MUSIC_DISC_CHIRP) {
      bpm = 105;
      // High-pitched retro-gaming synth slide style
      melody = [67, 69, 71, 74, 76, 74, 71, 69, 67, 71, 74, 76, 79, 76, 74, 71];
      bass = [43, 43, 47, 47, 48, 48, 50, 50];
      waveType = 'sawtooth';
      bassWaveType = 'triangle';
    } else if (discType === BlockType.MUSIC_DISC_BLOCKS) {
      bpm = 80;
      // Very slow, atmospheric zen melody with soft attack and decay
      melody = [60, 64, 67, 72, 67, 64, 60, 62, 65, 69, 74, 69, 65, 62];
      bass = [36, 36, 36, 36, 38, 38, 38, 38];
      waveType = 'sine';
      bassWaveType = 'sine';
    } else if (discType === BlockType.MUSIC_DISC_MELLOHI) {
      bpm = 92;
      // Eerie, beautiful waltz-tempo minor scale progression
      melody = [57, 59, 60, 64, 62, 60, 59, 56, 57, 59, 60, 57, 52, 57, 59, 60];
      bass = [33, 33, 32, 32, 33, 33, 33, 33];
      waveType = 'sawtooth';
      bassWaveType = 'triangle';
    } else {
      return;
    }

    const stepDuration = 60 / bpm / 2; // Eighth notes
    let step = 0;
    const nodes: any[] = [];

    const playNote = (time: number, midiNote: number, dur: number, type: OscillatorType, volume: number) => {
      if (midiNote === 0) return;
      const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
      
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        
        // Retro pitch glide effect for 'Chirp'
        if (discType === BlockType.MUSIC_DISC_CHIRP && Math.random() > 0.4) {
          osc.frequency.exponentialRampToValueAtTime(freq * 0.96, time + dur);
        }

        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur - 0.015);

        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + dur);

        nodes.push(osc, gain);
      } catch (e) {}
    };

    const playDrum = (time: number) => {
      // Delicate synthesized hi-hat tick to add groove
      try {
        const bufferSize = ctx.sampleRate * 0.025;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.012, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(9000, time);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(time);
        
        nodes.push(source, gain);
      } catch (e) {}
    };

    // Standard high-performance scheduled loop lookahead pattern
    let nextNoteTime = ctx.currentTime + 0.05;
    const scheduleAheadTime = 0.15;

    const intervalId = setInterval(() => {
      while (nextNoteTime < ctx.currentTime + scheduleAheadTime) {
        const currentStep = step;
        const mNote = melody[currentStep % melody.length];
        const bNote = bass[Math.floor(currentStep / 2) % bass.length];

        // Apply distinct volumes and settings per disc type
        const vol = discType === BlockType.MUSIC_DISC_BLOCKS ? 0.05 : 0.035;
        playNote(nextNoteTime, mNote, stepDuration * 0.85, waveType, vol);
        
        // Accompanying bass track on alternate beats
        if (currentStep % 2 === 0) {
          playNote(nextNoteTime, bNote, stepDuration * 1.7, bassWaveType, vol * 1.4);
        }

        // Retro drum machine ticks
        if (discType === BlockType.MUSIC_DISC_CAT || discType === BlockType.MUSIC_DISC_CHIRP) {
          if (currentStep % 2 === 1) {
            playDrum(nextNoteTime);
          }
        }

        nextNoteTime += stepDuration;
        step++;
      }
    }, 45);

    activeJukeboxes[jukeboxKey] = {
      intervalId,
      nodes
    };
  } catch (err) {
    console.error("Failed to play jukebox music:", err);
  }
};

export const stopJukeboxMusic = (jukeboxKey: string) => {
  const active = activeJukeboxes[jukeboxKey];
  if (active) {
    clearInterval(active.intervalId);
    active.nodes.forEach(node => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch (e) {}
    });
    delete activeJukeboxes[jukeboxKey];
  }
};

export const stopAllJukeboxMusic = () => {
  Object.keys(activeJukeboxes).forEach(stopJukeboxMusic);
};
