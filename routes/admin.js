const express = require('express');
const router = express.Router();
const {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  getDashboardStats,
  createUser,
  resetUserPassword,
  updateUserRole,
  deactivateUser,
  toggleUserStatus,
  deleteUser,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication and admin/super_admin role
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get pending users for approval
router.get('/pending-users', getPendingUsers);

// Get all users with filters
router.get('/users', getAllUsers);

// Create new user
router.post('/create-user', createUser);

// Approve user
router.put('/approve-user/:id', approveUser);

// Reject user
router.put('/reject-user/:id', rejectUser);

// Reset user password to default
router.put('/reset-password/:id', resetUserPassword);

// Change user role
router.put('/change-role/:id', updateUserRole);

// Deactivate user account
router.put('/deactivate/:id', deactivateUser);

// Toggle user account status (activate/deactivate)
router.put('/toggle-status/:id', toggleUserStatus);

// Delete user account
router.delete('/users/:id', deleteUser);

module.exports = router;
