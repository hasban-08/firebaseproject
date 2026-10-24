module.exports = {
  devServer: (devServerConfig) => {
    devServerConfig.client = {
      ...devServerConfig.client,
      overlay: {
        errors: true,
        warnings: false,
        // AbortError ko overlay mein mat dikhao, baaqi sab errors dikhte rahenge
        runtimeErrors: (error) => !(error && error.name === "AbortError"),
      },
    };
    return devServerConfig;
  },
};