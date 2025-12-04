const express = require('express');
const router = express.Router();
const {
  submitMentorFeedback,
  checkFeedbackEligibility,
  getMentorFeedback,
  getAllFeedback,
  respondToFeedback,
  deleteFeedback,
  getMentorStatistics,
} = require('../controllers/mentorFeedbackController');
const { protect, authorize } = require('../middleware/auth');

// Student routes
router.post('/', protect, authorize('student'), submitMentorFeedback);
router.get('/check-eligibility', protect, authorize('student'), checkFeedbackEligibility);

// Admin/Mentor routes
router.get('/all', protect, authorize('admin', 'super_admin'), getAllFeedback);
router.get('/mentor/:mentorId', protect, authorize('admin', 'super_admin', 'mentor'), getMentorFeedback);
router.get('/statistics/:mentorId', protect, authorize('admin', 'super_admin'), getMentorStatistics);
router.put('/:id/respond', protect, authorize('admin', 'super_admin'), respondToFeedback);
router.delete('/:id', protect, authorize('admin', 'super_admin'), deleteFeedback);

module.exports = router;
