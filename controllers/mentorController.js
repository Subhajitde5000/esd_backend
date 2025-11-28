const Team = require('../models/Team');
const User = require('../models/User');
const StudentMilestone = require('../models/StudentMilestone');

// @desc    Get mentor dashboard statistics
// @route   GET /api/mentor/dashboard/stats
// @access  Private (Mentor only)
exports.getMentorDashboardStats = async (req, res) => {
  try {
    const mentorId = req.user._id;

    // Get total assigned teams
    const totalTeams = await Team.countDocuments({
      mentor: mentorId,
      isDeleted: false
    });

    // Get pending milestone submissions
    const teams = await Team.find({ mentor: mentorId, isDeleted: false }).select('_id');
    const teamIds = teams.map(t => t._id);
    
    const pendingSubmissions = await StudentMilestone.countDocuments({
      team: { $in: teamIds },
      status: 'submitted',
      gradingStatus: 'pending'
    });

    // Get upcoming sessions (placeholder - implement based on your session model)
    const upcomingSessions = 0; // TODO: Implement session count

    // Get unread messages/queries (placeholder - implement based on your message model)
    const unreadMessages = 0; // TODO: Implement message count

    res.status(200).json({
      success: true,
      data: {
        totalTeams,
        pendingSubmissions,
        upcomingSessions,
        unreadMessages
      }
    });
  } catch (error) {
    console.error('Get mentor dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

// @desc    Get mentor's assigned teams
// @route   GET /api/mentor/teams
// @access  Private (Mentor only)
exports.getMentorTeams = async (req, res) => {
  try {
    const mentorId = req.user._id;

    const teams = await Team.find({
      mentor: mentorId,
      isDeleted: false
    })
      .populate('leader', 'fullName email')
      .populate('members.user', 'fullName email')
      .sort({ createdAt: -1 });

    // Calculate progress for each team based on milestones
    const teamsWithProgress = await Promise.all(teams.map(async (team) => {
      // Get milestone completion rate
      const totalMilestones = await StudentMilestone.countDocuments({
        team: team._id
      });
      
      const completedMilestones = await StudentMilestone.countDocuments({
        team: team._id,
        status: 'completed',
        gradingStatus: 'graded'
      });

      const progress = totalMilestones > 0 
        ? Math.round((completedMilestones / totalMilestones) * 100) 
        : 0;

      // Determine status based on progress
      let status = 'active';
      if (progress < 30) status = 'delayed';
      else if (progress < 70) status = 'active';
      else status = 'active';

      return {
        _id: team._id,
        teamId: team.teamId,
        name: team.teamName,
        domain: team.domain || 'General',
        progress,
        status,
        members: team.members.map(m => m.user?.fullName?.charAt(0) || 'U'),
        leader: team.leader?.fullName || 'Unknown',
        memberCount: team.members.length
      };
    }));

    res.status(200).json({
      success: true,
      data: teamsWithProgress,
      count: teamsWithProgress.length
    });
  } catch (error) {
    console.error('Get mentor teams error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching mentor teams',
      error: error.message
    });
  }
};

// @desc    Get pending milestone submissions for review
// @route   GET /api/mentor/milestones/pending
// @access  Private (Mentor only)
exports.getPendingMilestoneSubmissions = async (req, res) => {
  try {
    const mentorId = req.user._id;

    // Get mentor's teams
    const teams = await Team.find({ mentor: mentorId, isDeleted: false }).select('_id teamId teamName');
    const teamIds = teams.map(t => t._id);

    // Get pending submissions
    const submissions = await StudentMilestone.find({
      team: { $in: teamIds },
      status: 'submitted',
      gradingStatus: 'pending'
    })
      .populate('team', 'teamId teamName')
      .populate('milestone', 'title')
      .populate('student', 'fullName')
      .sort({ submittedAt: -1 })
      .limit(10);

    const formattedSubmissions = submissions.map(sub => ({
      _id: sub._id,
      team: sub.team?.teamName || 'Unknown Team',
      teamId: sub.team?.teamId || 'N/A',
      title: sub.milestone?.title || 'Milestone',
      submittedOn: sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
      status: 'Waiting for Review',
      attachments: sub.files?.map(f => f.split('.').pop().toUpperCase()) || [],
      comments: sub.comments || 'No comments provided',
      studentName: sub.student?.fullName || 'Unknown Student'
    }));

    res.status(200).json({
      success: true,
      data: formattedSubmissions,
      count: formattedSubmissions.length
    });
  } catch (error) {
    console.error('Get pending submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending submissions',
      error: error.message
    });
  }
};

// @desc    Get upcoming mentor sessions
// @route   GET /api/mentor/sessions/upcoming
// @access  Private (Mentor only)
exports.getMentorUpcomingSessions = async (req, res) => {
  try {
    // Placeholder - implement based on your session/event model
    const sessions = [];
    
    res.status(200).json({
      success: true,
      data: sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('Get upcoming sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming sessions',
      error: error.message
    });
  }
};

// @desc    Get student queries and messages
// @route   GET /api/mentor/queries
// @access  Private (Mentor only)
exports.getMentorQueries = async (req, res) => {
  try {
    // Placeholder - implement based on your message model
    const queries = [];
    
    res.status(200).json({
      success: true,
      data: queries,
      count: queries.length
    });
  } catch (error) {
    console.error('Get mentor queries error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching queries',
      error: error.message
    });
  }
};
