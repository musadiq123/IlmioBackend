const Class = require('../models/Class');
const { notifyClass } = require('./notificationService');

const REMINDER_MINUTES = [30, 15]; // send reminders this many minutes before class

// Track which (classId, minutesBefore) pairs have already been notified this run
const notified = new Set();

const checkAndSendReminders = async () => {
  const now = Date.now();

  for (const minutesBefore of REMINDER_MINUTES) {
    const windowStart = new Date(now + minutesBefore * 60 * 1000 - 60 * 1000); // 1-min tolerance
    const windowEnd   = new Date(now + minutesBefore * 60 * 1000 + 60 * 1000);

    const classes = await Class.find({
      status: 'scheduled',
      scheduledAt: { $gte: windowStart, $lte: windowEnd },
    })
      .populate('teacher', 'name fcmToken')
      .populate('studentIds', 'name fcmToken')
      .populate('students', 'name fcmToken');

    for (const cls of classes) {
      const key = `${cls._id}-${minutesBefore}`;
      if (notified.has(key)) continue;
      notified.add(key);

      const title = `Class starting in ${minutesBefore} minutes`;
      const body  = `"${cls.name}" (${cls.subject}) begins soon.`;

      await notifyClass(cls, 'class_reminder', title, body, {
        minutesBefore: String(minutesBefore),
        classId: cls._id.toString(),
      }).catch((err) => console.error('Reminder notification error:', err.message));

      console.log(`[Reminder] ${minutesBefore}m notice sent for class ${cls.classId}`);
    }
  }

  // Purge stale keys older than 2 hours to prevent memory growth
  if (notified.size > 10000) notified.clear();
};

const startReminderScheduler = () => {
  // Poll every 60 seconds
  setInterval(() => {
    checkAndSendReminders().catch((err) =>
      console.error('[ReminderScheduler] Error:', err.message)
    );
  }, 60 * 1000);

  console.log('✅ Reminder scheduler started (checking every 60s)');
};

module.exports = { startReminderScheduler };
