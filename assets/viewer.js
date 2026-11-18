'use strict';
async function startBoard(){
const BOARD=await BoardCore.loadBoard();
window.BOARD=BOARD;
const issues=BoardCore.validate(BOARD);
if(issues.length)throw new Error(issues.map(issue=>issue.message).join('；'));
const F=BOARD.framework;
const categoryMap=new Map(F.categories.map(x=>[x.id,x]));
const threadConfigMap=new Map(F.threads.map(x=>[x.id,x]));
const personMap=new Map(BOARD.people.map(x=>[x.id,x]));
const statusMap=new Map(F.statuses.map(x=>[x.id,x]));
const categoryName=id=>categoryMap.get(id)?.name||id;
const threadName=id=>threadConfigMap.get(id)?.name||id;
const personName=id=>personMap.get(id)?.name||id;
const statusInfo=id=>StatusUI.info(id,F.statuses);
const statusName=id=>statusInfo(id).label;
const layerName=id=>F.layers.find(x=>x.id===id)?.name||id;
const locationName=id=>F.locations.find(x=>x.id===id)?.name||id;
const isPending=id=>statusMap.get(id)?.isPending===true;
const isDone=id=>statusMap.get(id)?.isDone===true;
const shortDate=date=>date.slice(5);
const dayNumber=date=>date.slice(-2);
const monthNumber=date=>Number(date.slice(5,7));
const weekday=date=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Bangkok',weekday:'short'}).format(new Date(date+'T12:00:00+07:00'));
const dateText=date=>`${date.slice(0,4)} 年 ${monthNumber(date)} 月 ${dayNumber(date)} 日`;
const successors=BoardCore.deriveSuccessors(BOARD);
const DATA={
  event:{...BOARD.meta.event,updatedAt:BOARD.meta.updatedAt,timeZone:BOARD.meta.timeZone},
  brand:{title:BOARD.meta.title,...BOARD.meta.logos},
  people:BOARD.people.map(p=>p.id),
  aspects:F.categories.map(x=>x.id),
  dates:[...new Set([...F.stages.map(s=>s.date),...BOARD.tasks.map(t=>t.date)])].sort(),
  tags:F.threads.map(t=>({name:t.id,label:t.name,color:t.color,description:t.description})),
  tasks:BOARD.tasks.map(t=>({...t,aspect:t.category,tags:t.threads,assignees:t.executor,predecessors:t.pre,successors:successors[t.id]}))
};
function applyTheme(){for(const [key,value] of Object.entries(F.colors)){document.documentElement.style.setProperty('--'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value)}}

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS=BOARD.framework.icons;
const icon = (name,size=16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BoardCore.safeIconMarkup(ICONS[name] || ICONS.info || '')}</svg>`;
const PALETTE={layers:Object.fromEntries(F.layers.map(x=>[x.id,[x.color,x.background]])),aspects:Object.fromEntries(F.categories.map(x=>[x.id,x.color])),locations:Object.fromEntries(F.locations.map(x=>[x.id,[x.color,x.icon]]))};
const STATUSES=StatusUI.ordered(F.statuses);
const PENDING_ID=F.statuses.find(x=>x.isPending)?.id||'';
const statusCounts=()=>Object.fromEntries(STATUSES.map(id=>[id,DATA.tasks.filter(t=>t.status===id).length]));
const shownStatuses=()=>state.filters.status.length?STATUSES.filter(id=>state.filters.status.includes(id)):STATUSES;
const statusClass=t=>'st-'+statusInfo(t.status).kind;
const statusBadge=t=>StatusUI.badge(t.status,F.statuses);
const DAY_INFO=Object.fromEntries(DATA.dates.map(date=>[date,[weekday(date),F.stages.find(stage=>stage.date===date)?.name||'待补充']]));
const claimConfig=BoardCore.claimsConfig(BOARD), claims=BOARD.claims||[], pendingClaims=claims.filter(c=>c.status==='pending').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
const VIEWS=[...F.views.filter(v=>v.enabled),{id:'expenses',name:'费用',icon:'money',description:'逐项记录采购与改动，按付款人、类目核对支出。'},...(claimConfig.enabled?[{id:'claims',name:claimConfig.texts.viewTab+' '+pendingClaims.length,icon:'info',description:claimConfig.texts.viewName}]:[])];
const VIEW_INFO=Object.fromEntries(VIEWS.map(v=>[v.id,[v.name,v.description]]));

const state = {view:Object.keys(VIEW_INFO)[0],filters:{participant:'',assignee:'',aspect:'',date:'',tag:'',status:[]},search:'',networkGroup:'aspect',boardGroup:'assignee',selectedId:null,mobile:window.matchMedia('(max-width:800px)').matches,filtersOpen:false,zoom:{chain:1,network:1,board:1,timeline:1}};
// V5：桌面三栏面板收起状态、手机单栏／画布模式（只存在本机浏览器）
const UI_KEY='lkboard.layout.v5';
const UI_DEFAULT={stats:false,filters:false,detail:false,mobileCanvas:false};
const ui=(()=>{try{return {...UI_DEFAULT,...JSON.parse(localStorage.getItem(UI_KEY)||'{}')}}catch{return {...UI_DEFAULT}}})();
const saveUi=()=>{try{localStorage.setItem(UI_KEY,JSON.stringify(ui))}catch{}};
const deskMq=window.matchMedia('(min-width:1024px)');
let fullscreen=false,detailWasDocked=false;
const ZOOM_MIN=.2,ZOOM_MAX=1.5;
const canvasMode=()=>state.mobile&&ui.mobileCanvas&&!['expenses','claims'].includes(state.view);
const isDocked=()=>deskMq.matches&&!ui.detail&&!fullscreen&&state.view!=='expenses';
const byId = new Map(DATA.tasks.map(t=>[t.id,t]));
const tagMap = new Map(DATA.tags.map(t=>[t.name,t]));
let allEdges = [], topoOrder = [], visibleTasks = [], nodeLayout = new Map(), graphSize = {width:0,height:0};
const emptyRelations=()=>({upstream:new Set(),downstream:new Set(),sameTag:new Set(),directPredecessors:new Set(),directSuccessors:new Set()});
let relation = emptyRelations();
let lastOpener = null;
function validateData(){
  const errors=BoardCore.validate(BOARD);if(errors.length)return errors.map(e=>e.message);
  DATA.tasks.forEach(t=>t.predecessors.forEach(p=>allEdges.push([p,t.id])));
  const indegree=new Map(DATA.tasks.map(t=>[t.id,t.predecessors.length]));
  const queue=DATA.tasks.filter(t=>!indegree.get(t.id)).map(t=>t.id);
  while(queue.length){queue.sort((a,b)=>byId.get(a).date.localeCompare(byId.get(b).date)||a.localeCompare(b));const id=queue.shift();topoOrder.push(id);byId.get(id).successors.forEach(next=>{indegree.set(next,indegree.get(next)-1);if(!indegree.get(next))queue.push(next)})}
  return [];
}
function options(id,list,first){$('#'+id).innerHTML=`<option value="">${esc(first)}</option>`+list.map(item=>{const [value,label]=Array.isArray(item)?item:[item,item];return `<option value="${esc(value)}">${esc(label)}</option>`}).join('')}
function init(){
  const errors=validateData();
  if(errors.length){$('.app').innerHTML=`<div class="error-banner"><h1>任务数据需要检查</h1>${errors.map(e=>`<p>${esc(e)}</p>`).join('')}</div>`;return}
  applyTheme();
  document.title=BOARD.meta.title;
  $('#page-title').textContent=BOARD.meta.title;
  $('.hero-title').textContent=BOARD.meta.heroTitle;
  $('.tabs').innerHTML=VIEWS.map((v,i)=>`<button class="tab${v.id==='claims'?' tab-claims'+(pendingClaims.length?' has-pending':''):''}" id="tab-${v.id}" data-tab="${v.id}" role="tab" aria-selected="${v.id===state.view}" aria-controls="view-panel" tabindex="${v.id===state.view?0:-1}"><span>${icon(v.icon,17)}</span>${esc(v.name)}<span class="tab-index">${i+1}</span></button>`).join('');
  if(new URLSearchParams(location.search).get('preview')==='1'||new URLSearchParams(location.search).get('expenses-preview')==='1'){
    $('#preview-banner').hidden=false;
    $('#preview-banner').textContent='本地预览 · 浏览器草稿，尚未发布';
  }
  $('#date-range-footer').textContent=DATA.dates.length?`${shortDate(DATA.dates[0])} — ${shortDate(DATA.dates.at(-1))} · ${DATA.dates.length} 个日期`:'';
  for(const [key,id] of [['icon','logo-icon'],['community','logo-community']]){const image=$('#'+id),asset=DATA.brand[key];image.src=asset.src;image.width=asset.width;image.height=asset.height;}
  $('#mobile-event-extra').textContent=DATA.event.bonfire;
  $('#readonly-label').innerHTML=icon('lock',12)+'只读查看';
  $$('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon,17)});
  $('#search-icon').innerHTML=icon('search',14);
  $('#reset-filters').innerHTML=icon('reset',13)+'清空筛选';
  $('[data-action="close-dialog"]').innerHTML=icon('close',17);
  const updated = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(DATA.event.updatedAt));
  $('#updated-time').textContent=`最后更新 ${updated} · 曼谷时间`;
  $('#updated-time').dateTime=DATA.event.updatedAt;
  $('#mobile-event-extra').textContent=DATA.event.bonfire+' · 更新 '+updated.slice(5)+'（曼谷）';
  $('#event-meta').innerHTML=[['location',DATA.event.venue+' · '+DATA.event.city],['clock',DATA.event.startTime+'–'+DATA.event.endTime],['people',DATA.event.attendees],['money',DATA.event.fee]].map(([i,t])=>`<span>${icon(i,14)}${esc(t)}</span>`).join('');
  $('#event-note').innerHTML=icon('fire',16)+esc(DATA.event.bonfire);
  const eventDate=new Date(DATA.event.date+'T12:00:00+07:00');
  const [year,month,day]=DATA.event.date.split('-');
  $('.eyebrow').textContent=`${DATA.event.name} · ${DATA.event.city} · ${Number(month)} 月 ${Number(day)} 日`;
  $('.calendar-tile strong').textContent=Number(day);
  $('.calendar-tile span').innerHTML=`${Number(month)} 月 · ${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Bangkok',weekday:'short'}).format(eventDate)}<br>活动日`;
  {const line=[`${Number(month)}月${Number(day)}日 ${DATA.event.startTime}–${DATA.event.endTime}`,DATA.event.venue,DATA.event.fee].filter(Boolean).join(' · ');const el=$('#nav-event-line');el.textContent=line;el.title=line+'（点按展开／收起）';el.setAttribute('aria-label','活动信息：'+line);}$('#nav-calendar strong').textContent=Number(day);$('#nav-calendar span').innerHTML=$('.calendar-tile span').innerHTML;$('#nav-calendar').title=`${DATA.event.name} · ${Number(month)} 月 ${Number(day)} 日`;
  const pending=DATA.tasks.filter(t=>isPending(t.status)).length, unassigned=DATA.tasks.filter(t=>!t.assignees.length).length, completed=DATA.tasks.filter(t=>isDone(t.status)).length;
  const percent=DATA.tasks.length?Math.round(completed/DATA.tasks.length*100):0;
  $('#stats').innerHTML=`<div class="stat"><div class="stat-label">全部任务</div><div class="stat-number">${DATA.tasks.length}<small>项筹备与执行</small></div></div><button class="stat pending" data-action="filter-pending"><div class="stat-label">${esc(statusName(PENDING_ID))} ${icon('arrow',12)}</div><div class="stat-number">${pending}<small>项</small></div></button><button class="stat" data-action="filter-unassigned"><div class="stat-label">无执行人 ${icon('arrow',12)}</div><div class="stat-number">${unassigned}<small>项</small></div></button><div class="stat"><div class="stat-label">已完成</div><div class="stat-number">${completed}<small>项</small><em class="stat-pct">${percent}%</em></div></div><div class="stat"><div class="stat-progress"><span class="stat-label">整体完成进度 · ${completed} / ${DATA.tasks.length}</span><strong>${percent}<span style="font-size:14px;font-weight:400">%</span></strong></div><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="任务完成率"><i style="width:${percent}%"></i></div></div>`;
  const participants=[...new Set(DATA.tasks.flatMap(t=>t.participants))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  options('filter-participant',participants,'全部参与者');
  options('filter-assignee',[['assigned','有执行人'],['unassigned','无执行人'],...DATA.people.map(id=>[id,personName(id)])],'全部执行人');
  options('filter-aspect',DATA.aspects.map(id=>[id,categoryName(id)]),'全部方面');
  options('filter-date',DATA.dates.map(d=>[d,shortDate(d)+' · '+DAY_INFO[d][0]]),'全部日期');
  options('filter-tag',DATA.tags.map(t=>[t.name,t.label]),'全部标签');
  $('#legend').innerHTML=`<span class="legend-item legend-label">色条</span>${Object.entries(PALETTE.layers).map(([k,v])=>`<span class="legend-item"><i class="swatch" style="background:${v[0]}"></i>${esc(layerName(k))}层</span>`).join('')}<i class="divider"></i>${Object.entries(PALETTE.locations).map(([k,v])=>`<span class="legend-item" style="color:${v[0]}">${icon(v[1],12)}${esc(locationName(k))}</span>`).join('')}<i class="divider"></i><span class="legend-item legend-label">状态</span>${STATUSES.map(id=>`<span class="legend-item">${StatusUI.badge(id,F.statuses)}</span>`).join('')}<i class="divider"></i><span class="legend-item"><span class="tag" style="--tag-color:#9b7f63">线索</span>标签</span><span class="legend-item legend-log"><span class="log-mark" aria-hidden="true">${icon('clock',10)}</span>有进度记录</span>`;
  $('#validation-status').innerHTML='<i></i>依赖已校验 · 无悬空 · 无环';
  const hash=location.hash.slice(1);if(VIEW_INFO[hash])state.view=hash;
  bindEvents();render();
  // v10.1：任务深链 ?task=编号（认领卡片二维码指向这里），直接打开该任务详情
  const deepTask=new URLSearchParams(location.search).get('task');if(deepTask&&byId.has(deepTask))openTask(deepTask);
}
function getVisible(){return DATA.tasks.filter(t=>{
  const f=state.filters;
  if(f.participant&&!t.participants.includes(f.participant))return false;
  if(f.assignee==='assigned'&&!t.assignees.length)return false;
  if(f.assignee==='unassigned'&&t.assignees.length)return false;
  if(f.assignee&&!['assigned','unassigned'].includes(f.assignee)&&!t.assignees.includes(f.assignee))return false;
  if(f.aspect&&t.aspect!==f.aspect)return false;
  if(f.date&&t.date!==f.date)return false;
  if(f.tag&&!t.tags.includes(f.tag))return false;
  if(f.status.length&&!f.status.includes(t.status))return false;
  if(state.search&&!`${t.id} ${t.title} ${t.description} ${t.notes} ${t.participants.join(' ')}`.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()))return false;
  return true;
})}
function resetFilters(){state.filters={participant:'',assignee:'',aspect:'',date:'',tag:'',status:[]};state.search='';state.selectedId=null;relation=emptyRelations();$$('[data-filter]').forEach(s=>s.value='');$('#search-input').value='';render()}
function tagHtml(name){const tag=tagMap.get(name);return `<span class="tag" style="--tag-color:${tag.color}" title="${esc(tag.description)}">${esc(tag.label)}</span>`}
function ownerHtml(t,compact=false,laneOwner=null){
  if(laneOwner==='__unassigned__'&&!t.assignees.length)return '';
  if(!t.assignees.length)return '<span class="assignee unassigned">无执行人</span>';
  const list=laneOwner?t.assignees.filter(id=>id!==laneOwner):t.assignees;if(!list.length)return '';
  const ids=compact?list.slice(0,2):list;
  return `<span class="owners">${ids.map(id=>`<span class="assignee" style="background:${personMap.get(id).color}">${esc(personName(id))}</span>`).join('')}${compact&&list.length>2?`<span class="tag-more">+${list.length-2}</span>`:''}</span>`;
}
function relationFor(id){
  if(!state.selectedId)return 'neutral';
  if(id===state.selectedId)return 'selected';
  if(relation.directPredecessors.has(id))return 'predecessor';
  if(relation.directSuccessors.has(id))return 'successor';
  if(relation.upstream.has(id))return 'upstream';
  if(relation.downstream.has(id))return 'downstream';
  if(relation.sameTag.has(id))return 'same-tag';
  return 'unrelated';
}
function relationshipFlags(id){return {'directPredecessor':relation.directPredecessors.has(id),'directSuccessor':relation.directSuccessors.has(id),'sameTag':relation.sameTag.has(id),'upstream':relation.upstream.has(id),'downstream':relation.downstream.has(id)}}
function relationshipAttributes(id){return Object.entries(relationshipFlags(id)).map(([key,value])=>`data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${value}"`).join(' ')}
function relationshipLabels(id){
  const r=relationFor(id),names={selected:'当前任务',predecessor:'直接前置',successor:'直接后置',upstream:'间接上游',downstream:'间接下游','same-tag':'同线索'};
  let html=names[r]?`<span class="relation-label relation-${r}">${names[r]}</span>`:'';
  if(relation.sameTag.has(id)&&r!=='same-tag')html+='<span class="relation-label relation-same-tag">同线索</span>';
  return html;
}
function taskCard(t,kind='regular',pos=null,laneOwner=null){
  if(!pos)return compactCard(t,kind,laneOwner);
  const [color,bg]=PALETTE.layers[t.layer], [locColor,locIcon]=PALETTE.locations[t.location];
  const style=`--layer-color:${color};--card-bg:${bg};`+(pos?`left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;`:'');
  const tagLimit=pos?2:3; const tags=t.tags.slice(0,tagLimit).map(tagHtml).join('');
  return `<button class="task-card ${pos?'graph-node':''} ${kind==='network'?'network-node':''} ${isPending(t.status)?'is-pending':''} ${statusClass(t)}" data-status="${esc(t.status)}" style="${style}" data-task="${esc(t.id)}" data-relation="${relationFor(t.id)}" ${relationshipAttributes(t.id)} aria-label="${esc(t.id+' '+t.title+'，'+statusName(t.status)+'，'+(t.assignees.map(personName).join('、')||'无执行人'))}" title="${esc(t.title)}"><div class="task-top"><span class="task-id">${esc(t.id)}${logDot(t)}</span>${statusBadge(t)}<span class="layer-label">${esc(layerName(t.layer))}</span><span class="location" style="color:${locColor}">${icon(locIcon,11)}${esc(locationName(t.location))}</span></div><div class="task-title">${esc(t.title)}</div><div class="task-bottom">${ownerHtml(t,true)}<span class="task-time">${esc(kind==='chain'?(t.timeHint||'当天'):shortDate(t.date)+(t.timeHint?' · '+t.timeHint:''))}</span></div><div class="task-tags">${tags}${t.tags.length>tagLimit?`<span class="tag-more">+${t.tags.length-tagLimit}</span>`:''}</div><div class="task-relation-labels">${relationshipLabels(t.id)}</div></button>`;
}
function logDot(t){const n=(t.progress_log||[]).length;return n?`<span class="log-mark" title="有 ${n} 条进度记录" aria-label="有 ${n} 条进度记录" role="img">${icon('clock',10)}</span>`:''}
// v6：紧凑卡片（看板、时间轴、手机单栏）。两行：编号＋标题；执行人·日期·地点·层级·标签。
function compactCard(t,kind,laneOwner=null){
  const [color,bg]=PALETTE.layers[t.layer], [locColor,locIcon]=PALETTE.locations[t.location];
  const tags=t.tags.slice(0,2).map(tagHtml).join('')+(t.tags.length>2?`<span class="tag-more">+${t.tags.length-2}</span>`:'');
  const time=kind==='chain'?(t.timeHint||'当天'):shortDate(t.date)+(t.timeHint?' '+t.timeHint:'');
  return `<button class="task-card compact-card ${isPending(t.status)?'is-pending':''} ${statusClass(t)}" data-status="${esc(t.status)}" style="--layer-color:${color};--card-bg:${bg};" data-task="${esc(t.id)}" data-relation="${relationFor(t.id)}" ${relationshipAttributes(t.id)} aria-label="${esc(t.id+' '+t.title+'，'+statusName(t.status)+'，'+(t.assignees.map(personName).join('、')||'无执行人'))}" title="${esc(t.title+' · '+layerName(t.layer)+'层 · '+locationName(t.location))}"><div class="task-head"><span class="task-id">${esc(t.id)}${logDot(t)}</span><span class="task-title">${esc(t.title)}</span></div><div class="task-meta">${statusBadge(t)}${ownerHtml(t,true,laneOwner)}<span class="task-time">${esc(time)}</span><span class="location" style="color:${locColor}" title="${esc(locationName(t.location))}">${icon(locIcon,11)}<span class="loc-name">${esc(locationName(t.location))}</span></span><span class="layer-label" title="${esc(layerName(t.layer))}层">${esc(layerName(t.layer))}</span><span class="task-tags">${tags}</span><span class="task-relation-labels">${relationshipLabels(t.id)}</span></div></button>`;
}
function render(){
  const expensesMode=state.view==='expenses';
  document.body.classList.toggle('expense-mode',expensesMode);
  const compact=state.mobile&&!ui.mobileCanvas;
  placeNav();
  syncLayout();
  const currentStamp=expensesMode&&expenseView.getData()?expenseView.getData().meta.updatedAt:DATA.event.updatedAt;
  const currentUpdated=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(currentStamp));
  $('#updated-time').textContent=(expensesMode?'费用更新 ':'任务更新 ')+currentUpdated+' · 曼谷时间';
  $('#updated-time').dateTime=currentStamp;
  $('#mobile-event-extra').textContent=DATA.event.bonfire+' · '+(expensesMode?'费用更新 ':'任务更新 ')+currentUpdated.slice(5)+'（曼谷）';
  $('.view-nav .search').classList.toggle('has-value',!!$('#search-input').value);
  $('#search-input').placeholder=expensesMode?'查找费用名称或编号':'查找任务名称或编号';
  $('#search-input').setAttribute('aria-label',expensesMode?'查找费用名称或编号':'查找任务名称或编号');
  visibleTasks=getVisible();
  syncFilterSummary();
  syncFilterPanel();
  syncStatusBar();
  $$('[data-filter]').forEach(el=>el.classList.toggle('is-active',!!el.value));
  $$('[data-tab]').forEach(tab=>{const active=tab.dataset.tab===state.view;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1});
  $('#view-panel').setAttribute('aria-labelledby','tab-'+state.view);
  updateClaimBanner();
  $('#result-count').innerHTML=`显示 <b>${visibleTasks.length}</b> / ${DATA.tasks.length} 项`;$('#toggle-count').innerHTML=`<b>${visibleTasks.length}</b>/${DATA.tasks.length} 项`;
  $('#view-title').textContent=VIEW_INFO[state.view][0];
  $('#view-description').textContent=VIEW_INFO[state.view][1];
  if(state.view==='claims'){
    $('#view-title').textContent=claimConfig.texts.viewName;$('#view-controls').innerHTML='';$('#mobile-view-controls').innerHTML='';$('#focus-bar').hidden=true;
    const canvas=$('#canvas-scroll');canvas.className='workspace claims-workspace';
    canvas.innerHTML=`<div id="claims"><h2>${esc(claimConfig.texts.viewName)}</h2><p class="claim-intro">${esc(claimConfig.texts.viewIntro)}</p>${pendingClaims.length?pendingClaims.map(c=>{const t=byId.get(c.taskId);return `<article class="claim-item"><div class="claim-item-meta"><span><strong>${esc(c.id)}</strong><em class="claim-pill">${esc(claimConfig.texts.statusNames.pending)}</em></span><time>${esc(c.createdAt)}</time></div><button class="claim-task-link" data-task="${esc(c.taskId)}">${esc(c.taskId)} · ${esc(t?.title||'')}</button><p class="claim-who"><small>申请人</small><b>${esc(c.nickname)}</b></p><p class="claim-message">${esc(c.message)}</p></article>`}).join(''):'<p class="claim-empty">暂无待确认的认领申请</p>'}<p class="claim-processed">已处理 ${claims.length-pendingClaims.length} 条</p></div>`;
    $('#result-count').textContent=`待确认 ${pendingClaims.length} 条`;return;
  }
  if(expensesMode){
    $('#view-title').textContent=expenseView.getData()?.meta.title||'费用与支出';
    $('#view-controls').innerHTML='';$('#mobile-view-controls').innerHTML='';$('#focus-bar').hidden=true;
    const canvas=$('#canvas-scroll');canvas.className='workspace expenses-workspace';
    expenseView.render(canvas);
    $('#result-count').innerHTML=`显示 <b>${expenseView.visible().length}</b> / ${expenseView.getData()?.expenses.length||0} 条`;$('#toggle-count').textContent='';
    $('#dependency-count').textContent='费用只读查看 · 金额单位：泰铢';
    $('#validation-status').textContent=expenseView.getError()?'费用数据需检查':'费用编号、金额与任务引用已校验';
    return;
  }
  $('#validation-status').innerHTML='<i></i>依赖已校验 · 无悬空 · 无环';
  $('#interaction-hint').innerHTML=icon('info',12)+(state.view==='chain'||state.view==='network'?'箭头指向后置任务 · ':'')+'点击任务看说明与上下游；高亮时实线框＝直接前置／后置，虚线框＝间接，紫色底线＝同线索'+(canvasMode()?'；画布可上下左右拖动，双指或 −／＋ 缩放':'');
  let controls='';
  if(state.view==='network')controls=`<label class="group-control" title="分组方式"><span class="sr-only">分组</span><select id="network-group" aria-label="分组方式"><option value="aspect" ${state.networkGroup==='aspect'?'selected':''}>按方面</option><option value="tag" ${state.networkGroup==='tag'?'selected':''}>按线索标签</option></select></label>`;
  if(state.view==='board')controls=`<label class="group-control" title="泳道分组"><span class="sr-only">泳道</span><select id="board-group" aria-label="泳道分组"><option value="assignee" ${state.boardGroup==='assignee'?'selected':''}>按执行人</option><option value="aspect" ${state.boardGroup==='aspect'?'selected':''}>按方面</option></select></label>`;
  const zoomControls=`<div class="zoom-controls" aria-label="图形缩放"><button data-action="zoom-out" aria-label="缩小">−</button><button data-action="zoom-reset" class="zoom-value" title="恢复原始比例">${Math.round(state.zoom[state.view]*100)}%</button><button data-action="zoom-in" aria-label="放大">＋</button><button data-action="zoom-fit" class="zoom-fit" title="缩小到能看见全部内容">适合</button></div>`;
  if(state.mobile)controls=`<div class="mode-switch" role="group" aria-label="手机查看方式"><button data-action="mobile-mode" data-mode="list" aria-pressed="${!ui.mobileCanvas}">单栏</button><button data-action="mobile-mode" data-mode="canvas" aria-pressed="${ui.mobileCanvas}">画布</button></div>`+controls;
  if(canvasMode())controls+=zoomControls;
  if(!state.mobile&&['chain','network'].includes(state.view))controls+=zoomControls+`<button class="quiet-button icon-only" data-action="scroll-top" title="回到起点" aria-label="回到起点">${icon('reset',13)}</button>`;
  // v9.1：手机上「单栏／画布」和分组放在内容区顶部，不占顶部两行
  $('#view-controls').innerHTML=state.mobile?'':controls;$('#mobile-view-controls').innerHTML=state.mobile?controls:'';
  const canvas=$('#canvas-scroll');canvas.className='workspace'+(!compact&&['chain','network'].includes(state.view)?' graph':'')+(compact?' mobile-workspace':'')+(canvasMode()?' canvas-mode':'');canvas.scrollTop=0;canvas.scrollLeft=0;
  if(!visibleTasks.length){canvas.innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('search',27)}</div><h3>没有符合条件的任务</h3><p>调整参与者、执行人或其他筛选条件后查看。</p><button class="primary-button" data-action="reset-filters">${icon('reset',14)}清空筛选</button></div>`}
  else if(state.view==='chain')compact?renderMobileChain():renderChain();
  else if(state.view==='network')compact?renderMobileNetwork():renderNetwork();
  else if(state.view==='board')compact?renderMobileBoard():renderBoard();
  else renderTimeline();
  if(visibleTasks.length&&['board','timeline'].includes(state.view))applyZoom();
  const visibleIds=new Set(visibleTasks.map(t=>t.id));
  const edgeCount=allEdges.filter(([a,b])=>visibleIds.has(a)&&visibleIds.has(b)).length;
  $('#dependency-count').innerHTML=`当前 <b>${visibleTasks.length}</b> 项任务 · <b>${edgeCount}</b> 条依赖 <span style="margin-left:7px">全表 ${allEdges.length} 条</span>`;
  renderFocus();
  if(compact)$('#view-description').textContent=F.views.find(v=>v.id===state.view).mobileDescription;
  else if(canvasMode())$('#view-description').textContent='画布模式：上下左右拖动查看，双指或用 −／＋ 缩放，“适合”看全局。';
}
function renderChain(){
  const canvas=$('#canvas-scroll'), dates=state.filters.date?[state.filters.date]:DATA.dates;
  const w=Math.max(200,Math.min(216,(canvas.clientWidth-44-24*(Math.min(dates.length,6)-1))/Math.min(dates.length,6))),gap=24,left=22,top=104,h=visibleTasks.some(t=>t.assignees.length>1)?170:148,rowGap=18;
  const layout=new Map(), columns=[];
  const visible=new Set(visibleTasks.map(t=>t.id));
  let maxRows=1;
  dates.forEach((date,di)=>{
    const tasks=topoOrder.filter(id=>visible.has(id)&&byId.get(id).date===date).map(id=>byId.get(id));
    maxRows=Math.max(maxRows,tasks.length);
    const x=left+di*(w+gap);
    tasks.forEach((t,row)=>layout.set(t.id,{x:x+7,y:top+row*(h+rowGap),w:w-14,h,group:date}));
    columns.push({date,x,tasks});
  });
  graphSize={width:left*2+dates.length*(w+gap)-gap,height:Math.max(515,top+maxRows*(h+rowGap)+16)};
  let html=columns.map(({date,x,tasks})=>`<div class="day-column ${date===DATA.event.date?'event-day':''}" style="left:${x}px;width:${w}px"></div><div class="column-heading ${date===DATA.event.date?'event-day':''}" style="left:${x}px;width:${w}px"><div><span class="date-number">${dayNumber(date)}</span> <span class="date-name">${monthNumber(date)} 月 · ${DAY_INFO[date][0]}</span><span class="day-phase">${esc(DAY_INFO[date][1])}</span></div><span class="column-count">${tasks.length} 项</span></div>${!tasks.length?`<span style="position:absolute;left:${x+60}px;top:130px;color:#b5a18b;font-size:11px">当日无匹配任务</span>`:''}`).join('');
  nodeLayout=layout;
  html+=renderEdges(layout,'chain');
  html+=visibleTasks.map(t=>taskCard(t,'chain',layout.get(t.id))).join('');
  mountGraph(html);
}
function renderNetwork(){
  const grouping=state.networkGroup;
  const allGroups=grouping==='aspect'?DATA.aspects:DATA.tags.map(t=>t.name).concat('未标注线索');
  const groupOf=t=>grouping==='aspect'?t.aspect:(state.filters.tag&&t.tags.includes(state.filters.tag)?state.filters.tag:t.tags[0]||'未标注线索');
  const groups=allGroups.map(name=>({name,tasks:visibleTasks.filter(t=>groupOf(t)===name)})).filter(g=>g.tasks.length);
  const width=Math.max(380,Math.min(448,($('#canvas-scroll').clientWidth-52-60)/3)),margin=26,gapX=30,gapY=52,cols=3,nodeW=(width-51)/2,nodeH=visibleTasks.some(t=>t.assignees.length>1)?152:127;
  const layout=new Map();let html='',y=30;
  for(let start=0;start<groups.length;start+=cols){
    const row=groups.slice(start,start+cols),rowHeight=Math.max(...row.map(g=>59+Math.ceil(g.tasks.length/2)*(nodeH+12)+12));
    row.forEach((g,idx)=>{
      const x=margin+idx*(width+gapX),color=grouping==='aspect'?PALETTE.aspects[g.name]:(tagMap.get(g.name)?.color||'#9b8168');
      const clusterH=59+Math.ceil(g.tasks.length/2)*(nodeH+12)+12;
      html+=`<div class="network-cluster" style="left:${x}px;top:${y}px;width:${width}px;height:${clusterH}px;--cluster-color:${color}"></div><div class="cluster-heading" style="left:${x+17}px;top:${y+17}px;--cluster-color:${color}"><i class="swatch" style="height:8px;background:${color}"></i>${esc(grouping==='aspect'?categoryName(g.name):threadName(g.name))}<span>${g.tasks.length} 项</span></div>`;
      const order=topoOrder.filter(id=>g.tasks.some(t=>t.id===id));
      order.forEach((id,i)=>layout.set(id,{x:x+17+(i%2)*(nodeW+17),y:y+52+Math.floor(i/2)*(nodeH+12),w:nodeW,h:nodeH,group:g.name}));
    });
    y+=rowHeight+gapY;
  }
  graphSize={width:margin*2+Math.min(cols,groups.length)*(width+gapX)-gapX,height:Math.max(515,y-20)};
  nodeLayout=layout;
  html+=renderEdges(layout,'network');html+=visibleTasks.map(t=>taskCard(t,'network',layout.get(t.id))).join('');
  mountGraph(html);
  if(grouping==='tag')$('#view-description').textContent='按首个线索标签归组；筛选标签时归入该标签，完整标签见卡片与详情。';
}
function edgeRelation(a,b){if(!state.selectedId)return 'neutral';const up=new Set([...relation.upstream,state.selectedId]),down=new Set([...relation.downstream,state.selectedId]);return up.has(a)&&up.has(b)?'upstream':down.has(a)&&down.has(b)?'downstream':'unrelated'}
function renderEdges(layout,mode){
  let lines='';
  allEdges.forEach(([a,b],i)=>{
    const A=layout.get(a),B=layout.get(b);if(!A||!B)return;
    let d;
    if(mode==='chain'){
      const sy=A.y+A.h*.49,ty=B.y+B.h*.49;
      if(A.x===B.x){const x=A.x+A.w+9+(i%3)*3;d=`M ${A.x+A.w} ${sy} C ${x} ${sy}, ${x} ${sy}, ${x} ${sy+16} L ${x} ${ty-16} Q ${x} ${ty},${B.x+B.w+3} ${ty}`}
      else{const sx=A.x+A.w+1,tx=B.x-4,c=Math.max(26,(tx-sx)*.5);d=`M ${sx} ${sy} C ${sx+c} ${sy}, ${tx-c} ${ty}, ${tx} ${ty}`}
    }else{
      if(A.group===B.group&&A.x===B.x){const x=A.x+A.w+6;d=`M ${A.x+A.w} ${A.y+A.h/2} C ${x+7} ${A.y+A.h/2}, ${x+7} ${B.y+B.h/2}, ${B.x+B.w+2} ${B.y+B.h/2}`}
      else if(Math.abs(A.x-B.x)>250){const forward=A.x<B.x,sx=forward?A.x+A.w:A.x,tx=forward?B.x-3:B.x+B.w+3,sy=A.y+A.h/2,ty=B.y+B.h/2,c=(forward?1:-1)*Math.min(150,Math.abs(tx-sx)*.5);d=`M ${sx} ${sy} C ${sx+c} ${sy}, ${tx-c} ${ty}, ${tx} ${ty}`}
      else{const forward=A.y<B.y,sx=A.x+A.w/2,tx=B.x+B.w/2,sy=forward?A.y+A.h:A.y,ty=forward?B.y-3:B.y+B.h+3,c=(forward?1:-1)*Math.max(25,Math.min(90,Math.abs(ty-sy)/2));d=`M ${sx} ${sy} C ${sx} ${sy+c}, ${tx} ${ty-c}, ${tx} ${ty}`}
    }
    const rel=edgeRelation(a,b),mark=rel==='upstream'?'up':rel==='downstream'?'down':'default';
    lines+=`<path class="dependency-line" data-from="${a}" data-to="${b}" data-relation="${rel}" d="${d}" marker-end="url(#arrow-${mark})"/>`;
  });
  return `<svg class="graph-links" width="${graphSize.width}" height="${graphSize.height}" aria-hidden="true"><defs>${[['default',F.colors.muted],['up',F.colors.green],['down',F.colors.accent]].map(([name,color])=>`<marker id="arrow-${name}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L6 3 L0 6z" fill="${color}"/></marker>`).join('')}</defs>${lines}</svg>`;
}
function mountGraph(content){$('#canvas-scroll').innerHTML=`<div class="graph-shell"><div class="graph-stage" style="width:${graphSize.width}px;height:${graphSize.height}px">${content}</div></div>`;applyZoom()}
function applyZoom(){const zoom=state.zoom[state.view]||1;const stage=$('.graph-stage'),shell=$('.graph-shell');const label=$('.zoom-value');if(label)label.textContent=Math.round(zoom*100)+'%';if(!stage){const content=$('#canvas-scroll')?.firstElementChild;if(content&&['board','timeline'].includes(state.view))content.style.zoom=(canvasMode()&&!$('#canvas-scroll .empty-state'))?zoom:'';return}stage.style.transform=`scale(${zoom})`;shell.style.width=`${graphSize.width*zoom}px`;shell.style.height=`${graphSize.height*zoom}px`}
function fitZoom(){
  const canvas=$('#canvas-scroll'),stage=$('.graph-stage');let w,h;
  if(stage){w=graphSize.width;h=graphSize.height}else{const content=canvas.firstElementChild;if(!content)return;content.style.zoom='';w=content.scrollWidth;h=content.scrollHeight}
  const z=Math.min(1,(canvas.clientWidth-8)/w);// 以宽度为准看全局，纵向仍可滑动
  state.zoom[state.view]=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,Math.floor(z*100)/100));applyZoom();canvas.scrollTo({left:0,top:0});
}
function setZoom(z){state.zoom[state.view]=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,Math.round(z*100)/100));applyZoom()}
function syncLayout(){
  const b=document.body;
  b.classList.toggle('stats-collapsed',ui.stats);b.classList.toggle('filters-collapsed',ui.filters);b.classList.toggle('detail-collapsed',ui.detail);b.classList.toggle('is-fullscreen',fullscreen);
  const labels={stats:'数据',filters:'筛选',detail:'详情'};
  $$('.rail-toggle').forEach(btn=>{const key=btn.dataset.panel,collapsed=ui[key];btn.setAttribute('aria-expanded',String(!collapsed));btn.textContent=collapsed?(key==='detail'?'‹ ':'')+'展开'+labels[key]+(key==='detail'?'':' ›'):(key==='detail'?'收起 ›':'‹ 收起');btn.title=(collapsed?'展开':'收起')+labels[key]+'面板'});
  const fs=$('#fullscreen-toggle');fs.innerHTML=fullscreen?icon('close',13)+'退出全屏':'⤢ 全屏';fs.setAttribute('aria-pressed',String(fullscreen));fs.title=fullscreen?'退出全屏，回到原来的界面':'全屏查看：收起侧栏与其他信息，只保留导航栏';
  placeDialog();
}
function placeDialog(){
  const dialog=$('#task-dialog'),slot=$('#detail-slot'),docked=isDocked();
  if(docked&&dialog.parentElement!==slot){const reopen=(dialog.open||detailWasDocked)&&state.selectedId;detailWasDocked=false;if(dialog.open)dialog.close();slot.prepend(dialog);if(reopen){renderDetail(state.selectedId);dialog.show()}}
  else if(!docked&&dialog.parentElement!==document.body){detailWasDocked=dialog.open;if(dialog.open)dialog.close();document.body.appendChild(dialog)}
}
function laneTasks(group,aspect){return visibleTasks.filter(t=>aspect?t.aspect===group:group==='__unassigned__'?!t.assignees.length:t.assignees.includes(group))}
function laneName(group,aspect){return aspect?categoryName(group):group==='__unassigned__'?'无执行人':personName(group)}
function renderBoard(){
  const aspect=state.boardGroup==='aspect',groups=aspect?DATA.aspects:[...DATA.people,'__unassigned__'];
  const cols=shownStatuses();
  let html=`<div class="board-wrap" style="--status-count:${cols.length};--board-min-width:${20+cols.length*146}px"><div class="board-head"><div class="board-corner">${aspect?'范畴':'执行人'}</div>${cols.map(id=>`<div class="status-head status-head-${statusInfo(id).kind}" style="--status-color:${statusInfo(id).tone};--status-bg:${statusInfo(id).tone}20"><span><i class="status-dot"></i>${esc(statusName(id))}</span><span class="column-count">${visibleTasks.filter(t=>t.status===id).length}</span></div>`).join('')}</div>`;
  groups.forEach(group=>{
    const tasks=laneTasks(group,aspect),color=aspect?PALETTE.aspects[group]:personMap.get(group)?.color||F.colors.muted;
    html+=`<div class="board-lane" style="--lane-color:${color}"><div class="lane-label"><span class="lane-name">${esc(laneName(group,aspect))}</span><small>${tasks.length} 项</small></div>${cols.map(id=>{const items=tasks.filter(t=>t.status===id);return `<div tabindex="0" aria-label="${esc(laneName(group,aspect)+' · '+statusName(id)+'，可滚动查看')}" class="lane-cell ${items.length?'':'empty-cell'}">${items.length?items.map(t=>taskCard(t,'regular',null,aspect?null:group)).join(''):'—'}</div>`}).join('')}</div>`;
  });
  $('#canvas-scroll').innerHTML=html+'</div>';
}
function timeRank(t){const hint=t.timeHint;if(!hint)return 0;if(hint.includes('全天'))return -1;if(hint.includes('清晨'))return 6;if(hint.includes('上'))return 9;if(hint.includes('中午'))return 12;if(hint.includes('下'))return 15;if(hint.includes('傍晚'))return 18;if(hint.includes('晚')||hint.includes('夜'))return 21;const m=hint.match(/(\d{2}):(\d{2})/);return m?Number(m[1])+Number(m[2])/60:0}
function renderTimeline(){
  const dates=state.filters.date?[state.filters.date]:DATA.dates;
  $('#canvas-scroll').innerHTML='<div class="timeline-wrap">'+dates.map(date=>{
    const tasks=visibleTasks.filter(t=>t.date===date).sort((a,b)=>timeRank(a)-timeRank(b)||topoOrder.indexOf(a.id)-topoOrder.indexOf(b.id));
    const pending=tasks.filter(t=>isPending(t.status)).length;
    return `<section class="timeline-day"><div class="timeline-date ${date===DATA.event.date?'event-day':''}"><span>${date.slice(0,4)} 年 ${monthNumber(date)} 月</span><strong>${dayNumber(date)} <span>${DAY_INFO[date][0]}</span></strong><span class="day-phase">${esc(DAY_INFO[date][1])}</span>${date===DATA.event.date?`<span style="color:var(--accent);margin-top:5px">${esc(DATA.event.startTime)}–${esc(DATA.event.endTime)}</span>`:''}</div><div class="timeline-day-panel"><div class="timeline-day-heading"><span>${date===DATA.event.date?'活动当天':esc(DAY_INFO[date][1])}</span><small>${tasks.length} 项${pending?' · '+pending+' 项'+esc(statusName(PENDING_ID)):''}</small></div>${tasks.length?'<div class="timeline-tasks">'+tasks.map(t=>taskCard(t)).join('')+'</div>':'<div class="timeline-empty">当天无匹配任务</div>'}</div></section>`;
  }).join('')+'</div>';
}
function collectRelations(id){
  const current=byId.get(id);
  const visit=field=>{const visited=new Set(),stack=[...current[field]];while(stack.length){const next=stack.pop();if(visited.has(next))continue;visited.add(next);stack.push(...byId.get(next)[field])}return visited};
  relation={upstream:visit('predecessors'),downstream:visit('successors'),directPredecessors:new Set(current.predecessors),directSuccessors:new Set(current.successors),sameTag:new Set(DATA.tasks.filter(t=>t.id!==id&&t.tags.some(tag=>current.tags.includes(tag))).map(t=>t.id))};
}
function updateHighlight(){
  $$('.task-card').forEach(el=>{const id=el.dataset.task;el.dataset.relation=relationFor(id);Object.assign(el.dataset,relationshipFlags(id));$('.task-relation-labels',el).innerHTML=relationshipLabels(id)});
  $$('.mobile-task-item').forEach(el=>el.dataset.relation=relationFor(el.dataset.id));
  $$('.dependency-line').forEach(el=>{const rel=edgeRelation(el.dataset.from,el.dataset.to);el.dataset.relation=rel;el.setAttribute('marker-end',`url(#arrow-${rel==='upstream'?'up':rel==='downstream'?'down':'default'})`)});
  renderFocus();
}
function renderFocus(){
  const bar=$('#focus-bar');
  if(!state.selectedId){bar.hidden=true;return}
  const related=new Set([state.selectedId,...relation.upstream,...relation.downstream,...relation.sameTag]);
  const visibleCount=visibleTasks.filter(t=>related.has(t.id)).length;
  bar.hidden=false;
  bar.innerHTML=`<div class="focus-text"><strong>${esc(state.selectedId)} 关联任务</strong><span class="upstream-key">上游 ${relation.upstream.size}</span><span class="downstream-key">下游 ${relation.downstream.size}</span><span class="same-tag-key">同线索 ${relation.sameTag.size}</span><span class="focus-count">筛选内 ${visibleCount}/${related.size}</span></div><button class="quiet-button" data-action="clear-focus">${icon('close',12)}清除高亮</button>`;
}
function openTask(id,opener){
  if(!byId.has(id))return;
  const dialog=$('#task-dialog');
  if(!dialog.open)lastOpener=opener||document.activeElement;
  state.selectedId=id;collectRelations(id);updateHighlight();renderDetail(id);
  syncFilterSummary();
  placeDialog();
  if(isDocked()){if(!dialog.open)dialog.show();$('#detail-slot').scrollTop=0}
  else if(!dialog.open)dialog.showModal();
  requestAnimationFrame(fitFilterSummary);
  dialog.scrollTop=0;
  $('[data-action="close-dialog"]').focus({preventScroll:true});
}
function detailLinks(ids){return ids.length?`<div class="detail-links">${ids.map(id=>{const t=byId.get(id);return `<button class="dependency-button" data-task="${id}"><span>${id}</span><span>${esc(t.title)}</span><small>${shortDate(t.date)}</small>${icon('arrow',13)}</button>`}).join('')}</div>`:'<span class="detail-empty">无关联任务</span>'}
// v7：进度记录。小字颜色按背景自动加深到对比度 ≥4.5:1。
function lum(hex){const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
function mixHex(a,b,t){const p=h=>h.replace('#','').match(/../g).map(x=>parseInt(x,16));const A=p(a),B=p(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')}
function readableOn(color,bg){let c=color;for(let t=0;t<=1&&contrast(c,bg)<4.6;t+=0.05)c=mixHex(color,'#2a2018',t);return c}
function logEntries(t){return (t.progress_log||[]).map((e,i)=>({...e,i})).sort((a,b)=>b.time.localeCompare(a.time)||b.i-a.i)}
// v7.1：只在记录年份不等于曼谷当年时显示年份
function bangkokYear(){return new Date().toLocaleString('en-CA',{timeZone:'Asia/Bangkok',year:'numeric'}).slice(0,4)}
function logTimeLabel(time){const md=time.slice(5).replace('-','/');return time.slice(0,4)===bangkokYear()?md:time.slice(0,4)+'/'+md}
// v8：进度记录配图。缩略图在备注正下方；点开为轻量灯箱。仓库图片相对站点根目录，外链加 no-referrer。
function progressImagesHtml(t,e){
  const list=Array.isArray(e.images)?e.images.slice(0,2):[];if(!list.length)return '';
  return `<div class="progress-images">${list.map((g,j)=>`<button type="button" class="progress-thumb" data-action="open-image" data-log-task="${esc(t.id)}" data-log-entry="${e.i}" data-log-image="${j}" aria-label="查看大图：${esc(g.alt)}"><img src="${esc(g.src)}" alt="${esc(g.alt)}" loading="lazy" decoding="async"${/^https:/.test(g.src)?' referrerpolicy="no-referrer"':''}></button>`).join('')}</div>`;
}
function thumbFallback(img){
  const btn=img.closest('.progress-thumb');if(!btn||btn.classList.contains('is-broken'))return;
  btn.classList.add('is-broken');btn.setAttribute('aria-label','图片无法加载：'+img.alt);
  const box=document.createElement('span');box.className='thumb-fallback';box.innerHTML=`<span>${esc(img.alt)}</span><small>图片无法加载</small>`;img.replaceWith(box);
}
const LB_CHEVRON=d=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const lightbox={images:[],index:0,opener:null};
function ensureLightbox(){
  let d=$('#lightbox');if(d)return d;
  d=document.createElement('dialog');d.id='lightbox';d.className='lightbox';d.setAttribute('aria-label','查看图片');
  d.innerHTML=`<div class="lb-top"><span class="lb-count" aria-live="polite"></span><button type="button" class="lb-close" data-lb="close" aria-label="关闭图片">${icon('close',20)}</button></div><button type="button" class="lb-nav lb-prev" data-lb="prev" aria-label="上一张">${LB_CHEVRON('M15 5l-7 7 7 7')}</button><figure class="lb-figure"><img class="lb-img" alt=""><div class="lb-fallback" hidden><span></span><small>图片无法加载</small></div><figcaption class="lb-caption"></figcaption></figure><button type="button" class="lb-nav lb-next" data-lb="next" aria-label="下一张">${LB_CHEVRON('M9 5l7 7-7 7')}</button>`;
  document.body.appendChild(d);
  const img=$('.lb-img',d);
  img.addEventListener('error',()=>{img.hidden=true;const f=$('.lb-fallback',d);$('span',f).textContent=img.alt;f.hidden=false});
  d.addEventListener('click',event=>{event.stopPropagation();const b=event.target.closest('[data-lb]');if(b){if(b.dataset.lb==='close')closeLightbox();else stepLightbox(b.dataset.lb==='next'?1:-1);return}if(!event.target.closest('.lb-img,.lb-fallback,.lb-caption'))closeLightbox()});
  d.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeLightbox()}else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();stepLightbox(event.key==='ArrowRight'?1:-1)}});
  d.addEventListener('cancel',event=>{event.preventDefault();closeLightbox()});
  return d;
}
function showLightboxImage(){
  const d=ensureLightbox(),g=lightbox.images[lightbox.index],many=lightbox.images.length>1,img=$('.lb-img',d);
  $('.lb-fallback',d).hidden=true;img.hidden=false;
  if(/^https:/.test(g.src))img.referrerPolicy='no-referrer';else img.removeAttribute('referrerpolicy');
  img.alt=g.alt;img.src=g.src;
  $('.lb-caption',d).textContent=g.alt;
  const count=$('.lb-count',d);count.textContent=many?`${lightbox.index+1} / ${lightbox.images.length}`:'';count.hidden=!many;
  $$('.lb-nav',d).forEach(b=>{b.hidden=!many});
  d.classList.toggle('is-single',!many);
}
function openLightbox(btn){
  const t=byId.get(btn.dataset.logTask),e=t&&(t.progress_log||[])[Number(btn.dataset.logEntry)];if(!e||!Array.isArray(e.images))return;
  lightbox.images=e.images.slice(0,2);lightbox.index=Math.min(Number(btn.dataset.logImage)||0,lightbox.images.length-1);lightbox.opener=btn;
  const d=ensureLightbox();showLightboxImage();if(!d.open)d.showModal();$('.lb-close',d).focus({preventScroll:true});
}
function stepLightbox(step){if(lightbox.images.length<2)return;lightbox.index=(lightbox.index+step+lightbox.images.length)%lightbox.images.length;showLightboxImage()}
function closeLightbox(){const d=$('#lightbox');if(d?.open)d.close();if(lightbox.opener?.isConnected)lightbox.opener.focus({preventScroll:true})}
function progressHtml(t){
  const list=logEntries(t);if(!list.length)return '';
  return `<section class="detail-section progress-section" id="progress-log"><h3>${icon('clock',15)}进度记录<small>${list.length} 条 · 最新在上</small></h3><ol class="progress-timeline">${list.map((e,n)=>{
    const st=e.status&&statusMap.get(e.status);const base=st?st.color:'#9b8670';const tint=mixHex(base,'#ffffff',0.86);
    const who=e.by?(personMap.get(e.by)?.name||e.by):'';
    return `<li class="progress-item ${n===0?'is-latest':''}" style="--dot:${base}"><div class="progress-meta"><time datetime="${esc(e.time.replace(' ','T'))}">${esc(logTimeLabel(e.time))}</time>${st?`<span class="progress-status" style="color:${readableOn(base,tint)};background:${tint};border-color:${base}55">${esc(statusName(e.status))}</span>`:''}${who?`<span class="progress-by">${esc(who)}</span>`:''}</div><p class="progress-note">${esc(e.note)}</p>${progressImagesHtml(t,e)}</li>`}).join('')}</ol></section>`;
}
function renderDetail(id){
  const t=byId.get(id),loc=PALETTE.locations[t.location];
  $('#detail-content').innerHTML=`<div class="detail-body"><div class="detail-kicker"><span class="detail-id">${t.id}</span><span class="aspect-pill" style="color:${PALETTE.aspects[t.aspect]}">${esc(categoryName(t.aspect))}</span>${StatusUI.badge(t.status,F.statuses,'status-pill-v9')}</div><h2 class="detail-title" id="detail-title">${esc(t.title)}</h2>${!visibleTasks.some(item=>item.id===t.id)?'<p class="outside-note">此任务在当前筛选结果之外。</p>':''}<section class="detail-description"><h3>说明</h3><p id="task-description">${esc(t.description||'待补充')}</p></section><dl class="detail-fields"><div class="detail-field"><dt>截止日期与时段</dt><dd>${icon('clock',14)}${dateText(t.date)}${t.timeHint?' · '+esc(t.timeHint):' · 当天'}</dd></div><div class="detail-field"><dt>执行地点</dt><dd style="color:${loc[0]}">${icon(loc[1],14)}${esc(locationName(t.location))}</dd></div><div class="detail-field"><dt>执行人</dt><dd>${ownerHtml(t)}</dd></div><div class="detail-field"><dt>任务层</dt><dd><i class="swatch" style="background:${PALETTE.layers[t.layer][0]}"></i>${esc(layerName(t.layer))}层</dd></div><div class="detail-field full"><dt>参与者／对接人</dt><dd>${t.participants.length?t.participants.map(p=>`<span class="participant-chip">${esc(p)}</span>`).join(''):'<span style="color:#ac947c">未指定</span>'}</dd></div></dl>${progressHtml(t)}${t.pendingNote&&isPending(t.status)?`<div class="decision-box"><h3>${icon('info',14)} 搁置原因</h3><p>${esc(t.pendingNote)}</p></div>`:''}<section class="detail-section"><h3>执行备注</h3><p>${esc(t.notes||'暂无补充备注')}</p></section><section class="detail-section"><h3>线索标签</h3><div class="task-tags detail-tags">${t.tags.length?t.tags.map(tagHtml).join(''):'<span class="detail-empty">未标注线索</span>'}</div></section><section class="detail-section"><h3>${icon('chain',15)}前置任务<small>${t.predecessors.length} 项 · 先完成</small></h3>${detailLinks(t.predecessors)}</section><section class="detail-section"><h3>${icon('chain',15)}后置任务<small>${t.successors.length} 项 · 后续执行</small></h3>${detailLinks(t.successors)}</section><section class="detail-section"><h3><span class="same-tag-key">同线索任务</span><small>${relation.sameTag.size} 项</small></h3>${detailLinks([...relation.sameTag])}</section><div class="detail-chain-summary"><span>全部上游 ${relation.upstream.size} 项 · 下游 ${relation.downstream.size} 项</span><button data-action="view-chain">查看关联 ${icon('arrow',13)}</button></div>${expenseView.taskExpensesHTML(id)}${claimDetail(t)}</div>${claimAction(t)}`;
}
// v10.1：手机待确认横幅（状态按钮下方 32px）；有其他筛选条件行时让位，保证吸顶区 ≤128px
function updateClaimBanner(){const banner=$('#claim-banner');if(!banner)return;const show=claimConfig.enabled&&state.mobile&&pendingClaims.length>0&&state.view!=='claims'&&$('#filter-conditions').hidden;banner.hidden=!show;if(show)banner.textContent=claimConfig.texts.banner.replace('{n}',pendingClaims.length)}
function claimDetail(t){const list=pendingClaims.filter(c=>c.taskId===t.id);return list.length?`<section class="detail-section claim-detail"><h3>认领申请（待确认）</h3>${list.map(c=>`<div><strong>${esc(c.nickname)}</strong><p>${esc(c.message)}</p></div>`).join('')}</section>`:''}
function claimBlocked(t){return isDone(t.status)&&!claimConfig.allowDone?'已完成的任务不再接受认领':(!claimConfig.allowAssigned&&t.assignees.length?claimConfig.texts.assignedNote:'')}
function claimAction(t){if(!claimConfig.enabled)return '';const blocked=claimBlocked(t);return `<div class="claim-action${blocked?' is-blocked':''}">${blocked?'<p>'+esc(blocked)+'</p>':`<button type="button" class="claim-primary" data-action="open-claim">${esc(claimConfig.texts.button)}</button>`}</div>`}
let claimUrl=null,claimTaskId=null;
function openClaim(){const t=byId.get(state.selectedId);if(!t||!claimConfig.enabled||claimBlocked(t))return;
  if(claimTaskId!==t.id){$('#claim-form').reset();claimTaskId=t.id}
  ClaimCard.loadFont();ClaimCard.loadQr().catch(()=>{});$('#claim-title').textContent=claimConfig.texts.formTitle;$('#claim-task').textContent=t.id+' · '+t.title;
  for(const key of ['nickname','message']){const el=$('#claim-'+key);el.placeholder=claimConfig.texts[key+'Hint'];el.maxLength=claimConfig.limits[key];$('#claim-'+key+'-label').textContent=claimConfig.texts[key+'Label'];el.removeAttribute('aria-invalid')}
  $('#claim-privacy').textContent=claimConfig.texts.privacy;$('#claim-error').hidden=true;updateClaimCount();updateClaimWarning();$('#claim-dialog').showModal();
}
// 前台只提醒、不拦截：昵称或留言疑似含手机号、身份证、邮箱、微信号时显示醒目提醒，仍可生成卡片（后台录入和 board.py 会拦）
function clearClaimError(e){const el=$('#claim-error');if(!el.hidden&&e.target.value.trim()){e.target.removeAttribute('aria-invalid');if(!$('#claim-form [aria-invalid=true]'))el.hidden=true}}
function updateClaimWarning(){const found=['nickname','message'].map(key=>{const issue=BoardCore.privacyIssue($('#claim-'+key).value.trim());$('#claim-'+key).classList.toggle('has-privacy-warning',!!issue);return issue?claimConfig.texts.privacyWarn.replace('{field}',claimConfig.texts[key+'Label']).replace('{issue}',issue):''}).filter(Boolean);const el=$('#claim-warning');el.textContent=found.join('\n');el.hidden=!found.length;return found.join('\n')}
function updateClaimCount(){$('#claim-count').textContent=Array.from($('#claim-message').value).length+' / '+claimConfig.limits.message}
function revokeClaim(){if(claimUrl){URL.revokeObjectURL(claimUrl);claimUrl=null}$('#claim-card-img').removeAttribute('src');$('#claim-card-download').removeAttribute('href')}
async function submitClaim(event){event.preventDefault();const values={},errors=[];
  for(const key of ['nickname','message']){const el=$('#claim-'+key),value=el.value.trim(),label=claimConfig.texts[key+'Label'];values[key]=value;const error=!value?'请填写'+label:Array.from(value).length>claimConfig.limits[key]?label+'不能超过 '+claimConfig.limits[key]+' 个字':'';el.setAttribute('aria-invalid',String(!!error));if(error)errors.push(error)}
  const errorEl=$('#claim-error');errorEl.textContent=errors.join('；');errorEl.hidden=!errors.length;const warn=updateClaimWarning();if(errors.length)return;
  const button=event.submitter||$('#claim-form [type=submit]');button.disabled=true;
  try{const t=byId.get(state.selectedId),canvas=await ClaimCard.render({board:BOARD,task:t,...values,privacyFlag:!!warn,now:new Date()});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('无法生成图片');revokeClaim();claimUrl=URL.createObjectURL(blob);$('#claim-card-img').src=claimUrl;$('#claim-card-download').href=claimUrl;$('#claim-card-download').download=`认领-${t.id}-${values.nickname.replace(/[\\/:*?"<>|]/g,'_')}.png`;$('#claim-share-hint').textContent=claimConfig.texts.shareHint;const cw=$('#claim-card-warning');cw.textContent=warn;cw.hidden=!warn;$('#claim-card-dialog').showModal()}
  catch(e){errorEl.textContent='生成卡片失败，请重试。';errorEl.hidden=false}finally{button.disabled=false}
}
function changeView(view){state.view=view;$('#search-input').value=view==='expenses'?expenseView.getState().search:state.search;history.replaceState(null,'','#'+view);render()}
function setLegend(open){$('#legend-pop').hidden=!open;$('#legend-toggle').setAttribute('aria-expanded',String(open));$('#legend-toggle').classList.toggle('is-open',open)}
// 手机画布：把视图导航贴到筛选条件下方，画布占满剩余屏幕
function alignCanvasMode(){if(!canvasMode())return;const anchor=$('#mobile-view-controls'),sticky=$('#sticky-top');scrollTo({top:scrollY+anchor.getBoundingClientRect().top-sticky.getBoundingClientRect().height-4,behavior:'instant'})}
// v9.1：手机把视图标签行并进吸顶区（状态按钮一行＋视图标签一行）；桌面放回中栏
function placeNav(){
  const nav=$('.view-nav'),sticky=$('#sticky-top'),home=$('#center-col');
  if(state.mobile&&nav.parentElement!==sticky)sticky.insertBefore(nav,$('#top-progress'));
  else if(!state.mobile&&nav.parentElement!==home)home.insertBefore(nav,home.firstChild);
}
// v9.1：手机往下滚时收起标题栏（带回差，避免抖动）
function syncTopCollapse(){
  if(!state.mobile){document.body.classList.remove('top-collapsed');return}
  const c=document.body.classList.contains('top-collapsed');
  if(!c&&scrollY>72)document.body.classList.add('top-collapsed');
  else if(c&&scrollY<8)document.body.classList.remove('top-collapsed');
}
function bindEvents(){
  $('#claim-form').addEventListener('submit',submitClaim);$('#claim-message').addEventListener('input',()=>{updateClaimCount();updateClaimWarning()});$('#claim-nickname').addEventListener('input',updateClaimWarning);for(const k of ['nickname','message'])$('#claim-'+k).addEventListener('input',clearClaimError);$('#claim-close').addEventListener('click',()=>$('#claim-dialog').close());$('#claim-back').addEventListener('click',()=>$('#claim-card-dialog').close());$('#claim-card-close').addEventListener('click',()=>{$('#claim-card-dialog').close();$('#claim-dialog').close()});$('#claim-card-dialog').addEventListener('close',revokeClaim);
  document.addEventListener('error',event=>{if(event.target.matches?.('.progress-thumb img'))thumbFallback(event.target)},true);
  document.addEventListener('click',event=>{
    const evLine=event.target.closest('#nav-event-line');if(evLine){const open=!evLine.classList.contains('is-open');evLine.classList.toggle('is-open',open);evLine.setAttribute('aria-expanded',String(open));return}
    if(!$('#legend-pop').hidden&&!event.target.closest('#legend-wrap'))setLegend(false);
    const task=event.target.closest('[data-task]');if(task){openTask(task.dataset.task,task);return}
    const tab=event.target.closest('[data-tab]');if(tab){changeView(tab.dataset.tab);return}
    const el=event.target.closest('[data-action]');if(!el)return;
    const action=el.dataset.action;
    if(action==='reset-filters')resetFilters();
    if(action==='toggle-filters'){if(state.view==='expenses'||deskMq.matches)return;state.filtersOpen=!state.filtersOpen;syncFilterPanel();if(state.filtersOpen)requestAnimationFrame(()=>{const panel=$('#filter-panel'),top=panel.getBoundingClientRect().top-$('#sticky-top').getBoundingClientRect().height-6;if(top<0||top>innerHeight*0.6)scrollTo({top:scrollY+top,behavior:'smooth'})});if(!state.filtersOpen&&state.mobile)requestAnimationFrame(()=>$('.view-nav').scrollIntoView({block:'start',behavior:'smooth'}));}
    if(action==='filter-pending'){const only=state.filters.status.length===1&&state.filters.status[0]===PENDING_ID;state.filters.status=only?[]:[PENDING_ID];render()}
    if(action==='status-chip'){toggleStatus(el.dataset.status);return}
    if(action==='clear-status'){state.filters.status=[];render();return}
    if(action==='filter-unassigned'){state.filters.assignee=state.filters.assignee==='unassigned'?'':'unassigned';$('#filter-assignee').value=state.filters.assignee;render()}
    if(action==='open-claim'){openClaim();return}
    if(action==='open-claims'){changeView('claims');scrollTo({top:0,behavior:'instant'});return}
    if(action==='open-image'){openLightbox(el);return}
    if(action==='close-dialog')$('#task-dialog').close();
    if(action==='clear-focus'){state.selectedId=null;relation=emptyRelations();updateHighlight();const dialog=$('#task-dialog');if(dialog.open&&!dialog.matches(':modal'))dialog.close()}
    if(action==='scroll-top')$('#canvas-scroll').scrollTo({left:0,top:0,behavior:'smooth'});
    if(action==='zoom-fit')fitZoom();
    else if(action.startsWith('zoom-')){state.zoom[state.view]=action==='zoom-reset'?1:Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,Math.round((state.zoom[state.view]+(action==='zoom-in'?.1:-.1))*10)/10));applyZoom()}
    if(action==='toggle-panel'){ui[el.dataset.panel]=!ui[el.dataset.panel];saveUi();syncLayout();if(['chain','network'].includes(state.view)&&!state.mobile)render();}
    if(action==='toggle-fullscreen'){fullscreen=!fullscreen;syncLayout();if(['chain','network'].includes(state.view))render();$('#fullscreen-toggle').focus({preventScroll:true});}
    if(action==='mobile-mode'){const next=el.dataset.mode==='canvas';if(next!==ui.mobileCanvas){ui.mobileCanvas=next;saveUi();render();if(next)requestAnimationFrame(alignCanvasMode)}}
    if(action==='toggle-legend')setLegend($('#legend-pop').hidden);
    if(action==='view-chain'){$('#task-dialog').close();changeView(VIEW_INFO.chain?'chain':Object.keys(VIEW_INFO)[0]);requestAnimationFrame(()=>{$(`[data-task="${state.selectedId}"]`, $('#canvas-scroll'))?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'})})}
  });
  document.addEventListener('change',event=>{const el=event.target;if(el.matches('[data-filter]')){state.filters[el.dataset.filter]=el.value;render()}if(el.id==='network-group'){state.networkGroup=el.value;render()}if(el.id==='board-group'){state.boardGroup=el.value;render()}});
  $('#search-input').addEventListener('input',event=>{$('.view-nav .search').classList.toggle('has-value',!!event.target.value);if(state.view==='expenses')expenseView.setSearch(event.target.value);else state.search=event.target.value.trim();render()});
  $('.tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=Object.keys(VIEW_INFO),i=keys.indexOf(state.view),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(i+(event.key==='ArrowRight'?1:keys.length-1))%keys.length;changeView(keys[next]);$(`[data-tab="${keys[next]}"]`).focus()});
  $('#task-dialog').addEventListener('click',event=>{if(event.target===$('#task-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close()}});
  $('#task-dialog').addEventListener('close',()=>{if(lastOpener?.isConnected)lastOpener.focus({preventScroll:true});else $(`[data-tab="${state.view}"]`).focus({preventScroll:true})});
  window.matchMedia('(max-width:800px)').addEventListener('change',event=>{state.mobile=event.matches;render()});
  deskMq.addEventListener('change',()=>{if(!deskMq.matches&&fullscreen)fullscreen=false;render()});
  $('#nav-event-line').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.target.click()}});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.defaultPrevented)return;if(!$('#legend-pop').hidden){setLegend(false);$('#legend-toggle').focus({preventScroll:true});return}const dialog=$('#task-dialog');if(dialog.open&&!dialog.matches(':modal')){dialog.close();return}if(fullscreen&&!document.querySelector('dialog[open]')){fullscreen=false;syncLayout();if(['chain','network'].includes(state.view))render()}});
  // 手机画布模式：双指缩放（单指仍由浏览器负责上下左右拖动）
  const canvasEl=$('#canvas-scroll');let pinch=null;
  const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  canvasEl.addEventListener('touchstart',event=>{if(canvasMode()&&event.touches.length===2){pinch={d:dist(event.touches),z:state.zoom[state.view]||1};event.preventDefault()}},{passive:false});
  canvasEl.addEventListener('touchmove',event=>{if(pinch&&event.touches.length===2){event.preventDefault();setZoom(pinch.z*dist(event.touches)/pinch.d)}},{passive:false});
  canvasEl.addEventListener('touchend',event=>{if(event.touches.length<2)pinch=null});
  window.addEventListener('resize',fitFilterSummary);
  window.addEventListener('scroll',syncTopCollapse,{passive:true});
  new ResizeObserver(()=>{document.documentElement.style.setProperty('--sticky-height',$('#sticky-top').getBoundingClientRect().height+'px');fitFilterSummary()}).observe($('#sticky-top'));
  new ResizeObserver(()=>document.documentElement.style.setProperty('--nav-height',$('.view-nav').getBoundingClientRect().height+'px')).observe($('.view-nav'));
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(VIEW_INFO[view]&&view!==state.view){changeView(view)}});
}
function otherFilterParts(compact=false,labeled=false){
  const f=state.filters,parts=[];
  if(f.assignee){const name={assigned:'有执行人',unassigned:'无执行人'}[f.assignee]||personName(f.assignee);parts.push(compact&&['assigned','unassigned'].includes(f.assignee)?name:'执行人：'+name);}
  if(f.date)parts.push((labeled?'日期：':'')+shortDate(f.date));
  if(f.participant)parts.push((compact?'参与：':'参与者：')+f.participant);
  if(f.aspect)parts.push((compact?'':'方面：')+categoryName(f.aspect));
  if(f.tag)parts.push((compact?'':'线索：')+threadName(f.tag));
  return parts;
}
function filterSummary(compact=false){
  if(state.view==='expenses')return expenseView.summary(compact);
  const f=state.filters,parts=otherFilterParts(compact);
  const st=StatusUI.summary(F.statuses,f.status);
  if(st)parts.unshift(st);
  return parts.length?parts.join(' · '):(state.search?'全部状态 · 全部执行人 · 全部日期':`全部任务 · 全部状态 · 全部执行人${DATA.dates.length?' · '+shortDate(DATA.dates[0])+'—'+shortDate(DATA.dates.at(-1)):''}`);
}
function syncFilterSummary(){
  const text=filterSummary();
  $$('[data-filter-summary]').forEach(el=>{el.textContent=text;el.title=text;el.setAttribute('aria-label','当前筛选：'+text)});
  const search=state.view==='expenses'?expenseView.getState().search:state.search;
  $$('[data-search-summary]').forEach(el=>el.textContent=search?'搜索：'+search:'');
  const n=Object.values(state.filters).filter(v=>Array.isArray(v)?v.length:v).length+(state.search?1:0);
  $('#active-filter-count').textContent=n?`已选 ${n} 项`:'';
  // v9.1 手机：状态以外的筛选在「筛选 · n」角标计数，并在顶部用一行小字写出全部条件（方便截图）
  const others=state.view==='expenses'?[]:otherFilterParts(false,true);if(search&&state.view!=='expenses')others.push('搜索：'+search);
  state.otherFilterCount=others.length;
  const cond=$('#filter-conditions');cond.hidden=!others.length;updateClaimBanner();
  const sel=state.filters.status.length?StatusUI.summary(F.statuses,state.filters.status)+' · ':'';
  cond.textContent=others.length?`${sel}${others.join(' · ')} · 显示 ${visibleTasks.length}/${DATA.tasks.length} 项`:'';cond.title=cond.textContent;
  requestAnimationFrame(fitFilterSummary);
}
function fitFilterSummary(){
  $$('[data-filter-summary]').forEach(el=>{
    if(!el.clientWidth)return;
    let size=state.mobile?13:12;el.textContent=filterSummary();el.style.fontSize=size+'px';
    if(state.mobile){el.style.fontSize='11px';if(el.scrollWidth>el.clientWidth)el.textContent=filterSummary(true);el.style.fontSize=size+'px';}
    while(el.scrollWidth>el.clientWidth&&size>9){size-=.5;el.style.fontSize=size+'px'}
  });
  if($('#task-dialog').open)$('#task-dialog').style.setProperty('--dialog-context-height',$('.dialog-context').offsetHeight+'px');
}
function syncFilterPanel(){
  $('#filter-panel').classList.toggle('is-collapsed',!state.filtersOpen);
  $('#toggle-filters').setAttribute('aria-expanded',String(state.filtersOpen));
  const n=state.otherFilterCount||0;
  $('#filter-toggle-label').textContent=state.mobile?('筛选'+(n?' · '+n:'')+(state.filtersOpen?' ▴':'')):(state.filtersOpen?'收起 ▴':'筛选 ▾');
  $('#filter-toggle-label').classList.toggle('has-count',!!n);
}
function toggleStatus(id,on){
  const set=new Set(state.filters.status);if(on===undefined)on=!set.has(id);
  if(on)set.add(id);else set.delete(id);
  state.filters.status=STATUSES.filter(x=>set.has(x));render();
}
// v9：状态多选（桌面在筛选条右侧，手机在统计条位置）；与筛选面板里的复选框同步
function syncStatusBar(){
  const counts=statusCounts(),sel=state.filters.status;
  const html=`<span class="status-bar-label">状态</span>${StatusUI.chips(F.statuses,sel,counts,'data-action="status-chip" data-status')}${sel.length?'<button type="button" class="status-clear" data-action="clear-status" title="清除状态筛选">全部</button>':''}`;
  $$('[data-status-bar]').forEach(el=>{el.innerHTML=html});
  const un=DATA.tasks.filter(t=>!t.assignees.length).length,unOn=state.filters.assignee==='unassigned';
  const q=$('#quick-unassigned');q.setAttribute('aria-pressed',String(unOn));q.classList.toggle('is-on',unOn);q.innerHTML=`<span class="chip-box" aria-hidden="true">${unOn?'✓':''}</span>只看无执行人<b>${un}</b>`;
  const done=DATA.tasks.filter(t=>isDone(t.status)).length,pct=DATA.tasks.length?Math.round(done/DATA.tasks.length*100):0,bar=$('#top-progress');
  bar.querySelector('i').style.width=pct+'%';bar.setAttribute('aria-valuenow',String(pct));bar.setAttribute('aria-label',`整体完成进度 ${done}/${DATA.tasks.length}（${pct}%）`);bar.title=`已完成 ${done} / ${DATA.tasks.length} 项（${pct}%）`;
}
function mobileReferences(t){
  const ids=new Set(visibleTasks.map(task=>task.id));
  const refs=(list)=>list.length?list.map(id=>`<button class="reference-chip ${ids.has(id)?'':'outside-filter'}" data-task="${id}" title="${esc(byId.get(id).title)}${ids.has(id)?'':'（当前筛选外）'}">${id}</button>`).join(''):'<span class="reference-none">无</span>';
  return `<div class="dependency-refs"><div><span class="upstream-key">前置 →</span>${refs(t.predecessors)}</div><div><span class="downstream-key">→ 后置</span>${refs(t.successors)}</div></div>`;
}
function mobileTask(t,dependencies=false,laneOwner=null){return `<div class="mobile-task-item" data-id="${t.id}" data-relation="${relationFor(t.id)}">${taskCard(t,'mobile',null,laneOwner)}${dependencies?mobileReferences(t):''}</div>`}
function renderMobileChain(){
  const dates=state.filters.date?[state.filters.date]:DATA.dates;
  $('#canvas-scroll').innerHTML='<div class="mobile-chain">'+dates.map(date=>{
    const tasks=topoOrder.map(id=>byId.get(id)).filter(t=>t.date===date&&visibleTasks.includes(t));
    if(!tasks.length)return '';
    return `<section class="mobile-group"><header class="mobile-group-heading"><h3>${shortDate(date)} <small>${DAY_INFO[date][0]} · ${esc(DAY_INFO[date][1])}</small></h3><span>${tasks.length} 项</span></header><div class="mobile-task-list">${tasks.map(t=>mobileTask(t,true)).join('')}</div></section>`;
  }).join('')+'</div>';
}
function renderMobileNetwork(){
  const aspect=state.networkGroup==='aspect',groups=aspect?DATA.aspects:DATA.tags.map(t=>t.name).concat('未标注线索');
  const groupOf=t=>aspect?t.aspect:(state.filters.tag&&t.tags.includes(state.filters.tag)?state.filters.tag:t.tags[0]||'未标注线索');
  $('#canvas-scroll').innerHTML='<div class="mobile-network">'+groups.map(group=>{
    const tasks=topoOrder.map(id=>byId.get(id)).filter(t=>visibleTasks.includes(t)&&groupOf(t)===group);
    if(!tasks.length)return '';
    const color=aspect?PALETTE.aspects[group]:(tagMap.get(group)?.color||'#92765c');
    return `<section class="mobile-group" style="--group-color:${color}"><header class="mobile-group-heading"><h3><i style="background:${color}"></i>${esc(aspect?categoryName(group):threadName(group))}</h3><span>${tasks.length} 项</span></header><div class="mobile-task-list">${tasks.map(t=>mobileTask(t,true)).join('')}</div></section>`;
  }).join('')+'</div>';
}
function renderMobileBoard(){
  const aspect=state.boardGroup==='aspect',groups=aspect?DATA.aspects:[...DATA.people,'__unassigned__'];
  let html='<div class="mobile-board">';
  html+=groups.map(group=>{
    const tasks=laneTasks(group,aspect);if(!tasks.length&&(state.filters.assignee||state.filters.aspect))return '';
    return `<section class="mobile-group mobile-lane"><header class="mobile-group-heading"><h3>${esc(laneName(group,aspect))}</h3><span>${tasks.length} 项${tasks.length?' · '+shownStatuses().map(id=>`<b style="color:${statusInfo(id).tone}">${esc(statusName(id))} ${tasks.filter(t=>t.status===id).length}</b>`).join(' '):''}</span></header>${tasks.length?shownStatuses().map(id=>{const items=tasks.filter(t=>t.status===id);if(!items.length)return '';return `<section class="mobile-status-block"><h4 class="mobile-status-heading" style="color:${statusInfo(id).tone}">${StatusUI.badge(id,F.statuses)}<span>${items.length}</span></h4><div class="mobile-task-list">${items.map(t=>mobileTask(t,false,aspect?null:group)).join('')}</div></section>`}).join(''):'<p class="mobile-lane-empty">暂无任务</p>'}</section>`;
  }).join('');$('#canvas-scroll').innerHTML=html+'</div>';
}
const expenseView=await ExpensesViewer.create({board:BOARD,onChange:render,openTask,icon});
init();
window.BoardView={getState:()=>state};
}
startBoard().catch(error=>{document.querySelector('.app').innerHTML='<section class="error-banner"><h1>任务数据暂时无法显示</h1><p id="load-error"></p><p>请通过本地预览服务或已部署网址打开，并检查 board.json。</p></section>';document.querySelector('#load-error').textContent=error.message;});
