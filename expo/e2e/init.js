const detox = require("detox");
const config = require("../.detoxrc");

beforeAll(async () => {
  await detox.init(config);
}, 300000);

afterAll(async () => {
  await detox.cleanup();
});
