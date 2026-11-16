import { Vector3D } from "../types";

export interface Profile {
  username: string;
  pin: string; // PIN or simple password
}

export interface World {
  id: string;
  name: string;
  creator: string; // Creator's username, email, ID or "Invitado" (Guest)
  creatorName?: string; // Display name
  createdAt: number;
  playerPos: Vector3D;
  gameMode: "creative" | "survival" | "adventure" | "spectator";
  worldType: "flat" | "normal" | "edge_farlands";
  edits: Record<string, number>; // Key: "x,y,z", Value: BlockType (0 for air)
  blockColors?: Record<string, string>; // Key: "x,y,z", Value: "#RRGGBB" custom block color
  survivalInventory?: Record<number, number>;
}

const PROFILES_KEY = "infdev_profiles_v1";
const WORLDS_KEY = "infdev_worlds_v1";
const SESSION_KEY = "infdev_session_v1";

export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Error loading profiles", e);
    return [];
  }
}

export function saveProfiles(profiles: Profile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error("Error saving profiles", e);
  }
}

export function loadWorlds(): World[] {
  try {
    const raw = localStorage.getItem(WORLDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Error loading worlds", e);
    return [];
  }
}

export function saveWorlds(worlds: World[]): void {
  try {
    // Sort descending by createdAt (most recent first) and keep at most 70
    const sorted = [...worlds].sort((a, b) => b.createdAt - a.createdAt);
    const limited = sorted.slice(0, 70);
    localStorage.setItem(WORLDS_KEY, JSON.stringify(limited));
  } catch (e) {
    console.error("Error saving worlds", e);
  }
}

export function getActiveSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch (e) {
    return null;
  }
}

export function setActiveSession(username: string | null): void {
  try {
    if (username) {
      localStorage.setItem(SESSION_KEY, username);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (e) {}
}

export function createDefaultWorldForUser(creator: string): World {
  return {
    id: `world_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name: "Mi Mundo",
    creator: creator,
    createdAt: Date.now(),
    playerPos: { x: 0, y: 80, z: 0 },
    gameMode: "survival",
    worldType: "normal",
    edits: {},
    survivalInventory: {
      1: 32, // DIRT
      3: 16, // WOOD
      13: 8, // LOG
      25: 1, // CRAFTING_TABLE
      14: 8, // TORCH
    },
  };
}
