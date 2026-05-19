import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    setDoc,
    writeBatch,
} from 'firebase/firestore';
import { db, hasFirebaseConfig } from '../firebase';
import { useAuth } from './AuthContext';

const VoteContext = createContext();

export const useVote = () => useContext(VoteContext);

const emptySystem = { candidates: [], voters: [], auditLog: [] };

const generateTransactionId = () =>
    `TXN-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;

export const VoteProvider = ({ children }) => {
    const { currentUser } = useAuth();

    const firebaseEnabled = Boolean(hasFirebaseConfig && db);

    // Local-only fallback store: { userId: { candidates: [], voters: [], auditLog: [] } }
    const [allSystems, setAllSystems] = useState(() => {
        const saved = localStorage.getItem('votingSystems');
        return saved ? JSON.parse(saved) : {};
    });

    const [candidates, setCandidates] = useState([]);
    const [voters, setVoters] = useState([]);
    const [auditLog, setAuditLog] = useState([]);
    const [currentVoter, setCurrentVoter] = useState(null);

    const getUserSystem = () => {
        if (!currentUser) return emptySystem;
        return allSystems[currentUser.id] || emptySystem;
    };

    const saveUserSystem = (system) => {
        if (!currentUser) return;
        setAllSystems((prev) => ({ ...prev, [currentUser.id]: system }));
    };

    // Persist local-only store
    useEffect(() => {
        if (!firebaseEnabled) {
            localStorage.setItem('votingSystems', JSON.stringify(allSystems));
        }
    }, [allSystems, firebaseEnabled]);

    // Local-only: sync system <-> state
    useEffect(() => {
        if (firebaseEnabled) return;

        const system = getUserSystem();
        setCandidates(system.candidates);
        setVoters(system.voters);
        setAuditLog(system.auditLog);
        setCurrentVoter(null);
    }, [currentUser, allSystems, firebaseEnabled]);

    useEffect(() => {
        if (firebaseEnabled) return;
        if (!currentUser) return;

        saveUserSystem({ candidates, voters, auditLog });
    }, [candidates, voters, auditLog, firebaseEnabled]);

    // Firebase: realtime listeners
    useEffect(() => {
        if (!firebaseEnabled) return;
        if (!currentUser) {
            setCandidates([]);
            setVoters([]);
            setAuditLog([]);
            setCurrentVoter(null);
            return;
        }

        const candidatesRef = collection(db, 'systems', currentUser.id, 'candidates');
        const votersRef = collection(db, 'systems', currentUser.id, 'voters');
        const auditRef = collection(db, 'systems', currentUser.id, 'auditLog');

        const unsubCandidates = onSnapshot(candidatesRef, (snapshot) => {
            const rows = snapshot.docs
                .map((d) => {
                    const data = d.data();
                    const id = typeof data?.id === 'number' ? data.id : Number.parseInt(d.id, 10);
                    return {
                        id,
                        name: data?.name || '',
                        party: data?.party || '',
                        votes: typeof data?.votes === 'number' ? data.votes : 0,
                    };
                })
                .filter((c) => Number.isFinite(c.id))
                .sort((a, b) => a.id - b.id);
            setCandidates(rows);
        });

        const unsubVoters = onSnapshot(votersRef, (snapshot) => {
            const rows = snapshot.docs.map((d) => ({
                cnic: d.id,
                hasVoted: true,
            }));
            setVoters(rows);
        });

        const unsubAudit = onSnapshot(auditRef, (snapshot) => {
            const rows = snapshot.docs.map((d) => {
                const data = d.data();
                const ts = data?.timestamp;
                const iso = ts?.toDate ? ts.toDate().toISOString() : data?.timestamp || null;
                return {
                    id: data?.id || d.id,
                    voterHash: data?.voterHash || '',
                    candidateId:
                        typeof data?.candidateId === 'number'
                            ? data.candidateId
                            : Number.parseInt(String(data?.candidateId ?? ''), 10),
                    timestamp: iso || new Date().toISOString(),
                };
            });
            setAuditLog(rows);
        });

        return () => {
            unsubCandidates();
            unsubVoters();
            unsubAudit();
        };
    }, [currentUser, firebaseEnabled]);

    // --- ACTIONS ---

    const loginVoter = (role, credentials = {}) => {
        if (role === 'admin') {
            if (credentials.username === 'admin' && credentials.password === 'admin123') {
                setCurrentVoter({ role: 'admin' });
                return { success: true };
            }
            return { success: false, error: 'Invalid Admin Credentials' };
        }
        if (role === 'auditor') {
            setCurrentVoter({ role: 'auditor' });
            return { success: true };
        }
        if (role === 'candidate') {
            setCurrentVoter({ role: 'candidate' });
            return { success: true };
        }
        return { success: false, error: 'Role not supported yet' };
    };

    const logoutVoter = () => setCurrentVoter(null);

    const registerVoter = async (details) => {
        const name = details?.name?.trim();
        const cnic = details?.cnic?.trim();
        const age = Number(details?.age);

        if (!name || !cnic || !Number.isFinite(age)) {
            return { success: false, error: 'All fields are required.' };
        }

        if (age < 18) return { success: false, error: 'Not Eligible: Under 18' };

        const cnicRegex = /^[0-9]{5}-[0-9]{7}-[0-9]$/;
        if (!cnicRegex.test(cnic)) {
            return { success: false, error: 'Invalid CNIC Format (e.g., 12345-1234567-1)' };
        }

        if (!currentUser) return { success: false, error: 'Please log in first.' };

        // Firebase: check voters collection ("already voted")
        if (firebaseEnabled) {
            const voterRef = doc(db, 'systems', currentUser.id, 'voters', cnic);
            const existing = await getDoc(voterRef);
            if (existing.exists()) {
                return { success: false, error: 'Not Eligible: Already Voted' };
            }
        } else {
            if (voters.some((v) => v.cnic === cnic)) {
                return { success: false, error: 'Not Eligible: Already Voted' };
            }
        }

        setCurrentVoter({ role: 'voter', data: { name, cnic, age } });
        return { success: true };
    };

    const castVote = async (candidateId) => {
        if (!currentUser) return { success: false, error: 'Please log in first.' };
        if (!currentVoter || currentVoter.role !== 'voter') {
            return { success: false, error: 'Not authorized to vote.' };
        }

        const candidateNumericId = Number(candidateId);
        if (!Number.isFinite(candidateNumericId)) {
            return { success: false, error: 'Invalid candidate selection.' };
        }

        const cnic = currentVoter?.data?.cnic;
        if (!cnic) return { success: false, error: 'Missing voter identity.' };

        const transactionId = generateTransactionId();

        // Local-only mode
        if (!firebaseEnabled) {
            setCandidates((prev) =>
                prev.map((c) => (c.id === candidateNumericId ? { ...c, votes: c.votes + 1 } : c)),
            );
            setVoters((prev) => [...prev, { cnic, hasVoted: true }]);
            setAuditLog((prev) => [
                ...prev,
                {
                    id: transactionId,
                    voterHash: `User-${cnic.slice(-4)}`,
                    candidateId: candidateNumericId,
                    timestamp: new Date().toISOString(),
                },
            ]);
            setCurrentVoter(null);
            return { success: true, transactionId };
        }

        try {
            const candidateRef = doc(
                db,
                'systems',
                currentUser.id,
                'candidates',
                String(candidateNumericId),
            );
            const voterRef = doc(db, 'systems', currentUser.id, 'voters', cnic);
            const auditRef = doc(db, 'systems', currentUser.id, 'auditLog', transactionId);

            await runTransaction(db, async (tx) => {
                const [candidateSnap, voterSnap] = await Promise.all([
                    tx.get(candidateRef),
                    tx.get(voterRef),
                ]);

                if (!candidateSnap.exists()) {
                    throw new Error('Candidate not found.');
                }
                if (voterSnap.exists()) {
                    throw new Error('Not Eligible: Already Voted');
                }

                tx.update(candidateRef, { votes: increment(1) });
                tx.set(voterRef, { cnic, hasVoted: true, votedAt: serverTimestamp() });
                tx.set(auditRef, {
                    id: transactionId,
                    voterHash: `User-${cnic.slice(-4)}`,
                    candidateId: candidateNumericId,
                    timestamp: serverTimestamp(),
                });
            });

            setCurrentVoter(null);
            return { success: true, transactionId };
        } catch (error) {
            return { success: false, error: error?.message || 'Failed to cast vote.' };
        }
    };

    const resetElection = async () => {
        if (!currentUser) return;

        if (!firebaseEnabled) {
            setCandidates((prev) => prev.map((c) => ({ ...c, votes: 0 })));
            setVoters([]);
            setAuditLog([]);
            return;
        }

        const batch = writeBatch(db);

        const candidatesSnap = await getDocs(
            collection(db, 'systems', currentUser.id, 'candidates'),
        );
        candidatesSnap.forEach((d) => {
            batch.update(d.ref, { votes: 0 });
        });

        const votersSnap = await getDocs(collection(db, 'systems', currentUser.id, 'voters'));
        votersSnap.forEach((d) => batch.delete(d.ref));

        const auditSnap = await getDocs(collection(db, 'systems', currentUser.id, 'auditLog'));
        auditSnap.forEach((d) => batch.delete(d.ref));

        await batch.commit();
    };

    const addCandidate = async (newCandidate) => {
        if (!currentUser) return;

        const name = newCandidate?.name?.trim();
        const party = newCandidate?.party?.trim();
        if (!name || !party) return;

        const id = candidates.length > 0 ? Math.max(...candidates.map((c) => c.id)) + 1 : 1;

        if (!firebaseEnabled) {
            setCandidates((prev) => [...prev, { id, name, party, votes: 0 }]);
            return;
        }

        await setDoc(doc(db, 'systems', currentUser.id, 'candidates', String(id)), {
            id,
            name,
            party,
            votes: 0,
            createdAt: serverTimestamp(),
        });
    };

    const removeCandidate = async (candidateId) => {
        if (!currentUser) return;
        const id = Number(candidateId);
        if (!Number.isFinite(id)) return;

        if (!firebaseEnabled) {
            setCandidates((prev) => prev.filter((c) => c.id !== id));
            return;
        }

        await deleteDoc(doc(db, 'systems', currentUser.id, 'candidates', String(id)));
    };

    return (
        <VoteContext.Provider
            value={{
                candidates,
                voters,
                auditLog,
                currentVoter,
                loginVoter,
                logoutVoter,
                registerVoter,
                castVote,
                resetElection,
                addCandidate,
                removeCandidate,
            }}
        >
            {children}
        </VoteContext.Provider>
    );
};
