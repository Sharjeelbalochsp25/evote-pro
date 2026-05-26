import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVote } from '../../context/ElectionContext';
import { CreditCard, User, AlertTriangle, ArrowRight } from 'lucide-react';

const VoterRegistration = () => {
    const navigate = useNavigate();
    const { registerVoter } = useVote();

    const [formData, setFormData] = useState({
        name: '',
        identifier: '',
        age: ''
    });
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.identifier || !formData.age) {
            setError("All fields are required.");
            return;
        }

        // Convert generic CNIC input to proper format if user forgot dashes? 
        // For now, assume user inputs correctly or simple validation handles it.

        const result = await registerVoter(formData);
        if (result.success) {
            navigate('/voter/vote');
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="max-w-md mx-auto py-12 px-4">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-navy-900">Voter Identification</h2>
                <p className="text-slate-500 mt-2">Please verify your identity to proceed.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-lg text-sm flex items-start mb-6">
                        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none transition-all"
                                placeholder="e.g. Ali Khan"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">CNIC Number</label>
                        <div className="relative">
                            <CreditCard className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                            <input
                                type="text"
                                name="identifier"
                                value={formData.identifier}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none transition-all"
                                placeholder="35202-1234567-1"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Format: 00000-0000000-0</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                        <input
                            type="number"
                            name="age"
                            value={formData.age}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none transition-all"
                            placeholder="e.g. 25"
                        />
                    </div>

                    <button className="w-full py-3 bg-accent-blue text-white rounded-lg font-bold hover:bg-blue-600 transition-all flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                        <span>Proceed to Vote</span>
                        <ArrowRight className="h-5 w-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default VoterRegistration;
