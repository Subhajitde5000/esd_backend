const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  teamName: {
    type: String,
    required: true,
    trim: true
  },
  teamId: {
    type: String,
    required: true,
    unique: true
  },
  projectTitle: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  domains: [{
    type: String,
    enum: ['AI/ML', 'Social Impact', 'Robotics', 'Web Development', 'App Development', 'IoT', 'Blockchain', 'Other']
  }],
  leader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['leader', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  mentor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  joinRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  invitations: [{
    email: String,
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending'
    }
  }],
  category: {
    type: String,
    default: 'General'
  },
  qrCode: {
    type: String
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate unique team ID
teamSchema.statics.generateTeamId = async function() {
  const prefix = 'TIG-ESD-24-';
  let isUnique = false;
  let teamId;
  
  while (!isUnique) {
    const randomNum = Math.floor(Math.random() * 900) + 100; // 3 digit number
    teamId = `${prefix}${randomNum}`;
    const existing = await this.findOne({ teamId });
    if (!existing) {
      isUnique = true;
    }
  }
  
  return teamId;
};

// Virtual for member count
teamSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Virtual for pending requests count
teamSchema.virtual('pendingRequestsCount').get(function() {
  return this.joinRequests.filter(req => req.status === 'pending').length;
});

module.exports = mongoose.model('Team', teamSchema);
