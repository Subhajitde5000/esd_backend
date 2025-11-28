const express = require('express');
const router = express.Router();
const {
  getAllResources,
  getMyResources,
  getResourceById,
  uploadResource,
  updateResource,
  deleteResource,
  trackDownload,
  getResourceStats,
} = require('../controllers/resourceController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// @route   GET /api/resource
// @desc    Get all resources (filtered by role)
// @access  Private
router.get('/', getAllResources);

// @route   GET /api/resource/my-uploads
// @desc    Get my uploaded resources
// @access  Private (mentor, admin, super_admin)
router.get('/my-uploads', getMyResources);

// @route   GET /api/resource/stats
// @desc    Get resource statistics
// @access  Private (admin, super_admin)
router.get('/stats', getResourceStats);

// @route   GET /api/resource/:id
// @desc    Get single resource by ID
// @access  Private
router.get('/:id', getResourceById);

// @route   POST /api/resource
// @desc    Upload new resource
// @access  Private (mentor, admin, super_admin)
router.post('/', uploadResource);

// @route   PUT /api/resource/:id
// @desc    Update resource
// @access  Private (owner, admin, super_admin)
router.put('/:id', updateResource);

// @route   DELETE /api/resource/:id
// @desc    Delete resource
// @access  Private (owner, admin, super_admin)
router.delete('/:id', deleteResource);

// @route   POST /api/resource/:id/download
// @desc    Track resource download
// @access  Private
router.post('/:id/download', trackDownload);

module.exports = router;
