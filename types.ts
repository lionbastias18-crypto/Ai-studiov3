
export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  WOOD = 4,
  LEAVES = 5,
  BEDROCK = 6,
  WATER = 7,
  SAND = 8,
  LOG = 9,
  MUSHROOM_RED = 10,
  MUSHROOM_BROWN = 11,
  TERRACOTTA_WHITE = 12,
  TERRACOTTA_ORANGE = 13,
  TERRACOTTA_RED = 14,
  TERRACOTTA_YELLOW = 15,
  TERRACOTTA_BROWN = 16,
  TERRACOTTA_LIGHT_GRAY = 17,
  CACTUS = 18,
  FLOWER_RED = 19,
  FLOWER_YELLOW = 20,
  LAVA = 21,
  OBSIDIAN = 22,
  BUCKET_EMPTY = 23,
  BUCKET_WATER = 24,
  BUCKET_LAVA = 25,
  BED = 26,
  TORCH = 27,
  DOOR = 28,
  CRAFTING_TABLE = 29,
  COAL_ORE = 30,
  IRON_ORE = 31,
  GOLD_ORE = 32,
  REDSTONE_ORE = 33,
  DIAMOND_ORE = 34,
  COPPER_ORE = 35,
  COPPER_BLOCK = 36,
  OXIDIZED_COPPER = 37,
  SWORD = 38,
  PICKAXE = 39,
  AXE = 40,
  SHOVEL = 41,
  SULFUR = 42,
  JUKEBOX = 43,
  MUSIC_DISC_CAT = 44,
  MUSIC_DISC_CHIRP = 45,
  MUSIC_DISC_BLOCKS = 46,
  MUSIC_DISC_MELLOHI = 47,
  SNOW = 48,
  AUTUMN_GRASS = 49,
  AUTUMN_LEAVES = 50,
  GREY_LOG = 51,
  GREY_WOOD = 52,
  AUTUMN_FLOWER = 53,
  NETHERRACK = 54,
  SOUL_SAND = 55,
  GLOWSTONE = 56,
  NETHER_QUARTZ_ORE = 57,
  NETHER_BRICKS = 58,
  CRIMSON_NYLIUM = 59,
  WARPED_NYLIUM = 60,
  PORTAL = 61,
  MOSS = 62,
  VINES = 63,
  CUSHION = 64,
  WOOL = 65,
  WOOL_STAIRS = 66,
  CONCRETE = 67,
  CONCRETE_STAIRS = 68,
  GRAVEL = 69,
  FIRE = 70,
  FLINT_AND_STEEL = 71,
  MAP = 72,
  LOCATOR_MAP = 73,
  REDSTONE = 74,
  SUGAR_CANE = 75,
  PAPER = 76,
  SUGAR = 77,
  CARTOGRAPHY_TABLE = 78,
  FURNACE = 79,
  BAMBOO = 80,
  CHEST = 81,
  FROG_EGGS = 82,
  CHICKEN_EGG = 83,
  CHERRY_LOG = 84,
  CHERRY_LEAVES = 85,
  CHERRY_WOOD = 86,
  DARK_LOG = 87,
  DARK_LEAVES = 88,
  DARK_GRASS = 89,
  WOOD_SWORD = 90,
  WOOD_PICKAXE = 91,
  WOOD_SHOVEL = 92,
  STONE_SWORD = 93,
  STONE_AXE = 94,
  IRON_PICKAXE = 95,
  IRON_AXE = 96,
  IRON_SHOVEL = 97,
  GOLD_SWORD = 98,
  GOLD_PICKAXE = 99,
  GOLD_AXE = 100,
  GOLD_SHOVEL = 101,
  DIAMOND_SWORD = 102,
  DIAMOND_PICKAXE = 103,
  DIAMOND_AXE = 104,
  DIAMOND_SHOVEL = 105
}

export enum EntityType {
  PIG = 'PIG',
  SHEEP = 'SHEEP',
  ZOMBIE = 'ZOMBIE',
  CREEPER = 'CREEPER',
  SKELETON = 'SKELETON',
  ARROW = 'ARROW',
  VILLAGER = 'VILLAGER',
  HOGLIN = 'HOGLIN',
  CAT = 'CAT',
  IRON_GOLEM = 'IRON_GOLEM',
  ZOMBIFIED_PIGLIN = 'ZOMBIFIED_PIGLIN',
  ENDERMAN = 'ENDERMAN',
  SNOW_SKELETON = 'SNOW_SKELETON',
  SWAMP_SKELETON = 'SWAMP_SKELETON',
  WOLF = 'WOLF',
  FROG = 'FROG',
  CHICKEN = 'CHICKEN'
}

export interface EntityData {
  id: string;
  type: EntityType;
  pos: Vector3D;
  rot: number;
}

export enum ToolType {
  HAND = 'HAND',
  PICKAXE = 'PICKAXE',
  AXE = 'AXE'
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface GameState {
  currentBlock: BlockType;
  currentTool: ToolType;
  isInventoryOpen: boolean;
  inventory: BlockType[];
  pos: Vector3D;
  chunks: Record<string, Uint8Array>;
}

export interface NoiseConfig {
  simplex3DEnabled: boolean;
  simplex3DThreshold: number;
  simplex3DScaleX: number;
  simplex3DScaleY: number;
  simplex3DScaleZ: number;

  ridgedEnabled: boolean;
  ridgedFreq: number;
  ridgedAmp: number;
  ridgedWeight: number;

  fbmEnabled: boolean;
  fbmOctaves: number;
  fbmFreq: number;
  fbmAmp: number;
  fbmLacunarity: number;
  fbmGain: number;

  tempEnabled: boolean;
  tempFreq: number;
}

export interface PerformanceConfig {
  renderDistance: number;
  simulationDistance: number;
  maxConcurrentChunks: number;
  lightingQuality: 'high' | 'low';
  particlesEnabled: boolean;
  maxEntities: number;
  effectsQuality: 'high' | 'low';
}

export type CharacterSkinId =
  | 'cyber'
  | 'knight'
  | 'explorer'
  | 'mage'
  | 'classic'
  | 'shadow'
  | 'dragon'
  | 'angel'
  | 'titan'
  | 'poseidon'
  | 'obsidian'
  | 'custom';

export interface CustomCharacterConfig {
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
  capeColor: string;
}

export interface ActivePlayerInfo {
  id: string;
  name: string;
  pos: Vector3D;
  yaw?: number;
  pitch?: number;
  skinId?: CharacterSkinId;
  customSkin?: CustomCharacterConfig;
  heldBlock?: BlockType;
  attackSeq?: number;
  dimension: string;
}

export type GeminiAgentGoal =
  | 'explore_far'
  | 'chop_trees'
  | 'mine_surface'
  | 'dig_mine'
  | 'build_camp'
  | 'hunt_mobs'
  | 'escape_hazard';

export interface GeminiAgentConfig {
  enabled: boolean;
  name: string;
  skinId: CharacterSkinId;
  autonomyStyle: 'balanced' | 'miner' | 'explorer' | 'builder';
}

export interface GeminiAgentOutcome {
  goal: GeminiAgentGoal;
  action: string;
  reward: number;
  y: number;
  biome: string;
  timestamp: number;
}

export interface GeminiAgentMemory {
  xp: number;
  level: number;
  blocksMined: number;
  oresFound: number;
  mobsDefeated: number;
  campsBuilt: number;
  deaths: number;
  maxDistanceReached: number;
  strategyScores: Record<GeminiAgentGoal, number>;
  recentOutcomes: GeminiAgentOutcome[];
  learnedLessons: string[];
  lastThought: string;
  lastModel: string;
}

export interface GeminiAgentTelemetry {
  pos: Vector3D;
  distanceFromPlayer: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  goal: GeminiAgentGoal;
  targetY: number;
  statusLabel: string;
  biome: string;
  geminiConnected: boolean;
  geminiError: string | null;
  modelName: string;
  bagSummary: Record<number, number>;
  memory: GeminiAgentMemory;
}

export type RealmPlanTier = 'none' | 'basic' | 'plus';

export interface RealmWorldMeta {
  id: string;
  name: string;
  gameMode: 'creative' | 'survival' | 'adventure' | 'spectator';
  worldType: 'flat' | 'normal' | 'edge_farlands';
  createdAt: number;
}

export interface RealmData {
  id: string;
  joinCode: string;
  name: string;
  tier: 'basic' | 'plus';
  maxFriends: 2 | 4;
  maxWorlds: 3 | 6;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  invitedEmails: string[];
  memberEmails: string[];
  worldIds: string[];
  worldsMeta: RealmWorldMeta[];
  activeWorldId?: string;
  createdAt: number;
  updatedAt: number;
}

export type RealmEditorTool = 'none' | 'sphere' | 'erase_sphere' | 'paint' | 'platform';

export interface RealmEditorConfig {
  enabled: boolean;
  tool: RealmEditorTool;
  radius: number;
  fillPercent: number; // 0 = hollow shell, 1-99 = porous density %, 100 = solid
  replaceExisting: boolean;
  selectedColor: string;
  applyColorToShapes: boolean;
  eraseColorMode: boolean;
  paintRadius: number;
}

export interface RealmBatchEditPayload {
  blockChanges: Record<string, number>; // "x,y,z" -> BlockType (0 = AIR)
  colorChanges: Record<string, string | null>; // "x,y,z" -> "#RRGGBB" or null to clear
  summaryLabel?: string;
}

