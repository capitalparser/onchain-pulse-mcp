import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realFetcher } from "./cli/fetcher.js";
import { runWarmup } from "./cli/warmup.js";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  if (process.argv[2] === "warmup") {
    const days = Number(process.env.OPM_WARMUP_DAYS ?? 30);
    const keys = process.env.OPM_WARMUP_KEYS?.split(",").filter(Boolean);
    const result = await runWarmup({ historyPath: env.historyPath, days, keys, fetcher: realFetcher });
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result));
    return;
  }

  const { server } = createServer({ env });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
