import { InjectionToken } from "@angular/core";
import {
  User as FbUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";

/**
 * Narrow surface AuthService depends on. Hiding the raw firebase/auth functions
 * behind an Angular injection token makes AuthService testable with TestBed
 * providers — the Angular test runner does not allow `vi.mock` on relative
 * imports, so the prior implementation (direct module imports) could not be
 * unit-tested without a real Firebase config.
 */
export interface FirebaseAuthGateway {
  readonly currentUser: FbUser | null;
  onAuthStateChanged(callback: (user: FbUser | null) => void): void;
  signIn(email: string, password: string): Promise<void>;
  register(email: string, password: string, name?: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordResetEmail(email: string): Promise<void>;
  getIdToken(): Promise<string | null>;
}

export const FIREBASE_AUTH_GATEWAY = new InjectionToken<FirebaseAuthGateway>("FIREBASE_AUTH_GATEWAY", {
  providedIn: "root",
  factory: () => realFirebaseAuthGateway(),
});

function realFirebaseAuthGateway(): FirebaseAuthGateway {
  return {
    get currentUser() {
      return firebaseAuth.currentUser;
    },
    onAuthStateChanged(callback) {
      onAuthStateChanged(firebaseAuth, callback);
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    },
    async register(email, password, name) {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (name && cred.user) {
        await updateProfile(cred.user, { displayName: name });
      }
    },
    async signOut() {
      await fbSignOut(firebaseAuth);
    },
    async sendPasswordResetEmail(email) {
      await fbSendPasswordResetEmail(firebaseAuth, email);
    },
    async getIdToken() {
      const u = firebaseAuth.currentUser;
      return u ? u.getIdToken() : null;
    },
  };
}
