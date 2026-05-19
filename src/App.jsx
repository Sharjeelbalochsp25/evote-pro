import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import VoterRegistration from './pages/Voter/VoterRegistration';
import VotingBooth from './pages/Voter/VotingBooth';
import AdminDashboard from './pages/Admin/Dashboard';
import AuditLog from './pages/Auditor/AuditLog';
import Leaderboard from './pages/Candidate/Leaderboard';
import Signup from './pages/Auth/Signup';
import Login from './pages/Auth/Login';
import { useVote, VoteProvider } from './context/VoteContext';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { currentVoter } = useVote();

    if (!currentVoter) return <Navigate to="/" replace />;
    if (allowedRoles && !allowedRoles.includes(currentVoter.role)) return <Navigate to="/" replace />;

    return children;
};

function AppContent() {
    const { currentUser, authLoading } = useAuth();

    if (authLoading) return null;

    return (
        <Routes>
            {!currentUser ? (
                <>
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </>
            ) : (
                <>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Landing />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="/voter/register" element={<VoterRegistration />} />
                        <Route path="/voter/vote" element={
                            <ProtectedRoute allowedRoles={['voter']}>
                                <VotingBooth />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin" element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AdminDashboard />
                            </ProtectedRoute>
                        } />
                        <Route path="/auditor" element={
                            <ProtectedRoute allowedRoles={['auditor', 'admin']}>
                                <AuditLog />
                            </ProtectedRoute>
                        } />
                    </Route>
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/signup" element={<Navigate to="/" replace />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </>
            )}
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
