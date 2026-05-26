const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');

// Firebase Auth token is required in Authorization header.
router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;
