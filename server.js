const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
require('dotenv').config();

const authRoutes      = require('./src/routes/authRoutes');
const classRoutes     = require('./src/routes/classRoutes');
const recordingRoutes = require('./src/routes/recordingRoutes');
const livekitRoutes   = require('./src/routes/livekitRoutes');

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