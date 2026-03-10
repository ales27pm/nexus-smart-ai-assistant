let loaded = false;

export const CoreMLLLM = {
  loadModel: async () => {
    loaded = true;
  },
  unloadModel: async () => {
    loaded = false;
  },
  isLoaded: async () => loaded,
  generate: async () => "",
  cancel: async () => undefined,
  tokenize: async () => [],
  decode: async () => "",
  generateFromTokens: async () => [],
  beginGenerationSession: async () => true,
  generateNextToken: async () => null,
  endGenerationSession: async () => undefined,
  getRuntimeMetrics: async () => ({}),
};

export default CoreMLLLM;
