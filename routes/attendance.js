const express = require('express');
const router = express.Router();
const {
  markAttendance,
  getStudentAttendance,
  getMyAttendance,
  getAttendanceByDate,
  getAttendanceReport,
  updateAttendance,
  deleteAttendance,
  exportAttendance,
  getStudentsForAttendance,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Student routes - can view own attendance
router.get('/my-attendance', authorize('student'), getMyAttendance);

// Mentor and Admin routes
router.post('/mark', authorize('mentor', 'admin', 'super_admin'), markAttendance);
router.get('/students', authorize('mentor', 'admin', 'super_admin'), getStudentsForAttendance);
router.get('/date', authorize('mentor', 'admin', 'super_admin'), getAttendanceByDate);
router.get('/report', authorize('mentor', 'admin', 'super_admin'), getAttendanceReport);
router.get('/export', authorize('mentor', 'admin', 'super_admin'), exportAttendance);

// Admin only routes
router.put('/:id', authorize('admin', 'super_admin'), updateAttendance);
router.delete('/:id', authorize('admin', 'super_admin'), deleteAttendance);

// Get student attendance (students can only view their own, mentors/admins can view any)
router.get('/student/:studentId', getStudentAttendance);

module.exports = router;
