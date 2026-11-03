/* Middelburg International JC Register — offline, read-only copy.
   Data lives in data.enc (AES-GCM, key from the shared password via PBKDF2). */
const S={machines:{},list:[],client:null,curId:null,tab:"basic",q:"",view:"main",days:30,backTo:null};
const LIST_MAX=150,METER={hours:"URE",ha:"HA",bales:"BALES",km:"KM"};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtD=iso=>{if(!iso)return"";const[y,m,d]=iso.split("-");return `${d}.${m}.${y.slice(2)}`};
const num=v=>v==null||v===""||isNaN(v)?null:Number(v);
const fmtR=n=>num(n)==null?"—":"R "+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/,/g," ");
const fmtH=n=>n==null?"":Number(n).toLocaleString("en-US").replace(/,/g," ");
const r2=n=>Math.round(n*100)/100;
function toast(m){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,2800)}
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};

/* ---------- unlock ---------- */
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function decrypt(pw){
  const res=await fetch("data.enc",{cache:"no-cache"}).catch(()=>null)||await caches.match("data.enc");
  if(!res||!res.ok)throw new Error("nodata");
  const e=await res.json();
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
  const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(e.salt),iterations:e.iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
  let plain;try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(e.iv)},key,b64(e.ct))}catch(_){throw new Error("badpw")}
  const txt=await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(txt);
}
async function unlock(pw,remember){
  $("lockErr").textContent="";$("lockBtn").disabled=true;$("lockBtn").textContent="Opening…";
  try{
    const d=await decrypt(pw);
    if(remember)store.set("jcr-pw",pw);else store.del("jcr-pw");
    S.built=d.built;d.machines.forEach(m=>S.machines[m._id]=m);
    S.list=d.machines.map(m=>({id:m._id,c:m.customer||"",i:m.item||"",s:m.serial||"",r:m.reg||"",sold:!!m.sold,in:!!m.inactive,n:m.jobs.length,j:m.jobs.map(j=>j.jc).filter(x=>x!=null),f:(m.folders||[]).join(" "),rc:recentOf(m)}));
    $("lock").hidden=true;$("app").hidden=false;$("built").textContent="Data as at "+fmtD(d.built);render();
  }catch(e){
    $("lockErr").textContent=e.message=="badpw"?"That password didn't work. Check it and try again.":"Couldn't load the data. Connect to the internet once, then try again.";
    store.del("jcr-pw");
  }
  $("lockBtn").disabled=false;$("lockBtn").textContent="Open register";
}
$("lockForm").addEventListener("submit",e=>{e.preventDefault();unlock($("pw").value,$("remember").checked)});
$("lockOut").addEventListener("click",()=>{store.del("jcr-pw");location.reload()});

/* ---------- checks ---------- */
function sortedJobs(m){return [...m.jobs].sort((a,b)=>{const x=a.date||"9999",y=b.date||"9999";return x<y?-1:x>y?1:(+a.jc||0)-(+b.jc||0)})}
function hourFlags(jobs){
  const idx=jobs.map((j,i)=>j.hours!=null&&j.date?i:-1).filter(i=>i>=0),n=idx.length,len=Array(n).fill(1),prev=Array(n).fill(-1);
  for(let a=0;a<n;a++)for(let b=0;b<a;b++)if(jobs[idx[b]].hours<=jobs[idx[a]].hours&&len[b]+1>len[a]){len[a]=len[b]+1;prev[a]=b}
  let best=0;for(let a=1;a<n;a++)if(len[a]>len[best])best=a;
  const keep=new Set();for(let a=n?best:-1;a>=0;a=prev[a])keep.add(idx[a]);
  const out={};idx.forEach(i=>{if(!keep.has(i))out[i]="Out of sequence"});return out;
}

/* ---------- recently added ---------- */
const isoDay=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const todayISO=()=>isoDay(new Date());
const daysAgoISO=n=>isoDay(new Date(Date.now()-n*86400000));
/* "added" = the day the card was filed in the register; older rows without a filed date fall back to the card date */
const addedOn=j=>{const t=j.approvedAt||j.addedAt;return t?isoDay(new Date(t)):null};
const addedKey=r=>r.d||"";  /* listed by the service date on the card */
function recentOf(m){const lim=daysAgoISO(120),td=todayISO();
  return (m.jobs||[]).map(j=>[j,addedOn(j)]).filter(([j,a])=>a?a>=lim:(j.date&&j.date>=lim&&j.date<=td)).map(([j,a])=>({jc:j.jc,d:j.date||null,a,t:(j.details||[]).join("; ").slice(0,90),h:j.hours??null,tot:j.detail?.totals?.total??null}))}
function recentCount(rows,days){const lim=daysAgoISO(days),td=todayISO();return rows.filter(r=>addedKey(r)>=lim&&addedKey(r)<=td).length}
function recentHTML(rows,days){
  const lim=daysAgoISO(days),td=todayISO();
  const list=rows.filter(r=>addedKey(r)>=lim&&addedKey(r)<=td).sort((a,b)=>{const x=addedKey(a),y=addedKey(b);if(x!=y)return x<y?1:-1;const p=a.d||"",q=b.d||"";return p<q?1:p>q?-1:(+b.jc||0)-(+a.jc||0)});
  const total=r2(list.reduce((s,r)=>s+(num(r.tot)||0),0)),withTot=list.filter(r=>num(r.tot)!=null).length;
  return `<button class="btn ghost back" data-act="back">← Back</button>
  <div class="titlerow"><div><h1>Recently added</h1><div class="sub">Job cards with a service date in the last ${days} days, newest first.</div></div>
   <div class="seg" role="group" aria-label="Period">${[30,60,90].map(d=>`<button data-act="days" data-d="${d}" aria-pressed="${d==days}">${d} days</button>`).join("")}</div></div>
  <div class="stats"><div><b class="num">${list.length}</b><span>job cards</span></div><div><b class="num">${new Set(list.map(r=>r.c)).size}</b><span>clients</span></div>${withTot?`<div><b class="num">${fmtR(total)}</b><span>invoiced on ${withTot} card${withTot==1?"":"s"} with detail</span></div>`:""}</div>
  ${list.length?`<div class="tablebox" style="border-top:1px solid var(--line);border-radius:8px"><table><thead><tr><th>DATUM</th><th>J/C</th><th>KLIENT</th><th>MASJIEN</th><th>BESONDERHEDE</th><th class="r">URE</th><th class="r">TOTAAL</th></tr></thead><tbody>
   ${list.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td class="num">${fmtD(r.d)}</td><td class="num">${esc(r.jc??"—")}</td><td><b>${esc(r.c)}</b></td><td>${esc(r.i)}</td><td>${esc(r.t)}</td><td class="r num">${r.h!=null?fmtH(r.h):""}</td><td class="r num">${num(r.tot)!=null?fmtR(r.tot):""}</td></tr>`).join("")}
  </tbody></table></div>`:`<div class="empty"><h2>Nothing in the last ${days} days</h2><p>Job cards appear here when the service date on the card falls in this period. Try a longer period.</p></div>`}`;
}

function recentRows(){return S.list.flatMap(e=>e.rc.map(r=>({...r,id:e.id,c:e.c,i:e.i})))}
/* ---------- side list ---------- */
function clients(){const g={};for(const e of S.list)(g[e.c]=g[e.c]||[]).push(e);return Object.keys(g).sort((a,b)=>a.localeCompare(b)).map(c=>({c,ms:g[c]}))}
function search(q){
  q=q.trim().toLowerCase();const w=q.split(/\s+/),isNum=/^\d{3,}$/.test(q),out=[];
  for(const e of [...S.list].sort((a,b)=>a.c.localeCompare(b.c)||a.i.localeCompare(b.i))){
    const h=[e.c,e.i,e.s,e.r,e.f].join(" ").toLowerCase();
    if(w.every(x=>h.includes(x)))out.push({e});
    else if(isNum){const m=e.j.filter(x=>String(x).startsWith(q));if(m.length)out.push({e,hit:m.length==1?`J/C ${m[0]}`:`${m.length} job cards from ${q}…`})}
  }return out;
}
const rank=e=>(e.sold?2:0)+(e.in?1:0);
function row(e,hit,showC){return `<li><button data-m="${esc(e.id)}" aria-current="${S.curId==e.id}"><span class="c">${showC?esc(e.c):esc(e.i)}${e.sold?` <span class="chip src">Sold</span>`:""}${e.in?` <span class="chip src">Inactive</span>`:""}</span><span class="s">${showC?esc(e.i)+" · ":""}<span class="num">${esc(e.s||"no serial")}</span>${showC?"":` · ${e.n} job card${e.n==1?"":"s"}`}</span>${hit?`<span class="hit">${esc(hit)}</span>`:""}</button></li>`}
function renderSide(){
  const L=$("mlist"),lab=$("mcount");
  if(S.q.trim()){
    const q=S.q.trim().toLowerCase(),cl=clients().filter(x=>x.c.toLowerCase().includes(q)),ms=search(S.q);
    lab.textContent=`${cl.length} client${cl.length==1?"":"s"} · ${ms.length} machine${ms.length==1?"":"s"}`;
    L.innerHTML=(cl.length?`<li class="label" style="padding:8px 10px 2px">Clients</li>`+cl.slice(0,30).map(x=>`<li><button data-client="${esc(x.c)}"><span class="c">${esc(x.c)}</span><span class="s">${x.ms.length} machine${x.ms.length==1?"":"s"}</span></button></li>`).join(""):"")
      +(ms.length?`<li class="label" style="padding:10px 10px 2px">Machines</li>`+ms.slice(0,LIST_MAX).map(({e,hit})=>row(e,hit,true)).join(""):"")
      ||`<li class="sub" style="padding:8px 10px">Nothing matches “${esc(S.q.trim())}”.</li>`;
  }else if(S.client){
    const ms=S.list.filter(e=>e.c==S.client).sort((a,b)=>rank(a)-rank(b)||a.i.localeCompare(b.i));
    lab.innerHTML=`<button class="btn ghost" data-act="clients" style="padding:4px 6px;margin:-4px 0 4px -6px;text-transform:none;letter-spacing:0;font-size:13px">← All clients</button>`;
    L.innerHTML=`<li style="padding:2px 10px 8px"><div class="c" style="font-family:var(--display);font-weight:700;font-size:20px;text-transform:uppercase;line-height:1.1">${esc(S.client)}</div><div class="s" style="color:var(--muted);font-size:12px">${ms.length} machine${ms.length==1?"":"s"}</div></li>`+ms.map(e=>row(e,null,false)).join("");
  }else{
    const cl=clients(),rn=recentCount(recentRows(),30);let last="";lab.textContent=`${cl.length} clients · ${S.list.length} machines`;
    L.innerHTML=`<li><button class="recentbtn" data-act="recent" aria-current="${S.view=="recent"}"><span class="c">Recently added</span><span class="s">${rn} job card${rn==1?"":"s"} in the last 30 days</span></button></li>`+cl.map(x=>{const ch=/[A-Z]/.test(x.c[0]||"")?x.c[0]:"#",head=ch!=last?`<li class="label" style="padding:10px 10px 2px">${ch}</li>`:"";last=ch;const act=x.ms.filter(e=>!e.sold&&!e.in).length;
      return head+`<li><button data-client="${esc(x.c)}"><span class="c">${esc(x.c)}</span><span class="s">${x.ms.length} machine${x.ms.length==1?"":"s"}${act!=x.ms.length?` · ${act} active`:""}</span></button></li>`}).join("");
  }
  $("wrap").classList.toggle("has-sel",!!S.curId||S.view=="recent");
}

/* ---------- machine ---------- */
function renderMain(){
  const m=S.machines[S.curId];
  if(!m&&(S.view=="recent"||!S.client)){$("main").innerHTML=recentHTML(recentRows(),S.days);return}
  if(!m){$("main").innerHTML=S.client?`<div class="empty"><h2>${esc(S.client)}</h2><p>Pick one of this client's machines on the left to see its job card history.</p></div>`:`<div class="empty"><h2>Pick a client</h2><p>Choose a client on the left, then one of their machines. You can also search by client, model, serial number or job card number.</p></div>`;return}
  const jobs=sortedJobs(m),hf=hourFlags(jobs),unit=METER[m.meter]||"URE",others=(m.alsoUnder||[]).filter(id=>S.machines[id]);
  let html=`<button class="btn ghost back" data-act="back">← Back</button>
  <div class="titlerow"><div><h1>${esc(m.customer)}</h1><div class="sub">${esc(m.item)} · ${jobs.length} job card${jobs.length==1?"":"s"}${m.sold?` · <span class="chip src">In a SOLD folder</span>`:""}${m.inactive?` · <span class="chip src">Inactive</span>`:""}</div></div>
   <div class="bar"><button class="btn" data-act="export">Download Excel sheet</button></div></div>
  <dl class="sheethead"><dt>KLIENT</dt><dd>${esc(m.customer)}</dd><dt>ITEM</dt><dd>${esc(m.item)}${m.reg?` <span class="num" style="color:var(--muted);font-weight:500">&nbsp; ${esc(m.reg)}</span>`:""}</dd>
   <dt>S/N</dt><dd class="num">${esc(m.serial||"—")}</dd><dt>AANGEKOOP</dt><dd class="num">${esc(m.purchased||"—")}</dd>${(m.notes||[]).length?`<dt>NOTA</dt><dd>${m.notes.map(esc).join("<br>")}</dd>`:""}</dl>
  ${others.length?`<p class="note">Same serial also on file under ${others.map(id=>`<a href="#" data-m="${esc(id)}">${esc(S.machines[id].customer)}${S.machines[id].sold?" (sold)":""}</a>`).join(", ")}.</p>`:""}
  <div class="tabs" role="tablist"><button role="tab" data-tab="basic" aria-selected="${S.tab=="basic"}">Werkkaarte</button><button role="tab" data-tab="detail" aria-selected="${S.tab=="detail"}">Detail</button></div>`;
  if(S.tab=="basic"){
    html+=`<div class="tablebox"><table><thead><tr><th>DATUM</th><th>J/C NOMMER</th><th>BESONDERHEDE</th><th class="r">${unit}</th></tr></thead><tbody>`+
      jobs.map((j,i)=>`<tr><td class="num">${j.date?fmtD(j.date):`<span style="color:var(--muted)">${esc(j.dateRaw||"—")}</span>`}${j.issue?`<br><span class="chip" title="${esc(j.issue)}">Check date</span>`:""}</td><td class="num">${esc(j.jc??"—")}</td>
      <td>${j.details.length>1?`<ol class="det">${j.details.map(d=>`<li>${esc(d)}</li>`).join("")}</ol>`:esc(j.details[0]||"")}</td>
      <td class="r num">${j.hours!=null?fmtH(j.hours):j.meterRaw?`<span style="color:var(--muted)">${esc(j.meterRaw)}</span>`:"N/A"}${hf[i]?`<br><span class="chip">${hf[i]}</span>`:""}</td></tr>`).join("")+`</tbody></table></div>`;
  }else{
    const wd=jobs.filter(j=>j.detail),spend=r2(wd.reduce((s,j)=>s+(num(j.detail.totals?.total)||0),0));
    html+=`<div class="tablebox"><table><thead><tr><th>DATUM</th><th>J/C</th><th>TECH</th><th class="r">ARBEID (H)</th><th class="r">REIS (KM)</th><th class="r">ONDERDELE</th><th class="r">ARBEID</th><th class="r">TOTAAL INCL. BTW</th></tr></thead><tbody>`+
      jobs.map(j=>{const d=j.detail,date=j.date?fmtD(j.date):esc(j.dateRaw||"—");
        if(!d)return `<tr><td class="num">${date}</td><td class="num">${esc(j.jc??"—")}</td><td colspan="5"><span class="chip src">From Excel, no detail</span></td><td class="r num">${j.amount!=null?fmtR(j.amount):""}</td></tr>`;
        const t=d.totals||{};
        return `<tr><td class="num">${date}</td><td class="num">${esc(j.jc)}</td><td>${esc(d.tech||"—")}</td><td class="r num">${d.labourHrs??"—"}</td><td class="r num">${d.travelKm??"—"}</td><td class="r num">${fmtR(t.spares)}</td><td class="r num">${fmtR(t.labour)}</td><td class="r num"><b>${fmtR(t.total)}</b></td></tr>
        <tr><td></td><td colspan="7" style="padding-top:0"><details class="more"><summary>${(d.parts||[]).length} part line${(d.parts||[]).length==1?"":"s"}${d.invoiceNo?` · invoice ${esc(d.invoiceNo)}${d.invoiceDate?" ("+fmtD(d.invoiceDate)+")":""}`:""}</summary>
        ${d.notes?`<p class="note" style="margin:6px 0">${esc(d.notes)}</p>`:""}
        <table class="parts"><tbody>${(d.parts||[]).map(p=>`<tr><td class="num">${esc(p.qty)}×</td><td class="num">${esc(p.partNo)}</td><td>${esc(p.desc)}</td><td class="r num">${fmtR(p.amount)}</td></tr>`).join("")}
        ${["outwork","consumables","travel","acgas","collect"].filter(k=>num(t[k])).map(k=>`<tr><td></td><td></td><td>${({outwork:"Outwork",consumables:"Consumables",travel:"Travel",acgas:"A/C gas",collect:"Collect + deliver"})[k]}</td><td class="r num">${fmtR(t[k])}</td></tr>`).join("")}
        <tr><td></td><td></td><td>VAT</td><td class="r num">${fmtR(t.vat)}</td></tr></tbody></table></details></td></tr>`}).join("")+
      `</tbody></table></div><p class="note">${wd.length} of ${jobs.length} entries have full detail${wd.length?`, totalling ${fmtR(spend)} incl. VAT`:""}.</p>`;
  }
  $("main").innerHTML=html;
}
function render(){renderSide();renderMain()}

/* ---------- Excel ---------- */
function sheetFor(m){
  const aoa=[["KLIENT",m.customer],["ITEM",m.item+(m.reg?"          "+m.reg:"")],["S/N",m.serial||"N/A","DATUM AANGEKOOP  "+(m.purchased||"N/A")],["DATUM","J/C NOMMER","BESONDERHEDE",METER[m.meter]||"URE"]];
  for(const j of sortedJobs(m)){const ds=j.details.length>1?j.details.map((d,i)=>`${i+1}. ${d}`):(j.details.length?j.details:[""]);
    ds.forEach((d,i)=>aoa.push(i==0?[j.date?fmtD(j.date):(j.dateRaw||""),j.jc,d,j.hours==null?(j.meterRaw||"N/A"):j.hours]:[null,null,d,null]))}
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:11},{wch:13},{wch:52},{wch:9}];return ws;
}
function exportOne(m){if(!window.XLSX)return toast("Excel export isn't available yet. Open the app online once, then try again.");
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheetFor(m),"Sheet1");
  XLSX.writeFile(wb,(m.customer+" "+m.item+" "+(m.serial||"")).trim().replace(/[^A-Za-z0-9&]+/g,"_")+".xlsx")}

/* ---------- events ---------- */
$("q").addEventListener("input",e=>{S.q=e.target.value;renderSide()});
document.addEventListener("click",e=>{
  const cb=e.target.closest("[data-client]");if(cb){S.view="main";S.client=cb.dataset.client;S.q="";$("q").value="";renderSide();$("side").scrollTop=0;if(!S.curId)renderMain();return}
  const mb=e.target.closest("[data-m]");if(mb){e.preventDefault();S.backTo=(S.view=="recent"||(!S.curId&&!S.client))?"recent":null;S.view="main";S.curId=mb.dataset.m;S.client=S.machines[S.curId].customer;S.q="";$("q").value="";render();window.scrollTo(0,0);return}
  const tb=e.target.closest("[data-tab]");if(tb){S.tab=tb.dataset.tab;renderMain();return}
  const a=e.target.closest("[data-act]");if(!a)return;
  ({recent:()=>{S.view="recent";S.curId=null;S.client=null;S.q="";$("q").value="";render();window.scrollTo(0,0)},days:()=>{S.days=+a.dataset.d;renderMain()},clients:()=>{S.client=null;renderSide();if(!S.curId)renderMain()},back:()=>{const wasRecent=S.view=="recent";S.curId=null;S.view=(!wasRecent&&S.backTo=="recent")?"recent":"main";S.backTo=null;render()},export:()=>exportOne(S.machines[S.curId])})[a.dataset.act]?.();
});

document.addEventListener("keydown",e=>{if(e.key=="Enter"&&e.target.classList?.contains("rrow"))e.target.click()});
/* ---------- boot ---------- */
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
const saved=store.get("jcr-pw");if(saved){$("remember").checked=true;unlock(saved,true)}else $("pw").focus();
