const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const multer = require('multer');
const {
  startMilestone,
  submitAssignment,
  submitQuizAnswers,
  gradeAssignment,
  getStudentProgress,
  getPendingSubmissions
} = require('../controllers/studentMilestoneController');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB default
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png|zip|rar/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Mentor/Admin/Super Admin middleware
const staffOnly = (req, res, next) => {
  if (req.user.role === 'student') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Staff role required.'
    });
  }
  next();
};

// Student routes
router.post('/:milestoneId/start', protect, startMilestone);
router.post('/:milestoneId/submit-assignment', protect, upload.array('files', 5), submitAssignment);
router.post('/:milestoneId/submit-quiz', protect, submitQuizAnswers);
router.get('/chain/:chainId/progress', protect, getStudentProgress);

// Mentor/Admin routes
router.post('/submission/:submissionId/grade', protect, staffOnly, gradeAssignment);
router.get('/pending-submissions', protect, staffOnly, getPendingSubmissions);

module.exports = router;
