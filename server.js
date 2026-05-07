const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const authRoutes         = require('./src/routes/authRoutes');
const classRoutes        = require('./src/routes/classRoutes');
const recordingRoutes    = require('./src/routes/recordingRoutes');
const livekitRoutes      = require('./src/routes/livekitRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const attendanceRoutes   = require('./src/routes/attendanceRoutes');
const progressRoutes     = require('./src/routes/progressRoutes');
const analyticsRoutes    = require('./src/routes/analyticsRoutes');
const { authRateLimiter, apiRateLimiter } = require('./src/middleware/rateLimiter');
const integrationRoutes  = require('./src/routes/integrationRoutes');
const { startReminderScheduler } = require('./src/utils/reminderScheduler');

const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'FIREBASE_STORAGE_BUCKET'];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Initialize Firebase Admin SDK
const loadFirebaseServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      console.error('❌ Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
      throw err;
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './src/config/firebase-service-account.json';
  const resolvedPath = path.resolve(serviceAccountPath);
  if (fs.existsSync(resolvedPath)) {
    return require(resolvedPath);
  }

  throw new Error(
    'Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH, or ensure src/config/firebase-service-account.json is available.'
  );
};

const serviceAccount = loadFirebaseServiceAccount();
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // e.g., 'your-project.appspot.com'
});

// Ensure temp recordings directory exists
const tempRecordingsDir = '/tmp/recordings';
if (!fs.existsSync(tempRecordingsDir)) {
  fs.mkdirSync(tempRecordingsDir, { recursive: true });
}

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(cors());
app.use(express.json());

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes  (auth endpoints have a stricter rate limit; all API routes share a general limit)
app.use('/api/auth',          authRateLimiter, authRoutes);
app.use('/api/classes',       apiRateLimiter,  classRoutes);
app.use('/api/recordings',    apiRateLimiter,  recordingRoutes);
app.use('/api/livekit',       apiRateLimiter,  livekitRoutes);
app.use('/api/notifications', apiRateLimiter,  notificationRoutes);
app.use('/api/attendance',    apiRateLimiter,  attendanceRoutes);
app.use('/api/progress',      apiRateLimiter,  progressRoutes);
app.use('/api/analytics',     apiRateLimiter,  analyticsRoutes);
app.use('/api/integrations',  apiRateLimiter,  integrationRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Ilmio API is running ✅', docs: `${PUBLIC_BASE_URL}/api-docs` });
});

// Mobile-friendly API version endpoint
app.get('/api/version', (req, res) => {
  res.json({ version: '2.0.0', apiBase: '/api', docs: `${PUBLIC_BASE_URL}/api-docs` });
});

// Global error handler — catches any unhandled errors from route handlers
app.use((err, req, res, _next) => {
  console.error('[GlobalError]', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
});

// Connect to MongoDB (dbName forces ilmiodb; without it, URI .../net/? defaults to "test")
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || 'ilmiodb';

mongoose.connect(mongoUri, { dbName: mongoDbName })
  .then(() => {
    console.log(`✅ MongoDB connected (database: ${mongoose.connection.name})`);
    app.listen(PORT, HOST, () => {
      console.log(`✅ Server running at ${PUBLIC_BASE_URL} (bound to ${HOST}:${PORT})`);
      startReminderScheduler();
    });
  })
  .catch(err => console.error('❌ MongoDB error:', err));