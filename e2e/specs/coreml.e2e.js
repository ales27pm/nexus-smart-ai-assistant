const { by, element, expect, waitFor, device } = require("detox");

describe("CoreML native e2e flows", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await element(by.text("E2E")).tap();
    await expect(element(by.id("e2e-coreml-title"))).toBeVisible();
  });

  it("runs model load + generate success path", async () => {
    await element(by.id("e2e-run-load-generate")).tap();

    await waitFor(element(by.id("e2e-scenario-load-generate")))
      .toHaveText("Model load + generate: passed")
      .withTimeout(180000);
  });

  it("runs compute-unit fallback path", async () => {
    await element(by.id("e2e-run-compute-fallback")).tap();

    await waitFor(element(by.id("e2e-scenario-compute-fallback")))
      .toHaveText("Compute-unit fallback to cpuOnly: passed")
      .withTimeout(180000);

    await expect(element(by.id("e2e-coreml-compute-unit"))).toHaveText(
      "Active compute unit: cpuOnly",
    );
  });

  it("runs cancellation path while generation is active", async () => {
    await element(by.id("e2e-run-cancel")).tap();
    await waitFor(element(by.id("e2e-generating-indicator")))
      .toBeVisible()
      .withTimeout(30000);

    await element(by.id("e2e-cancel-generation")).tap();

    await waitFor(element(by.id("e2e-scenario-cancel")))
      .toHaveText("Cancellation during active generation: passed")
      .withTimeout(60000);
  });
});
