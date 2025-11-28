const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'short-answer', 'essay'],
    required: true
  },
  options: [String], // For multiple choice
  correctAnswer: String, // For auto-grading
  points: {
    type: Number,
    default: 1
  }
});

const submissionRequirementSchema = new mongoose.Schema({
  fileTypes: [String], // e.g., ['pdf', 'doc', 'docx']
  maxFileSize: {
    type: Number, // in MB
    default: 10
  },
  maxFiles: {
    type: Number,
    default: 1
  },
  description: String
});

const milestoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['assignment', 'quiz', 'exam', 'project', 'task', 'other'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  chainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MilestoneChain',
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  // Assignment specific fields
  submissionRequirements: submissionRequirementSchema,
  maxMarks: {
    type: Number,
    default: 10 // Default marks for Assignment, Project, Task
  },
  
  // Quiz/Exam specific fields
  questions: [questionSchema],
  duration: Number, // in minutes
  passingScore: Number, // percentage
  
  // Generic requirements
  instructions: String,
  resources: [{
    name: String,
    url: String,
    type: String
  }],
  
  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedAt: Date,
  
  // Student completion tracking
  completionStats: {
    totalStudents: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    inProgress: { type: Number, default: 0 },
    notStarted: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Index for efficient queries
milestoneSchema.index({ chainId: 1, order: 1 });
milestoneSchema.index({ status: 1 });
milestoneSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Milestone', milestoneSchema);
