
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
};

let bgMusicStarted = false;
export const playBackgroundMusic = () => {
    const ctx = initAudio();
    if (bgMusicStarted) return;
    bgMusicStarted = true;

    const playChord = () => {
        if (ctx.state === 'suspended') return;
        const scale = [261.63, 293.66, 329.63, 392.00, 440.00]; // C D E G A
        const root = scale[Math.floor(Math.random() * scale.length)];
        const freqMultiplier = Math.random() > 0.5 ? 0.5 : 1; 
        const frequencies = [root * freqMultiplier, root * 1.25 * freqMultiplier, root * 1.5 * freqMultiplier]; 
        
        frequencies.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.015, ctx.currentTime + 4);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 10);

            let filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 10.5);
        });
    };

    setInterval(playChord, 12000);
    playChord();
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
