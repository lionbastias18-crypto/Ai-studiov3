
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
  SULFUR = 42
}

export enum EntityType {
  PIG = 'PIG',
  SHEEP = 'SHEEP',
  ZOMBIE = 'ZOMBIE',
  CREEPER = 'CREEPER',
  SKELETON = 'SKELETON',
  ARROW = 'ARROW',
  VILLAGER = 'VILLAGER'
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

export interface GeminiSuggestion {
  title: string;
  description: string;
  steps: string[];
}
