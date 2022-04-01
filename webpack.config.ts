import * as path from "path";
import { Configuration } from "webpack";
import ESLintPlugin from "eslint-webpack-plugin";
import nodeExternals from "webpack-node-externals";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";

const config: Configuration = {
  name: "server",
  target: "node",
  mode: "development",
  entry: path.resolve(__dirname, "src/server.ts"),
  output: {
    path: path.resolve(__dirname, "build"),
    filename: "server.js",
    publicPath: "/",
  },
  resolve: {
    extensions: [".ts"],
  },
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.ts?$/,
        exclude: /node_modules/,
        use: [
          { loader: "babel-loader" },
          { loader: "cache-loader" },
          {
            loader: "thread-loader",
            options: {
              workers: require("os").cpus().length - 1,
            },
          },
          {
            loader: "ts-loader",
            options: {
              // IMPORTANT! use happyPackMode mode to speed-up compilation and reduce errors reported to webpack
              happyPackMode: true,
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin({ async: true }),
    new ESLintPlugin({
      cache: true,
      emitWarning: true,
    }),
  ],
};

module.exports = config;
