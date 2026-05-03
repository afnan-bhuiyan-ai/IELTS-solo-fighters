/**
 * firebase-config.js
 * ==================
 * IELTS Solo Fighters — Firebase setup
 *
 * HOW TO SET UP (free):
 * 1. Go to https://firebase.google.com and sign in with Google
 * 2. Click "Add project" → name it "ielts-solo-fighters"
 * 3. In your project, click "Web" icon (</>) to register a web app
 * 4. Copy the firebaseConfig object below and replace the placeholder values
 * 5. In Firebase console:
 *    - Authentication → Get started → Enable "Email/Password" and "Google"
 *    - Firestore Database → Create database → Start in "test mode"
 * 6. Deploy to GitHub Pages — done!
 *
 * IMPORTANT: Your API key is safe to expose in client-side code for Firebase.
 * Firebase security rules (not the API key) protect your data.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// 🔧 REPLACE THESE VALUES with your Firebase project config
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAMwV70ZR2eCzOvY4BWbmrmIGSnB9CsuAo",
  authDomain: "ielts-solo-fighters.firebaseapp.com",
  projectId: "ielts-solo-fighters",
  storageBucket: "ielts-solo-fighters.firebasestorage.app",
  messagingSenderId: "376790107958",
  appId: "1:376790107958:web:ab9bba77011a8f30e49597",
  measurementId: "G-4L8LV1PFC9"
};
// ============================================================

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider };
