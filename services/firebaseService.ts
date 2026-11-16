import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocFromServer,
  setLogLevel
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { World } from "./worldPersistence";
import { RealmData } from "../types";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Configure resilient Firestore with custom multi-tab local caching
let dbInstance;
try {
  setLogLevel("error");
} catch (e) {
  console.warn("Failed to set Firestore log level", e);
}

try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalAutoDetectLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn("Failed to initialize Firestore with persistent multi-tab cache, falling back to basic Firestore with auto-detect streaming.", e);
  try {
    dbInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true
    }, firebaseConfig.firestoreDatabaseId);
  } catch (err) {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = dbInstance;

// Verify connection as specified in the Firebase guidelines
async function testConnection() {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && !navigator.onLine) {
    console.warn("Firebase client is currently offline according to browser environment.");
    return;
  }
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const code = error?.code || "";
    if (code === "unavailable" || errMsg.includes("offline") || errMsg.includes("Could not reach")) {
      console.warn("Firebase client or backend is offline. Operating in offline/local fallback mode.", errMsg);
    } else {
      console.warn("Firestore connection check finished:", errMsg);
    }
  }
}
testConnection();

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

export const FIRESTORE_QUOTA_CONSOLE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

// Global quota circuit breaker: pauses background writes cleanly when Firestore hits free daily write limit
const QUOTA_PAUSE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cooldown before allowing retry
let quotaExceededUntil = 0;
let quotaErrorMessage: string | null = null;
const quotaListeners = new Set<(paused: boolean, message: string | null) => void>();

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as any;
  const code = typeof anyErr?.code === "string" ? anyErr.code.toLowerCase() : "";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    code === "resource-exhausted" ||
    code.endsWith("/resource-exhausted") ||
    msg.includes("resource-exhausted") ||
    msg.includes("quota limit exceeded") ||
    msg.includes("quota exceeded") ||
    msg.includes("free daily write units")
  );
}

export function isFirestoreWritePaused(): boolean {
  return Date.now() < quotaExceededUntil;
}

export function getFirestoreQuotaMessage(): string | null {
  return isFirestoreWritePaused() ? quotaErrorMessage : null;
}

export function onFirestoreQuotaChange(
  listener: (paused: boolean, message: string | null) => void
): () => void {
  quotaListeners.add(listener);
  return () => {
    quotaListeners.delete(listener);
  };
}

let lastQuotaLogTime = 0;
export function markFirestoreQuotaExceeded(error?: unknown): void {
  const alreadyPaused = isFirestoreWritePaused();
  quotaExceededUntil = Date.now() + QUOTA_PAUSE_DURATION_MS;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Firestore daily free write quota limit exceeded.";
  quotaErrorMessage = msg;

  const now = Date.now();
  if (now - lastQuotaLogTime > 30000) {
    lastQuotaLogTime = now;
    console.warn(
      `[Firestore Quota Guard] Free daily write quota reached. Pausing automatic cloud writes for 5 minutes and saving locally. Upgrade or inspect database: ${FIRESTORE_QUOTA_CONSOLE_URL}`
    );
  }

  if (!alreadyPaused) {
    quotaListeners.forEach((cb) => {
      try {
        cb(true, quotaErrorMessage);
      } catch {}
    });
  }
}

export function clearFirestoreQuotaPause(): void {
  const wasPaused = quotaExceededUntil > 0;
  quotaExceededUntil = 0;
  quotaErrorMessage = null;
  if (wasPaused) {
    quotaListeners.forEach((cb) => {
      try {
        cb(false, null);
      } catch {}
    });
  }
}

// Operations error handling wrapper
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  if (isQuotaExceededError(error)) {
    markFirestoreQuotaExceeded(error);
    throw new Error("FIRESTORE_QUOTA_EXCEEDED");
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error("Firestore Error Detailed info: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Public API Auth
export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Authentication error using Google:", error);
    throw error;
  }
}

export async function logoutGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error("Sign out error:", error);
    throw error;
  }
}

// Firestore Worlds API
export async function saveWorldToFirestore(world: World): Promise<void> {
  if (isFirestoreWritePaused()) {
    throw new Error("FIRESTORE_QUOTA_EXCEEDED");
  }
  const docPath = `worlds/${world.id}`;
  try {
    const docRef = doc(db, "worlds", world.id);
    await setDoc(docRef, {
      id: world.id,
      name: world.name,
      creator: world.creator,
      creatorName: world.creatorName || world.creator,
      createdAt: world.createdAt,
      playerPos: world.playerPos,
      gameMode: world.gameMode || "survival",
      worldType: world.worldType || "normal",
      edits: world.edits || {},
      blockColors: world.blockColors || {},
      survivalInventory: world.survivalInventory || {}
    });

    // Enforce 100-world limit per user
    const q = query(collection(db, "worlds"), where("creator", "==", world.creator));
    const snapshot = await getDocs(q);
    const userWorlds: { id: string; createdAt: number }[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      userWorlds.push({ id: doc.id, createdAt: data.createdAt || 0 });
    });

    if (userWorlds.length > 100 && !isFirestoreWritePaused()) {
      // Sort oldest first (ascending createdAt)
      userWorlds.sort((a, b) => a.createdAt - b.createdAt);
      const excessCount = userWorlds.length - 100;
      for (let i = 0; i < excessCount; i++) {
        if (isFirestoreWritePaused()) break;
        await deleteDoc(doc(db, "worlds", userWorlds[i].id));
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function loadWorldsFromFirestore(userId: string): Promise<World[]> {
  const colPath = "worlds";
  try {
    const q = query(collection(db, "worlds"), where("creator", "==", userId));
    const snapshot = await getDocs(q);
    const resultWorlds: World[] = [];
    snapshot.forEach((doc) => {
      const d = doc.data();
      resultWorlds.push({
        id: d.id,
        name: d.name,
        creator: d.creator,
        creatorName: d.creatorName,
        createdAt: d.createdAt,
        playerPos: d.playerPos || { x: 0, y: 80, z: 0 },
        gameMode: d.gameMode || "survival",
        worldType: d.worldType || "normal",
        edits: d.edits || {},
        blockColors: d.blockColors || {},
        survivalInventory: d.survivalInventory || {}
      });
    });
    return resultWorlds;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
    return [];
  }
}

export async function deleteWorldFromFirestore(worldId: string): Promise<void> {
  if (isFirestoreWritePaused()) {
    throw new Error("FIRESTORE_QUOTA_EXCEEDED");
  }
  const docPath = `worlds/${worldId}`;
  try {
    const docRef = doc(db, "worlds", worldId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function batchUpdateWorldInFirestore(
  worldId: string,
  patchFields: Record<string, any>
): Promise<void> {
  const keys = Object.keys(patchFields);
  if (keys.length === 0) return;
  if (isFirestoreWritePaused()) {
    throw new Error("FIRESTORE_QUOTA_EXCEEDED");
  }
  const docPath = `worlds/${worldId}`;
  try {
    const docRef = doc(db, "worlds", worldId);
    // Split huge batch updates into safe chunks (<= 1500 field patches per write)
    const CHUNK_LIMIT = 1500;
    for (let i = 0; i < keys.length; i += CHUNK_LIMIT) {
      if (isFirestoreWritePaused()) break;
      const slice: Record<string, any> = {};
      const end = Math.min(keys.length, i + CHUNK_LIMIT);
      for (let j = i; j < end; j++) {
        const k = keys[j];
        slice[k] = patchFields[k];
      }
      await updateDoc(docRef, slice);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

// Firestore Realms API
export async function createRealmInFirestore(realm: RealmData): Promise<void> {
  if (isFirestoreWritePaused()) {
    throw new Error("FIRESTORE_QUOTA_EXCEEDED");
  }
  const docPath = `realms/${realm.id}`;
  try {
    await setDoc(doc(db, "realms", realm.id), {
      id: realm.id,
      joinCode: realm.joinCode,
      name: realm.name,
      tier: realm.tier,
      maxFriends: realm.maxFriends,
      maxWorlds: realm.maxWorlds,
      ownerUid: realm.ownerUid,
      ownerEmail: realm.ownerEmail.toLowerCase(),
      ownerName: realm.ownerName || realm.ownerEmail,
      invitedEmails: realm.invitedEmails || [],
      memberEmails: realm.memberEmails || [],
      worldIds: realm.worldIds || [],
      worldsMeta: realm.worldsMeta || [],
      activeWorldId: realm.activeWorldId || "",
      createdAt: realm.createdAt,
      updatedAt: realm.updatedAt,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateRealmInFirestore(
  realmId: string,
  updates: Partial<RealmData>
): Promise<void> {
  if (isFirestoreWritePaused()) {
    throw new Error("FIRESTORE_QUOTA_EXCEEDED");
  }
  const docPath = `realms/${realmId}`;
  try {
    const cleanUpdates: Record<string, any> = { ...updates, updatedAt: updates.updatedAt || Date.now() };
    Object.keys(cleanUpdates).forEach((k) => {
      if (cleanUpdates[k] === undefined) delete cleanUpdates[k];
    });
    await updateDoc(doc(db, "realms", realmId), cleanUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteRealmFromFirestore(realmId: string): Promise<void> {
  const docPath = `realms/${realmId}`;
  try {
    await deleteDoc(doc(db, "realms", realmId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function getRealmByCodeFromFirestore(code: string): Promise<RealmData | null> {
  const cleanCode = code.trim().toUpperCase();
  const docPath = `realms/${cleanCode}`;
  try {
    const snap = await getDoc(doc(db, "realms", cleanCode));
    if (!snap.exists()) return null;
    return snap.data() as RealmData;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
    return null;
  }
}

