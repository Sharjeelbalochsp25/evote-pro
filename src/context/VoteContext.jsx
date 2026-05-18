import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const VoteContext = createContext();

export const useVote = () => useContext(VoteContext);

export const VoteProvider = ({ children }) => {
    const { currentUser } = useAuth();

    // All systems stored per user: { userId: { candidates: [], voters: [], auditLog: [] } }
    const [allSystems, setAllSystems] = useState(() => {
        const saved = localStorage.getItem('votingSystems');
        return saved ? JSON.parse(saved) : {};
    });

    // Get current user's system
    const getUserSystem = () => {
        if (!currentUser) return { candidates: [], voters: [], auditLog: [] };
        return allSystems[currentUser.id] || { candidates: [], voters: [], auditLog: [] };
    };

    // Save system for current user
    const saveUserSystem = (system) => {
        if (!currentUser) return;
        setAllSystems(prev => ({
            ...prev,
            [currentUser.id]: system
        }));
    };

    const currentSystem = getUserSystem();

    const [candidates, setCandidates] = useState(currentSystem.candidates);
    const [voters, setVoters] = useState(currentSystem.voters);
    const [auditLog, setAuditLog] = useState(currentSystem.auditLog);

    const [currentVoter, setCurrentVoter] = useState(null); // { role: 'admin' | 'voter' | 'candidate' | 'auditor', data: ... }

    useEffect(() => {
        localStorage.setItem('votingSystems', JSON.stringify(allSystems));
    }, [allSystems]);

    // Update state when user changes
    useEffect(() => {
        const system = getUserSystem();
        setCandidates(system.candidates);
        setVoters(system.voters);
        setAuditLog(system.auditLog);
    }, [currentUser, allSystems]);

    useEffect(() => {
        saveUserSystem({ candidates, voters, auditLog });
    }, [candidates, voters, auditLog]);

    // --- ACTIONS ---

    const loginVoter = (role, credentials) => {
        // Simple mock auth for voter roles (admin, auditor, candidate)
        if (role === 'admin') {
            if (credentials.username === 'admin' && credentials.password === 'admin123') {
                setCurrentVoter({ role: 'admin' });
                return { success: true };
            }
            return { success: false, error: 'Invalid Admin Credentials' };
        }
        if (role === 'auditor') {
            setCurrentVoter({ role: 'auditor' });
            return { success: true };
        }
        if (role === 'candidate') {
            setCurrentVoter({ role: 'candidate' });
            return { success: true };
        }
        return { success: false, error: 'Role not supported yet' };
    };

    const logoutVoter = () => setCurrentVoter(null);

    const registerVoter = (details) => {
        // Validation Logic
        const { name, age, cnic } = details;

        if (age < 18) return { success: false, error: "Not Eligible: Under 18" };

        // CNIC Format: 00000-0000000-0
        const cnicRegex = /^[0-9]{5}-[0-9]{7}-[0-9]$/;
        if (!cnicRegex.test(cnic)) return { success: false, error: "Invalid CNIC Format (e.g., 12345-1234567-1)" };

        // Duplicate Check (voters.dat)
        if (voters.some(v => v.cnic === cnic)) return { success: false, error: "Not Eligible: Already Voted" };

        // Success - temporarily store details to allow voting
        setCurrentVoter({ role: 'voter', data: { name, cnic, age } });
        return { success: true };
    };

    const castVote = (candidateId) => {
        if (!currentVoter || currentVoter.role !== 'voter') return;

        // 1. Increment Vote
        setCandidates(prev => prev.map(c =>
            c.id === candidateId ? { ...c, votes: c.votes + 1 } : c
        ));

        // 2. Add to voters.dat (Prevent double voting)
        setVoters(prev => [...prev, { cnic: currentVoter.data.cnic, hasVoted: true }]);

        // 3. Add to Audit Log (Anonymized mapping)
        // In real app, hash the CNIC. Here we just map ID -> Candidate ID
        const transactionId = `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        setAuditLog(prev => [...prev, {
            id: transactionId,
            voterHash: `User-${currentVoter.data.cnic.slice(-4)}`, // fast hash simulation
            candidateId,
            timestamp: new Date().toISOString()
        }]);

        // 4. Logout (Session End)
        setCurrentVoter(null);
        return { success: true, transactionId };
    };

    const resetElection = () => {
        setCandidates(prev => prev.map(c => ({ ...c, votes: 0 })));
        setVoters([]);
        setAuditLog([]);
    };

    const addCandidate = (newCandidate) => {
        const id = candidates.length > 0 ? Math.max(...candidates.map(c => c.id)) + 1 : 1;
        setCandidates([...candidates, { ...newCandidate, id, votes: 0 }]);
    };

    const removeCandidate = (candidateId) => {
        setCandidates(prev => prev.filter(c => c.id !== candidateId));
    };

    return (
        <VoteContext.Provider value={{
            candidates,
            voters,
            auditLog,
            currentVoter,
            loginVoter,
            logoutVoter,
            registerVoter,
            castVote,
            resetElection,
            addCandidate,
            removeCandidate
        }}>
            {children}
        </VoteContext.Provider>
    );
};
