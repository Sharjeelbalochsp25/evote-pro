import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    setDoc,
    writeBatch,
} from 'firebase/firestore';
import { auth, db, hasDemoMode, hasFirebaseConfig } from '../firebase';
import { useAuth } from './AuthContext';
import { classifyFirebaseError, withRetry } from '../utils/firebaseErrors';
import { maskInviteToken, recordClientError, recordClientEvent } from '../utils/clientObservability';
import { trackAnalyticsEvent } from '../firebase';

const VoteContext = createContext();

export const useVote = () => useContext(VoteContext);

const emptyElectionData = { candidates: [], voters: [], auditLog: [], inviteTokens: [] };
const emptyLocalUserState = { elections: [], activeElectionId: null, electionData: {} };
const LOCAL_STORAGE_KEY = 'electionSystemsV2';
const PUBLIC_ELECTIONS_COLLECTION = 'publicElections';

export const VERIFICATION_METHODS = [
    {
        value: 'CNIC',
        label: 'CNIC',
        placeholder: '35202-1234567-1',
        regex: /^[0-9]{5}-[0-9]{7}-[0-9]$/,
        error: 'Invalid CNIC format (12345-1234567-1)',
    },
    {
        value: 'STUDENT_ID',
        label: 'Student ID',
        placeholder: 'S12345678',
        regex: /^[A-Za-z0-9\-\s]{3,20}$/,
        error: 'Invalid Student ID format',
    },
    {
        value: 'EMPLOYEE_ID',
        label: 'Employee ID',
        placeholder: 'EMP-12345',
        regex: /^[A-Za-z0-9\-\s]{3,20}$/,
        error: 'Invalid Employee ID format',
    },
    {
        value: 'PASSPORT',
        label: 'Passport',
        placeholder: 'A1234567',
        regex: /^[A-Za-z0-9]{5,20}$/,
        error: 'Invalid Passport format',
    },
    {
        value: 'PHONE_NUMBER',
        label: 'Phone Number',
        placeholder: '+923001234567',
        regex: /^\+?[0-9]{10,15}$/,
        error: 'Invalid phone number format',
    },
    {
        value: 'CUSTOM',
        label: 'Custom Field',
        placeholder: 'Enter identifier',
        regex: /^.{3,100}$/,
        error: 'Custom identifier must be at least 3 characters',
    },
];

export const DEFAULT_VERIFICATION_METHOD = VERIFICATION_METHODS[0];

const getMethodConfig = (value) => VERIFICATION_METHODS.find((method) => method.value === value) || DEFAULT_VERIFICATION_METHOD;

const loadLocalState = () => {
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
};

const createPublicLink = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    }

    return Math.random().toString(36).slice(2, 12);
};

const toBallotCandidate = (candidate) => ({
    id: candidate.id,
    name: candidate.name,
    party: candidate.party,
});

const buildInviteToken = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    }

    let token = '';
    while (token.length < 10) {
        token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return token;
};

const buildPublicElectionData = (election, candidates = []) => ({
    creatorId: election.creatorId,
    electionId: election.id,
    publicCode: election.publicCode || election.publicLink || '',
    title: election.title,
    description: election.description,
    isActive: election.isActive !== false,
    verification: election.verification || { method: DEFAULT_VERIFICATION_METHOD.value, customLabel: '' },
    ballotCandidates: candidates.map(toBallotCandidate),
    createdAt: election.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

const normalizeTimestamp = (value) => {
    if (!value) return new Date().toISOString();
    if (typeof value === 'string') return value;
    if (typeof value?.toDate === 'function') return value.toDate().toISOString();
    return new Date().toISOString();
};

const mapElectionDoc = (snapshot) => {
    const data = snapshot.data() || {};
    return {
        id: snapshot.id,
        title: data.title || 'Untitled Election',
        description: data.description || '',
        creatorId: data.creatorId || '',
        publicLink: data.publicLink || data.publicCode || '',
        publicCode: data.publicCode || data.publicLink || '',
        isActive: data.isActive !== false,
        createdAt: normalizeTimestamp(data.createdAt),
        updatedAt: normalizeTimestamp(data.updatedAt || data.createdAt),
        verification: data.verification || { method: DEFAULT_VERIFICATION_METHOD.value, customLabel: '' },
    };
};

const mapCandidateDoc = (snapshot) => {
    const data = snapshot.data() || {};
    const id = typeof data.id === 'number' ? data.id : Number.parseInt(snapshot.id, 10);

    return {
        id,
        name: data.name || '',
        party: data.party || '',
        votes: typeof data.votes === 'number' ? data.votes : 0,
        createdAt: normalizeTimestamp(data.createdAt),
    };
};

const mapVoterDoc = (snapshot) => ({
    identifier: snapshot.id,
    hasVoted: true,
    votedAt: normalizeTimestamp(snapshot.data()?.votedAt),
});

const mapAuditDoc = (snapshot) => {
    const data = snapshot.data() || {};
    return {
        id: data.id || snapshot.id,
        voterHash: data.voterHash || '',
        candidateId:
            typeof data.candidateId === 'number'
                ? data.candidateId
                : Number.parseInt(String(data.candidateId ?? ''), 10),
        timestamp: normalizeTimestamp(data.timestamp),
    };
};

const mapInviteDoc = (snapshot) => {
    const data = snapshot.data() || {};

    return {
        token: data.token || snapshot.id,
        used: data.used === true,
        usedBy: data.usedBy || '',
        usedAt: normalizeTimestamp(data.usedAt),
        createdAt: normalizeTimestamp(data.createdAt),
        updatedAt: normalizeTimestamp(data.updatedAt || data.createdAt),
    };
};

const sortByNewest = (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
const sortById = (left, right) => left.id - right.id;

const getUserState = (store, userId) => store[userId] || emptyLocalUserState;

export const VoteProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const firebaseEnabled = Boolean(hasFirebaseConfig && auth && db && !hasDemoMode);

    const [localStore, setLocalStore] = useState(() => (hasDemoMode ? loadLocalState() : {}));
    const [elections, setElections] = useState([]);
    const [activeElectionId, setActiveElectionId] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [voters, setVoters] = useState([]);
    const [auditLog, setAuditLog] = useState([]);
    const [inviteTokens, setInviteTokens] = useState([]);
    const [currentVoter, setCurrentVoter] = useState(null);
    const [backendError, setBackendError] = useState('');
    const clearVoterSession = () => {
        setCurrentVoter((previous) => (previous?.role === 'voter' ? null : previous));
    };

    const activeElection = elections.find((election) => election.id === activeElectionId) || null;

    const logOperationalEvent = (type, message, details = {}) => {
        const contextualDetails = {
            userId: currentUser?.id || '',
            electionId: activeElectionId || '',
            electionTitle: activeElection?.title || '',
            ...details,
        };

        recordClientEvent(type, message, contextualDetails);
        void trackAnalyticsEvent(type.replace(/[^a-z0-9]+/gi, '_').toLowerCase(), contextualDetails);
    };

    const logOperationalError = (action, error, details = {}) => {
        recordClientError(`ElectionContext.${action}`, error, {
            userId: currentUser?.id || '',
            electionId: activeElectionId || '',
            ...details,
        });

        void trackAnalyticsEvent('admin_action_error', {
            action,
            user_id: currentUser?.id || '',
            election_id: activeElectionId || '',
        });
    };

    useEffect(() => {
        if (!firebaseEnabled) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localStore));
        }
    }, [firebaseEnabled, localStore]);

    useEffect(() => {
        if (firebaseEnabled) return;

        if (!currentUser) {
            setElections([]);
            setActiveElectionId(null);
            setCandidates([]);
            setVoters([]);
            setAuditLog([]);
            setInviteTokens([]);
            setCurrentVoter(null);
            return;
        }

        const userState = getUserState(localStore, currentUser.id);
        const nextElections = Array.isArray(userState.elections) ? userState.elections : [];
        const nextActiveElectionId = userState.activeElectionId || null;
        const nextElectionData = nextActiveElectionId
            ? userState.electionData?.[nextActiveElectionId] || emptyElectionData
            : emptyElectionData;

        setElections(nextElections);
        setActiveElectionId(nextActiveElectionId);
        setCandidates(nextElectionData.candidates || []);
        setVoters(nextElectionData.voters || []);
        setAuditLog(nextElectionData.auditLog || []);
        setInviteTokens(nextElectionData.inviteTokens || []);
        setCurrentVoter(null);
    }, [currentUser, firebaseEnabled]);

    useEffect(() => {
        if (firebaseEnabled || !currentUser) return;

        setLocalStore((prev) => {
            const previousUserState = getUserState(prev, currentUser.id);
            const nextUserState = {
                ...previousUserState,
                elections,
                activeElectionId,
                electionData: {
                    ...(previousUserState.electionData || {}),
                    ...(activeElectionId
                        ? {
                              [activeElectionId]: {
                                  candidates,
                                  voters,
                                  auditLog,
                                  inviteTokens,
                              },
                          }
                        : {}),
                },
            };

            return {
                ...prev,
                [currentUser.id]: nextUserState,
            };
        });
    }, [currentUser, firebaseEnabled, elections, activeElectionId, candidates, voters, auditLog, inviteTokens]);

    useEffect(() => {
        if (!firebaseEnabled || !currentUser) {
            if (!firebaseEnabled) {
                setCandidates([]);
                setVoters([]);
                setAuditLog([]);
                clearVoterSession();
            }
            return;
        }

        const electionsRef = collection(db, 'users', currentUser.id, 'elections');

        const unsubscribe = onSnapshot(
            electionsRef,
            (snapshot) => {
                const rows = snapshot.docs.map(mapElectionDoc).sort(sortByNewest);
                setBackendError('');
                setElections(rows);

                setActiveElectionId((currentActiveElectionId) => {
                    if (rows.length === 0) return null;
                    if (currentActiveElectionId && rows.some((election) => election.id === currentActiveElectionId)) {
                        return currentActiveElectionId;
                    }
                    return rows[0].id;
                });
            },
            (error) => {
                setBackendError(classifyFirebaseError(error, 'Firestore is unavailable.'));
            },
        );

        return unsubscribe;
    }, [currentUser, firebaseEnabled]);

    useEffect(() => {
        if (!firebaseEnabled || !currentUser || !activeElectionId) {
            setCandidates([]);
            setVoters([]);
            setAuditLog([]);
            setInviteTokens([]);
            clearVoterSession();
            return;
        }

        const activePublicCode = activeElection?.publicCode || activeElection?.publicLink || '';
        const basePath = ['users', currentUser.id, 'elections', activeElectionId];
        const candidatesRef = collection(db, ...basePath, 'candidates');
        const votersRef = collection(db, ...basePath, 'voters');
        const auditRef = collection(db, ...basePath, 'auditLog');
        const invitesRef = activePublicCode ? collection(db, 'publicElections', activePublicCode, 'invites') : null;

        const unsubscribeCandidates = onSnapshot(
            candidatesRef,
            (snapshot) => {
                const rows = snapshot.docs.map(mapCandidateDoc).filter((candidate) => Number.isFinite(candidate.id)).sort(sortById);
                setBackendError('');
                setCandidates(rows);
            },
            (error) => {
                setBackendError(classifyFirebaseError(error, 'Firestore candidates listener failed.'));
            },
        );

        const unsubscribeVoters = onSnapshot(
            votersRef,
            (snapshot) => {
                const rows = snapshot.docs.map(mapVoterDoc);
                setVoters(rows);
            },
            (error) => {
                setBackendError(classifyFirebaseError(error, 'Firestore voters listener failed.'));
            },
        );

        const unsubscribeAudit = onSnapshot(
            auditRef,
            (snapshot) => {
                const rows = snapshot.docs.map(mapAuditDoc).sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
                setAuditLog(rows);
            },
            (error) => {
                setBackendError(classifyFirebaseError(error, 'Firestore audit listener failed.'));
            },
        );

        const unsubscribeInvites = invitesRef
            ? onSnapshot(
                  invitesRef,
                  (snapshot) => {
                      const rows = snapshot.docs.map(mapInviteDoc).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
                      setInviteTokens(rows);
                  },
                  (error) => {
                      setBackendError(classifyFirebaseError(error, 'Firestore invite listener failed.'));
                  },
              )
            : () => setInviteTokens([]);

        return () => {
            unsubscribeCandidates();
            unsubscribeVoters();
            unsubscribeAudit();
            unsubscribeInvites();
        };
    }, [currentUser, firebaseEnabled, activeElectionId, activeElection]);

    const saveLocalStateForElection = (electionId, updater) => {
        if (!currentUser || !electionId) return;

        setLocalStore((prev) => {
            const previousUserState = getUserState(prev, currentUser.id);
            const previousElectionData = previousUserState.electionData || {};
            const currentElectionData = previousElectionData[electionId] || emptyElectionData;
            const nextElectionData = updater(currentElectionData);

            return {
                ...prev,
                [currentUser.id]: {
                    ...previousUserState,
                    electionData: {
                        ...previousElectionData,
                        [electionId]: nextElectionData,
                    },
                },
            };
        });
    };

    const saveLocalElectionList = (nextElections, nextActiveElectionId) => {
        if (!currentUser) return;

        setLocalStore((prev) => {
            const previousUserState = getUserState(prev, currentUser.id);

            return {
                ...prev,
                [currentUser.id]: {
                    ...previousUserState,
                    elections: nextElections,
                    activeElectionId: nextActiveElectionId,
                },
            };
        });
    };

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

    const createElection = async (details = {}) => {
        if (!currentUser) {
            return { success: false, error: 'Please log in first.' };
        }

        const title = details.title?.trim();
        const description = details.description?.trim() || '';

        if (!title) {
            return { success: false, error: 'Election title is required.' };
        }

        if (!firebaseEnabled) {
            const electionId = Date.now().toString();
            const verification = details.verification || { method: DEFAULT_VERIFICATION_METHOD.value, customLabel: '' };
            const publicCode = createPublicLink();

            const election = {
                id: electionId,
                title,
                description,
                creatorId: currentUser.id,
                publicLink: publicCode,
                publicCode,
                isActive: true,
                verification,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const nextElections = [election, ...elections];
            setElections(nextElections);
            setActiveElectionId(electionId);
            setCandidates([]);
            setVoters([]);
            setAuditLog([]);
            saveLocalElectionList(nextElections, electionId);
            saveLocalStateForElection(electionId, () => emptyElectionData);
            logOperationalEvent('admin:create-election', `Created election "${title}"`, {
                electionId,
                publicCode,
            });
            return { success: true, election };
        }

        try {
            const electionsRef = collection(db, 'users', currentUser.id, 'elections');
            const verification = details.verification || { method: DEFAULT_VERIFICATION_METHOD.value, customLabel: '' };
            const publicCode = createPublicLink();
            const electionDocRef = doc(electionsRef);
            const publicElectionRef = doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode);

            const electionData = {
                title,
                description,
                creatorId: currentUser.id,
                publicLink: publicCode,
                publicCode,
                isActive: true,
                verification,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            const batch = writeBatch(db);
            batch.set(electionDocRef, electionData);
            batch.set(publicElectionRef, {
                ...electionData,
                electionId: electionDocRef.id,
                ballotCandidates: [],
            });

            await withRetry(() => batch.commit(), { attempts: 3, baseDelayMs: 400 });

            setBackendError('');

            setActiveElectionId(electionDocRef.id);
            logOperationalEvent('admin:create-election', `Created election "${title}"`, {
                electionId: electionDocRef.id,
                publicCode,
            });
            return {
                success: true,
                election: {
                    id: electionDocRef.id,
                    title,
                    description,
                    creatorId: currentUser.id,
                    publicLink: publicCode,
                    publicCode,
                    isActive: true,
                    verification,
                },
            };
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to create election.');
            setBackendError(message);
            logOperationalError('createElection', error, { title });
            return { success: false, error: message };
        }
    };

    const selectElection = (electionId) => {
        if (!electionId) return;

        setActiveElectionId(electionId);

        if (!firebaseEnabled && currentUser) {
            const userState = getUserState(localStore, currentUser.id);
            const nextElectionData = userState.electionData?.[electionId] || emptyElectionData;
            setCandidates(nextElectionData.candidates || []);
            setVoters(nextElectionData.voters || []);
            setAuditLog(nextElectionData.auditLog || []);
        }
    };

    const registerVoter = async (details) => {
        const name = details?.name?.trim();
        const identifier = details?.identifier?.trim();
        const age = Number(details?.age);

        if (!name || !identifier || !Number.isFinite(age)) {
            return { success: false, error: 'All fields are required.' };
        }

        if (age < 18) return { success: false, error: 'Not Eligible: Under 18' };

        if (!currentUser) return { success: false, error: 'Please log in first.' };
        if (!activeElectionId) return { success: false, error: 'Create or select an election first.' };

        // Determine verification method from active election
        const verification = activeElection?.verification || { method: DEFAULT_VERIFICATION_METHOD.value, customLabel: '' };
        const methodConfig = getMethodConfig(verification.method);

        // Validate identifier format using method config
        if (methodConfig && methodConfig.regex && !methodConfig.regex.test(identifier)) {
            return { success: false, error: methodConfig.error };
        }

        if (firebaseEnabled) {
            try {
                const voterRef = doc(db, 'users', currentUser.id, 'elections', activeElectionId, 'voters', identifier);
                const existing = await withRetry(() => getDoc(voterRef), { attempts: 2, baseDelayMs: 250 });
                if (existing.exists()) {
                    return { success: false, error: 'Not Eligible: Already Voted' };
                }
            } catch (error) {
                const message = classifyFirebaseError(error, 'Unable to verify voter eligibility.');
                setBackendError(message);
                return { success: false, error: message };
            }
        } else {
            const alreadyRegistered = voters.some((voter) => voter.identifier === identifier);
            if (alreadyRegistered) {
                return { success: false, error: 'Not Eligible: Already Voted' };
            }
            saveLocalStateForElection(activeElectionId, (currentElectionData) => ({
                ...currentElectionData,
                voters: [...(currentElectionData.voters || []), { identifier, hasVoted: true, votedAt: new Date().toISOString() }],
            }));
        }

        setCurrentVoter({ role: 'voter', data: { name, identifier, age } });
        return { success: true };
    };

    const castVote = async (candidateId) => {
        if (!currentUser) return { success: false, error: 'Please log in first.' };
        if (!activeElectionId) return { success: false, error: 'Create or select an election first.' };
        if (!currentVoter || currentVoter.role !== 'voter') {
            return { success: false, error: 'Not authorized to vote.' };
        }

        const candidateNumericId = Number(candidateId);
        if (!Number.isFinite(candidateNumericId)) {
            return { success: false, error: 'Invalid candidate selection.' };
        }

        const identifier = currentVoter?.data?.identifier;
        if (!identifier) return { success: false, error: 'Missing voter identity.' };

        const transactionId = `TXN-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
        try {
            if (!firebaseEnabled) {
                const existingCandidate = candidates.find((candidate) => candidate.id === candidateNumericId);
                if (!existingCandidate) {
                    return { success: false, error: 'Candidate not found.' };
                }

                setCandidates((prev) =>
                    prev.map((candidate) =>
                        candidate.id === candidateNumericId
                            ? { ...candidate, votes: candidate.votes + 1 }
                            : candidate,
                    ),
                );
                setVoters((prev) => [...prev, { identifier, hasVoted: true, votedAt: new Date().toISOString() }]);
                setAuditLog((prev) => [
                    ...prev,
                    {
                        id: transactionId,
                        voterHash: `User-${String(identifier).slice(-4)}`,
                        candidateId: candidateNumericId,
                        timestamp: new Date().toISOString(),
                    },
                ]);
                saveLocalStateForElection(activeElectionId, (currentElectionData) => ({
                    candidates: candidates.map((candidate) =>
                        candidate.id === candidateNumericId ? { ...candidate, votes: candidate.votes + 1 } : candidate,
                    ),
                    voters: [...(currentElectionData.voters || []), { identifier, hasVoted: true, votedAt: new Date().toISOString() }],
                    auditLog: [
                        ...(currentElectionData.auditLog || []),
                        {
                            id: transactionId,
                            voterHash: `User-${String(identifier).slice(-4)}`,
                            candidateId: candidateNumericId,
                            timestamp: new Date().toISOString(),
                        },
                    ],
                }));
                setCurrentVoter(null);
                return { success: true, transactionId };
            }

            const electionRef = doc(db, 'users', currentUser.id, 'elections', activeElectionId);
            const candidateRef = doc(db, 'users', currentUser.id, 'elections', activeElectionId, 'candidates', String(candidateNumericId));
            const voterRef = doc(db, 'users', currentUser.id, 'elections', activeElectionId, 'voters', identifier);
            const auditRef = doc(db, 'users', currentUser.id, 'elections', activeElectionId, 'auditLog', transactionId);

            await withRetry(() => runTransaction(db, async (transaction) => {
                const [electionSnap, candidateSnap, voterSnap] = await Promise.all([
                    transaction.get(electionRef),
                    transaction.get(candidateRef),
                    transaction.get(voterRef),
                ]);

                if (!electionSnap.exists()) {
                    throw new Error('Election not found.');
                }

                const electionData = electionSnap.data() || {};
                if (electionData.isActive === false) {
                    throw new Error('This election is closed.');
                }

                if (!candidateSnap.exists()) {
                    throw new Error('Candidate not found.');
                }

                if (voterSnap.exists()) {
                    throw new Error('Not eligible: Already voted');
                }

                const currentVotes = Number(candidateSnap.data()?.votes || 0);
                const publicCode = electionData.publicCode || electionData.publicLink || '';

                transaction.set(voterRef, {
                    identifier,
                    name: currentVoter?.data?.name || '',
                    age: Number(currentVoter?.data?.age),
                    candidateId: candidateNumericId,
                    publicCode,
                    hasVoted: true,
                    votedAt: serverTimestamp(),
                });

                transaction.set(auditRef, {
                    id: transactionId,
                    voterHash: `User-${String(identifier).slice(-4)}`,
                    candidateId: candidateNumericId,
                    publicCode,
                    timestamp: serverTimestamp(),
                });

                transaction.update(candidateRef, {
                    votes: currentVotes + 1,
                    updatedAt: serverTimestamp(),
                });
            }), { attempts: 3, baseDelayMs: 300 });

            setBackendError('');
            setCurrentVoter(null);
            return { success: true, transactionId };
        } catch (error) {
            const rawMessage = error?.message || error?.details || 'Failed to cast vote.';
            const message = typeof rawMessage === 'string' ? rawMessage.replace(/^internal\s*/i, '').trim() : 'Failed to cast vote.';
            setBackendError(classifyFirebaseError(error, message));
            return { success: false, error: message };
        }
    };

    const resetElection = async () => {
        if (!currentUser || !activeElectionId) return { success: false, error: 'Create or select an election first.' };

        if (!firebaseEnabled) {
            const resetCandidates = candidates.map((candidate) => ({ ...candidate, votes: 0 }));
            setCandidates(resetCandidates);
            setVoters([]);
            setAuditLog([]);
            saveLocalStateForElection(activeElectionId, () => ({
                candidates: resetCandidates,
                voters: [],
                auditLog: [],
            }));
            return { success: true };
        }

        try {
            const batch = writeBatch(db);
            const candidatesSnap = await withRetry(
                () => getDocs(collection(db, 'users', currentUser.id, 'elections', activeElectionId, 'candidates')),
                { attempts: 2, baseDelayMs: 250 },
            );
            candidatesSnap.forEach((snapshot) => {
                batch.update(snapshot.ref, { votes: 0 });
            });

            const votersSnap = await withRetry(
                () => getDocs(collection(db, 'users', currentUser.id, 'elections', activeElectionId, 'voters')),
                { attempts: 2, baseDelayMs: 250 },
            );
            votersSnap.forEach((snapshot) => batch.delete(snapshot.ref));

            const auditSnap = await withRetry(
                () => getDocs(collection(db, 'users', currentUser.id, 'elections', activeElectionId, 'auditLog')),
                { attempts: 2, baseDelayMs: 250 },
            );
            auditSnap.forEach((snapshot) => batch.delete(snapshot.ref));

            await withRetry(() => batch.commit(), { attempts: 3, baseDelayMs: 400 });
            setBackendError('');
            logOperationalEvent('admin:reset-election', 'Reset election vote totals and logs', {
                electionId: activeElectionId,
            });
            return { success: true };
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to reset election.');
            setBackendError(message);
            logOperationalError('resetElection', error, { electionId: activeElectionId });
            return { success: false, error: message };
        }
    };

    const finishElection = async (electionId, closed = true) => {
        if (!currentUser || !electionId) return { success: false, error: 'Create or select an election first.' };

        if (!firebaseEnabled) {
            const nextElections = elections.map((e) => (e.id === electionId ? { ...e, isActive: !closed ? true : false } : e));
            setElections(nextElections);
            saveLocalElectionList(nextElections, activeElectionId === electionId ? null : activeElectionId);
            return { success: true };
        }

        try {
            const electionRef = doc(db, 'users', currentUser.id, 'elections', electionId);
            await withRetry(
                () => setDoc(electionRef, { isActive: closed ? false : true, updatedAt: serverTimestamp() }, { merge: true }),
                { attempts: 3, baseDelayMs: 300 },
            );

            // update public mirror if exists
            const publicCode = (elections.find((e) => e.id === electionId) || {}).publicCode || (elections.find((e) => e.id === electionId) || {}).publicLink;
            if (publicCode) {
                await withRetry(
                    () => setDoc(doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode), { isActive: closed ? false : true, updatedAt: serverTimestamp() }, { merge: true }),
                    { attempts: 3, baseDelayMs: 300 },
                );
            }

            setBackendError('');
            logOperationalEvent(closed ? 'admin:close-election' : 'admin:open-election', `${closed ? 'Closed' : 'Opened'} election`, {
                electionId,
                publicCode,
            });
            return { success: true };
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to update election state.');
            setBackendError(message);
            logOperationalError('finishElection', error, { electionId, closed });
            return { success: false, error: message };
        }
    };

    const deleteElection = async (electionId) => {
        if (!currentUser || !electionId) return { success: false, error: 'Create or select an election first.' };

        if (!firebaseEnabled) {
            const nextElections = elections.filter((e) => e.id !== electionId);
            setElections(nextElections);
            if (activeElectionId === electionId) setActiveElectionId(nextElections[0]?.id || null);
            saveLocalElectionList(nextElections, activeElectionId === electionId ? (nextElections[0]?.id || null) : activeElectionId);
            return { success: true };
        }

        // delete candidates, voters, auditLog and election doc, and public mirror
        try {
            const batch = writeBatch(db);
            const candidatesSnap = await withRetry(
                () => getDocs(collection(db, 'users', currentUser.id, 'elections', electionId, 'candidates')),
                { attempts: 2, baseDelayMs: 250 },
            );
            candidatesSnap.forEach((s) => batch.delete(s.ref));

            const votersSnap = await withRetry(
                () => getDocs(collection(db, 'users', currentUser.id, 'elections', electionId, 'voters')),
                { attempts: 2, baseDelayMs: 250 },
            );
            votersSnap.forEach((s) => batch.delete(s.ref));

            const auditSnap = await withRetry(
                () => getDocs(collection(db, 'users', currentUser.id, 'elections', electionId, 'auditLog')),
                { attempts: 2, baseDelayMs: 250 },
            );
            auditSnap.forEach((s) => batch.delete(s.ref));

            const electionRef = doc(db, 'users', currentUser.id, 'elections', electionId);
            batch.delete(electionRef);

            await withRetry(() => batch.commit(), { attempts: 3, baseDelayMs: 400 });

            // delete public mirror if present
            const publicCode = (elections.find((e) => e.id === electionId) || {}).publicCode || (elections.find((e) => e.id === electionId) || {}).publicLink;
            if (publicCode) {
                await withRetry(() => deleteDoc(doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode)), { attempts: 3, baseDelayMs: 300 });
            }

            // update local state
            const nextElections = elections.filter((e) => e.id !== electionId);
            setElections(nextElections);
            if (activeElectionId === electionId) setActiveElectionId(nextElections[0]?.id || null);
            setBackendError('');
            logOperationalEvent('admin:delete-election', 'Deleted election and associated records', {
                electionId,
                publicCode,
            });

            return { success: true };
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to delete election.');
            setBackendError(message);
            logOperationalError('deleteElection', error, { electionId });
            return { success: false, error: message };
        }
    };

    const addCandidate = async (newCandidate) => {
        if (!currentUser || !activeElectionId) return;

        const name = newCandidate?.name?.trim();
        const party = newCandidate?.party?.trim();
        if (!name || !party) return;

        const nextId = candidates.length > 0 ? Math.max(...candidates.map((candidate) => candidate.id)) + 1 : 1;
        const candidateRecord = {
            id: nextId,
            name,
            party,
            votes: 0,
            createdAt: new Date().toISOString(),
        };

        if (!firebaseEnabled) {
            const nextCandidates = [...candidates, candidateRecord];
            setCandidates(nextCandidates);
            saveLocalStateForElection(activeElectionId, (currentElectionData) => ({
                ...currentElectionData,
                candidates: nextCandidates,
            }));
            return candidateRecord;
        }

        try {
            await withRetry(
                () => setDoc(doc(db, 'users', currentUser.id, 'elections', activeElectionId, 'candidates', String(nextId)), {
                    ...candidateRecord,
                    createdAt: serverTimestamp(),
                }),
                { attempts: 3, baseDelayMs: 300 },
            );

            const publicCode = activeElection?.publicCode || activeElection?.publicLink;
            if (publicCode) {
                await withRetry(
                    () => setDoc(
                        doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode),
                        {
                            ballotCandidates: [...candidates, candidateRecord].map(toBallotCandidate),
                            updatedAt: serverTimestamp(),
                        },
                        { merge: true },
                    ),
                    { attempts: 3, baseDelayMs: 300 },
                );
            }

            setBackendError('');
            logOperationalEvent('admin:add-candidate', `Added candidate ${name}`, {
                candidateId: nextId,
                publicCode,
            });
            return candidateRecord;
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to add candidate.');
            setBackendError(message);
            logOperationalError('addCandidate', error, { candidateName: name });
            return { success: false, error: message };
        }
    };

    const removeCandidate = async (candidateId) => {
        if (!currentUser || !activeElectionId) return;

        const id = Number(candidateId);
        if (!Number.isFinite(id)) return;

        if (!firebaseEnabled) {
            const nextCandidates = candidates.filter((candidate) => candidate.id !== id);
            setCandidates(nextCandidates);
            saveLocalStateForElection(activeElectionId, (currentElectionData) => ({
                ...currentElectionData,
                candidates: nextCandidates,
            }));
            return;
        }

        try {
            await withRetry(() => deleteDoc(doc(db, 'users', currentUser.id, 'elections', activeElectionId, 'candidates', String(id))), { attempts: 3, baseDelayMs: 300 });

            const publicCode = activeElection?.publicCode || activeElection?.publicLink;
            if (publicCode) {
                const nextCandidates = candidates.filter((candidate) => candidate.id !== id);
                await withRetry(
                    () => setDoc(
                        doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode),
                        {
                            ballotCandidates: nextCandidates.map(toBallotCandidate),
                            updatedAt: serverTimestamp(),
                        },
                        { merge: true },
                    ),
                    { attempts: 3, baseDelayMs: 300 },
                );
            }

            setBackendError('');
            logOperationalEvent('admin:remove-candidate', `Removed candidate ${id}`, {
                candidateId: id,
                publicCode,
            });
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to remove candidate.');
            setBackendError(message);
            logOperationalError('removeCandidate', error, { candidateId: id });
            return { success: false, error: message };
        }
    };

    const generateInviteTokens = async (count = 1) => {
        if (!currentUser || !activeElectionId) return { success: false, error: 'Create or select an election first.' };

        const inviteCount = Math.max(1, Math.min(100, Number(count) || 1));
        const publicCode = activeElection?.publicCode || activeElection?.publicLink || '';
        if (!publicCode) return { success: false, error: 'Select an active public election first.' };

        const tokens = Array.from({ length: inviteCount }, () => buildInviteToken());

        if (!firebaseEnabled) {
            const now = new Date().toISOString();
            const nextInvites = [...inviteTokens, ...tokens.map((token) => ({
                token,
                creatorId: currentUser.id,
                publicCode,
                electionId: activeElectionId,
                used: false,
                usedBy: '',
                usedAt: '',
                createdAt: now,
                updatedAt: now,
            }))];
            setInviteTokens(nextInvites);
            saveLocalStateForElection(activeElectionId, (currentElectionData) => ({
                ...currentElectionData,
                inviteTokens: nextInvites,
            }));
            return { success: true, tokens };
        }

        try {
            const batch = writeBatch(db);
            tokens.forEach((token) => {
                batch.set(doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode, 'invites', token), {
                    token,
                    creatorId: currentUser.id,
                    publicCode,
                    electionId: activeElectionId,
                    used: false,
                    usedBy: '',
                    usedAt: null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            });

            await withRetry(() => batch.commit(), { attempts: 3, baseDelayMs: 300 });
            setBackendError('');
            logOperationalEvent('admin:generate-invites', `Generated ${tokens.length} invite tokens`, {
                tokenCount: tokens.length,
                publicCode,
            });
            return { success: true, tokens };
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to generate invite tokens.');
            setBackendError(message);
            logOperationalError('generateInviteTokens', error, { tokenCount: inviteCount });
            return { success: false, error: message };
        }
    };

    const revokeInviteToken = async (token) => {
        if (!currentUser || !activeElectionId) return { success: false, error: 'Create or select an election first.' };

        const normalizedToken = String(token || '').trim();
        if (!normalizedToken) return { success: false, error: 'Invite token is required.' };

        if (!firebaseEnabled) {
            const nextInvites = inviteTokens.filter((entry) => entry.token !== normalizedToken);
            setInviteTokens(nextInvites);
            saveLocalStateForElection(activeElectionId, (currentElectionData) => ({
                ...currentElectionData,
                inviteTokens: nextInvites,
            }));
            return { success: true };
        }

        try {
            const publicCode = activeElection?.publicCode || activeElection?.publicLink || '';
            if (!publicCode) return { success: false, error: 'Select an active public election first.' };

            await withRetry(() => deleteDoc(doc(db, PUBLIC_ELECTIONS_COLLECTION, publicCode, 'invites', normalizedToken)), { attempts: 3, baseDelayMs: 300 });
            setBackendError('');
            logOperationalEvent('admin:revoke-invite', 'Revoked invite token', {
                token: maskInviteToken(normalizedToken),
                publicCode,
            });
            return { success: true };
        } catch (error) {
            const message = classifyFirebaseError(error, 'Failed to revoke invite token.');
            setBackendError(message);
            logOperationalError('revokeInviteToken', error, { token: normalizedToken });
            return { success: false, error: message };
        }
    };

    return (
        <VoteContext.Provider
            value={{
                elections,
                activeElection,
                activeElectionId,
                candidates,
                voters,
                auditLog,
                currentVoter,
                backendError,
                loginVoter,
                logoutVoter,
                createElection,
                selectElection,
                registerVoter,
                castVote,
                resetElection,
                addCandidate,
                removeCandidate,
                inviteTokens,
                generateInviteTokens,
                revokeInviteToken,
                finishElection,
                deleteElection,
            }}
        >
            {children}
        </VoteContext.Provider>
    );
};
