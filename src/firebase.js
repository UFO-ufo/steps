import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDoe0mqD_sFniCFbCpYvJcsXi23n1B5Y6s",
  authDomain: "tulsa-tech-walking-26.firebaseapp.com",
  projectId: "tulsa-tech-walking-26",
  storageBucket: "tulsa-tech-walking-26.firebasestorage.app",
  messagingSenderId: "302597093486",
  appId: "1:302597093486:web:bcf2d3f268b8fb2c2c0e7f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
