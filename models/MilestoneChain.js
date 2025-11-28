const mongoose = require('mongoose');

const milestoneChainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  academicYear: {
    type: String,
    required: true // e.g., "2024-2025"
  },
  year: {
    type: String,
    required: true,
    enum: ['1st', '2nd', '3rd', '4th'],
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['editing', 'published', 'archived'],
    default: 'editing'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedAt: Date,
  
  // Collaboration tracking
  editors: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastEditedAt: Date
  }],
  
  // Stats
  totalMilestones: {
    type: Number,
    default: 0
  },
  publishedMilestones: {
    type: Number,
    default: 0
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance (removed unique constraint to allow multiple chains)
milestoneChainSchema.index({ academicYear: 1, year: 1, status: 1, isActive: 1 });

module.exports = mongoose.model('MilestoneChain', milestoneChainSchema);
