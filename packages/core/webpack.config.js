import path from "path";
import webpack from "webpack";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

export default {
  entry: ["./src/index.ts"],
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
    assetModuleFilename: "[name][ext]",
    webassemblyModuleFilename: "btc-locker.wasm",
  },
  mode: "production",
  target: "web",
  experiments: {
    asyncWebAssembly: true,
  },
  optimization: {
    moduleIds: "deterministic",
  },
  resolve: {
    extensions: [".ts", ".js"],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
    fallback: {
      crypto: require.resolve("crypto-browserify"),
      buffer: require.resolve("buffer"),
      stream: require.resolve("stream-browserify"),
      https: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.build.json",
          },
        },
      },
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
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ],
};
