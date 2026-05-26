const { onRequest } = require('firebase-functions/v2/https');
const app = require('./app');
const { castVoteSecure } = require('./functions/voting');
const { castPublicVoteSecure } = require('./functions/publicVoting');

exports.api = onRequest(app);
exports.castVoteSecure = castVoteSecure;
exports.castPublicVoteSecure = castPublicVoteSecure;