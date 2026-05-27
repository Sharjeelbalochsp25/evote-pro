import React, { useEffect, useMemo, useState } from 'react';
import { useVote } from '../../context/ElectionContext';
import { Award, Archive, Copy, Download, Link as LinkIcon, Lock, Plus, RotateCcw, ShieldAlert, Trash2, Users } from 'lucide-react';
import {
    buildCandidatesCsv,
    buildElectionSnapshot,
    buildInviteTokensCsv,
    downloadJson,
    downloadText,
    formatClientTimestamp,
    loadClientObservability,
    maskInviteToken,
    recordClientEvent,
    subscribeClientObservability,
} from '../../utils/clientObservability';
import { trackAnalyticsEvent } from '../../firebase';

const AdminDashboard = () => {
    const {
        elections,
        activeElection,
        activeElectionId,
        candidates,
        voters,
        inviteTokens,
        auditLog,
        backendError,
        createElection,
        selectElection,
        finishElection,
        deleteElection,
        resetElection,
        addCandidate,
        removeCandidate,
        generateInviteTokens,
        revokeInviteToken,
    } = useVote();

    const [newElection, setNewElection] = useState({ title: '', description: '', verification: 'CNIC' });
    const [newCandidate, setNewCandidate] = useState({ name: '', party: '' });
    const [inviteCount, setInviteCount] = useState('5');
    const [generatedTokens, setGeneratedTokens] = useState([]);
    const [isAdding, setIsAdding] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [activityFeed, setActivityFeed] = useState(() => loadClientObservability());

    useEffect(() => subscribeClientObservability((entries) => setActivityFeed(entries)), []);

    const totalVotes = candidates.reduce((acc, curr) => acc + curr.votes, 0);
    const leadingCandidate = [...candidates].sort((a, b) => b.votes - a.votes)[0];
    const shareLink = activeElection?.publicCode ? `${window.location.origin}/vote/${activeElection.publicCode}` : '';
    const canManageElection = Boolean(activeElectionId);

    const verificationOptions = useMemo(() => [
        { value: 'CNIC', label: 'CNIC' },
        { value: 'STUDENT_ID', label: 'Student ID' },
        { value: 'EMPLOYEE_ID', label: 'Employee ID' },
        { value: 'PASSPORT', label: 'Passport' },
        { value: 'PHONE_NUMBER', label: 'Phone Number' },
        { value: 'CUSTOM', label: 'Custom Field' },
    ], []);

    const handleCreateElection = async (event) => {
        event.preventDefault();
        if (!newElection.title.trim()) return;

        setIsCreating(true);
        await createElection({
            title: newElection.title,
            description: newElection.description,
            verification: { method: newElection.verification, customLabel: '' },
        });
        setIsCreating(false);
        setNewElection({ title: '', description: '', verification: 'CNIC' });
    };

    const handleCopyLink = async () => {
        if (!shareLink) return;

        await navigator.clipboard.writeText(shareLink);
    };

    const handleGenerateInvites = async (event) => {
        event.preventDefault();
        const result = await generateInviteTokens(Number(inviteCount) || 1);
        if (result?.success) {
            setGeneratedTokens(result.tokens || []);
        }
    };

    const handleCopyToken = async (token) => {
        if (!token) return;

        await navigator.clipboard.writeText(token);
    };

    const handleExportSnapshot = async () => {
        if (!activeElection) return;

        const snapshot = buildElectionSnapshot({
            activeElection,
            candidates,
            voters,
            auditLog,
            inviteTokens,
            adminActivity: activityFeed,
        });

        const fileName = `${activeElection.publicCode || activeElection.id || 'election'}-snapshot.json`;
        downloadJson(fileName, snapshot);
        recordClientEvent('admin:export-json', `Exported snapshot for ${activeElection.title}`, {
            electionId: activeElection.id,
            publicCode: activeElection.publicCode || '',
        });
        void trackAnalyticsEvent('admin_export_json', {
            election_id: activeElection.id,
        });
    };

    const handleExportCandidatesCsv = async () => {
        if (!activeElection) return;

        const csv = buildCandidatesCsv(candidates);
        const fileName = `${activeElection.publicCode || activeElection.id || 'election'}-results.csv`;
        downloadText(fileName, csv, 'text/csv;charset=utf-8');
        recordClientEvent('admin:export-csv', `Exported candidate results for ${activeElection.title}`, {
            electionId: activeElection.id,
            publicCode: activeElection.publicCode || '',
        });
        void trackAnalyticsEvent('admin_export_csv', {
            election_id: activeElection.id,
        });
    };

    const handleExportInvitesCsv = async () => {
        if (!activeElection) return;

        const csv = buildInviteTokensCsv(inviteTokens);
        const fileName = `${activeElection.publicCode || activeElection.id || 'election'}-invites.csv`;
        downloadText(fileName, csv, 'text/csv;charset=utf-8');
        recordClientEvent('admin:export-invites', `Exported invite list for ${activeElection.title}`, {
            electionId: activeElection.id,
            publicCode: activeElection.publicCode || '',
        });
    };

    const handleArchiveElection = async () => {
        if (!activeElection) return;

        const ok = window.confirm(`Archive ${activeElection.title}? This will download a snapshot and keep the election closed.`);
        if (!ok) return;

        await handleExportSnapshot();
        await finishElection(activeElection.id, true);
        recordClientEvent('admin:archive-election', `Archived election ${activeElection.title}`, {
            electionId: activeElection.id,
            publicCode: activeElection.publicCode || '',
        });
    };

    const handleSafeReset = async () => {
        if (!activeElection) return;

        const typedValue = window.prompt(`Type ${activeElection.title} to clear votes and audit history.`);
        if (typedValue !== activeElection.title) return;

        const result = await resetElection();
        return result;
    };

    const handleRevokeInvite = async (token) => {
        const ok = window.confirm(`Revoke invite token ${token}?`);
        if (!ok) return;

        const result = await revokeInviteToken(token);
        if (result?.success) {
            recordClientEvent('admin:revoke-invite-ui', 'Revoked invite token from dashboard', {
                token: maskInviteToken(token),
                electionId: activeElection?.id || '',
            });
        }
    };

    const handleAddCandidate = async (e) => {
        e.preventDefault();
        if (newCandidate.name && newCandidate.party) {
            await addCandidate(newCandidate);
            setNewCandidate({ name: '', party: '' });
            setIsAdding(false);
        }
    };

    const handleRemoveCandidate = async (candidate) => {
        if (!candidate) return;
        const ok = window.confirm(`Remove candidate "${candidate.name}"?`);
        if (!ok) return;
        await removeCandidate(candidate.id);
    };

    return (
        <div className="space-y-8">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Creator workspace</p>
                        <h1 className="mt-2 text-3xl font-bold text-slate-950">Election Control Center</h1>
                        <p className="mt-2 max-w-2xl text-slate-600">Create elections, switch between them, share public links, and monitor the vote ledger.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleExportCandidatesCsv}
                            disabled={!canManageElection}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            Export CSV
                        </button>
                        <button
                            onClick={handleExportSnapshot}
                            disabled={!canManageElection}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Archive className="h-4 w-4" />
                            Export JSON
                        </button>
                        <button
                            onClick={handleArchiveElection}
                            disabled={!canManageElection}
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 px-4 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <ShieldAlert className="h-4 w-4" />
                            Archive and Close
                        </button>
                        <button
                            onClick={handleSafeReset}
                            disabled={!canManageElection}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Safe Reset
                        </button>
                    </div>
                </div>

                {backendError && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{backendError}</p>}
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Elections</p>
                            <h2 className="mt-2 text-2xl font-bold text-slate-950">Create or switch election</h2>
                            <p className="mt-2 text-slate-600">Each creator can manage multiple elections from one account.</p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateElection} className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Election title</label>
                                <input
                                    value={newElection.title}
                                    onChange={(event) => setNewElection((prev) => ({ ...prev, title: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-400"
                                    placeholder="Election title"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Verification method</label>
                                <select
                                    value={newElection.verification}
                                    onChange={(event) => setNewElection((prev) => ({ ...prev, verification: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-400"
                                >
                                    {verificationOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                            <textarea
                                value={newElection.description}
                                onChange={(event) => setNewElection((prev) => ({ ...prev, description: event.target.value }))}
                                className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-400"
                                placeholder="Optional description"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isCreating || !newElection.title.trim()}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Plus className="h-4 w-4" />
                                Create Voting Booth
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 space-y-3">
                        {elections.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No elections yet. Create your first one to begin.</p>
                        ) : elections.map((election) => (
                            <button
                                key={election.id}
                                onClick={() => selectElection(election.id)}
                                className={`w-full rounded-2xl border p-4 text-left transition ${activeElectionId === election.id ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                            >
                                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-950">{election.title}</h3>
                                            {activeElectionId === election.id && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800">Active</span>}
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${election.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{election.isActive ? 'Open' : 'Closed'}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{election.description || 'No description'}</p>
                                        <p className="mt-2 text-xs text-slate-500">Code: {election.publicCode || election.publicLink || 'N/A'}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => finishElection(election.id, false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white">Open</button>
                                        <button type="button" onClick={() => finishElection(election.id, true)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white">Close</button>
                                        <button type="button" onClick={() => deleteElection(election.id)} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Election sharing</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-950">{activeElection?.title || 'No active election'}</h2>
                    <p className="mt-2 text-slate-600">{activeElection?.description || 'Select an election to view its public link and status.'}</p>

                    {activeElection ? (
                        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Public link</p>
                                <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                    <LinkIcon className="h-4 w-4 text-cyan-600" />
                                    <span className="min-w-0 flex-1 truncate">{shareLink}</span>
                                    <button type="button" onClick={handleCopyLink} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                                        <Copy className="h-3.5 w-3.5" />
                                        Copy Link
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl bg-white p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Votes cast</p>
                                    <p className="mt-2 text-2xl font-bold text-slate-950">{totalVotes}</p>
                                </div>
                                <div className="rounded-2xl bg-white p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Voters</p>
                                    <p className="mt-2 text-2xl font-bold text-slate-950">{voters.length}</p>
                                </div>
                                <div className="rounded-2xl bg-white p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
                                    <p className="mt-2 text-2xl font-bold text-slate-950">{activeElection.isActive ? 'Open' : 'Closed'}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-800">Invite tokens</p>
                                        <p className="mt-1 text-sm text-cyan-900">Generate per-election tokens that voters must enter before voting.</p>
                                    </div>
                                    <form onSubmit={handleGenerateInvites} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={inviteCount}
                                            onChange={(event) => setInviteCount(event.target.value)}
                                            className="w-24 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400"
                                        />
                                        <button type="submit" className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
                                            Generate
                                        </button>
                                    </form>
                                </div>

                                <div className="mt-4 space-y-2">
                                    {inviteTokens.length === 0 && generatedTokens.length === 0 ? (
                                        <p className="text-sm text-cyan-900/70">No invite tokens yet.</p>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                {inviteTokens.map((entry) => (
                                                    <div key={entry.token} className="flex flex-col gap-3 rounded-xl border border-cyan-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                                                        <div>
                                                            <div className="font-mono text-cyan-950">{entry.token}</div>
                                                            <div className="mt-1 text-xs text-slate-500">
                                                                {entry.used ? `Used by ${entry.usedBy || 'another voter'}` : 'Unused and available'}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button type="button" onClick={() => handleCopyToken(entry.token)} className="rounded-lg border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50">
                                                                Copy
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRevokeInvite(entry.token)}
                                                                disabled={entry.used}
                                                                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                Revoke
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {generatedTokens.length > 0 && (
                                                <div className="rounded-xl border border-dashed border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-900">
                                                    Recent session tokens: {generatedTokens.join(', ')}
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-2 pt-2">
                                                <button type="button" onClick={handleExportInvitesCsv} className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50">
                                                    <Download className="h-3.5 w-3.5" />
                                                    Export invites CSV
                                                </button>
                                                <button type="button" onClick={handleExportSnapshot} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white">
                                                    <Archive className="h-3.5 w-3.5" />
                                                    Export snapshot JSON
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operational snapshot</p>
                                            <p className="mt-1 text-sm text-slate-600">Live election state, ready for archival or rollback.</p>
                                        </div>
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-2xl bg-white p-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Audit records</p>
                                            <p className="mt-2 text-2xl font-bold text-slate-950">{auditLog.length}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white p-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Token records</p>
                                            <p className="mt-2 text-2xl font-bold text-slate-950">{inviteTokens.length}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white p-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Open seats</p>
                                            <p className="mt-2 text-2xl font-bold text-slate-950">{Math.max(candidates.length - totalVotes, 0)}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white p-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Activity feed</p>
                                            <p className="mt-2 text-2xl font-bold text-slate-950">{activityFeed.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin activity</p>
                                            <p className="mt-1 text-sm text-slate-600">Recent operational actions and client-side errors.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setActivityFeed(loadClientObservability())}
                                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                                        >
                                            Refresh
                                        </button>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {activityFeed.length === 0 ? (
                                            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">No recorded operational events yet.</p>
                                        ) : (
                                            activityFeed.slice(0, 6).map((entry) => (
                                                <div key={entry.id} className={`rounded-xl border px-4 py-3 text-sm ${entry.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : entry.type.startsWith('admin:') ? 'border-cyan-200 bg-cyan-50 text-cyan-950' : 'border-slate-200 bg-white text-slate-700'}`}>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="font-semibold">{entry.message}</div>
                                                            <div className="mt-1 text-xs uppercase tracking-[0.2em] opacity-70">{entry.type}</div>
                                                        </div>
                                                        <div className="text-xs text-slate-500">{formatClientTimestamp(entry.timestamp)}</div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Create or select an election to view the share link and live stats.</div>
                    )}
                </div>
            </section>

            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 font-medium">Total Votes Cast</span>
                        <Users className="h-5 w-5 text-accent-blue" />
                    </div>
                    <p className="text-4xl font-bold text-navy-900">{totalVotes}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 font-medium">Leading Candidate</span>
                        <Award className="h-5 w-5 text-amber-500" />
                    </div>
                    <p className="text-xl font-bold text-navy-900 truncate">{leadingCandidate?.name || 'N/A'}</p>
                    <p className="text-sm text-slate-400">{leadingCandidate?.party || '-'}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 font-medium">Voter Turnout</span>
                        <Users className="h-5 w-5 text-green-500" />
                    </div>
                    <p className="text-4xl font-bold text-navy-900">{voters.length}</p>
                    <p className="text-sm text-slate-400">Registered unique CNICs</p>
                </div>
            </div>

            {/* Candidates Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-lg text-navy-900">Candidates Registry</h3>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        disabled={!canManageElection}
                        className="px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 flex items-center space-x-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Add Candidate</span>
                    </button>
                </div>

                {isAdding && (
                    <div className="p-6 bg-blue-50 border-b border-blue-100 animate-in fade-in slide-in-from-top-2">
                        <form onSubmit={handleAddCandidate} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Candidate Name</label>
                                <input
                                    type="text"
                                    value={newCandidate.name}
                                    onChange={(e) => setNewCandidate({ ...newCandidate, name: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-accent-blue outline-none"
                                    placeholder="Candidate Name"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Party Affiliation</label>
                                <input
                                    type="text"
                                    value={newCandidate.party}
                                    onChange={(e) => setNewCandidate({ ...newCandidate, party: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-accent-blue outline-none"
                                    placeholder="Party Name"
                                />
                            </div>
                            <button className="px-6 py-2 bg-accent-blue text-white rounded-lg font-bold hover:bg-blue-600 h-10">Save</button>
                        </form>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
                        <tr>
                            <th className="px-6 py-4 font-semibold">ID</th>
                            <th className="px-6 py-4 font-semibold">Name</th>
                            <th className="px-6 py-4 font-semibold">Party</th>
                            <th className="px-6 py-4 font-semibold text-right">Votes</th>
                            <th className="px-6 py-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {candidates.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-10 text-center text-slate-400">
                                    No candidates yet. Use "Add Candidate" to create your first one.
                                </td>
                            </tr>
                        ) : (
                            candidates.map((c) => (
                                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-slate-500">#{c.id.toString().padStart(3, '0')}</td>
                                    <td className="px-6 py-4 font-medium text-navy-900">{c.name}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-blue-100 text-accent-blue rounded text-xs font-bold">{c.party}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-navy-900">{c.votes}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleRemoveCandidate(c)}
                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                            title="Remove candidate"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminDashboard;
