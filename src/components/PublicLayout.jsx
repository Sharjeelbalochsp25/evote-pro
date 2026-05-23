import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';

const PublicLayout = () => {
    const location = useLocation();
    const showCompactHeader = location.pathname.startsWith('/vote/') || location.pathname.startsWith('/e/') || location.pathname === '/join';

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className={`sticky top-0 z-40 border-b border-white/10 ${showCompactHeader ? 'bg-slate-950/90 backdrop-blur-xl' : 'bg-slate-950/80 backdrop-blur-xl'}`}>
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                    <Link to="/" className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/20">
                            <Shield className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="text-base font-semibold tracking-tight">E-VotePro</div>
                            <div className="text-xs text-slate-400">Secure voting infrastructure</div>
                        </div>
                    </Link>

                    <nav className="flex items-center gap-3 text-sm">
                        <Link to="/join" className="rounded-full border border-white/10 px-4 py-2 text-slate-200 transition hover:border-cyan-400/40 hover:text-white">
                            Vote in Election
                        </Link>
                        <Link to="/creator/login" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold text-slate-950 transition hover:translate-y-[-1px]">
                            Create Voting Booth
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </nav>
                </div>
            </header>

            <main>
                <Outlet />
            </main>

            <footer className="border-t border-white/10 bg-slate-950">
                <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-400 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p>&copy; {new Date().getFullYear()} E-VotePro.</p>
                        <p>Creator-first election management and public voting access.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicLayout;