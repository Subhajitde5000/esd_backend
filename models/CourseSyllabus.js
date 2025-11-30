const mongoose = require('mongoose');

const courseSyllabusSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  academicYear: {
    type: String,
    required: true, // e.g., "2024-2025"
  },
  year: {
    type: String,
    required: true,
    enum: ['1st', '2nd', '3rd', '4th'],
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Both'],
    default: 'Both',
  },
  type: {
    type: String,
    required: true,
    enum: ['PDF', 'DOCX', 'PPT'],
  },
  fileUrl: {
    type: String,
    required: true,
  },
  publicId: {
    type: String, // Cloudinary public ID for deletion
  },
  size: {
    type: String,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  uploaderRole: {
    type: String,
    enum: ['admin', 'super_admin'],
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
  isActive: {
    type: Boolean,
    default: true, // Only one syllabus can be active per year
  },
  tags: [{
    type: String,
    trim: true,
  }],
}, {
  timestamps: true,
});

// Indexes
courseSyllabusSchema.index({ year: 1, academicYear: 1, isActive: 1 });
courseSyllabusSchema.index({ uploadedBy: 1 });
courseSyllabusSchema.index({ createdAt: -1 });

// Method to increment downloads
courseSyllabusSchema.methods.incrementDownloads = function() {
  this.downloads += 1;
  return this.save();
};

// Method to increment views
courseSyllabusSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

module.exports = mongoose.model('CourseSyllabus', courseSyllabusSchema);
