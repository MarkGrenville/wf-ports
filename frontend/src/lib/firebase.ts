import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

// Emulator-only mode. The cloud Firebase project (portio-ea1df) is no longer used.
// `demo-` prefix tells the SDK this is an emulator project — no real auth needed.
const firebaseConfig = {
  projectId: "demo-portio",
  apiKey: "demo",
  appId: "demo",
};

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8181;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
    connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
  }
  return db;
}
