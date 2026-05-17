import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const { server } = createServer({ env });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
