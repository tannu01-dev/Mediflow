
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");

const getMyNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );

  const filter = {
    hospitalId: req.user.hospitalId,
    recipientUserId: req.user.id,
  };

  if (req.query.unread === "true") {
    filter.readAt = null;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({
      hospitalId: req.user.hospitalId,
      recipientUserId: req.user.id,
      readAt: null,
    }),
  ]);

  res.json({
    success: true,
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount,
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification ID",
    });
  }

  const notification = await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      hospitalId: req.user.hospitalId,
      recipientUserId: req.user.id,
      readAt: null,
    },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    const existing = await Notification.exists({
      _id: req.params.id,
      hospitalId: req.user.hospitalId,
      recipientUserId: req.user.id,
    });

    return res.status(existing ? 200 : 404).json({
      success: Boolean(existing),
      message: existing
        ? "Notification was already read"
        : "Notification not found",
    });
  }

  res.json({
    success: true,
    message: "Notification marked as read",
    notification,
  });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    {
      hospitalId: req.user.hospitalId,
      recipientUserId: req.user.id,
      readAt: null,
    },
    { $set: { readAt: new Date() } }
  );

  res.json({
    success: true,
    message: "All notifications marked as read",
    modifiedCount: result.modifiedCount,
  });
});

module.exports = {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
