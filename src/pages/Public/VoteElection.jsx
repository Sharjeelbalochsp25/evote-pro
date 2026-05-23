import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, ShieldCheck, Vote } from 'lucide-react';
import { db, functions, hasFirebaseConfig } from '../../firebase';
import { DEFAULT_VERIFICATION_METHOD, VERIFICATION_METHODS } from '../../context/ElectionContext';

const getVerificationConfig = (method) => VERIFICATION_METHODS.find((item) => item.value === method) || DEFAULT_VERIFICATION_METHOD;
const LOCAL_STORAGE_KEY = 'electionSystemsV2';

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

            const electionData = userState?.electionData?.[matchedElection.id] || { candidates: [], voters: [], auditLog: [] };

            return {
                ownerId,
                election: matchedElection,
                candidates: Array.isArray(electionData.candidates) ? electionData.candidates : [],
            };
        }
    } catch {
        return null;
    }

    return null;
};

const persistLocalPublicVote = ({ publicCode, candidateId, voter }) => {
    const rawStore = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!rawStore) throw new Error('Local election store not found');

    const store = JSON.parse(rawStore);
    const normalizedCode = String(publicCode || '').trim();

    for (const [ownerId, userState] of Object.entries(store || {})) {
        const elections = Array.isArray(userState?.elections) ? userState.elections : [];
        const matchedElection = elections.find((election) => (election.publicCode || election.publicLink || '') === normalizedCode);
        if (!matchedElection) continue;

        const electionData = userState.electionData || {};
        const currentElectionData = electionData[matchedElection.id] || { candidates: [], voters: [], auditLog: [] };
        const nextCandidates = (currentElectionData.candidates || []).map((candidate) => (
            candidate.id === candidateId ? { ...candidate, votes: (candidate.votes || 0) + 1 } : candidate
        ));

        electionData[matchedElection.id] = {
            candidates: nextCandidates,
            voters: [...(currentElectionData.voters || []), { identifier: voter.identifier, name: voter.name, age: voter.age, hasVoted: true, votedAt: new Date().toISOString() }],
            auditLog: [...(currentElectionData.auditLog || []), { id: `LOCAL-${Date.now()}`, voterHash: `User-${String(voter.identifier).slice(-4)}`, candidateId, timestamp: new Date().toISOString() }],
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

const VoteElection = () => {
    const { publicCode } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [election, setElection] = useState(null);
    const [formData, setFormData] = useState({ name: '', identifier: '', age: '' });
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [voteResult, setVoteResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!publicCode) {
            setLoading(false);
            setError('Election code is missing.');
            return undefined;
        }

        if (!hasFirebaseConfig || !db) {
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
            });
            setError('');
            setLoading(false);
            return undefined;
        }

        const electionRef = doc(db, 'publicElections', publicCode);
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
            () => {
                setError('Unable to load the election.');
                setLoading(false);
            },
        );

        return unsubscribe;
    }, [publicCode]);

    const verification = election?.verification || { method: DEFAULT_VERIFICATION_METHOD.value, customLabel: '' };
    const verificationConfig = getVerificationConfig(verification.method);
    const candidates = election?.ballotCandidates || election?.candidates || [];
    const boothReady = candidates.length > 0;

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((previous) => ({ ...previous, [name]: value }));
    };

    const handleVote = async (event) => {
        event.preventDefault();

        if (!selectedCandidate) {
            setError('Select a candidate before voting.');
            return;
        }

        if (!boothReady) {
            setError('This election is not ready yet. The creator must add at least one candidate.');
            return;
        }

        if (!formData.name || !formData.identifier || !formData.age) {
            setError('Complete voter verification first.');
            return;
        }

        if (!functions) {
            try {
                const localResult = persistLocalPublicVote({
                    publicCode,
                    candidateId: selectedCandidate,
                    voter: {
                        name: formData.name.trim(),
                        identifier: formData.identifier.trim(),
                        age: Number(formData.age),
                    },
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

            const useVercelApi = Boolean(
                import.meta.env.VITE_USE_VERCEL_API === 'true' ||
                    (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')),
            );

            const apiBase = import.meta.env.VITE_API_BASE || '';

            if (useVercelApi) {
                const res = await fetch(`${apiBase}/api/castPublicVoteSecure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        publicCode,
                        candidateId: selectedCandidate,
                        voter: {
                            name: formData.name.trim(),
                            identifier: formData.identifier.trim(),
                            age: Number(formData.age),
                        },
                    }),
                });

                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(body?.error || body?.message || 'Failed to cast vote.');
                }

                setVoteResult(body || { transactionId: 'PENDING' });
            } else {
                const castPublicVoteSecure = httpsCallable(functions, 'castPublicVoteSecure');
                const response = await castPublicVoteSecure({
                    publicCode,
                    candidateId: selectedCandidate,
                    voter: {
                        name: formData.name.trim(),
                        identifier: formData.identifier.trim(),
                        age: Number(formData.age),
                    },
                });

                setVoteResult(response?.data || { transactionId: 'PENDING' });
            }
        } catch (voteError) {
            const message = voteError?.message || voteError?.details || 'Failed to cast vote.';
            setError(typeof message === 'string' ? message.replace(/^internal\s*/i, '').trim() : 'Failed to cast vote.');
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
                        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">{election?.description || 'Verify your identity and choose one candidate to cast your vote securely.'}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Election code</div>
                            <div className="mt-2 font-mono text-white">{publicCode}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Verification</div>
                            <div className="mt-2 text-white">{verification.method === 'CUSTOM' ? verification.customLabel || 'Custom field' : verificationConfig.label}</div>
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
                            <h2 className="text-xl font-semibold text-white">Verify and submit</h2>
                            <p className="text-sm text-slate-400">No account required.</p>
                        </div>
                    </div>

                    <form onSubmit={handleVote} className="mt-6 space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-200">Full Name</label>
                            <input
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
                                placeholder="Enter your name"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-200">
                                {verification.method === 'CUSTOM' ? verification.customLabel || 'Custom field' : verificationConfig.label}
                            </label>
                            <input
                                name="identifier"
                                value={formData.identifier}
                                onChange={handleChange}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
                                placeholder={verificationConfig.placeholder}
                            />
                            {verification.method === 'CNIC' && <p className="mt-2 text-xs text-slate-400">Format: 00000-0000000-0</p>}
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-200">Age</label>
                            <input
                                type="number"
                                name="age"
                                value={formData.age}
                                onChange={handleChange}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
                                placeholder="18+"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !selectedCandidate || election?.isActive === false || !boothReady}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            {submitting ? 'Submitting...' : boothReady ? 'Cast Vote' : 'Proceed disabled'}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </form>
                </aside>
            </div>
        </div>
    );
};

export default VoteElection;