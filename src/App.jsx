import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Landing from './pages/Landing';
import JoinElection from './pages/Public/JoinElection';
import VoteElection from './pages/Public/VoteElection';
import AdminDashboard from './pages/Admin/Dashboard';
import AuditLog from './pages/Auditor/AuditLog';
import Leaderboard from './pages/Candidate/Leaderboard';
import Signup from './pages/Auth/Signup';
import Login from './pages/Auth/Login';
import PublicLayout from './components/PublicLayout';
import CreatorLayout from './components/CreatorLayout';
import { VoteProvider } from './context/VoteContext';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';

const ProtectedCreatorRoute = () => {
    const { currentUser, authLoading } = useAuth();

    if (authLoading) return null;
    if (!currentUser) return <Navigate to="/creator/login" replace />;

    return <Outlet />;
};

const CreatorAuthRoute = ({ element }) => {
    const { currentUser, authLoading } = useAuth();

    if (authLoading) return null;
    if (currentUser) return <Navigate to="/creator/dashboard" replace />;

    return element;
};

const LegacyRedirect = ({ to }) => <Navigate to={to} replace />;

function AppContent() {
    const { authLoading } = useAuth();
    
    // Temporary production-only override: when hosted on Vercel, ensure
    // the root path renders the public Landing page. This is a reversible
    // emergency fix to make the site show the landing page while we
    // investigate the deployment configuration.
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
        const host = window.location.hostname || '';
        if (host.includes('.vercel.app') && window.location.pathname === '/') {
            return <Landing />;
        }
    }

    if (authLoading) return null;

    return (
        <Routes>
            <Route element={<PublicLayout />}>
                <Route path="/" element={<Landing />} />
                <Route path="/join" element={<JoinElection />} />
                <Route path="/vote/:publicCode" element={<VoteElection />} />
                <Route path="/e/:publicCode" element={<VoteElection />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/creator/login" element={<CreatorAuthRoute element={<Login />} />} />
                <Route path="/creator/signup" element={<CreatorAuthRoute element={<Signup />} />} />
                <Route path="/login" element={<LegacyRedirect to="/creator/login" />} />
                <Route path="/signup" element={<LegacyRedirect to="/creator/signup" />} />
                <Route path="/voter/register" element={<LegacyRedirect to="/join" />} />
                <Route path="/voter/vote" element={<LegacyRedirect to="/join" />} />
                <Route path="/admin" element={<LegacyRedirect to="/creator/dashboard" />} />
                <Route path="/auditor" element={<LegacyRedirect to="/creator/audit" />} />
            </Route>

            <Route element={<ProtectedCreatorRoute />}>
                <Route element={<CreatorLayout />}>
                    <Route path="/creator/dashboard" element={<AdminDashboard />} />
                    <Route path="/creator/elections/:electionId" element={<AdminDashboard />} />
                    <Route path="/creator/elections/:electionId/share" element={<AdminDashboard />} />
                    <Route path="/creator/elections/:electionId/candidates" element={<AdminDashboard />} />
                    <Route path="/creator/audit" element={<AuditLog />} />
                    <Route path="/creator/results" element={<Leaderboard />} />
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <VoteProvider>
                <Router>
                    <AppContent />
                </Router>
            </VoteProvider>
        </AuthProvider>
    );
}

export default App;
