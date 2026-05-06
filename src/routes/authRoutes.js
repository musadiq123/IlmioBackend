const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { register, login, getProfile, getAllStudents } = require('../controllers/authController');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User registration and login
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name:     { type: string, example: Ahmad Ali }
 *               email:    { type: string, example: ahmad@test.com }
 *               password: { type: string, minLength: 8, example: 12345678 }
 *               role:     { type: string, enum: [teacher, student] }
 *               subject:  { type: string, example: English Speaking }
 *               phone:    { type: string, example: '+923001234567' }
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and get JWT token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, example: ahmad@test.com }
 *               password: { type: string, example: 12345678 }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get logged-in user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized – no or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', auth, getProfile);

/**
 * @swagger
 * /api/auth/students:
 *   get:
 *     summary: Get all students (teacher only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all students
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:        { type: string, example: "60d5ec49c1234567890abcde" }
 *                   name:       { type: string, example: "Ahmad Ali" }
 *                   email:      { type: string, example: "ahmad@test.com" }
 *                   phone:      { type: string, example: "+923001234567" }
 *                   avatar:     { type: string, example: "https://example.com/avatar.jpg" }
 *                   subject:    { type: string, example: "English Speaking" }
 *                   createdAt:  { type: string, format: date-time }
 *       403:
 *         description: Only teachers can access student list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized – no or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/students', auth, getAllStudents);

module.exports = router;