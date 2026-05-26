import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, hasDemoMode, hasFirebaseConfig } from '../firebase';
import { classifyFirebaseError } from '../utils/firebaseErrors';

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
    if (code === 'auth/network-request-failed') return 'Network error while contacting Firebase Auth.';

    return error?.message || 'Something went wrong. Please try again.';
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authError, setAuthError] = useState('');

    const [users, setUsers] = useState(() => {
        if (!hasDemoMode) {
            return [];
        }

        const saved = localStorage.getItem('users');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        if (hasDemoMode) {
            localStorage.setItem('users', JSON.stringify(users));
        }
    }, [users]);

    useEffect(() => {
        if (hasDemoMode || !hasFirebaseConfig || !auth) {
            setAuthLoading(false);
            return undefined;
        }

        let settled = false;
        const timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            setAuthError('Firebase auth initialization timed out. Check network access, Auth configuration, and browser connectivity.');
            setAuthLoading(false);
        }, 10000);

        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                setAuthError('');

                if (user?.isAnonymous) {
                    setCurrentUser(null);
                    setAuthLoading(false);
                    return;
                }

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
            },
            (error) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                setAuthError(classifyFirebaseError(error, 'Firebase auth initialization failed.'));
                setAuthLoading(false);
            },
        );

        return () => {
            settled = true;
            window.clearTimeout(timeoutId);
            unsubscribe();
        };
    }, []);

    const signup = async (email, password, name) => {
        if (!email || !password || !name) {
            return { success: false, error: 'All fields are required' };
        }

        if (password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        if (hasDemoMode || !hasFirebaseConfig || !auth) {
            if (users.some((user) => user.email === email)) {
                return { success: false, error: 'Email already registered' };
            }

            const newUser = {
                id: Date.now().toString(),
                email,
                password,
                name,
                createdAt: new Date().toISOString(),
            };

            setUsers((previous) => [...previous, newUser]);
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

            setAuthError('');
            return { success: true };
        } catch (error) {
            const message = classifyFirebaseError(error, normalizeAuthError(error));
            setAuthError(message);
            return { success: false, error: message };
        }
    };

    const login = async (email, password) => {
        if (!email || !password) {
            return { success: false, error: 'Email and password are required' };
        }

        if (hasDemoMode || !hasFirebaseConfig || !auth) {
            const user = users.find((entry) => entry.email === email && entry.password === password);
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
            setAuthError('');
            return { success: true };
        } catch (error) {
            const message = classifyFirebaseError(error, normalizeAuthError(error));
            setAuthError(message);
            return { success: false, error: message };
        }
    };

    const logout = async () => {
        if (hasDemoMode || !hasFirebaseConfig || !auth) {
            setCurrentUser(null);
            return { success: true };
        }

        await signOut(auth);
        setCurrentUser(null);
        return { success: true };
    };

    return (
        <AuthContext.Provider value={{ currentUser, authLoading, authError, signup, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};