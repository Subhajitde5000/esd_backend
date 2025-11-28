const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createMilestone,
  getMilestonesByChain,
  getMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestoneStats
} = require('../controllers/milestoneController');

// Admin and Super Admin only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Super Admin role required.'
    });
  }
  next();
};

// Create milestone
router.post('/', protect, adminOnly, createMilestone);

// Get milestones by chain (role-based access)
router.get('/chain/:chainId', protect, getMilestonesByChain);

// Get single milestone
router.get('/:milestoneId', protect, getMilestone);

// Update milestone
router.put('/:milestoneId', protect, adminOnly, updateMilestone);

// Delete milestone
router.delete('/:milestoneId', protect, adminOnly, deleteMilestone);

// Get milestone statistics
router.get('/:milestoneId/stats', protect, adminOnly, getMilestoneStats);

module.exports = router;
