/** Shared helpers for fruit grading tests (same style as demandForecast tests). */

function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

module.exports = { makeRes };
