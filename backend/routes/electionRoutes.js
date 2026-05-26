const express = require('express');
const router = express.Router();
const { createElection, getMyElections, getElectionByLink, voteInElection, addCandidate, updateCandidate, removeCandidate } = require('../controllers/electionController');
const { protect } = require('../middleware/authMiddleware');
const { ensureElectionOwner } = require('../middleware/ownershipMiddleware');
const { body } = require('express-validator');
const { validationResult } = require('express-validator');

const validate = (checks) => async (req, res, next) => {
	await Promise.all(checks.map((c) => c.run(req)));
	const errors = validationResult(req);
	if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
	next();
};

router.get('/my-elections', protect, getMyElections);
router.post('/', protect, createElection);

// Candidate management (owner-only)
router.post('/:id/candidates', protect, ensureElectionOwner, validate([body('name').isString().trim().isLength({ min: 1, max: 120 })]), addCandidate);
router.put('/:id/candidates/:candidateId', protect, ensureElectionOwner, validate([body('name').optional().isString().trim().isLength({ min: 1, max: 120 }), body('party').optional().isString().trim().isLength({ max: 120 })]), updateCandidate);
router.delete('/:id/candidates/:candidateId', protect, ensureElectionOwner, removeCandidate);

// Public Routes via links
router.get('/:link', getElectionByLink);
router.post('/:link/vote', voteInElection);

// Backup endpoints (owner-only)
router.get('/:id/export', protect, ensureElectionOwner, require('express-async-handler')(async (req, res) => {
	const { exportElection } = require('../controllers/electionController');
	return exportElection(req, res);
}));

router.post('/:id/import', protect, ensureElectionOwner, require('express-async-handler')(async (req, res) => {
	const { importElection } = require('../controllers/electionController');
	return importElection(req, res);
}));

module.exports = router;
