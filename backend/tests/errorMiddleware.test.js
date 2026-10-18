const test = require("node:test");
const assert = require("node:assert/strict");
const { errorHandler } = require("../src/middleware/errorMiddleware");

function mockResponse(statusCode = 200) {
  return {
    statusCode,
    headersSent: false,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("malformed JSON returns a client error without a stack trace", () => {
  const req = { requestId: "req-123", method: "POST", originalUrl: "/api/patients" };
  const res = mockResponse();
  errorHandler({ type: "entity.parse.failed", message: "parser details" }, req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Request body contains invalid JSON");
  assert.equal("stack" in res.body, false);
});

test("production server errors do not leak internal error messages", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = { requestId: "req-456", method: "GET", originalUrl: "/api/private" };
    const res = mockResponse();
    errorHandler(new Error("database password leaked"), req, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Internal server error");
    assert.equal("stack" in res.body, false);
    assert.equal(res.body.requestId, "req-456");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
