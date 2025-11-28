const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user (Signup)
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
      dob,
      gender,
      department,
      section,
      idNumber,
      year,
      semester,
      expertise,
      organization,
      experienceYears,
      experience,
      reason,
      role,
      college,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists',
      });
    }

    // Validate role for signup (only student and mentor allowed)
    if (role && !['student', 'mentor'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Only student and mentor roles are allowed for signup',
      });
    }

    // Handle photo upload if present
    let photoUrl = null;
    if (req.file) {
      photoUrl = req.file.path; // Cloudinary URL
    }

    // Prepare user data
    const userData = {
      fullName,
      email,
      phone,
      password,
      dob,
      gender,
      reason,
      photo: photoUrl,
      role: role || 'student', // Default to student if not provided
      approvalStatus: 'pending', // New users need admin approval
      isVerified: true, // OTP already verified
      college: college || '',
    };

    // Add student-specific fields
    if (role === 'student' || !role) {
      userData.department = department || '';
      userData.section = section || '';
      userData.idNumber = idNumber || '';
      userData.year = year || '';
      userData.semester = semester || '';
    }

    // Add mentor-specific fields
    if (role === 'mentor') {
      userData.expertise = expertise || '';
      userData.organization = organization || '';
      userData.experienceYears = experienceYears || experience || 0;
      userData.experience = experience || '';
    }

    // Create new user
    const user = await User.create(userData);

    // Emit real-time notification to admins
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('new-user-signup', {
        userId: user._id,
        userName: user.fullName,
        userEmail: user.email,
        role: user.role,
        timestamp: new Date(),
      });
      io.to('super-admin-room').emit('new-user-signup', {
        userId: user._id,
        userName: user.fullName,
        userEmail: user.email,
        role: user.role,
        timestamp: new Date(),
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please wait for admin approval.',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          photo: user.photo,
          approvalStatus: user.approvalStatus,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number already exists',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { emailOrPhone, password, role } = req.body;

    console.log('Login attempt:', { emailOrPhone, role });

    // Validate input
    if (!emailOrPhone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/phone and password',
      });
    }

    // Find user by email or phone
    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    }).select('+password');

    if (!user) {
      console.log('User not found:', emailOrPhone);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    console.log('User found:', { email: user.email, role: user.role, approvalStatus: user.approvalStatus });

    // Check if account is active
    if (!user.isActive) {
      console.log('Account inactive:', user.email);
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact admin.',
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    console.log('Password valid:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('Invalid password for user:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Verify role if provided
    if (role && user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `You are not authorized to login as ${role}`,
      });
    }

    // Check approval status for students and mentors
    if ((user.role === 'student' || user.role === 'mentor') && user.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: user.approvalStatus === 'pending' 
          ? 'Your account is pending approval. Please wait for admin approval.'
          : 'Your account has been rejected. Please contact admin.',
        approvalStatus: user.approvalStatus,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          photo: user.photo,
          department: user.department,
          year: user.year,
          approvalStatus: user.approvalStatus,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message,
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
      error: error.message,
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    // In JWT, logout is handled client-side by removing the token
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging out',
      error: error.message,
    });
  }
};
