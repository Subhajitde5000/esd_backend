require('dotenv').config();
const { verifyPostContent, verifyCommentContent } = require('./contentModeration');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  title: (msg) => console.log(`\n${colors.bold}${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`),
};

// Test cases for posts
const postTestCases = [
  {
    name: 'Safe Educational Content',
    title: 'How to solve binary search problems?',
    description: 'I am learning data structures and algorithms. Can someone explain the best approach to solve binary search problems? Any tips would be appreciated.',
    expectedResult: true,
  },
  {
    name: 'Normal Project Discussion',
    title: 'Looking for team members for hackathon',
    description: 'Hi everyone! We are forming a team for the upcoming college hackathon. Looking for 2 more members who are good with React and Node.js. Let me know if interested!',
    expectedResult: true,
  },
  {
    name: 'Violent Threat',
    title: 'I will hurt someone',
    description: 'I am very angry and I want to hurt people who disagree with me. I will use violence.',
    expectedResult: false,
  },
  {
    name: 'Hate Speech',
    title: 'Discrimination post',
    description: 'I hate people from different backgrounds and they should not be allowed in our community.',
    expectedResult: false,
  },
  {
    name: 'Technical Question',
    title: 'React useState not updating',
    description: 'I have a problem with useState in React. When I update the state, the component is not re-rendering. Here is my code snippet. Can anyone help?',
    expectedResult: true,
  },
];

// Test cases for comments
const commentTestCases = [
  {
    name: 'Helpful Comment',
    content: 'Great question! I had the same issue. Try using useEffect hook to handle the state updates properly.',
    expectedResult: true,
  },
  {
    name: 'Encouraging Comment',
    content: 'Keep learning! You are doing great. Feel free to ask more questions.',
    expectedResult: true,
  },
  {
    name: 'Threatening Comment',
    content: 'I will kill you if you post such stupid questions again.',
    expectedResult: false,
  },
  {
    name: 'Bullying Comment',
    content: 'You are so dumb. Why are you even in this program? Get lost.',
    expectedResult: false,
  },
  {
    name: 'Technical Response',
    content: 'You need to use async/await properly. Check the documentation for Promise handling.',
    expectedResult: true,
  },
];

// Main test runner
async function runTests() {
  console.clear();
  log.title('CONTENT MODERATION API TEST SUITE');

  // Check if API key is configured
  if (!process.env.GEMINI_API_KEY) {
    log.warning('GEMINI_API_KEY is not set in .env file');
    log.info('The tests will run using backup keyword filter only');
    console.log('');
  } else {
    log.success('GEMINI_API_KEY is configured');
    console.log('');
  }

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  // Test Posts
  log.title('TESTING POST MODERATION');
  
  for (const testCase of postTestCases) {
    totalTests++;
    log.info(`Testing: ${testCase.name}`);
    console.log(`  Title: "${testCase.title}"`);
    console.log(`  Description: "${testCase.description.substring(0, 60)}..."`);
    
    try {
      const startTime = Date.now();
      const result = await verifyPostContent(testCase.title, testCase.description);
      const duration = Date.now() - startTime;
      
      console.log(`  Expected: ${testCase.expectedResult ? 'ALLOWED' : 'BLOCKED'}`);
      console.log(`  Actual: ${result.isAllowed ? 'ALLOWED' : 'BLOCKED'}`);
      console.log(`  Duration: ${duration}ms`);
      
      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
      
      if (result.isAllowed === testCase.expectedResult) {
        log.success('Test PASSED');
        passedTests++;
      } else {
        log.error('Test FAILED - Result mismatch');
        failedTests++;
      }
    } catch (error) {
      log.error(`Test FAILED - Error: ${error.message}`);
      failedTests++;
    }
    console.log('');
  }

  // Test Comments
  log.title('TESTING COMMENT MODERATION');
  
  for (const testCase of commentTestCases) {
    totalTests++;
    log.info(`Testing: ${testCase.name}`);
    console.log(`  Content: "${testCase.content}"`);
    
    try {
      const startTime = Date.now();
      const result = await verifyCommentContent(testCase.content);
      const duration = Date.now() - startTime;
      
      console.log(`  Expected: ${testCase.expectedResult ? 'ALLOWED' : 'BLOCKED'}`);
      console.log(`  Actual: ${result.isAllowed ? 'ALLOWED' : 'BLOCKED'}`);
      console.log(`  Duration: ${duration}ms`);
      
      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
      
      if (result.isAllowed === testCase.expectedResult) {
        log.success('Test PASSED');
        passedTests++;
      } else {
        log.error('Test FAILED - Result mismatch');
        failedTests++;
      }
    } catch (error) {
      log.error(`Test FAILED - Error: ${error.message}`);
      failedTests++;
    }
    console.log('');
  }

  // Summary
  log.title('TEST SUMMARY');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    log.success('ALL TESTS PASSED! 🎉');
  } else {
    log.warning(`${failedTests} test(s) failed. Check the results above.`);
  }
  
  console.log('');
}

// Run the tests
runTests()
  .then(() => {
    log.info('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    log.error(`Test suite failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
