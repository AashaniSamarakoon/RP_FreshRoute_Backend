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

function thenable(result) {
  const p = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("pushTokenController", () => {
  test("saves a new Expo push token for the authenticated user", async () => {
    jest.resetModules();

    const query = thenable({ data: null, error: null });
    const insert = jest.fn(() => thenable({ data: null, error: null }));
    const supabaseAdmin = {
      from: jest.fn((table) => {
        if (table !== "user_push_tokens") throw new Error(`Unexpected table ${table}`);
        return { ...query, insert };
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase: {},
      supabaseAdmin,
    }));

    const { savePushToken } = require("../../controllers/pushTokenController");

    const req = {
      user: { id: "u1" },
      body: { expoPushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" },
    };
    const res = makeRes();

    await savePushToken(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      expo_push_token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    });
  });

  test("rejects invalid Expo push tokens", async () => {
    jest.resetModules();

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase: {},
      supabaseAdmin: { from: jest.fn() },
    }));

    const { savePushToken } = require("../../controllers/pushTokenController");

    const req = {
      user: { id: "u1" },
      body: { token: "not-a-token" },
    };
    const res = makeRes();

    await savePushToken(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid Expo push token");
  });
});
