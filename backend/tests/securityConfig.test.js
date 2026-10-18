const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAllowedOrigins,
  isOriginAllowed,
  roleIsAllowed,
  assertProductionSecrets,
} = require("../src/utils/securityConfig");

test("production origins are explicit and development origins are available outside production", () => {
  assert.deepEqual(getAllowedOrigins({ NODE_ENV: "production", CLIENT_URL: "https://mediflow.example" }), ["https://mediflow.example"]);
  const dev = getAllowedOrigins({ NODE_ENV: "development" });
  assert.equal(dev.includes("http://localhost:3000"), true);
});

test("CORS allows configured origins and rejects unknown browser origins", () => {
  assert.equal(isOriginAllowed("https://mediflow.example", ["https://mediflow.example"]), true);
  assert.equal(isOriginAllowed("https://evil.example", ["https://mediflow.example"]), false);
  assert.equal(isOriginAllowed(undefined, []), true);
});

test("role authorization is allow-list based", () => {
  assert.equal(roleIsAllowed("HOSPITAL_ADMIN", ["HOSPITAL_ADMIN", "DOCTOR"]), true);
  assert.equal(roleIsAllowed("PATIENT", ["HOSPITAL_ADMIN", "DOCTOR"]), false);
  assert.equal(roleIsAllowed(undefined, ["HOSPITAL_ADMIN"]), false);
});

test("production refuses weak or placeholder JWT secrets and missing configuration", () => {
  assert.throws(() => assertProductionSecrets({ NODE_ENV: "production", JWT_SECRET: "short", MONGODB_URI: "mongodb://example", CLIENT_URL: "https://example.com" }), /JWT_SECRET/);
  assert.throws(() => assertProductionSecrets({ NODE_ENV: "production", JWT_SECRET: "x".repeat(40), CLIENT_URL: "https://example.com" }), /MONGODB_URI/);
  assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: "test" }));
});
