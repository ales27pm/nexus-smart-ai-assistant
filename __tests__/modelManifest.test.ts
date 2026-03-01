import {
  modelManifest,
  runtimeModelManifest,
  toModelDownloadConfig,
} from "@/utils/modelManifest";

describe("runtime model manifest", () => {
  it("loads a versioned runtime manifest with active version", () => {
    expect(runtimeModelManifest.manifestVersion).toBeGreaterThanOrEqual(1);
    expect(runtimeModelManifest.minimumAppSupportedSchemaVersion).toBe(1);
    expect(runtimeModelManifest.versions.length).toBeGreaterThan(0);

    const active = runtimeModelManifest.versions.find(
      (version) => version.id === runtimeModelManifest.activeVersionId,
    );

    expect(active).toBeDefined();
  });

  it("converts active runtime version to download config", () => {
    const active = runtimeModelManifest.versions.find(
      (version) => version.id === runtimeModelManifest.activeVersionId,
    );

    if (!active) {
      throw new Error("Expected active runtime version");
    }

    const downloadConfig = toModelDownloadConfig(active);

    expect(downloadConfig.modelName).toBe(active.modelName);
    expect(downloadConfig.modelRelativePath).toBe(active.modelRelativePath);
    expect(downloadConfig.files).toHaveLength(active.files.length);
    expect(downloadConfig.files[0].url).toBe(active.files[0].sources[0]);
  });

  it("keeps legacy model manifest available", () => {
    expect(modelManifest.activeModel.length).toBeGreaterThan(0);
  });
});
