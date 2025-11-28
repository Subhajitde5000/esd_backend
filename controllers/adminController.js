const User = require('../models/User');
const { sendOTPEmail } = require('../utils/emailService');
const bcrypt = require('bcryptjs');

// @desc    Create new user by admin
// @route   POST /api/admin/create-user
// @access  Private (Admin, Super Admin)
exports.createUser = async (req, res) => {
  try {
    const { fullName, email, phone, role, college } = req.body;
    const adminRole = req.user.role;

    // Validate required fields (password not required - will use default)
    if (!fullName || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: fullName, email, and role',
      });
    }

    // Role-based permission check
    if (adminRole === 'admin') {
      // Admins can only create students and mentors
      if (!['student', 'mentor'].includes(role)) {
        return res.status(403).json({
          success: false,
          message: 'Admins can only create students and mentors',
        });
      }
    } else if (adminRole === 'super_admin') {
      // Super admins can create students, mentors, and admins
      if (!['student', 'mentor', 'admin'].includes(role)) {
        return res.status(403).json({
          success: false,
          message: 'Super admins can create students, mentors, and admins',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create users',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Generate unique phone if not provided
    let userPhone = phone;
    if (!userPhone) {
      // Generate a unique phone number using timestamp and random digits
      userPhone = `99${Date.now().toString().slice(-8)}`;
    }

    // Set default password to 111111
    const defaultPassword = '111111';

    // Note: Do NOT hash password here - let the User model's pre-save hook handle it
    // Prepare user data based on role
    const userData = {
      fullName,
      email,
      phone: userPhone,
      password: defaultPassword, // Default password - model will hash it
      role,
      college: college || req.body.college || '',
      approvalStatus: 'approved', // Auto-approve admin-created users
      isVerified: true,
    };

    // Add student-specific fields
    if (role === 'student') {
      userData.department = req.body.department || '';
      userData.section = req.body.section || '';
      userData.idNumber = req.body.idNumber || '';
      userData.year = req.body.year || '';
    }

    // Add mentor-specific fields
    if (role === 'mentor') {
      userData.expertise = req.body.expertise || '';
      userData.organization = req.body.organization || '';
      userData.experience = req.body.experience || '';
      userData.experienceYears = req.body.experienceYears || req.body.experience || 0;
    }

    // Create user
    const user = await User.create(userData);

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('user-created-by-admin', {
        userId: user._id,
        userName: user.fullName,
        role: user.role,
        createdBy: req.user.fullName,
      });
    }

    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully. Default password: 111111`,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        defaultPassword: '111111',
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message,
    });
  }
};

// @desc    Get all pending users for approval
// @route   GET /api/admin/pending-users
// @access  Private (Admin, Super Admin)
exports.getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find({ approvalStatus: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers,
    });
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending users',
      error: error.message,
    });
  }
};

// @desc    Get all users with filters
// @route   GET /api/admin/users
// @access  Private (Admin, Super Admin)
exports.getAllUsers = async (req, res) => {
  try {
    const { status, role, search } = req.query;
    
    let query = {};
    
    if (status && status !== 'all') {
      query.approvalStatus = status;
    }
    
    if (role && role !== 'all') {
      query.role = role;
    }
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

// @desc    Approve user
// @route   PUT /api/admin/approve-user/:id
// @access  Private (Admin, Super Admin)
exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.approvalStatus === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'User is already approved',
      });
    }

    // Update user approval status
    user.approvalStatus = 'approved';
    user.approvedBy = adminId;
    user.approvedAt = Date.now();
    user.isVerified = true;

    await user.save();

    // Send congratulations email
    await sendCongratulationEmail(user.email, user.fullName, user.role);

    // Emit real-time update to all admins
    const io = req.app.get('io');
    io.to('admin-room').emit('user-approved', {
      userId: user._id,
      userName: user.fullName,
      role: user.role,
      approvedBy: req.user.fullName,
    });
    io.to('super-admin-room').emit('user-approved', {
      userId: user._id,
      userName: user.fullName,
      role: user.role,
      approvedBy: req.user.fullName,
    });

    res.status(200).json({
      success: true,
      message: 'User approved successfully',
      data: user,
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving user',
      error: error.message,
    });
  }
};

// @desc    Reject user
// @route   PUT /api/admin/reject-user/:id
// @access  Private (Admin, Super Admin)
exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update user approval status
    user.approvalStatus = 'rejected';
    await user.save();

    // Emit real-time update to all admins
    const io = req.app.get('io');
    io.to('admin-room').emit('user-rejected', {
      userId: user._id,
      userName: user.fullName,
    });
    io.to('super-admin-room').emit('user-rejected', {
      userId: user._id,
      userName: user.fullName,
    });

    res.status(200).json({
      success: true,
      message: 'User rejected',
      data: user,
    });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting user',
      error: error.message,
    });
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin, Super Admin)
exports.getDashboardStats = async (req, res) => {
  try {
    const Team = require('../models/Team');
    const Event = require('../models/Event');
    const Resource = require('../models/Resource');
    const ForumPost = require('../models/ForumPost');
    const StudentMilestone = require('../models/StudentMilestone');

    // User statistics
    const totalUsers = await User.countDocuments();
    const pendingUsers = await User.countDocuments({ approvalStatus: 'pending' });
    const approvedUsers = await User.countDocuments({ approvalStatus: 'approved' });
    const rejectedUsers = await User.countDocuments({ approvalStatus: 'rejected' });
    
    const studentCount = await User.countDocuments({ role: 'student' });
    const mentorCount = await User.countDocuments({ role: 'mentor' });
    const adminCount = await User.countDocuments({ role: 'admin' });
    const facultyCount = mentorCount; // Faculty = mentors
    
    // Get recent signups (last 7 days and last 30 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSignups = await User.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo } 
    });
    const monthlySignups = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Team statistics
    const totalTeams = await Team.countDocuments();
    
    // Event statistics
    const totalEvents = await Event.countDocuments();
    const activeEvents = await Event.countDocuments({ 
      status: 'active',
      endDate: { $gte: new Date() }
    });
    const upcomingEvents = await Event.countDocuments({
      status: { $in: ['active', 'upcoming'] },
      startDate: { $gte: new Date() }
    });

    // Resource statistics
    const totalResources = await Resource.countDocuments();
    const recentResources = await Resource.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Forum statistics
    const totalForumPosts = await ForumPost.countDocuments();
    const recentForumPosts = await ForumPost.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Milestone statistics
    const pendingMilestones = await StudentMilestone.countDocuments({
      status: 'submitted',
      gradingStatus: 'pending'
    });

    // Get recent user registrations (last 5)
    const recentUsers = await User.find({ approvalStatus: 'pending' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('fullName email role createdAt profileImage');

    // Calculate growth percentages
    const lastMonthUsers = await User.countDocuments({
      createdAt: { $lt: thirtyDaysAgo }
    });
    const userGrowthPercentage = lastMonthUsers > 0 
      ? ((monthlySignups / lastMonthUsers) * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        // User stats
        totalUsers,
        pendingUsers,
        approvedUsers,
        rejectedUsers,
        studentCount,
        mentorCount,
        adminCount,
        facultyCount,
        recentSignups,
        monthlySignups,
        userGrowthPercentage,
        
        // Team stats
        totalTeams,
        
        // Event stats
        totalEvents,
        activeEvents,
        upcomingEvents,
        
        // Resource stats
        totalResources,
        recentResources,
        
        // Forum stats
        totalForumPosts,
        recentForumPosts,
        
        // Milestone stats
        pendingMilestones,
        
        // Recent users
        recentUsers,
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message,
    });
  }
};

// Helper function to send congratulation email
const sendCongratulationEmail = async (email, fullName, role) => {
  const nodemailer = require('nodemailer');
  
  try {
    // If email credentials are not configured, just log
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('\n🎉 ========== CONGRATULATIONS EMAIL (DEV MODE) ==========');
      console.log(`To: ${email}`);
      console.log(`Subject: Welcome to ESDC Platform!`);
      console.log(`User: ${fullName} (${role})`);
      console.log('========================================================\n');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || `"ESDC Platform" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🎉 Congratulations! Your Account Has Been Approved',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .welcome-box { background: white; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; }
            .cta-button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to ESDC Platform!</h1>
              <p>Your account has been approved</p>
            </div>
            <div class="content">
              <h2>Congratulations, ${fullName}! 🎊</h2>
              <p>We're excited to inform you that your registration as a <strong>${role}</strong> has been approved!</p>
              
              <div class="welcome-box">
                <h3>✨ What's Next?</h3>
                <ul>
                  <li>Login to your dashboard with your credentials</li>
                  <li>Complete your profile information</li>
                  <li>Explore events, resources, and community features</li>
                  <li>Connect with mentors and fellow members</li>
                </ul>
              </div>
              
              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="cta-button">
                  Login to Your Dashboard
                </a>
              </div>
              
              <p>If you have any questions or need assistance, feel free to reach out to our support team.</p>
              
              <p>Welcome aboard!</p>
              <p><strong>The ESDC Team</strong></p>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} ESDC Platform. All rights reserved.</p>
                <p>This is an automated email. Please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Congratulations ${fullName}!
        
        Your registration as a ${role} has been approved!
        
        You can now login to your dashboard at: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login
        
        Welcome to ESDC Platform!
        
        © ${new Date().getFullYear()} ESDC Platform
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Congratulations email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending congratulations email:', error.message);
    // Don't throw error - approval should succeed even if email fails
  }
};

// @desc    Reset user password to default
// @route   PUT /api/admin/reset-password/:id
// @access  Private (Admin, Super Admin)
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Set default password
    const defaultPassword = '111111';
    user.password = defaultPassword;
    await user.save(); // Pre-save hook will hash the password

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      defaultPassword: defaultPassword,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message,
    });
  }
};

// @desc    Update user role
// @route   PUT /api/admin/change-role/:id
// @access  Private (Admin, Super Admin)
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required',
      });
    }

    const validRoles = ['student', 'mentor', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role',
      });
    }

    // Only super_admin can assign admin role
    if (role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admins can assign admin role',
      });
    }

    // Prevent creating super_admin through this endpoint
    if (role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot assign super admin role through this endpoint',
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent changing super_admin role
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify super admin role',
      });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: user,
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user role',
      error: error.message,
    });
  }
};

// @desc    Deactivate user account
// @route   PUT /api/admin/deactivate/:id
// @access  Private (Admin, Super Admin)
exports.deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent deactivating super_admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate super admin account',
      });
    }

    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User account deactivated successfully',
      data: user,
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating user',
      error: error.message,
    });
  }
};

// @desc    Toggle user account status
// @route   PUT /api/admin/toggle-status/:id
// @access  Private (Admin, Super Admin)
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent toggling super_admin status
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify super admin account status',
      });
    }

    // Toggle the isActive status
    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User account ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: user,
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling user status',
      error: error.message,
    });
  }
};

// @desc    Delete user account
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin, Super Admin)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent deleting super_admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete super admin account',
      });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'User account deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message,
    });
  }
};

