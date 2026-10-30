import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const LOCAL_MONGOD = "./tools/mongodb/mongod";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    // Use the local mongod when present so mongodb-memory-server never downloads a binary;
    // elsewhere (CI, other machines) the library default applies.
    env: existsSync(LOCAL_MONGOD) ? { MONGOMS_SYSTEM_BINARY: LOCAL_MONGOD } : {},
  },
});
