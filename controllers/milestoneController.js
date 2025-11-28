const Milestone = require('../models/Milestone');
const MilestoneChain = require('../models/MilestoneChain');
const StudentMilestone = require('../models/StudentMilestone');

// Create milestone in chain
exports.createMilestone = async (req, res) => {
  try {
    const {
      chainId,
      name,
      description,
      type,
      startDate,
      endDate,
      order,
      submissionRequirements,
      questions,
      duration,
      passingScore,
      instructions,
      resources
    } = req.body;

    // Verify chain exists
    const chain = await MilestoneChain.findById(chainId);
    if (!chain) {
      return res.status(404).json({
        success: false,
        message: 'Milestone chain not found'
      });
    }

    // Track if chain was published (will need republishing after adding milestone)
    const wasPublished = chain.status === 'published';

    // If chain is published, unpublish it so admin can add milestone
    if (wasPublished) {
      chain.status = 'editing';
      await chain.save();
    }

    const milestone = await Milestone.create({
      chainId,
      name,
      description,
      type,
      startDate,
      endDate,
      order,
      submissionRequirements,
      questions,
      duration,
      passingScore,
      instructions,
      resources,
      createdBy: req.user.id,
      status: 'draft'
    });

    // Update chain total
    chain.totalMilestones += 1;
    await chain.save();

    // Update editor tracking
    const editorIndex = chain.editors.findIndex(e => e.user.toString() === req.user.id);
    if (editorIndex > -1) {
      chain.editors[editorIndex].lastEditedAt = new Date();
    } else {
      chain.editors.push({
        user: req.user.id,
        lastEditedAt: new Date()
      });
    }
    await chain.save();

    // Emit Socket.IO event to all admins
    req.io.to('admin-room').emit('milestone-created', {
      milestone,
      chainId,
      createdBy: req.user.fullName
    });

    res.status(201).json({
      success: true,
      message: wasPublished
        ? 'Milestone created successfully. Chain has been unpublished - please republish to make changes visible to students.'
        : 'Milestone created successfully',
      milestone,
      requiresRepublish: wasPublished,
      chainStatus: chain.status
    });
  } catch (error) {
    console.error('Create milestone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create milestone',
      error: error.message
    });
  }
};

// Get milestones by chain
exports.getMilestonesByChain = async (req, res) => {
  try {
    const { chainId } = req.params;
    const userRole = req.user.role;

    let filter = { chainId };

    // Students and mentors only see published milestones
    if (userRole === 'student' || userRole === 'mentor') {
      filter.status = 'published';
    }

    const milestones = await Milestone.find(filter)
      .sort({ order: 1 })
      .populate('createdBy', 'fullName role')
      .populate('lastEditedBy', 'fullName role');

    // For students, filter based on progression
    if (userRole === 'student') {
      const studentMilestones = await StudentMilestone.find({
        student: req.user.id,
        chainId
      });

      const completedMilestoneIds = studentMilestones
        .filter(sm => sm.status === 'completed')
        .map(sm => sm.milestone.toString());

      const now = new Date();
      const visibleMilestones = [];

      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];
        const isPast = new Date(milestone.endDate) < now;
        const isCurrent = new Date(milestone.startDate) <= now && new Date(milestone.endDate) >= now;
        const isCompleted = completedMilestoneIds.includes(milestone._id.toString());

        // Show: past, current, and first upcoming (locked)
        if (isPast || isCurrent || i === visibleMilestones.length) {
          visibleMilestones.push({
            ...milestone.toObject(),
            isLocked: !isPast && !isCurrent && !isCompleted,
            studentProgress: studentMilestones.find(sm => 
              sm.milestone.toString() === milestone._id.toString()
            )
          });

          // Only show one upcoming milestone
          if (!isPast && !isCurrent) break;
        }
      }

      return res.json({
        success: true,
        count: visibleMilestones.length,
        milestones: visibleMilestones
      });
    }

    res.json({
      success: true,
      count: milestones.length,
      milestones
    });
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch milestones',
      error: error.message
    });
  }
};

// Get single milestone
exports.getMilestone = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const userRole = req.user.role;

    const milestone = await Milestone.findById(milestoneId)
      .populate('createdBy', 'fullName role')
      .populate('lastEditedBy', 'fullName role');

    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Check access
    if ((userRole === 'student' || userRole === 'mentor') && milestone.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // For students, include their progress
    if (userRole === 'student') {
      const studentProgress = await StudentMilestone.findOne({
        student: req.user.id,
        milestone: milestoneId
      });

      return res.json({
        success: true,
        milestone: {
          ...milestone.toObject(),
          studentProgress
        }
      });
    }

    res.json({
      success: true,
      milestone
    });
  } catch (error) {
    console.error('Get milestone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch milestone',
      error: error.message
    });
  }
};

// Update milestone
exports.updateMilestone = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const updates = req.body;

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Get chain for editor tracking (allow editing even if published)
    const chain = await MilestoneChain.findById(milestone.chainId);
    const wasPublished = chain.status === 'published';

    // If chain is published, check that start date is at least 1 day in the future
    if (wasPublished) {
      const startDate = new Date(startDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      if (startDate < tomorrow) {
        return res.status(400).json({
          success: false,
          message: 'When adding milestones to a published chain, the start date must be at least 1 day after the current date.'
        });
      }
    }

    // Create milestone
    Object.assign(milestone, updates);
    milestone.lastEditedBy = req.user.id;
    await milestone.save();

    // If chain was published, set it back to editing mode (requires republish)
    if (wasPublished) {
      chain.status = 'editing';
      chain.publishedAt = null;
      chain.publishedBy = null;
    }

    // Update chain editor tracking
    const editorIndex = chain.editors.findIndex(e => e.user.toString() === req.user.id);
    if (editorIndex > -1) {
      chain.editors[editorIndex].lastEditedAt = new Date();
    } else {
      chain.editors.push({
        user: req.user.id,
        lastEditedAt: new Date()
      });
    }
    await chain.save();

    // Emit Socket.IO event
    req.io.to('admin-room').emit('milestone-updated', {
      milestoneId,
      updates,
      updatedBy: req.user.fullName
    });

    res.json({
      success: true,
      message: wasPublished 
        ? 'Milestone updated successfully. Chain has been unpublished - please republish to make changes visible to students.'
        : 'Milestone updated successfully',
      milestone,
      requiresRepublish: wasPublished,
      chainStatus: chain.status
    });
  } catch (error) {
    console.error('Update milestone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update milestone',
      error: error.message
    });
  }
};

// Delete milestone
exports.deleteMilestone = async (req, res) => {
  try {
    const { milestoneId } = req.params;

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Check if chain is still in editing mode
    const chain = await MilestoneChain.findById(milestone.chainId);
    if (chain.status === 'published') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete milestones from published chain'
      });
    }

    // Check for student submissions
    const hasSubmissions = await StudentMilestone.exists({ milestone: milestoneId });
    if (hasSubmissions) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete milestone with student submissions'
      });
    }

    await Milestone.findByIdAndDelete(milestoneId);

    // Update chain total
    chain.totalMilestones -= 1;
    await chain.save();

    req.io.to('admin-room').emit('milestone-deleted', { milestoneId });

    res.json({
      success: true,
      message: 'Milestone deleted successfully'
    });
  } catch (error) {
    console.error('Delete milestone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete milestone',
      error: error.message
    });
  }
};

// Get milestone statistics (admin/super_admin)
exports.getMilestoneStats = async (req, res) => {
  try {
    const { milestoneId } = req.params;

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }

    // Get all student progress for this milestone
    const studentProgress = await StudentMilestone.find({ milestone: milestoneId })
      .populate('student', 'fullName email')
      .populate('gradedBy', 'fullName');

    const stats = {
      total: studentProgress.length,
      notStarted: studentProgress.filter(sp => sp.status === 'not-started').length,
      inProgress: studentProgress.filter(sp => sp.status === 'in-progress').length,
      submitted: studentProgress.filter(sp => sp.status === 'submitted').length,
      completed: studentProgress.filter(sp => sp.status === 'completed').length,
      failed: studentProgress.filter(sp => sp.status === 'failed').length,
      averageScore: 0,
      submissions: studentProgress
    };

    const scoredStudents = studentProgress.filter(sp => sp.score !== undefined);
    if (scoredStudents.length > 0) {
      stats.averageScore = scoredStudents.reduce((sum, sp) => sum + sp.percentage, 0) / scoredStudents.length;
    }

    res.json({
      success: true,
      milestone,
      stats
    });
  } catch (error) {
    console.error('Get milestone stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch milestone statistics',
      error: error.message
    });
  }
};
