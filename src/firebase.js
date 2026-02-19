// ─────────────────────────────────────────────────────────────────────────────
// STEP: Paste your Firebase config here
//
// 1. Go to https://console.firebase.google.com
// 2. Open your project → Project Settings (gear icon) → General tab
// 3. Scroll to "Your apps" → click the </> Web app icon
// 4. Copy the firebaseConfig object and paste the values below
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            "AIzaSyCvpXzX_LK_Ll1A79-dFEUPO5hWrF-duvY",
  authDomain:        "tulsa-tech-walking.firebaseapp.com",
  projectId:         "tulsa-tech-walking",
  storageBucket:     "tulsa-tech-walking.firebasestorage.app",
  messagingSenderId: "509364326649",
  appId:             "1:509364326649:web:6a7b71dfd8ccbb6865d228",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
