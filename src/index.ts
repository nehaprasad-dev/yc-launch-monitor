import { env } from "./config/env.js";
import { createApp } from "./server/app.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`YC Launch Monitor listening on ${env.APP_BASE_URL}`);
});
