import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useVote } from '../context/ElectionContext';

const PieChart = ({ data = [], size = 160 }) => {
    const colors = [
        '#2563EB', '#F59E0B', '#10B981', '#EF4444', '#7C3AED', '#06B6D4', '#F97316', '#14B8A6', '#64748B'
    ];
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let angle = 0;

    const slices = data.map((d, i) => {
        const value = d.value || 0;
        const portion = value / total;
        const start = angle;
        const sweep = portion * 360;
        angle += sweep;
        const large = sweep > 180 ? 1 : 0;
        const r = size / 2;
        const cx = r;
        const cy = r;
        const startRad = (Math.PI / 180) * (start - 90);
        const endRad = (Math.PI / 180) * (start + sweep - 90);
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const dAttr = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        return { dAttr, color: d.color || colors[i % colors.length], label: d.label, value };
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <defs>
                <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.12" />
                </filter>
            </defs>
            {slices.map((s, i) => (
                <path key={i} d={s.dAttr} fill={s.color} stroke="#fff" strokeWidth="0.6" style={{ filter: 'none' }} />
            ))}
        </svg>
    );
};

const SummaryModal = ({ onClose }) => {
    const { activeElection, candidates, voters, auditLog } = useVote();

    const totalVotes = candidates.reduce((s, c) => s + (c.votes || 0), 0);
    const top = [...candidates].sort((a, b) => b.votes - a.votes).slice(0, 5);

    const colorPalette = ['#2563EB', '#F59E0B', '#10B981', '#EF4444', '#7C3AED', '#06B6D4', '#F97316', '#14B8A6', '#64748B'];
    const pieData = candidates.map((c, i) => ({ label: c.name, value: c.votes || 0, color: colorPalette[i % colorPalette.length] }));

    const printRef = useRef(null);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div ref={printRef} className="bg-white rounded-xl shadow-lg w-[min(900px,95%)] max-h-[90vh] overflow-auto">
                <div className="p-4 border-b flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold">Summary — {activeElection?.title || 'Election'}</h3>
                        <p className="text-sm text-slate-500">Overview and visual results</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                const payload = {
                                    election: { id: activeElection?.id, title: activeElection?.title, publicCode: activeElection?.publicCode },
                                    totals: { totalVotes, voters: voters.length, auditEntries: auditLog.length },
                                    candidates: candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, votes: c.votes })),
                                };

                                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${(activeElection?.title || 'election').replace(/[^a-z0-9]/gi, '_')}_summary.json`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                            }}
                            className="px-3 py-1 rounded bg-blue-50 text-blue-700 text-sm"
                        >
                            Download JSON
                        </button>

                        <button
                            onClick={() => {
                                const rows = [['id', 'name', 'party', 'votes', 'percentage']];
                                const total = candidates.reduce((s, c) => s + (c.votes || 0), 0) || 1;
                                candidates.forEach((c) => {
                                    const pct = Math.round(((c.votes || 0) / total) * 100);
                                    rows.push([c.id, c.name, c.party, String(c.votes || 0), String(pct)]);
                                });
                                const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${(activeElection?.title || 'election').replace(/[^a-z0-9]/gi, '_')}_results.csv`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                            }}
                            className="px-3 py-1 rounded bg-green-50 text-green-700 text-sm"
                        >
                            Download CSV
                        </button>

                        <button
                            onClick={() => {
                                const title = activeElection?.title || 'Election';
                                const safeTitle = String(title).replace(/[^a-z0-9]/gi, '_');
                                const total = candidates.reduce((s, c) => s + (c.votes || 0), 0) || 0;
                                const colorPaletteLocal = ['#2563EB', '#F59E0B', '#10B981', '#EF4444', '#7C3AED', '#06B6D4', '#F97316'];

                                let angle = 0;
                                const r = 90;
                                const cx = r;
                                const cy = r;
                                const slices = candidates.map((c, i) => {
                                    const value = c.votes || 0;
                                    const portion = total ? value / total : 0;
                                    const sweep = portion * 360;
                                    const start = angle;
                                    angle += sweep;
                                    const large = sweep > 180 ? 1 : 0;
                                    const startRad = (Math.PI / 180) * (start - 90);
                                    const endRad = (Math.PI / 180) * (start + sweep - 90);
                                    const x1 = cx + r * Math.cos(startRad);
                                    const y1 = cy + r * Math.sin(startRad);
                                    const x2 = cx + r * Math.cos(endRad);
                                    const y2 = cy + r * Math.sin(endRad);
                                    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
                                    return { d, color: colorPaletteLocal[i % colorPaletteLocal.length], label: c.name, value };
                                });

                                const pieSvg = `<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">${slices.map(s => `<path d="${s.d}" fill="${s.color}" stroke="#fff" stroke-width="0.6"></path>`).join('')}</svg>`;

                                const barsHtml = candidates.map((c, idx) => {
                                    const pct = total ? Math.round((c.votes / total) * 100) : 0;
                                    const color = colorPaletteLocal[idx % colorPaletteLocal.length];
                                    return `<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><div><span style=\"display:inline-block;width:10px;height:10px;background:${color};margin-right:8px;border-radius:2px;\"></span>${c.name}</div><div style=\"font-weight:600\">${c.votes} — ${pct}%</div></div><div style=\"height:10px;background:#f3f4f6;border-radius:6px;overflow:hidden\"><div style=\"width:${pct}%;height:100%;background:${color};transition:width 400ms ease\"></div></div></div>`;
                                }).join('');

                                const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title} — Summary</title><style>body{font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#0f172a} .header{display:flex;justify-content:space-between;align-items:center;} .muted{color:#64748b}</style></head><body><div class="header"><div><h1 style="margin:0">${title}</h1><div class="muted">Generated: ${new Date().toLocaleString()}</div></div><div>${pieSvg}</div></div><hr style="margin:16px 0"/><h3>Totals</h3><div style="margin-bottom:8px">Total Votes: <strong>${total}</strong></div><div style="margin-bottom:16px">Registered voters: <strong>${voters.length}</strong></div><h3>Results</h3>${barsHtml}<hr style="margin:20px 0"/><h3>Audit</h3><div>Entries: ${auditLog.length}</div></body></html>`;

                                const w = window.open('', '_blank');
                                if (!w) return alert('Popup blocked. Allow popups for this site to print.');
                                w.document.open();
                                w.document.write(html);
                                w.document.close();
                                setTimeout(() => {
                                    w.print();
                                }, 500);
                            }}
                            className="px-3 py-1 rounded bg-indigo-50 text-indigo-700 text-sm"
                        >
                            Print / Save PDF
                        </button>

                        <button
                            onClick={async () => {
                                try {
                                    if (!printRef.current) return;
                                    const html2canvasModule = await import('html2canvas');
                                    const html2canvas = html2canvasModule.default || html2canvasModule;
                                    const { jsPDF } = await import('jspdf');

                                    const canvas = await html2canvas(printRef.current, { scale: 2 });
                                    const imgData = canvas.toDataURL('image/png');

                                    const pdf = new jsPDF('p', 'mm', 'a4');
                                    const pdfWidth = pdf.internal.pageSize.getWidth();
                                    const margin = 10; // mm
                                    const usableWidth = pdfWidth - margin * 2;
                                    const imgProps = { width: canvas.width, height: canvas.height };
                                    const pdfHeight = (imgProps.height * usableWidth) / imgProps.width;
                                    pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, pdfHeight);
                                    const title = activeElection?.title || 'election';
                                    const safeTitle = String(title).replace(/[^a-z0-9]/gi, '_');
                                    pdf.save(`${safeTitle}_summary.pdf`);
                                } catch (err) {
                                    // fallback to print dialog
                                    console.error(err);
                                    alert('PDF generation failed, opening print dialog as fallback.');
                                    const w = window.open('', '_blank');
                                    if (!w) return alert('Popup blocked');
                                    w.document.write(document.documentElement.innerHTML);
                                    w.document.close();
                                    setTimeout(() => w.print(), 500);
                                }
                            }}
                            className="px-3 py-1 rounded bg-violet-50 text-violet-700 text-sm"
                        >
                            Download PDF
                        </button>

                        <button onClick={onClose} className="p-2 rounded hover:bg-slate-100">
                            <X />
                        </button>
                    </div>
                </div>
                

                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-4">
                        <div className="bg-slate-50 p-4 rounded">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-slate-500">Total Votes</div>
                                    <div className="text-3xl font-bold">{totalVotes}</div>
                                </div>
                                <div className="text-sm text-slate-500 text-right">
                                    <div>Registered voters: {voters.length}</div>
                                    <div>Audit entries: {auditLog.length}</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded border">
                            <h4 className="font-bold mb-3">Bar Results</h4>
                            <div className="space-y-3">
                                {candidates.map((c, idx) => {
                                    const pct = totalVotes ? Math.round((c.votes / totalVotes) * 100) : 0;
                                    const color = colorPalette[idx % colorPalette.length];
                                    return (
                                        <div key={c.id} className="space-y-1">
                                            <div className="flex justify-between text-sm text-slate-600">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block h-3 w-3 rounded" style={{ background: color }} />
                                                    <span>{c.name}</span>
                                                </div>
                                                <div className="font-medium">{c.votes} — {pct}%</div>
                                            </div>
                                            <div className="w-full h-3 bg-slate-100 rounded overflow-hidden">
                                                <div className="h-full rounded" style={{ width: `${pct}%`, background: color, transition: 'width 600ms ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded border flex flex-col items-center">
                            <h4 className="font-bold mb-3">Vote Share</h4>
                            <PieChart data={pieData} size={180} />
                            <div className="mt-3 w-full">
                                <div className="text-sm text-slate-500 mb-2">Legend</div>
                                <div className="grid grid-cols-1 gap-2">
                                    {pieData.map((p, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm">
                                            <span className="inline-block h-3 w-3 rounded" style={{ background: p.color }} />
                                            <span className="truncate">{p.label || '—'}</span>
                                            <span className="ml-auto text-slate-400">{p.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded border">
                            <h4 className="font-bold mb-2">Top Candidates</h4>
                            <ol className="list-decimal pl-5 text-sm space-y-1">
                                {top.map((t) => (
                                    <li key={t.id}>{t.name} — {t.votes} votes</li>
                                ))}
                                {top.length === 0 && <li className="text-slate-400">No candidates yet</li>}
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SummaryModal;
