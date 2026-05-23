import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Shield, LogOut, LayoutDashboard, FileText, Link as LinkIcon, Vote } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CreatorLayout = () => {
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await logout();
        navigate('/creator/login');
    };

    const navItems = [
        { label: 'Creator Dashboard', path: '/creator/dashboard', icon: LayoutDashboard },
        { label: 'Election Sharing', path: '/creator/dashboard', icon: LinkIcon },
        { label: 'Audit Log', path: '/creator/audit', icon: FileText },
        { label: 'Live Results', path: '/leaderboard', icon: Vote },
    ];

    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-100 flex">
            <aside className="hidden lg:block w-72 bg-slate-950 text-white fixed h-full shadow-2xl">
                <div className="p-6 border-b border-white/10 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/20">
                        <Shield className="h-5 w-5" />
                    </span>
                    <div>
                        <div className="text-lg font-semibold tracking-tight">E-VotePro</div>
                        <div className="text-xs text-slate-400">Creator workspace</div>
                    </div>
                </div>

                <div className="px-4 py-5">
                    <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-300">
                        Signed in as <span className="font-semibold text-white">{currentUser?.name || currentUser?.email || 'Creator'}</span>
                    </div>
                </div>

                <nav className="px-4 space-y-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.label}
                            to={item.path}
                            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${location.pathname === item.path ? 'bg-cyan-400 text-slate-950 font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                        >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="absolute bottom-0 w-full border-t border-white/10 p-4">
                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Mobile header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-950 text-white shadow">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/20">
                            <Shield className="h-4 w-4" />
                        </span>
                        <div className="text-sm font-semibold">E-VotePro</div>
                    </div>
                    <button onClick={() => setMobileOpen(v => !v)} className="text-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
                {mobileOpen && (
                    <div className="px-4 pb-4">
                        <nav className="flex flex-col space-y-2">
                            {navItems.map(item => (
                                <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)} className="px-3 py-2 rounded-xl text-slate-300 hover:bg-white/5">
                                    {item.label}
                                </Link>
                            ))}
                            <button onClick={handleLogout} className="text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-white/5">Logout</button>
                        </nav>
                    </div>
                )}
            </header>

            <main className="flex-1 lg:ml-72 ml-0 p-6 sm:p-8 lg:p-10 pt-0">
                <div className="mx-auto max-w-7xl">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default CreatorLayout;