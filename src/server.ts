import { app } from "./app.js";
import { env } from "./shared/config/env.js";

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});