const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createChain,
  getActiveChain,
  getAllChains,
  getChainProgress,
  publishChain,
  deleteChain
} = require('../controllers/milestoneChainController');

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

// Staff middleware (mentor, admin, super_admin)
const staffOnly = (req, res, next) => {
  if (!['mentor', 'admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Staff access required.'
    });
  }
  next();
};

// Create new chain
router.post('/', protect, adminOnly, createChain);

// Get active editing chain
router.get('/active', protect, adminOnly, getActiveChain);

// Get all chains (accessible by all authenticated users - filters by status in controller)
router.get('/', protect, getAllChains);

// Get chain progress
router.get('/:chainId/progress', protect, staffOnly, getChainProgress);

// Publish chain
router.post('/:chainId/publish', protect, adminOnly, publishChain);

// Delete chain
router.delete('/:chainId', protect, adminOnly, deleteChain);

module.exports = router;
