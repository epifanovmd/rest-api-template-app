import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import { defineConfig } from "rollup";
import typescript from "rollup-plugin-typescript2";

const config = defineConfig(() => {
  return {
    input: "src/app.server.ts",
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
      resolve(),
      commonjs(),
      terser(),
      json(),
      typescript({
        useTsconfigDeclarationDir: true,
        tsconfig: "./tsconfig.production.json",
      }),
    ],
  };
});

export default config;
