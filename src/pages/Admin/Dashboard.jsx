import React, { useState } from 'react';
import { useVote } from '../../context/VoteContext';
import { Users, Trash2, RotateCcw, Plus, Award } from 'lucide-react';

const AdminDashboard = () => {
    const { candidates, voters, resetElection, addCandidate } = useVote();
    const [newCandidate, setNewCandidate] = useState({ name: '', party: '' });
    const [isAdding, setIsAdding] = useState(false);

    const totalVotes = candidates.reduce((acc, curr) => acc + curr.votes, 0);
    const leadingCandidate = [...candidates].sort((a, b) => b.votes - a.votes)[0];

    const handleAddCandidate = (e) => {
        e.preventDefault();
        if (newCandidate.name && newCandidate.party) {
            addCandidate(newCandidate);
            setNewCandidate({ name: '', party: '' });
            setIsAdding(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-navy-900">Election Control Center</h1>
                    <p className="text-slate-500">Manage candidates and monitor election status.</p>
                </div>
                <button
                    onClick={() => {
                        if (window.confirm("Are you sure you want to reset the entire election? This cannot be undone.")) {
                            resetElection();
                        }
                    }}
                    className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center space-x-2 text-sm font-medium"
                >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reset Election</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 font-medium">Total Votes Cast</span>
                        <Users className="h-5 w-5 text-accent-blue" />
                    </div>
                    <p className="text-4xl font-bold text-navy-900">{totalVotes}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 font-medium">Leading Candidate</span>
                        <Award className="h-5 w-5 text-amber-500" />
                    </div>
                    <p className="text-xl font-bold text-navy-900 truncate">{leadingCandidate?.name || 'N/A'}</p>
                    <p className="text-sm text-slate-400">{leadingCandidate?.party || '-'}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 font-medium">Voter Turnout</span>
                        <Users className="h-5 w-5 text-green-500" />
                    </div>
                    <p className="text-4xl font-bold text-navy-900">{voters.length}</p>
                    <p className="text-sm text-slate-400">Registered unique CNICs</p>
                </div>
            </div>

            {/* Candidates Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-lg text-navy-900">Candidates Registry</h3>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 flex items-center space-x-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Add Candidate</span>
                    </button>
                </div>

                {isAdding && (
                    <div className="p-6 bg-blue-50 border-b border-blue-100 animate-in fade-in slide-in-from-top-2">
                        <form onSubmit={handleAddCandidate} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Candidate Name</label>
                                <input
                                    type="text"
                                    value={newCandidate.name}
                                    onChange={(e) => setNewCandidate({ ...newCandidate, name: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-accent-blue outline-none"
                                    placeholder="Candidate Name"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Party Affiliation</label>
                                <input
                                    type="text"
                                    value={newCandidate.party}
                                    onChange={(e) => setNewCandidate({ ...newCandidate, party: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-accent-blue outline-none"
                                    placeholder="Party Name"
                                />
                            </div>
                            <button className="px-6 py-2 bg-accent-blue text-white rounded-lg font-bold hover:bg-blue-600 h-10">Save</button>
                        </form>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
                        <tr>
                            <th className="px-6 py-4 font-semibold">ID</th>
                            <th className="px-6 py-4 font-semibold">Name</th>
                            <th className="px-6 py-4 font-semibold">Party</th>
                            <th className="px-6 py-4 font-semibold text-right">Votes</th>
                            <th className="px-6 py-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {candidates.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-mono text-slate-500">#{c.id.toString().padStart(3, '0')}</td>
                                <td className="px-6 py-4 font-medium text-navy-900">{c.name}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-blue-100 text-accent-blue rounded text-xs font-bold">{c.party}</span>
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-navy-900">{c.votes}</td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-slate-400 hover:text-red-500 transition-colors">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminDashboard;
