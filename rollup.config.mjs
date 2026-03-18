import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import { defineConfig } from "rollup";
import copy from "rollup-plugin-copy";
import typescript from "rollup-plugin-typescript2";

const config = defineConfig(() => {
  return {
    input: "src/main.ts",
    output: [
      {
        dir: "./build",
        format: "cjs",
        exports: "named",
        preserveModules: true, // для Type ORM нужно сохранить структуру для динамической загрузки entity
        preserveModulesRoot: "src",
        sourcemap: true,
      },
    ],
    external: /node_modules/,
    plugins: [
      resolve({
        preferBuiltins: true,
        exportConditions: ["node", "import", "require"],
        mainFields: ["module", "main"],
        extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      }),
      commonjs(),
      // terser({
      //   mangle: {
      //     keep_fnames: true,
      //     keep_classnames: true,
      //   },
      // }),
      json(),
      typescript({
        useTsconfigDeclarationDir: true,
        tsconfig: "./tsconfig.production.json",
      }),
      copy({
        targets: [
          { src: "src/modules/mailer/*.ejs", dest: "build/modules/mailer" },
        ],
        hook: "writeBundle",
      }),
    ],
  };
});

export default config;
