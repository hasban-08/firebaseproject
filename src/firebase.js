import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
   apiKey: "AIzaSyAlZ8uVGHOHkP8WypfrnpPxAbPCPQIhuDk",
  authDomain: "fir-project-d305e.firebaseapp.com",
  projectId: "fir-project-d305e",
  storageBucket: "fir-project-d305e.firebasestorage.app",
  messagingSenderId: "756903066135",
  appId: "1:756903066135:web:f993b6529db0ff1ca27a52"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});