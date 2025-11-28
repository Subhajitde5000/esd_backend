const mongoose = require('mongoose');

const examScheduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  examType: {
    type: String,
    enum: ['presentation', 'viva', 'demo', 'assessment', 'review'],
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
  duration: {
    type: Number, // Duration in minutes per team
    required: true,
    default: 30
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignmentType: {
    type: String,
    enum: ['random', 'manual'],
    default: 'manual'
  },
  slots: [{
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    scheduledDate: {
      type: Date,
      required: true
    },
    scheduledTime: {
      type: String,
      required: true
    },
    duration: {
      type: Number,
      default: 30
    },
    venue: String,
    meetLink: String,
    mode: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline'
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
      default: 'scheduled'
    },
    notes: String,
    score: Number,
    feedback: String,
    isConfirmed: {
      type: Boolean,
      default: false
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    confirmedAt: Date
  }],
  settings: {
    allowMentorReschedule: {
      type: Boolean,
      default: true
    },
    requireConfirmation: {
      type: Boolean,
      default: false
    },
    autoAssignTeams: {
      type: Boolean,
      default: false
    },
    notifyBeforeDays: {
      type: Number,
      default: 1
    }
  },
  statistics: {
    totalSlots: {
      type: Number,
      default: 0
    },
    scheduledSlots: {
      type: Number,
      default: 0
    },
    completedSlots: {
      type: Number,
      default: 0
    },
    pendingSlots: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
examScheduleSchema.index({ startDate: 1, endDate: 1 });
examScheduleSchema.index({ status: 1 });
examScheduleSchema.index({ 'slots.mentor': 1 });
examScheduleSchema.index({ 'slots.team': 1 });

// Update statistics before saving
examScheduleSchema.pre('save', function(next) {
  if (this.slots && this.slots.length > 0) {
    this.statistics.totalSlots = this.slots.length;
    this.statistics.scheduledSlots = this.slots.filter(s => s.status === 'scheduled').length;
    this.statistics.completedSlots = this.slots.filter(s => s.status === 'completed').length;
    this.statistics.pendingSlots = this.slots.filter(s => !s.team).length;
  }
  next();
});

module.exports = mongoose.model('ExamSchedule', examScheduleSchema);
