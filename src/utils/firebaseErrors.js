const TRANSIENT_ERROR_CODES = new Set([
    'unavailable',
    'deadline-exceeded',
    'aborted',
    'cancelled',
    'internal',
]);

export const classifyFirebaseError = (error, fallbackMessage = 'A Firebase operation failed.') => {
    const code = String(error?.code || '').toLowerCase();

    if (code.includes('permission-denied')) return 'Permission denied. Check Firestore rules and user ownership.';
    if (code.includes('resource-exhausted')) return 'Quota exceeded. Firebase rejected the request because the project is out of capacity.';
    if (code.includes('unauthenticated')) return 'Authentication failed. Please sign in again.';
    if (code.includes('not-found')) return 'Requested Firebase data was not found.';
    if (code.includes('unavailable')) return 'Firestore is temporarily unavailable or offline.';
    if (code.includes('deadline-exceeded')) return 'Firebase request timed out. Please try again.';
    if (code.includes('already-exists')) return 'The requested record already exists.';
    if (code.includes('failed-precondition')) return error?.message || 'A required Firebase precondition failed.';
    if (code.includes('cancelled')) return 'Firebase request was cancelled.';

    return error?.message || fallbackMessage;
};

export const isTransientFirebaseError = (error) => {
    const code = String(error?.code || '').toLowerCase();
    return [...TRANSIENT_ERROR_CODES].some((entry) => code.includes(entry));
};

export const withRetry = async (operation, options = {}) => {
    const attempts = Number.isFinite(options.attempts) ? options.attempts : 3;
    const baseDelayMs = Number.isFinite(options.baseDelayMs) ? options.baseDelayMs : 300;
    const shouldRetry = options.shouldRetry || isTransientFirebaseError;

    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            if (attempt >= attempts || !shouldRetry(error)) {
                throw error;
            }

            const delay = baseDelayMs * attempt;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
};