import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

/**
 * Optional Firebase. All six web config values must be present in `.env.local`
 * before anything here initialises — without them the canvas stays on IndexedDB
 * and this module is a no-op.
 *
 * These values are *not* secrets. Firebase web config is designed to ship in
 * the client; access control lives in Firestore rules, not in hiding the keys.
 * `FLOWAI_API_KEY` (the model key) is the one that must stay off the bundle.
 */

function readConfig() {
  const env = import.meta.env
  const apiKey = env.VITE_FIREBASE_API_KEY
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID
  const appId = env.VITE_FIREBASE_APP_ID
  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null
  }
  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }
}

let app: FirebaseApp | null = null
let db: Firestore | null = null

export function firebaseEnabled(): boolean {
  return readConfig() !== null
}

export function getFirebaseDb(): Firestore | null {
  const config = readConfig()
  if (!config) return null
  if (db) return db
  app = getApps()[0] ?? initializeApp(config)
  db = getFirestore(app)
  return db
}
