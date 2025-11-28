const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  mode: {
    type: String,
    enum: ['online', 'offline'],
    required: true
  },
  venue: {
    type: String,
    required: function() {
      return this.mode === 'offline';
    }
  },
  meetLink: {
    type: String,
    required: function() {
      return this.mode === 'online';
    }
  },
  category: {
    type: String,
    enum: ['workshop', 'skill-session', 'competition', 'team-activity', 'guest-talk', 'bootcamp'],
    required: true
  },
  maxParticipants: {
    type: Number,
    required: true
  },
  image: {
    url: String,
    publicId: String
  },
  host: {
    type: String,
    required: true
  },
  requirements: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: {
    type: String,
    enum: ['admin', 'super_admin'],
    required: true
  },
  registrations: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    attended: {
      type: Boolean,
      default: false
    },
    joinTime: Date,
    leaveTime: Date,
    duration: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String
  }],
  analytics: {
    totalRegistered: {
      type: Number,
      default: 0
    },
    totalAttended: {
      type: Number,
      default: 0
    },
    attendanceRate: {
      type: Number,
      default: 0
    },
    avgDuration: String,
    peakAttendance: {
      type: Number,
      default: 0
    },
    dropoffRate: {
      type: Number,
      default: 0
    },
    avgRating: {
      type: Number,
      default: 0
    },
    feedbackCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Index for faster queries
eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ createdBy: 1 });
eventSchema.index({ category: 1 });

// Update analytics before saving
eventSchema.pre('save', function(next) {
  if (this.registrations && this.registrations.length > 0) {
    this.analytics.totalRegistered = this.registrations.length;
    this.analytics.totalAttended = this.registrations.filter(r => r.attended).length;
    this.analytics.attendanceRate = this.analytics.totalRegistered > 0 
      ? (this.analytics.totalAttended / this.analytics.totalRegistered * 100).toFixed(1)
      : 0;
    
    const ratings = this.registrations.filter(r => r.rating).map(r => r.rating);
    if (ratings.length > 0) {
      this.analytics.avgRating = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
      this.analytics.feedbackCount = this.registrations.filter(r => r.feedback).length;
    }
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);
