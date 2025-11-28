const MilestoneChain = require('../models/MilestoneChain');
const Milestone = require('../models/Milestone');
const StudentMilestone = require('../models/StudentMilestone');
const User = require('../models/User');

// Create new milestone chain (admins can create multiple chains)
exports.createChain = async (req, res) => {
  try {
    const { name, description, academicYear, year, startDate, endDate } = req.body;

    const chain = await MilestoneChain.create({
      name,
      description,
      academicYear,
      year,
      startDate,
      endDate,
      createdBy: req.user.id,
      editors: [{
        user: req.user.id,
        lastEditedAt: new Date()
      }]
    });

    // Emit Socket.IO event
    req.io.to('admin-room').emit('chain-created', {
      chain,
      createdBy: req.user.fullName
    });

    res.status(201).json({
      success: true,
      message: 'Milestone chain created successfully',
      chain
    });
  } catch (error) {
    console.error('Create chain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create milestone chain',
      error: error.message
    });
  }
};

// Get active editing chain
exports.getActiveChain = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const chain = await MilestoneChain.findOne({
      academicYear,
      status: 'editing',
      isActive: true
    })
      .populate('createdBy', 'fullName email role')
      .populate('editors.user', 'fullName email role')
      .populate('publishedBy', 'fullName email role');

    if (!chain) {
      return res.status(404).json({
        success: false,
        message: 'No active editing chain found for this academic year'
      });
    }

    res.json({
      success: true,
      chain
    });
  } catch (error) {
    console.error('Get active chain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active chain',
      error: error.message
    });
  }
};

// Get all chains (with filters)
exports.getAllChains = async (req, res) => {
  try {
    const { status, academicYear } = req.query;
    const filter = { isActive: true };

    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;

    const chains = await MilestoneChain.find(filter)
      .populate('createdBy', 'fullName email role')
      .populate('publishedBy', 'fullName email role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: chains.length,
      chains
    });
  } catch (error) {
    console.error('Get all chains error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chains',
      error: error.message
    });
  }
};

// Get chain progress
exports.getChainProgress = async (req, res) => {
  try {
    const { chainId } = req.params;

    const chain = await MilestoneChain.findById(chainId);
    if (!chain) {
      return res.status(404).json({
        success: false,
        message: 'Chain not found'
      });
    }

    const milestones = await Milestone.find({ chainId })
      .sort({ order: 1 })
      .populate('createdBy', 'fullName role')
      .populate('lastEditedBy', 'fullName role');

    // Track editors
    const editorSet = new Set(chain.editors.map(e => e.user.toString()));
    if (!editorSet.has(req.user.id)) {
      chain.editors.push({
        user: req.user.id,
        lastEditedAt: new Date()
      });
      await chain.save();
    }

    res.json({
      success: true,
      chain,
      milestones,
      progress: {
        total: milestones.length,
        draft: milestones.filter(m => m.status === 'draft').length,
        published: milestones.filter(m => m.status === 'published').length
      }
    });
  } catch (error) {
    console.error('Get chain progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chain progress',
      error: error.message
    });
  }
};

// Publish entire chain
exports.publishChain = async (req, res) => {
  try {
    const { chainId } = req.params;

    const chain = await MilestoneChain.findById(chainId);
    if (!chain) {
      return res.status(404).json({
        success: false,
        message: 'Chain not found'
      });
    }

    if (chain.status === 'published') {
      return res.status(400).json({
        success: false,
        message: 'Chain is already published'
      });
    }

    // Check if all milestones are ready
    const milestones = await Milestone.find({ chainId });
    if (milestones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot publish empty chain. Please add milestones first.'
      });
    }

    // Update chain status
    chain.status = 'published';
    chain.publishedBy = req.user.id;
    chain.publishedAt = new Date();
    chain.publishedMilestones = milestones.length;
    await chain.save();

    // Publish all milestones
    await Milestone.updateMany(
      { chainId },
      { 
        status: 'published',
        publishedBy: req.user.id,
        publishedAt: new Date()
      }
    );

    // Emit Socket.IO event to all users
    req.io.emit('chain-published', {
      chainId: chain._id,
      name: chain.name,
      academicYear: chain.academicYear,
      publishedBy: req.user.fullName
    });

    res.json({
      success: true,
      message: 'Milestone chain published successfully',
      chain
    });
  } catch (error) {
    console.error('Publish chain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish chain',
      error: error.message
    });
  }
};

// Delete chain (only if no student submissions)
exports.deleteChain = async (req, res) => {
  try {
    const { chainId } = req.params;

    // Check for student submissions
    const hasSubmissions = await StudentMilestone.exists({ chainId });
    if (hasSubmissions) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete chain with student submissions. Archive it instead.'
      });
    }

    // Delete all milestones in chain
    await Milestone.deleteMany({ chainId });
    
    // Delete chain
    await MilestoneChain.findByIdAndDelete(chainId);

    req.io.to('admin-room').emit('chain-deleted', { chainId });

    res.json({
      success: true,
      message: 'Chain and all milestones deleted successfully'
    });
  } catch (error) {
    console.error('Delete chain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chain',
      error: error.message
    });
  }
};
