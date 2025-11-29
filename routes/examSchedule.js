const express = require('express');
const router = express.Router();
const {
  createExamSchedule,
  getAllExamSchedules,
  getExamScheduleById,
  updateExamSchedule,
  deleteExamSchedule,
  randomDistributeTeams,
  manualAssignTeam,
  getMentorSlots,
  rescheduleSlot,
  completeExamSlot,
  getTeamExamSchedule,
  getAvailableResources,
  updateSlotAssignment,
  deleteSlot,
  // New mentor scheduling methods
  createMentorSchedule,
  updateMentorSchedule,
  getAvailableTeams,
  randomDistributeToMentorSlots,
  manualEditMentorSlot,
  getMentorSchedule,
  clearMentorSlots
} = require('../controllers/examScheduleController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
// None

// Protected routes - All authenticated users
router.use(protect);

// Student routes
router.get('/my-team-schedule', getTeamExamSchedule);

// Mentor routes
router.get('/my-slots', authorize('mentor'), getMentorSlots);
router.put('/:id/slots/:slotId/reschedule', authorize('mentor'), rescheduleSlot);
router.put('/:id/slots/:slotId/complete', authorize('mentor'), completeExamSlot);

// New Mentor Scheduling Routes
router.post('/:id/mentor-schedule', authorize('mentor'), createMentorSchedule);
router.put('/:id/mentor-schedule', authorize('mentor'), updateMentorSchedule);
router.get('/:id/mentor-schedule', authorize('mentor'), getMentorSchedule);
router.get('/:id/available-teams', authorize('mentor'), getAvailableTeams);
router.post('/:id/mentor-schedule/distribute-random', authorize('mentor'), randomDistributeToMentorSlots);
router.put('/:id/mentor-schedule/slot/:slotId', authorize('mentor'), manualEditMentorSlot);
router.delete('/:id/mentor-schedule/slots', authorize('mentor'), clearMentorSlots);

// Admin and Super Admin routes
router.post('/', authorize('admin', 'super_admin'), createExamSchedule);
router.get('/', getAllExamSchedules);
router.get('/:id', getExamScheduleById);
router.get('/:id/available-resources', authorize('admin', 'super_admin'), getAvailableResources);
router.put('/:id', authorize('admin', 'super_admin'), updateExamSchedule);
router.delete('/:id', authorize('admin', 'super_admin'), deleteExamSchedule);
router.post('/:id/distribute-random', authorize('admin', 'super_admin'), randomDistributeTeams);
router.post('/:id/assign-manual', authorize('admin', 'super_admin'), manualAssignTeam);
router.put('/:id/slots/:slotId/update', authorize('admin', 'super_admin'), updateSlotAssignment);
router.delete('/:id/slots/:slotId', authorize('admin', 'super_admin'), deleteSlot);

module.exports = router;
