/* ---------- Service & warranty register ----------
   Dealership rules (from Anrich, Nov 2026):
   - a normal service every 300 h; every 1 200 h it is a major service
   - standard warranty: 1 year from the purchase date
   - extended warranty (machine marked extWarranty): 4 years or 4 000 h, whichever comes first; wet parts only (to be confirmed)
   Worked out from the job cards:
   - a service job is a card line containing "service" (not air-con only); its hours are the figure on that line
     ("Carry out 600 hour service"), and the next service is the next multiple of 300 h above it
   - hours per day come from the in-sequence hour readings of the last two years
   Shared by the master register (Claude) and the offline phone copy: keep both copies identical. */
const SVC={tab:"due",days:60,q:"",stale:false,rows:null,at:null};
const SVC_STEP=300,SVC_MAJOR=1200,SVC_STD_MONTHS=12,SVC_EXT_MONTHS=48,SVC_EXT_HOURS=4000;
const svKind=h=>h%SVC_MAJOR==0?"major":"normal";
const svDay=iso=>Math.floor(Date.parse(iso+"T00:00:00Z")/864e5);
const svISO=n=>new Date(n*864e5).toISOString().slice(0,10);
function svDate(s){s=String(s||"").trim();if(/^\d{4}-\d\d-\d\d$/.test(s))return s;
  const m=s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);if(!m)return null;let y=m[3];if(y.length==2)y=(+y>30?"19":"20")+y;
  const iso=`${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;return isNaN(Date.parse(iso))?null:iso}
function svAddMonths(iso,n){const[y,m,d]=iso.split("-").map(Number);const t=new Date(Date.UTC(y,m-1+n,d));return t.toISOString().slice(0,10)}
function svModel(item){const w=String(item||"").toUpperCase().replace(/^CASE( IH)?\s+/,"").split(/\s+/).filter(Boolean);return w.slice(0,2).join(" ")||"?"}
function svIsService(line){return /servi[cs]/i.test(line)&&!(/air ?-?con|aircon|a\/c/i.test(line)&&!/engine|major|lube|\d/i.test(line.replace(/air ?-?con|aircon|a\/c/ig,"")))&&!/\bkm\b/i.test(line)}
function svInterval(line){const m=line.match(/(\d{1,2}[ ,]\d{3}|\d{2,5})\s*-?\s*(?:hours?|hrs?|uur|h)\b/i);if(!m)return null;const v=+m[1].replace(/[ ,]/g,"");return v>=50&&v<=40000?v:null}
function svRising(rs){/* keep the longest rising run of readings; others are likely typing errors */
  const n=rs.length,len=Array(n).fill(1),prev=Array(n).fill(-1);
  for(let a=0;a<n;a++)for(let b=Math.max(0,a-60);b<a;b++)if(rs[b].h<=rs[a].h&&len[b]+1>len[a]){len[a]=len[b]+1;prev[a]=b}
  let best=0;for(let a=1;a<n;a++)if(len[a]>=len[best])best=a;const out=[];for(let a=n?best:-1;a>=0;a=prev[a])out.unshift(rs[a]);return out}
function svCore(m){
  if((m.meter||"hours")!="hours")return null;
  const c=String(m.customer||"").toUpperCase(),it=String(m.item||"").toUpperCase();
  if(c=="SALES"||c.startsWith("MIDDELBURG INTERNATIONAL")||/LOOSE PART|COMPANY VEHICLE/.test(it))return null;
  const jobs=(m.jobs||[]).filter(j=>j.date).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(+a.jc||0)-(+b.jc||0));
  const reads=svRising(jobs.filter(j=>j.hours!=null&&+j.hours>0).map(j=>({d:j.date,h:+j.hours})));
  const svcs=[];
  for(const j of jobs)for(const line of (j.details||[]))if(svIsService(line)){svcs.push({d:j.date,jc:j.jc,iv:svInterval(line),h:j.hours!=null?+j.hours:null,t:line});break}
  return {m,jobs,reads,svcs,model:svModel(m.item),warrantyJobs:jobs.filter(j=>/warrant/i.test((j.details||[]).join(" "))).length,lastJob:jobs.length?jobs[jobs.length-1].date:null}
}
function svBuild(machines){
  const today=svDay(todayISO()),cores=machines.map(svCore).filter(Boolean);
  const rows=cores.map(x=>{
    const {m,reads,svcs}=x,lastR=reads[reads.length-1]||null,lastS=svcs[svcs.length-1]||null,lastIv=[...svcs].reverse().find(s=>s.iv)||null;
    let rate=null;
    if(lastR){const win=reads.filter(r=>svDay(r.d)>=svDay(lastR.d)-730),f=win[0],span=svDay(lastR.d)-svDay(f.d);
      if(span>=45&&lastR.h>f.h)rate=(lastR.h-f.h)/span;
      else if(reads.length>1){const f2=reads[0],s2=svDay(lastR.d)-svDay(f2.d);if(s2>=45&&lastR.h>f2.h)rate=(lastR.h-f2.h)/s2}}
    const seen=lastR?today-svDay(lastR.d):null,est=lastR?Math.round(lastR.h+(rate||0)*Math.min(seen,730)):null;
    /* count from the hours the service was actually done at, if a late service went past its interval (e.g. 250 h service done at 320 h) */
    const step=SVC_STEP,base=lastIv?(lastIv.h!=null&&lastIv.h>lastIv.iv&&lastIv.h-lastIv.iv<SVC_STEP?lastIv.h:lastIv.iv):null;
    let next=null;
    if(base!=null)next=Math.floor(base/step)*step+step;else if(lastR)next=Math.floor(lastR.h/step)*step+step;
    let dueIn=null,dueDate=null;
    if(next!=null&&est!=null&&rate>0){dueIn=Math.round((next-est)/rate);dueDate=svISO(today+Math.max(dueIn,0))}
    const stale=!x.lastJob||today-svDay(x.lastJob)>548||m.sold||m.inactive;
    let status,rank;
    if(!lastR){status="No hours on file";rank=8}
    else if(!lastIv){status="No service on file";rank=7}
    /* "Due now" and "Long overdue" only from hours recorded on a job card; estimates never decide these */
    else if(lastR.h>=next+step){status="Long overdue";rank=5}
    else if(lastR.h>=next){status="Due now";rank=0}
    else if(est>=next){status="Ask for hours";rank=10}
    else if(dueIn==null){status="Usage unknown";rank=6}
    else if(dueIn<=30){status="Est. due in 30 days";rank=1}
    else if(dueIn<=60){status="Est. due in 60 days";rank=2}
    else if(dueIn<=90){status="Est. due in 90 days";rank=3}
    else{status="Later";rank=4}
    const pur=svDate(m.purchased),ext=!!m.extWarranty;
    let wEnd=pur?svAddMonths(pur,ext?SVC_EXT_MONTHS:SVC_STD_MONTHS):null,wBy="date";
    if(ext&&pur&&lastR){/* 4 000 h may come before 4 years */
      if(lastR.h>=SVC_EXT_HOURS){const hit=reads.find(r=>r.h>=SVC_EXT_HOURS);if(hit&&hit.d<wEnd){wEnd=hit.d;wBy="hours"}}
      else if(rate>0){const d=svISO(today+Math.ceil((SVC_EXT_HOURS-est)/rate));if(d<wEnd){wEnd=d;wBy="hours"}}}
    const wLeft=wEnd?svDay(wEnd)-today:null;
    return {id:m._id,c:m.customer||"",i:m.item||"",s:m.serial||"",model:x.model,lastS,lastIv,lastR,rate,est,seen,step,next,kind:next!=null?svKind(next):null,over:next!=null&&lastR?lastR.h-next:null,ext,wBy,
      dueIn,dueDate,status,rank,stale,sold:!!m.sold,inactive:!!m.inactive,pur,wEnd,wLeft,wJobs:x.warrantyJobs,lastJob:x.lastJob,nSvc:svcs.length}
  });
  return rows;
}
function svRefresh(machines){SVC.rows=svBuild(machines);SVC.at=Date.now();return SVC.rows}
function svFor(m){return svBuild([m])[0]||null}
const svCover=r=>r.ext?"Extended (wet parts)":"Standard";

/* ---------- views ---------- */
const svChip=r=>`<span class="chip ${r.rank<=3||r.rank==5||r.rank==10?"":"src"}" style="margin-left:0${r.rank==0?";background:var(--accent-soft);color:var(--accent)":""}" title="${r.rank==10?"The estimate has passed the service, but the last recorded hours have not. Phone the client for the hour meter reading.":r.rank>=1&&r.rank<=3?"Estimated from the machine's hours per day":""}">${esc(r.status)}</span>`;
const svH=n=>n==null?"—":fmtH(Math.round(n));
function svFilter(rows){const q=SVC.q.trim().toLowerCase();if(!q)return rows;const w=q.split(/\s+/);return rows.filter(r=>{const h=[r.c,r.i,r.s].join(" ").toLowerCase();return w.every(x=>h.includes(x))})}
function svList(){
  const rows=svFilter(SVC.rows||[]);
  if(SVC.tab=="warranty")return rows.filter(r=>r.wEnd&&r.wLeft>=0&&!r.sold).sort((a,b)=>a.wLeft-b.wLeft);
  const act=rows.filter(r=>SVC.stale||!r.stale);
  if(SVC.tab=="long")return act.filter(r=>r.rank==5).sort((a,b)=>(b.lastR?.d||"").localeCompare(a.lastR?.d||"")||a.c.localeCompare(b.c));
  if(SVC.tab=="due")return act.filter(r=>r.rank==0||(r.dueIn!=null&&r.dueIn<=SVC.days)).sort((a,b)=>(a.rank==0?0:1)-(b.rank==0?0:1)||(a.rank==0?(a.over||0)-(b.over||0):(a.dueIn??1e9)-(b.dueIn??1e9))||a.c.localeCompare(b.c));
  return act.sort((a,b)=>a.c.localeCompare(b.c)||a.i.localeCompare(b.i));
}
function svcHTML(loading){
  const head=`<button class="btn ghost back" data-act="back">← Back</button>
  <div class="titlerow"><div><h1>Service register</h1><div class="sub">Worked out from the job cards: last service, hours per day and the next service each machine is due for.</div></div>
   <div class="bar">${SVC.rows?`<button class="btn" data-svc="export">Download call list</button>`:""}</div></div>`;
  if(loading||!SVC.rows)return head+`<div class="empty"><h2>Working through the job cards…</h2><p>Reading every machine's history. This takes a few seconds.</p></div>`;
  const all=SVC.rows,act=all.filter(r=>!r.stale),list=svList();
  const cnt=f=>act.filter(f).length,wa=all.filter(r=>r.wEnd&&r.wLeft>=0&&!r.sold);
  const tabs=[["due","Due for service"],["long","Long overdue"],["warranty","Warranty"],["all","All machines"]];
  let html=head+`<div class="stats">
   <div><b class="num">${cnt(r=>r.rank==0)}</b><span>due now (recorded hours)</span></div>
   <div><b class="num">${cnt(r=>r.rank==10)}</b><span>ask for hours</span></div>
   <div><b class="num">${cnt(r=>r.rank==1)}</b><span>est. due in 30 days</span></div>
   <div><b class="num">${cnt(r=>r.rank==2)}</b><span>est. due in 31–60 days</span></div>
   <div><b class="num">${cnt(r=>r.rank==5)}</b><span>long overdue</span></div>
   <div><b class="num">${wa.length}</b><span>in warranty</span></div>
   <div><b class="num">${wa.filter(r=>r.wLeft<=90).length}</b><span>warranty ends in 90 days</span></div></div>
  <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" data-svc="tab" data-v="${k}" aria-selected="${SVC.tab==k}">${l}</button>`).join("")}</div>
  <div class="fs" style="max-width:980px;border-top:0;border-radius:0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-top:0">
   <input data-svcq type="search" value="${esc(SVC.q)}" placeholder="Filter by client, model or serial" aria-label="Filter" style="flex:1 1 200px;min-width:0;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--sunk)">
   ${SVC.tab=="due"?`<div class="seg" role="group" aria-label="Window">${[30,60,90].map(d=>`<button data-svc="days" data-v="${d}" aria-pressed="${SVC.days==d}">${d} days</button>`).join("")}</div>`:""}
   ${SVC.tab!="warranty"?`<label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)"><input type="checkbox" data-svc="stale" ${SVC.stale?"checked":""}> Include sold, inactive and machines not seen for 18 months</label>`
     :`<span style="font-size:13px;color:var(--muted)">Standard: 1 year. Extended: 4 years or 4 000 h, wet parts only.</span>`}
  </div>`;
  const shown=list.slice(0,400);
  if(!list.length)return html+`<div class="empty" style="margin-top:12px"><h2>Nothing to show</h2><p>${SVC.tab=="warranty"?"No machines with a purchase date inside the warranty period. Purchase dates come from the AANGEKOOP field on each machine.":"No machines match. Try a longer window or clear the filter."}</p></div>`;
  if(SVC.tab=="warranty"){
    html+=`<div class="tablebox"><table><thead><tr><th>KLIENT</th><th>MASJIEN</th><th>AANGEKOOP</th><th>COVER</th><th>WARRANTY ENDS</th><th class="r">DAYS LEFT</th><th class="r">EST. HOURS</th><th class="r">WARRANTY JOBS</th></tr></thead><tbody>`+
      shown.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td><b>${esc(r.c)}</b><br><span class="num" style="color:var(--muted);font-size:12px">${esc(r.s||"no serial")}</span></td><td>${esc(r.i)}</td><td class="num">${fmtD(r.pur)}</td><td>${r.ext?`<span class="chip ok" style="margin-left:0">Extended</span><br><span style="color:var(--muted);font-size:12px">wet parts</span>`:"Standard"}</td><td class="num">${fmtD(r.wEnd)}${r.wBy=="hours"?`<br><span style="color:var(--muted);font-size:12px">at 4 000 h</span>`:""}${r.wLeft<=90?` <span class="chip">Ends soon</span>`:""}</td><td class="r num">${r.wLeft}</td><td class="r num">${svH(r.est)}</td><td class="r num">${r.wJobs||""}</td></tr>`).join("")+`</tbody></table></div>`;
  }else{
    html+=`<div class="tablebox"><table><thead><tr><th>KLIENT</th><th>MASJIEN</th><th>LAST SERVICE</th><th class="r">LAST HOURS</th><th class="r">HRS/DAY</th><th class="r">EST. TODAY</th><th class="r">NEXT</th><th>DUE</th></tr></thead><tbody>`+
      shown.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td><b>${esc(r.c)}</b><br><span class="num" style="color:var(--muted);font-size:12px">${esc(r.s||"no serial")}</span></td><td>${esc(r.i)}</td>
       <td>${r.lastS?`<span class="num">${fmtD(r.lastS.d)}</span><br><span style="color:var(--muted);font-size:12px">${r.lastS.iv?fmtH(r.lastS.iv)+" h service":"service"} · J/C ${esc(r.lastS.jc??"—")}</span>`:`<span style="color:var(--muted)">None on file</span>`}</td>
       <td class="r num">${r.lastR?fmtH(r.lastR.h)+`<br><span style="color:var(--muted);font-size:12px">${fmtD(r.lastR.d)}</span>`:"—"}</td>
       <td class="r num">${r.rate?r.rate.toFixed(1):"—"}</td><td class="r num" style="color:var(--muted)">${r.est!=null?"≈ "+svH(r.est):"—"}</td>
       <td class="r num">${r.next!=null?fmtH(r.next)+" h"+`<br><span style="color:${r.kind=="major"?"var(--accent)":"var(--muted)"};font-size:12px;font-family:var(--body);font-weight:${r.kind=="major"?600:400}">${r.kind=="major"?"Major":"Normal"}</span>`:"—"}</td>
       <td>${svChip(r)}${(r.rank==0||r.rank==5)&&r.over>=0?`<br><span style="color:var(--muted);font-size:12px">recorded ${fmtH(r.lastR.h)} h</span>`:r.rank==10?`<br><span style="color:var(--muted);font-size:12px">last recorded ${fmtH(r.lastR.h)} h</span>`:r.dueDate&&r.rank<5?`<br><span class="num" style="color:var(--muted);font-size:12px">≈ ${fmtD(r.dueDate)}</span>`:""}</td></tr>`).join("")+`</tbody></table></div>`;
  }
  html+=`<p class="note">${list.length>shown.length?`Showing ${shown.length} of ${list.length}. Filter or download the call list to see them all. `:`${list.length} machine${list.length==1?"":"s"}. `}
   ${SVC.tab=="warranty"?`Standard warranty ends 1 year after purchase. Machines marked as having the extended warranty run to 4 years or 4 000 h (estimated from their hour readings), whichever comes first, on wet parts only. Mark the extended warranty on the machine's page in the master register.`
   :SVC.tab=="long"?`More than a full service interval past due, with no later service on our cards. Most of these are probably serviced elsewhere or by the farmer: worth a call.`
   :`Normal service every 300 h, major service every 1 200 h, counted from the hours on the last service card. "Due now" means the hours recorded on a job card have reached the next service. "Ask for hours" means only the estimate has: the last recorded reading is still below the service, so phone the client for the hour meter reading. "Est." dates are forecasts from the machine's hours per day; seasonal machines like combines can be far off.`}</p>`;
  return html;
}
function svcMachineBox(m){
  const r=svFor(m);if(!r)return "";
  const bits=[r.lastS?`Last service <b class="num">${fmtD(r.lastS.d)}</b>${r.lastS.iv?` (${fmtH(r.lastS.iv)} h)`:""}`:"No service on file",
    r.lastR?`Last recorded <b class="num">${fmtH(r.lastR.h)} h</b> (${fmtD(r.lastR.d)})${r.rate&&r.est!=r.lastR.h?`, estimate today ≈ ${fmtH(r.est)} h at ${r.rate.toFixed(1)} h/day`:""}`:"",
    r.next!=null?`Next <b class="num">${fmtH(r.next)} h</b> ${r.kind} service ${svChip(r)}${r.dueDate&&r.rank>0&&r.rank<5?` <span class="num">≈ ${fmtD(r.dueDate)}</span>`:""}`:"",
    r.wEnd?(r.wLeft>=0?`${r.ext?"Extended warranty (wet parts)":"Warranty"} to <b class="num">${fmtD(r.wEnd)}</b>${r.wBy=="hours"?" (4 000 h)":""}`:`${r.ext?"Extended warranty":"Warranty"} ended ${fmtD(r.wEnd)}${r.wBy=="hours"?" (4 000 h)":""}`):(r.ext?"Extended warranty: add the purchase date":"")].filter(Boolean);
  return `<p class="note" style="background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;color:var(--ink)">${bits.join(" · ")}</p>`;
}
function svcExportRows(){
  const list=svList();
  const aoa=SVC.tab=="warranty"?[["KLIENT","MASJIEN","S/N","AANGEKOOP","COVER","WARRANTY ENDS","ENDS BY","DAYS LEFT","EST. HOURS NOW","WARRANTY JOBS"],
    ...list.map(r=>[r.c,r.i,r.s,fmtD(r.pur),svCover(r),fmtD(r.wEnd),r.wBy=="hours"?"4 000 h":"date",r.wLeft,r.est,r.wJobs])]
   :[["KLIENT","MASJIEN","S/N","LAST SERVICE DATE","LAST SERVICE (H)","LAST SERVICE J/C","LAST HOURS","LAST HOURS DATE","HRS/DAY","EST. HOURS TODAY (ESTIMATE)","NEXT SERVICE (H)","SERVICE TYPE","STATUS","EST. DUE DATE","RECORDED HOURS PAST DUE"],
    ...list.map(r=>[r.c,r.i,r.s,r.lastS?fmtD(r.lastS.d):"",r.lastS?.iv??"",r.lastS?.jc??"",r.lastR?.h??"",r.lastR?fmtD(r.lastR.d):"",r.rate?+r.rate.toFixed(2):"",r.est??"",r.next??"",r.kind?(r.kind=="major"?"Major":"Normal"):"",r.status,r.dueDate&&r.rank>=1&&r.rank<=4?fmtD(r.dueDate):"",(r.rank==0||r.rank==5)&&r.over>=0?Math.round(r.over):""])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=aoa[0].map((h,i)=>({wch:i<2?28:14}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,SVC.tab=="warranty"?"Warranty":"Service");
  return {wb,name:`Service_register_${SVC.tab=="warranty"?"warranty":SVC.tab=="due"?"due_"+SVC.days+"_days":"all"}_${todayISO()}.xlsx`};
}
/* events: each app defines svcRender() and svcSave(wb,name) */
document.addEventListener("click",e=>{const b=e.target.closest("[data-svc]");if(!b||b.tagName=="SELECT"||b.type=="checkbox")return;const k=b.dataset.svc;
  if(k=="tab"){SVC.tab=b.dataset.v;svcRender()}else if(k=="days"){SVC.days=+b.dataset.v;svcRender()}
  else if(k=="export"){if(!window.XLSX)return toast("Excel export isn't available yet. Open the app online once, then try again.");const x=svcExportRows();svcSave(x.wb,x.name)}});
document.addEventListener("change",e=>{const b=e.target.closest("[data-svc]");if(!b)return;
  if(b.dataset.svc=="stale"){SVC.stale=b.checked;svcRender()}});
document.addEventListener("input",e=>{if(!e.target.matches("[data-svcq]"))return;SVC.q=e.target.value;const pos=e.target.selectionStart;svcRender();const el=document.querySelector("[data-svcq]");if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(_){}}});
