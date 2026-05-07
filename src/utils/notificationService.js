const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Send a push notification to one or more users.
 * Persists each notification to the DB and delivers via FCM if the user has a token.
 *
 * @param {object} opts
 * @param {string|string[]} opts.userIds  - Mongoose ObjectId(s)
 * @param {string}          opts.type     - Notification.type enum value
 * @param {string}          opts.title
 * @param {string}          opts.body
 * @param {string}          [opts.classId]
 * @param {object}          [opts.data]   - extra FCM data payload (string values only)
 */
const sendNotification = async ({ userIds, type, title, body, classId, data = {} }) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];

  const users = await User.find({ _id: { $in: ids } }).select('fcmToken name');

  const results = await Promise.allSettled(
    users.map(async (user) => {
      const doc = await Notification.create({
        userId: user._id,
        classId: classId || undefined,
        type,
        title,
        body,
        data,
        sentAt: new Date(),
      });

      if (user.fcmToken) {
        try {
          const msg = {
            notification: { title, body },
            data: { notificationId: doc._id.toString(), type, ...data },
            token: user.fcmToken,
          };
          const messageId = await admin.messaging().send(msg);
          doc.fcmMessageId = messageId;
          await doc.save();
        } catch (fcmErr) {
          // FCM delivery failure should not block the request
          console.error(`FCM send failed for user ${user._id}:`, fcmErr.message);
        }
      }

      return doc;
    })
  );

  return results;
};

/**
 * Notify all invited students + teacher of a class event.
 */
const notifyClass = async (cls, type, title, body, extraData = {}) => {
  const recipients = [
    cls.teacher,
    ...(cls.studentIds || []),
    ...(cls.students || []),
  ].map((id) => id.toString());

  const unique = [...new Set(recipients)];
  return sendNotification({ userIds: unique, type, title, body, classId: cls._id, data: extraData });
};

module.exports = { sendNotification, notifyClass };
