import { initPostgresSchema } from "./db/init.js";
import { initGraphSchema } from "./services/graph.js";
import { getSoul, getUserModel } from "./services/identity.js";

export async function bootstrap(): Promise<void> {
  await initPostgresSchema();
  await initGraphSchema();
  await getSoul();
  await getUserModel();
}
