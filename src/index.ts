import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runTelegramAlert } from "./alerts/run.js";
import { makeContext } from "./adapters/base.js";
import { realFetcher } from "./cli/fetcher.js";
import { runWarmup } from "./cli/warmup.js";
import { createFreeOnlySnapshotProvider } from "./dashboard/provider.js";
import { createDashboardServer } from "./dashboard/server.js";
import { loadEnv } from "./env.js";
import { createServer, handleEthValueCapture } from "./server.js";

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

  const mode = process.argv[2];
  if (mode === "dashboard" || mode === "telegram-alert") {
    const ctx = makeContext({ env });
    const snapshotProvider = createFreeOnlySnapshotProvider((input) =>
      handleEthValueCapture(input, { env, ctx }),
    );
    if (mode === "dashboard") {
      const dashboard = createDashboardServer({
        provider: snapshotProvider,
        host: env.dashboard?.host ?? "127.0.0.1",
        port: env.dashboard?.port ?? 8787,
      });
      const address = await dashboard.start();
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ mode: "dashboard", ...address }));
      return;
    }
    const result = await runTelegramAlert({ env, provider: snapshotProvider });
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result));
    if (result.status === "failed") process.exitCode = 1;
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
