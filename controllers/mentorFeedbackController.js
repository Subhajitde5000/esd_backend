const MentorFeedback = require('../models/MentorFeedback');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

// @desc    Submit mentor feedback (Students with >30% attendance only)
// @route   POST /api/mentor-feedback
// @access  Student
exports.submitMentorFeedback = async (req, res) => {
  try {
    const { mentorId, rating, comment, isAnonymous } = req.body;
    const studentId = req.user._id;

    // Validate required fields
    if (!mentorId || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Mentor ID, rating, and comment are required',
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    // Verify mentor exists
    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found',
      });
    }

    // Check student's attendance percentage
    const studentAttendance = await Attendance.find({ student: studentId });
    
    if (studentAttendance.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No attendance records found. You need at least 30% attendance to submit feedback.',
      });
    }

    const totalClasses = studentAttendance.length;
    const presentCount = studentAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const attendancePercentage = (presentCount / totalClasses) * 100;

    if (attendancePercentage < 30) {
      return res.status(403).json({
        success: false,
        message: `You need at least 30% attendance to submit feedback. Your current attendance is ${attendancePercentage.toFixed(1)}%`,
      });
    }

    // Check if student already submitted feedback for this mentor
    const existingFeedback = await MentorFeedback.findOne({
      mentor: mentorId,
      student: studentId,
    });

    if (existingFeedback) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted feedback for this mentor',
      });
    }

    // Create feedback
    const feedback = await MentorFeedback.create({
      mentor: mentorId,
      student: studentId,
      studentName: req.user.fullName,
      studentRollNo: req.user.idNumber || 'N/A',
      rating,
      comment,
      attendancePercentage: Math.round(attendancePercentage * 10) / 10,
      isAnonymous: isAnonymous || false,
    });

    // Populate mentor details
    await feedback.populate('mentor', 'fullName email');

    // Emit socket event to admin
    if (req.io) {
      req.io.to('admin-room').emit('new-mentor-feedback', {
        feedback,
        mentorName: mentor.fullName,
        studentName: isAnonymous ? 'Anonymous' : req.user.fullName,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback,
    });
  } catch (error) {
    console.error('Submit Feedback Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message,
    });
  }
};

// @desc    Get student's attendance percentage (to check eligibility)
// @route   GET /api/mentor-feedback/check-eligibility
// @access  Student
exports.checkFeedbackEligibility = async (req, res) => {
  try {
    const studentId = req.user._id;

    const studentAttendance = await Attendance.find({ student: studentId });
    
    if (studentAttendance.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          eligible: false,
          attendancePercentage: 0,
          totalClasses: 0,
          presentCount: 0,
          message: 'No attendance records found',
        },
      });
    }

    const totalClasses = studentAttendance.length;
    const presentCount = studentAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const attendancePercentage = (presentCount / totalClasses) * 100;

    res.status(200).json({
      success: true,
      data: {
        eligible: attendancePercentage >= 30,
        attendancePercentage: Math.round(attendancePercentage * 10) / 10,
        totalClasses,
        presentCount,
        message: attendancePercentage >= 30 
          ? 'You are eligible to submit feedback' 
          : `You need at least 30% attendance. Current: ${Math.round(attendancePercentage * 10) / 10}%`,
      },
    });
  } catch (error) {
    console.error('Check Eligibility Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check eligibility',
      error: error.message,
    });
  }
};

// @desc    Get feedback for a specific mentor
// @route   GET /api/mentor-feedback/mentor/:mentorId
// @access  Admin, Super Admin, Mentor (own feedback)
exports.getMentorFeedback = async (req, res) => {
  try {
    const { mentorId } = req.params;

    // Check permissions
    if (req.user.role === 'mentor' && req.user._id.toString() !== mentorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own feedback',
      });
    }

    const feedbacks = await MentorFeedback.find({ mentor: mentorId })
      .populate('student', 'fullName email idNumber')
      .populate('adminResponseBy', 'fullName')
      .sort({ createdAt: -1 });

    // Calculate statistics
    const stats = await MentorFeedback.getAverageRating(mentorId);

    res.status(200).json({
      success: true,
      data: {
        feedbacks,
        statistics: stats,
      },
    });
  } catch (error) {
    console.error('Get Mentor Feedback Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mentor feedback',
      error: error.message,
    });
  }
};

// @desc    Get all feedbacks (Admin only)
// @route   GET /api/mentor-feedback/all
// @access  Admin, Super Admin
exports.getAllFeedback = async (req, res) => {
  try {
    const { status, rating, mentorId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (rating) query.rating = parseInt(rating);
    if (mentorId) query.mentor = mentorId;

    const feedbacks = await MentorFeedback.find(query)
      .populate('mentor', 'fullName email expertise')
      .populate('student', 'fullName email idNumber')
      .populate('adminResponseBy', 'fullName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: feedbacks,
      count: feedbacks.length,
    });
  } catch (error) {
    console.error('Get All Feedback Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: error.message,
    });
  }
};

// @desc    Admin response to feedback
// @route   PUT /api/mentor-feedback/:id/respond
// @access  Admin, Super Admin
exports.respondToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { response, status } = req.body;

    const feedback = await MentorFeedback.findById(id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found',
      });
    }

    feedback.adminResponse = response;
    feedback.adminResponseBy = req.user._id;
    feedback.adminResponseAt = new Date();
    if (status) feedback.status = status;

    await feedback.save();

    await feedback.populate([
      { path: 'mentor', select: 'fullName email' },
      { path: 'student', select: 'fullName email' },
      { path: 'adminResponseBy', select: 'fullName' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Response submitted successfully',
      data: feedback,
    });
  } catch (error) {
    console.error('Respond to Feedback Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit response',
      error: error.message,
    });
  }
};

// @desc    Delete feedback
// @route   DELETE /api/mentor-feedback/:id
// @access  Admin, Super Admin
exports.deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;

    const feedback = await MentorFeedback.findByIdAndDelete(id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Feedback deleted successfully',
    });
  } catch (error) {
    console.error('Delete Feedback Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete feedback',
      error: error.message,
    });
  }
};

// @desc    Get mentor statistics with ratings
// @route   GET /api/mentor-feedback/statistics/:mentorId
// @access  Admin, Super Admin
exports.getMentorStatistics = async (req, res) => {
  try {
    const { mentorId } = req.params;

    const stats = await MentorFeedback.getAverageRating(mentorId);
    
    // Get recent feedbacks
    const recentFeedbacks = await MentorFeedback.find({ mentor: mentorId })
      .populate('student', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        recentFeedbacks,
      },
    });
  } catch (error) {
    console.error('Get Mentor Statistics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message,
    });
  }
};
