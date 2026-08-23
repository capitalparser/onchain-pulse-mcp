import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  EthDemandCompassV2SnapshotSchema,
  type EthDemandCompassV2Snapshot,
} from "../eth_demand_compass/types.js";
import {
  EthEcosystemCaptureSnapshotSchema,
  type EthEcosystemCaptureSnapshot,
} from "../eth_ecosystem_capture/types.js";
import {
  EthValueCaptureSnapshotSchema,
  type EthValueCaptureSnapshot,
} from "../eth_value_capture/types.js";
import {
  buildEthFrontendOverview,
  EthFrontendOverviewSnapshotSchema,
  type EthFrontendOverviewSnapshot,
} from "../frontend_contract/eth_overview.js";

export type ConsoleValueCaptureProvider = () => Promise<EthValueCaptureSnapshot>;
export type ConsoleEcosystemCaptureProvider = () => Promise<EthEcosystemCaptureSnapshot>;
export type ConsoleCompassProvider = () => Promise<EthDemandCompassV2Snapshot>;

export interface ConsoleGatewayOptions {
  valueCaptureProvider: ConsoleValueCaptureProvider;
  ecosystemCaptureProvider: ConsoleEcosystemCaptureProvider;
  compassProvider: ConsoleCompassProvider;
  host?: string;
  port?: number;
}

export interface ConsoleGatewayAddress {
  host: string;
  port: number;
}

type ProviderOptions = Pick<
  ConsoleGatewayOptions,
  "valueCaptureProvider" | "ecosystemCaptureProvider" | "compassProvider"
>;

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(value));
}

export function createConsoleGatewayHandler(options: ProviderOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://console-gateway.local");
    } catch {
      sendJson(response, 400, { error: "invalid_request" });
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "onchain-pulse-console-gateway",
      });
      return;
    }

    if (url.pathname !== "/api/v1/eth/overview") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    try {
      const [rawValueCapture, rawEcosystemCapture, rawCompass] = await Promise.all([
        options.valueCaptureProvider(),
        options.ecosystemCaptureProvider(),
        options.compassProvider(),
      ]);
      const valueCapture = EthValueCaptureSnapshotSchema.safeParse(rawValueCapture);
      const ecosystemCapture = EthEcosystemCaptureSnapshotSchema.safeParse(rawEcosystemCapture);
      const compass = EthDemandCompassV2SnapshotSchema.safeParse(rawCompass);
      if (!valueCapture.success || !ecosystemCapture.success || !compass.success) {
        sendJson(response, 502, { error: "upstream_snapshot_invalid" });
        return;
      }

      const overview = buildEthFrontendOverview({
        valueCapture: valueCapture.data,
        ecosystemCapture: ecosystemCapture.data,
        compass: compass.data,
        generatedAt: new Date(),
      });
      const validatedOverview: EthFrontendOverviewSnapshot =
        EthFrontendOverviewSnapshotSchema.parse(overview);
      sendJson(response, 200, validatedOverview);
    } catch {
      sendJson(response, 503, { error: "overview_unavailable" });
    }
  };
}

export function createConsoleGatewayServer(options: ConsoleGatewayOptions): {
  server: Server;
  start: () => Promise<ConsoleGatewayAddress>;
  stop: () => Promise<void>;
} {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8788;
  const server = createHttpServer(createConsoleGatewayHandler(options));

  return {
    server,
    start: () => new Promise<ConsoleGatewayAddress>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("console_gateway_address_unavailable"));
          return;
        }
        resolve({ host, port: address.port });
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    }),
    stop: () => new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => error === undefined ? resolve() : reject(error));
    }),
  };
}
