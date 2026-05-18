import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState(() => {
        const saved = localStorage.getItem('users');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('users', JSON.stringify(users));
    }, [users]);

    const signup = (email, password, name) => {
        // Validation
        if (!email || !password || !name) {
            return { success: false, error: 'All fields are required' };
        }

        if (password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        if (users.some(u => u.email === email)) {
            return { success: false, error: 'Email already registered' };
        }

        // Create new user
        const newUser = {
            id: Date.now().toString(),
            email,
            password, // In production, use proper hashing
            name,
            createdAt: new Date().toISOString()
        };

        setUsers([...users, newUser]);
        setCurrentUser({ id: newUser.id, email, name });
        return { success: true };
    };

    const login = (email, password) => {
        const user = users.find(u => u.email === email && u.password === password);
        
        if (!user) {
            return { success: false, error: 'Invalid email or password' };
        }

        setCurrentUser({ id: user.id, email: user.email, name: user.name });
        return { success: true };
    };

    const logout = () => {
        setCurrentUser(null);
    };

    return (
        <AuthContext.Provider value={{ currentUser, signup, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
