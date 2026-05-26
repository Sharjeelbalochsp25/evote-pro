const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');

require('./firebaseAdmin');

const authRoutes = require('./routes/authRoutes');
const electionRoutes = require('./routes/electionRoutes');

const app = express();

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10kb' }));
// Wrap mongoSanitize in a safe middleware to avoid crashes if request
// objects have read-only properties (some runtimes expose getters-only).
app.use((req, res, next) => {
    try {
        const mw = mongoSanitize();
        return mw(req, res, next);
    } catch (err) {
        console.warn('mongoSanitize middleware failed, skipping sanitization for request:', err && err.message);
        return next();
    }
});

// Wrap xss-clean similarly to avoid runtime errors when request properties are non-writable
app.use((req, res, next) => {
    try {
        const mw = xssClean();
        return mw(req, res, next);
    } catch (err) {
        console.warn('xssClean middleware failed, skipping XSS sanitization for request:', err && err.message);
        return next();
    }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    keyGenerator: (req /*, res*/) => {
        return req?.ip || req?.headers?.['x-forwarded-for'] || (req?.connection && req.connection.remoteAddress) || 'unknown';
    },
});
app.use(apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/elections', electionRoutes);

app.get('/', (req, res) => {
    res.send('Multi-Election Voting Platform API is running...');
});

module.exports = app;