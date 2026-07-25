// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  globalIgnores(["build/*", "node_modules/*"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  // {
  //   rules: {
  // "@typescript-eslint/explicit-function-return-type": "off",
  //   },
  // },
);