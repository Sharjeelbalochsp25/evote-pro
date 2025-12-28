import React from 'react';
import { useVote } from '../../context/VoteContext';
import { FileText, Search } from 'lucide-react';

const AuditLog = () => {
    const { auditLog, candidates } = useVote();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-navy-900">Digital Audit Trail</h1>
                    <p className="text-slate-500">Immutable record of all voting transactions.</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input type="text" placeholder="Search Transaction ID" className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-accent-blue outline-none w-64" />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left table-auto">
                    <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Details</th>
                            <th className="px-6 py-4 font-semibold">Transaction ID</th>
                            <th className="px-6 py-4 font-semibold">Voter Hash</th>
                            <th className="px-6 py-4 font-semibold">Candidate ID</th>
                            <th className="px-6 py-4 font-semibold text-right">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {auditLog.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                    No transactions recorded yet.
                                </td>
                            </tr>
                        ) : (
                            auditLog.slice().reverse().map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="h-8 w-8 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center">
                                            <FileText className="h-4 w-4" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono font-medium text-navy-900">{log.id}</td>
                                    <td className="px-6 py-4 font-mono text-slate-500">{log.voterHash}</td>
                                    <td className="px-6 py-4">
                                        <span className="font-semibold text-navy-900">
                                            {candidates.find(c => c.id === log.candidateId)?.name || 'Unknown'} (ID: {log.candidateId})
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-slate-500 text-xs">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AuditLog;
