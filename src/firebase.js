import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyAlZ8uVGHOHkP8WypfrnpPxAbPCPQIhuDk",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "fir-project-d305e.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "fir-project-d305e",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "fir-project-d305e.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "756903066135",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:756903066135:web:f993b6529db0ff1ca27a52",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// Secondary app for Admin/HR creating employee accounts without signing out current Admin/HR
export function getSecondaryAuth() {
  const secondaryName = "SecondaryAdminProvisioningApp";
  const existing = getApps().find((a) => a.name === secondaryName);
  const secApp = existing || initializeApp(firebaseConfig, secondaryName);
  return getAuth(secApp);
}
