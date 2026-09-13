import { createApp } from "./app.js";
import { config } from "./config.js";
import { upstream } from "./upstream.js";
const { app, cache } = await createApp();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.info(`[pony] http://localhost:${config.port}`);
  void upstream.check();
});
const timer = setInterval(
  () => void cache.cleanup().catch(console.error),
  3600000,
);
timer.unref();
const healthTimer = setInterval(() => void upstream.check(), 300000);
healthTimer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    clearInterval(healthTimer);
    server.close(() => process.exit(0));
  });
