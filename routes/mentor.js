const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getMentorDashboardStats,
  getMentorTeams,
  getPendingMilestoneSubmissions,
  getMentorUpcomingSessions,
  getMentorQueries
} = require('../controllers/mentorController');

// All routes require authentication and mentor role
router.use(protect);
router.use(authorize('mentor'));

// Get mentor dashboard statistics
router.get('/dashboard/stats', getMentorDashboardStats);

// Get mentor's assigned teams
router.get('/teams', getMentorTeams);

// Get pending milestone submissions for review
router.get('/milestones/pending', getPendingMilestoneSubmissions);

// Get upcoming mentor sessions
router.get('/sessions/upcoming', getMentorUpcomingSessions);

// Get student queries/messages
router.get('/queries', getMentorQueries);

module.exports = router;
