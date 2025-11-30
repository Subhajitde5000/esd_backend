const express = require('express');
const router = express.Router();
const {
  uploadSyllabus,
  uploadSyllabusWithFile,
  getSyllabusByYear,
  getAllSyllabi,
  updateSyllabus,
  deleteSyllabus,
  incrementDownloads,
} = require('../controllers/courseSyllabusController');
const { protect, authorize } = require('../middleware/auth');
const { syllabusUpload } = require('../config/cloudinary');

// Public routes (protected, but accessible to all authenticated users)
router.get('/:year', protect, getSyllabusByYear);
router.patch('/:id/download', protect, incrementDownloads);

// Mentor, Admin, Super Admin can view all syllabi
router.get('/', protect, authorize('mentor', 'admin', 'super_admin'), getAllSyllabi);

// Admin/Super Admin only routes
router.post('/upload', protect, authorize('admin', 'super_admin'), syllabusUpload.single('file'), uploadSyllabusWithFile);
router.post('/', protect, authorize('admin', 'super_admin'), uploadSyllabus);
router.put('/:id', protect, authorize('admin', 'super_admin'), updateSyllabus);
router.delete('/:id', protect, authorize('admin', 'super_admin'), deleteSyllabus);

module.exports = router;
