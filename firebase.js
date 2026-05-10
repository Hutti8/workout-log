// ============================================================
// firebase.js - Firebase setup
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBY-z5hTcWxNtghUvvTqPv8FRaxMiC5Uyc",
  authDomain: "workout-log-75da0.firebaseapp.com",
  projectId: "workout-log-75da0",
  storageBucket: "workout-log-75da0.firebasestorage.app",
  messagingSenderId: "360850044828",
  appId: "1:360850044828:web:047f80a7ede93b2c9f7a59"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const MAX_ACCOUNTS = 10;

async function registerUser(email, password) {
  const metaRef = doc(db, 'meta', 'accountCount');
  const metaSnap = await getDoc(metaRef);
  const count = metaSnap.exists() ? metaSnap.data().count : 0;
  if (count >= MAX_ACCOUNTS) throw new Error('Maximum number of accounts reached. No new registrations allowed.');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(metaRef, { count: count + 1 });
  await setDoc(doc(db, 'users', cred.user.uid, 'data', 'main'), getDefaultState());
  return cred.user;
}

async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

async function logoutUser() {
  await signOut(auth);
}

function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

async function loadUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'data', 'main'));
  if (snap.exists()) return snap.data();
  const defaults = getDefaultState();
  await setDoc(doc(db, 'users', uid, 'data', 'main'), defaults);
  return defaults;
}

async function saveUserData(uid, data) {
  await setDoc(doc(db, 'users', uid, 'data', 'main'), data);
}

function getDefaultState() {
  return {
    // Warmup types now store name + custom fields
    warmupTypes: [
      { name: 'Treadmill', fields: ['Speed', 'Elevation'] },
      { name: 'Stationary bike', fields: ['Speed', 'Load'] },
      { name: 'Rowing machine', fields: ['Load'] },
    ],
    // Cardio types same structure
    cardioTypes: [
      { name: 'Walk', fields: [] },
      { name: 'Cross trainer', fields: ['Load'] },
      { name: 'Treadmill', fields: ['Speed', 'Elevation'] },
      { name: 'Stair master', fields: ['Load'] },
    ],
    days: [
      { name: 'Day 1', exercises: [{ name: 'Bench press', sets: 4, reps: 10, kg: 60, lastNote: '' }, { name: 'Overhead press', sets: 3, reps: 10, kg: 40, lastNote: '' }, { name: 'Tricep dips', sets: 3, reps: 12, kg: 0, lastNote: '' }] },
      { name: 'Day 2', exercises: [{ name: 'Deadlift', sets: 4, reps: 8, kg: 80, lastNote: '' }, { name: 'Pull-ups', sets: 4, reps: 8, kg: 0, lastNote: '' }, { name: 'Barbell curl', sets: 3, reps: 12, kg: 30, lastNote: '' }] },
      { name: 'Day 3', exercises: [{ name: 'Squat', sets: 4, reps: 10, kg: 70, lastNote: '' }, { name: 'Leg press', sets: 3, reps: 12, kg: 100, lastNote: '' }, { name: 'Calf raises', sets: 4, reps: 15, kg: 40, lastNote: '' }] },
      { name: 'Day 4', exercises: [{ name: 'Incline press', sets: 3, reps: 10, kg: 50, lastNote: '' }, { name: 'Lateral raises', sets: 3, reps: 12, kg: 12, lastNote: '' }, { name: 'Face pulls', sets: 3, reps: 15, kg: 20, lastNote: '' }] },
    ],
    history: [],
  };
}

export { auth, db, registerUser, loginUser, logoutUser, onAuthChange, loadUserData, saveUserData };