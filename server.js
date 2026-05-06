const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const authRoutes      = require('./src/routes/authRoutes');
const classRoutes     = require('./src/routes/classRoutes');
const recordingRoutes = require('./src/routes/recordingRoutes');
const livekitRoutes   = require('./src/routes/livekitRoutes');

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

// Routes
app.use('/api/auth',       authRoutes);
app.use('/api/classes',    classRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/livekit',    livekitRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Ilmio API is running ✅', docs: `${PUBLIC_BASE_URL}/api-docs` });
});

// Connect to MongoDB (dbName forces ilmiodb; without it, URI .../net/? defaults to "test")
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || 'ilmiodb';

mongoose.connect(mongoUri, { dbName: mongoDbName })
  .then(() => {
    console.log(`✅ MongoDB connected (database: ${mongoose.connection.name})`);
    app.listen(PORT, HOST, () => {
      console.log(`✅ Server running at ${PUBLIC_BASE_URL} (bound to ${HOST}:${PORT})`);
    });
  })
  .catch(err => console.error('❌ MongoDB error:', err));