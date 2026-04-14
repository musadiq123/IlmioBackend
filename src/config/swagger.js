const swaggerJsdoc = require('swagger-jsdoc');
const PORT = Number(process.env.PORT) || 5001;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ilmio API',
      version: '1.0.0',
      description: 'Backend API for Ilmio – online classroom platform',
    },
    servers: [
      { url: PUBLIC_BASE_URL, description: 'Configured server URL' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id:        { type: 'string', example: '69db70814cacab7215373c9a' },
            name:      { type: 'string', example: 'Ahmad Ali' },
            email:     { type: 'string', example: 'ahmad@test.com' },
            role:      { type: 'string', enum: ['teacher', 'student'] },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            user:  { $ref: '#/components/schemas/User' },
            token: { type: 'string', example: 'eyJhbGci...' },
          },
        },
        Class: {
          type: 'object',
          properties: {
            _id:             { type: 'string' },
            name:            { type: 'string', example: 'English Speaking A1' },
            subject:         { type: 'string', example: 'English' },
            description:     { type: 'string' },
            classId:         { type: 'string', example: 'ESB-4829' },
            status:          { type: 'string', enum: ['scheduled', 'live', 'ended'] },
            recordingEnabled:{ type: 'boolean' },
            teacher:         { type: 'string' },
            students:        { type: 'array', items: { type: 'string' } },
          },
        },
        Recording: {
          type: 'object',
          properties: {
            _id:         { type: 'string' },
            classId:     { type: 'string' },
            teacherId:   { type: 'string' },
            sessionId:   { type: 'string' },
            storageKey:  { type: 'string' },
            playbackUrl: { type: 'string' },
            durationSec: { type: 'number', example: 3600 },
            sizeBytes:   { type: 'number', example: 524288000 },
            mimeType:    { type: 'string', example: 'video/mp4' },
            status:      { type: 'string', enum: ['uploading', 'processing', 'ready', 'archived', 'deleted'] },
            archivedAt:  { type: 'string', format: 'date-time' },
            deletedAt:   { type: 'string', format: 'date-time' },
            createdAt:   { type: 'string', format: 'date-time' },
            updatedAt:   { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
