import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, ShieldCheck, Vote } from 'lucide-react';

const Landing = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-[80vh] px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                <section className="space-y-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
                        <ShieldCheck className="h-4 w-4" />
                        Firebase-only voting on the free tier
                    </div>
                    <div className="space-y-4">
                        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                            Secure voting for a digital nation.
                        </h1>
                        <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                            Create elections, share public vote links, and record every ballot in Firestore without any external backend.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                            onClick={() => navigate('/join')}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300"
                        >
                            <Vote className="h-5 w-5" />
                            Vote in Election
                        </button>
                        <button
                            onClick={() => navigate('/creator/login')}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-semibold text-white transition hover:bg-white/10"
                        >
                            Create Voting Booth
                            <ArrowRight className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="grid gap-4 pt-4 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">Firestore-backed elections</div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">Anonymous public voting</div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">No external API layer</div>
                    </div>
                </section>

                <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl sm:p-8">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-200">
                            <FileText className="h-4 w-4 text-cyan-300" />
                            Access portal
                        </div>
                        <h2 className="text-2xl font-semibold text-white">Choose your flow</h2>
                        <p className="text-sm leading-6 text-slate-300">
                            Voters use a shared code. Creators sign in to manage elections and monitor results.
                        </p>
                    </div>

                    <div className="mt-6 grid gap-4">
                        <button onClick={() => navigate('/join')} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-left transition hover:bg-slate-900">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
                                <Vote className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Vote in Election</h3>
                                <p className="text-sm text-slate-400">Open a shared URL or enter a short election code.</p>
                            </div>
                        </button>

                        <button onClick={() => navigate('/creator/login')} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-left transition hover:bg-slate-900">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Create Voting Booth</h3>
                                <p className="text-sm text-slate-400">Log in, create elections, generate links, and manage candidates.</p>
                            </div>
                        </button>

                        <button onClick={() => navigate('/leaderboard')} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-left transition hover:bg-slate-900">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Live Results</h3>
                                <p className="text-sm text-slate-400">Review vote totals and election status.</p>
                            </div>
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Landing;
