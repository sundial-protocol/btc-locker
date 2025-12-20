const path = require("path");

module.exports = {
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "btc-locker.bundle.js",
    library: {
      name: "BTCLocker",
      type: "umd",
      umdNamedDefine: true,
    },
    globalObject: "this",
    chunkFormat: "array-push",
    publicPath: "",
  },
  mode: "production",
  target: "web",
  experiments: {
    asyncWebAssembly: true,
  },
  resolve: {
    fallback: {
      crypto: require.resolve("crypto-browserify"),
      buffer: require.resolve("buffer"),
      stream: require.resolve("stream-browserify"),
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.wasm$/,
        type: "webassembly/async",
      },
    ],
  },
  plugins: [
    new (require("webpack").ProvidePlugin)({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ],
};
