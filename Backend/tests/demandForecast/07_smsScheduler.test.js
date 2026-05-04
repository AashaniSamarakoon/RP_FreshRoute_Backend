describe("farmer/smsScheduler", () => {
  test("registers cron schedule with timezone", async () => {
    jest.resetModules();

    process.env.SMS_MORNING_HOUR = "7";
    process.env.SMS_TIMEZONE = "Asia/Colombo";

    const schedule = jest.fn();
    jest.doMock("node-cron", () => ({ schedule }));

    jest.doMock("../../Services/farmer/smsService", () => ({ sendBatchSMS: jest.fn() }));
    jest.doMock("../../Services/farmer/forecastSMSBuilder", () => ({
      getFreshForecastsForSMS: jest.fn(async () => []),
      getSMSSubscribedFarmers: jest.fn(async () => []),
      compileSMSBatch: jest.fn(() => []),
      logSMSSend: jest.fn(async () => {}),
      wasForecastSMSSentToday: jest.fn(async () => true),
    }));

    const { startSMSScheduler } = require("../../Services/farmer/smsScheduler");
    startSMSScheduler();

    expect(schedule).toHaveBeenCalledWith(
      "0 7 * * *",
      expect.any(Function),
      expect.objectContaining({ timezone: "Asia/Colombo" }),
    );
  });
});
