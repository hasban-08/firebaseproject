module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.module.rules.push({
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      });
      return webpackConfig;
    },
  },
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
