import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // The same "@/" the app builds with. Without it a test can only reach
    // modules that import relatively, which quietly rules out testing
    // anything under components/ — and the effects there are exactly the code
    // where a wrong number is invisible until somebody is watching a fight.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
})
