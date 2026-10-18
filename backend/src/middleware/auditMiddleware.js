
const { auditRequest } = require("../services/auditService");

function auditAction({
  action,
  entityType = "OTHER",
  description = "",
  getEntityId = () => null,
}) {
  return function (req, res, next) {
    res.on("finish", () => {
      if (!req.user?.hospitalId) return;

      const successful = res.statusCode >= 200 && res.statusCode < 400;

      auditRequest(req, {
        action,
        entityType,
        description,
        entityId: getEntityId(req, res) || null,
        outcome: successful ? "SUCCESS" : "FAILURE",
        metadata: {
          method: req.method,
          path: req.route?.path || req.path,
          statusCode: res.statusCode,
        },
      }).catch((error) => {
        // Keep audit failures visible to operators.
        // Do not expose internal details to the API client.
        console.error("Audit logging failed:", error.message);
      });
    });

    next();
  };
}

module.exports = { auditAction };
