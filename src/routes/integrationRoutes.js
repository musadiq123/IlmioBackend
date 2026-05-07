const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const {
  exportClassCalendar,
  exportMyCalendar,
  stripeWebhook,
  createPaymentIntent,
} = require('../controllers/integrationController');

/**
 * @swagger
 * tags:
 *   name: Integrations
 *   description: Calendar export and payment integrations
 */

/**
 * @swagger
 * /api/integrations/calendar/my-classes.ics:
 *   get:
 *     summary: Download iCalendar (.ics) file of all current user's classes
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: iCalendar file
 *         content:
 *           text/calendar:
 *             schema:
 *               type: string
 */
router.get('/calendar/my-classes.ics', auth, exportMyCalendar);

/**
 * @swagger
 * /api/integrations/calendar/class/{classId}.ics:
 *   get:
 *     summary: Download iCalendar (.ics) file for a specific class (with recurrence)
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB class ID
 *     responses:
 *       200:
 *         description: iCalendar file
 *         content:
 *           text/calendar:
 *             schema:
 *               type: string
 */
router.get('/calendar/class/:classId.ics', auth, exportClassCalendar);

/**
 * @swagger
 * /api/integrations/stripe/webhook:
 *   post:
 *     summary: Stripe webhook receiver
 *     tags: [Integrations]
 *     responses:
 *       200:
 *         description: Webhook received
 */
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

/**
 * @swagger
 * /api/integrations/stripe/create-payment-intent:
 *   post:
 *     summary: Create a Stripe payment intent for class enrolment
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId]
 *             properties:
 *               classId:  { type: string }
 *               currency: { type: string, default: usd }
 *     responses:
 *       200:
 *         description: Payment intent created
 *       501:
 *         description: Stripe not configured
 */
router.post('/stripe/create-payment-intent', auth, createPaymentIntent);

module.exports = router;
