import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Link as LinkIcon, ShieldCheck } from 'lucide-react';

const extractCode = (value) => {
    const trimmed = String(value || '').trim();

    if (!trimmed) return '';

    const voteMatch = trimmed.match(/\/vote\/([A-Za-z0-9]+)/i);
    if (voteMatch?.[1]) return voteMatch[1];

    const codeMatch = trimmed.match(/([A-Za-z0-9]{6,20})$/);
    return codeMatch?.[1] || trimmed;
};

const JoinElection = () => {
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (event) => {
        event.preventDefault();
        const code = extractCode(input);

        if (!code) {
            setError('Enter a valid election code or share link.');
            return;
        }

        navigate(`/vote/${code}`);
    };

    return (
        <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
            <div className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl sm:p-10">
                <div className="max-w-2xl space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
                        <ShieldCheck className="h-4 w-4" />
                        No account required for voters
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Join an election with a code or direct link.</h1>
                    <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                        Paste the share URL or type the short election code you received from the creator.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
                    <label className="block text-sm font-medium text-slate-200">Election code or share link</label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                            <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                            <input
                                value={input}
                                onChange={(event) => {
                                    setInput(event.target.value);
                                    setError('');
                                }}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:bg-white/10"
                                placeholder="Example: /vote/A8K2F9 or A8K2F9"
                            />
                        </div>
                        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300">
                            Continue
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>

                    {error && <p className="text-sm text-rose-300">{error}</p>}
                    <p className="text-sm text-slate-400">Creators can share short codes, QR links, or direct election URLs.</p>
                </form>
            </div>
        </div>
    );
};

export default JoinElection;