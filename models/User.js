const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Don't return password by default
  },
  
  // Role-based access
  role: {
    type: String,
    enum: ['student', 'mentor', 'admin', 'super_admin'],
    default: 'student',
    required: true,
  },
  
  // Personal Details
  dob: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', ''],
  },
  
  // Student/Member specific fields
  department: {
    type: String,
    trim: true,
  },
  section: {
    type: String,
    trim: true,
  },
  idNumber: {
    type: String,
    trim: true,
  },
  year: {
    type: String,
    trim: true,
  },
  semester: {
    type: String,
    trim: true,
  },
  college: {
    type: String,
    trim: true,
  },
  
  // Mentor specific fields
  expertise: {
    type: String,
    trim: true,
  },
  organization: {
    type: String,
    trim: true,
  },
  experienceYears: {
    type: Number,
  },
  experience: {
    type: String,
    trim: true,
  },
  
  // Common fields
  reason: {
    type: String,
  },
  photo: {
    type: String, // Cloudinary URL
  },
  
  // Account status
  isVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Approval status
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  
  // Last login tracking
  lastLogin: {
    type: Date,
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(error);
  }
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
