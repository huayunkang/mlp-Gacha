// Isolated test build: records real browser resource timings into inspectable DOM.
// Never copied to dist/client or deployed.
import { cp, readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("test-results/qa-client", { recursive: true });
await cp("dist/client", "test-results/qa-client", { recursive: true });
const html = await readFile("test-results/qa-client/index.html", "utf8");
await writeFile(
  "test-results/qa-client/index.html",
  html.replace("</body>", '<script src="/qa-network.js"></script></body>'),
);
await writeFile(
  "test-results/qa-client/qa-network.js",
  `const qa=new URLSearchParams(location.search).get('qa');
if(qa==='reduced'){const original=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('prefers-reduced-motion')?Object.assign(new EventTarget(),{matches:true,media:q,onchange:null,addListener(){},removeListener(){}}):original(q)}
if(qa==='offline')Object.defineProperty(navigator,'onLine',{get:()=>false});
if(qa==='duplicate'){const original=window.fetch.bind(window);window.fetch=(input,init)=>original(typeof input==='string'&&input.startsWith('/api/random')?'/api/metadata/172904?filter=100073':input,init)}
const report=document.createElement('output');report.id='qa-network';report.hidden=true;document.body.append(report);function refresh(){report.textContent=JSON.stringify(performance.getEntriesByType('resource').map(r=>({url:r.name,type:r.initiatorType})));}new PerformanceObserver(refresh).observe({type:'resource',buffered:true});refresh();`,
);
