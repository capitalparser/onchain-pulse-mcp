import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runTelegramAlert } from "./alerts/run.js";
import { startTelegramAlertDaemon } from "./alerts/daemon.js";
import { makeContext } from "./adapters/base.js";
import { realFetcher } from "./cli/fetcher.js";
import { runWarmup } from "./cli/warmup.js";
import { runCompassBacktestCli } from "./backtest/cli.js";
import { createFreeOnlyCompassProvider, createFreeOnlySnapshotProvider } from "./dashboard/provider.js";
import { createDashboardServer } from "./dashboard/server.js";
import { loadEnv } from "./env.js";
import { runIntelligenceCollectCli } from "./intelligence_core/cli.js";
import { createServer, handleEthDemandCompass, handleEthValueCapture } from "./server.js";

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "compass-backtest") {
    const result = await runCompassBacktestCli(process.argv.slice(3));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result));
    return;
  }
  const env = loadEnv(process.env);
  if (mode === "warmup") {
    const days = Number(process.env.OPM_WARMUP_DAYS ?? 30);
    const keys = process.env.OPM_WARMUP_KEYS?.split(",").filter(Boolean);
    const result = await runWarmup({ historyPath: env.historyPath, days, keys, fetcher: realFetcher });
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result));
    return;
  }
  if (mode === "intelligence-collect") {
    const result = await runIntelligenceCollectCli(env);
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result));
    return;
  }

  if (mode === "dashboard" || mode === "telegram-alert" || mode === "telegram-daemon") {
    const ctx = makeContext({ env });
    const snapshotProvider = createFreeOnlySnapshotProvider((input) =>
      handleEthValueCapture(input, { env, ctx }),
    );
    const compassProvider = createFreeOnlyCompassProvider((input) =>
      handleEthDemandCompass(input, { env, ctx }),
    );
    if (mode === "dashboard") {
      const dashboard = createDashboardServer({
        provider: snapshotProvider,
        compassProvider,
        host: env.dashboard?.host ?? "127.0.0.1",
        port: env.dashboard?.port ?? 8787,
      });
      const address = await dashboard.start();
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ mode: "dashboard", ...address }));
      return;
    }
    if (mode === "telegram-alert") {
      const result = await runTelegramAlert({ env, provider: snapshotProvider });
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(result));
      if (result.status === "failed") process.exitCode = 1;
      return;
    }

    const telegram = env.telegram;
    if (!telegram?.enabled || !telegram.botToken || !telegram.chatId) {
      const result = await runTelegramAlert({ env, provider: snapshotProvider });
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(result));
      return;
    }
    const daemon = startTelegramAlertDaemon({
      intervalMs: telegram.intervalMs,
      runCycle: () => runTelegramAlert({ env, provider: snapshotProvider }),
      onCycle: (result) => {
        // eslint-disable-next-line no-console
        console.error(JSON.stringify(result));
      },
      signalTarget: process,
    });
    await daemon.done;
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
