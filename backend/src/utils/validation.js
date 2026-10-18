function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isDateOnly(value, { allowFuture = false } = {}) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return allowFuture || date <= new Date();
}

function isStrongPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function normalizeText(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

function parsePagination(pageValue, limitValue, defaultLimit = 20, maxLimit = 100) {
  const parsedPage = Number.parseInt(pageValue, 10);
  const parsedLimit = Number.parseInt(limitValue, 10);
  return {
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 1000000) : 1,
    limit: Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, maxLimit) : defaultLimit,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isObjectId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

module.exports = { isEmail, isDateOnly, isStrongPassword, normalizeText, parsePagination, escapeRegex, isObjectId };
