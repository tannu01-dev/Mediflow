
const User = require("../models/User");
const Notification = require("../models/Notification");
const { emitToUser } = require("../config/socket");
const { recordTimelineEvent } = require("./timelineService");

async function notifyUsers({
  hospitalId,
  recipientUserIds = [],
  roles = [],
  type = "GENERAL",
  title,
  message,
  entityType = "NONE",
  entityId = null,
}) {
  if (!hospitalId || !title || !message) {
    throw new Error("hospitalId, title and message are required for notifications");
  }

  const userFilter = {
    hospitalId,
    isActive: true,
  };

  if (recipientUserIds.length > 0 && roles.length > 0) {
    userFilter.$or = [
      { _id: { $in: recipientUserIds } },
      { role: { $in: roles } },
    ];
  } else if (recipientUserIds.length > 0) {
    userFilter._id = { $in: recipientUserIds };
  } else if (roles.length > 0) {
    userFilter.role = { $in: roles };
  } else {
    return [];
  }

  const users = await User.find(userFilter).select("_id");

  if (!users.length) return [];

  const documents = users.map((user) => ({
    hospitalId,
    recipientUserId: user._id,
    type,
    title,
    message,
    entityType,
    entityId,
  }));

  const notifications = await Notification.insertMany(documents);

  // Persist a safe, hospital-scoped activity entry for the operational timeline.
  // Clinical narrative text is not copied into metadata.
  try {
    await recordTimelineEvent({
      hospitalId,
      eventType: type || "GENERAL",
      title,
      description: message,
      entityType,
      entityId,
    });
  } catch (error) {
    console.error("Could not create timeline entry from notification:", error.message);
  }

  for (const notification of notifications) {
    emitToUser(notification.recipientUserId.toString(), "notification:new", {
      id: notification._id.toString(),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId
        ? notification.entityId.toString()
        : null,
      createdAt: notification.createdAt,
      readAt: null,
    });
  }

  return notifications;
}

module.exports = { notifyUsers };
