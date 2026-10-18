const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isEmail,
  isDateOnly,
  isStrongPassword,
  normalizeText,
  parsePagination,
  escapeRegex,
  isObjectId,
} = require("../src/utils/validation");

test("email validation accepts valid email and rejects malformed input", () => {
  assert.equal(isEmail("staff@example.org"), true);
  assert.equal(isEmail("bad email"), false);
  assert.equal(isEmail(null), false);
});

test("date-only validation rejects impossible and malformed dates", () => {
  assert.equal(isDateOnly("1998-02-28"), true);
  assert.equal(isDateOnly("1998-02-31"), false);
  assert.equal(isDateOnly("28-02-1998"), false);
  assert.equal(isDateOnly(""), false);
});

test("password length limits are enforced", () => {
  assert.equal(isStrongPassword("12345678"), true);
  assert.equal(isStrongPassword("short"), false);
  assert.equal(isStrongPassword("x".repeat(129)), false);
});

test("text normalization trims, removes control characters, and caps length", () => {
  assert.equal(normalizeText("  hello\u0000 world  "), "hello world");
  assert.equal(normalizeText("abcdef", 3), "abc");
  assert.equal(normalizeText(123), "");
});

test("pagination values are bounded and safe", () => {
  assert.deepEqual(parsePagination("2", "500"), { page: 2, limit: 100 });
  assert.deepEqual(parsePagination("-1", "nope"), { page: 1, limit: 20 });
  assert.equal(parsePagination("999999999999999999", "10").page, 1);
});

test("search strings are escaped before becoming regular expressions", () => {
  const escaped = escapeRegex(".*[patient](a)+");
  assert.equal(new RegExp(escaped).test(".*[patient](a)+"), true);
  assert.equal(new RegExp(escaped).test("any patient a"), false);
});

test("object id validation only accepts 24-character hexadecimal strings", () => {
  assert.equal(isObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isObjectId("not-an-id"), false);
  assert.equal(isObjectId(42), false);
});
