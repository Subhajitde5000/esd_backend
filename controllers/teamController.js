const Team = require('../models/Team');
const User = require('../models/User');
const TeamDiscussion = require('../models/TeamDiscussion');
const { sendEmail } = require('../utils/emailService');
const QRCode = require('qrcode');

// Create a new team
exports.createTeam = async (req, res) => {
  try {
    const { teamName, projectTitle, description, domains, category } = req.body;
    const userId = req.user._id;

    // Check if user is already in a team
    const existingTeam = await Team.findOne({
      'members.user': userId,
      isDeleted: false
    });

    if (existingTeam) {
      return res.status(400).json({ message: 'You are already a member of a team' });
    }

    // Generate unique team ID
    const teamId = await Team.generateTeamId();

    // Generate QR code
    const qrCodeData = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/team/join/${teamId}`;
    const qrCode = await QRCode.toDataURL(qrCodeData);

    const team = new Team({
      teamName,
      teamId,
      projectTitle,
      description,
      domains,
      category,
      leader: userId,
      qrCode,
      members: [{
        user: userId,
        role: 'leader'
      }]
    });

    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('leader', 'fullName email college')
      .populate('members.user', 'fullName email college branch year');

    // Emit socket event to all users
    req.io.emit('team-created', {
      team: populatedTeam,
      message: `${req.user.fullName} created team ${teamName}`
    });

    // Also emit to admin and super admin rooms specifically
    req.io.to('admin-room').emit('team-created', {
      team: populatedTeam,
      message: `${req.user.fullName} created team ${teamName}`
    });
    req.io.to('super-admin-room').emit('team-created', {
      team: populatedTeam,
      message: `${req.user.fullName} created team ${teamName}`
    });

    res.status(201).json({
      message: 'Team created successfully',
      team: populatedTeam
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's team
exports.getMyTeam = async (req, res) => {
  try {
    const userId = req.user._id;

    const team = await Team.findOne({
      'members.user': userId,
      isDeleted: false
    })
      .populate('leader', 'fullName email college phone')
      .populate('members.user', 'fullName email college branch year phone')
      .populate('mentor', 'fullName email department specialization')
      .populate('joinRequests.user', 'fullName email college')
      .populate('invitations.invitedBy', 'fullName email');

    res.json({ team });
  } catch (error) {
    console.error('Get my team error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get team by ID or teamId (for QR code scanning)
exports.getTeamById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if id is a valid ObjectId or treat it as teamId
    let query = { isDeleted: false };
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // Valid ObjectId format
      query.$or = [{ _id: id }, { teamId: id }];
    } else {
      // Not a valid ObjectId, search by teamId only
      query.teamId = id;
    }

    const team = await Team.findOne(query)
      .populate('leader', 'fullName email college phone')
      .populate('members.user', 'fullName email college branch year phone')
      .populate('mentor', 'fullName email department specialization');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if user is a member, mentor, or admin
    const userId = req.user._id;
    const userRole = req.user.role;
    const isMember = team.members.some(m => m.user && m.user._id && m.user._id.toString() === userId.toString());
    const isMentor = team.mentor && team.mentor._id && team.mentor._id.toString() === userId.toString();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    // Allow full access to members, mentors, and admins
    if (!isMember && !isMentor && !isAdmin) {
      // Return only public data for others
      return res.json({
        team: {
          teamName: team.teamName,
          teamId: team.teamId,
          projectTitle: team.projectTitle,
          description: team.description,
          domains: team.domains,
          memberCount: team.memberCount,
          leader: team.leader,
          category: team.category
        }
      });
    }

    res.json({ team });
  } catch (error) {
    console.error('Get team by ID error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Request to join a team
exports.requestToJoin = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;

    // Check if user is already in a team
    const existingTeam = await Team.findOne({
      'members.user': userId,
      isDeleted: false
    });

    if (existingTeam) {
      return res.status(400).json({ message: 'You are already a member of a team' });
    }

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('leader', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if already requested
    const existingRequest = team.joinRequests.find(
      req => req.user.toString() === userId && req.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({ message: 'You have already requested to join this team' });
    }

    team.joinRequests.push({
      user: userId,
      status: 'pending'
    });

    await team.save();

    const user = await User.findById(userId);

    // Send email to team leader
    const emailContent = `
      <h2>New Team Join Request</h2>
      <p>Hello ${team.leader.fullName},</p>
      <p><strong>${user.fullName}</strong> (${user.email}) has requested to join your team <strong>${team.teamName}</strong>.</p>
      <p>Please log in to your dashboard to approve or reject this request.</p>
      <p>Team ID: ${team.teamId}</p>
    `;

    sendEmail(team.leader.email, 'New Team Join Request', emailContent);

    // Emit socket event to team leader
    req.io.to(team.leader._id.toString()).emit('join-request-received', {
      team: team.teamName,
      teamId: team.teamId,
      user: {
        fullName: user.fullName,
        email: user.email,
        college: user.college
      }
    });

    res.json({ message: 'Join request sent successfully' });
  } catch (error) {
    console.error('Request to join error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Approve join request (leader only)
exports.approveJoinRequest = async (req, res) => {
  try {
    const { teamId, requestId } = req.params;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('joinRequests.user', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if user is the leader
    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only team leader can approve requests' });
    }

    const request = team.joinRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    // Add user to members
    team.members.push({
      user: request.user._id,
      role: 'member'
    });

    request.status = 'approved';
    await team.save();

    // Send email to approved user
    const emailContent = `
      <h2>Team Join Request Approved</h2>
      <p>Hello ${request.user.fullName},</p>
      <p>Congratulations! Your request to join team <strong>${team.teamName}</strong> has been approved.</p>
      <p>Team ID: ${team.teamId}</p>
      <p>You can now access the team page and collaborate with your team members.</p>
    `;

    sendEmail(request.user.email, 'Team Join Request Approved', emailContent);

    // Emit socket events
    req.io.to(request.user._id.toString()).emit('join-request-approved', {
      team: team.teamName,
      teamId: team.teamId
    });

    req.io.emit('team-member-added', {
      teamId: team.teamId,
      member: request.user
    });

    res.json({ message: 'Request approved successfully' });
  } catch (error) {
    console.error('Approve join request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Reject join request (leader only)
exports.rejectJoinRequest = async (req, res) => {
  try {
    const { teamId, requestId } = req.params;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('joinRequests.user', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only team leader can reject requests' });
    }

    const request = team.joinRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    request.status = 'rejected';
    await team.save();

    // Send email to rejected user
    const emailContent = `
      <h2>Team Join Request Update</h2>
      <p>Hello ${request.user.fullName},</p>
      <p>Your request to join team <strong>${team.teamName}</strong> has been declined.</p>
      <p>You can request to join other teams or create your own team.</p>
    `;

    sendEmail(request.user.email, 'Team Join Request Update', emailContent);

    res.json({ message: 'Request rejected' });
  } catch (error) {
    console.error('Reject join request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Invite member by email (leader only)
exports.inviteMember = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email } = req.body;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false });

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only team leader can invite members' });
    }

    // Check if already invited
    const existingInvite = team.invitations.find(
      inv => inv.email === email && inv.status === 'pending'
    );

    if (existingInvite) {
      return res.status(400).json({ message: 'Invitation already sent to this email' });
    }

    team.invitations.push({
      email,
      invitedBy: userId,
      status: 'pending'
    });

    await team.save();

    const leader = await User.findById(userId);

    // Send invitation email
    const joinLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/team/join/${teamId}`;
    const emailContent = `
      <h2>Team Invitation</h2>
      <p>Hello,</p>
      <p><strong>${leader.fullName}</strong> has invited you to join the team <strong>${team.teamName}</strong>.</p>
      <p>Team ID: ${team.teamId}</p>
      <p>Project: ${team.projectTitle || 'Not specified'}</p>
      <p>Domains: ${team.domains.join(', ')}</p>
      <p><a href="${joinLink}" style="background-color: #00C47F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Join Team</a></p>
      <p>Or use this Team ID to search and join: <strong>${team.teamId}</strong></p>
    `;

    sendEmail(email, `Invitation to join ${team.teamName}`, emailContent);

    // Emit socket event for real-time update
    req.io.to(`team-${teamId}`).emit('team-updated', {
      team,
      message: `${leader.fullName} invited ${email} to join the team`
    });

    res.json({ message: 'Invitation sent successfully', invitation: team.invitations[team.invitations.length - 1] });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Cancel invitation (leader only)
exports.cancelInvitation = async (req, res) => {
  try {
    const { teamId, invitationId } = req.params;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false });

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only team leader can cancel invitations' });
    }

    const invitationIndex = team.invitations.findIndex(
      inv => inv._id.toString() === invitationId && inv.status === 'pending'
    );

    if (invitationIndex === -1) {
      return res.status(404).json({ message: 'Invitation not found or already processed' });
    }

    const cancelledEmail = team.invitations[invitationIndex].email;
    team.invitations.splice(invitationIndex, 1);
    await team.save();

    // Emit socket event
    req.io.to(`team-${teamId}`).emit('team-updated', {
      team,
      message: `Invitation to ${cancelledEmail} was cancelled`
    });

    res.json({ message: 'Invitation cancelled successfully' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update team details (leader only)
exports.updateTeamDetails = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;
    const { teamName, projectTitle, description, domains, category } = req.body;

    const team = await Team.findOne({ teamId, isDeleted: false });

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only team leader can update details' });
    }

    if (teamName) team.teamName = teamName;
    if (projectTitle !== undefined) team.projectTitle = projectTitle;
    if (description !== undefined) team.description = description;
    if (domains) team.domains = domains;
    if (category) team.category = category;

    await team.save();

    // Emit socket event
    req.io.emit('team-updated', {
      teamId: team.teamId,
      updates: { teamName, projectTitle, description, domains, category }
    });

    res.json({ message: 'Team updated successfully', team });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Change team leader (current leader only)
exports.changeLeader = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { newLeaderId } = req.body;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('members.user', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only current leader can change leadership' });
    }

    // Check if new leader is a member
    const newLeaderMember = team.members.find(
      m => m.user._id.toString() === newLeaderId
    );

    if (!newLeaderMember) {
      return res.status(400).json({ message: 'New leader must be a team member' });
    }

    // Update roles
    const currentLeaderMember = team.members.find(
      m => m.user._id.toString() === userId
    );
    currentLeaderMember.role = 'member';
    newLeaderMember.role = 'leader';
    team.leader = newLeaderId;

    await team.save();

    // Send email to new leader
    const emailContent = `
      <h2>Team Leadership Transfer</h2>
      <p>Hello ${newLeaderMember.user.fullName},</p>
      <p>You are now the leader of team <strong>${team.teamName}</strong>.</p>
      <p>Team ID: ${team.teamId}</p>
      <p>As team leader, you can now manage team members, approve join requests, and update team details.</p>
    `;

    sendEmail(newLeaderMember.user.email, 'You are now Team Leader', emailContent);

    // Emit socket event
    req.io.emit('team-leader-changed', {
      teamId: team.teamId,
      newLeader: newLeaderMember.user
    });

    res.json({ message: 'Team leader changed successfully' });
  } catch (error) {
    console.error('Change leader error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Leave team (members only, not leader)
exports.leaveTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('leader', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() === userId.toString()) {
      return res.status(400).json({ 
        message: 'Team leader cannot leave. Transfer leadership first or delete the team.' 
      });
    }

    // Remove member
    team.members = team.members.filter(
      m => m.user.toString() !== userId
    );

    await team.save();

    const user = await User.findById(userId);

    // Send email to team leader
    const emailContent = `
      <h2>Team Member Left</h2>
      <p>Hello ${team.leader.fullName},</p>
      <p><strong>${user.fullName}</strong> has left your team <strong>${team.teamName}</strong>.</p>
      <p>Team ID: ${team.teamId}</p>
    `;

    sendEmail(team.leader.email, 'Team Member Left', emailContent);

    // Emit socket event
    req.io.emit('member-left-team', {
      teamId: team.teamId,
      userId,
      userName: user.fullName
    });

    res.json({ message: 'You have left the team successfully' });
  } catch (error) {
    console.error('Leave team error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete team (leader only)
exports.deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('members.user', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.leader.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only team leader can delete the team' });
    }

    team.isDeleted = true;
    team.deletedAt = new Date();
    team.deletedBy = userId;

    await team.save();

    // Send emails to all members
    team.members.forEach(member => {
      if (member.user._id.toString() !== userId) {
        const emailContent = `
          <h2>Team Deleted</h2>
          <p>Hello ${member.user.fullName},</p>
          <p>The team <strong>${team.teamName}</strong> (${team.teamId}) has been deleted by the team leader.</p>
          <p>You can now join or create a new team.</p>
        `;
        
        sendEmail(member.user.email, 'Team Deleted', emailContent);
      }
    });

    // Emit socket event
    req.io.emit('team-deleted', {
      teamId: team.teamId,
      teamName: team.teamName
    });

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Search teams (for joining)
exports.searchTeams = async (req, res) => {
  try {
    const { search } = req.query;

    const query = { isDeleted: false };
    if (search) {
      query.$or = [
        { teamName: { $regex: search, $options: 'i' } },
        { teamId: { $regex: search, $options: 'i' } },
        { projectTitle: { $regex: search, $options: 'i' } }
      ];
    }

    const teams = await Team.find(query)
      .select('teamName teamId projectTitle description domains memberCount category leader mentor createdAt')
      .populate('leader', 'fullName college')
      .populate('mentor', 'fullName department')
      .limit(20);

    res.json({ teams });
  } catch (error) {
    console.error('Search teams error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get teams where current user is mentor
exports.getMyMentorTeams = async (req, res) => {
  try {
    const userId = req.user._id;

    const teams = await Team.find({
      mentor: userId,
      isDeleted: false
    })
      .populate('leader', 'fullName email college phone')
      .populate('members.user', 'fullName email college branch year phone')
      .populate('mentor', 'fullName email department specialization')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true,
      teams,
      count: teams.length 
    });
  } catch (error) {
    console.error('Get mentor teams error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Assign mentor to team (admin/super admin only)
exports.assignMentor = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { mentorId } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Check if user is admin or super admin
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can assign mentors' });
    }

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('members.user', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Verify mentor exists and is a mentor
    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(400).json({ message: 'Invalid mentor ID' });
    }

    team.mentor = mentorId;
    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('mentor', 'fullName email department specialization');

    // Send email to all team members
    team.members.forEach(member => {
      const emailContent = `
        <h2>Mentor Assigned to Your Team</h2>
        <p>Hello ${member.user.fullName},</p>
        <p>A mentor has been assigned to your team <strong>${team.teamName}</strong> (${team.teamId}).</p>
        <p><strong>Mentor:</strong> ${mentor.fullName}</p>
        <p><strong>Department:</strong> ${mentor.department || 'N/A'}</p>
        <p><strong>Specialization:</strong> ${mentor.specialization || 'N/A'}</p>
        <p>You can now connect with your mentor for guidance.</p>
      `;
      
      sendEmail(member.user.email, 'Mentor Assigned to Your Team', emailContent);
    });

    // Emit socket event to team room and all team members
    req.io.to(`team-${teamId}`).emit('mentor-assigned', {
      team: populatedTeam,
      mentor: mentor,
      message: `${mentor.fullName} has been assigned as your team mentor`
    });

    // Emit to each team member's personal room
    team.members.forEach(member => {
      req.io.to(member.user._id.toString()).emit('mentor-assigned', {
        team: populatedTeam,
        mentor: mentor,
        message: `${mentor.fullName} has been assigned to your team ${team.teamName}`
      });
    });

    // Emit to admin rooms
    req.io.to('admin-room').emit('team-updated', { team: populatedTeam });
    req.io.to('super-admin-room').emit('team-updated', { team: populatedTeam });

    res.json({ 
      message: 'Mentor assigned successfully',
      team: populatedTeam
    });
  } catch (error) {
    console.error('Assign mentor error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Random distribute mentors to teams (admin/super admin only)
exports.randomDistributeMentors = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    // Check if user is admin or super admin
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can distribute mentors' });
    }

    // Get all teams without mentors
    const teamsWithoutMentor = await Team.find({ 
      isDeleted: false,
      mentor: null
    }).populate('members.user', 'fullName email');

    if (teamsWithoutMentor.length === 0) {
      return res.status(400).json({ message: 'No teams without mentors found' });
    }

    // Get all mentors
    const mentors = await User.find({ role: 'mentor' });

    if (mentors.length === 0) {
      return res.status(400).json({ message: 'No mentors available' });
    }

    // Randomly distribute teams to mentors
    const assignments = [];
    let mentorIndex = 0;

    for (const team of teamsWithoutMentor) {
      const mentor = mentors[mentorIndex];
      team.mentor = mentor._id;
      await team.save();

      assignments.push({
        teamId: team.teamId,
        teamName: team.teamName,
        mentorName: mentor.fullName
      });

      // Send email to all team members
      team.members.forEach(member => {
        const emailContent = `
          <h2>Mentor Assigned to Your Team</h2>
          <p>Hello ${member.user.fullName},</p>
          <p>A mentor has been assigned to your team <strong>${team.teamName}</strong> (${team.teamId}).</p>
          <p><strong>Mentor:</strong> ${mentor.fullName}</p>
          <p><strong>Department:</strong> ${mentor.department || 'N/A'}</p>
          <p><strong>Specialization:</strong> ${mentor.specialization || 'N/A'}</p>
          <p>You can now connect with your mentor for guidance.</p>
        `;
        
        sendEmail(member.user.email, 'Mentor Assigned to Your Team', emailContent);
      });

      // Emit socket event to team room and all team members
      const populatedTeam = await Team.findById(team._id)
        .populate('mentor', 'fullName email department specialization');

      req.io.to(`team-${team.teamId}`).emit('mentor-assigned', {
        team: populatedTeam,
        mentor: mentor,
        message: `${mentor.fullName} has been assigned as your team mentor`
      });

      // Emit to each team member's personal room
      team.members.forEach(member => {
        req.io.to(member.user._id.toString()).emit('mentor-assigned', {
          team: populatedTeam,
          mentor: mentor,
          message: `${mentor.fullName} has been assigned to your team ${team.teamName}`
        });
      });

      // Move to next mentor (round-robin distribution)
      mentorIndex = (mentorIndex + 1) % mentors.length;
    }

    // Emit to admin rooms
    req.io.to('admin-room').emit('mentors-distributed', { 
      message: `${assignments.length} teams assigned to ${mentors.length} mentors`,
      assignments
    });
    req.io.to('super-admin-room').emit('mentors-distributed', { 
      message: `${assignments.length} teams assigned to ${mentors.length} mentors`,
      assignments
    });

    res.json({ 
      message: `Successfully assigned ${assignments.length} teams to ${mentors.length} mentors`,
      assignments
    });
  } catch (error) {
    console.error('Random distribute mentors error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Remove mentor from team (admin/super admin only)
exports.removeMentor = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Check if user is admin or super admin
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can remove mentors' });
    }

    const team = await Team.findOne({ teamId, isDeleted: false })
      .populate('members.user', 'fullName email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.mentor) {
      return res.status(400).json({ message: 'Team does not have a mentor assigned' });
    }

    const removedMentor = await User.findById(team.mentor);
    team.mentor = null;
    await team.save();

    // Send email to all team members
    team.members.forEach(member => {
      const emailContent = `
        <h2>Mentor Removed from Your Team</h2>
        <p>Hello ${member.user.fullName},</p>
        <p>The mentor <strong>${removedMentor.fullName}</strong> has been removed from your team <strong>${team.teamName}</strong> (${team.teamId}).</p>
        <p>A new mentor will be assigned soon.</p>
      `;
      
      sendEmail(member.user.email, 'Mentor Removed from Your Team', emailContent);
    });

    // Emit socket event to team room and all team members
    req.io.to(`team-${teamId}`).emit('mentor-removed', {
      team,
      message: `Mentor has been removed from ${team.teamName}`
    });

    // Emit to each team member's personal room
    team.members.forEach(member => {
      req.io.to(member.user._id.toString()).emit('mentor-removed', {
        team,
        message: `Mentor has been removed from your team ${team.teamName}`
      });
    });

    // Emit to admin rooms
    req.io.to('admin-room').emit('team-updated', { team });
    req.io.to('super-admin-room').emit('team-updated', { team });

    res.json({ 
      message: 'Mentor removed successfully',
      team
    });
  } catch (error) {
    console.error('Remove mentor error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get team discussions
exports.getTeamDiscussions = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Find team by teamId (e.g., TIG-ESD-24-415)
    const team = await Team.findOne({ teamId, isDeleted: false });
    
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if user is a member or mentor
    const isMember = team.members.some(m => m.user.toString() === userId.toString());
    const isMentor = team.mentor && team.mentor.toString() === userId.toString();
    
    if (!isMember && !isMentor) {
      return res.status(403).json({ message: 'Not authorized to view team discussions' });
    }

    const skip = (page - 1) * limit;
    
    const discussions = await TeamDiscussion.find({
      team: team._id,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'fullName email profilePicture role')
      .lean();

    const total = await TeamDiscussion.countDocuments({
      team: team._id,
      isDeleted: false
    });

    res.json({
      success: true,
      discussions: discussions.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get team discussions error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Send discussion message
exports.sendDiscussionMessage = async (req, res) => {
  try {
    const { teamId, content } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Find team by teamId
    const team = await Team.findOne({ teamId, isDeleted: false });
    
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if user is a member or mentor
    const isMember = team.members.some(m => m.user.toString() === userId.toString());
    const isMentor = team.mentor && team.mentor.toString() === userId.toString();
    
    if (!isMember && !isMentor) {
      return res.status(403).json({ message: 'Not authorized to send messages' });
    }

    // Process uploaded files from multer
    const attachments = req.files ? req.files.map(file => ({
      fileUrl: file.path,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      publicId: file.filename
    })) : [];

    const message = new TeamDiscussion({
      team: team._id,
      sender: userId,
      senderRole: userRole,
      content: content || '',
      attachments,
      type: attachments.length > 0 ? 'file' : 'text',
      readBy: [{ user: userId, readAt: new Date() }]
    });

    await message.save();

    const populatedMessage = await TeamDiscussion.findById(message._id)
      .populate('sender', 'fullName email profilePicture role')
      .lean();

    // Emit socket event to team room
    req.io.to(`team-${teamId}`).emit('new-discussion-message', populatedMessage);

    res.json({
      success: true,
      message: populatedMessage
    });
  } catch (error) {
    console.error('Send discussion message error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Edit discussion message
exports.editDiscussionMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const message = await TeamDiscussion.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this message' });
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populatedMessage = await TeamDiscussion.findById(message._id)
      .populate('sender', 'fullName email profilePicture role')
      .lean();

    // Get team to emit socket event
    const team = await Team.findById(message.team);
    req.io.to(`team-${team.teamId}`).emit('message-edited', populatedMessage);

    res.json({
      success: true,
      message: populatedMessage
    });
  } catch (error) {
    console.error('Edit discussion message error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete discussion message
exports.deleteDiscussionMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await TeamDiscussion.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    // Get team to emit socket event
    const team = await Team.findById(message.team);
    req.io.to(`team-${team.teamId}`).emit('message-deleted', { messageId });

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete discussion message error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Mark messages as read
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;

    // Find team by teamId
    const team = await Team.findOne({ teamId, isDeleted: false });
    
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    await TeamDiscussion.updateMany(
      {
        team: team._id,
        'readBy.user': { $ne: userId }
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

