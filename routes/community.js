const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getAllCommunities,
  getMyCommunities,
  createCommunity,
  getCommunity,
  updateCommunity,
  deleteCommunity,
  addMember,
  removeMember,
  makeAdmin,
  removeAdmin,
  joinCommunity,
  leaveCommunity,
  getCommunityStats
} = require('../controllers/communityController');

// All routes require authentication
router.use(protect);

// Community CRUD
router.route('/')
  .get(getAllCommunities)
  .post(createCommunity);

router.get('/my-communities', getMyCommunities);

router.route('/:id')
  .get(getCommunity)
  .put(updateCommunity)
  .delete(deleteCommunity);

// Member management
router.post('/:id/members', addMember);
router.delete('/:id/members/:memberId', removeMember);

// Admin management
router.put('/:id/admins/:memberId', makeAdmin);
router.delete('/:id/admins/:memberId', removeAdmin);

// Join/Leave
router.post('/:id/join', joinCommunity);
router.post('/:id/leave', leaveCommunity);

// Statistics
router.get('/:id/stats', getCommunityStats);

module.exports = router;
