const express = require('express');
const router = express.Router();
const {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
  deleteComment,
  getMyPosts,
} = require('../controllers/forumController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Posts routes
router.route('/posts')
  .get(getAllPosts)
  .post(createPost);

router.get('/my-posts', getMyPosts);

router.route('/posts/:id')
  .get(getPostById)
  .put(updatePost)
  .delete(deletePost);

// Like/Unlike post
router.post('/posts/:id/like', toggleLike);

// Comments routes
router.post('/posts/:id/comments', addComment);
router.delete('/posts/:postId/comments/:commentId', deleteComment);

module.exports = router;
