import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  EthValueCaptureSnapshotSchema,
  EthWindowSchema,
  type EthValueCaptureSnapshot,
  type EthWindow,
} from "../eth_value_capture/types.js";
import { deriveDashboardSignal } from "./signal.js";

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
    if (url.pathname === "/favicon.ico") {
      response.statusCode = 204;
      response.end();
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
      const parsedSnapshot = EthValueCaptureSnapshotSchema.safeParse(snapshot);
      if (!parsedSnapshot.success || parsedSnapshot.data.window !== parsedWindow.data) {
        sendJson(response, 502, { error: "snapshot_invalid" });
        return;
      }
      sendJson(response, 200, sanitizeDashboardSnapshot(parsedSnapshot.data));
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
<style>
:root{color-scheme:dark;--bg:#10141a;--panel:#1a222d;--border:#34404d;--ink:#f2f5f7;--muted:#aab7c4;--positive:#98d68c;--negative:#f2ac9a;--warning:#f2ce83;--neutral:#bed0e5}*{box-sizing:border-box}body{font:16px/1.45 system-ui,sans-serif;max-width:1080px;margin:2rem auto;padding:0 1rem 3rem;background:var(--bg);color:var(--ink)}h1,h2,p{margin:0}.eyebrow{color:var(--muted);font-size:.85rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.lead{max-width:720px;margin-top:.5rem;color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--border);border-radius:.75rem;padding:1.25rem}.hidden{display:none}.error{margin:1rem 0;background:#632b31;border:1px solid #bd6b73;padding:1rem;border-radius:.75rem}.judgment{margin:1.5rem 0;display:flex;gap:1rem;align-items:flex-start;border-left:5px solid var(--neutral)}.judgment.positive{border-color:var(--positive)}.judgment.negative{border-color:var(--negative)}.judgment.warning{border-color:var(--warning)}.judgment h2{font-size:1.55rem}.judgment p{margin-top:.35rem;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}.card{min-height:184px;display:flex;flex-direction:column;gap:.6rem}.card h2{font-size:.95rem;color:var(--muted)}.value{font-size:1.5rem;font-weight:750;letter-spacing:-.02em}.badge{display:inline-flex;align-self:flex-start;gap:.35rem;padding:.22rem .55rem;border:1px solid currentColor;border-radius:999px;font-size:.8rem;font-weight:700}.badge.positive{color:var(--positive)}.badge.negative{color:var(--negative)}.badge.warning{color:var(--warning)}.badge.neutral{color:var(--neutral)}.comparison{font-size:.85rem;color:var(--muted)}.trend{margin-top:auto;padding-top:.5rem}.trend svg{width:100%;height:38px;display:block}.trend-labels{display:flex;justify-content:space-between;color:var(--muted);font-size:.72rem}.details{display:grid;grid-template-columns:1.35fr .65fr;gap:1rem;margin-top:1rem}.details h2{font-size:1rem;margin-bottom:.65rem}.evidence{margin:0;padding-left:1.25rem}.evidence li+li{margin-top:.45rem}.quality{display:grid;gap:.55rem}.quality-row{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--border);padding-bottom:.45rem}.quality-row span:last-child{text-align:right;color:var(--muted);overflow-wrap:anywhere}.footer{margin-top:1rem;color:var(--muted);font-size:.82rem}@media(max-width:760px){body{margin:1rem auto}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.details{grid-template-columns:1fr}}@media(max-width:440px){.grid{grid-template-columns:1fr}.judgment{display:block}}
</style></head>
<body><header><p class="eyebrow">Ethereum value capture · 30D</p><h1>Is ETH value capture improving?</h1><p class="lead">A signal board for demand, L2 rent, and supply—not a raw-data list.</p></header>
<p id="api-failure" class="error hidden" role="alert">Dashboard data could not be refreshed. Try again later.</p>
<section id="judgment-banner" class="panel judgment neutral" aria-live="polite"><div><p class="eyebrow">Current reading</p><h2 id="judgment-title">Loading signal…</h2><p id="judgment-detail">Waiting for the latest snapshot.</p></div></section>
<section class="grid" aria-label="Key value capture indicators"><article class="panel card"><h2>30D ETH burn</h2><p id="total-burn" class="value">—</p><span id="total-burn-badge" class="badge neutral">Waiting for data</span><p id="total-burn-change" class="comparison">—</p><div id="total-burn-trend" class="trend"></div></article><article class="panel card"><h2>30D blob burn</h2><p id="blob-burn" class="value">—</p><span id="blob-burn-badge" class="badge neutral">Waiting for data</span><p id="blob-burn-change" class="comparison">—</p><div id="blob-burn-trend" class="trend"></div></article><article class="panel card"><h2>30D L2 rent</h2><p id="l2-rent" class="value">—</p><span id="l2-rent-badge" class="badge neutral">Waiting for data</span><p id="l2-rent-change" class="comparison">—</p><div id="l2-rent-trend" class="trend"></div></article><article class="panel card"><h2>30D net issuance</h2><p id="net-issuance" class="value">—</p><span id="net-issuance-badge" class="badge neutral">Waiting for data</span><p id="net-issuance-change" class="comparison">—</p><div id="net-issuance-trend" class="trend"></div></article></section>
<section class="details"><article class="panel"><h2>Why this reading</h2><ol id="evidence-list" class="evidence"><li>Waiting for the latest snapshot.</li></ol></article><aside id="data-quality" class="panel"><h2>Data quality</h2><div class="quality"><div class="quality-row"><strong>Status</strong><span id="status">—</span></div><div class="quality-row"><strong>Confidence</strong><span id="confidence">—</span></div><div class="quality-row"><strong>Sources</strong><span id="sources">—</span></div><div class="quality-row"><strong>Gaps</strong><span id="gaps">—</span></div></div></aside></section>
<p class="footer">30D direction compares the current 30D window with the prior 30D window. Value-capture lens; not a price forecast or trade call. Refreshed: <span id="refreshed">—</span></p>
<script>
const byId=id=>document.getElementById(id);const eth=value=>value===null?'—':Number(value).toLocaleString(undefined,{maximumFractionDigits:2})+' ETH';const hasMetric=metric=>metric&&metric.current!==null&&metric.previous!==null&&metric.delta!==null;const toneClass=tone=>tone==='positive'||tone==='negative'||tone==='warning'?tone:'neutral';const directionArrow=direction=>direction==='up'?'↑':direction==='down'?'↓':direction==='flat'?'→':'?';
const deriveSignal=${deriveDashboardSignal.toString()};
function renderTrend(id,metric,tone){const root=byId(id);root.replaceChildren();if(!hasMetric(metric)){root.textContent='No comparable period';return}const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 220 38');svg.setAttribute('role','img');svg.setAttribute('aria-label','Current 30D versus prior 30D comparison');const min=Math.min(metric.previous,metric.current),max=Math.max(metric.previous,metric.current),range=max-min||1;const y=value=>30-((value-min)/range)*22;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1','12');line.setAttribute('x2','208');line.setAttribute('y1',''+y(metric.previous));line.setAttribute('y2',''+y(metric.current));line.setAttribute('stroke',tone==='positive'?'#98d68c':tone==='negative'?'#f2ac9a':'#bed0e5');line.setAttribute('stroke-width','2');svg.append(line);[[12,metric.previous],[208,metric.current]].forEach(([x,value])=>{const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',''+x);dot.setAttribute('cy',''+y(value));dot.setAttribute('r','4');dot.setAttribute('fill','#10141a');dot.setAttribute('stroke',tone==='positive'?'#98d68c':tone==='negative'?'#f2ac9a':'#bed0e5');dot.setAttribute('stroke-width','2');svg.append(dot)});const labels=document.createElement('div');labels.className='trend-labels';labels.innerHTML='<span>Prior 30D</span><span>Current 30D</span>';root.append(svg,labels)}
function renderCard(id,metric,signalCard){byId(id).textContent=eth(metric.current);const badge=byId(id+'-badge');badge.className='badge '+toneClass(signalCard.tone);badge.textContent=directionArrow(signalCard.direction)+' '+signalCard.interpretation;byId(id+'-change').textContent=signalCard.changeLabel;renderTrend(id+'-trend',metric,signalCard.tone)}
fetch('/api/eth/value-capture?window=30d').then(response=>response.ok?response.json():Promise.reject()).then(s=>{const r=deriveSignal(s);const banner=byId('judgment-banner');banner.className='panel judgment '+toneClass(r.judgment.tone);byId('judgment-title').textContent=r.judgment.label;byId('judgment-detail').textContent=r.judgment.detail;const evidence=byId('evidence-list');evidence.replaceChildren(...r.evidence.slice(0,3).map(text=>{const item=document.createElement('li');item.textContent=text;return item}));renderCard('total-burn',s.metrics.total_burn_eth,r.cards[0]);renderCard('blob-burn',s.metrics.blob_fee_burn_eth,r.cards[1]);renderCard('l2-rent',s.metrics.l2_rent_paid_eth,r.cards[2]);renderCard('net-issuance',s.metrics.net_issuance_eth,r.cards[3]);byId('status').textContent=s.status;byId('confidence').textContent=Math.round(s.confidence*100)+'%';byId('sources').textContent=s.sources.join(', ')||'—';byId('gaps').textContent=s.gaps.map(g=>g.code).join(', ')||'None';byId('refreshed').textContent=s.as_of}).catch(()=>byId('api-failure').classList.remove('hidden'));
</script></body></html>`;
