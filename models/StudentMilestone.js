const mongoose = require('mongoose');

const studentMilestoneSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  milestone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Milestone',
    required: true
  },
  chainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MilestoneChain',
    required: true
  },
  status: {
    type: String,
    enum: ['not-started', 'in-progress', 'submitted', 'completed', 'failed'],
    default: 'not-started'
  },
  
  // Submission data
  submissions: [{
    files: [{
      filename: String,
      url: String,
      size: Number,
      uploadedAt: Date
    }],
    text: String,
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Quiz/Exam data
  answers: [{
    questionId: mongoose.Schema.Types.ObjectId,
    answer: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    points: Number
  }],
  quizStartedAt: Date,
  quizSubmittedAt: Date,
  
  // Grading
  score: Number,
  maxScore: Number,
  percentage: Number,
  grade: String, // A, B, C, etc.
  feedback: String,
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gradedAt: Date,
  
  // Auto-graded data (for quiz/exam - stored for mentor review)
  autoGradedScore: Number,
  autoGradedPercentage: Number,
  
  // Tracking
  startedAt: Date,
  completedAt: Date,
  attempts: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
studentMilestoneSchema.index({ student: 1, milestone: 1 }, { unique: true });
studentMilestoneSchema.index({ student: 1, chainId: 1 });
studentMilestoneSchema.index({ milestone: 1, status: 1 });

module.exports = mongoose.model('StudentMilestone', studentMilestoneSchema);
