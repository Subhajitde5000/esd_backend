const ForumPost = require('../models/ForumPost');

// @desc    Get all forum posts with filters
// @route   GET /api/forum/posts
// @access  Private
exports.getAllPosts = async (req, res) => {
  try {
    const { category, sortBy, search } = req.query;
    
    // Build query
    let query = { isDeleted: false };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Build sort
    let sort = {};
    switch (sortBy) {
      case 'trending':
        sort = { views: -1, createdAt: -1 };
        break;
      case 'most-liked':
        sort = { 'likes': -1, createdAt: -1 };
        break;
      case 'unanswered':
        sort = { 'comments': 1, createdAt: -1 };
        break;
      default: // latest
        sort = { createdAt: -1 };
    }
    
    const posts = await ForumPost.find(query)
      .populate('author', 'fullName email role')
      .populate('comments.user', 'fullName role')
      .sort(sort)
      .lean();
    
    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    console.error('Error fetching forum posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching forum posts',
      error: error.message,
    });
  }
};

// @desc    Get single forum post by ID
// @route   GET /api/forum/posts/:id
// @access  Private
exports.getPostById = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('author', 'fullName email role')
      .populate('comments.user', 'fullName role');
    
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }
    
    // Increment views
    post.views += 1;
    await post.save();
    
    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching post',
      error: error.message,
    });
  }
};

// @desc    Create new forum post
// @route   POST /api/forum/posts
// @access  Private
exports.createPost = async (req, res) => {
  try {
    const { title, description, category, tags, image } = req.body;
    
    const post = await ForumPost.create({
      author: req.user._id,
      title,
      description,
      category,
      tags: tags || [],
      image,
    });
    
    const populatedPost = await ForumPost.findById(post._id)
      .populate('author', 'fullName email role');
    
    // Emit socket event for new post
    const io = req.app.get('io');
    if (io) {
      io.emit('new-forum-post', {
        postId: post._id,
        title: post.title,
        author: req.user.fullName,
        category: post.category,
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: populatedPost,
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating post',
      error: error.message,
    });
  }
};

// @desc    Update forum post
// @route   PUT /api/forum/posts/:id
// @access  Private (Author only)
exports.updatePost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }
    
    // Check if user is the author
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own posts',
      });
    }
    
    const { title, description, category, tags, image } = req.body;
    
    if (title) post.title = title;
    if (description) post.description = description;
    if (category) post.category = category;
    if (tags) post.tags = tags;
    if (image !== undefined) post.image = image;
    
    await post.save();
    
    const updatedPost = await ForumPost.findById(post._id)
      .populate('author', 'fullName email role')
      .populate('comments.user', 'fullName role');
    
    // Emit socket event for real-time post update
    const io = req.app.get('io');
    if (io) {
      io.emit('post-updated', {
        postId: post._id,
        title: post.title,
        userId: req.user._id,
        userName: req.user.fullName,
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      data: updatedPost,
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating post',
      error: error.message,
    });
  }
};

// @desc    Delete forum post
// @route   DELETE /api/forum/posts/:id
// @access  Private (Author, Admin, Super Admin)
exports.deletePost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }
    
    // Check permissions: author can delete own post, admin/super_admin can delete any post
    const isAuthor = post.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this post',
      });
    }
    
    // Soft delete
    post.isDeleted = true;
    post.deletedBy = req.user._id;
    post.deletedAt = new Date();
    await post.save();
    
    // Emit socket event for real-time post deletion
    const io = req.app.get('io');
    if (io) {
      io.emit('post-deleted', {
        postId: post._id,
        deletedBy: req.user.fullName,
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting post',
      error: error.message,
    });
  }
};

// @desc    Like/Unlike a post
// @route   POST /api/forum/posts/:id/like
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }
    
    const userId = req.user._id;
    const likeIndex = post.likes.indexOf(userId);
    
    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
    } else {
      // Like
      post.likes.push(userId);
    }
    
    await post.save();
    
    // Emit socket event for real-time like update
    const io = req.app.get('io');
    if (io) {
      io.emit('post-liked', {
        postId: post._id,
        userId: req.user._id,
        userName: req.user.fullName,
        action: likeIndex > -1 ? 'unliked' : 'liked',
        likesCount: post.likes.length,
      });
    }
    
    res.status(200).json({
      success: true,
      message: likeIndex > -1 ? 'Post unliked' : 'Post liked',
      data: {
        likes: post.likes.length,
        isLiked: likeIndex === -1,
      },
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling like',
      error: error.message,
    });
  }
};

// @desc    Add comment to post
// @route   POST /api/forum/posts/:id/comments
// @access  Private
exports.addComment = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }
    
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required',
      });
    }
    
    post.comments.push({
      user: req.user._id,
      content: content.trim(),
    });
    
    await post.save();
    
    const updatedPost = await ForumPost.findById(post._id)
      .populate('author', 'fullName email role')
      .populate('comments.user', 'fullName role');
    
    // Emit socket event for real-time comment update
    const io = req.app.get('io');
    if (io) {
      io.emit('post-commented', {
        postId: post._id,
        commentId: post.comments[post.comments.length - 1]._id,
        userId: req.user._id,
        userName: req.user.fullName,
        content: content.trim(),
        commentsCount: post.comments.length,
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: updatedPost,
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding comment',
      error: error.message,
    });
  }
};

// @desc    Delete comment from post
// @route   DELETE /api/forum/posts/:postId/comments/:commentId
// @access  Private (Comment author, Admin, Super Admin)
exports.deleteComment = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }
    
    const comment = post.comments.id(req.params.commentId);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }
    
    // Check permissions
    const isCommentAuthor = comment.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    
    if (!isCommentAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this comment',
      });
    }
    
    comment.remove();
    await post.save();
    
    // Emit socket event for real-time comment deletion
    const io = req.app.get('io');
    if (io) {
      io.emit('comment-deleted', {
        postId: post._id,
        commentId: req.params.commentId,
        deletedBy: req.user.fullName,
        commentsCount: post.comments.length,
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting comment',
      error: error.message,
    });
  }
};

// @desc    Get user's own posts
// @route   GET /api/forum/my-posts
// @access  Private
exports.getMyPosts = async (req, res) => {
  try {
    const posts = await ForumPost.find({
      author: req.user._id,
      isDeleted: false,
    })
      .populate('author', 'fullName email role')
      .populate('comments.user', 'fullName role')
      .sort({ createdAt: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user posts',
      error: error.message,
    });
  }
};
