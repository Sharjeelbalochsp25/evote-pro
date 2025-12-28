import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import VoterRegistration from './pages/Voter/VoterRegistration';
import VotingBooth from './pages/Voter/VotingBooth';
import AdminDashboard from './pages/Admin/Dashboard';
import AuditLog from './pages/Auditor/AuditLog';
import Leaderboard from './pages/Candidate/Leaderboard';
import { useVote } from './context/VoteContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { currentUser } = useVote();

    if (!currentUser) return <Navigate to="/" replace />;
    if (allowedRoles && !allowedRoles.includes(currentUser.role)) return <Navigate to="/" replace />;

    return children;
};

function App() {
    return (
        <Router>
            <Layout>
                <Routes>
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
                </Routes>
            </Layout>
        </Router>
    );
}

export default App;
