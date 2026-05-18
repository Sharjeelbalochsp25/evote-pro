import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, Lock, FileText, Vote, AlertCircle } from 'lucide-react';
import { useVote } from '../context/VoteContext';

const Landing = () => {
    const navigate = useNavigate();
    const { loginVoter } = useVote();
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleAdminLogin = (e) => {
        e.preventDefault();
        const result = loginVoter('admin', { username, password });
        if (result.success) {
            navigate('/admin');
        } else {
            setError(result.error);
        }
    };

    const handleAuditorLogin = () => {
        loginVoter('auditor');
        navigate('/auditor');
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 items-center">

                {/* Left: Hero Text */}
                <div className="space-y-6">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-navy-900 leading-tight">
                        Secure Voting for a <span className="text-accent-blue">Digital Nation</span>.
                    </h1>
                    <p className="text-lg text-slate-600">
                        E-VotePro is the next-generation electronic voting system ensuring transparency, security, and accessibility for every citizen.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                        <button
                            onClick={() => navigate('/voter/register')}
                            className="px-8 py-3 bg-accent-blue text-white rounded-lg font-bold shadow-lg hover:bg-blue-600 transition-transform transform hover:-translate-y-1 flex items-center justify-center space-x-2"
                        >
                            <Vote className="h-5 w-5" />
                            <span>Vote Now</span>
                        </button>
                        <button
                            onClick={() => navigate('/leaderboard')}
                            className="px-8 py-3 bg-white text-navy-900 border-2 border-slate-200 rounded-lg font-bold hover:border-accent-blue hover:text-accent-blue transition-colors flex items-center justify-center space-x-2"
                        >
                            <FileText className="h-5 w-5" />
                            <span>View Results</span>
                        </button>
                    </div>
                </div>

                {/* Right: Login/Role Cards */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
                    <h2 className="text-2xl font-bold text-navy-900 mb-6">Access Portal</h2>

                    {!showAdminLogin ? (
                        <div className="grid gap-4">
                            <button onClick={() => navigate('/voter/register')} className="flex items-center p-4 border border-slate-200 rounded-xl hover:border-accent-blue hover:bg-blue-50 transition-all group text-left">
                                <div className="h-12 w-12 bg-blue-100 text-accent-blue rounded-full flex items-center justify-center mr-4 group-hover:bg-accent-blue group-hover:text-white transition-colors">
                                    <User className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-navy-900">Voter</h3>
                                    <p className="text-sm text-slate-500">Cast your vote securely</p>
                                </div>
                            </button>

                            <button onClick={() => setShowAdminLogin(true)} className="flex items-center p-4 border border-slate-200 rounded-xl hover:border-navy-900 hover:bg-slate-50 transition-all group text-left">
                                <div className="h-12 w-12 bg-slate-100 text-navy-900 rounded-full flex items-center justify-center mr-4 group-hover:bg-navy-900 group-hover:text-white transition-colors">
                                    <Shield className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-navy-900">Admin</h3>
                                    <p className="text-sm text-slate-500">Manage elections</p>
                                </div>
                            </button>

                            <button onClick={handleAuditorLogin} className="flex items-center p-4 border border-slate-200 rounded-xl hover:border-teal-600 hover:bg-teal-50 transition-all group text-left">
                                <div className="h-12 w-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mr-4 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                                    <Lock className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-navy-900">Auditor</h3>
                                    <p className="text-sm text-slate-500">View transaction logs</p>
                                </div>
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleAdminLogin} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-navy-900">Admin Login</h3>
                                <button type="button" onClick={() => setShowAdminLogin(false)} className="text-sm text-slate-500 hover:text-accent-blue">Back</button>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm flex items-center">
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none transition-all"
                                    placeholder="admin"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none transition-all"
                                    placeholder="admin123"
                                />
                            </div>
                            <button className="w-full py-3 bg-navy-900 text-white rounded-lg font-bold hover:bg-navy-800 transition-colors">Login</button>
                        </form>
                    )}

                </div>
            </div>
        </div>
    );
};

export default Landing;
