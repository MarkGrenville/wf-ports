import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD43e22v94e6FNyBFjqQvdHKEOdko_doRs",
  authDomain: "portio-ea1df.firebaseapp.com",
  projectId: "portio-ea1df",
  storageBucket: "portio-ea1df.firebasestorage.app",
  messagingSenderId: "853069629248",
  appId: "1:853069629248:web:b2f94a344b9df008ff5ca5",
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getDb(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}
