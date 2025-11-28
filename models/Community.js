const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Community name is required'],
    trim: true,
    minlength: [3, 'Community name must be at least 3 characters'],
    maxlength: [100, 'Community name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Community description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  avatar: {
    type: String,
    default: null
  },
  coverImage: {
    type: String,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  creatorRole: {
    type: String,
    enum: ['student', 'mentor', 'admin', 'super_admin'],
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'admin'],
      default: 'member'
    }
  }],
  settings: {
    allowMemberInvites: {
      type: Boolean,
      default: false
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowFileUploads: {
      type: Boolean,
      default: true
    },
    maxFileSize: {
      type: Number,
      default: 10485760 // 10MB in bytes
    }
  },
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalMembers: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: ['Study Group', 'Project Team', 'Discussion', 'Events', 'General', 'Other'],
    default: 'General'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
communitySchema.index({ createdBy: 1 });
communitySchema.index({ 'members.user': 1 });
communitySchema.index({ isActive: 1 });
communitySchema.index({ createdAt: -1 });

// Virtual for member count
communitySchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Method to check if user is a member
communitySchema.methods.isMember = function(userId) {
  return this.members.some(member => member.user.toString() === userId.toString());
};

// Method to check if user is an admin
communitySchema.methods.isAdmin = function(userId) {
  return this.members.some(
    member => member.user.toString() === userId.toString() && member.role === 'admin'
  );
};

// Method to check if user is the creator
communitySchema.methods.isCreator = function(userId) {
  return this.createdBy.toString() === userId.toString();
};

// Method to add a member
communitySchema.methods.addMember = async function(userId, role = 'member') {
  if (!this.isMember(userId)) {
    this.members.push({
      user: userId,
      role: role,
      joinedAt: new Date()
    });
    this.stats.totalMembers = this.members.length;
    await this.save();
  }
  return this;
};

// Method to remove a member
communitySchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(
    member => member.user.toString() !== userId.toString()
  );
  this.stats.totalMembers = this.members.length;
  await this.save();
  return this;
};

// Method to make user admin
communitySchema.methods.makeAdmin = async function(userId) {
  const member = this.members.find(
    m => m.user.toString() === userId.toString()
  );
  if (member) {
    member.role = 'admin';
    await this.save();
  }
  return this;
};

// Method to remove admin privileges
communitySchema.methods.removeAdmin = async function(userId) {
  const member = this.members.find(
    m => m.user.toString() === userId.toString()
  );
  if (member && member.role === 'admin') {
    member.role = 'member';
    await this.save();
  }
  return this;
};

// Method to increment message count
communitySchema.methods.incrementMessageCount = async function() {
  this.stats.totalMessages += 1;
  this.stats.lastActivity = new Date();
  await this.save();
  return this;
};

// Ensure virtuals are included in JSON
communitySchema.set('toJSON', { virtuals: true });
communitySchema.set('toObject', { virtuals: true });

const Community = mongoose.model('Community', communitySchema);

module.exports = Community;
