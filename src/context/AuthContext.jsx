import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, hasFirebaseConfig } from '../firebase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const normalizeAuthError = (error) => {
    const code = error?.code;

    if (code === 'auth/email-already-in-use') return 'Email already registered';
    if (code === 'auth/invalid-email') return 'Invalid email address';
    if (code === 'auth/weak-password') return 'Password must be at least 6 characters';
    if (code === 'auth/user-not-found') return 'Invalid email or password';
    if (code === 'auth/wrong-password') return 'Invalid email or password';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';

    return error?.message || 'Something went wrong. Please try again.';
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // Local-only fallback user store (used only when Firebase env vars are missing).
    const [users, setUsers] = useState(() => {
        const saved = localStorage.getItem('users');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        if (!hasFirebaseConfig) {
            localStorage.setItem('users', JSON.stringify(users));
        }
    }, [users]);

    useEffect(() => {
        if (!hasFirebaseConfig || !auth) {
            setAuthLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                setCurrentUser(null);
                setAuthLoading(false);
                return;
            }

            setCurrentUser({
                id: user.uid,
                email: user.email,
                name: user.displayName || user.email,
            });
            setAuthLoading(false);
        });

        return unsubscribe;
    }, []);

    const signup = async (email, password, name) => {
        if (!email || !password || !name) {
            return { success: false, error: 'All fields are required' };
        }

        if (password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        // Local-only mode
        if (!hasFirebaseConfig || !auth) {
            if (users.some((u) => u.email === email)) {
                return { success: false, error: 'Email already registered' };
            }

            const newUser = {
                id: Date.now().toString(),
                email,
                password,
                name,
                createdAt: new Date().toISOString(),
            };

            setUsers((prev) => [...prev, newUser]);
            setCurrentUser({ id: newUser.id, email, name });
            return { success: true };
        }

        try {
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(credential.user, { displayName: name });

            setCurrentUser({
                id: credential.user.uid,
                email: credential.user.email,
                name,
            });

            if (db) {
                await setDoc(
                    doc(db, 'users', credential.user.uid),
                    {
                        email,
                        name,
                        createdAt: serverTimestamp(),
                    },
                    { merge: true },
                );
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: normalizeAuthError(error) };
        }
    };

    const login = async (email, password) => {
        if (!email || !password) {
            return { success: false, error: 'Email and password are required' };
        }

        // Local-only mode
        if (!hasFirebaseConfig || !auth) {
            const user = users.find((u) => u.email === email && u.password === password);
            if (!user) {
                return { success: false, error: 'Invalid email or password' };
            }
            setCurrentUser({ id: user.id, email: user.email, name: user.name });
            return { success: true };
        }

        try {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            setCurrentUser({
                id: credential.user.uid,
                email: credential.user.email,
                name: credential.user.displayName || credential.user.email,
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: normalizeAuthError(error) };
        }
    };

    const logout = async () => {
        if (!hasFirebaseConfig || !auth) {
            setCurrentUser(null);
            return { success: true };
        }

        await signOut(auth);
        setCurrentUser(null);
        return { success: true };
    };

    return (
        <AuthContext.Provider value={{ currentUser, authLoading, signup, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
