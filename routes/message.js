const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  markAsRead,
  addReaction,
  removeReaction,
  getPinnedMessages
} = require('../controllers/messageController');

// All routes require authentication
router.use(protect);

// Message CRUD
router.route('/:communityId')
  .get(getMessages)
  .post(sendMessage);

router.get('/:communityId/pinned', getPinnedMessages);

router.route('/:id')
  .put(editMessage)
  .delete(deleteMessage);

// Message actions
router.put('/:id/pin', pinMessage);
router.put('/:id/read', markAsRead);

// Reactions
router.post('/:id/reaction', addReaction);
router.delete('/:id/reaction', removeReaction);

module.exports = router;
