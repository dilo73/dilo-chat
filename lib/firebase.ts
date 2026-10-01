// ─── Firebase setup ───────────────────────────────────────────────────────
// ★★★ PASTE YOUR FIREBASE KEYS BELOW (see SETUP.md, step 4) ★★★
// Until you paste real keys, the app runs in DEMO MODE:
//   • any 6-digit OTP code works
//   • chats use a built-in demo database (no internet needed)
// Nothing is sent anywhere in demo mode.

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  Firestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyBzzRYNLjKQKhnI5OXe4UC6lKlMY0nWWsM',
  authDomain: 'app33-e5f16.firebaseapp.com',
  projectId: 'app33-e5f16',
  storageBucket: 'app33-e5f16.firebasestorage.app',
  messagingSenderId: '32543902431',
  appId: '1:32543902431:web:c79f7cd261bc15a999776a',
};

export const isConfigured: boolean = !firebaseConfig.apiKey.startsWith('PASTE');

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestoreDb: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Offline persistence: old chats stay readable with no internet.
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager(),
    }),
  });
  storage = getStorage(app);
}

export { auth, firestoreDb, storage };
