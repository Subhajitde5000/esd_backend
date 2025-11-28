const StudentMilestone = require('../models/StudentMilestone');
const Milestone = require('../models/Milestone');
const cloudinary = require('../config/cloudinary');

// Start milestone (student)
exports.startMilestone = async (req, res) => {
  try {
    const { milestoneId } = req.params;

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone || milestone.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found or not published'
      });
    }

    // Check if already started
    let studentMilestone = await StudentMilestone.findOne({
      student: req.user.id,
      milestone: milestoneId
    });

    if (studentMilestone) {
      return res.json({
        success: true,
        message: 'Milestone already started',
        studentMilestone
      });
    }

    // Create new student milestone
    studentMilestone = await StudentMilestone.create({
      student: req.user.id,
      milestone: milestoneId,
      chainId: milestone.chainId,
      status: 'in-progress',
      startedAt: new Date(),
      attempts: 1
    });

    // For quiz/exam, record start time
    if (milestone.type === 'quiz' || milestone.type === 'exam') {
      studentMilestone.quizStartedAt = new Date();
      await studentMilestone.save();
    }

    res.json({
      success: true,
      message: 'Milestone started successfully',
      studentMilestone
    });
  } catch (error) {
    console.error('Start milestone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start milestone',
      error: error.message
    });
  }
};

// Submit assignment
exports.submitAssignment = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const { text } = req.body;
    const files = req.files;

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone || milestone.type !== 'assignment') {
      return res.status(400).json({
        success: false,
        message: 'Invalid milestone type'
      });
    }

    let studentMilestone = await StudentMilestone.findOne({
      student: req.user.id,
      milestone: milestoneId
    });

    if (!studentMilestone) {
      studentMilestone = await StudentMilestone.create({
        student: req.user.id,
        milestone: milestoneId,
        chainId: milestone.chainId,
        status: 'in-progress',
        startedAt: new Date()
      });
    }

    // Handle file uploads
    const uploadedFiles = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'milestones/assignments',
          resource_type: 'auto'
        });

        uploadedFiles.push({
          filename: file.originalname,
          url: result.secure_url,
          size: file.size,
          uploadedAt: new Date()
        });
      }
    }

    // Add submission
    studentMilestone.submissions.push({
      files: uploadedFiles,
      text,
      submittedAt: new Date()
    });
    studentMilestone.status = 'submitted';
    await studentMilestone.save();

    // Emit Socket.IO event to mentors/admins
    req.io.to('admin-room').emit('assignment-submitted', {
      studentName: req.user.fullName,
      milestoneName: milestone.name,
      submissionId: studentMilestone._id
    });

    res.json({
      success: true,
      message: 'Assignment submitted successfully',
      studentMilestone
    });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit assignment',
      error: error.message
    });
  }
};

// Submit quiz/exam answers
exports.submitQuizAnswers = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const { answers } = req.body; // Array of { questionId, answer }

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone || (milestone.type !== 'quiz' && milestone.type !== 'exam')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid milestone type'
      });
    }

    let studentMilestone = await StudentMilestone.findOne({
      student: req.user.id,
      milestone: milestoneId
    });

    if (!studentMilestone) {
      return res.status(400).json({
        success: false,
        message: 'Milestone not started'
      });
    }

    // Check time limit
    if (milestone.duration) {
      const timeElapsed = (new Date() - new Date(studentMilestone.quizStartedAt)) / (1000 * 60);
      if (timeElapsed > milestone.duration) {
        studentMilestone.status = 'failed';
        await studentMilestone.save();
        return res.status(400).json({
          success: false,
          message: 'Time limit exceeded'
        });
      }
    }

    // Auto-grade answers
    let totalScore = 0;
    let maxScore = 0;
    const gradedAnswers = [];

    for (const answer of answers) {
      const question = milestone.questions.id(answer.questionId);
      if (!question) continue;

      maxScore += question.points;
      let isCorrect = false;
      let points = 0;

      if (question.type === 'multiple-choice' || question.type === 'true-false') {
        isCorrect = answer.answer === question.correctAnswer;
        points = isCorrect ? question.points : 0;
        totalScore += points;
      }

      gradedAnswers.push({
        questionId: answer.questionId,
        answer: answer.answer,
        isCorrect,
        points
      });
    }

    studentMilestone.answers = gradedAnswers;
    studentMilestone.quizSubmittedAt = new Date();
    studentMilestone.score = totalScore;
    studentMilestone.maxScore = maxScore;
    studentMilestone.percentage = (totalScore / maxScore) * 100;
    
    // Set to submitted status - mentor will review and approve
    studentMilestone.status = 'submitted';
    studentMilestone.autoGradedScore = totalScore; // Store for mentor reference
    studentMilestone.autoGradedPercentage = (totalScore / maxScore) * 100;

    await studentMilestone.save();

    // Emit Socket.IO event to mentors/admins
    req.io.to('admin-room').emit('assignment-submitted', {
      studentName: req.user.fullName,
      milestoneName: milestone.name,
      submissionId: studentMilestone._id,
      type: milestone.type
    });

    res.json({
      success: true,
      message: `${milestone.type === 'quiz' ? 'Quiz' : 'Exam'} submitted successfully. Your mentor will review it soon.`,
      studentMilestone: {
        status: 'submitted',
        message: 'Your submission is being reviewed by your mentor'
      }
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit quiz',
      error: error.message
    });
  }
};

// Grade assignment (mentor/admin/super_admin)
exports.gradeAssignment = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, maxScore, grade, feedback } = req.body;

    const studentMilestone = await StudentMilestone.findById(submissionId)
      .populate('student', 'fullName email')
      .populate('milestone', 'name type');

    if (!studentMilestone) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    studentMilestone.score = score;
    studentMilestone.maxScore = maxScore;
    studentMilestone.percentage = (score / maxScore) * 100;
    studentMilestone.grade = grade;
    studentMilestone.feedback = feedback;
    studentMilestone.gradedBy = req.user.id;
    studentMilestone.gradedAt = new Date();
    studentMilestone.status = 'completed';
    studentMilestone.completedAt = new Date();
    await studentMilestone.save();

    // Emit Socket.IO event to student
    req.io.to(studentMilestone.student._id.toString()).emit('assignment-graded', {
      milestoneName: studentMilestone.milestone.name,
      score,
      maxScore,
      percentage: studentMilestone.percentage,
      grade,
      feedback
    });

    res.json({
      success: true,
      message: 'Assignment graded successfully',
      studentMilestone
    });
  } catch (error) {
    console.error('Grade assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to grade assignment',
      error: error.message
    });
  }
};

// Get student's milestone progress
exports.getStudentProgress = async (req, res) => {
  try {
    const { chainId } = req.params;
    const studentId = req.user.role === 'student' ? req.user.id : req.query.studentId;

    const progress = await StudentMilestone.find({
      student: studentId,
      chainId
    })
      .populate('milestone', 'name type startDate endDate order')
      .sort({ 'milestone.order': 1 });

    const stats = {
      total: progress.length,
      notStarted: progress.filter(p => p.status === 'not-started').length,
      inProgress: progress.filter(p => p.status === 'in-progress').length,
      submitted: progress.filter(p => p.status === 'submitted').length,
      completed: progress.filter(p => p.status === 'completed').length,
      failed: progress.filter(p => p.status === 'failed').length,
      averageScore: 0
    };

    const scoredItems = progress.filter(p => p.percentage !== undefined);
    if (scoredItems.length > 0) {
      stats.averageScore = scoredItems.reduce((sum, p) => sum + p.percentage, 0) / scoredItems.length;
    }

    res.json({
      success: true,
      progress,
      stats
    });
  } catch (error) {
    console.error('Get student progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student progress',
      error: error.message
    });
  }
};

// Get all submissions for grading (mentor/admin/super_admin)
exports.getPendingSubmissions = async (req, res) => {
  try {
    const { milestoneId } = req.query;

    const filter = { status: 'submitted' };
    if (milestoneId) filter.milestone = milestoneId;

    const submissions = await StudentMilestone.find(filter)
      .populate('student', 'fullName email rollNumber')
      .populate('milestone') // Populate full milestone to get questions for quiz/exam
      .sort({ 'submissions.submittedAt': -1 });

    res.json({
      success: true,
      count: submissions.length,
      submissions
    });
  } catch (error) {
    console.error('Get pending submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submissions',
      error: error.message
    });
  }
};
