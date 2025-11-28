const Message = require('../models/Message');
const Community = require('../models/Community');

// @desc    Get messages for a community
// @route   GET /api/message/:communityId
// @access  Private
exports.getMessages = async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;
    const { page = 1, limit = 50 } = req.query;

    // Check if community exists
    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check access
    const isMember = community.isMember(userId);
    const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super_admin';

    if (!isMember && !isAdminOrSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to view messages'
      });
    }

    const skip = (page - 1) * limit;

    const messages = await Message.find({
      community: communityId,
      isDeleted: false
    })
      .populate('sender', 'name email avatar role')
      .populate('replyTo', 'content sender')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({
      community: communityId,
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      data: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalMessages: total,
        hasMore: skip + messages.length < total
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

// @desc    Send a message to a community
// @route   POST /api/message/:communityId
// @access  Private
exports.sendMessage = async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;
    const { content, attachments, type, replyTo } = req.body;

    // Check if community exists
    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if user is a member
    const isMember = community.isMember(userId);
    const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super_admin';

    if (!isMember && !isAdminOrSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to send messages'
      });
    }

    // Create message
    const message = await Message.create({
      community: communityId,
      sender: userId,
      senderRole: userRole,
      content: content || '',
      attachments: attachments || [],
      type: type || 'text',
      replyTo: replyTo || null
    });

    await message.populate('sender', 'name email avatar role');
    if (replyTo) {
      await message.populate('replyTo', 'content sender');
    }

    // Update community stats
    await community.incrementMessageCount();

    // Emit socket event for real-time update
    const io = req.io;
    if (io) {
      io.to(`community-${communityId}`).emit('new-message', message);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// @desc    Edit a message
// @route   PUT /api/message/:id
// @access  Private
exports.editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;
    const { content } = req.body;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check permissions
    const isOwner = message.sender.toString() === userId.toString();
    const isSuperAdmin = userRole === 'super_admin';

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own messages'
      });
    }

    // Cannot edit deleted messages
    if (message.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit deleted messages'
      });
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('sender', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${message.community}`).emit('message-edited', message);
    }

    res.status(200).json({
      success: true,
      message: 'Message edited successfully',
      data: message
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit message',
      error: error.message
    });
  }
};

// @desc    Delete a message
// @route   DELETE /api/message/:id
// @access  Private
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Get community to check admin status
    const community = await Community.findById(message.community);

    // Check permissions
    const isOwner = message.sender.toString() === userId.toString();
    const isCommunityAdmin = community.isAdmin(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';

    if (!isOwner && !isCommunityAdmin && !isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this message'
      });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${message.community}`).emit('message-deleted', {
        messageId: id,
        communityId: message.community
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};

// @desc    Pin/Unpin a message
// @route   PUT /api/message/:id/pin
// @access  Private
exports.pinMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Get community to check admin status
    const community = await Community.findById(message.community);

    // Check permissions - only admins can pin
    const isCommunityAdmin = community.isAdmin(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';

    if (!isCommunityAdmin && !isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only community admins can pin messages'
      });
    }

    // Toggle pin status
    message.isPinned = !message.isPinned;
    message.pinnedBy = message.isPinned ? userId : null;
    message.pinnedAt = message.isPinned ? new Date() : null;
    await message.save();

    await message.populate('sender', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${message.community}`).emit('message-pinned', {
        message: message,
        isPinned: message.isPinned
      });
    }

    res.status(200).json({
      success: true,
      message: message.isPinned ? 'Message pinned successfully' : 'Message unpinned successfully',
      data: message
    });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pin/unpin message',
      error: error.message
    });
  }
};

// @desc    Mark message as read
// @route   PUT /api/message/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    await message.markAsRead(userId);

    res.status(200).json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read',
      error: error.message
    });
  }
};

// @desc    Add reaction to message
// @route   POST /api/message/:id/reaction
// @access  Private
exports.addReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      });
    }

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    await message.addReaction(userId, emoji);
    await message.populate('sender', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${message.community}`).emit('reaction-added', {
        messageId: id,
        userId: userId,
        emoji: emoji
      });
    }

    res.status(200).json({
      success: true,
      message: 'Reaction added',
      data: message
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reaction',
      error: error.message
    });
  }
};

// @desc    Remove reaction from message
// @route   DELETE /api/message/:id/reaction
// @access  Private
exports.removeReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { emoji } = req.body;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    await message.removeReaction(userId, emoji);

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${message.community}`).emit('reaction-removed', {
        messageId: id,
        userId: userId,
        emoji: emoji
      });
    }

    res.status(200).json({
      success: true,
      message: 'Reaction removed'
    });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove reaction',
      error: error.message
    });
  }
};

// @desc    Get pinned messages
// @route   GET /api/message/:communityId/pinned
// @access  Private
exports.getPinnedMessages = async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Check if community exists
    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check access
    const isMember = community.isMember(userId);
    const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super_admin';

    if (!isMember && !isAdminOrSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to view pinned messages'
      });
    }

    const pinnedMessages = await Message.find({
      community: communityId,
      isPinned: true,
      isDeleted: false
    })
      .populate('sender', 'name email avatar role')
      .populate('pinnedBy', 'name')
      .sort({ pinnedAt: -1 });

    res.status(200).json({
      success: true,
      count: pinnedMessages.length,
      data: pinnedMessages
    });
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pinned messages',
      error: error.message
    });
  }
};
