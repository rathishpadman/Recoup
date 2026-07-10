import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";
import { seedCreditNegotiationContactsFromEnv } from "../src/services/creditNegotiationContactSeed.ts";

async function main(): Promise<void> {
  const result = await seedCreditNegotiationContactsFromEnv({
    env: loadLocalRuntimeEnvFiles()
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "seeded") {
    process.exitCode = 1;
  }
}

await main();
