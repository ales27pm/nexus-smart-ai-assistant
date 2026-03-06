import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { sha256 } from "js-sha256";

describe("verify_runtime_model_assets script", () => {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts/coreml/verify_runtime_model_assets.mjs",
  );

  async function createTempDir(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  it("fails when manifest path escapes assets root", async () => {
    const assetsRoot = await createTempDir("coreml-assets-");
    const outsideFile = path.join(os.tmpdir(), `outside-${Date.now()}.bin`);
    await fs.writeFile(outsideFile, "outside-data", "utf8");

    const manifestPath = path.join(assetsRoot, "manifest.json");
    const relativeOutside = path.relative(assetsRoot, outsideFile);
    const manifest = {
      manifestVersion: 1,
      activeVersionId: "v1",
      versions: [
        {
          id: "v1",
          files: [
            {
              path: relativeOutside,
              sha256: sha256("outside-data"),
            },
          ],
        },
      ],
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");

    const result = spawnSync(
      "node",
      [scriptPath, "--manifest", manifestPath, "--assets-root", assetsRoot],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid manifest path");
  });

  it("only deletes corrupted files when --delete-corrupted is set", async () => {
    const assetsRoot = await createTempDir("coreml-assets-");
    const relativeFile = "model.bin";
    const absoluteFile = path.join(assetsRoot, relativeFile);
    await fs.writeFile(absoluteFile, "corrupted", "utf8");

    const manifestPath = path.join(assetsRoot, "manifest.json");
    const manifest = {
      manifestVersion: 1,
      activeVersionId: "v1",
      versions: [
        {
          id: "v1",
          files: [
            {
              path: relativeFile,
              sha256: sha256("expected"),
            },
          ],
        },
      ],
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");

    const withoutDelete = spawnSync(
      "node",
      [scriptPath, "--manifest", manifestPath, "--assets-root", assetsRoot],
      { encoding: "utf8" },
    );

    expect(withoutDelete.status).toBe(1);
    await expect(fs.stat(absoluteFile)).resolves.toBeDefined();

    const withDelete = spawnSync(
      "node",
      [
        scriptPath,
        "--manifest",
        manifestPath,
        "--assets-root",
        assetsRoot,
        "--delete-corrupted",
      ],
      { encoding: "utf8" },
    );

    expect(withDelete.status).toBe(1);
    await expect(fs.stat(absoluteFile)).rejects.toThrow();
  });
});
