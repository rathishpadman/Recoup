import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { signDemoSession } from "../cockpit/app/demo-auth.ts";

const API="https://recoup-api.onrender.com", WEB="https://recoup-self-eta.vercel.app";
const SECRET=process.env.RECOUP_INBOUND_SHARED_SECRET!;
const sign=(r:string)=>createHmac("sha256",SECRET).update(r).digest("hex");
const envf=readFileSync("C:/Rathish/Root Folder/CFO/Hackathon/Recoup1/Recoup/.env.local","utf8");
const sessSec=envf.split(/\r?\n/).find(l=>l.startsWith("RECOUP_DEMO_SESSION_SECRET="))!.slice(27).replace(/^["']|["']$/g,"");

async function runOne(tag:string){
  const pay=`PAY-RESET-${tag}`;
  const rcpt=JSON.stringify({paymentReference:pay,customerReference:"CUST-001",legalEntityReference:"LE-001",
    amountReceived:"1250.00",currency:"USD",settlementStatus:"settled"});
  const r1=await fetch(`${API}/rehearsal/cash-receipt`,{method:"POST",
    headers:{"content-type":"application/json","x-recoup-signature":sign(rcpt)},body:rcpt});
  const csv=["remittance_id,customer_reference,legal_entity_reference,payment_reference,currency,instructed_payment_amount,line_id,invoice_reference,instructed_amount,claimed_deduction_amount,claimed_reason_code,claimed_reason_text",
    `REM-${pay},CUST-001,LE-001,${pay},USD,1250.00,LINE-1,INV-2026-0912,1000.00,250.00,DMG,two pallets arrived damaged`].join(String.fromCharCode(10));
  const mail=JSON.stringify({messageId:`MSG-RESET-${tag}`,from:"ar@customer.example",to:"remittance@recoup.example",
    subject:`Remittance advice ${pay}`,receivedAt:new Date().toISOString(),
    attachment:{filename:`r-${pay}.csv`,mimeType:"text/csv",contentBase64:Buffer.from(csv,"utf8").toString("base64")}});
  const r2=await fetch(`${WEB}/api/inbound/remittance`,{method:"POST",
    headers:{"content-type":"application/json","x-recoup-signature":sign(mail)},body:mail});
  const out=await r2.json();
  console.log(`  test ${tag}: receipt ${r1.status}, email ${r2.status}, state=${out.state}, case=${out.caseId??"none"}`);
}

console.log("STEP 1 — run two tests");
await runOne("A"+Date.now().toString(36).slice(-4).toUpperCase());
await runOne("B"+Date.now().toString(36).slice(-4).toUpperCase());

const cookie=signDemoSession({allowedRoutes:["/agent-operations","/cfo","/governance/agents","/governance/connectors","/governance/evals-finops","/governance/memory","/governance/trace"],
  defaultRoute:"/cfo",displayName:"CFO",loginId:"CFO",role:"cfo"}, sessSec);
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1440,height:900}});
await c.addCookies([{name:"recoup_demo_session",value:cookie,domain:"recoup-self-eta.vercel.app",path:"/"}]);
const p=await c.newPage();

await p.goto(`${WEB}/agent-operations`,{waitUntil:"networkidle"});
const before=await p.locator('[data-testid="agent-operations-run-table"] tbody tr').count();
console.log(`STEP 2 — Agent Operations before reset: ${before} rows`);
await p.screenshot({path:"docs/qa/screenshots/prod/reset-before.png",fullPage:true});

console.log("STEP 3 — open CFO / Memory and use the button");
await p.goto(`${WEB}/governance/memory`,{waitUntil:"networkidle"});
console.log("  control present:", await p.locator('[data-testid="cash-demo-reset"]').count()===1);
await p.locator('[data-testid="cash-demo-reset-start"]').click();
await p.waitForTimeout(400);
console.log("  confirm step shown:", await p.locator('[data-testid="cash-demo-reset-confirm"]').count()===1);
await p.locator('[data-testid="cash-demo-reset-confirm"]').click();
await p.waitForTimeout(4000);
console.log("  status:", ((await p.locator('[data-testid="cash-demo-reset-status"]').textContent())??"").trim());
await p.screenshot({path:"docs/qa/screenshots/prod/reset-after-click.png",fullPage:true});

console.log("STEP 4 — Agent Operations after reset");
await p.goto(`${WEB}/agent-operations`,{waitUntil:"networkidle"});
const after=await p.locator('[data-testid="agent-operations-run-table"] tbody tr').count();
const empty=await p.locator('[data-testid="agent-operations-empty"]').count();
const counts:Record<string,string>={};
for(const k of ["active","queued","waiting","needsAttention"])
  counts[k]=((await p.locator(`[data-testid="agent-operations-count-${k}"]`).textContent())??"").trim();
console.log(`  rows: ${after}  empty-state: ${empty}  counters: ${JSON.stringify(counts)}`);
await p.screenshot({path:"docs/qa/screenshots/prod/reset-after.png",fullPage:true});
await b.close();
