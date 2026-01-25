// src/context/Firebase.js
import { initializeApp } from "firebase/app";
import { createContext, useContext, useState, useEffect } from "react";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signInAnonymously
} from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, addDoc } from "firebase/firestore";

const FirebaseContext = createContext(null);
export const useFirebase = () => useContext(FirebaseContext);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
export { firebaseApp as app };

export const FirebaseProvider = ({ children = null }) => {
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      // Only set state if we haven't manually set a teacher (role check could be improved)
      // For now, simple check: if we have a user and it's NOT anonymous (unless we want anon sessions to persist?)
      // Actually, for this fix, we WANT auth usage.

      // If we manually logged in a teacher, 'currentUser' might have extra fields like 'role'.
      // Firebase 'user' object is standard.
      // We'll trust the Standard Auth flow for now, but preserve manual teacher overrides if needed.

      if (user) {
        setIsUserLoggedIn(true);
        // If it's a standard auth user, set it. 
        // If it's an anonymous user used for Teacher access, we might want to keep the "Teacher Profile" as current user.
        // This logic is tricky mixing local Teacher state + Auth state.
        // To be safe: We only sync if we don't have a specific "Teacher" role executing.
        setCurrentUser(prev => (prev?.role === 'teacher' ? prev : user));
      } else {
        // AUTO-LOGIN GUEST (Student)
        // If no user is logged in, sign in anonymously to give "Read Access" to DB
        console.log("No user found, signing in anonymously as Guest...");
        try {
          await signInAnonymously(firebaseAuth);
          // State will update on next onAuthStateChanged trigger
        } catch (error) {
          console.error("Anonymous Auth Failed:", error);
          setIsUserLoggedIn(false);
          setCurrentUser(null);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signupuser = async (email, password) => {
    return await createUserWithEmailAndPassword(firebaseAuth, email, password);
  };

  const loginuser = async (email, password) => {
    return await signInWithEmailAndPassword(firebaseAuth, email, password);
  };


  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  const loginWithGoogle = async () => {

    return await signInWithPopup(firebaseAuth, provider);
  };



  const addTeacher = async (teacherData) => {
    const db = getFirestore(firebaseApp);
    try {
      const docRef = await addDoc(collection(db, "teachers"), {
        name: teacherData.name,
        subject: teacherData.subject || "General",
        topics: teacherData.topics || ["General"],
        rating: 5,
        ratingCount: 0,
        authenticity: Math.floor(Math.random() * 15) + 80,
        bias: Math.floor(Math.random() * 15) + 5,
        // No Auth UID needed as teachers are just data entities now
        createdAt: new Date()
      });
      return docRef.id;
    } catch (error) {
      console.error("Error adding teacher:", error);
      throw error;
    }
  };

  const value = {
    signupuser,
    loginuser,
    loginWithGoogle,
    isUserLoggedIn,
    currentUser,
    addTeacher
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};
