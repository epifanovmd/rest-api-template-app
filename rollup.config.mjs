import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from 'rollup-plugin-typescript2';
import json from '@rollup/plugin-json';

import { defineConfig } from "rollup";
// @ts-ignore
import peerDepsExternal from "rollup-plugin-peer-deps-external";

const config = defineConfig({
  input: "src/server.ts",
  output: [
    {
      dir: "./build",
      format: "cjs",
      exports: "named",
      preserveModules: false,
      preserveModulesRoot: "src",
      sourcemap: true,
    },
  ],
  external: /node_modules/,
  plugins: [
    peerDepsExternal(),
    resolve(),
    commonjs(),
    terser(),
    json(),
    typescript({ useTsconfigDeclarationDir: true }),
  ],
});

export default config;
