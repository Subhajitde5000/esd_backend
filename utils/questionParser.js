const { GoogleGenerativeAI } = require('@google/generative-ai');

// Try to load optional dependencies
let mammoth, pdfParse;
try {
  mammoth = require('mammoth');
  console.log('✅ mammoth package loaded');
} catch (e) {
  console.warn('⚠️ mammoth package not installed - Word files will not be supported');
}
try {
  pdfParse = require('pdf-parse');
  console.log('✅ pdf-parse package loaded');
} catch (e) {
  console.warn('⚠️ pdf-parse package not installed - PDF files will not be supported');
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-pro';

/**
 * Extract text from different file formats
 */
const extractTextFromFile = async (fileBuffer, mimeType, fileName) => {
  try {
    console.log(`📄 Extracting text from: ${fileName} (${mimeType})`);
    
    // Handle plain text files
    if (mimeType.includes('text') || fileName.endsWith('.txt')) {
      const text = fileBuffer.toString('utf-8');
      console.log(`✅ Extracted ${text.length} characters from text file`);
      return text;
    }
    
    // Handle Word documents
    if ((mimeType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) && mammoth) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log(`✅ Extracted ${result.value.length} characters from Word file`);
      return result.value;
    } else if (mimeType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      throw new Error('Word file support requires mammoth package. Please install: npm install mammoth');
    }
    
    // Handle PDF files
    if ((mimeType.includes('pdf') || fileName.endsWith('.pdf')) && pdfParse) {
      const data = await pdfParse(fileBuffer);
      console.log(`✅ Extracted ${data.text.length} characters from PDF file`);
      return data.text;
    } else if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
      throw new Error('PDF file support requires pdf-parse package. Please install: npm install pdf-parse');
    }
    
    throw new Error('Unsupported file format. Supported: .txt, .docx, .doc, .pdf');
    
  } catch (error) {
    console.error('❌ Text extraction error:', error.message);
    throw error;
  }
};

/**
 * Parse questions using Gemini AI
 */
const parseQuestionsWithAI = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `You are an advanced AI question paper parser with expertise in educational assessment. Extract ALL questions with high accuracy.

🎯 EXTRACTION CAPABILITIES:
1. **Smart Question Detection**: Find all questions regardless of format (1., Q1, Question 1, a), bullet points, etc.)
2. **Intelligent Type Recognition**:
   - multiple-choice: 2+ options with labels (A/B/C/D, 1/2/3/4, etc.)
   - true-false: Yes/No, True/False questions
   - short-answer: Brief text responses (1-3 sentences)
   - essay: Detailed explanations or analysis
   - fill-in-the-blank: Questions with blanks or "_____"
   - coding: Programming questions
   - matching: Match items between lists

3. **Advanced Answer Detection**:
   - Marked answers: *, ✓, ✔, (correct), [ANSWER]
   - Answer keys at end of document
   - Inline answers: "Answer: B", "Ans: True"
   - Bold/underlined correct options

4. **Metadata Extraction**:
   - Points/marks: "5 marks", "10 points", "[2]"
   - Difficulty: easy/medium/hard if mentioned
   - Topics/tags if identifiable
   - Time limits for questions

5. **Smart Cleaning**:
   - Remove numbering from question text
   - Normalize option labels to A/B/C/D
   - Fix OCR errors and typos
   - Preserve formulas, code, special characters

OUTPUT (JSON only):
[
  {
    "question": "Clean question without numbering",
    "type": "multiple-choice|true-false|short-answer|essay|fill-in-the-blank|coding|matching",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Exact option text",
    "points": 1,
    "explanation": "Solution/hints if provided",
    "difficulty": "easy|medium|hard",
    "topic": "Subject if identifiable"
  }
]

PROCESSING RULES:
- MCQ: Extract all options, normalize to A/B/C/D format
- True/False: Use ["True", "False"] as options
- Short Answer: Empty options array
- Essay: Include rubric in explanation
- Coding: Preserve code formatting
- No answer found: use ""
- No points specified: default to 1

TEXT TO PARSE:
${text}

Return ONLY valid JSON array, no markdown, no explanations.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    console.log('🤖 AI Response received');

    // Try to extract JSON from response
    let jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Try to find JSON between code blocks
      jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                  responseText.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonMatch = jsonMatch[1].match(/\[[\s\S]*\]/);
      }
    }

    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    const questions = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('No questions extracted from the document');
    }

    console.log(`✅ Successfully extracted ${questions.length} questions`);
    return questions;

  } catch (error) {
    console.error('❌ AI parsing error:', error.message);
    
    // Fallback: Try manual parsing
    console.log('⚡ Attempting fallback manual parsing...');
    return fallbackManualParsing(text);
  }
};

/**
 * Fallback manual parsing when AI fails
 */
// Helper functions for advanced parsing
const detectQuestionType = (questionText, nextLine) => {
  const lower = questionText.toLowerCase();
  if (lower.includes('true or false') || lower.includes('true/false')) return 'true-false';
  if (lower.includes('explain') || lower.includes('describe') || lower.includes('discuss')) return 'essay';
  if (lower.includes('write a program') || lower.includes('code')) return 'coding';
  if (lower.includes('fill in') || lower.includes('_____')) return 'fill-in-the-blank';
  if (lower.includes('match')) return 'matching';
  if (nextLine && nextLine.match(/^[A-E][\s\.\)]/i)) return 'multiple-choice';
  return 'short-answer';
};

const extractPoints = (text) => {
  const patterns = [/(\d+)\s*marks?/i, /(\d+)\s*points?/i, /\[(\d+)\]/, /\((\d+)\s*marks?\)/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  return null;
};

const extractDifficulty = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes('easy') || lower.includes('basic')) return 'easy';
  if (lower.includes('hard') || lower.includes('difficult')) return 'hard';
  if (lower.includes('medium') || lower.includes('moderate')) return 'medium';
  return undefined;
};

const fallbackManualParsing = (text) => {
  const questions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let currentQuestion = null;
  let answerKey = {};
  
  // Extract answer key
  const answerSection = text.match(/answer\s*key[\s:]*([^\n]*(?:\n(?!\n)[^\n]*)*)/i);
  if (answerSection) {
    const keyMatches = answerSection[1].matchAll(/(\d+|Q\d+)[\s\.:)]*([A-E]|true|false|[\w\s,]+)/gi);
    for (const m of keyMatches) answerKey[m[1].toLowerCase()] = m[2].trim();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    
    // Advanced question patterns
    const qPatterns = [
      /^(\d+|Q\d+|Question\s*\d+)[\s\.\):\-]+(.+)/i,
      /^([A-Z]\.\s+)(.+\?)/,
      /^(\*\*Q\d+\*\*|##\s*Q\d+)[\s:]+(.+)/,
      /^\[(\d+)\]\s*(.+)/
    ];
    
    let qMatch = null, qNum = null;
    for (const p of qPatterns) {
      qMatch = line.match(p);
      if (qMatch) {
        qNum = qMatch[1].replace(/[^\d]/g, '');
        break;
      }
    }
    
    if (qMatch) {
      if (currentQuestion) questions.push(finalizeQuestion(currentQuestion, answerKey));
      
      const qText = (qMatch[2] || qMatch[0]).trim();
      currentQuestion = {
        question: qText,
        type: detectQuestionType(qText, next),
        options: [],
        correctAnswer: '',
        points: extractPoints(line) || 1,
        explanation: '',
        difficulty: extractDifficulty(line),
        _qNum: qNum
      };
      
    } else if (currentQuestion) {
      // Option patterns
      const optPatterns = [
        /^([A-E]|[a-e])[\s\.\):\-]+(.+)/,
        /^(\d+)[\s\.\)]+(?!.*\?)(.+)/,
        /^\(?([A-E])\)?[\s\.:]+(.+)/i
      ];
      
      let optMatch = null;
      for (const p of optPatterns) {
        optMatch = line.match(p);
        if (optMatch && optMatch[2] && !line.includes('?')) break;
      }
      
      if (optMatch && optMatch[2]) {
        let optText = optMatch[2].trim();
        const markers = ['*', '✓', '✔', '(correct)', '[answer]', '→'];
        if (markers.some(m => line.includes(m))) {
          optText = optText.replace(/[*✓✔]|\(correct\)|\[answer\]|→/g, '').trim();
          currentQuestion.correctAnswer = optText;
        }
        currentQuestion.options.push(optText);
        
      } else if (line.match(/^(answer|ans|correct|solution)[\s:]+/i)) {
        currentQuestion.correctAnswer = line.replace(/^(answer|ans|correct|solution)[\s:]+/i, '').trim();
      } else if (line.match(/^(explanation|hint|note)[\s:]+/i)) {
        currentQuestion.explanation = line.replace(/^(explanation|hint|note)[\s:]+/i, '').trim();
      }
    }
  }
  
  if (currentQuestion) questions.push(finalizeQuestion(currentQuestion, answerKey));
  console.log(`⚡ Advanced parser extracted ${questions.length} questions`);
  return questions;
};

const finalizeQuestion = (q, answerKey) => {
  // Fix type based on options
  if (q.options.length === 0 && q.type === 'multiple-choice') q.type = 'short-answer';
  else if (q.options.length === 2) {
    const hasTrue = q.options.some(o => o.toLowerCase().includes('true'));
    const hasFalse = q.options.some(o => o.toLowerCase().includes('false'));
    if (hasTrue && hasFalse) {
      q.type = 'true-false';
      q.options = ['True', 'False'];
      if (q.correctAnswer.toLowerCase().includes('true')) q.correctAnswer = 'True';
      else if (q.correctAnswer.toLowerCase().includes('false')) q.correctAnswer = 'False';
    }
  } else if (q.options.length >= 2) q.type = 'multiple-choice';
  
  // Lookup answer key
  if (!q.correctAnswer && q._qNum && answerKey[q._qNum]) {
    q.correctAnswer = answerKey[q._qNum];
  }
  
  delete q._qNum;
  if (!q.difficulty) delete q.difficulty;
  if (!q.explanation) delete q.explanation;
  return q;
};

/**
 * Validate and normalize questions
 */
const validateQuestions = (questions) => {
  const validQuestions = [];
  const invalidQuestions = [];

  questions.forEach((q, index) => {
    const errors = [];

    // Validate question text
    if (!q.question || q.question.trim().length < 5) {
      errors.push('Question text is too short or missing');
    }

    // Validate based on type
    if (q.type === 'multiple-choice') {
      if (!q.options || q.options.length < 2) {
        errors.push('Multiple-choice questions need at least 2 options');
      }
      if (q.correctAnswer && q.options && !q.options.includes(q.correctAnswer)) {
        // Try to find closest match
        const lowerAnswer = q.correctAnswer.toLowerCase();
        const match = q.options.find(opt => opt.toLowerCase().includes(lowerAnswer) || lowerAnswer.includes(opt.toLowerCase()));
        if (match) {
          q.correctAnswer = match;
        } else {
          errors.push('Correct answer does not match any option');
        }
      }
    } else if (q.type === 'true-false') {
      q.options = ['True', 'False'];
      if (q.correctAnswer && !['true', 'false'].includes(q.correctAnswer.toLowerCase())) {
        errors.push('True/False answer must be either "True" or "False"');
      } else if (q.correctAnswer) {
        q.correctAnswer = q.correctAnswer.toLowerCase() === 'true' ? 'True' : 'False';
      }
    }

    // Validate points
    if (!q.points || q.points < 0) {
      q.points = 1;
    }

    // Normalize empty fields
    if (!q.options) q.options = [];
    if (!q.correctAnswer) q.correctAnswer = '';
    if (!q.explanation) q.explanation = '';

    if (errors.length === 0) {
      validQuestions.push({ ...q, originalIndex: index + 1 });
    } else {
      invalidQuestions.push({ ...q, originalIndex: index + 1, errors });
    }
  });

  return { validQuestions, invalidQuestions };
};

/**
 * Main function to parse question paper
 */
const parseQuestionPaper = async (fileBuffer, mimeType, fileName) => {
  try {
    console.log(`📄 Processing file: ${fileName} (${mimeType})`);
    
    // Step 1: Extract text
    const text = await extractTextFromFile(fileBuffer, mimeType, fileName);
    
    if (!text || text.trim().length < 20) {
      throw new Error('File appears to be empty or contains too little text');
    }
    
    console.log(`📝 Extracted ${text.length} characters`);
    
    // Step 2: Parse with AI
    const questions = await parseQuestionsWithAI(text);
    
    // Step 3: Validate
    const { validQuestions, invalidQuestions } = validateQuestions(questions);
    
    return {
      success: true,
      questions: validQuestions,
      invalidQuestions,
      totalFound: questions.length,
      validCount: validQuestions.length,
      invalidCount: invalidQuestions.length,
      metadata: {
        fileName,
        fileType: mimeType,
        textLength: text.length,
        parsedAt: new Date()
      }
    };

  } catch (error) {
    console.error('❌ Question parsing failed:', error);
    return {
      success: false,
      error: error.message,
      questions: [],
      invalidQuestions: [],
      totalFound: 0,
      validCount: 0,
      invalidCount: 0
    };
  }
};

module.exports = {
  parseQuestionPaper,
  extractTextFromFile,
  parseQuestionsWithAI,
  validateQuestions
};
