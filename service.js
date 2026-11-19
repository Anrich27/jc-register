/* ---------- Service & warranty register ----------
   Worked out from the job cards only:
   - a service job is a card line containing "service" (not air-con only); its interval is the hour figure on that line
     ("Carry out 600 hour service", "1 250hr service")
   - the machine's service step (250, 300 …) comes from the gaps between its own services, else from other machines of the
     same model, else from the last interval itself
   - hours per day come from the in-sequence hour readings of the last two years
   - warranty end = purchase date + the warranty period set on the screen
   Shared by the master register (Claude) and the offline phone copy: keep both copies identical. */
const SVC={tab:"due",days:60,q:"",stale:false,months:24,rows:null,at:null};
try{const m=+localStorage.getItem("svc-months");if(m>0)SVC.months=m}catch(e){}
const SVC_STEPS=[100,150,200,250,300,350,400,500,600];
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
function svMode(list){const c={};let best=null;for(const v of list){c[v]=(c[v]||0)+1;if(best==null||c[v]>c[best]||(c[v]==c[best]&&v<best))best=v}return best}
function svCore(m){
  if((m.meter||"hours")!="hours")return null;
  const c=String(m.customer||"").toUpperCase(),it=String(m.item||"").toUpperCase();
  if(c=="SALES"||c.startsWith("MIDDELBURG INTERNATIONAL")||/LOOSE PART|COMPANY VEHICLE/.test(it))return null;
  const jobs=(m.jobs||[]).filter(j=>j.date).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(+a.jc||0)-(+b.jc||0));
  const reads=svRising(jobs.filter(j=>j.hours!=null&&+j.hours>0).map(j=>({d:j.date,h:+j.hours})));
  const svcs=[];
  for(const j of jobs)for(const line of (j.details||[]))if(svIsService(line)){svcs.push({d:j.date,jc:j.jc,iv:svInterval(line),h:j.hours!=null?+j.hours:null,t:line});break}
  const ivs=svcs.filter(s=>s.iv),gaps=[];for(let i=1;i<ivs.length;i++){const g=ivs[i].iv-ivs[i-1].iv;if(SVC_STEPS.includes(g))gaps.push(g)}
  return {m,jobs,reads,svcs,ownStep:gaps.length?svMode(gaps):null,model:svModel(m.item),warrantyJobs:jobs.filter(j=>/warrant/i.test((j.details||[]).join(" "))).length,lastJob:jobs.length?jobs[jobs.length-1].date:null}
}
function svBuild(machines){
  const today=svDay(todayISO()),cores=machines.map(svCore).filter(Boolean),fleet={};
  for(const x of cores)if(x.ownStep)(fleet[x.model]=fleet[x.model]||[]).push(x.ownStep);
  const rows=cores.map(x=>{
    const {m,reads,svcs}=x,lastR=reads[reads.length-1]||null,lastS=svcs[svcs.length-1]||null,lastIv=[...svcs].reverse().find(s=>s.iv)||null;
    let rate=null;
    if(lastR){const win=reads.filter(r=>svDay(r.d)>=svDay(lastR.d)-730),f=win[0],span=svDay(lastR.d)-svDay(f.d);
      if(span>=45&&lastR.h>f.h)rate=(lastR.h-f.h)/span;
      else if(reads.length>1){const f2=reads[0],s2=svDay(lastR.d)-svDay(f2.d);if(s2>=45&&lastR.h>f2.h)rate=(lastR.h-f2.h)/s2}}
    const seen=lastR?today-svDay(lastR.d):null,est=lastR?Math.round(lastR.h+(rate||0)*Math.min(seen,730)):null;
    let step=x.ownStep||(fleet[x.model]?svMode(fleet[x.model]):null),stepSrc=x.ownStep?"own":step?"model":null;
    const base=lastIv?lastIv.iv:null;
    if(!step&&base){step=base%300==0&&base%250!=0?300:base%250==0?250:base%300==0?300:250;stepSrc="guess"}
    if(!step){step=250;stepSrc="guess"}
    let next=null;
    if(base!=null)next=Math.floor(base/step)*step+step;else if(lastR)next=Math.floor(lastR.h/step)*step+step;
    let dueIn=null,dueDate=null;
    if(next!=null&&est!=null&&rate>0){dueIn=Math.round((next-est)/rate);dueDate=svISO(today+Math.max(dueIn,0))}
    const stale=!x.lastJob||today-svDay(x.lastJob)>548||m.sold||m.inactive;
    let status,rank;
    if(!lastR){status="No hours on file";rank=8}
    else if(!lastIv){status="No service on file";rank=7}
    else if(est>=next+step){status="Long overdue";rank=5}
    else if(est>=next){status="Due now";rank=0}
    else if(dueIn==null){status="Usage unknown";rank=6}
    else if(dueIn<=30){status="Due in 30 days";rank=1}
    else if(dueIn<=60){status="Due in 60 days";rank=2}
    else if(dueIn<=90){status="Due in 90 days";rank=3}
    else{status="Later";rank=4}
    const pur=svDate(m.purchased),wEnd=pur?svAddMonths(pur,SVC.months):null,wLeft=wEnd?svDay(wEnd)-today:null;
    return {id:m._id,c:m.customer||"",i:m.item||"",s:m.serial||"",model:x.model,lastS,lastIv,lastR,rate,est,seen,step,stepSrc,next,over:next!=null&&est!=null?est-next:null,
      dueIn,dueDate,status,rank,stale,sold:!!m.sold,inactive:!!m.inactive,pur,wEnd,wLeft,wJobs:x.warrantyJobs,lastJob:x.lastJob,nSvc:svcs.length}
  });
  return rows;
}
function svRefresh(machines){SVC.rows=svBuild(machines);SVC.at=Date.now();return SVC.rows}
function svFor(m){return (SVC.rows&&SVC.rows.find(r=>r.id==m._id))||svBuild([m])[0]||null}

/* ---------- views ---------- */
const svChip=r=>`<span class="chip ${r.rank<=3||r.rank==5?"":"src"}" style="margin-left:0${r.rank==0?";background:var(--accent-soft);color:var(--accent)":""}">${esc(r.status)}</span>`;
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
   <div><b class="num">${cnt(r=>r.rank==0)}</b><span>due now</span></div>
   <div><b class="num">${cnt(r=>r.rank==1)}</b><span>due in 30 days</span></div>
   <div><b class="num">${cnt(r=>r.rank==2)}</b><span>due in 31–60 days</span></div>
   <div><b class="num">${cnt(r=>r.rank==5)}</b><span>long overdue</span></div>
   <div><b class="num">${wa.length}</b><span>in warranty</span></div>
   <div><b class="num">${wa.filter(r=>r.wLeft<=90).length}</b><span>warranty ends in 90 days</span></div></div>
  <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" data-svc="tab" data-v="${k}" aria-selected="${SVC.tab==k}">${l}</button>`).join("")}</div>
  <div class="fs" style="max-width:980px;border-top:0;border-radius:0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-top:0">
   <input data-svcq type="search" value="${esc(SVC.q)}" placeholder="Filter by client, model or serial" aria-label="Filter" style="flex:1 1 200px;min-width:0;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--sunk)">
   ${SVC.tab=="due"?`<div class="seg" role="group" aria-label="Window">${[30,60,90].map(d=>`<button data-svc="days" data-v="${d}" aria-pressed="${SVC.days==d}">${d} days</button>`).join("")}</div>`:""}
   ${SVC.tab!="warranty"?`<label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)"><input type="checkbox" data-svc="stale" ${SVC.stale?"checked":""}> Include sold, inactive and machines not seen for 18 months</label>`
     :`<label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)">Warranty period <select data-svc="months" style="padding:5px 6px;border:1px solid var(--line);border-radius:5px;background:var(--sunk)">${[12,24,36,48,60].map(n=>`<option value="${n}" ${SVC.months==n?"selected":""}>${n} months</option>`).join("")}</select> from purchase date</label>`}
  </div>`;
  const shown=list.slice(0,400);
  if(!list.length)return html+`<div class="empty" style="margin-top:12px"><h2>Nothing to show</h2><p>${SVC.tab=="warranty"?"No machines with a purchase date inside the warranty period. Purchase dates come from the AANGEKOOP field on each machine.":"No machines match. Try a longer window or clear the filter."}</p></div>`;
  if(SVC.tab=="warranty"){
    html+=`<div class="tablebox"><table><thead><tr><th>KLIENT</th><th>MASJIEN</th><th>AANGEKOOP</th><th>WARRANTY ENDS</th><th class="r">DAYS LEFT</th><th class="r">EST. HOURS</th><th class="r">WARRANTY JOBS</th></tr></thead><tbody>`+
      shown.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td><b>${esc(r.c)}</b><br><span class="num" style="color:var(--muted);font-size:12px">${esc(r.s||"no serial")}</span></td><td>${esc(r.i)}</td><td class="num">${fmtD(r.pur)}</td><td class="num">${fmtD(r.wEnd)}${r.wLeft<=90?` <span class="chip">Ends soon</span>`:""}</td><td class="r num">${r.wLeft}</td><td class="r num">${svH(r.est)}</td><td class="r num">${r.wJobs||""}</td></tr>`).join("")+`</tbody></table></div>`;
  }else{
    html+=`<div class="tablebox"><table><thead><tr><th>KLIENT</th><th>MASJIEN</th><th>LAST SERVICE</th><th class="r">LAST HOURS</th><th class="r">HRS/DAY</th><th class="r">EST. NOW</th><th class="r">NEXT</th><th>DUE</th></tr></thead><tbody>`+
      shown.map(r=>`<tr class="rrow" data-m="${esc(r.id)}" tabindex="0"><td><b>${esc(r.c)}</b><br><span class="num" style="color:var(--muted);font-size:12px">${esc(r.s||"no serial")}</span></td><td>${esc(r.i)}</td>
       <td>${r.lastS?`<span class="num">${fmtD(r.lastS.d)}</span><br><span style="color:var(--muted);font-size:12px">${r.lastS.iv?fmtH(r.lastS.iv)+" h service":"service"} · J/C ${esc(r.lastS.jc??"—")}</span>`:`<span style="color:var(--muted)">None on file</span>`}</td>
       <td class="r num">${r.lastR?fmtH(r.lastR.h)+`<br><span style="color:var(--muted);font-size:12px">${fmtD(r.lastR.d)}</span>`:"—"}</td>
       <td class="r num">${r.rate?r.rate.toFixed(1):"—"}</td><td class="r num">${svH(r.est)}</td>
       <td class="r num">${r.next!=null?fmtH(r.next)+" h":"—"}${r.stepSrc=="guess"?`<br><span style="color:var(--muted);font-size:12px">step guessed</span>`:""}</td>
       <td>${svChip(r)}${(r.rank==0||r.rank==5)&&r.over>0?`<br><span style="color:var(--muted);font-size:12px">${fmtH(Math.round(r.over))} h past</span>`:r.dueDate&&r.rank<5?`<br><span class="num" style="color:var(--muted);font-size:12px">≈ ${fmtD(r.dueDate)}</span>`:""}</td></tr>`).join("")+`</tbody></table></div>`;
  }
  html+=`<p class="note">${list.length>shown.length?`Showing ${shown.length} of ${list.length}. Filter or download the call list to see them all. `:`${list.length} machine${list.length==1?"":"s"}. `}
   ${SVC.tab=="warranty"?`Warranty end = purchase date + ${SVC.months} months. Check the actual terms per machine before quoting a customer.`
   :SVC.tab=="long"?`More than a full service interval past due, with no later service on our cards. Most of these are probably serviced elsewhere or by the farmer: worth a call.`
   :`Estimates use each machine's own hour readings and the hour figure on its service cards. Phone the customer before booking: the hour meter may have moved faster or slower than the estimate.`}</p>`;
  return html;
}
function svcMachineBox(m){
  const r=svFor(m);if(!r)return "";
  const bits=[r.lastS?`Last service <b class="num">${fmtD(r.lastS.d)}</b>${r.lastS.iv?` (${fmtH(r.lastS.iv)} h)`:""}`:"No service on file",
    r.est!=null?`Est. hours now <b class="num">${fmtH(r.est)}</b>${r.rate?` (${r.rate.toFixed(1)} h/day)`:""}`:"",
    r.next!=null?`Next <b class="num">${fmtH(r.next)} h</b> ${svChip(r)}${r.dueDate&&r.rank>0&&r.rank<5?` <span class="num">≈ ${fmtD(r.dueDate)}</span>`:""}`:"",
    r.wEnd?(r.wLeft>=0?`Warranty to <b class="num">${fmtD(r.wEnd)}</b>`:`Warranty ended ${fmtD(r.wEnd)}`):""].filter(Boolean);
  return `<p class="note" style="background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;color:var(--ink)">${bits.join(" · ")}</p>`;
}
function svcExportRows(){
  const list=svList();
  const aoa=SVC.tab=="warranty"?[["KLIENT","MASJIEN","S/N","AANGEKOOP","WARRANTY ENDS","DAYS LEFT","EST. HOURS NOW","WARRANTY JOBS"],
    ...list.map(r=>[r.c,r.i,r.s,fmtD(r.pur),fmtD(r.wEnd),r.wLeft,r.est,r.wJobs])]
   :[["KLIENT","MASJIEN","S/N","LAST SERVICE DATE","LAST SERVICE (H)","LAST SERVICE J/C","LAST HOURS","LAST HOURS DATE","HRS/DAY","EST. HOURS NOW","NEXT SERVICE (H)","STATUS","EST. DUE DATE","HOURS PAST DUE"],
    ...list.map(r=>[r.c,r.i,r.s,r.lastS?fmtD(r.lastS.d):"",r.lastS?.iv??"",r.lastS?.jc??"",r.lastR?.h??"",r.lastR?fmtD(r.lastR.d):"",r.rate?+r.rate.toFixed(2):"",r.est??"",r.next??"",r.status,r.dueDate&&r.rank<5?fmtD(r.dueDate):"",(r.rank==0||r.rank==5)&&r.over>0?Math.round(r.over):""])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=aoa[0].map((h,i)=>({wch:i<2?28:14}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,SVC.tab=="warranty"?"Warranty":"Service");
  return {wb,name:`Service_register_${SVC.tab=="warranty"?"warranty":SVC.tab=="due"?"due_"+SVC.days+"_days":"all"}_${todayISO()}.xlsx`};
}
/* events: each app defines svcRender() and svcSave(wb,name) */
document.addEventListener("click",e=>{const b=e.target.closest("[data-svc]");if(!b||b.tagName=="SELECT"||b.type=="checkbox")return;const k=b.dataset.svc;
  if(k=="tab"){SVC.tab=b.dataset.v;svcRender()}else if(k=="days"){SVC.days=+b.dataset.v;svcRender()}
  else if(k=="export"){if(!window.XLSX)return toast("Excel export isn't available yet. Open the app online once, then try again.");const x=svcExportRows();svcSave(x.wb,x.name)}});
document.addEventListener("change",e=>{const b=e.target.closest("[data-svc]");if(!b)return;
  if(b.dataset.svc=="stale"){SVC.stale=b.checked;svcRender()}
  if(b.dataset.svc=="months"){SVC.months=+b.value;try{localStorage.setItem("svc-months",SVC.months)}catch(_){}svcRecalc();svcRender()}});
document.addEventListener("input",e=>{if(!e.target.matches("[data-svcq]"))return;SVC.q=e.target.value;const pos=e.target.selectionStart;svcRender();const el=document.querySelector("[data-svcq]");if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(_){}}});
