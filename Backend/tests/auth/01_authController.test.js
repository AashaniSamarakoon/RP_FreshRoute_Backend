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
    upsert: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    or: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("Auth/authController", () => {
  test("signup returns 400 for missing fields", async () => {
    jest.resetModules();

    const supabase = { auth: { signUp: jest.fn() } };
    const supabaseAdmin = { from: jest.fn() };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase, supabaseAdmin }));
    jest.doMock("../../Services/blockchain/identityService", () => ({
      registerAndEnrollUser: jest.fn(),
    }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn(),
    }));
    jest.doMock("../../utils/blockchainUtils", () => ({
      submitWithTx: jest.fn(),
    }));

    const { signup } = require("../../controllers/Auth/authController");

    const req = { body: { email: "buyer@example.com" } };
    const res = makeRes();

    await signup(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Missing fields");
  });

  test("signup creates buyer profile and normalizes role", async () => {
    jest.resetModules();

    const supabase = {
      auth: {
        signUp: jest.fn().mockResolvedValue({
          data: {
            user: { id: "u1", email: "buyer@example.com", identities: [{}] },
            session: { access_token: "tok" },
          },
          error: null,
        }),
      },
    };

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { blockchain_tx_id: [] }, error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    const registerAndEnrollUser = jest.fn().mockResolvedValue(true);
    const getContract = jest.fn().mockResolvedValue({
      contract: {},
      close: jest.fn(),
    });
    const submitWithTx = jest.fn().mockResolvedValue("tx123");

    jest.doMock("../../utils/supabaseClient", () => ({ supabase, supabaseAdmin }));
    jest.doMock("../../Services/blockchain/identityService", () => ({
      registerAndEnrollUser,
    }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract,
    }));
    jest.doMock("../../utils/blockchainUtils", () => ({ submitWithTx }));

    const { signup } = require("../../controllers/Auth/authController");

    const req = {
      body: {
        first_name: "Ada",
        last_name: "Lovelace",
        email: "buyer@example.com",
        phone: "0771231234",
        nic: "990011223V",
        password: "pw123",
        role: "buyer",
      },
    };
    const res = makeRes();

    await signup(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.user.role).toBe("buyer");
    expect(res.body.blockchainStatus).toBe("Registered on Ledger");
  });

  test("login returns token and role profile", async () => {
    jest.resetModules();

    const supabase = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            session: { access_token: "tok" },
            user: { id: "u1", user_metadata: { first_name: "Ada" } },
          },
          error: null,
        }),
      },
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { id: "u1", email: "buyer@example.com", role: "buyer" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1", company_name: "FreshRoute" }, error: null }),
        ),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase, supabaseAdmin: {} }));

    const { login } = require("../../controllers/Auth/authController");

    const req = { body: { identifier: "buyer@example.com", password: "pw" } };
    const res = makeRes();

    await login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBe("tok");
    expect(res.body.user.role).toBe("buyer");
    expect(res.body.user.roleProfile.company_name).toBe("FreshRoute");
  });

  test("login rejects unknown account", async () => {
    jest.resetModules();

    const supabase = {
      auth: { signInWithPassword: jest.fn() },
      from: jest.fn(() => thenable({ data: null, error: { message: "nope" } })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase, supabaseAdmin: {} }));

    const { login } = require("../../controllers/Auth/authController");

    const req = { body: { identifier: "unknown@example.com", password: "pw" } };
    const res = makeRes();

    await login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Account not found");
  });
});
