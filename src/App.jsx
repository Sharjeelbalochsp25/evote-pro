import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import PublicLayout from './components/PublicLayout';
import CreatorLayout from './components/CreatorLayout';
import Landing from './pages/Landing';
import VoterRegistration from './pages/Voter/VoterRegistration';
import VotingBooth from './pages/Voter/VotingBooth';
import AdminDashboard from './pages/Admin/Dashboard';
import AuditLog from './pages/Auditor/AuditLog';
import Leaderboard from './pages/Candidate/Leaderboard';
import Signup from './pages/Auth/Signup';
import Login from './pages/Auth/Login';
import JoinElection from './pages/Public/JoinElection';
import VoteElection from './pages/Public/VoteElection';
import { useVote, VoteProvider } from './context/ElectionContext';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';
import { deploymentDiagnostics, firebaseDiagnostics, hasDemoMode } from './firebase';
import { AppErrorBoundary, RouteErrorBoundary } from './components/ErrorBoundary';

const FirebaseFatalScreen = () => {
    const missingList = firebaseDiagnostics.missing.map((key) => `- ${key}`).join('\n');

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-16 text-slate-100">
            <div className="max-w-2xl rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 shadow-2xl shadow-rose-950/30">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">Firebase configuration error</p>
                <h1 className="mt-3 text-3xl font-semibold">Production startup blocked</h1>
                <p className="mt-4 leading-7 text-slate-200">
                    The app was prevented from starting because required Firebase env vars are missing and demo mode is not enabled.
                </p>
                <pre className="mt-6 overflow-auto rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm text-rose-100 whitespace-pre-wrap">{missingList}</pre>
                <p className="mt-6 text-sm text-slate-300">
                    Enable the missing production Firebase variables in your hosting provider, or set VITE_ENABLE_DEMO_MODE=true only for local development.
                </p>
            </div>
        </div>
    );
};

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { currentVoter } = useVote();

    if (!currentVoter) return <Navigate to="/" replace />;
    if (allowedRoles && !allowedRoles.includes(currentVoter.role)) return <Navigate to="/" replace />;

    return children;
};

const CreatorGate = ({ children }) => {
    const { currentUser, authLoading } = useAuth();

    if (authLoading) return null;
    if (!currentUser) return <Navigate to="/creator/login" replace />;

    return children;
};

function AppContent() {
    const { authLoading } = useAuth();

    const withRouteBoundary = (element, key) => <RouteErrorBoundary key={key}>{element}</RouteErrorBoundary>;

    if (authLoading) return null;

    return (
        <Routes>
            <Route element={<PublicLayout />}>
                <Route path="/" element={withRouteBoundary(<Landing />, 'landing-public')} />
                <Route path="/join" element={withRouteBoundary(<JoinElection />, 'join-election')} />
                <Route path="/vote/:publicCode" element={withRouteBoundary(<VoteElection />, 'public-vote')} />
                <Route path="/leaderboard" element={withRouteBoundary(<Leaderboard />, 'leaderboard-public')} />
                <Route path="/login" element={<Navigate to="/creator/login" replace />} />
                <Route path="/signup" element={<Navigate to="/creator/signup" replace />} />
                <Route path="/voter/register" element={<Navigate to="/join" replace />} />
                <Route path="/voter/vote" element={<Navigate to="/join" replace />} />
            </Route>

            <Route path="/creator/login" element={withRouteBoundary(<Login />, 'creator-login')} />
            <Route path="/creator/signup" element={withRouteBoundary(<Signup />, 'creator-signup')} />
            <Route path="/creator" element={<Navigate to="/creator/dashboard" replace />} />

            <Route element={<CreatorGate><CreatorLayout /></CreatorGate>}>
                <Route path="/creator/dashboard" element={withRouteBoundary(<AdminDashboard />, 'creator-dashboard')} />
                <Route path="/creator/audit" element={withRouteBoundary(<AuditLog />, 'creator-audit')} />
                <Route path="/admin" element={<Navigate to="/creator/dashboard" replace />} />
                <Route path="/auditor" element={<Navigate to="/creator/audit" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    if (!firebaseDiagnostics.valid && !hasDemoMode) {
        return <FirebaseFatalScreen />;
    }

    return (
        <AppErrorBoundary>
            {(hasDemoMode || deploymentDiagnostics.deploymentEnv !== 'production') && (
                <div className="border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-center text-sm text-cyan-100">
                    {hasDemoMode
                        ? 'Demo mode is enabled for local development only.'
                        : `Deployment mode: ${deploymentDiagnostics.deploymentEnv}`}
                </div>
            )}
            <AuthProvider>
                <VoteProvider>
                    <Router>
                        <AppContent />
                    </Router>
                </VoteProvider>
            </AuthProvider>
        </AppErrorBoundary>
    );
}

export default App;
