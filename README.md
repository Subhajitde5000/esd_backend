# ESDC Platform - Authentication System Setup

## Backend Stack
- Node.js + Express.js
- MongoDB (Mongoose ODM)
- JWT Authentication
- Role-Based Access Control (RBAC)
- Cloudinary (Media Uploads)
- bcryptjs (Password Hashing)

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB installed and running locally OR MongoDB Atlas account

### Backend Setup

1. **Navigate to backend directory:**
   ```powershell
   cd backend
   ```

2. **Install dependencies** (already done):
   ```powershell
   npm install
   ```

3. **Configure Environment Variables:**
   Edit the `.env` file in the backend directory:
   ```env
   MONGODB_URI=mongodb://localhost:27017/esdc_platform
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   PORT=5000
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   FRONTEND_URL=http://localhost:5173
   ```

   **Important:** 
   - If using local MongoDB, ensure MongoDB is running
   - For MongoDB Atlas, replace `MONGODB_URI` with your connection string
   - Add your Cloudinary credentials for image uploads (optional for testing)

4. **Start MongoDB** (if using local MongoDB):
   ```powershell
   # In a new terminal
   mongod
   ```

5. **Seed the database with demo users:**
   ```powershell
   npm run seed
   ```

   This will create demo users:
   - **Students:**
     - Email: `raj.student@esdc.com` | Phone: `9876543210` | Password: `password123`
     - Email: `priya.student@esdc.com` | Phone: `9876543211` | Password: `password123`
   
   - **Mentors:**
     - Email: `amit.mentor@esdc.com` | Phone: `9876543212` | Password: `password123`
     - Email: `sneha.mentor@esdc.com` | Phone: `9876543213` | Password: `password123`
   
   - **Admin:**
     - Email: `admin@esdc.com` | Phone: `9876543214` | Password: `admin123`
   
   - **Super Admin:**
     - Email: `superadmin@esdc.com` | Phone: `9876543215` | Password: `superadmin123`

6. **Start the backend server:**
   ```powershell
   npm start
   ```

   Server will run on `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```powershell
   cd fontend
   ```

2. **Install dependencies** (if not already done):
   ```powershell
   npm install
   ```

3. **Start the development server:**
   ```powershell
   npm run dev
   ```

   Frontend will run on `http://localhost:5173`

## API Endpoints

### Authentication Routes

#### Sign Up
- **POST** `/api/auth/signup`
- **Body (multipart/form-data):**
  ```json
  {
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "1234567890",
    "password": "password123",
    "role": "student",
    "dob": "2000-01-01",
    "gender": "male",
    "department": "Computer Science",
    "year": "3rd Year",
    "photo": "<file>"
  }
  ```
- **Roles allowed for signup:** `student`, `mentor`

#### Login
- **POST** `/api/auth/login`
- **Body:**
  ```json
  {
    "emailOrPhone": "john@example.com",
    "password": "password123",
    "role": "student"
  }
  ```
- **Roles allowed for login:** `student`, `mentor`, `admin`, `super_admin`

#### Get Current User
- **GET** `/api/auth/me`
- **Headers:** `Authorization: Bearer <token>`

#### Logout
- **POST** `/api/auth/logout`
- **Headers:** `Authorization: Bearer <token>`

## Role-Based Access Control

The system has 4 roles:

1. **student** - Can sign up and access student features
2. **mentor** - Can sign up and access mentor features
3. **admin** - Can only login (created by system/super_admin)
4. **super_admin** - Can only login (highest privilege)

### Role Restrictions:
- **Sign Up Page:** Only `student` and `mentor` roles can register
- **Login Page:** All 4 roles can login

## Features Implemented

### Backend
✅ User model with role-based schema  
✅ Password hashing with bcryptjs  
✅ JWT token generation and validation  
✅ Role-based access control middleware  
✅ File upload support with Cloudinary  
✅ Signup endpoint with validation  
✅ Login endpoint with role verification  
✅ Protected routes with JWT verification  
✅ Demo user seed script  

### Frontend
✅ Sign up form with role selection (student/mentor)  
✅ Login form with 4 role options  
✅ API integration with axios  
✅ JWT token storage in localStorage  
✅ Form validation  
✅ Error handling and display  
✅ Loading states  
✅ Auto-redirect based on user role  

## Testing the Application

1. **Start MongoDB** (if local)
2. **Run backend:** `cd backend && npm start`
3. **Run frontend:** `cd fontend && npm run dev`
4. **Test signup:** Go to `/sign` and create a new account
5. **Test login:** Use demo credentials from the seed data

## Security Notes

⚠️ **Important for Production:**
- Change `JWT_SECRET` to a strong random string
- Use HTTPS in production
- Add rate limiting for authentication endpoints
- Implement refresh tokens for better security
- Add email verification for new signups
- Use environment-specific `.env` files
- Never commit `.env` file to version control

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod`
- Check if `MONGODB_URI` in `.env` is correct
- For Atlas, ensure IP is whitelisted

### CORS Error
- Verify `FRONTEND_URL` in backend `.env` matches your frontend URL
- Check if backend server is running

### Cloudinary Upload Error
- Verify Cloudinary credentials in `.env`
- For testing, image uploads are optional

## Project Structure

```
backend/
├── config/
│   ├── db.js              # MongoDB connection
│   └── cloudinary.js      # Cloudinary setup
├── controllers/
│   └── authController.js  # Auth logic
├── middleware/
│   └── auth.js            # JWT & RBAC middleware
├── models/
│   └── User.js            # User schema
├── routes/
│   └── auth.js            # Auth routes
├── seedUsers.js           # Demo user seed script
├── server.js              # Express server
├── .env                   # Environment variables
└── package.json

fontend/src/
├── services/
│   └── api.js             # API integration
├── page/
│   ├── sign.jsx           # Signup page
│   └── login.jsx          # Login page
└── ...
```

## Next Steps

Consider implementing:
- Email verification with OTP
- Password reset functionality
- User profile management
- File upload progress indicator
- Remember me functionality
- Session management
- Social login (Google OAuth)
- Two-factor authentication
