import React, { createContext, useContext, useState, useEffect } from 'react';

const VoteContext = createContext();

export const useVote = () => useContext(VoteContext);

export const VoteProvider = ({ children }) => {
    // Mock "FileStorage" using localStorage for persistence
    const [candidates, setCandidates] = useState(() => {
        const saved = localStorage.getItem('candidates');
        return saved ? JSON.parse(saved) : [
            { id: 1, name: "Imran Khan", party: "PTI", votes: 0 },
            { id: 2, name: "Nawaz Sharif", party: "PMLN", votes: 0 },
            { id: 3, name: "Bilawal Bhutto", party: "PPP", votes: 0 }
        ];
    });

    const [voters, setVoters] = useState(() => {
        const saved = localStorage.getItem('voters');
        return saved ? JSON.parse(saved) : []; // Simulates voters.dat
    });

    const [auditLog, setAuditLog] = useState(() => {
        const saved = localStorage.getItem('auditLog');
        return saved ? JSON.parse(saved) : [];
    });

    const [currentUser, setCurrentUser] = useState(null); // { role: 'admin' | 'voter' | 'candidate' | 'auditor', data: ... }

    useEffect(() => {
        localStorage.setItem('candidates', JSON.stringify(candidates));
    }, [candidates]);

    useEffect(() => {
        localStorage.setItem('voters', JSON.stringify(voters));
    }, [voters]);

    useEffect(() => {
        localStorage.setItem('auditLog', JSON.stringify(auditLog));
    }, [auditLog]);

    // --- ACTIONS ---

    const login = (role, credentials) => {
        // Simple mock auth
        if (role === 'admin') {
            if (credentials.username === 'admin' && credentials.password === 'admin123') {
                setCurrentUser({ role: 'admin' });
                return { success: true };
            }
            return { success: false, error: 'Invalid Admin Credentials' };
        }
        if (role === 'auditor') {
            setCurrentUser({ role: 'auditor' });
            return { success: true };
        }
        if (role === 'candidate') {
            setCurrentUser({ role: 'candidate' });
            return { success: true };
        }
        return { success: false, error: 'Role not supported yet' };
    };

    const logout = () => setCurrentUser(null);

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
        setCurrentUser({ role: 'voter', data: { name, cnic, age } });
        return { success: true };
    };

    const castVote = (candidateId) => {
        if (!currentUser || currentUser.role !== 'voter') return;

        // 1. Increment Vote
        setCandidates(prev => prev.map(c =>
            c.id === candidateId ? { ...c, votes: c.votes + 1 } : c
        ));

        // 2. Add to voters.dat (Prevent double voting)
        setVoters(prev => [...prev, { cnic: currentUser.data.cnic, hasVoted: true }]);

        // 3. Add to Audit Log (Anonymized mapping)
        // In real app, hash the CNIC. Here we just map ID -> Candidate ID
        const transactionId = `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        setAuditLog(prev => [...prev, {
            id: transactionId,
            voterHash: `User-${currentUser.data.cnic.slice(-4)}`, // fast hash simulation
            candidateId,
            timestamp: new Date().toISOString()
        }]);

        // 4. Logout (Session End)
        setCurrentUser(null);
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

    return (
        <VoteContext.Provider value={{
            candidates,
            voters,
            auditLog,
            currentUser,
            login,
            logout,
            registerVoter,
            castVote,
            resetElection,
            addCandidate
        }}>
            {children}
        </VoteContext.Provider>
    );
};
