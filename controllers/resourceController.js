const Resource = require('../models/Resource');
const User = require('../models/User');

// @desc    Get all resources (filtered by role)
// @route   GET /api/resource
// @access  Private
exports.getAllResources = async (req, res) => {
  try {
    const { category, type, search, uploaderRole, isArchived } = req.query;
    const userRole = req.user.role;

    let query = {};

    // Role-based filtering
    if (userRole === 'student') {
      // Students see all public resources
      query.visibility = 'public';
      query.isArchived = false;
    } else if (userRole === 'mentor') {
      // Mentors see public resources + their own uploads
      query.$or = [
        { visibility: 'public', isArchived: false },
        { uploadedBy: req.user._id }
      ];
    } else if (userRole === 'admin') {
      // Admins see public resources + mentor resources + their own uploads
      query.$or = [
        { visibility: 'public', isArchived: false },
        { uploaderRole: 'mentor' },
        { uploadedBy: req.user._id }
      ];
      if (isArchived !== undefined) {
        query.isArchived = isArchived === 'true';
      }
    } else if (userRole === 'super_admin') {
      // Super admins see everything
      if (isArchived !== undefined) {
        query.isArchived = isArchived === 'true';
      }
    }

    // Apply filters
    if (category && category !== 'All') {
      query.category = category;
    }

    if (type && type !== 'All') {
      query.type = type;
    }

    if (uploaderRole && uploaderRole !== 'All') {
      query.uploaderRole = uploaderRole;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const resources = await Resource.find(query)
      .populate('uploadedBy', 'fullName email photo role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: resources.length,
      data: resources,
    });
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get my uploaded resources
// @route   GET /api/resource/my-uploads
// @access  Private (mentor, admin, super_admin)
exports.getMyResources = async (req, res) => {
  try {
    const resources = await Resource.find({ uploadedBy: req.user._id })
      .populate('uploadedBy', 'fullName email photo role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: resources.length,
      data: resources,
    });
  } catch (error) {
    console.error('Get my resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single resource by ID
// @route   GET /api/resource/:id
// @access  Private
exports.getResourceById = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('uploadedBy', 'fullName email photo role');

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    }

    // Increment views
    await resource.incrementViews();

    res.status(200).json({
      success: true,
      data: resource,
    });
  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Upload new resource
// @route   POST /api/resource
// @access  Private (mentor, admin, super_admin)
exports.uploadResource = async (req, res) => {
  try {
    const userRole = req.user.role;

    // Check if user has permission to upload
    if (!['mentor', 'admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Students cannot upload resources',
      });
    }

    const { title, description, category, type, fileUrl, youtubeUrl, publicId, size, tags, visibility } = req.body;

    // Validate required fields
    if (!title || !category || !type || !fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, category, type, and file URL',
      });
    }

    const resource = await Resource.create({
      title,
      description,
      category,
      type,
      fileUrl,
      youtubeUrl,
      publicId,
      size,
      uploadedBy: req.user._id,
      uploaderRole: userRole,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      visibility: visibility || 'public',
    });

    const populatedResource = await Resource.findById(resource._id)
      .populate('uploadedBy', 'fullName email photo role');

    res.status(201).json({
      success: true,
      message: 'Resource uploaded successfully',
      data: populatedResource,
    });
  } catch (error) {
    console.error('Upload resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update resource
// @route   PUT /api/resource/:id
// @access  Private (owner, admin, super_admin)
exports.updateResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    }

    const userRole = req.user.role;
    const isOwner = resource.uploadedBy.toString() === req.user._id.toString();

    // Permission check
    if (userRole === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students cannot update resources',
      });
    }

    if (userRole === 'mentor' && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own resources',
      });
    }

    if (userRole === 'admin') {
      // Admins can update their own resources and mentor resources
      if (!isOwner && resource.uploaderRole !== 'mentor') {
        return res.status(403).json({
          success: false,
          message: 'Admins can only update their own resources or mentor resources',
        });
      }
    }

    // Super admins can update anything

    const { title, description, category, type, tags, visibility, isArchived } = req.body;

    if (title) resource.title = title;
    if (description) resource.description = description;
    if (category) resource.category = category;
    if (type) resource.type = type;
    if (tags) resource.tags = tags.split(',').map(tag => tag.trim());
    if (visibility) resource.visibility = visibility;
    if (isArchived !== undefined) resource.isArchived = isArchived;

    await resource.save();

    const updatedResource = await Resource.findById(resource._id)
      .populate('uploadedBy', 'fullName email photo role');

    res.status(200).json({
      success: true,
      message: 'Resource updated successfully',
      data: updatedResource,
    });
  } catch (error) {
    console.error('Update resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete resource
// @route   DELETE /api/resource/:id
// @access  Private (owner, admin, super_admin)
exports.deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    }

    const userRole = req.user.role;
    const isOwner = resource.uploadedBy.toString() === req.user._id.toString();

    // Permission check
    if (userRole === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students cannot delete resources',
      });
    }

    if (userRole === 'mentor' && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own resources',
      });
    }

    if (userRole === 'admin') {
      // Admins can delete their own resources and mentor resources
      if (!isOwner && resource.uploaderRole !== 'mentor') {
        return res.status(403).json({
          success: false,
          message: 'Admins can only delete their own resources or mentor resources',
        });
      }
    }

    // Super admins can delete anything

    await resource.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Resource deleted successfully',
    });
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Track resource download
// @route   POST /api/resource/:id/download
// @access  Private
exports.trackDownload = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    }

    await resource.incrementDownloads();

    res.status(200).json({
      success: true,
      message: 'Download tracked',
      data: { downloads: resource.downloads },
    });
  } catch (error) {
    console.error('Track download error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get resource statistics
// @route   GET /api/resource/stats
// @access  Private (admin, super_admin)
exports.getResourceStats = async (req, res) => {
  try {
    const userRole = req.user.role;

    if (!['admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const totalResources = await Resource.countDocuments({ isArchived: false });
    const mentorResources = await Resource.countDocuments({ uploaderRole: 'mentor', isArchived: false });
    const adminResources = await Resource.countDocuments({ uploaderRole: 'admin', isArchived: false });
    const superAdminResources = await Resource.countDocuments({ uploaderRole: 'super_admin', isArchived: false });

    const totalDownloads = await Resource.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: null, total: { $sum: '$downloads' } } }
    ]);

    const categoryStats = await Resource.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const typeStats = await Resource.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalResources,
        mentorResources,
        adminResources,
        superAdminResources,
        totalDownloads: totalDownloads[0]?.total || 0,
        categoryStats,
        typeStats,
      },
    });
  } catch (error) {
    console.error('Get resource stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
