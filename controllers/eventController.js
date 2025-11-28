const Event = require('../models/Event');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');

// @desc    Create new event
// @route   POST /api/events
// @access  Admin, Super Admin
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      startTime,
      endTime,
      mode,
      venue,
      meetLink,
      category,
      maxParticipants,
      host,
      requirements
    } = req.body;

    // Validate required fields
    if (!title || !description || !date || !startTime || !endTime || !mode || !category || !maxParticipants || !host) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate mode-specific fields
    if (mode === 'offline' && !venue) {
      return res.status(400).json({
        success: false,
        message: 'Venue is required for offline events'
      });
    }

    if (mode === 'online' && !meetLink) {
      return res.status(400).json({
        success: false,
        message: 'Meeting link is required for online events'
      });
    }

    // Handle image upload if provided
    let imageData = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'events',
        resource_type: 'image'
      });
      imageData = {
        url: result.secure_url,
        publicId: result.public_id
      };
    }

    // Create event
    const event = await Event.create({
      title,
      description,
      date,
      startTime,
      endTime,
      mode,
      venue,
      meetLink,
      category,
      maxParticipants: parseInt(maxParticipants),
      image: imageData,
      host,
      requirements,
      createdBy: req.user._id,
      createdByRole: req.user.role
    });

    await event.populate('createdBy', 'name email');

    // Emit socket event for real-time update
    req.io.emit('event-created', {
      event,
      createdBy: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      }
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event
    });

  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating event',
      error: error.message
    });
  }
};

// @desc    Get all events
// @route   GET /api/events
// @access  Public
exports.getAllEvents = async (req, res) => {
  try {
    const {
      status,
      category,
      mode,
      search,
      startDate,
      endDate,
      createdBy
    } = req.query;

    // Build query
    let query = {};

    if (status) {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (mode) {
      query.mode = mode;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { host: { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Role-based filtering
    if (req.user) {
      if (req.user.role === 'admin' && createdBy === 'me') {
        // Admin can filter their own events
        query.createdBy = req.user._id;
      } else if (req.user.role === 'super_admin') {
        // Super admin can see all events
        if (createdBy && createdBy !== 'all') {
          query.createdBy = createdBy;
        }
      }
    }

    const events = await Event.find(query)
      .populate('createdBy', 'name email role')
      .populate('registrations.user', 'name email department year')
      .sort({ date: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: events.length,
      events
    });

  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
};

// @desc    Get single event
// @route   GET /api/events/:id
// @access  Public
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('registrations.user', 'name email department year');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      event
    });

  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching event',
      error: error.message
    });
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Admin (own events), Super Admin (all events)
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check permissions
    if (req.user.role === 'admin' && event.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own events'
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image from cloudinary if exists
      if (event.image && event.image.publicId) {
        await cloudinary.uploader.destroy(event.image.publicId);
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'events',
        resource_type: 'image'
      });

      req.body.image = {
        url: result.secure_url,
        publicId: result.public_id
      };
    }

    // Update event
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email role');

    // Emit socket event
    req.io.emit('event-updated', {
      event: updatedEvent,
      updatedBy: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      }
    });

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      event: updatedEvent
    });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating event',
      error: error.message
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Admin (own events), Super Admin (all events)
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check permissions
    if (req.user.role === 'admin' && event.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own events'
      });
    }

    // Delete image from cloudinary if exists
    if (event.image && event.image.publicId) {
      await cloudinary.uploader.destroy(event.image.publicId);
    }

    await event.deleteOne();

    // Emit socket event
    req.io.emit('event-deleted', {
      eventId: req.params.id,
      deletedBy: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      }
    });

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: error.message
    });
  }
};

// @desc    Register for event
// @route   POST /api/events/:id/register
// @access  Private (Students)
exports.registerForEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if already registered
    const alreadyRegistered = event.registrations.some(
      reg => reg.user.toString() === req.user._id.toString()
    );

    if (alreadyRegistered) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for this event'
      });
    }

    // Check if event is full
    if (event.registrations.length >= event.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Event is full'
      });
    }

    // Add registration
    event.registrations.push({
      user: req.user._id,
      registeredAt: new Date()
    });

    await event.save();
    await event.populate('registrations.user', 'name email department year');

    // Emit socket event
    req.io.emit('event-registration', {
      eventId: event._id,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email
      },
      totalRegistrations: event.registrations.length
    });

    res.status(200).json({
      success: true,
      message: 'Successfully registered for event',
      event
    });

  } catch (error) {
    console.error('Register event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering for event',
      error: error.message
    });
  }
};

// @desc    Unregister from event
// @route   DELETE /api/events/:id/register
// @access  Private (Students)
exports.unregisterFromEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Remove registration
    event.registrations = event.registrations.filter(
      reg => reg.user.toString() !== req.user._id.toString()
    );

    await event.save();

    // Emit socket event
    req.io.emit('event-unregistration', {
      eventId: event._id,
      userId: req.user._id,
      totalRegistrations: event.registrations.length
    });

    res.status(200).json({
      success: true,
      message: 'Successfully unregistered from event'
    });

  } catch (error) {
    console.error('Unregister event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error unregistering from event',
      error: error.message
    });
  }
};

// @desc    Mark attendance
// @route   PUT /api/events/:id/attendance
// @access  Admin, Super Admin
exports.markAttendance = async (req, res) => {
  try {
    const { userId, attended, joinTime, leaveTime, duration } = req.body;

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Find registration
    const registration = event.registrations.find(
      reg => reg.user.toString() === userId
    );

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'User not registered for this event'
      });
    }

    // Update attendance
    registration.attended = attended;
    if (joinTime) registration.joinTime = new Date(joinTime);
    if (leaveTime) registration.leaveTime = new Date(leaveTime);
    if (duration) registration.duration = duration;

    await event.save();

    // Emit socket event
    req.io.emit('attendance-marked', {
      eventId: event._id,
      userId,
      attended
    });

    res.status(200).json({
      success: true,
      message: 'Attendance marked successfully',
      event
    });

  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking attendance',
      error: error.message
    });
  }
};

// @desc    Submit feedback
// @route   POST /api/events/:id/feedback
// @access  Private (Students who attended)
exports.submitFeedback = async (req, res) => {
  try {
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid rating (1-5)'
      });
    }

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Find registration
    const registration = event.registrations.find(
      reg => reg.user.toString() === req.user._id.toString()
    );

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'You are not registered for this event'
      });
    }

    if (!registration.attended) {
      return res.status(400).json({
        success: false,
        message: 'You must attend the event to submit feedback'
      });
    }

    // Update feedback
    registration.rating = rating;
    registration.feedback = feedback;

    await event.save();

    res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting feedback',
      error: error.message
    });
  }
};

// @desc    Get event analytics
// @route   GET /api/events/:id/analytics
// @access  Admin (own events), Super Admin (all events), Mentors (all events)
exports.getEventAnalytics = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('registrations.user', 'name email department year');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check permissions
    if (req.user.role === 'admin' && event.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only view analytics for your own events'
      });
    }

    res.status(200).json({
      success: true,
      analytics: event.analytics,
      registrations: event.registrations
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
};

// @desc    Get my registered events
// @route   GET /api/events/my/registrations
// @access  Private (Students)
exports.getMyRegisteredEvents = async (req, res) => {
  try {
    const events = await Event.find({
      'registrations.user': req.user._id
    })
      .populate('createdBy', 'name email role')
      .sort({ date: 1 });

    res.status(200).json({
      success: true,
      count: events.length,
      events
    });

  } catch (error) {
    console.error('Get registered events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching registered events',
      error: error.message
    });
  }
};
