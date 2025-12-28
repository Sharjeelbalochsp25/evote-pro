import React from 'react';
import { useVote } from '../../context/VoteContext';
import { BarChart3 } from 'lucide-react';

const Leaderboard = () => {
    const { candidates } = useVote();

    const sortedCandidates = [...candidates].sort((a, b) => b.votes - a.votes);
    const totalVotes = candidates.reduce((acc, c) => acc + c.votes, 0) || 1; // avoid /0

    return (
        <div className="max-w-4xl mx-auto py-12 px-4">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-extrabold text-navy-900 mb-4">Official Election Results</h1>
                <p className="text-slate-600 text-lg">Live updates from the central counting server.</p>
                <div className="inline-flex items-center space-x-2 mt-4 text-sm font-semibold bg-red-50 text-red-600 px-3 py-1 rounded-full animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-red-600"></span>
                    <span>LIVE</span>
                </div>
            </div>

            <div className="space-y-6">
                {sortedCandidates.map((candidate, index) => {
                    const percentage = ((candidate.votes / totalVotes) * 100).toFixed(1);

                    return (
                        <div key={candidate.id} className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 relative overflow-hidden">
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <div className="flex items-center space-x-4">
                                    <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg text-white ${index === 0 ? 'bg-amber-400' : 'bg-slate-200 text-slate-500'}`}>
                                        {index + 1}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-navy-900">{candidate.name}</h3>
                                        <p className="text-slate-500">{candidate.party}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-bold text-navy-900">{candidate.votes.toLocaleString()}</div>
                                    <div className="text-sm text-slate-400 font-medium">Votes Cast</div>
                                </div>
                            </div>

                            {/* Progress Bar Background */}
                            <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out ${index === 0 ? 'bg-accent-blue' : 'bg-slate-300'}`}
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-end mt-2 text-xs font-bold text-slate-500">
                                {percentage}%
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

export default Leaderboard;
