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
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("Auth/onboardingController", () => {
  test("completeBuyerOnboarding updates buyer and user", async () => {
    jest.resetModules();

    const supabase = {
      from: jest
        .fn()
        .mockImplementationOnce(() => thenable({ data: null, error: null }))
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase }));

    const { completeBuyerOnboarding } = require("../../controllers/Auth/onboardingController");

    const req = {
      user: { id: "u1" },
      body: {
        lat: 6.9,
        lng: 79.9,
        location: "Colombo",
        company_name: "FreshRoute",
        tax_tin_number: "TIN123",
        business_registration_url: "https://example.com/br.pdf",
        nic_front_url: "https://example.com/nic-front.jpg",
        nic_back_url: "https://example.com/nic-back.jpg",
        avatar_url: "https://example.com/ava.jpg",
      },
    };
    const res = makeRes();

    await completeBuyerOnboarding(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Buyer onboarding complete!");
  });

  test("completeFarmerOnboarding updates farmer and user", async () => {
    jest.resetModules();

    const supabase = {
      from: jest
        .fn()
        .mockImplementationOnce(() => thenable({ data: null, error: null }))
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase }));

    const { completeFarmerOnboarding } = require("../../controllers/Auth/onboardingController");

    const req = {
      user: { id: "u2" },
      body: {
        lat: 7.1,
        lng: 80.6,
        location: "Kandy",
        farm_size: 10,
        primary_crops: ["Mango"],
        nic_front_url: "https://example.com/nic-front.jpg",
        nic_back_url: "https://example.com/nic-back.jpg",
        proof_of_farming_url: "https://example.com/proof.jpg",
        avatar_url: "https://example.com/ava.jpg",
      },
    };
    const res = makeRes();

    await completeFarmerOnboarding(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Farmer onboarding complete!");
  });
});
