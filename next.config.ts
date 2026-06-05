import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep pino and its worker-thread transport out of the bundle so the
  // pino-pretty worker (spawned via thread-stream in dev) can resolve
  // `thread-stream/lib/worker.js` at runtime instead of a bundled path.
  serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
};

export default withNextIntl(nextConfig);
