const Attendance = require('../models/Attendance');
const User = require('../models/User');

// @desc    Mark attendance (bulk or single)
// @route   POST /api/attendance/mark
// @access  Mentor, Admin, Super Admin
exports.markAttendance = async (req, res) => {
  try {
    const { attendanceData } = req.body; // Array of {studentId, status, subject, remarks, date}
    const markedBy = req.user._id;
    const markedByName = req.user.fullName;
    const markedByRole = req.user.role;

    if (!attendanceData || !Array.isArray(attendanceData) || attendanceData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Attendance data is required and must be an array',
      });
    }

    // Validate date is not in future (mentors only, admins can mark future)
    const attendanceDate = new Date(attendanceData[0].date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (markedByRole === 'mentor' && attendanceDate > today) {
      return res.status(400).json({
        success: false,
        message: 'Mentors cannot mark attendance for future dates',
      });
    }

    const attendanceRecords = [];
    const errors = [];

    for (const record of attendanceData) {
      try {
        const student = await User.findById(record.studentId);
        
        if (!student) {
          errors.push({ studentId: record.studentId, error: 'Student not found' });
          continue;
        }

        // Check if attendance already exists for this date
        const existingAttendance = await Attendance.findOne({
          student: record.studentId,
          date: {
            $gte: new Date(record.date).setHours(0, 0, 0, 0),
            $lt: new Date(record.date).setHours(23, 59, 59, 999),
          },
        });

        if (existingAttendance) {
          // Update existing attendance
          const previousStatus = existingAttendance.status;
          existingAttendance.status = record.status;
          existingAttendance.subject = record.subject || existingAttendance.subject;
          existingAttendance.remarks = record.remarks || existingAttendance.remarks;
          existingAttendance.addModification(
            markedBy,
            previousStatus,
            record.status,
            record.remarks || 'Status updated'
          );
          await existingAttendance.save();
          attendanceRecords.push(existingAttendance);
        } else {
          // Create new attendance record
          const attendance = await Attendance.create({
            student: record.studentId,
            studentName: student.fullName,
            rollNo: student.idNumber || 'N/A',
            date: record.date,
            status: record.status,
            subject: record.subject || '',
            department: student.department || 'General',
            section: student.section || 'A',
            year: student.year || '1',
            markedBy,
            markedByName,
            markedByRole,
            remarks: record.remarks || '',
          });
          attendanceRecords.push(attendance);
        }
      } catch (error) {
        errors.push({ studentId: record.studentId, error: error.message });
      }
    }

    // Emit socket event
    if (req.io) {
      req.io.to('attendance-room').emit('attendance-marked', {
        date: attendanceData[0].date,
        markedBy: markedByName,
        count: attendanceRecords.length,
      });

      // Notify each student
      attendanceRecords.forEach(record => {
        req.io.to(record.student.toString()).emit('attendance-updated', {
          date: record.date,
          status: record.status,
          subject: record.subject,
        });
      });
    }

    res.status(201).json({
      success: true,
      message: `Attendance marked for ${attendanceRecords.length} student(s)`,
      data: attendanceRecords,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Mark Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark attendance',
      error: error.message,
    });
  }
};

// @desc    Get attendance for a specific student
// @route   GET /api/attendance/student/:studentId
// @access  Student (own), Mentor, Admin, Super Admin
exports.getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate, subject } = req.query;

    // Authorization: students can only view their own attendance
    if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own attendance',
      });
    }

    const query = { student: studentId };

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Subject filter
    if (subject) {
      query.subject = subject;
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .populate('markedBy', 'fullName role');

    // Calculate statistics
    const totalClasses = attendance.length;
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;
    const lateCount = attendance.filter(a => a.status === 'late').length;
    const attendancePercentage = totalClasses > 0 ? ((presentCount + lateCount) / totalClasses * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        attendance,
        statistics: {
          totalClasses,
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          percentage: parseFloat(attendancePercentage),
        },
      },
    });
  } catch (error) {
    console.error('Get Student Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error.message,
    });
  }
};

// @desc    Get my attendance (for logged-in student)
// @route   GET /api/attendance/my-attendance
// @access  Student
exports.getMyAttendance = async (req, res) => {
  try {
    req.params.studentId = req.user._id.toString();
    return exports.getStudentAttendance(req, res);
  } catch (error) {
    console.error('Get My Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your attendance',
      error: error.message,
    });
  }
};

// @desc    Get attendance by date with filters
// @route   GET /api/attendance/date
// @access  Mentor, Admin, Super Admin
exports.getAttendanceByDate = async (req, res) => {
  try {
    const { date, department, section, year, subject } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
      });
    }

    const query = {
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0),
        $lt: new Date(date).setHours(23, 59, 59, 999),
      },
    };

    if (department) query.department = department;
    if (section) query.section = section;
    if (year) query.year = year;
    if (subject) query.subject = subject;

    const attendance = await Attendance.find(query)
      .populate('student', 'fullName email idNumber')
      .populate('markedBy', 'fullName role')
      .sort({ studentName: 1 });

    // Calculate summary
    const summary = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'present').length,
      absent: attendance.filter(a => a.status === 'absent').length,
      late: attendance.filter(a => a.status === 'late').length,
    };

    res.status(200).json({
      success: true,
      data: {
        attendance,
        summary,
        filters: { date, department, section, year, subject },
      },
    });
  } catch (error) {
    console.error('Get Attendance By Date Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error.message,
    });
  }
};

// @desc    Get attendance report with filters
// @route   GET /api/attendance/report
// @access  Mentor, Admin, Super Admin
exports.getAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate, department, section, year, studentIds } = req.query;

    const query = {};

    // Date range
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Filters
    if (department) query.department = department;
    if (section) query.section = section;
    if (year) query.year = year;
    if (studentIds) {
      const studentIdArray = studentIds.split(',');
      query.student = { $in: studentIdArray };
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'fullName email idNumber department section year')
      .populate('markedBy', 'fullName role')
      .sort({ date: -1, studentName: 1 });

    // Group by student for summary
    const studentSummary = {};
    attendance.forEach(record => {
      const studentId = record.student._id.toString();
      if (!studentSummary[studentId]) {
        studentSummary[studentId] = {
          student: record.student,
          totalClasses: 0,
          present: 0,
          absent: 0,
          late: 0,
        };
      }
      studentSummary[studentId].totalClasses++;
      studentSummary[studentId][record.status]++;
    });

    // Calculate percentages
    const summaryArray = Object.values(studentSummary).map(s => ({
      ...s,
      percentage: s.totalClasses > 0 ? ((s.present + s.late) / s.totalClasses * 100).toFixed(2) : 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        attendance,
        summary: summaryArray,
        filters: { startDate, endDate, department, section, year },
      },
    });
  } catch (error) {
    console.error('Get Attendance Report Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate attendance report',
      error: error.message,
    });
  }
};

// @desc    Update attendance record
// @route   PUT /api/attendance/:id
// @access  Admin, Super Admin only
exports.updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, subject, remarks } = req.body;

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    const previousStatus = attendance.status;

    // Update fields
    if (status) attendance.status = status;
    if (subject) attendance.subject = subject;
    if (remarks) attendance.remarks = remarks;

    // Add modification history
    attendance.addModification(
      req.user._id,
      previousStatus,
      status,
      remarks || 'Record updated by admin'
    );

    await attendance.save();

    // Emit socket event
    if (req.io) {
      req.io.to(attendance.student.toString()).emit('attendance-updated', {
        date: attendance.date,
        status: attendance.status,
        subject: attendance.subject,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance updated successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Update Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update attendance',
      error: error.message,
    });
  }
};

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Admin, Super Admin only
exports.deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByIdAndDelete(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (error) {
    console.error('Delete Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete attendance',
      error: error.message,
    });
  }
};

// @desc    Export attendance to Excel
// @route   GET /api/attendance/export
// @access  Mentor, Admin, Super Admin
exports.exportAttendance = async (req, res) => {
  try {
    const { startDate, endDate, department, section, year, studentIds, format = 'summary' } = req.query;

    const query = {};

    // Date range
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Filters
    if (department) query.department = department;
    if (section) query.section = section;
    if (year) query.year = year;
    if (studentIds) {
      const studentIdArray = studentIds.split(',');
      query.student = { $in: studentIdArray };
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'fullName email idNumber department section year')
      .sort({ date: -1, studentName: 1 });

    if (format === 'detailed') {
      // Detailed format: one row per attendance record
      const data = attendance.map(record => ({
        Date: new Date(record.date).toLocaleDateString(),
        'Student Name': record.studentName,
        'Roll No': record.rollNo,
        Department: record.department,
        Section: record.section,
        Year: record.year,
        Subject: record.subject || 'N/A',
        Status: record.status.toUpperCase(),
        'Marked By': record.markedByName,
        Remarks: record.remarks || '',
      }));

      res.status(200).json({
        success: true,
        data,
        filename: `attendance-detailed-${Date.now()}.xlsx`,
      });
    } else {
      // Summary format: one row per student with statistics
      const studentSummary = {};
      attendance.forEach(record => {
        const studentId = record.student._id.toString();
        if (!studentSummary[studentId]) {
          studentSummary[studentId] = {
            'Student Name': record.studentName,
            'Roll No': record.rollNo,
            Department: record.department,
            Section: record.section,
            Year: record.year,
            'Total Classes': 0,
            Present: 0,
            Absent: 0,
            Late: 0,
            'Attendance %': 0,
          };
        }
        studentSummary[studentId]['Total Classes']++;
        studentSummary[studentId][record.status.charAt(0).toUpperCase() + record.status.slice(1)]++;
      });

      // Calculate percentages
      const data = Object.values(studentSummary).map(s => {
        const percentage = s['Total Classes'] > 0
          ? (((s.Present + s.Late) / s['Total Classes']) * 100).toFixed(2)
          : 0;
        return { ...s, 'Attendance %': percentage };
      });

      res.status(200).json({
        success: true,
        data,
        filename: `attendance-summary-${Date.now()}.xlsx`,
      });
    }
  } catch (error) {
    console.error('Export Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export attendance',
      error: error.message,
    });
  }
};

// @desc    Get students for attendance marking
// @route   GET /api/attendance/students
// @access  Mentor, Admin, Super Admin
exports.getStudentsForAttendance = async (req, res) => {
  try {
    const { department, section, year } = req.query;

    const query = { role: 'student', isActive: true, approvalStatus: 'approved' };

    if (department) query.department = department;
    if (section) query.section = section;
    if (year) query.year = year;

    const students = await User.find(query)
      .select('fullName email idNumber department section year')
      .sort({ fullName: 1 });

    res.status(200).json({
      success: true,
      data: students,
      count: students.length,
    });
  } catch (error) {
    console.error('Get Students Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message,
    });
  }
};
