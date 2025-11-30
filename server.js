require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Make io accessible to routes
app.set('io', io);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to attach io to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Join user's personal room
  socket.on('join-user-room', (userId) => {
    socket.join(userId);
    console.log(`👤 User ${userId} joined personal room`);
  });

  // Join admin room
  socket.on('join-admin', (userId) => {
    socket.join('admin-room');
    console.log(`👤 Admin ${userId} joined admin room`);
  });

  // Join super admin room
  socket.on('join-super-admin', (userId) => {
    socket.join('super-admin-room');
    console.log(`👤 Super Admin ${userId} joined super admin room`);
  });

  // Join team room
  socket.on('join-team', (teamId) => {
    socket.join(`team-${teamId}`);
    console.log(`🏢 User joined team room: team-${teamId}`);
  });

  // Leave team room
  socket.on('leave-team', (teamId) => {
    socket.leave(`team-${teamId}`);
    console.log(`🚪 User left team room: team-${teamId}`);
  });

  // Join community room
  socket.on('join-community', (communityId) => {
    socket.join(`community-${communityId}`);
    console.log(`💬 User ${socket.id} joined community room: community-${communityId}`);
  });

  // Leave community room
  socket.on('leave-community', (communityId) => {
    socket.leave(`community-${communityId}`);
    console.log(`🚪 User ${socket.id} left community room: community-${communityId}`);
  });

  // Typing indicator
  socket.on('typing-start', ({ communityId, userId, userName }) => {
    socket.to(`community-${communityId}`).emit('user-typing', { userId, userName });
  });

  socket.on('typing-stop', ({ communityId, userId }) => {
    socket.to(`community-${communityId}`).emit('user-stopped-typing', { userId });
  });

  // Milestone events
  socket.on('join-milestone-room', (chainId) => {
    socket.join(`milestone-chain-${chainId}`);
    console.log(`📋 User ${socket.id} joined milestone chain room: ${chainId}`);
  });

  socket.on('leave-milestone-room', (chainId) => {
    socket.leave(`milestone-chain-${chainId}`);
    console.log(`📋 User ${socket.id} left milestone chain room: ${chainId}`);
  });

  // Event rooms
  socket.on('join-event-room', (eventId) => {
    socket.join(`event-${eventId}`);
    console.log(`📅 User ${socket.id} joined event room: event-${eventId}`);
  });

  socket.on('leave-event-room', (eventId) => {
    socket.leave(`event-${eventId}`);
    console.log(`📅 User ${socket.id} left event room: event-${eventId}`);
  });

  // Event management rooms (for admins)
  socket.on('join-events-management', (userId) => {
    socket.join('events-management');
    console.log(`📅 User ${userId} joined events management room`);
  });

  socket.on('leave-events-management', () => {
    socket.leave('events-management');
    console.log(`📅 User left events management room`);
  });

  // Exam schedule rooms
  socket.on('join-exam-management', (userId) => {
    socket.join('exam-management');
    console.log(`📝 User ${userId} joined exam management room`);
  });

  socket.on('leave-exam-management', () => {
    socket.leave('exam-management');
    console.log(`📝 User left exam management room`);
  });

  socket.on('join-mentor-exams', (mentorId) => {
    socket.join(`mentor-${mentorId}`);
    console.log(`📝 Mentor ${mentorId} joined their exam room`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/mentor', require('./routes/mentor'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/forum', require('./routes/forum'));
app.use('/api/team', require('./routes/team'));
app.use('/api/resource', require('./routes/resource'));
app.use('/api/community', require('./routes/community'));
app.use('/api/message', require('./routes/message'));
app.use('/api/milestone-chain', require('./routes/milestoneChain'));
app.use('/api/milestone', require('./routes/milestone'));
app.use('/api/student-milestone', require('./routes/studentMilestone'));
app.use('/api/events', require('./routes/event'));
app.use('/api/exam-schedules', require('./routes/examSchedule'));
app.use('/api/course-syllabus', require('./routes/courseSyllabus'));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ESDC Platform API is running',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`⚡ Socket.IO enabled for real-time updates`);
});
