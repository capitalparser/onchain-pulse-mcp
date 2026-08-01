import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { EthWindowSchema, type EthValueCaptureSnapshot, type EthWindow } from "../eth_value_capture/types.js";

export type DashboardSnapshot = Omit<EthValueCaptureSnapshot, "capabilities">;
export type DashboardSnapshotProvider = (window: EthWindow) => Promise<EthValueCaptureSnapshot>;

export interface DashboardServerOptions {
  provider: DashboardSnapshotProvider;
  host?: string;
  port?: number;
}

export interface DashboardAddress {
  host: string;
  port: number;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}

function sendHtml(response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(DASHBOARD_HTML);
}

export function sanitizeDashboardSnapshot(snapshot: EthValueCaptureSnapshot): DashboardSnapshot {
  const {
    summary,
    window,
    cutoff_day,
    as_of,
    status,
    metrics,
    ratios,
    rollups,
    sources,
    source_status,
    stale_data,
    confidence,
    gaps,
    methodology_version,
  } = snapshot;
  return {
    summary,
    window,
    cutoff_day,
    as_of,
    status,
    metrics,
    ratios,
    ...(rollups === undefined ? {} : { rollups }),
    sources,
    source_status,
    stale_data,
    confidence,
    gaps,
    methodology_version,
  };
}

export function createDashboardHandler(options: Pick<DashboardServerOptions, "provider">) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://dashboard.local");
    } catch {
      sendJson(response, 400, { error: "invalid_request" });
      return;
    }
    if (url.pathname === "/") {
      sendHtml(response);
      return;
    }
    if (url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (url.pathname !== "/api/eth/value-capture") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    const parsedWindow = EthWindowSchema.safeParse(url.searchParams.get("window") ?? "30d");
    if (!parsedWindow.success) {
      sendJson(response, 400, { error: "invalid_window" });
      return;
    }

    try {
      const snapshot = await options.provider(parsedWindow.data);
      sendJson(response, 200, sanitizeDashboardSnapshot(snapshot));
    } catch {
      sendJson(response, 503, { error: "snapshot_unavailable" });
    }
  };
}

export function createDashboardServer(options: DashboardServerOptions): {
  server: Server;
  start: () => Promise<DashboardAddress>;
  stop: () => Promise<void>;
} {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8787;
  const server = createHttpServer(createDashboardHandler({ provider: options.provider }));

  return {
    server,
    start: () => new Promise<DashboardAddress>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("dashboard_address_unavailable"));
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

const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ETH value capture</title>
<style>body{font:16px system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;background:#10141a;color:#edf2f7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.card{background:#1d2530;padding:1rem;border-radius:.5rem}.value{font-size:1.4rem;font-weight:700}.muted{color:#aab7c4}.error{background:#632b31;padding:1rem;border-radius:.5rem}.hidden{display:none}</style></head>
<body><h1>Ethereum value capture</h1><p id="api-failure" class="error hidden" role="alert">Dashboard data could not be refreshed. Try again later.</p>
<section class="grid"><article class="card"><h2>30D burn</h2><p id="total-burn" class="value">—</p></article><article class="card"><h2>Blob burn</h2><p id="blob-burn" class="value">—</p></article><article class="card"><h2>L2 rent</h2><p id="l2-rent" class="value">—</p></article><article class="card"><h2>Net issuance</h2><p id="net-issuance" class="value">—</p></article></section>
<section class="card"><p><strong>Status:</strong> <span id="status">—</span> · <strong>Confidence:</strong> <span id="confidence">—</span></p><p><strong>Sources:</strong> <span id="sources">—</span></p><p><strong>Gaps:</strong> <span id="gaps">—</span></p><p class="muted">Refreshed: <span id="refreshed">—</span></p></section>
<script>const eth=v=>v===null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2})+' ETH';const pair=m=>m?eth(m.current)+' (prev '+eth(m.previous)+')':'—';const put=(id,v)=>document.getElementById(id).textContent=v;fetch('/api/eth/value-capture?window=30d').then(r=>r.ok?r.json():Promise.reject()).then(s=>{put('total-burn',pair(s.metrics.total_burn_eth));put('blob-burn',pair(s.metrics.blob_fee_burn_eth));put('l2-rent',pair(s.metrics.l2_rent_paid_eth));put('net-issuance',pair(s.metrics.net_issuance_eth));put('status',s.status);put('confidence',Math.round(s.confidence*100)+'%');put('sources',s.sources.join(', ')||'—');put('gaps',s.gaps.map(g=>g.code).join(', ')||'None');put('refreshed',s.as_of)}).catch(()=>document.getElementById('api-failure').classList.remove('hidden'));</script>
</body></html>`;
