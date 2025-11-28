// Email service for sending OTP emails
const nodemailer = require('nodemailer');

const otpStore = new Map(); // Temporary storage for OTPs (use Redis in production)

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP with expiration (5 minutes)
const storeOTP = (identifier, otp) => {
  otpStore.set(identifier, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    attempts: 0,
  });
};

// Verify OTP
const verifyOTP = (identifier, inputOtp) => {
  const stored = otpStore.get(identifier);
  
  if (!stored) {
    return { success: false, message: 'OTP not found or expired' };
  }
  
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(identifier);
    return { success: false, message: 'OTP has expired' };
  }
  
  if (stored.attempts >= 3) {
    otpStore.delete(identifier);
    return { success: false, message: 'Too many failed attempts' };
  }
  
  if (stored.otp !== inputOtp) {
    stored.attempts += 1;
    return { success: false, message: 'Invalid OTP' };
  }
  
  otpStore.delete(identifier);
  return { success: true, message: 'OTP verified successfully' };
};

// Send OTP via email
const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  try {
    // If email credentials are not configured, fall back to console logging
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('\n📧 ========== EMAIL SENT (DEV MODE) ==========');
      console.log(`To: ${email}`);
      console.log(`Subject: Your OTP for ${purpose}`);
      console.log(`OTP: ${otp}`);
      console.log(`Expires in: 5 minutes`);
      console.log('=============================================\n');
      return;
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"ESDC Platform" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your OTP for ${purpose} - ESDC Platform`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
            .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 ESDC Platform</h1>
              <p>One-Time Password Verification</p>
            </div>
            <div class="content">
              <h2>Hello!</h2>
              <p>You requested an OTP for <strong>${purpose}</strong>. Use the code below to proceed:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
                <p style="margin: 10px 0 0 0; color: #666;">This code expires in 5 minutes</p>
              </div>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong> Never share this OTP with anyone. ESDC Platform will never ask for your OTP via phone or email.
              </div>
              
              <p>If you didn't request this code, please ignore this email or contact support if you have concerns.</p>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} ESDC Platform. All rights reserved.</p>
                <p>This is an automated email. Please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        ESDC Platform - OTP Verification
        
        Your OTP for ${purpose}: ${otp}
        
        This code will expire in 5 minutes.
        
        If you didn't request this, please ignore this email.
        
        © ${new Date().getFullYear()} ESDC Platform
      `,
    };

    await transporter.sendMail(mailOptions);
    
    console.log(`✅ OTP email sent successfully to ${email}`);
    console.log(`🔑 OTP Code: ${otp} (expires in 5 minutes)`);
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    // Fall back to console logging if email fails
    console.log('\n📧 ========== EMAIL FAILED - SHOWING OTP ==========');
    console.log(`To: ${email}`);
    console.log(`OTP: ${otp}`);
    console.log('==================================================\n');
    throw new Error('Failed to send OTP email');
  }
};

// Send generic email
const sendEmail = async (to, subject, htmlContent) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"ESDC Platform" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.log('\n📧 ========== EMAIL FAILED ==========');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('====================================\n');
    // Don't throw error, just log it (email is not critical for team operations)
    return false;
  }
};

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  sendOTPEmail,
  sendEmail,
};
