const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudinary');
const {
  signup,
  login,
  getMe,
  logout,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/signup', upload.single('photo'), signup);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

module.exports = router;
