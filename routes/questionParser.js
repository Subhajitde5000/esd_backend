const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parseQuestionPaper } = require('../utils/questionParser');
const { protect } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Word, PDF, and text files
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.match(/\.(pdf|doc|docx|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word (.doc, .docx), and Text files are allowed'));
    }
  }
});

/**
 * @route   POST /api/question-parser/parse
 * @desc    Parse question paper from uploaded file
 * @access  Private (Mentor, Admin)
 */
router.post('/parse', protect, upload.single('file'), async (req, res) => {
  try {
    // Check user role
    if (!['mentor', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only mentors and admins can upload question papers' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please upload a file' 
      });
    }

    console.log(`📤 Parsing question paper: ${req.file.originalname}`);
    console.log(`📊 File size: ${req.file.size} bytes`);
    console.log(`📋 MIME type: ${req.file.mimetype}`);

    // Parse the question paper
    const result = await parseQuestionPaper(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    if (result.success) {
      console.log(`✅ Successfully parsed ${result.validCount} questions from ${req.file.originalname}`);
      
      return res.status(200).json({
        success: true,
        message: `Successfully extracted ${result.validCount} questions`,
        data: {
          questions: result.questions,
          invalidQuestions: result.invalidQuestions,
          stats: {
            totalFound: result.totalFound,
            validCount: result.validCount,
            invalidCount: result.invalidCount
          },
          metadata: result.metadata
        }
      });
    } else {
      console.log(`❌ Failed to parse ${req.file.originalname}: ${result.error}`);
      
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to parse question paper',
        data: {
          questions: [],
          invalidQuestions: []
        }
      });
    }

  } catch (error) {
    console.error('❌ Question parser route error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to parse question paper',
      error: error.toString(),
      data: {
        questions: [],
        invalidQuestions: []
      }
    });
  }
});

/**
 * @route   POST /api/question-parser/validate
 * @desc    Validate questions array
 * @access  Private (Mentor, Admin)
 */
router.post('/validate', protect, async (req, res) => {
  try {
    if (!['mentor', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only mentors and admins can validate questions' 
      });
    }

    const { questions } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a questions array' 
      });
    }

    const { validateQuestions } = require('../utils/questionParser');
    const { validQuestions, invalidQuestions } = validateQuestions(questions);

    res.status(200).json({
      success: true,
      data: {
        validQuestions,
        invalidQuestions,
        stats: {
          total: questions.length,
          valid: validQuestions.length,
          invalid: invalidQuestions.length
        }
      }
    });

  } catch (error) {
    console.error('Question validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate questions'
    });
  }
});

module.exports = router;
