import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// TODO: Add these variables to your .env file
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// ─── Firebase Emulator (E2E Firebase tests only) ─────────────────────────────
// Connect to local emulators when VITE_USE_FIREBASE_EMULATOR=true (.env.e2e-firebase).
// Must be called immediately after initialization, before any Firebase operations.
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
}

// Request permissions for Google Calendar Management
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
// Optional: also readonly base scope to just fetch calendar list if needed
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');

// Force account selection so users can switch between Google accounts
googleProvider.setCustomParameters({
    prompt: 'select_account'
});
