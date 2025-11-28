require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

// Sample users for different roles
const sampleUsers = [
  // Students
  {
    fullName: 'Raj Kumar',
    email: 'raj.student@esdc.com',
    phone: '9876543210',
    password: '111111',
    role: 'student',
    department: 'Computer Science',
    section: 'SOF 1',
    idNumber: '241013007001',
    year: '3rd Year',
    semester: '5th Semester',
    gender: 'male',
    dob: new Date('2003-05-15'),
    reason: 'Want to learn entrepreneurship and build my own startup',
    college: 'TIG',
    isVerified: true,
    isActive: true,
    approvalStatus: 'approved',
  },
  {
    fullName: 'Priya Sharma',
    email: 'priya.student@esdc.com',
    phone: '9876543211',
    password: '111111',
    role: 'student',
    department: 'Electronics',
    section: 'SOF 2',
    idNumber: '241013007002',
    year: '2nd Year',
    semester: '4th Semester',
    gender: 'female',
    dob: new Date('2004-08-22'),
    reason: 'Interested in innovation and startup ecosystem',
    college: 'TIG',
    isVerified: true,
    isActive: true,
    approvalStatus: 'approved',
  },
  
  // Mentors
  {
    fullName: 'Dr. Amit Patel',
    email: 'amit.mentor@esdc.com',
    phone: '9876543212',
    password: '111111',
    role: 'mentor',
    expertise: 'Startup Strategy & Business Development',
    organization: 'Tech Innovations Pvt Ltd',
    experienceYears: 10,
    experience: '10',
    gender: 'male',
    reason: 'Want to guide young entrepreneurs and share my experience',
    college: 'TIG',
    isVerified: true,
    isActive: true,
    approvalStatus: 'approved',
  },
  {
    fullName: 'Sneha Reddy',
    email: 'sneha.mentor@esdc.com',
    phone: '9876543213',
    password: '111111',
    role: 'mentor',
    expertise: 'Digital Marketing & Brand Building',
    organization: 'Marketing Pro Solutions',
    experienceYears: 7,
    experience: '7',
    gender: 'female',
    reason: 'Passionate about mentoring students in marketing',
    college: 'TIG',
    isVerified: true,
    isActive: true,
    approvalStatus: 'approved',
  },
  
  // Admin
  {
    fullName: 'Admin User',
    email: 'admin@esdc.com',
    phone: '9876543214',
    password: '111111',
    role: 'admin',
    department: 'ESDC Team',
    gender: 'male',
    reason: 'Managing ESDC operations',
    college: 'TIG',
    isVerified: true,
    isActive: true,
    approvalStatus: 'approved',
  },
  
  // Super Admin
  {
    fullName: 'Super Admin',
    email: 'superadmin@esdc.com',
    phone: '9876543215',
    password: '111111',
    role: 'super_admin',
    department: 'ESDC Core Team',
    gender: 'male',
    reason: 'Overall platform management',
    college: 'TIG',
    isVerified: true,
    isActive: true,
    approvalStatus: 'approved',
  },
];

// Connect to MongoDB and seed data
const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // Clear existing users (optional - comment out if you want to keep existing data)
    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');

    // Hash passwords before inserting because insertMany bypasses mongoose pre-save hooks
    const hashedUsers = await Promise.all(sampleUsers.map(async (u) => {
      const hashed = await bcrypt.hash(u.password, 10);
      return { ...u, password: hashed };
    }));

    // Insert sample users
    const createdUsers = await User.insertMany(hashedUsers);
    console.log(`✅ ${createdUsers.length} demo users created successfully\n`);

    // Display created users
    console.log('📋 Demo User Credentials:\n');
    console.log('STUDENTS:');
    console.log('  Email: raj.student@esdc.com | Phone: 9876543210 | Password: 111111');
    console.log('  Email: priya.student@esdc.com | Phone: 9876543211 | Password: 111111\n');
    
    console.log('MENTORS:');
    console.log('  Email: amit.mentor@esdc.com | Phone: 9876543212 | Password: 111111');
    console.log('  Email: sneha.mentor@esdc.com | Phone: 9876543213 | Password: 111111\n');
    
    console.log('ADMIN:');
    console.log('  Email: admin@esdc.com | Phone: 9876543214 | Password: 111111\n');
    
    console.log('SUPER ADMIN:');
    console.log('  Email: superadmin@esdc.com | Phone: 9876543215 | Password: 111111\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run the seed function
seedDatabase();
