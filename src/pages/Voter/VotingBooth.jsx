import React, { useState } from 'react';
import { useVote } from '../../context/ElectionContext';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VotingBooth = () => {
    const { candidates, castVote, currentVoter } = useVote();
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [voteSuccess, setVoteSuccess] = useState(null); // { transactionId: '...' }
    const navigate = useNavigate();

    const handleVote = async () => {
        if (!selectedCandidate) return;
        const result = await castVote(selectedCandidate);
        if (result && result.success) {
            setVoteSuccess(result);
        }
    };

    const handleFinish = () => {
        navigate('/');
    };

    if (voteSuccess) {
        return (
            <div className="max-w-xl mx-auto py-16 px-4 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
                    <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="h-10 w-10" />
                    </div>
                    <h2 className="text-3xl font-bold text-navy-900 mb-4">Vote Cast Successfully!</h2>
                    <p className="text-slate-600 mb-8">
                        Your vote has been securely recorded on the ledger. Thank you for exercising your democratic right.
                    </p>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-8">
                        <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Transaction ID</p>
                        <p className="font-mono text-lg text-navy-900 font-bold">{voteSuccess.transactionId}</p>
                    </div>

                    <button onClick={handleFinish} className="px-8 py-3 bg-navy-900 text-white rounded-lg font-bold hover:bg-navy-800 transition-colors">
                        Return to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-12 px-4">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-navy-900">Official Ballot Paper</h2>
                <p className="text-slate-500">Select one candidate from the list below. This action cannot be undone.</p>
                <div className="mt-4 inline-flex items-center px-4 py-2 bg-blue-50 text-accent-blue rounded-full text-sm font-medium">
                    Verified Voter: {currentVoter?.data?.name} ({currentVoter?.data?.identifier})
                </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {candidates.map((candidate) => (
                    <div
                        key={candidate.id}
                        onClick={() => setSelectedCandidate(candidate.id)}
                        className={`cursor-pointer border-2 rounded-xl p-6 transition-all relative overflow-hidden group ${selectedCandidate === candidate.id ? 'border-accent-blue bg-blue-50 shadow-lg scale-[1.02]' : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-md'}`}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${selectedCandidate === candidate.id ? 'border-accent-blue bg-accent-blue text-white opacity-100' : 'border-slate-300'}`}>
                                {selectedCandidate === candidate.id && <CheckCircle className="h-4 w-4" />}
                            </div>
                        </div>

                        <div className="h-16 w-16 bg-slate-200 rounded-full mb-4 flex items-center justify-center text-2xl font-bold text-slate-500">
                            {candidate.name.charAt(0)}
                        </div>
                        <h3 className="text-xl font-bold text-navy-900">{candidate.name}</h3>
                        <p className="text-accent-blue font-semibold">{candidate.party}</p>

                        {selectedCandidate === candidate.id && (
                            <div className="absolute inset-0 border-2 border-accent-blue rounded-xl pointer-events-none"></div>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex justify-end sticky bottom-8">
                <button
                    onClick={handleVote}
                    disabled={!selectedCandidate}
                    className={`px-8 py-4 rounded-xl font-bold text-lg shadow-xl transition-all ${selectedCandidate ? 'bg-accent-blue text-white hover:bg-blue-600 hover:scale-105' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                    Confirm Vote
                </button>
            </div>

        </div>
    );
};

export default VotingBooth;
