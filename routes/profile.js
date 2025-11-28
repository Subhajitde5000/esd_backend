const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, updateProfilePhoto, changePassword } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// All routes require authentication
router.use(protect);

// Get current user profile
router.get('/', getProfile);

// Update profile
router.put('/', upload.single('photo'), updateProfile);

// Update profile photo
router.put('/photo', upload.single('photo'), updateProfilePhoto);

// Change password
router.put('/password', changePassword);

module.exports = router;
