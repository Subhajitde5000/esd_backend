const mongoose = require('mongoose');

const mentorFeedbackSchema = new mongoose.Schema({
  mentor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Mentor reference is required'],
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Student reference is required'],
  },
  studentName: {
    type: String,
    required: true,
  },
  studentRollNo: {
    type: String,
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    required: [true, 'Comment is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters'],
  },
  attendancePercentage: {
    type: Number,
    required: true,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  adminResponse: {
    type: String,
    trim: true,
  },
  adminResponseBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  adminResponseAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

// Compound index for student-mentor feedback
mentorFeedbackSchema.index({ mentor: 1, student: 1 });
mentorFeedbackSchema.index({ mentor: 1, rating: 1 });
mentorFeedbackSchema.index({ createdAt: -1 });

// Method to calculate average rating for a mentor
mentorFeedbackSchema.statics.getAverageRating = async function(mentorId) {
  const result = await this.aggregate([
    { $match: { mentor: new mongoose.Types.ObjectId(mentorId) } },
    {
      $group: {
        _id: '$mentor',
        averageRating: { $avg: '$rating' },
        totalFeedbacks: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating'
        }
      }
    }
  ]);

  if (result.length > 0) {
    const data = result[0];
    // Calculate rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    data.ratingDistribution.forEach(rating => {
      distribution[rating] = (distribution[rating] || 0) + 1;
    });

    return {
      averageRating: Math.round(data.averageRating * 10) / 10,
      totalFeedbacks: data.totalFeedbacks,
      distribution
    };
  }

  return {
    averageRating: 0,
    totalFeedbacks: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };
};

const MentorFeedback = mongoose.model('MentorFeedback', mentorFeedbackSchema);

module.exports = MentorFeedback;
