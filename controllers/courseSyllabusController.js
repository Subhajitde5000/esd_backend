const CourseSyllabus = require('../models/CourseSyllabus');
const { cloudinary } = require('../config/cloudinary');

// @desc    Upload course syllabus with file
// @route   POST /api/course-syllabus/upload
// @access  Admin, Super Admin
exports.uploadSyllabusWithFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file',
      });
    }

    const { title, description, academicYear, year, semester, type, tags } = req.body;

    // Deactivate previous syllabus for the same year
    await CourseSyllabus.updateMany(
      { year, academicYear },
      { isActive: false }
    );

    const syllabus = await CourseSyllabus.create({
      title,
      description,
      academicYear,
      year,
      semester,
      type: type || req.file.mimetype.split('/')[1].toUpperCase(),
      fileUrl: req.file.path,
      publicId: req.file.filename,
      size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      uploadedBy: req.user._id,
      uploaderRole: req.user.role,
      isActive: true,
    });

    await syllabus.populate('uploadedBy', 'fullName email');

    // Emit socket event
    if (req.io) {
      req.io.to('admin-room').emit('syllabus-uploaded', {
        syllabus,
        message: `New syllabus uploaded for Year ${year}`,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Course syllabus uploaded successfully',
      data: syllabus,
    });
  } catch (error) {
    console.error('Upload syllabus with file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading syllabus',
      error: error.message,
    });
  }
};

// @desc    Upload course syllabus (without file - deprecated)
// @route   POST /api/course-syllabus
// @access  Admin, Super Admin
exports.uploadSyllabus = async (req, res) => {
  try {
    const { title, description, academicYear, year, semester, type, fileUrl, publicId, size, tags } = req.body;

    // Deactivate previous syllabus for the same year
    await CourseSyllabus.updateMany(
      { year, academicYear },
      { isActive: false }
    );

    const syllabus = await CourseSyllabus.create({
      title,
      description,
      academicYear,
      year,
      semester,
      type,
      fileUrl,
      publicId,
      size,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      uploadedBy: req.user._id,
      uploaderRole: req.user.role,
      isActive: true,
    });

    await syllabus.populate('uploadedBy', 'fullName email');

    // Emit socket event
    req.io.to('admin-room').emit('syllabus-uploaded', {
      syllabus,
      message: `New syllabus uploaded for Year ${year}`,
    });

    res.status(201).json({
      success: true,
      message: 'Course syllabus uploaded successfully',
      data: syllabus,
    });
  } catch (error) {
    console.error('Upload syllabus error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading syllabus',
      error: error.message,
    });
  }
};

// @desc    Get active syllabus for a year
// @route   GET /api/course-syllabus/:year
// @access  Private
exports.getSyllabusByYear = async (req, res) => {
  try {
    let { year } = req.params;
    
    console.log('Fetching syllabus for year:', year);
    
    // Normalize year format (handle "1", "1st", "first" variations)
    const yearMap = {
      '1': '1st', 'first': '1st', 'i': '1st',
      '2': '2nd', 'second': '2nd', 'ii': '2nd',
      '3': '3rd', 'third': '3rd', 'iii': '3rd',
      '4': '4th', 'fourth': '4th', 'iv': '4th',
    };
    
    const normalizedYear = yearMap[year.toLowerCase()] || year;
    console.log('Normalized year:', normalizedYear);
    
    const syllabus = await CourseSyllabus.findOne({ 
      year: normalizedYear, 
      isActive: true 
    })
      .populate('uploadedBy', 'fullName email')
      .sort({ createdAt: -1 });

    if (!syllabus) {
      console.log('No syllabus found for year:', normalizedYear);
      return res.status(404).json({
        success: false,
        message: 'No active syllabus found for this year',
      });
    }

    console.log('Syllabus found:', syllabus.title);
    
    // Increment views
    await syllabus.incrementViews();

    res.status(200).json({
      success: true,
      syllabus: syllabus,
      data: syllabus,
    });
  } catch (error) {
    console.error('Get syllabus error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching syllabus',
      error: error.message,
    });
  }
};

// @desc    Get all syllabi (admin only)
// @route   GET /api/course-syllabus
// @access  Admin, Super Admin
exports.getAllSyllabi = async (req, res) => {
  try {
    const { year, academicYear, isActive } = req.query;
    
    const query = {};
    if (year) query.year = year;
    if (academicYear) query.academicYear = academicYear;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const syllabi = await CourseSyllabus.find(query)
      .populate('uploadedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: syllabi.length,
      data: syllabi,
    });
  } catch (error) {
    console.error('Get all syllabi error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching syllabi',
      error: error.message,
    });
  }
};

// @desc    Update syllabus
// @route   PUT /api/course-syllabus/:id
// @access  Admin, Super Admin
exports.updateSyllabus = async (req, res) => {
  try {
    const existingSyllabus = await CourseSyllabus.findById(req.params.id);

    if (!existingSyllabus) {
      return res.status(404).json({
        success: false,
        message: 'Syllabus not found',
      });
    }

    // Handle file replacement if new file is uploaded via this route
    // (Note: For file uploads, use uploadSyllabusWithFile instead)
    const updateData = { ...req.body };
    
    // If year or academicYear changed, deactivate other syllabi for new year
    if (updateData.year !== existingSyllabus.year || updateData.academicYear !== existingSyllabus.academicYear) {
      await CourseSyllabus.updateMany(
        { 
          year: updateData.year || existingSyllabus.year, 
          academicYear: updateData.academicYear || existingSyllabus.academicYear,
          _id: { $ne: req.params.id }
        },
        { isActive: false }
      );
    }

    const syllabus = await CourseSyllabus.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'fullName email');

    // Emit socket event
    if (req.io) {
      req.io.to('admin-room').emit('syllabus-updated', {
        syllabus,
        message: `Syllabus updated for Year ${syllabus.year}`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Syllabus updated successfully',
      data: syllabus,
      syllabus: syllabus,
    });
  } catch (error) {
    console.error('Update syllabus error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating syllabus',
      error: error.message,
    });
  }
};

// @desc    Delete syllabus
// @route   DELETE /api/course-syllabus/:id
// @access  Admin, Super Admin
exports.deleteSyllabus = async (req, res) => {
  try {
    const syllabus = await CourseSyllabus.findById(req.params.id);

    if (!syllabus) {
      return res.status(404).json({
        success: false,
        message: 'Syllabus not found',
      });
    }

    // Delete from Cloudinary if exists
    if (syllabus.publicId) {
      try {
        await cloudinary.uploader.destroy(syllabus.publicId);
      } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
      }
    }

    await syllabus.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Syllabus deleted successfully',
    });
  } catch (error) {
    console.error('Delete syllabus error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting syllabus',
      error: error.message,
    });
  }
};

// @desc    Increment syllabus downloads
// @route   PATCH /api/course-syllabus/:id/download
// @access  Private
exports.incrementDownloads = async (req, res) => {
  try {
    const syllabus = await CourseSyllabus.findById(req.params.id);

    if (!syllabus) {
      return res.status(404).json({
        success: false,
        message: 'Syllabus not found',
      });
    }

    await syllabus.incrementDownloads();

    res.status(200).json({
      success: true,
      message: 'Download count updated',
    });
  } catch (error) {
    console.error('Increment downloads error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating download count',
      error: error.message,
    });
  }
};
