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
const statusName=id=>statusMap.get(id)?.name||id;
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
const STATUSES=F.statuses.map(x=>x.id);
const DAY_INFO=Object.fromEntries(DATA.dates.map(date=>[date,[weekday(date),F.stages.find(stage=>stage.date===date)?.name||'待补充']]));
const VIEWS=[...F.views.filter(v=>v.enabled),{id:'expenses',name:'费用',icon:'money',description:'逐项记录采购与改动，按付款人、类目核对支出。'}];
const VIEW_INFO=Object.fromEntries(VIEWS.map(v=>[v.id,[v.name,v.description]]));

const state = {view:Object.keys(VIEW_INFO)[0],filters:{participant:'',assignee:'',aspect:'',date:'',tag:'',pending:''},search:'',networkGroup:'aspect',boardGroup:'assignee',selectedId:null,mobile:window.matchMedia('(max-width:800px)').matches,filtersOpen:false,zoom:{chain:1,network:1,board:1,timeline:1}};
// V5：桌面三栏面板收起状态、手机单栏／画布模式（只存在本机浏览器）
const UI_KEY='lkboard.layout.v5';
const UI_DEFAULT={stats:false,filters:false,detail:false,mobileCanvas:false};
const ui=(()=>{try{return {...UI_DEFAULT,...JSON.parse(localStorage.getItem(UI_KEY)||'{}')}}catch{return {...UI_DEFAULT}}})();
const saveUi=()=>{try{localStorage.setItem(UI_KEY,JSON.stringify(ui))}catch{}};
const deskMq=window.matchMedia('(min-width:1024px)');
let fullscreen=false,detailWasDocked=false;
const ZOOM_MIN=.2,ZOOM_MAX=1.5;
const canvasMode=()=>state.mobile&&ui.mobileCanvas&&state.view!=='expenses';
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
  $('.tabs').innerHTML=VIEWS.map((v,i)=>`<button class="tab" id="tab-${v.id}" data-tab="${v.id}" role="tab" aria-selected="${v.id===state.view}" aria-controls="view-panel" tabindex="${v.id===state.view?0:-1}"><span>${icon(v.icon,17)}</span>${esc(v.name)}<span class="tab-index">${i+1}</span></button>`).join('');
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
  $('#stats').innerHTML=`<div class="stat"><div class="stat-label">全部任务</div><div class="stat-number">${DATA.tasks.length}<small>项筹备与执行</small></div></div><button class="stat pending" data-action="filter-pending"><div class="stat-label">待决事项 ${icon('arrow',12)}</div><div class="stat-number">${pending}<small>项需确认</small></div></button><button class="stat" data-action="filter-unassigned"><div class="stat-label">无执行人 ${icon('arrow',12)}</div><div class="stat-number">${unassigned}<small>项</small></div></button><div class="stat"><div class="stat-label">已完成</div><div class="stat-number">${completed}<small>项</small><em class="stat-pct">${percent}%</em></div></div><div class="stat"><div class="stat-progress"><span class="stat-label">整体完成进度 · ${completed} / ${DATA.tasks.length}</span><strong>${percent}<span style="font-size:14px;font-weight:400">%</span></strong></div><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="任务完成率"><i style="width:${percent}%"></i></div></div>`;
  const participants=[...new Set(DATA.tasks.flatMap(t=>t.participants))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  options('filter-participant',participants,'全部参与者');
  options('filter-assignee',[['assigned','有执行人'],['unassigned','无执行人'],...DATA.people.map(id=>[id,personName(id)])],'全部执行人');
  options('filter-aspect',DATA.aspects.map(id=>[id,categoryName(id)]),'全部方面');
  options('filter-date',DATA.dates.map(d=>[d,shortDate(d)+' · '+DAY_INFO[d][0]]),'全部日期');
  options('filter-tag',DATA.tags.map(t=>[t.name,t.label]),'全部标签');
  options('filter-pending',[['pending','仅待决'],['other','非待决']],'全部事项');
  $('#legend').innerHTML=`<span class="legend-item legend-label">色条</span>${Object.entries(PALETTE.layers).map(([k,v])=>`<span class="legend-item"><i class="swatch" style="background:${v[0]}"></i>${esc(layerName(k))}层</span>`).join('')}<i class="divider"></i>${Object.entries(PALETTE.locations).map(([k,v])=>`<span class="legend-item" style="color:${v[0]}">${icon(v[1],12)}${esc(locationName(k))}</span>`).join('')}<i class="divider"></i><span class="legend-item"><i class="pending-mark"></i>待决</span><span class="legend-item"><span class="tag" style="--tag-color:#9b7f63">线索</span>标签</span>`;
  $('#validation-status').innerHTML='<i></i>依赖已校验 · 无悬空 · 无环';
  const hash=location.hash.slice(1);if(VIEW_INFO[hash])state.view=hash;
  bindEvents();render();
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
  if(f.pending==='pending'&&!isPending(t.status))return false;
  if(f.pending==='other'&&isPending(t.status))return false;
  if(state.search&&!`${t.id} ${t.title} ${t.description} ${t.notes} ${t.participants.join(' ')}`.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()))return false;
  return true;
})}
function resetFilters(){state.filters={participant:'',assignee:'',aspect:'',date:'',tag:'',pending:''};state.search='';state.selectedId=null;relation=emptyRelations();$$('[data-filter]').forEach(s=>s.value='');$('#search-input').value='';render()}
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
  return `<button class="task-card ${pos?'graph-node':''} ${kind==='network'?'network-node':''} ${isPending(t.status)?'is-pending':''}" style="${style}" data-task="${esc(t.id)}" data-relation="${relationFor(t.id)}" ${relationshipAttributes(t.id)} aria-label="${esc(t.id+' '+t.title+'，'+statusName(t.status)+'，'+(t.assignees.map(personName).join('、')||'无执行人'))}" title="${esc(t.title)}">${isPending(t.status)?'<span class="pending-corner" aria-hidden="true"></span>':''}<div class="task-top"><span class="task-id">${esc(t.id)}</span><span class="layer-label">${esc(layerName(t.layer))}</span><span class="location" style="color:${locColor}">${icon(locIcon,11)}${esc(locationName(t.location))}</span></div><div class="task-title">${esc(t.title)}</div><div class="task-bottom">${ownerHtml(t,true)}<span class="task-time">${esc(kind==='chain'?(t.timeHint||'当天'):shortDate(t.date)+(t.timeHint?' · '+t.timeHint:''))}</span></div><div class="task-tags">${tags}${t.tags.length>tagLimit?`<span class="tag-more">+${t.tags.length-tagLimit}</span>`:''}</div><div class="task-relation-labels">${relationshipLabels(t.id)}</div></button>`;
}
// v6：紧凑卡片（看板、时间轴、手机单栏）。两行：编号＋标题；执行人·日期·地点·层级·标签。
function compactCard(t,kind,laneOwner=null){
  const [color,bg]=PALETTE.layers[t.layer], [locColor,locIcon]=PALETTE.locations[t.location];
  const tags=t.tags.slice(0,2).map(tagHtml).join('')+(t.tags.length>2?`<span class="tag-more">+${t.tags.length-2}</span>`:'');
  const time=kind==='chain'?(t.timeHint||'当天'):shortDate(t.date)+(t.timeHint?' '+t.timeHint:'');
  return `<button class="task-card compact-card ${isPending(t.status)?'is-pending':''}" style="--layer-color:${color};--card-bg:${bg};" data-task="${esc(t.id)}" data-relation="${relationFor(t.id)}" ${relationshipAttributes(t.id)} aria-label="${esc(t.id+' '+t.title+'，'+statusName(t.status)+'，'+(t.assignees.map(personName).join('、')||'无执行人'))}" title="${esc(t.title+' · '+layerName(t.layer)+'层 · '+locationName(t.location))}">${isPending(t.status)?'<span class="pending-corner" aria-hidden="true"></span>':''}<div class="task-head"><span class="task-id">${esc(t.id)}</span><span class="task-title">${esc(t.title)}</span></div><div class="task-meta">${ownerHtml(t,true,laneOwner)}<span class="task-time">${esc(time)}</span><span class="location" style="color:${locColor}" title="${esc(locationName(t.location))}">${icon(locIcon,11)}<span class="loc-name">${esc(locationName(t.location))}</span></span><span class="layer-label" title="${esc(layerName(t.layer))}层">${esc(layerName(t.layer))}</span><span class="task-tags">${tags}</span><span class="task-relation-labels">${relationshipLabels(t.id)}</span></div></button>`;
}
function render(){
  const expensesMode=state.view==='expenses';
  document.body.classList.toggle('expense-mode',expensesMode);
  const compact=state.mobile&&!ui.mobileCanvas;
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
  $$('[data-filter]').forEach(el=>el.classList.toggle('is-active',!!el.value));
  $$('[data-tab]').forEach(tab=>{const active=tab.dataset.tab===state.view;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1});
  $('#view-panel').setAttribute('aria-labelledby','tab-'+state.view);
  $('#result-count').innerHTML=`显示 <b>${visibleTasks.length}</b> / ${DATA.tasks.length} 项`;$('#toggle-count').innerHTML=`<b>${visibleTasks.length}</b>/${DATA.tasks.length} 项`;
  $('#view-title').textContent=VIEW_INFO[state.view][0];
  $('#view-description').textContent=VIEW_INFO[state.view][1];
  if(expensesMode){
    $('#view-title').textContent=expenseView.getData()?.meta.title||'费用与支出';
    $('#view-controls').innerHTML='';$('#focus-bar').hidden=true;
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
  $('#view-controls').innerHTML=controls;
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
  let html=`<div class="board-wrap" style="--status-count:${STATUSES.length};--board-min-width:${20+STATUSES.length*146}px"><div class="board-head"><div class="board-corner">${aspect?'范畴':'执行人'}</div>${STATUSES.map(id=>`<div class="status-head" style="--status-color:${statusMap.get(id).color};--status-bg:${statusMap.get(id).color}20"><span><i class="status-dot"></i>${esc(statusName(id))}</span><span class="column-count">${visibleTasks.filter(t=>t.status===id).length}</span></div>`).join('')}</div>`;
  groups.forEach(group=>{
    const tasks=laneTasks(group,aspect),color=aspect?PALETTE.aspects[group]:personMap.get(group)?.color||F.colors.muted;
    html+=`<div class="board-lane" style="--lane-color:${color}"><div class="lane-label"><span class="lane-name">${esc(laneName(group,aspect))}</span><small>${tasks.length} 项</small></div>${STATUSES.map(id=>{const items=tasks.filter(t=>t.status===id);return `<div tabindex="0" aria-label="${esc(laneName(group,aspect)+' · '+statusName(id)+'，可滚动查看')}" class="lane-cell ${items.length?'':'empty-cell'}">${items.length?items.map(t=>taskCard(t,'regular',null,aspect?null:group)).join(''):'—'}</div>`}).join('')}</div>`;
  });
  $('#canvas-scroll').innerHTML=html+'</div>';
}
function timeRank(t){const hint=t.timeHint;if(!hint)return 0;if(hint.includes('全天'))return -1;if(hint.includes('清晨'))return 6;if(hint.includes('上'))return 9;if(hint.includes('中午'))return 12;if(hint.includes('下'))return 15;if(hint.includes('傍晚'))return 18;if(hint.includes('晚')||hint.includes('夜'))return 21;const m=hint.match(/(\d{2}):(\d{2})/);return m?Number(m[1])+Number(m[2])/60:0}
function renderTimeline(){
  const dates=state.filters.date?[state.filters.date]:DATA.dates;
  $('#canvas-scroll').innerHTML='<div class="timeline-wrap">'+dates.map(date=>{
    const tasks=visibleTasks.filter(t=>t.date===date).sort((a,b)=>timeRank(a)-timeRank(b)||topoOrder.indexOf(a.id)-topoOrder.indexOf(b.id));
    const pending=tasks.filter(t=>isPending(t.status)).length;
    return `<section class="timeline-day"><div class="timeline-date ${date===DATA.event.date?'event-day':''}"><span>${date.slice(0,4)} 年 ${monthNumber(date)} 月</span><strong>${dayNumber(date)} <span>${DAY_INFO[date][0]}</span></strong><span class="day-phase">${esc(DAY_INFO[date][1])}</span>${date===DATA.event.date?`<span style="color:var(--accent);margin-top:5px">${esc(DATA.event.startTime)}–${esc(DATA.event.endTime)}</span>`:''}</div><div class="timeline-day-panel"><div class="timeline-day-heading"><span>${date===DATA.event.date?'活动当天':esc(DAY_INFO[date][1])}</span><small>${tasks.length} 项${pending?' · '+pending+' 项待决':''}</small></div>${tasks.length?'<div class="timeline-tasks">'+tasks.map(t=>taskCard(t)).join('')+'</div>':'<div class="timeline-empty">当天无匹配任务</div>'}</div></section>`;
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
function renderDetail(id){
  const t=byId.get(id),loc=PALETTE.locations[t.location];
  $('#detail-content').innerHTML=`<div class="detail-body"><div class="detail-kicker"><span class="detail-id">${t.id}</span><span class="aspect-pill" style="color:${PALETTE.aspects[t.aspect]}">${esc(categoryName(t.aspect))}</span><span class="status-pill" style="color:${statusMap.get(t.status).color};background:${statusMap.get(t.status).color}20">${esc(statusName(t.status))}</span></div><h2 class="detail-title" id="detail-title">${esc(t.title)}</h2>${!visibleTasks.some(item=>item.id===t.id)?'<p class="outside-note">此任务在当前筛选结果之外。</p>':''}<section class="detail-description"><h3>说明</h3><p id="task-description">${esc(t.description||'待补充')}</p></section><dl class="detail-fields"><div class="detail-field"><dt>截止日期与时段</dt><dd>${icon('clock',14)}${dateText(t.date)}${t.timeHint?' · '+esc(t.timeHint):' · 当天'}</dd></div><div class="detail-field"><dt>执行地点</dt><dd style="color:${loc[0]}">${icon(loc[1],14)}${esc(locationName(t.location))}</dd></div><div class="detail-field"><dt>执行人</dt><dd>${ownerHtml(t)}</dd></div><div class="detail-field"><dt>任务层</dt><dd><i class="swatch" style="background:${PALETTE.layers[t.layer][0]}"></i>${esc(layerName(t.layer))}层</dd></div><div class="detail-field full"><dt>参与者／对接人</dt><dd>${t.participants.length?t.participants.map(p=>`<span class="participant-chip">${esc(p)}</span>`).join(''):'<span style="color:#ac947c">未指定</span>'}</dd></div></dl>${t.pendingNote&&isPending(t.status)?`<div class="decision-box"><h3>${icon('info',14)} 待决说明</h3><p>${esc(t.pendingNote)}</p></div>`:''}<section class="detail-section"><h3>执行备注</h3><p>${esc(t.notes||'暂无补充备注')}</p></section><section class="detail-section"><h3>线索标签</h3><div class="task-tags detail-tags">${t.tags.length?t.tags.map(tagHtml).join(''):'<span class="detail-empty">未标注线索</span>'}</div></section><section class="detail-section"><h3>${icon('chain',15)}前置任务<small>${t.predecessors.length} 项 · 先完成</small></h3>${detailLinks(t.predecessors)}</section><section class="detail-section"><h3>${icon('chain',15)}后置任务<small>${t.successors.length} 项 · 后续执行</small></h3>${detailLinks(t.successors)}</section><section class="detail-section"><h3><span class="same-tag-key">同线索任务</span><small>${relation.sameTag.size} 项</small></h3>${detailLinks([...relation.sameTag])}</section><div class="detail-chain-summary"><span>全部上游 ${relation.upstream.size} 项 · 下游 ${relation.downstream.size} 项</span><button data-action="view-chain">查看关联 ${icon('arrow',13)}</button></div>${expenseView.taskExpensesHTML(id)}</div>`;
}
function changeView(view){state.view=view;$('#search-input').value=view==='expenses'?expenseView.getState().search:state.search;history.replaceState(null,'','#'+view);render()}
function setLegend(open){$('#legend-pop').hidden=!open;$('#legend-toggle').setAttribute('aria-expanded',String(open));$('#legend-toggle').classList.toggle('is-open',open)}
// 手机画布：把视图导航贴到筛选条件下方，画布占满剩余屏幕
function alignCanvasMode(){if(!canvasMode())return;const nav=$('.view-nav'),sticky=$('#sticky-top');scrollTo({top:scrollY+nav.getBoundingClientRect().top-sticky.getBoundingClientRect().height,behavior:'instant'})}
function bindEvents(){
  document.addEventListener('click',event=>{
    const evLine=event.target.closest('#nav-event-line');if(evLine){const open=!evLine.classList.contains('is-open');evLine.classList.toggle('is-open',open);evLine.setAttribute('aria-expanded',String(open));return}
    if(!$('#legend-pop').hidden&&!event.target.closest('#legend-wrap'))setLegend(false);
    const task=event.target.closest('[data-task]');if(task){openTask(task.dataset.task,task);return}
    const tab=event.target.closest('[data-tab]');if(tab){changeView(tab.dataset.tab);return}
    const el=event.target.closest('[data-action]');if(!el)return;
    const action=el.dataset.action;
    if(action==='reset-filters')resetFilters();
    if(action==='toggle-filters'){if(state.view==='expenses'||deskMq.matches)return;state.filtersOpen=!state.filtersOpen;syncFilterPanel();if(state.filtersOpen)requestAnimationFrame(()=>{const panel=$('#filter-panel'),top=panel.getBoundingClientRect().top-$('#sticky-top').getBoundingClientRect().height-6;if(top<0||top>innerHeight*0.6)scrollTo({top:scrollY+top,behavior:'smooth'})});if(!state.filtersOpen&&state.mobile)requestAnimationFrame(()=>$('.view-nav').scrollIntoView({block:'start',behavior:'smooth'}));}
    if(action==='filter-pending'){state.filters.pending=state.filters.pending==='pending'?'':'pending';$('#filter-pending').value=state.filters.pending;render()}
    if(action==='filter-unassigned'){state.filters.assignee=state.filters.assignee==='unassigned'?'':'unassigned';$('#filter-assignee').value=state.filters.assignee;render()}
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
  new ResizeObserver(()=>{document.documentElement.style.setProperty('--sticky-height',$('#sticky-top').getBoundingClientRect().height+'px');fitFilterSummary()}).observe($('#sticky-top'));
  new ResizeObserver(()=>document.documentElement.style.setProperty('--nav-height',$('.view-nav').getBoundingClientRect().height+'px')).observe($('.view-nav'));
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(VIEW_INFO[view]&&view!==state.view){changeView(view)}});
}
function filterSummary(compact=false){
  if(state.view==='expenses')return expenseView.summary(compact);
  const f=state.filters,parts=[];
  if(f.assignee){const name={assigned:'有执行人',unassigned:'无执行人'}[f.assignee]||personName(f.assignee);parts.push(compact&&['assigned','unassigned'].includes(f.assignee)?name:'执行人：'+name);}
  if(f.date)parts.push(shortDate(f.date));
  if(f.participant)parts.push((compact?'参与：':'参与者：')+f.participant);
  if(f.aspect)parts.push((compact?'':'方面：')+categoryName(f.aspect));
  if(f.tag)parts.push((compact?'':'线索：')+threadName(f.tag));
  if(f.pending)parts.push(f.pending==='pending'?'仅待决':'非待决');
  return parts.length?parts.join(' · '):(state.search?'全部执行人 · 全部日期':`全部任务 · 全部执行人${DATA.dates.length?' · '+shortDate(DATA.dates[0])+'—'+shortDate(DATA.dates.at(-1)):''}`);
}
function syncFilterSummary(){
  const text=filterSummary();
  $$('[data-filter-summary]').forEach(el=>{el.textContent=text;el.title=text;el.setAttribute('aria-label','当前筛选：'+text)});
  const search=state.view==='expenses'?expenseView.getState().search:state.search;
  $$('[data-search-summary]').forEach(el=>el.textContent=search?'搜索：'+search:'');
  const n=Object.values(state.filters).filter(Boolean).length+(state.search?1:0);
  $('#active-filter-count').textContent=n?`已选 ${n} 项`:'';
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
  $('#filter-toggle-label').textContent=state.filtersOpen?'收起 ▴':'筛选 ▾';
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
    return `<section class="mobile-group mobile-lane"><header class="mobile-group-heading"><h3>${esc(laneName(group,aspect))}</h3><span>${tasks.length} 项${tasks.length?' · '+STATUSES.map(id=>`<b style="color:${statusMap.get(id).color}">${esc(statusName(id))} ${tasks.filter(t=>t.status===id).length}</b>`).join(' '):''}</span></header>${tasks.length?STATUSES.map(id=>{const items=tasks.filter(t=>t.status===id);if(!items.length)return '';return `<section class="mobile-status-block"><h4 class="mobile-status-heading" style="color:${statusMap.get(id).color}">${esc(statusName(id))}<span>${items.length}</span></h4><div class="mobile-task-list">${items.map(t=>mobileTask(t,false,aspect?null:group)).join('')}</div></section>`}).join(''):'<p class="mobile-lane-empty">暂无任务</p>'}</section>`;
  }).join('');$('#canvas-scroll').innerHTML=html+'</div>';
}
const expenseView=await ExpensesViewer.create({board:BOARD,onChange:render,openTask,icon});
init();
window.BoardView={getState:()=>state};
}
startBoard().catch(error=>{document.querySelector('.app').innerHTML='<section class="error-banner"><h1>任务数据暂时无法显示</h1><p id="load-error"></p><p>请通过本地预览服务或已部署网址打开，并检查 board.json。</p></section>';document.querySelector('#load-error').textContent=error.message;});
