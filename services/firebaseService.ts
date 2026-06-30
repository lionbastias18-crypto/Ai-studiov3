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
  deleteDoc,
  collection,
  query,
  where,
  getDocFromServer,
  setLogLevel
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { World } from "./worldPersistence";

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
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn("Failed to initialize Firestore with persistent multi-tab cache, falling back to basic Firestore with long-polling.", e);
  try {
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true
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

// Operations error handling wrapper
enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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
      survivalInventory: world.survivalInventory || {}
    });
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
  const docPath = `worlds/${worldId}`;
  try {
    const docRef = doc(db, "worlds", worldId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
