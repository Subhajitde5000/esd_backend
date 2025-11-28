const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../config/cloudinary');

// Cloudinary storage for discussion attachments
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'team_discussions',
    resource_type: 'auto', // Allows all file types
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip'],
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// All routes require authentication
router.use(protect);

// Create team
router.post('/create', teamController.createTeam);

// Get my team
router.get('/my-team', teamController.getMyTeam);

// Get teams where I am mentor
router.get('/my-mentor-teams', teamController.getMyMentorTeams);

// Search teams
router.get('/search', teamController.searchTeams);

// Get team by ID or teamId
router.get('/:id', teamController.getTeamById);

// Request to join team
router.post('/:teamId/request-join', teamController.requestToJoin);

// Approve join request (leader only)
router.post('/:teamId/approve-request/:requestId', teamController.approveJoinRequest);

// Reject join request (leader only)
router.post('/:teamId/reject-request/:requestId', teamController.rejectJoinRequest);

// Invite member by email (leader only)
router.post('/:teamId/invite', teamController.inviteMember);

// Cancel invitation (leader only)
router.delete('/:teamId/invitation/:invitationId', teamController.cancelInvitation);

// Update team details (leader only)
router.put('/:teamId/update', teamController.updateTeamDetails);

// Change team leader (leader only)
router.post('/:teamId/change-leader', teamController.changeLeader);

// Leave team
router.post('/:teamId/leave', teamController.leaveTeam);

// Delete team (leader only)
router.delete('/:teamId/delete', teamController.deleteTeam);

// Assign mentor to team (admin/super admin only)
router.post('/:teamId/assign-mentor', teamController.assignMentor);

// Remove mentor from team (admin/super admin only)
router.delete('/:teamId/remove-mentor', teamController.removeMentor);

// Random distribute mentors to teams (admin/super admin only)
router.post('/distribute-mentors/random', teamController.randomDistributeMentors);

// Team discussion routes
router.get('/:teamId/discussions', teamController.getTeamDiscussions);
router.post('/discussions/send', upload.array('attachments', 5), teamController.sendDiscussionMessage);
router.put('/discussions/:messageId', teamController.editDiscussionMessage);
router.delete('/discussions/:messageId', teamController.deleteDiscussionMessage);
router.post('/:teamId/discussions/mark-read', teamController.markMessagesAsRead);

module.exports = router;
