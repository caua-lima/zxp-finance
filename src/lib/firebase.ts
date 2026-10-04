import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Modo emulador (desenvolvimento e testes de ponta a ponta com usuários
 * sintéticos): Auth e Firestore locais, nunca a produção. Liga só com
 * NEXT_PUBLIC_EMULADOR=1 — ver `npm run dev:emulador` e docs/operacao.md.
 */
if (process.env.NEXT_PUBLIC_EMULADOR === "1" && !(globalThis as { __zxpEmulador?: boolean }).__zxpEmulador) {
  (globalThis as { __zxpEmulador?: boolean }).__zxpEmulador = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8089);
}
