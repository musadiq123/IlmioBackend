const Class = require('../models/Class');

// ── iCal / Google Calendar export ────────────────────────────────────────────

const escapeIcal = (str) =>
  String(str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const formatIcalDate = (date) =>
  new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Build an iCalendar VEVENT block for a single class occurrence.
 */
const buildVEvent = (cls, dtStart, dtEnd, uid) => [
  'BEGIN:VEVENT',
  `UID:${uid}`,
  `DTSTAMP:${formatIcalDate(new Date())}`,
  `DTSTART:${formatIcalDate(dtStart)}`,
  `DTEND:${formatIcalDate(dtEnd)}`,
  `SUMMARY:${escapeIcal(cls.name)}`,
  `DESCRIPTION:${escapeIcal(`Subject: ${cls.subject}${cls.description ? ' | ' + cls.description : ''} | Code: ${cls.classId}`)}`,
  `LOCATION:${escapeIcal('Online via EduConnect')}`,
  `STATUS:CONFIRMED`,
  'END:VEVENT',
].join('\r\n');

// GET /api/integrations/calendar/class/:classId.ics
// Returns an .ics file that any calendar app can import
exports.exportClassCalendar = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    // Only teacher or enrolled students may export
    const isTeacher = cls.teacher.toString() === req.user._id.toString();
    const isStudent = cls.students.some((s) => s.toString() === req.user._id.toString())
                   || cls.studentIds.some((s) => s.toString() === req.user._id.toString());
    if (!isTeacher && !isStudent) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const durationMs = (() => {
      if (cls.startTime && cls.endTime) {
        const [sh, sm] = cls.startTime.split(':').map(Number);
        const [eh, em] = cls.endTime.split(':').map(Number);
        return ((eh * 60 + em) - (sh * 60 + sm)) * 60 * 1000;
      }
      return 60 * 60 * 1000; // default 1 hour
    })();

    const vEvents = [];

    if (cls.recurrenceType === 'none') {
      const dtStart = new Date(cls.scheduledAt);
      const dtEnd   = new Date(dtStart.getTime() + durationMs);
      vEvents.push(buildVEvent(cls, dtStart, dtEnd, `${cls._id}@educonnect`));
    } else {
      // Generate next 60 occurrences max
      const { generateOccurrences } = require('./classController');
      // generateOccurrences is not exported — so we inline a simplified version here
      const from = new Date();
      const to   = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const exceptions = new Set(
        (cls.recurrenceExceptions || []).map((d) => d.toISOString().slice(0, 10))
      );
      const cursor = new Date(cls.scheduledAt);
      let count = 0;

      while (cursor <= to && count < 60) {
        const key = cursor.toISOString().slice(0, 10);
        if (cursor >= from && !exceptions.has(key)) {
          const dtStart = new Date(cursor);
          const dtEnd   = new Date(cursor.getTime() + durationMs);
          vEvents.push(buildVEvent(cls, dtStart, dtEnd, `${cls._id}-${key}@educonnect`));
          count += 1;
        }
        // advance cursor
        if (cls.recurrenceType === 'daily') cursor.setDate(cursor.getDate() + 1);
        else if (cls.recurrenceType === 'weekly') {
          do { cursor.setDate(cursor.getDate() + 1); }
          while (!cls.recurrenceDays.includes(cursor.getDay()));
        } else if (cls.recurrenceType === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
        else if (cls.recurrenceType === 'custom') cursor.setDate(cursor.getDate() + (cls.recurrenceInterval || 1));
        else break;
      }
    }

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EduConnect//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...vEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cls.classId}.ics"`);
    res.send(ical);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/integrations/calendar/my-classes.ics  — all classes for the current user
exports.exportMyCalendar = async (req, res) => {
  try {
    let classes;
    if (req.user.role === 'teacher') {
      classes = await Class.find({ teacher: req.user._id, status: { $ne: 'ended' } });
    } else {
      classes = await Class.find({
        $or: [{ students: req.user._id }, { studentIds: req.user._id }],
        status: { $ne: 'ended' },
      });
    }

    const vEvents = classes.map((cls) => {
      const dtStart = new Date(cls.scheduledAt);
      const dtEnd   = new Date(dtStart.getTime() + 60 * 60 * 1000);
      return buildVEvent(cls, dtStart, dtEnd, `${cls._id}@educonnect`);
    });

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EduConnect//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...vEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="my-classes.ics"');
    res.send(ical);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Stripe payment stub ───────────────────────────────────────────────────────
// Stub endpoints — wire up Stripe SDK when you add paid classes

// POST /api/integrations/stripe/webhook
// Receives Stripe webhook events (e.g., payment_intent.succeeded)
exports.stripeWebhook = async (req, res) => {
  try {
    // TODO: Verify Stripe signature using stripe.webhooks.constructEvent(...)
    // const sig = req.headers['stripe-signature'];
    // const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    const eventType = req.body?.type || 'unknown';
    console.log(`[Stripe] Webhook received: ${eventType}`);

    // Handle payment events here:
    // if (eventType === 'payment_intent.succeeded') { ... enroll student ... }
    // if (eventType === 'payment_intent.payment_failed') { ... notify student ... }

    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST /api/integrations/stripe/create-payment-intent
// Stub: create a payment intent for a paid class enrolment
exports.createPaymentIntent = async (req, res) => {
  try {
    const { classId, currency = 'usd' } = req.body;
    if (!classId) return res.status(400).json({ message: 'classId is required' });

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    // TODO: const paymentIntent = await stripe.paymentIntents.create({ amount, currency, ... });
    // Return client_secret to frontend for Stripe.js confirmation

    res.status(501).json({
      message: 'Stripe integration is not yet configured. Set STRIPE_SECRET_KEY to enable.',
      classId,
      currency,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
