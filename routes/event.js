const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  registerForEvent,
  unregisterFromEvent,
  markAttendance,
  submitFeedback,
  getEventAnalytics,
  getMyRegisteredEvents
} = require('../controllers/eventController');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'event-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Public routes
router.get('/', getAllEvents);
router.get('/:id', getEventById);

// Protected routes - All authenticated users
router.use(protect);

// Student routes
router.get('/my/registrations', getMyRegisteredEvents);
router.post('/:id/register', registerForEvent);
router.delete('/:id/register', unregisterFromEvent);
router.post('/:id/feedback', submitFeedback);

// Admin and Super Admin routes
router.post('/', authorize('admin', 'super_admin'), upload.single('image'), createEvent);
router.put('/:id', authorize('admin', 'super_admin'), upload.single('image'), updateEvent);
router.delete('/:id', authorize('admin', 'super_admin'), deleteEvent);
router.put('/:id/attendance', authorize('admin', 'super_admin'), markAttendance);

// Analytics routes - Admin, Super Admin, Mentor
router.get('/:id/analytics', authorize('admin', 'super_admin', 'mentor'), getEventAnalytics);

module.exports = router;
