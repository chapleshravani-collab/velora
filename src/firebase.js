import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDmsx_5C0vATkL60PMtSUp_p3cUSQQDAus",
  authDomain: "velora-1-bc871.firebaseapp.com",
  projectId: "velora-1-bc871",
  storageBucket: "velora-1-bc871.firebasestorage.app",
  messagingSenderId: "1069479883548",
  appId: "1:1069479883548:web:21dcc1677cb59056f140d9",
  measurementId: "G-K5PPPVXNZR",
  databaseURL: "https://velora-1-bc871-default-rtdb.firebaseio.com"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
