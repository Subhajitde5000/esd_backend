const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage for user profile images
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'esdc_users',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
  },
});

// Cloudinary storage for course syllabus files
const syllabusStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'course-syllabus',
    allowed_formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx'],
    resource_type: 'raw',
  },
});

const upload = multer({ storage });
const syllabusUpload = multer({ storage: syllabusStorage });

module.exports = { cloudinary, upload, syllabusUpload };
