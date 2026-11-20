/* ---------- Service & warranty register ----------
   Dealership rules (from Anrich, Nov 2026). No estimates: everything comes from recorded hours.
   - every machine: a service every 300 h, counted from the hours the last service was actually done at
     (serviced at 635 h -> next at 935 h). A service card with no hours written counts at the service's own figure
     ("Carry out 600 hour service" -> done at 600 h).
   - first services (50/100/150 h, or a card that says "first service") are not counted; a machine that only had its first
     service is due at 300 h
   - the next service is the major one when it reaches or passes the next 1 200 h mark (1 200, 2 400, 3 600 h …)
   - "Due now": the last recorded reading has reached the next service; "Due soon": within 50 h of it;
     "Long overdue": a full 300 h or more past it
   - recorded hours = hours on job cards + hour readings entered from the portal (machine.readings)
   - standard warranty: 1 year from the purchase date
   - extended warranty (machine marked extWarranty): 4 years, or until a recorded reading reaches 4 000 h if that is sooner;
     wet parts only (to be confirmed)
   Shared by the master register (Claude) and the offline phone copy: keep both copies identical. */
const SVC={tab:"due",q:"",stale:false,rows:null,at:null,paste:null,add:null};
const SVC_STEP=300,SVC_MAJOR=1200,SVC_SOON=50,SVC_FIRST_MAX=150,SVC_STD_MONTHS=12,SVC_EXT_MONTHS=48,SVC_EXT_HOURS=4000;
const svDay=iso=>Math.floor(Date.parse(iso+"T00:00:00Z")/864e5);
function svDate(s){s=String(s||"").trim();if(/^\d{4}-\d\d-\d\d$/.test(s))return s;
  const m=s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);if(!m)return null;let y=m[3];if(y.length==2)y=(+y>30?"19":"20")+y;
  const iso=`${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;return isNaN(Date.parse(iso))?null:iso}
function svAddMonths(iso,n){const[y,m,d]=iso.split("-").map(Number);const t=new Date(Date.UTC(y,m-1+n,d));return t.toISOString().slice(0,10)}
const svSerial=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
function svIsService(line){return /servi[cs]/i.test(line)&&!(/air ?-?con|aircon|a\/c/i.test(line)&&!/engine|major|lube|\d/i.test(line.replace(/air ?-?con|aircon|a\/c/ig,"")))&&!/\bkm\b/i.test(line)}
function svInterval(line){const m=line.match(/(\d{1,2}[ ,]\d{3}|\d{2,5})\s*-?\s*(?:hours?|hrs?|uur|h)\b/i);if(!m)return null;const v=+m[1].replace(/[ ,]/g,"");return v>=50&&v<=40000?v:null}
function svRising(rs){/* keep the longest rising run of readings; others are flagged as out of sequence on the machine page */
  const n=rs.length,len=Array(n).fill(1),prev=Array(n).fill(-1);
  for(let a=0;a<n;a++)for(let b=Math.max(0,a-60);b<a;b++)if(rs[b].h<=rs[a].h&&len[b]+1>len[a]){len[a]=len[b]+1;prev[a]=b}
  let best=0;for(let a=1;a<n;a++)if(len[a]>=len[best])best=a;const out=[];for(let a=n?best:-1;a>=0;a=prev[a])out.unshift(rs[a]);return out}
function svCore(m){
  if((m.meter||"hours")!="hours")return null;
  const c=String(m.customer||"").toUpperCase(),it=String(m.item||"").toUpperCase();
  if(c=="SALES"||c.startsWith("MIDDELBURG INTERNATIONAL")||/LOOSE PART|COMPANY VEHICLE/.test(it))return null;
  const jobs=(m.jobs||[]).filter(j=>j.date).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(+a.jc||0)-(+b.jc||0));
  const all=[...jobs.filter(j=>j.hours!=null&&+j.hours>0).map(j=>({d:j.date,h:+j.hours,src:"J/C "+(j.jc??"")})),
    ...(m.readings||[]).filter(r=>r.date&&+r.hours>0).map(r=>({d:r.date,h:+r.hours,src:"portal"}))].sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.h-b.h);
  const reads=svRising(all);
  const svcs=[];let firstOnly=false;
  for(const j of jobs)for(const line of (j.details||[]))if(svIsService(line)){
    const iv=svInterval(line),h=j.hours!=null&&+j.hours>0?+j.hours:null;
    if((iv!=null&&iv<=SVC_FIRST_MAX)||/first service/i.test(line)){firstOnly=true;break}
    svcs.push({d:j.date,jc:j.jc,iv,h,at:h??iv,t:line});break}
  const lastJob=jobs.length?jobs[jobs.length-1].date:null,lastRead=all.length?all[all.length-1].d:null;
  return {m,jobs,reads,svcs,firstOnly:firstOnly&&!svcs.length,warrantyJobs:jobs.filter(j=>/warrant/i.test((j.details||[]).join(" "))).length,lastSeen:[lastJob,lastRead].filter(Boolean).sort().pop()||null}
}
function svBuild(machines){
  const today=svDay(todayISO()),cores=machines.map(svCore).filter(Boolean);
  return cores.map(x=>{
    const {m,reads,svcs}=x,lastR=reads[reads.length-1]||null,lastS=svcs[svcs.length-1]||null;
    const base=lastS?lastS.at:x.firstOnly?0:null,next=base!=null?base+SVC_STEP:null;
    /* major when the next service reaches or passes the next 1 200 h mark */
    const kind=next==null?null:Math.floor(next/SVC_MAJOR)>Math.floor(base/SVC_MAJOR)?"major":"normal";
    const toGo=next!=null&&lastR?next-lastR.h:null;
    let status,rank;
    if(!lastR&&!lastS){status="No hours on file";rank=8}
    else if(!lastS&&!x.firstOnly){status="No service on file";rank=7}
    else if(next==null||!lastR){status="Needs a reading";rank=6}
    else if(toGo<=-SVC_STEP){status="Long overdue";rank=5}
    else if(toGo<=0){status="Due now";rank=0}
    else if(toGo<=SVC_SOON){status="Due soon";rank=1}
    else{status="Not due";rank=4}
    const pur=svDate(m.purchased),ext=!!m.extWarranty;
    let wEnd=pur?svAddMonths(pur,ext?SVC_EXT_MONTHS:SVC_STD_MONTHS):null,wBy="date";
    if(ext&&pur){const hit=reads.find(r=>r.h>=SVC_EXT_HOURS);if(hit&&hit.d<wEnd){wEnd=hit.d;wBy="hours"}}
    const wLeft=wEnd?svDay(wEnd)-today:null;
    const stale=!x.lastSeen||today-svDay(x.lastSeen)>548||m.sold||m.inactive;
    return {id:m._id,c:m.customer||"",i:m.item||"",s:m.serial||"",lastS,lastR,next,kind,toGo,status,rank,stale,sold:!!m.sold,inactive:!!m.inactive,
      ext,pur,wEnd,wBy,wLeft,wJobs:x.warrantyJobs,nSvc:svcs.length,need:!!m.needHours}
  });
}
function svRefresh(machines){SVC.rows=svBuild(machines);SVC.at=Date.now();return SVC.rows}
function svFor(m){return svBuild([m])[0]||null}
const svCover=r=>r.ext?"Extended (wet parts)":"Standard";
const svCanEdit=()=>typeof svcAddReadings=="function"&&typeof svcCanEdit=="function"&&svcCanEdit();

/* ---------- views ---------- */
const svChip=r=>`<span class="chip ${r.rank<=1||r.rank==5||r.rank==6?"":"src"}" style="margin-left:0${r.rank==0?";background:var(--accent-soft);color:var(--accent)":""}">${esc(r.status)}</span>`;
const svMuted=t=>`<br><span style="color:var(--muted);font-size:12px">${t}</span>`;
function svFilter(rows){const q=SVC.q.trim().toLowerCase();if(!q)return rows;const w=q.split(/\s+/);return rows.filter(r=>{const h=[r.c,r.i,r.s].join(" ").toLowerCase();return w.every(x=>h.includes(x))})}
function svList(){
  const rows=svFilter(SVC.rows||[]);
  if(SVC.tab=="warranty")return rows.filter(r=>r.wEnd&&r.wLeft>=0&&!r.sold).sort((a,b)=>a.wLeft-b.wLeft);
  const act=rows.filter(r=>SVC.stale||!r.stale);
  if(SVC.tab=="long")return act.filter(r=>r.rank==5).sort((a,b)=>(b.lastR?.d||"").localeCompare(a.lastR?.d||"")||a.c.localeCompare(b.c));
  if(SVC.tab=="reading")return act.filter(r=>r.rank==6).sort((a,b)=>a.c.localeCompare(b.c)||a.i.localeCompare(b.i));
  if(SVC.tab=="due")return act.filter(r=>r.rank<=1).sort((a,b)=>a.rank-b.rank||a.toGo-b.toGo||a.c.localeCompare(b.c));
  return act.sort((a,b)=>a.c.localeCompare(b.c)||a.i.localeCompare(b.i));
}
function svLastS(r){return !r.lastS&&r.next==SVC_STEP?`<span style="color:var(--muted)">First service only</span>`:r.lastS?`<span class="num">${fmtD(r.lastS.d)}</span>`+svMuted(`${r.lastS.at!=null?(r.lastS.h!=null?"at "+fmtH(r.lastS.h)+" h":"at "+fmtH(r.lastS.iv)+" h (service figure)"):"no hours on card"} · J/C ${esc(r.lastS.jc??"—")}`):`<span style="color:var(--muted)">None on file</span>`}
function svLastR(r){return r.lastR?`<span class="num">${fmtH(r.lastR.h)} h</span>`+svMuted(`<span class="num">${fmtD(r.lastR.d)}</span> · ${esc(r.lastR.src)}`):"—"}
function svDue(r){return svChip(r)+(r.toGo!=null&&r.lastR?(r.toGo<=0?svMuted(`${fmtH(-r.toGo)} h past`):r.rank==1?svMuted(`${fmtH(r.toGo)} h to go`):""):"")}
function svPasteHTML(){
  const p=SVC.paste,n=p.res?p.res.filter(x=>x.ok).length:0;
  return `<div class="fixbox" style="max-width:980px"><h2>Paste hour readings</h2>
   <p class="sub" style="margin:0 0 8px">One machine per line: serial number, then the hours (e.g. <span class="num">JEEZC525LTF720463 1512</span>). Copy them from the portal or type them.</p>
   <div class="grid2" style="grid-template-columns:160px"><label class="f"><span>Reading date</span><input data-svpd value="${esc(fmtD(p.date))}" placeholder="dd.mm.yy"></label></div>
   <label class="f" style="margin-top:8px"><span>Readings</span><textarea data-svpt style="min-height:120px" placeholder="Serial  hours">${esc(p.text)}</textarea></label>
   ${p.res?`<ul class="flags" style="margin-top:10px">${p.res.map(x=>`<li class="${x.ok?"ok":""}">${esc(x.msg)}</li>`).join("")}</ul>`:""}
   <div class="bar" style="margin-top:10px"><button class="btn" data-svc="pcheck">Check</button>${n?`<button class="btn primary" data-svc="psave" ${p.busy?"disabled":""}>Save ${n} reading${n==1?"":"s"}</button>`:""}<button class="btn ghost" data-svc="pclose">Close</button></div></div>`;
}
function svcHTML(loading){
  const head=`<button class="btn ghost back" data-act="back">← Back</button>
  <div class="titlerow"><div><h1>Service register</h1><div class="sub">From recorded hours only: the last service, the last hour reading and the next service each machine is due for.</div></div>
   <div class="bar">${SVC.rows&&svCanEdit()?`<button class="btn" data-svc="paste">Paste hour readings</button>`:""}${SVC.rows?`<button class="btn" data-svc="export">Download call list</button>`:""}</div></div>`;
  if(loading||!SVC.rows)return head+`<div class="empty"><h2>Working through the job cards…</h2><p>Reading every machine's history. This takes a few seconds.</p></div>`;
  const all=SVC.rows,act=all.filter(r=>!r.stale),list=svList();
  const cnt=f=>act.filter(f).length,wa=all.filter(r=>r.wEnd&&r.wLeft>=0&&!r.sold);
  const tabs=[["due","Due now / soon"],["long","Long overdue"],["reading","Needs a reading"],["warranty","Warranty"],["all","All machines"]];
  let html=head+(SVC.paste?svPasteHTML():"")+`<div class="stats">
   <div><b class="num">${cnt(r=>r.rank==0)}</b><span>due now</span></div>
   <div><b class="num">${cnt(r=>r.rank==1)}</b><span>due soon (within ${SVC_SOON} h)</span></div>
   <div><b class="num">${cnt(r=>r.rank==5)}</b><span>long overdue</span></div>
   <div><b class="num">${cnt(r=>r.rank==6)}</b><span>needs a reading</span></div>
   <div><b class="num">${wa.length}</b><span>in warranty</span></div>
   <div><b class="num">${wa.filter(r=>r.wLeft<=90).length}</b><span>warranty ends in 90 days</span></div></div>
  <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" data-svc="tab" data-v="${k}" aria-selected="${SVC.tab==k}">${l}</button>`).join("")}</div>
  <div class="fs" style="max-width:980px;border-top:0;border-radius:0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-top:0">
   <input data-svcq type="search" value="${esc(SVC.q)}" placeholder="Filter by client, model or serial" aria-label="Filter" style="flex:1 1 200px;min-width:0;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--sunk)">
   ${SVC.tab!="warranty"?`<label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)"><input type="checkbox" data-svc="stale" ${SVC.stale?"checked":""}> Include sold, inactive and machines not seen for 18 months</label>`
     :`<span style="font-size:13px;color:var(--muted)">Standard: 1 year. Extended: 4 years or 4 000 h, wet parts only.</span>`}
  </div>`;
  const shown=list.slice(0,400);
  if(!list.length)return html+`<div class="empty" style="margin-top:12px"><h2>Nothing to show</h2><p>${SVC.tab=="warranty"?"No machines with a purchase date inside the warranty period. Purchase dates come from the AANGEKOOP field on each machine.":"No machines match. Clear the filter or tick the box to include sold and inactive machines."}</p></div>`;
  if(SVC.tab=="warranty"){
    html+=`<div class="tablebox"><table><thead><tr><th>KLIENT</th><th>MASJIEN</th><th>AANGEKOOP</th><th>COVER</th><th>WARRANTY ENDS</th><th class="r">DAYS LEFT</th><th class="r">LAST READING</th><th class="r">WARRANTY JOBS</th></tr></thead><tbody>`+
      shown.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td><b>${esc(r.c)}</b>${svMuted(`<span class="num">${esc(r.s||"no serial")}</span>`)}</td><td>${esc(r.i)}</td><td class="num">${fmtD(r.pur)}</td><td>${r.ext?`<span class="chip ok" style="margin-left:0">Extended</span>${svMuted("wet parts, 4 000 h")}`:"Standard"}</td><td class="num">${fmtD(r.wEnd)}${r.wBy=="hours"?svMuted("reached 4 000 h"):""}${r.wLeft<=90?` <span class="chip">Ends soon</span>`:""}</td><td class="r num">${r.wLeft}</td><td class="r">${svLastR(r)}</td><td class="r num">${r.wJobs||""}</td></tr>`).join("")+`</tbody></table></div>`;
  }else{
    html+=`<div class="tablebox"><table><thead><tr><th>KLIENT</th><th>MASJIEN</th><th>LAST SERVICE</th><th class="r">LAST READING</th><th class="r">NEXT SERVICE</th><th>STATUS</th></tr></thead><tbody>`+
      shown.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td><b>${esc(r.c)}</b>${svMuted(`<span class="num">${esc(r.s||"no serial")}</span>`)}</td><td>${esc(r.i)}</td>
       <td>${svLastS(r)}</td><td class="r">${svLastR(r)}</td>
       <td class="r num">${r.next!=null?fmtH(r.next)+" h"+`<br><span style="color:${r.kind=="major"?"var(--accent)":"var(--muted)"};font-size:12px;font-family:var(--body);font-weight:${r.kind=="major"?600:400}">${r.kind=="major"?"Major":"Normal"}</span>`:"—"}</td>
       <td>${svDue(r)}</td></tr>`).join("")+`</tbody></table></div>`;
  }
  html+=`<p class="note">${list.length>shown.length?`Showing ${shown.length} of ${list.length}. Filter or download the call list to see them all. `:`${list.length} machine${list.length==1?"":"s"}. `}
   ${SVC.tab=="warranty"?`Standard warranty ends 1 year after purchase. Machines marked as having the extended warranty run 4 years, or until a recorded reading reaches 4 000 h if that comes first, on wet parts only.`
   :SVC.tab=="reading"?`The last service card has no hours and no service figure, or there is no hour reading on file. These machines are listed in the Review tab of the master register: type the hours from the portal there.`
   :`Next service = the hours the last service was done at + 300 h (first services of 50–150 h are not counted). It is the major service when it reaches or passes the next 1 200 h mark. Status compares the last recorded reading (job card or portal) with the next service. No estimates are used: add a portal reading for an up-to-date status.`}</p>`;
  return html;
}
function svcMachineBox(m){
  const r=svFor(m);if(!r)return "";
  const bits=[!r.lastS&&r.next==SVC_STEP?"First service only on file":r.lastS?`Last service <b class="num">${fmtD(r.lastS.d)}</b>${r.lastS.at!=null?` at ${fmtH(r.lastS.at)} h`:" (no hours on card)"}`:"No service on file",
    r.lastR?`Last reading <b class="num">${fmtH(r.lastR.h)} h</b> (${fmtD(r.lastR.d)}, ${esc(r.lastR.src)})`:"No hour reading on file",
    r.next!=null?`Next <b class="num">${fmtH(r.next)} h</b> ${r.kind} service`:"",svDue(r).replace(/<br>/g," "),
    r.wEnd?(r.wLeft>=0?`${r.ext?"Extended warranty (wet parts)":"Warranty"} to <b class="num">${fmtD(r.wEnd)}</b>${r.ext?" or 4 000 h":""}`:`${r.ext?"Extended warranty":"Warranty"} ended ${fmtD(r.wEnd)}${r.wBy=="hours"?" (4 000 h)":""}`):(r.ext?"Extended warranty: add the purchase date":"")].filter(Boolean);
  const rd=(m.readings||[]).slice().sort((a,b)=>a.date<b.date?1:-1),ed=svCanEdit();
  return `<div class="note" style="background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;color:var(--ink)">${bits.join(" · ")}
   ${rd.length?`<div style="margin-top:6px;font-size:12px;color:var(--muted)">Portal readings: ${rd.slice(0,6).map(x=>`<span class="num">${fmtD(x.date)} ${fmtH(x.hours)} h</span>${ed?` <a href="#" data-svc="rdel" data-m2="${esc(m._id)}" data-v="${esc(x.id)}" title="Delete this reading">✕</a>`:""}`).join(" · ")}</div>`:""}
   ${ed?(SVC.add==m._id?`<div class="bar" style="margin-top:8px"><input data-svad value="${esc(fmtD(todayISO()))}" placeholder="dd.mm.yy" aria-label="Reading date" style="width:100px;padding:6px 8px;border:1px solid var(--line);border-radius:5px;background:var(--sunk)"><input data-svah class="num" placeholder="Hours" aria-label="Hours" style="width:110px;padding:6px 8px;border:1px solid var(--line);border-radius:5px;background:var(--sunk)"><button class="btn primary" data-svc="radd" data-v="${esc(m._id)}">Save reading</button><button class="btn ghost" data-svc="rcancel">Cancel</button></div>`
     :`<div style="margin-top:6px"><button class="btn" data-svc="ropen" data-v="${esc(m._id)}">Add hour reading</button></div>`):""}</div>`;
}
function svcExportRows(){
  const list=svList();
  const aoa=SVC.tab=="warranty"?[["KLIENT","MASJIEN","S/N","AANGEKOOP","COVER","WARRANTY ENDS","ENDS BY","DAYS LEFT","LAST READING (H)","LAST READING DATE","WARRANTY JOBS"],
    ...list.map(r=>[r.c,r.i,r.s,fmtD(r.pur),svCover(r),fmtD(r.wEnd),r.wBy=="hours"?"4 000 h reached":"date",r.wLeft,r.lastR?.h??"",r.lastR?fmtD(r.lastR.d):"",r.wJobs])]
   :[["KLIENT","MASJIEN","S/N","LAST SERVICE DATE","LAST SERVICE DONE AT (H)","LAST SERVICE J/C","LAST READING (H)","LAST READING DATE","READING FROM","NEXT SERVICE (H)","SERVICE TYPE","STATUS","HOURS TO GO (- = PAST)"],
    ...list.map(r=>[r.c,r.i,r.s,r.lastS?fmtD(r.lastS.d):"",r.lastS?.at??"",r.lastS?.jc??"",r.lastR?.h??"",r.lastR?fmtD(r.lastR.d):"",r.lastR?.src??"",r.next??"",r.kind?(r.kind=="major"?"Major":"Normal"):"",r.status,r.toGo??""])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=aoa[0].map((h,i)=>({wch:i<2?28:14}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,SVC.tab=="warranty"?"Warranty":"Service");
  return {wb,name:`Service_register_${SVC.tab}_${todayISO()}.xlsx`};
}
/* ---------- portal readings (master register only) ---------- */
function svParse(text,date){
  const by={};for(const r of SVC.rows||[]){const k=svSerial(r.s);if(k.length>=5)(by[k]=by[k]||[]).push(r)}
  return String(text||"").split(/\n+/).map(l=>l.trim()).filter(Boolean).map(l=>{
    const m=l.match(/^(.*?)[\s,;:\t]+(\d[\d\s.,]*?)\s*(?:h|hrs?|hours?)?$/i);
    if(!m)return {ok:false,msg:`“${l}”: couldn't read a serial number and hours.`};
    const k=svSerial(m[1]),h=+m[2].replace(/\s/g,"").replace(/,(\d{1,2})$/,".$1").replace(/,/g,"");
    if(!(h>0))return {ok:false,msg:`“${l}”: the hours aren't a number.`};
    let ms=by[k]||[];
    if(!ms.length)return {ok:false,msg:`${m[1].trim()}: no machine with this serial number.`};
    if(ms.length>1){const live=ms.filter(r=>!r.sold&&!r.inactive);if(live.length==1)ms=live;else return {ok:false,msg:`${m[1].trim()}: this serial is on file under ${ms.map(r=>r.c).join(", ")}. Add this reading on the right machine's page.`}}
    const r=ms[0],low=r.lastR&&h<r.lastR.h;
    return {ok:!low,id:r.id,date,hours:h,msg:low?`${m[1].trim()} (${r.c}): ${fmtH(h)} h is lower than the last reading of ${fmtH(r.lastR.h)} h on ${fmtD(r.lastR.d)}. Check it; not saved.`:`${m[1].trim()} → ${r.c} · ${r.i}: ${fmtH(h)} h on ${fmtD(date)}`};
  });
}
/* ---------- hour readings needed: listed in the master register's Review tab ---------- */
function svcHoursNeeded(){return (SVC.rows||[]).filter(r=>r.need||(r.rank==6&&!r.stale)).sort((a,b)=>a.c.localeCompare(b.c)||a.i.localeCompare(b.i))}
function svcReviewHTML(){
  const L=svcHoursNeeded();if(!L.length)return "";
  const inp="padding:5px 6px;border:1px solid var(--line);border-radius:5px;background:var(--sunk)";
  return `<div class="fixbox" style="max-width:1240px"><h2>Hours needed from the portal (${L.length})</h2>
   <p class="sub" style="margin:0 0 8px">For each machine, look up the hours asked for on the portal and type them in. The service register updates as soon as you save.</p>
   <div style="overflow-x:auto"><table class="ptab"><thead><tr><th>Klient</th><th>Masjien</th><th>Hours needed</th><th>Date</th><th class="r">Hours</th><th></th></tr></thead><tbody>
   ${L.map(r=>{const onCard=!r.need&&r.lastS&&r.lastS.at==null;
     return `<tr><td><b>${esc(r.c)}</b>${svMuted(`<span class="num">${esc(r.s||"no serial")}</span>`)}</td><td>${esc(r.i)}</td>
     <td style="font-size:13px">${onCard?`On the day of the last service: “${esc(r.lastS.t)}”, J/C ${esc(r.lastS.jc??"—")}. The card has no hours.`:r.need?"Current hours (you requested it)":"Current hours (no hour reading on file)"}${r.lastR?svMuted("Last reading on file: "+fmtH(r.lastR.h)+" h on "+fmtD(r.lastR.d)):""}</td>
     <td>${onCard?`<span class="num">${fmtD(r.lastS.d)}</span>`:`<input data-svrd="${esc(r.id)}" value="${esc(fmtD(todayISO()))}" aria-label="Reading date" style="width:92px;${inp}">`}</td>
     <td class="r"><input data-svrh="${esc(r.id)}" class="num" placeholder="Hours" aria-label="Hours" style="width:100px;text-align:right;${inp}"></td>
     <td class="rowact"><button class="btn primary" data-svc="rvsave" data-v="${esc(r.id)}" data-card="${onCard?1:""}">Save</button>${r.need?` <button class="btn ghost" data-svc="rvdrop" data-v="${esc(r.id)}">Remove</button>`:""}</td></tr>`}).join("")}
   </tbody></table></div></div>`;
}
/* events: each app defines svcRender(), svcSave(wb,name) and svcRerenderMachine(); the master register also defines
   svcCanEdit(), svcAddReadings([{id,date,hours}]), svcDelReading(machineId, readingId), svcSetNeed(machineId, on)
   and svcSetJobHours(machineId, jc, date, hours) */
document.addEventListener("click",async e=>{const b=e.target.closest("[data-svc]");if(!b||b.tagName=="SELECT"||b.type=="checkbox")return;const k=b.dataset.svc;
  if(k=="tab"){SVC.tab=b.dataset.v;svcRender()}
  else if(k=="export"){if(!window.XLSX)return toast("Excel export isn't available yet. Open the app online once, then try again.");const x=svcExportRows();svcSave(x.wb,x.name)}
  else if(k=="paste"){SVC.paste={date:todayISO(),text:"",res:null};svcRender()}
  else if(k=="pclose"){SVC.paste=null;svcRender()}
  else if(k=="pcheck"){const p=SVC.paste;p.text=document.querySelector("[data-svpt]")?.value||"";const d=svDate(document.querySelector("[data-svpd]")?.value);if(!d)return toast("Use a date like 20.11.26.");p.date=d;p.res=svParse(p.text,d);svcRender()}
  else if(k=="psave"){const p=SVC.paste,ok=p.res.filter(x=>x.ok);p.busy=true;svcRender();
    try{await svcAddReadings(ok.map(x=>({id:x.id,date:x.date,hours:x.hours})));toast(`${ok.length} reading${ok.length==1?"":"s"} saved`);SVC.paste=null}catch(_){toast("Couldn't save the readings. Try again.");p.busy=false}svcRender()}
  else if(k=="ropen"){SVC.add=b.dataset.v;svcRerenderMachine()}
  else if(k=="rcancel"){SVC.add=null;svcRerenderMachine()}
  else if(k=="radd"){const d=svDate(document.querySelector("[data-svad]")?.value),h=+String(document.querySelector("[data-svah]")?.value||"").replace(/\s/g,"").replace(",",".");
    if(!d)return toast("Use a date like 20.11.26.");if(!(h>0))return toast("Type the hours from the portal.");
    try{await svcAddReadings([{id:b.dataset.v,date:d,hours:h}]);SVC.add=null;toast("Reading saved");svcRerenderMachine()}catch(_){toast("Couldn't save the reading. Try again.")}}
  else if(k=="rvsave"){const id=b.dataset.v,q=a=>document.querySelector(`[${a}="${CSS.escape(id)}"]`),d=b.dataset.card?"card":svDate(q("data-svrd")?.value),h=+String(q("data-svrh")?.value||"").replace(/\s/g,"").replace(",",".");
    if(!d)return toast("Use a date like 20.11.26.");if(!(h>0))return toast("Type the hours from the portal.");
    const r=(SVC.rows||[]).find(x=>x.id==id);
    if(b.dataset.card){b.disabled=true;try{await svcSetJobHours(id,r.lastS.jc,r.lastS.d,h);toast(`Hours saved on J/C ${r.lastS.jc}`);svcRerenderMachine()}catch(_){b.disabled=false;toast("Couldn't save the hours. Try again.")}return}
    if(r&&r.lastR&&h<r.lastR.h)return toast(`${fmtH(h)} h is lower than the last reading of ${fmtH(r.lastR.h)} h. Check it.`);
    b.disabled=true;try{await svcAddReadings([{id,date:d,hours:h}]);toast("Reading saved");svcRerenderMachine()}catch(_){b.disabled=false;toast("Couldn't save the reading. Try again.")}}
  else if(k=="rvdrop"){try{await svcSetNeed(b.dataset.v,false);svcRerenderMachine()}catch(_){toast("Couldn't update. Try again.")}}
  else if(k=="rdel"){e.preventDefault();try{await svcDelReading(b.dataset.m2,b.dataset.v);toast("Reading deleted");svcRerenderMachine()}catch(_){toast("Couldn't delete the reading. Try again.")}}
});
document.addEventListener("change",e=>{const b=e.target.closest("[data-svc]");if(!b)return;
  if(b.dataset.svc=="stale"){SVC.stale=b.checked;svcRender()}});
document.addEventListener("input",e=>{if(!e.target.matches("[data-svcq]"))return;SVC.q=e.target.value;const pos=e.target.selectionStart;svcRender();const el=document.querySelector("[data-svcq]");if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(_){}}});
