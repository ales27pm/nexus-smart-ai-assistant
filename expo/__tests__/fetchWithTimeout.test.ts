import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("clears timeout when fetch rejects", async () => {
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));

    await expect(
      fetchWithTimeout("https://example.com", {}, 5000),
    ).rejects.toThrow("network down");

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
