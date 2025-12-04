const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Student reference is required'],
  },
  studentName: {
    type: String,
    required: true,
  },
  rollNo: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    required: [true, 'Attendance status is required'],
  },
  subject: {
    type: String,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  section: {
    type: String,
    required: true,
    trim: true,
  },
  year: {
    type: String,
    required: true,
    trim: true,
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  markedByName: {
    type: String,
    required: true,
  },
  markedByRole: {
    type: String,
    enum: ['mentor', 'admin', 'super_admin'],
    required: true,
  },
  remarks: {
    type: String,
    trim: true,
  },
  lastModified: {
    type: Date,
    default: Date.now,
  },
  modificationHistory: [{
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    modifiedAt: {
      type: Date,
      default: Date.now,
    },
    previousStatus: String,
    newStatus: String,
    reason: String,
  }],
}, {
  timestamps: true,
});

// Compound index for efficient queries
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ department: 1, section: 1, year: 1 });
attendanceSchema.index({ date: 1, department: 1, section: 1 });

// Method to add modification history
attendanceSchema.methods.addModification = function(modifiedBy, previousStatus, newStatus, reason) {
  this.modificationHistory.push({
    modifiedBy,
    modifiedAt: new Date(),
    previousStatus,
    newStatus,
    reason,
  });
  this.lastModified = new Date();
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
