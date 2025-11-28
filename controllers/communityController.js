const Community = require('../models/Community');
const User = require('../models/User');

// @desc    Get all communities (role-based filtering)
// @route   GET /api/community
// @access  Private
exports.getAllCommunities = async (req, res) => {
  try {
    const { type, category, search } = req.query;
    const userId = req.user._id;
    const userRole = req.user.role;

    let query = { isActive: true };

    // Apply filters
    if (type) query.type = type;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    let communities;
    
    if (userRole === 'super_admin') {
      // Super admin can see all communities
      communities = await Community.find(query)
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar role')
        .sort({ 'stats.lastActivity': -1 });
    } else if (userRole === 'admin') {
      // Admin can see all communities
      communities = await Community.find(query)
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar role')
        .sort({ 'stats.lastActivity': -1 });
    } else {
      // Students and mentors can see public communities and communities they're members of
      communities = await Community.find({
        ...query,
        $or: [
          { type: 'public' },
          { 'members.user': userId }
        ]
      })
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar role')
        .sort({ 'stats.lastActivity': -1 });
    }

    res.status(200).json({
      success: true,
      count: communities.length,
      data: communities
    });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch communities',
      error: error.message
    });
  }
};

// @desc    Get my communities
// @route   GET /api/community/my-communities
// @access  Private
exports.getMyCommunities = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    let communities;

    if (userRole === 'super_admin' || userRole === 'admin') {
      // Admins see communities they created or are members of
      communities = await Community.find({
        $or: [
          { createdBy: userId },
          { 'members.user': userId }
        ],
        isActive: true
      })
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar role')
        .sort({ 'stats.lastActivity': -1 });
    } else {
      // Students and mentors see communities they're members of
      communities = await Community.find({
        'members.user': userId,
        isActive: true
      })
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar role')
        .sort({ 'stats.lastActivity': -1 });
    }

    res.status(200).json({
      success: true,
      count: communities.length,
      data: communities
    });
  } catch (error) {
    console.error('Get my communities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch communities',
      error: error.message
    });
  }
};

// @desc    Create a new community
// @route   POST /api/community
// @access  Private
exports.createCommunity = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { name, description, type, category, tags, settings } = req.body;

    // Only admins and super_admins can create communities
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins and super admins can create communities'
      });
    }

    // Create community
    const community = await Community.create({
      name,
      description,
      type: type || 'public',
      category: category || 'General',
      tags: tags || [],
      createdBy: userId,
      creatorRole: userRole,
      settings: settings || {},
      members: [{
        user: userId,
        role: 'admin',
        joinedAt: new Date()
      }],
      stats: {
        totalMembers: 1,
        totalMessages: 0,
        lastActivity: new Date()
      }
    });

    await community.populate('createdBy', 'name email avatar');
    await community.populate('members.user', 'name email avatar role');

    // Emit socket event for real-time update
    const io = req.io;
    if (io) {
      io.emit('community-created', community);
    }

    res.status(201).json({
      success: true,
      message: 'Community created successfully',
      data: community
    });
  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create community',
      error: error.message
    });
  }
};

// @desc    Get single community
// @route   GET /api/community/:id
// @access  Private
exports.getCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id)
      .populate('createdBy', 'name email avatar')
      .populate('members.user', 'name email avatar role');

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check access permissions
    const isMember = community.isMember(userId);
    const isPublic = community.type === 'public';
    const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super_admin';

    if (!isPublic && !isMember && !isAdminOrSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this private community'
      });
    }

    res.status(200).json({
      success: true,
      data: community
    });
  } catch (error) {
    console.error('Get community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch community',
      error: error.message
    });
  }
};

// @desc    Update community
// @route   PUT /api/community/:id
// @access  Private
exports.updateCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;
    const updates = req.body;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check permissions
    const isCreator = community.isCreator(userId);
    const isAdmin = community.isAdmin(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin && !isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this community'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'description', 'type', 'category', 'tags', 'settings', 'avatar', 'coverImage'];
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        community[key] = updates[key];
      }
    });

    await community.save();
    await community.populate('createdBy', 'name email avatar');
    await community.populate('members.user', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('community-updated', community);
    }

    res.status(200).json({
      success: true,
      message: 'Community updated successfully',
      data: community
    });
  } catch (error) {
    console.error('Update community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update community',
      error: error.message
    });
  }
};

// @desc    Delete community
// @route   DELETE /api/community/:id
// @access  Private
exports.deleteCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check permissions
    const isCreator = community.isCreator(userId);
    const isSuperAdmin = userRole === 'super_admin';

    if (!isCreator && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the creator or super admin can delete this community'
      });
    }

    // Soft delete
    community.isActive = false;
    await community.save();

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('community-deleted', { communityId: id });
      io.emit('community-list-updated');
    }

    res.status(200).json({
      success: true,
      message: 'Community deleted successfully'
    });
  } catch (error) {
    console.error('Delete community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete community',
      error: error.message
    });
  }
};

// @desc    Add member to community
// @route   POST /api/community/:id/members
// @access  Private
exports.addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check permissions
    const isAdmin = community.isAdmin(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';

    if (!isAdmin && !isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only community admins can add members'
      });
    }

    // Check if user exists
    const userToAdd = await User.findById(memberId);
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already a member
    if (community.isMember(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member'
      });
    }

    await community.addMember(memberId);
    await community.populate('members.user', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('member-added', {
        communityId: id,
        member: userToAdd
      });
      io.to(memberId.toString()).emit('added-to-community', community);
    }

    res.status(200).json({
      success: true,
      message: 'Member added successfully',
      data: community
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add member',
      error: error.message
    });
  }
};

// @desc    Remove member from community
// @route   DELETE /api/community/:id/members/:memberId
// @access  Private
exports.removeMember = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check permissions
    const isAdmin = community.isAdmin(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';
    const isSelf = userId.toString() === memberId;

    if (!isAdmin && !isSuperAdmin && !isGlobalAdmin && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to remove this member'
      });
    }

    // Cannot remove the creator
    if (community.isCreator(memberId)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove the community creator'
      });
    }

    await community.removeMember(memberId);

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('member-removed', {
        communityId: id,
        memberId: memberId
      });
      io.to(memberId.toString()).emit('removed-from-community', { communityId: id });
    }

    res.status(200).json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove member',
      error: error.message
    });
  }
};

// @desc    Make user a community admin
// @route   PUT /api/community/:id/admins/:memberId
// @access  Private
exports.makeAdmin = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check permissions - only creator, global admin, or super admin can make admins
    const isCreator = community.isCreator(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';

    if (!isCreator && !isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the creator or platform admins can make users community admins'
      });
    }

    // Check if user is a member
    if (!community.isMember(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this community'
      });
    }

    await community.makeAdmin(memberId);
    await community.populate('members.user', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('admin-added', {
        communityId: id,
        memberId: memberId
      });
      io.to(memberId.toString()).emit('made-community-admin', { communityId: id });
    }

    res.status(200).json({
      success: true,
      message: 'User is now a community admin',
      data: community
    });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to make user admin',
      error: error.message
    });
  }
};

// @desc    Remove admin privileges
// @route   DELETE /api/community/:id/admins/:memberId
// @access  Private
exports.removeAdmin = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check permissions
    const isCreator = community.isCreator(userId);
    const isSuperAdmin = userRole === 'super_admin';
    const isGlobalAdmin = userRole === 'admin';

    if (!isCreator && !isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the creator or platform admins can remove admin privileges'
      });
    }

    // Cannot remove creator's admin role
    if (community.isCreator(memberId)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove admin privileges from the community creator'
      });
    }

    await community.removeAdmin(memberId);

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('admin-removed', {
        communityId: id,
        memberId: memberId
      });
    }

    res.status(200).json({
      success: true,
      message: 'Admin privileges removed'
    });
  } catch (error) {
    console.error('Remove admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove admin privileges',
      error: error.message
    });
  }
};

// @desc    Join a public community
// @route   POST /api/community/:id/join
// @access  Private
exports.joinCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if community is public
    if (community.type !== 'public') {
      return res.status(403).json({
        success: false,
        message: 'This is a private community. You need an invitation to join.'
      });
    }

    // Check if already a member
    if (community.isMember(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You are already a member of this community'
      });
    }

    await community.addMember(userId);
    await community.populate('members.user', 'name email avatar role');

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('member-joined', {
        communityId: id,
        member: req.user
      });
    }

    res.status(200).json({
      success: true,
      message: 'Successfully joined the community',
      data: community
    });
  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join community',
      error: error.message
    });
  }
};

// @desc    Leave a community
// @route   POST /api/community/:id/leave
// @access  Private
exports.leaveCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Cannot leave if you're the creator
    if (community.isCreator(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Community creator cannot leave. Please delete the community or transfer ownership.'
      });
    }

    // Check if member
    if (!community.isMember(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You are not a member of this community'
      });
    }

    await community.removeMember(userId);

    // Emit socket event
    const io = req.io;
    if (io) {
      io.to(`community-${id}`).emit('member-left', {
        communityId: id,
        memberId: userId
      });
    }

    res.status(200).json({
      success: true,
      message: 'Successfully left the community'
    });
  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave community',
      error: error.message
    });
  }
};

// @desc    Get community statistics
// @route   GET /api/community/:id/stats
// @access  Private
exports.getCommunityStats = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const community = await Community.findById(id);

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
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalMembers: community.stats.totalMembers,
        totalMessages: community.stats.totalMessages,
        lastActivity: community.stats.lastActivity,
        adminsCount: community.members.filter(m => m.role === 'admin').length,
        createdAt: community.createdAt
      }
    });
  } catch (error) {
    console.error('Get community stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch community statistics',
      error: error.message
    });
  }
};
