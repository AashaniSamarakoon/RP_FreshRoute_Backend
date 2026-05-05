describe("farmer/dambullaScheduler", () => {
  test("schedules scrape and archive jobs", async () => {
    jest.resetModules();

    const schedule = jest.fn(() => ({ stop: jest.fn() }));
    jest.doMock("node-cron", () => ({ schedule }));

    jest.doMock("../../Services/farmer/dambullaScraper", () => ({
      importDambullaPrices: jest.fn(async () => ({ recordsImported: 1 })),
    }));

    jest.doMock("../../Services/farmer/priceArchiver", () => ({
      archiveOldPrices: jest.fn(async () => ({ archivedCount: 1 })),
    }));

    const { startDambullaScheduler } = require("../../Services/farmer/dambullaScheduler");

    startDambullaScheduler({ runOnStart: false });

    expect(schedule).toHaveBeenCalledWith("0 6 * * *", expect.any(Function));
    expect(schedule).toHaveBeenCalledWith("5 6 * * *", expect.any(Function));
  });
});
