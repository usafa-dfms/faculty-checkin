import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// To point this app at a different Firebase project, replace the config below
// with the one from the Firebase console (Project settings -> General -> Your apps).
const firebaseConfig = {
  apiKey: "AIzaSyAKbiWtAux3bGx5zOdWCvLfF2uIkVkQgQQ",
  authDomain: "dfms-a47ff.firebaseapp.com",
  projectId: "dfms-a47ff",
  storageBucket: "dfms-a47ff.firebasestorage.app",
  messagingSenderId: "160476616149",
  appId: "1:160476616149:web:57b421a569c3c614c5d95c",
  measurementId: "G-BG7JYDL9WP"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
