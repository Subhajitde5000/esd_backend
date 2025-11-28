const ExamSchedule = require('../models/ExamSchedule');
const Team = require('../models/Team');
const User = require('../models/User');

// @desc    Create exam schedule
// @route   POST /api/exam-schedules
// @access  Admin, Super Admin
exports.createExamSchedule = async (req, res) => {
  try {
    const {
      title,
      description,
      examType,
      startDate,
      endDate,
      duration,
      assignmentType,
      settings
    } = req.body;

    const examSchedule = await ExamSchedule.create({
      title,
      description,
      examType,
      startDate,
      endDate,
      duration,
      assignmentType,
      settings,
      createdBy: req.user._id,
      status: 'draft'
    });

    // Emit socket event
    req.io.emit('exam-schedule-created', {
      examSchedule,
      createdBy: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      }
    });

    res.status(201).json({
      success: true,
      message: 'Exam schedule created successfully',
      examSchedule
    });

  } catch (error) {
    console.error('Create exam schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating exam schedule',
      error: error.message
    });
  }
};

// @desc    Get all exam schedules
// @route   GET /api/exam-schedules
// @access  Private
exports.getAllExamSchedules = async (req, res) => {
  try {
    const { status, examType } = req.query;

    let query = {};
    if (status) query.status = status;
    if (examType) query.examType = examType;

    const examSchedules = await ExamSchedule.find(query)
      .populate('createdBy', 'name email role')
      .populate('slots.mentor', 'name email')
      .populate('slots.team', 'name projectName')
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: examSchedules.length,
      examSchedules
    });

  } catch (error) {
    console.error('Get exam schedules error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exam schedules',
      error: error.message
    });
  }
};

// @desc    Get single exam schedule
// @route   GET /api/exam-schedules/:id
// @access  Private
exports.getExamScheduleById = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('slots.mentor', 'name email')
      .populate({
        path: 'slots.team',
        populate: {
          path: 'members.user',
          select: 'name email'
        }
      });

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    res.status(200).json({
      success: true,
      examSchedule
    });

  } catch (error) {
    console.error('Get exam schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exam schedule',
      error: error.message
    });
  }
};

// @desc    Update exam schedule
// @route   PUT /api/exam-schedules/:id
// @access  Admin, Super Admin
exports.updateExamSchedule = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    const updatedSchedule = await ExamSchedule.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email role');

    // Emit socket event
    req.io.emit('exam-schedule-updated', {
      examSchedule: updatedSchedule,
      updatedBy: {
        id: req.user._id,
        name: req.user.name
      }
    });

    res.status(200).json({
      success: true,
      message: 'Exam schedule updated successfully',
      examSchedule: updatedSchedule
    });

  } catch (error) {
    console.error('Update exam schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating exam schedule',
      error: error.message
    });
  }
};

// @desc    Delete exam schedule
// @route   DELETE /api/exam-schedules/:id
// @access  Admin, Super Admin
exports.deleteExamSchedule = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    await examSchedule.deleteOne();

    // Emit socket event
    req.io.emit('exam-schedule-deleted', {
      scheduleId: req.params.id,
      deletedBy: {
        id: req.user._id,
        name: req.user.name
      }
    });

    res.status(200).json({
      success: true,
      message: 'Exam schedule deleted successfully'
    });

  } catch (error) {
    console.error('Delete exam schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting exam schedule',
      error: error.message
    });
  }
};

// @desc    Randomly distribute teams to mentors
// @route   POST /api/exam-schedules/:id/distribute-random
// @access  Admin, Super Admin
exports.randomDistributeTeams = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    // Get all mentors
    const mentors = await User.find({ 
      role: 'mentor',
      $or: [
        { approvalStatus: 'approved' },
        { approvalStatus: { $exists: false } }
      ]
    });
    
    // Get all teams
    const teams = await Team.find({});

    if (mentors.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No mentors available'
      });
    }

    if (teams.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No teams available'
      });
    }

    // Calculate slots per day
    const startDate = new Date(examSchedule.startDate);
    const endDate = new Date(examSchedule.endDate);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    
    // Clear existing slots
    examSchedule.slots = [];

    // Distribute teams randomly
    const teamsPerMentor = Math.ceil(teams.length / mentors.length);
    let currentDate = new Date(startDate);
    let slotTime = '09:00';
    let mentorIndex = 0;

    for (let i = 0; i < teams.length; i++) {
      const mentor = mentors[mentorIndex % mentors.length];
      
      examSchedule.slots.push({
        mentor: mentor._id,
        team: teams[i]._id,
        scheduledDate: new Date(currentDate),
        scheduledTime: slotTime,
        duration: examSchedule.duration,
        mode: 'offline',
        status: 'scheduled'
      });

      // Move to next time slot (assuming 30 min slots with 10 min break)
      const [hours, minutes] = slotTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + examSchedule.duration + 10;
      const newHours = Math.floor(totalMinutes / 60);
      const newMinutes = totalMinutes % 60;

      // If time exceeds 18:00, move to next day
      if (newHours >= 18) {
        currentDate.setDate(currentDate.getDate() + 1);
        slotTime = '09:00';
      } else {
        slotTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
      }

      mentorIndex++;
    }

    examSchedule.assignmentType = 'random';
    examSchedule.status = 'active';
    await examSchedule.save();

    // Emit socket event
    req.io.emit('teams-distributed', {
      scheduleId: examSchedule._id,
      totalSlots: examSchedule.slots.length
    });

    res.status(200).json({
      success: true,
      message: 'Teams distributed randomly successfully',
      examSchedule
    });

  } catch (error) {
    console.error('Random distribute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error distributing teams',
      error: error.message
    });
  }
};

// @desc    Manually assign team to mentor slot
// @route   POST /api/exam-schedules/:id/assign-manual
// @access  Admin, Super Admin
exports.manualAssignTeam = async (req, res) => {
  try {
    const { mentorId, teamId, scheduledDate, scheduledTime, duration, mode, venue, meetLink } = req.body;

    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    examSchedule.slots.push({
      mentor: mentorId,
      team: teamId,
      scheduledDate,
      scheduledTime,
      duration: duration || examSchedule.duration,
      mode,
      venue,
      meetLink,
      status: 'scheduled'
    });

    examSchedule.assignmentType = 'manual';
    await examSchedule.save();

    // Emit socket event
    req.io.to(`mentor-${mentorId}`).emit('new-exam-slot', {
      scheduleId: examSchedule._id,
      slot: examSchedule.slots[examSchedule.slots.length - 1]
    });

    res.status(200).json({
      success: true,
      message: 'Team assigned successfully',
      examSchedule
    });

  } catch (error) {
    console.error('Manual assign error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning team',
      error: error.message
    });
  }
};

// @desc    Get available mentors and teams for manual assignment
// @route   GET /api/exam-schedules/:id/available-resources
// @access  Admin, Super Admin
exports.getAvailableResources = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    // Get all mentors
    const mentors = await User.find({ 
      role: 'mentor',
      $or: [
        { approvalStatus: 'approved' },
        { approvalStatus: { $exists: false } }
      ]
    }).select('fullName email expertise organization');

    // Get all teams
    const teams = await Team.find({}).select('teamName teamId projectTitle leader members');

    // Get already assigned team IDs
    const assignedTeamIds = examSchedule.slots.map(slot => slot.team?.toString());

    // Filter unassigned teams
    const unassignedTeams = teams.filter(team => !assignedTeamIds.includes(team._id.toString()));

    res.status(200).json({
      success: true,
      mentors,
      teams,
      unassignedTeams,
      assignedCount: assignedTeamIds.length,
      totalTeams: teams.length
    });

  } catch (error) {
    console.error('Get available resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resources',
      error: error.message
    });
  }
};

// @desc    Update existing slot (reassign mentor or change time)
// @route   PUT /api/exam-schedules/:id/slots/:slotId/update
// @access  Admin, Super Admin
exports.updateSlotAssignment = async (req, res) => {
  try {
    const { mentorId, scheduledDate, scheduledTime, duration, mode, venue, meetLink } = req.body;

    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    const slot = examSchedule.slots.id(req.params.slotId);

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    // Update slot fields
    if (mentorId) slot.mentor = mentorId;
    if (scheduledDate) slot.scheduledDate = scheduledDate;
    if (scheduledTime) slot.scheduledTime = scheduledTime;
    if (duration) slot.duration = duration;
    if (mode) slot.mode = mode;
    if (venue) slot.venue = venue;
    if (meetLink) slot.meetLink = meetLink;

    await examSchedule.save();

    // Emit socket event
    if (mentorId) {
      req.io.to(`mentor-${mentorId}`).emit('exam-rescheduled', {
        scheduleId: examSchedule._id,
        slotId: slot._id
      });
    }

    res.status(200).json({
      success: true,
      message: 'Slot updated successfully',
      examSchedule
    });

  } catch (error) {
    console.error('Update slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating slot',
      error: error.message
    });
  }
};

// @desc    Delete a slot
// @route   DELETE /api/exam-schedules/:id/slots/:slotId
// @access  Admin, Super Admin
exports.deleteSlot = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    const slot = examSchedule.slots.id(req.params.slotId);

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    slot.remove();
    await examSchedule.save();

    res.status(200).json({
      success: true,
      message: 'Slot deleted successfully',
      examSchedule
    });

  } catch (error) {
    console.error('Delete slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting slot',
      error: error.message
    });
  }
};

// @desc    Get mentor's exam slots
// @route   GET /api/exam-schedules/my-slots
// @access  Mentor
exports.getMentorSlots = async (req, res) => {
  try {
    const examSchedules = await ExamSchedule.find({
      'slots.mentor': req.user._id,
      status: { $in: ['active', 'draft'] }
    })
      .populate('slots.team', 'name projectName members')
      .sort({ startDate: 1 });

    // Filter to get only this mentor's slots
    const mentorSlots = [];
    examSchedules.forEach(schedule => {
      const slots = schedule.slots.filter(
        slot => slot.mentor.toString() === req.user._id.toString()
      );
      
      if (slots.length > 0) {
        mentorSlots.push({
          schedule: {
            _id: schedule._id,
            title: schedule.title,
            examType: schedule.examType,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            settings: schedule.settings
          },
          slots
        });
      }
    });

    res.status(200).json({
      success: true,
      count: mentorSlots.length,
      mentorSlots
    });

  } catch (error) {
    console.error('Get mentor slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching mentor slots',
      error: error.message
    });
  }
};

// @desc    Reschedule exam slot (Mentor)
// @route   PUT /api/exam-schedules/:id/slots/:slotId/reschedule
// @access  Mentor
exports.rescheduleSlot = async (req, res) => {
  try {
    const { scheduledDate, scheduledTime, venue, meetLink, notes } = req.body;

    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    if (!examSchedule.settings.allowMentorReschedule) {
      return res.status(403).json({
        success: false,
        message: 'Mentor rescheduling is not allowed for this exam'
      });
    }

    const slot = examSchedule.slots.id(req.params.slotId);

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    // Check if slot belongs to this mentor
    if (slot.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only reschedule your own slots'
      });
    }

    // Validate new date is within schedule range
    const newDate = new Date(scheduledDate);
    if (newDate < examSchedule.startDate || newDate > examSchedule.endDate) {
      return res.status(400).json({
        success: false,
        message: 'New date must be within exam schedule period'
      });
    }

    slot.scheduledDate = scheduledDate;
    slot.scheduledTime = scheduledTime;
    if (venue) slot.venue = venue;
    if (meetLink) slot.meetLink = meetLink;
    if (notes) slot.notes = notes;
    slot.status = 'rescheduled';

    await examSchedule.save();

    // Emit socket event to team members
    if (slot.team) {
      req.io.to(`team-${slot.team}`).emit('exam-rescheduled', {
        scheduleId: examSchedule._id,
        slotId: slot._id,
        newDate: scheduledDate,
        newTime: scheduledTime
      });
    }

    res.status(200).json({
      success: true,
      message: 'Slot rescheduled successfully',
      slot
    });

  } catch (error) {
    console.error('Reschedule slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rescheduling slot',
      error: error.message
    });
  }
};

// @desc    Submit exam score and feedback
// @route   PUT /api/exam-schedules/:id/slots/:slotId/complete
// @access  Mentor
exports.completeExamSlot = async (req, res) => {
  try {
    const { score, feedback } = req.body;

    const examSchedule = await ExamSchedule.findById(req.params.id);

    if (!examSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Exam schedule not found'
      });
    }

    const slot = examSchedule.slots.id(req.params.slotId);

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    // Check if slot belongs to this mentor
    if (slot.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only complete your own slots'
      });
    }

    slot.score = score;
    slot.feedback = feedback;
    slot.status = 'completed';

    await examSchedule.save();

    res.status(200).json({
      success: true,
      message: 'Exam slot completed successfully',
      slot
    });

  } catch (error) {
    console.error('Complete exam slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing exam slot',
      error: error.message
    });
  }
};

// @desc    Get team's exam schedule
// @route   GET /api/exam-schedules/my-team-schedule
// @access  Student
exports.getTeamExamSchedule = async (req, res) => {
  try {
    // Find user's team
    const team = await Team.findOne({
      'members.user': req.user._id
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'You are not part of any team'
      });
    }

    // Find exam schedules for this team
    const examSchedules = await ExamSchedule.find({
      'slots.team': team._id,
      status: { $in: ['active', 'completed'] }
    })
      .populate('slots.mentor', 'name email')
      .sort({ startDate: 1 });

    // Filter to get only this team's slots
    const teamSchedule = [];
    examSchedules.forEach(schedule => {
      const slots = schedule.slots.filter(
        slot => slot.team && slot.team.toString() === team._id.toString()
      );
      
      if (slots.length > 0) {
        teamSchedule.push({
          schedule: {
            _id: schedule._id,
            title: schedule.title,
            examType: schedule.examType,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            duration: schedule.duration
          },
          slots
        });
      }
    });

    res.status(200).json({
      success: true,
      count: teamSchedule.length,
      teamSchedule
    });

  } catch (error) {
    console.error('Get team schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team schedule',
      error: error.message
    });
  }
};
