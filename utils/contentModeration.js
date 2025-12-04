const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Try different model names - the API key might support different versions
const MODEL_NAME = 'gemini-pro';

/**
 * Get improvement suggestions based on detected harmful keywords
 * @param {string} content - The content that was flagged
 * @returns {string} - Suggestion for improvement
 */
const getImprovementSuggestion = (content) => {
  const contentLower = content.toLowerCase();
  
  // Violence/Threats
  if (contentLower.match(/\b(kill|murder|hurt|harm|violence|attack|beat up|death threat)\b/)) {
    return 'Please rephrase without violent or threatening language. Express your concerns constructively.';
  }
  
  // Hate speech
  if (contentLower.match(/\b(hate|discriminat)\b/)) {
    return 'Please use respectful language. Focus on discussing ideas rather than expressing hatred toward groups or individuals.';
  }
  
  // Bullying/Harassment
  if (contentLower.match(/\b(dumb|stupid|idiot|get lost)\b/)) {
    return 'Please be respectful to others. Try rephrasing your feedback constructively without insulting language.';
  }
  
  // Self-harm
  if (contentLower.match(/\b(suicide|kys|die)\b/)) {
    return 'If you\'re struggling, please reach out to a counselor or support service. This forum is for educational discussions.';
  }
  
  // Drugs/Illegal
  if (contentLower.match(/\b(drug|cocaine|heroin|weapon|bomb|terrorist)\b/)) {
    return 'This platform is for educational purposes only. Please keep discussions focused on learning and academic topics.';
  }
  
  // Generic fallback
  return 'Please revise your content to follow our community guidelines. Keep discussions respectful, constructive, and educational.';
};

/**
 * Verify content for violence, harassment, hate speech, and other harmful content
 * @param {string} title - Post title
 * @param {string} description - Post description
 * @returns {Promise<{isAllowed: boolean, reason: string}>}
 */
const verifyPostContent = async (title, description) => {
  try {
    // If API key is not set, allow the post (fail open for development)
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY not set. Content moderation is disabled.');
      return { isAllowed: true, reason: '' };
    }

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `You are a content moderation AI for a student-teacher forum platform. Analyze the following post content and determine if it contains:

1. Violence or threats
2. Harassment or bullying
3. Hate speech or discrimination
4. Sexual or explicit content
5. Spam or malicious content
6. Self-harm promotion
7. Illegal activities

Post Title: "${title}"
Post Description: "${description}"

Respond ONLY in this exact JSON format (no additional text):
{
  "isAllowed": true/false,
  "reason": "Brief explanation if not allowed, empty string if allowed"
}

If the content is appropriate for an educational forum, set isAllowed to true. If it violates any of the above categories, set isAllowed to false and provide a brief reason.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Extract JSON from response (handle cases where AI adds markdown formatting)
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonText = text.split('```')[1].split('```')[0].trim();
    }

    const moderationResult = JSON.parse(jsonText);

    return {
      isAllowed: moderationResult.isAllowed === true,
      reason: moderationResult.reason || '',
    };
  } catch (error) {
    // Only log non-API errors to avoid cluttering console
    if (!error.message.includes('404 Not Found') && !error.message.includes('API key')) {
      console.error('❌ Content moderation error:', error.message);
    } else {
      console.log('⚡ Using backup keyword filter (Gemini API unavailable)');
    }
    
    // In case of error, implement a fail-safe approach
    // Check for obvious harmful keywords as a backup
    const combinedContent = `${title} ${description}`.toLowerCase();
    const harmfulKeywords = [
      'kill', 'murder', 'suicide', 'bomb', 'terrorist', 'rape',
      'assault', 'violence', 'weapon', 'drug', 'cocaine', 'heroin',
      'hurt', 'harm', 'hate', 'discriminat', 'dumb', 'stupid idiot',
      'get lost', 'kys', 'die', 'death threat', 'beat up', 'attack'
    ];

    const containsHarmful = harmfulKeywords.some(keyword => 
      combinedContent.includes(keyword)
    );

    if (containsHarmful) {
      const suggestion = getImprovementSuggestion(combinedContent);
      return {
        isAllowed: false,
        reason: 'Post contains potentially harmful content',
        suggestion: suggestion,
      };
    }

    // If no harmful keywords detected and API failed, allow the post
    return { isAllowed: true, reason: '', suggestion: '' };
  }
};

/**
 * Verify comment content for harmful material
 * @param {string} content - Comment content
 * @returns {Promise<{isAllowed: boolean, reason: string}>}
 */
const verifyCommentContent = async (content) => {
  try {
    // If API key is not set, allow the comment (fail open for development)
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY not set. Content moderation is disabled.');
      return { isAllowed: true, reason: '' };
    }

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `You are a content moderation AI for a student-teacher forum platform. Analyze the following comment and determine if it contains:

1. Violence or threats
2. Harassment or bullying
3. Hate speech or discrimination
4. Sexual or explicit content
5. Spam or malicious content
6. Self-harm promotion
7. Illegal activities

Comment: "${content}"

Respond ONLY in this exact JSON format (no additional text):
{
  "isAllowed": true/false,
  "reason": "Brief explanation if not allowed, empty string if allowed"
}

If the content is appropriate for an educational forum, set isAllowed to true. If it violates any of the above categories, set isAllowed to false and provide a brief reason.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Extract JSON from response
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonText = text.split('```')[1].split('```')[0].trim();
    }

    const moderationResult = JSON.parse(jsonText);

    return {
      isAllowed: moderationResult.isAllowed === true,
      reason: moderationResult.reason || '',
    };
  } catch (error) {
    // Only log non-API errors to avoid cluttering console
    if (!error.message.includes('404 Not Found') && !error.message.includes('API key')) {
      console.error('❌ Comment moderation error:', error.message);
    } else {
      console.log('⚡ Using backup keyword filter (Gemini API unavailable)');
    }
    
    // Backup keyword check
    const contentLower = content.toLowerCase();
    const harmfulKeywords = [
      'kill', 'murder', 'suicide', 'bomb', 'terrorist', 'rape',
      'assault', 'violence', 'weapon', 'drug', 'cocaine', 'heroin',
      'hurt', 'harm', 'hate', 'discriminat', 'dumb', 'stupid idiot',
      'get lost', 'kys', 'die', 'death threat', 'beat up', 'attack'
    ];

    const containsHarmful = harmfulKeywords.some(keyword => 
      contentLower.includes(keyword)
    );

    if (containsHarmful) {
      const suggestion = getImprovementSuggestion(contentLower);
      return {
        isAllowed: false,
        reason: 'Comment contains potentially harmful content',
        suggestion: suggestion,
      };
    }

    return { isAllowed: true, reason: '', suggestion: '' };
  }
};

module.exports = {
  verifyPostContent,
  verifyCommentContent,
};
