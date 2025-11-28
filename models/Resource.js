const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'IPR',
      'Startup Basics',
      'Tools & Templates',
      'Innovation',
      'ESD Milestones',
      'Entrepreneurship',
      'Design Thinking',
      'Marketing',
      'Finance',
      'Legal',
      'Other'
    ],
  },
  type: {
    type: String,
    required: true,
    enum: ['PDF', 'PPT', 'DOCX', 'Video', 'YouTube', 'Template', 'Other'],
  },
  fileUrl: {
    type: String,
    required: true,
  },
  youtubeUrl: {
    type: String, // For YouTube video links
  },
  publicId: {
    type: String, // Cloudinary public ID for deletion
  },
  size: {
    type: String, // e.g., "2.5 MB"
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  uploaderRole: {
    type: String,
    enum: ['mentor', 'admin', 'super_admin'],
    required: true,
  },
  downloads: {
    type: Number,
    default: 0,
  },
  views: {
    type: Number,
    default: 0,
  },
  lastAccessed: {
    type: Date,
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  // Permissions - who can see this resource
  visibility: {
    type: String,
    enum: ['public', 'mentors_only', 'admins_only', 'super_admins_only'],
    default: 'public',
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
resourceSchema.index({ uploadedBy: 1 });
resourceSchema.index({ category: 1 });
resourceSchema.index({ type: 1 });
resourceSchema.index({ uploaderRole: 1 });
resourceSchema.index({ isArchived: 1 });
resourceSchema.index({ createdAt: -1 });

// Virtual for icon based on type
resourceSchema.virtual('icon').get(function() {
  const icons = {
    'PDF': '📄',
    'PPT': '📊',
    'DOCX': '📘',
    'Video': '🎥',
    'YouTube': '▶️',
    'Template': '📋',
    'Other': '📁'
  };
  return icons[this.type] || '📁';
});

// Method to increment downloads
resourceSchema.methods.incrementDownloads = function() {
  this.downloads += 1;
  this.lastAccessed = new Date();
  return this.save();
};

// Method to increment views
resourceSchema.methods.incrementViews = function() {
  this.views += 1;
  this.lastAccessed = new Date();
  return this.save();
};

module.exports = mongoose.model('Resource', resourceSchema);
