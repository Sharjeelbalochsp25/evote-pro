const CLIENT_OBSERVABILITY_KEY = 'evoteproClientObservability';
const MAX_OBSERVABILITY_ENTRIES = 40;
const OBSERVABILITY_EVENT_NAME = 'evotepro:observability';

const safeWindow = typeof window !== 'undefined' ? window : null;

const readStoredEntries = () => {
    if (!safeWindow?.localStorage) return [];

    try {
        const saved = safeWindow.localStorage.getItem(CLIENT_OBSERVABILITY_KEY);
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const persistEntries = (entries) => {
    if (!safeWindow?.localStorage) return;

    try {
        safeWindow.localStorage.setItem(CLIENT_OBSERVABILITY_KEY, JSON.stringify(entries.slice(0, MAX_OBSERVABILITY_ENTRIES)));
    } catch {
        // Ignore storage failures in restricted browsers.
    }
};

const dispatchChange = (entries, entry = null) => {
    if (!safeWindow) return;

    safeWindow.dispatchEvent(
        new CustomEvent(OBSERVABILITY_EVENT_NAME, {
            detail: { entries, entry },
        }),
    );
};

const createId = () => `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sanitizeDetails = (details = {}) => {
    if (!details || typeof details !== 'object') return {};

    return Object.fromEntries(
        Object.entries(details)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, typeof value === 'string' ? value : value]),
    );
};

export const loadClientObservability = () => readStoredEntries();

export const clearClientObservability = () => {
    persistEntries([]);
    dispatchChange([]);
};

export const subscribeClientObservability = (listener) => {
    if (!safeWindow) return () => {};

    const handler = (event) => {
        const entries = Array.isArray(event?.detail?.entries) ? event.detail.entries : readStoredEntries();
        listener(entries, event?.detail?.entry || null);
    };

    safeWindow.addEventListener(OBSERVABILITY_EVENT_NAME, handler);
    return () => safeWindow.removeEventListener(OBSERVABILITY_EVENT_NAME, handler);
};

export const recordClientEvent = (type, message, details = {}) => {
    const entry = {
        id: createId(),
        type: String(type || 'info'),
        message: String(message || ''),
        details: sanitizeDetails(details),
        timestamp: new Date().toISOString(),
    };

    const entries = [entry, ...readStoredEntries()].slice(0, MAX_OBSERVABILITY_ENTRIES);
    persistEntries(entries);
    dispatchChange(entries, entry);
    return entry;
};

export const recordClientError = (scope, error, details = {}) => {
    const message = error?.message || error?.details || 'Unexpected client error';
    return recordClientEvent('error', `${scope}: ${message}`, {
        ...details,
        code: error?.code || '',
        name: error?.name || '',
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 1200) : '',
    });
};

export const formatClientTimestamp = (timestamp) => {
    if (!timestamp) return 'Just now';

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp);

    return date.toLocaleString();
};

export const maskInviteToken = (token) => {
    const value = String(token || '').trim();
    if (value.length <= 6) return value;

    return `${value.slice(0, 3)}...${value.slice(-3)}`;
};

const escapeCsvValue = (value) => {
    const stringValue = String(value ?? '');
    return `"${stringValue.replace(/"/g, '""')}"`;
};

export const buildCandidatesCsv = (candidates = []) => {
    const header = ['id', 'name', 'party', 'votes', 'createdAt'];
    const rows = candidates.map((candidate) => [candidate.id, candidate.name, candidate.party, candidate.votes, candidate.createdAt].map(escapeCsvValue).join(','));

    return [header.join(','), ...rows].join('\n');
};

export const buildInviteTokensCsv = (inviteTokens = []) => {
    const header = ['token', 'used', 'usedBy', 'usedAt', 'createdAt', 'updatedAt'];
    const rows = inviteTokens.map((invite) => [invite.token, invite.used ? 'used' : 'unused', invite.usedBy, invite.usedAt, invite.createdAt, invite.updatedAt].map(escapeCsvValue).join(','));

    return [header.join(','), ...rows].join('\n');
};

export const buildElectionSnapshot = ({ activeElection, candidates = [], voters = [], auditLog = [], inviteTokens = [], adminActivity = [] }) => ({
    exportedAt: new Date().toISOString(),
    election: activeElection ? { ...activeElection } : null,
    candidates: [...candidates],
    voters: [...voters],
    auditLog: [...auditLog],
    inviteTokens: [...inviteTokens],
    adminActivity: [...adminActivity],
});

export const downloadText = (filename, content, mimeType = 'text/plain;charset=utf-8') => {
    if (!safeWindow?.document) return false;

    const blob = new Blob([content], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = safeWindow.document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';

    safeWindow.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    safeWindow.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return true;
};

export const downloadJson = (filename, data) => downloadText(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
