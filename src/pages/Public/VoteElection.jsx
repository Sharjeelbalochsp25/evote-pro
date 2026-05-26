import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, increment, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, ShieldCheck, Vote } from 'lucide-react';
import { firebaseClientConfig, hasDemoMode, hasFirebaseConfig } from '../../firebase';
import { DEFAULT_VERIFICATION_METHOD, VERIFICATION_METHODS } from '../../context/ElectionContext';
import { classifyFirebaseError } from '../../utils/firebaseErrors';

const getVerificationConfig = (method) => VERIFICATION_METHODS.find((item) => item.value === method) || DEFAULT_VERIFICATION_METHOD;
const LOCAL_STORAGE_KEY = 'electionSystemsV2';
const PUBLIC_VOTE_IDENTITY_KEY = 'publicVoteIdentityV1';
const PUBLIC_VOTE_APP_NAME = 'public-vote-session';

const getPublicVoteServices = () => {
    const publicApp = getApps().find((item) => item.name === PUBLIC_VOTE_APP_NAME) || initializeApp(firebaseClientConfig, PUBLIC_VOTE_APP_NAME);
    const useFirebaseEmulator = String(import.meta.env.VITE_USE_FIREBASE_EMULATOR || '').toLowerCase() === 'true';

    if (useFirebaseEmulator && !publicApp.__EVOTEPRO_PUBLIC_EMULATOR_CONNECTED__) {
        try {
            const publicAuth = getAuth(publicApp);
            const publicDb = getFirestore(publicApp);
            connectAuthEmulator(publicAuth, 'http://127.0.0.1:9100', { disableWarnings: true });
            connectFirestoreEmulator(publicDb, '127.0.0.1', 8180);
            publicApp.__EVOTEPRO_PUBLIC_EMULATOR_CONNECTED__ = true;
        } catch {
            // Ignore duplicate/late connection attempts; the shared app instance may already be connected.
        }
    }

    return {
        auth: getAuth(publicApp),
        db: getFirestore(publicApp),
    };
};

const buildVoterHash = (identifier) => `User-${String(identifier || '').slice(-4)}`;

const getStoredInviteToken = (publicCode) => {
    try {
        const rawStore = localStorage.getItem(PUBLIC_VOTE_IDENTITY_KEY);
        if (!rawStore) return '';

        const store = JSON.parse(rawStore);
        return String(store?.[publicCode] || '').trim();
    } catch {
        return '';
    }
};

const setStoredInviteToken = (publicCode, token) => {
    try {
        const rawStore = localStorage.getItem(PUBLIC_VOTE_IDENTITY_KEY);
        const store = rawStore ? JSON.parse(rawStore) : {};
        store[publicCode] = token;
        localStorage.setItem(PUBLIC_VOTE_IDENTITY_KEY, JSON.stringify(store));
    } catch {
        // Ignore local storage failures; Firestore remains the source of truth.
    }
};

const clearStoredInviteToken = (publicCode) => {
    try {
        const rawStore = localStorage.getItem(PUBLIC_VOTE_IDENTITY_KEY);
        if (!rawStore) return;

        const store = JSON.parse(rawStore);
        delete store[publicCode];
        localStorage.setItem(PUBLIC_VOTE_IDENTITY_KEY, JSON.stringify(store));
    } catch {
        // Ignore local storage failures.
    }
};

const loadLocalElectionByCode = (publicCode) => {
    try {
        const rawStore = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!rawStore) return null;

        const store = JSON.parse(rawStore);
        const normalizedCode = String(publicCode || '').trim();

        for (const [ownerId, userState] of Object.entries(store || {})) {
            const elections = Array.isArray(userState?.elections) ? userState.elections : [];
            const matchedElection = elections.find((election) => (election.publicCode || election.publicLink || '') === normalizedCode);
            if (!matchedElection) continue;

            const electionData = userState?.electionData?.[matchedElection.id] || { candidates: [], voters: [], auditLog: [], inviteTokens: [] };

            return {
                ownerId,
                election: matchedElection,
                candidates: Array.isArray(electionData.candidates) ? electionData.candidates : [],
                inviteTokens: Array.isArray(electionData.inviteTokens) ? electionData.inviteTokens : [],
            };
        }
    } catch {
        return null;
    }

    return null;
};

const persistLocalPublicVote = ({ publicCode, candidateId, inviteToken }) => {
    const rawStore = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!rawStore) throw new Error('Local election store not found');

    const store = JSON.parse(rawStore);
    const normalizedCode = String(publicCode || '').trim();
    const normalizedToken = String(inviteToken || '').trim();

    for (const [ownerId, userState] of Object.entries(store || {})) {
        const elections = Array.isArray(userState?.elections) ? userState.elections : [];
        const matchedElection = elections.find((election) => (election.publicCode || election.publicLink || '') === normalizedCode);
        if (!matchedElection) continue;

        const electionData = userState.electionData || {};
        const currentElectionData = electionData[matchedElection.id] || { candidates: [], voters: [], auditLog: [], inviteTokens: [] };
        const inviteIndex = (currentElectionData.inviteTokens || []).findIndex((entry) => String(entry.token || '').trim() === normalizedToken);

        if (inviteIndex < 0) {
            throw new Error('Invite token is invalid for this election.');
        }

        const inviteEntry = currentElectionData.inviteTokens[inviteIndex];
        if (inviteEntry?.used) {
            throw new Error('Invite token has already been used.');
        }

        const nextCandidates = (currentElectionData.candidates || []).map((candidate) => (
            candidate.id === candidateId ? { ...candidate, votes: (candidate.votes || 0) + 1 } : candidate
        ));

        const nextInviteTokens = (currentElectionData.inviteTokens || []).map((entry) => (
            String(entry.token || '').trim() === normalizedToken
                ? { ...entry, used: true, usedBy: `LOCAL-${normalizedToken}`, usedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                : entry
        ));

        electionData[matchedElection.id] = {
            candidates: nextCandidates,
            voters: [...(currentElectionData.voters || []), { inviteToken: normalizedToken, authUid: `LOCAL-${normalizedToken}`, candidateId, publicCode: normalizedCode, hasVoted: true, votedAt: new Date().toISOString() }],
            auditLog: [...(currentElectionData.auditLog || []), { id: `LOCAL-${Date.now()}`, inviteToken: normalizedToken, voterHash: buildVoterHash(normalizedToken), candidateId, publicCode: normalizedCode, timestamp: new Date().toISOString() }],
            inviteTokens: nextInviteTokens,
        };

        store[ownerId] = {
            ...userState,
            electionData,
        };

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
        return { transactionId: `LOCAL-${Date.now()}` };
    }

    throw new Error('Election not found');
};

const resolveVoteFailureState = async ({ publicDb, publicCode, inviteToken, voterUid }) => {
    const publicElectionRef = doc(publicDb, 'publicElections', publicCode);
    const inviteRef = doc(publicDb, 'publicElections', publicCode, 'invites', inviteToken);
    const [publicElectionSnap, inviteSnap] = await Promise.all([getDoc(publicElectionRef), getDoc(inviteRef)]);

    if (!publicElectionSnap.exists()) {
        return { kind: 'invalid-token', message: 'Election not found or code is invalid.' };
    }

    if (!inviteSnap.exists()) {
        return { kind: 'invalid-token', message: 'Invalid invite token for this election.' };
    }

    const inviteData = inviteSnap.data() || {};
    const electionData = publicElectionSnap.data() || {};
    const creatorId = electionData.creatorId;
    const electionId = electionData.electionId;

    if (inviteData.used === true) {
        if (inviteData.usedBy === voterUid) {
            return { kind: 'already-voted', message: 'You have already voted in this election.' };
        }

        return { kind: 'token-used', message: 'This invite token has already been used.' };
    }

    return { kind: 'transient-retry', message: 'Your vote is being processed. Please try again in a moment.' };
};

const VoteElection = () => {
    const { publicCode } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [election, setElection] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [voteResult, setVoteResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [inviteToken, setInviteToken] = useState('');
    const [tokenInput, setTokenInput] = useState('');
    const [identityState, setIdentityState] = useState('idle'); // idle | validating | valid | used
    const [identityLoading, setIdentityLoading] = useState(false);
    const showDemoFallback = hasDemoMode;
    const publicVoteServices = hasFirebaseConfig ? getPublicVoteServices() : null;

    useEffect(() => {
        if (!publicCode) {
            setLoading(false);
            setError('Election code is missing.');
            return undefined;
        }

        if (showDemoFallback || !hasFirebaseConfig || !publicVoteServices?.db) {
            const local = loadLocalElectionByCode(publicCode);
            if (!local) {
                setLoading(false);
                setError('Election not found or code is invalid.');
                return undefined;
            }

            setElection({
                id: local.election.id,
                ...local.election,
                ballotCandidates: local.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, party: candidate.party })),
                invites: local.inviteTokens,
            });
            setError('');
            setLoading(false);
            return undefined;
        }

        const electionRef = doc(publicVoteServices.db, 'publicElections', publicCode);
        const unsubscribe = onSnapshot(
            electionRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setElection(null);
                    setError('Election not found or code is invalid.');
                    setLoading(false);
                    return;
                }

                setElection({ id: snapshot.id, ...snapshot.data() });
                setError('');
                setLoading(false);
            },
            (snapshotError) => {
                const message = classifyFirebaseError(snapshotError, 'Unable to load the election.');
                // eslint-disable-next-line no-console
                console.error('[PublicVote] Failed to subscribe to election', { publicCode, error: snapshotError });
                setError(message);
                setLoading(false);
            },
        );

        return unsubscribe;
    }, [publicCode, publicVoteServices?.db]);

    useEffect(() => {
        const storedToken = getStoredInviteToken(publicCode);
        if (!storedToken) return;

        setTokenInput(storedToken);
        void (async () => {
            try {
                await validateInviteToken(storedToken, true);
            } catch {
                // handled by validateInviteToken
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publicCode, election?.id]);

    const candidates = election?.ballotCandidates || election?.candidates || [];
    const boothReady = candidates.length > 0;
    const canSubmitVote = Boolean(inviteToken && identityState === 'valid' && boothReady && election?.isActive !== false);

    const validateInviteToken = async (rawToken, silent = false) => {
        const normalizedToken = String(rawToken || '').trim().toUpperCase();
        if (!normalizedToken) {
            if (!silent) setError('Enter your invite token.');
            return { success: false };
        }

        setIdentityLoading(true);
        if (!silent) setError('');

        if (showDemoFallback || !hasFirebaseConfig || !publicVoteServices?.db) {
            const local = loadLocalElectionByCode(publicCode);
            const invite = local?.inviteTokens?.find((entry) => String(entry.token || '').trim().toUpperCase() === normalizedToken);

            if (!invite) {
                clearStoredInviteToken(publicCode);
                setIdentityState('idle');
                if (!silent) setError('Invalid invite token for this election.');
                setIdentityLoading(false);
                return { success: false };
            }

            if (invite.used) {
                clearStoredInviteToken(publicCode);
                setIdentityState('used');
                if (!silent) setError('This invite token has already been used.');
                setIdentityLoading(false);
                return { success: false };
            }

            setInviteToken(normalizedToken);
            setTokenInput(normalizedToken);
            setIdentityState('valid');
            setStoredInviteToken(publicCode, normalizedToken);
            setIdentityLoading(false);
            return { success: true };
        }

        try {
            const { auth: publicAuth, db: publicDb } = publicVoteServices;
            await (publicAuth.currentUser ? Promise.resolve(publicAuth.currentUser) : signInAnonymously(publicAuth));

            const publicElectionRef = doc(publicDb, 'publicElections', publicCode);
            const inviteRef = doc(publicDb, 'publicElections', publicCode, 'invites', normalizedToken);
            const [publicElectionSnap, inviteSnap] = await Promise.all([getDoc(publicElectionRef), getDoc(inviteRef)]);

            if (!publicElectionSnap.exists()) {
                clearStoredInviteToken(publicCode);
                setIdentityState('idle');
                if (!silent) setError('Election not found or code is invalid.');
                setIdentityLoading(false);
                return { success: false };
            }

            const electionData = publicElectionSnap.data() || {};
            if (electionData.isActive === false) {
                if (!silent) setError('This election is closed.');
                setIdentityLoading(false);
                return { success: false };
            }

            if (!inviteSnap.exists()) {
                clearStoredInviteToken(publicCode);
                setIdentityState('idle');
                if (!silent) setError('Invalid invite token for this election.');
                setIdentityLoading(false);
                return { success: false };
            }

            const invite = inviteSnap.data() || {};
            if (invite.publicCode && invite.publicCode !== publicCode) {
                clearStoredInviteToken(publicCode);
                setIdentityState('idle');
                if (!silent) setError('Invite token is not valid for this election.');
                setIdentityLoading(false);
                return { success: false };
            }

            if (invite.used === true) {
                setInviteToken(normalizedToken);
                setTokenInput(normalizedToken);
                setIdentityState('used');
                setStoredInviteToken(publicCode, normalizedToken);
                if (!silent) setError('This invite token has already been used.');
                setIdentityLoading(false);
                return { success: false };
            }

            setInviteToken(normalizedToken);
            setTokenInput(normalizedToken);
            setIdentityState('valid');
            setStoredInviteToken(publicCode, normalizedToken);
            setIdentityLoading(false);
            return { success: true };
        } catch (inviteError) {
            clearStoredInviteToken(publicCode);
            setIdentityState('idle');
            setIdentityLoading(false);
            if (!silent) {
                const message = classifyFirebaseError(inviteError, 'Unable to validate invite token.');
                setError(message);
            }
            return { success: false };
        }
    };

    const handleTokenSubmit = async (event) => {
        event.preventDefault();
        await validateInviteToken(tokenInput, false);
    };

    const handleVote = async (event) => {
        event.preventDefault();

        if (!inviteToken || identityState !== 'valid') {
            setError('Enter a valid invite token before voting.');
            return;
        }

        if (!selectedCandidate) {
            setError('Select a candidate before voting.');
            return;
        }

        if (!boothReady) {
            setError('This election is not ready yet. The creator must add at least one candidate.');
            return;
        }

        if (showDemoFallback || !hasFirebaseConfig || !publicVoteServices?.db) {
            try {
                const localResult = persistLocalPublicVote({
                    publicCode,
                    candidateId: selectedCandidate,
                    inviteToken,
                });
                setVoteResult(localResult);
                return;
            } catch (localError) {
                setError(localError?.message || 'Voting is not configured in this environment.');
                return;
            }
        }

        try {
            setSubmitting(true);
            setError('');

            const { auth: publicAuth, db: publicDb } = publicVoteServices;
            const signedInUser = publicAuth.currentUser || (await signInAnonymously(publicAuth)).user;
            const voteToken = signedInUser.uid;

            const preflightState = await resolveVoteFailureState({
                publicDb,
                publicCode,
                inviteToken,
                voterUid: voteToken,
            });

            if (preflightState?.kind === 'already-voted' || preflightState?.kind === 'token-used' || preflightState?.kind === 'invalid-token') {
                setError(preflightState.message);
                return;
            }

            const result = await runTransaction(publicDb, async (transaction) => {
                const publicElectionRef = doc(publicDb, 'publicElections', publicCode);
                const inviteRef = doc(publicDb, 'publicElections', publicCode, 'invites', inviteToken);
                const publicElectionSnap = await transaction.get(publicElectionRef);
                const inviteSnap = await transaction.get(inviteRef);

                if (!publicElectionSnap.exists()) {
                    throw new Error('Election not found or code is invalid.');
                }

                const electionData = publicElectionSnap.data() || {};
                const ownerId = electionData.creatorId;
                const electionId = electionData.electionId;

                if (!ownerId || !electionId) {
                    throw new Error('Election is not fully configured.');
                }

                if (electionData.isActive === false) {
                    throw new Error('This election is closed.');
                }

                if (!inviteSnap.exists()) {
                    throw new Error('Invite token is invalid for this election.');
                }

                const inviteData = inviteSnap.data() || {};
                if (inviteData.used === true) {
                    throw new Error('Invite token has already been used.');
                }

                if (inviteData.publicCode && inviteData.publicCode !== publicCode) {
                    throw new Error('Invite token is not valid for this election.');
                }

                const candidateRef = doc(publicDb, 'users', ownerId, 'elections', electionId, 'candidates', String(selectedCandidate));
                const voterRef = doc(publicDb, 'users', ownerId, 'elections', electionId, 'voters', voteToken);
                const auditRef = doc(publicDb, 'users', ownerId, 'elections', electionId, 'auditLog', voteToken);
                transaction.update(inviteRef, {
                    used: true,
                    usedBy: voteToken,
                    usedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });

                transaction.set(voterRef, {
                    inviteToken,
                    authUid: voteToken,
                    candidateId: selectedCandidate,
                    publicCode,
                    electionId,
                    hasVoted: true,
                    votedAt: serverTimestamp(),
                });
                transaction.set(auditRef, {
                    id: voteToken,
                    inviteToken,
                    voterHash: buildVoterHash(voteToken),
                    candidateId: selectedCandidate,
                    publicCode,
                    electionId,
                    timestamp: serverTimestamp(),
                });
                transaction.update(candidateRef, {
                    votes: increment(1),
                    updatedAt: serverTimestamp(),
                });

                return { transactionId: voteToken, candidateId: selectedCandidate };
            });

            setVoteResult({
                success: true,
                transactionId: result?.transactionId || voteToken,
                candidateId: result?.candidateId || selectedCandidate,
            });
            setIdentityState('used');
        } catch (voteError) {
            const message = voteError?.message || voteError?.details || 'Failed to cast vote.';
            const normalizedMessage = typeof message === 'string' ? message.replace(/^internal\s*/i, '').trim() : 'Failed to cast vote.';

            try {
                const publicAuth = publicVoteServices?.auth;
                const publicDb = publicVoteServices?.db;
                const voterUid = publicAuth?.currentUser?.uid || '';

                if (publicDb && voterUid) {
                    const outcome = await resolveVoteFailureState({ publicDb, publicCode, inviteToken, voterUid });
                    if (outcome?.kind === 'already-voted' || outcome?.kind === 'token-used' || outcome?.kind === 'invalid-token') {
                        setError(outcome.message);
                        return;
                    }

                    if (outcome?.kind === 'transient-retry') {
                        setError(outcome.message);
                        return;
                    }
                }
            } catch {
                // Fall through to the generic classified error below.
            }

            setError(classifyFirebaseError(voteError, normalizedMessage));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl items-center px-4 py-16 text-center sm:px-6 lg:px-8">
                <div className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-200 backdrop-blur-xl">
                    Loading election...
                </div>
            </div>
        );
    }

    if (voteResult) {
        return (
            <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
                <div className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20">
                        <CheckCircle2 className="h-10 w-10" />
                    </div>
                    <h1 className="text-3xl font-semibold text-white">Vote recorded</h1>
                    <p className="mt-3 text-slate-300">Your ballot was submitted for {election?.title || 'this election'}.</p>
                    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-left">
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Transaction ID</div>
                        <div className="mt-2 font-mono text-lg text-white">{voteResult.transactionId}</div>
                    </div>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                        <button
                            onClick={() => navigate('/')}
                            className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
                        >
                            Return Home
                        </button>
                        <Link to="/join" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10">
                            Vote in Another Election
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr]">
                <section className="space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
                        <ShieldCheck className="h-4 w-4" />
                        Public election access
                    </div>
                    <div>
                        <h1 className="text-3xl font-semibold text-white sm:text-5xl">{election?.title || 'Election not available'}</h1>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">{election?.description || 'Enter your election invite token, then choose one candidate to cast your vote securely.'}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Election code</div>
                            <div className="mt-2 font-mono text-white">{publicCode}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Invite token</div>
                            <div className="mt-2 text-white">{identityState === 'valid' ? inviteToken : 'Required before voting'}</div>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-200">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                <p className="text-sm">{error}</p>
                            </div>
                        </div>
                    )}

                    {election?.isActive === false && (
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
                            This election is closed.
                        </div>
                    )}

                    {!boothReady && (
                        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-cyan-50">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">Booth not ready yet</p>
                                    <p className="mt-1 text-sm text-cyan-50/80">The creator needs to add at least one candidate before voters can proceed.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <h2 className="mb-4 text-lg font-semibold text-white">Choose a candidate</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {boothReady ? candidates.map((candidate) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => setSelectedCandidate(candidate.id)}
                                    className={`rounded-3xl border p-5 text-left transition ${selectedCandidate === candidate.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-slate-950/70 hover:border-white/20 hover:bg-white/5'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-lg font-semibold text-white">{candidate.name}</div>
                                            <div className="mt-1 text-sm text-slate-400">{candidate.party || 'Independent'}</div>
                                        </div>
                                        {selectedCandidate === candidate.id && <BadgeCheck className="h-5 w-5 text-cyan-300" />}
                                    </div>
                                </button>
                            )) : (
                                <div className="sm:col-span-2 rounded-3xl border border-dashed border-white/15 bg-slate-950/60 p-6 text-slate-300">
                                    Waiting for the creator to add candidates.
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <aside className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-cyan-400/15 p-3 text-cyan-300">
                            <Vote className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">Invite token gate</h2>
                            <p className="text-sm text-slate-400">No account required. One token per election.</p>
                        </div>
                    </div>

                    <form onSubmit={handleTokenSubmit} className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-200">Invite token</label>
                            <input
                                value={tokenInput}
                                onChange={(event) => {
                                    setTokenInput(event.target.value.toUpperCase().trim());
                                    setError('');
                                }}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
                                placeholder="Enter the token you received"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={identityLoading || !tokenInput.trim()}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            {identityLoading ? 'Checking token...' : 'Validate token'}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </form>

                    <div className="mt-6 space-y-4">
                        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Current status</div>
                            <div className="mt-2 text-sm text-slate-200">
                                {identityState === 'valid' && 'Token verified. You can now cast one vote for this election.'}
                                {identityState === 'used' && 'This token has already been used in this election.'}
                                {identityState === 'idle' && 'Enter your invite token to unlock the ballot.'}
                                {identityState === 'validating' && 'Checking token against Firestore...'}
                            </div>
                        </div>

                        <button
                            onClick={handleVote}
                            disabled={submitting || !canSubmitVote}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            {submitting ? 'Submitting...' : boothReady ? 'Cast Vote' : 'Proceed disabled'}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default VoteElection;