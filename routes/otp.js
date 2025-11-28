const express = require('express');
const router = express.Router();
const {
  sendSignupOTP,
  verifySignupOTP,
  sendResetOTP,
  verifyResetOTP,
  resetPassword,
  sendLoginOTP,
  verifyLoginOTP,
} = require('../controllers/otpController');

// Signup OTP routes
router.post('/send-signup-otp', sendSignupOTP);
router.post('/verify-signup-otp', verifySignupOTP);

// Password reset OTP routes
router.post('/send-reset-otp', sendResetOTP);
router.post('/verify-reset-otp', verifyResetOTP);
router.post('/reset-password', resetPassword);

// Login OTP routes
router.post('/send-login-otp', sendLoginOTP);
router.post('/verify-login-otp', verifyLoginOTP);

module.exports = router;
