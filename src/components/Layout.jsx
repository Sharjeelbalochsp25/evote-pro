import React from 'react';
import { useVote } from '../context/ElectionContext';
import { useAuth } from '../context/AuthContext';
import { Shield, LogOut, LayoutDashboard, FileText, BarChart3, Users } from 'lucide-react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';

const Layout = () => {
    const { currentVoter, backendError } = useVote();
    const { currentUser, logout, authError } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const isPublicPage = location.pathname === '/' || location.pathname === '/leaderboard';
    const isVoterPage = location.pathname.startsWith('/voter');

    // Simple Navbar for public/voter pages
    if (isPublicPage || isVoterPage) {
        return (
            <div className="min-h-screen flex flex-col bg-slate-50">
                <header className="bg-navy-900 text-white shadow-lg sticky top-0 z-50">
                    <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                        <Link to="/" className="flex items-center space-x-2">
                            <Shield className="h-8 w-8 text-accent-blue" />
                            <span className="text-xl font-bold tracking-tight">E-VotePro</span>
                        </Link>
                        <nav className="flex items-center space-x-6">
                            <Link to="/leaderboard" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">Live Results</Link>
                            {currentVoter ? (
                                <button onClick={handleLogout} className="flex items-center space-x-1 text-slate-300 hover:text-white text-sm font-medium">
                                    <LogOut className="h-4 w-4" />
                                    <span>Exit</span>
                                </button>
                            ) : (
                                <Link to="/" className="text-slate-300 hover:text-white text-sm font-medium">Home</Link>
                            )}
                        </nav>
                    </div>
                </header>
                {(authError || backendError) && (
                    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="container mx-auto">
                            <span className="font-semibold">System notice:</span> {authError || backendError}
                        </div>
                    </div>
                )}
                <main className="flex-grow">
                    <Outlet />
                </main>
                <footer className="bg-navy-900 text-slate-400 py-6 mt-12 border-t border-navy-800">
                    <div className="container mx-auto px-4 text-center text-sm">
                        <p>&copy; {new Date().getFullYear()} E-VotePro. Secure Electronic Voting System.</p>
                    </div>
                </footer>
            </div>
        );
    }

    // Admin / Auditor Sidebar Layout
    const navItems = [
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, role: 'admin' },
        { label: 'Audit Log', path: '/auditor', icon: FileText, role: 'auditor' },
        { label: 'Live Results', path: '/leaderboard', icon: BarChart3, role: 'all' },
    ];

    return (
        <div className="min-h-screen bg-slate-100 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-navy-900 text-white fixed h-full shadow-xl">
                <div className="p-6 border-b border-navy-800 flex items-center space-x-2">
                    <Shield className="h-8 w-8 text-accent-blue" />
                    <span className="text-xl font-bold">E-VotePro</span>
                </div>
                {(authError || backendError) && (
                    <div className="mx-4 mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                        <p className="font-semibold">System notice</p>
                        <p className="mt-1 text-amber-50/90">{authError || backendError}</p>
                    </div>
                )}
                <nav className="mt-6 px-4 space-y-2">
                    {navItems.filter(item => item.role === 'all' || item.role === currentVoter?.role || currentVoter?.role === 'admin').map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${location.pathname === item.path ? 'bg-accent-blue text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'}`}
                        >
                            <item.icon className="h-5 w-5" />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    ))}
                </nav>
                <div className="absolute bottom-0 w-full p-4 border-t border-navy-800">
                    <button onClick={handleLogout} className="flex items-center space-x-3 text-slate-400 hover:text-white w-full px-4 py-2 hover:bg-navy-800 rounded-lg transition-colors">
                        <LogOut className="h-5 w-5" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                <div className="max-w-6xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
