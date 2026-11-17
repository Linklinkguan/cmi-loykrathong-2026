(function () {
  'use strict';
  const $=(selector,root=document)=>root.querySelector(selector), $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const DRAFT_KEY='cmi-board-draft-v3';
  const state={board:null,dirty:false,activeTab:'tasks',search:'',status:'',executor:'',frameworkKind:'threads',editingTask:null,taskOriginal:null,editingEntity:null,entityOriginal:null,advancedDirty:false,repairOnly:false};
  const collectionNames={threads:'线索标签',categories:'范畴',statuses:'状态',people:'执行人',stages:'阶段与日期',layers:'任务层',locations:'执行地点',views:'视图配置'};
  const colorNames={paper:'页面底色',surface:'表面底色',white:'卡片白色',ink:'主要文字',muted:'辅助文字',brown:'主按钮',line:'边框',accent:'强调／下游',green:'前置／上游',sameTag:'同线索'};
  const metaFields=[['title','导航标题'],['heroTitle','总览标题'],['event.name','活动名称'],['event.date','活动日期','date'],['event.venue','活动场地'],['event.city','城市'],['event.startTime','开始时间','time'],['event.endTime','结束时间','time'],['event.bonfire','篝火安排'],['event.attendees','人数说明'],['event.fee','费用说明']];
  let toastTimer;
  function toast(text){const box=$('#toast');box.textContent=text;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,4600)}
  function boardErrors(board){return BoardCore.validate(board).concat(window.ExpenseAdmin?.validateBoardReferences(board)||[])}
  function nowBangkok(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,19)+'+07:00'}
  function collection(kind=state.frameworkKind,board=state.board){return kind==='people'?board.people:board.framework[kind]}
  function labelFor(kind,id){return collection(kind).find(item=>item.id===id)?.name||id}
  function options(items,selected='',emptyLabel){return (emptyLabel===undefined?'':`<option value="">${esc(emptyLabel)}</option>`)+items.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(item.name||item.title||item.id)}</option>`).join('')}
  function markChanged(){state.dirty=true;state.board.meta.updatedAt=nowBangkok();state.advancedDirty=false;renderAll();window.dispatchEvent(new Event('board-admin-change'))}
  function setValidation(errors,scope='当前草稿'){
    const panel=$('#validation-panel');panel.classList.toggle('invalid',!!errors.length);
    panel.innerHTML=errors.length?`<details open><summary>${esc(scope)}：${errors.length} 项需要处理</summary><ul>${errors.slice(0,30).map(e=>`<li data-code="${esc(e.code)}">${esc(e.message)}</li>`).join('')}</ul>${errors.length>30?`<small>另有 ${errors.length-30} 项问题。</small>`:''}</details>`:`<strong>校验通过</strong> · 编号完整、依赖无环、日期顺序正确<small>修改仅在浏览器中；导出后需替换 site/data/board.json 并重新部署。</small>`;
    for(const id of ['export-board','preview-board','save-draft'])$('#'+id).disabled=!!errors.length;
    return errors;
  }
  function renderSummary(){
    const b=state.board, pending=new Set(b.framework.statuses.filter(s=>s.isPending).map(s=>s.id));
    const stats=[['全部任务',b.tasks.length],['待决事项',b.tasks.filter(t=>pending.has(t.status)).length,'warning'],['无执行人',b.tasks.filter(t=>!t.executor.length).length],['依赖关系',b.tasks.reduce((n,t)=>n+t.pre.length,0)],['线索标签',b.framework.threads.length]];
    $('#admin-summary').innerHTML=stats.map(([name,value,cls])=>`<div class="summary-item ${cls||''}"><span>${name}</span><strong>${value}</strong></div>`).join('');
    $('#board-title').textContent=b.meta.title;
    $('#data-state').textContent=state.dirty?'本地修改 · 尚未部署':'已读取站点数据';$('#data-state').classList.toggle('dirty',state.dirty);
    $('#admin-updated').textContent='数据更新时间 '+b.meta.updatedAt.replace('T',' ').replace('+07:00','')+' · 曼谷时间';
  }
  function renderAll(){
    if(!state.board||state.repairOnly)return;
    renderSummary();
    $('#admin-filter-status').innerHTML=options(state.board.framework.statuses,state.status,'全部状态');
    $('#admin-filter-executor').innerHTML='<option value="">全部执行人</option><option value="__none__" '+(state.executor==='__none__'?'selected':'')+'>无执行人</option>'+options(state.board.people,state.executor);
    renderTable();renderFramework();renderSettings();setValidation(boardErrors(state.board));
    if(state.activeTab==='advanced'&&!state.advancedDirty)$('#json-editor').value=JSON.stringify(state.board,null,2);
    $('#add-task').disabled=false;
  }
  function renderTable(){
    const tasks=state.board.tasks.filter(t=>(!state.status||t.status===state.status)&&(!state.executor||(state.executor==='__none__'?!t.executor.length:t.executor.includes(state.executor)))&&(!state.search||`${t.id} ${t.title} ${t.description}`.toLowerCase().includes(state.search.toLowerCase())));
    $('#table-count').textContent=`显示 ${tasks.length} / ${state.board.tasks.length} 项`;
    $('#table-empty').hidden=!!tasks.length;
    $('#task-table-body').innerHTML=tasks.map(t=>`<tr data-task-row="${esc(t.id)}"><td class="task-table-id">${esc(t.id)}</td><td><div class="task-table-title">${esc(t.title)}</div><div class="task-table-description">${esc(t.description)}</div></td><td><select class="inline-status" data-inline-status="${esc(t.id)}" aria-label="${esc(t.id)} 状态">${options(state.board.framework.statuses,t.status)}</select></td><td><div class="owner-pills">${t.executor.length?t.executor.map(id=>{const p=state.board.people.find(p=>p.id===id);return `<span class="owner-pill" style="--person-color:${p.color}">${esc(p.name)}</span>`}).join(''):'<span class="owner-none">无执行人</span>'}</div></td><td>${esc(t.date)}${t.timeHint?'<br><small>'+esc(t.timeHint)+'</small>':''}</td><td>${t.pre.length?t.pre.map(esc).join('、'):'—'}</td><td><div class="row-actions"><button data-edit-task="${esc(t.id)}">编辑</button><button class="danger" data-delete-task="${esc(t.id)}">删除</button></div></td></tr>`).join('');
  }
  function taskCandidates(){const b=clone(state.board),index=b.tasks.findIndex(t=>t.id===state.taskOriginal);if(index<0)b.tasks.push(clone(state.editingTask));else b.tasks[index]=clone(state.editingTask);return b}
  function multiSelect(field,items,selected){return `<details class="multiselect" id="task-${field}-dropdown"><summary><span>${selected.length?'已选 '+selected.length+' 项':'未选择'}</span></summary>${field==='pre'?'<div class="multi-search"><input data-multi-search="pre" type="search" placeholder="搜索任务编号或标题" aria-label="查找前置任务"></div>':''}<div class="multi-options">${items.map(item=>`<label data-option-text="${esc((item.id+' '+(item.title||item.name||'')).toLowerCase())}"><input type="checkbox" data-multi="${field}" value="${esc(item.id)}" ${selected.includes(item.id)?'checked':''}><span>${esc(field==='pre'?item.id+' · '+item.title:item.name||item.id)}</span></label>`).join('')||'<span class="help">暂无可选条目</span>'}</div></details>`}
  function openTask(id){
    const b=state.board;state.taskOriginal=id||null;
    const next=Math.max(0,...b.tasks.map(t=>Number(t.id.slice(1))).filter(Number.isFinite))+1;
    state.editingTask=id?clone(b.tasks.find(t=>t.id===id)):{id:'T'+String(next).padStart(2,'0'),title:'待补充',description:'待补充',category:b.framework.categories[0].id,threads:[],date:b.framework.stages[0]?.date||b.meta.event.date,timeHint:'',layer:b.framework.layers[0].id,location:b.framework.locations[0].id,status:b.framework.statuses[0].id,executor:[],participants:[],pre:[],pendingNote:'',notes:''};
    const t=state.editingTask;
    $('#task-editor-title').textContent=id?'编辑 '+id:'新增任务';
    for(const key of ['id','title','description','date','timeHint','pendingNote','notes'])$('#task-'+key).value=t[key];
    $('#task-id').readOnly=!!id;$('#task-id').title=id?'已有编号保持稳定；如需改编号，请在高级 JSON 同步更改所有引用。':'';
    $('#task-participants').value=t.participants.join('，');
    for(const [key,kind] of [['category','categories'],['status','statuses'],['layer','layers'],['location','locations']])$('#task-'+key).innerHTML=options(collection(kind),t[key]);
    $('#task-executor-control').innerHTML=multiSelect('executor',b.people,t.executor);
    $('#task-threads-control').innerHTML=multiSelect('threads',b.framework.threads,t.threads);
    $('#task-pre-control').innerHTML=multiSelect('pre',b.tasks.filter(item=>item.id!==t.id),t.pre);
    validateTask();$('#task-editor').showModal();$('#task-editor').scrollTop=0;
  }
  function validateTask(){
    const errors=boardErrors(taskCandidates());
    $('#task-validation').innerHTML=errors.length?'<ul>'+errors.map(e=>'<li>'+esc(e.message)+'</li>').join('')+'</ul>':'';
    $('#save-task').disabled=!!errors.length;return errors;
  }
  function readTaskField(el){if(!state.editingTask)return;if(el.dataset.multi){const field=el.dataset.multi;state.editingTask[field]=$$(`[data-multi="${field}"]:checked`,$('#task-form')).map(box=>box.value);const count=state.editingTask[field].length;$(`#task-${field}-dropdown summary span`).textContent=count?'已选 '+count+' 项':'未选择';}else if(el.name){state.editingTask[el.name]=el.name==='participants'?el.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean):el.value;}validateTask()}
  function deleteTask(id){const candidate=clone(state.board);candidate.tasks=candidate.tasks.filter(t=>t.id!==id);const expenseErrors=window.ExpenseAdmin?.validateBoardReferences(candidate)||[];if(expenseErrors.length){toast(expenseErrors.map(e=>e.message).join('；'));return;}const refs=state.board.tasks.filter(t=>t.pre.includes(id)).map(t=>t.id);if(refs.length){toast('不能删除 '+id+'：先从 '+refs.join('、')+' 的前置中移除该编号。');return;}if(!confirm('删除任务 '+id+'？仅修改本地草稿。'))return;state.board.tasks=state.board.tasks.filter(t=>t.id!==id);markChanged();toast(id+' 已从本地草稿删除。')}
  function renderFramework(){
    const kind=state.frameworkKind,items=collection(kind);
    $('#add-framework').disabled=kind==='views'&&items.length>=4;
    $('#framework-list').innerHTML=items.map(item=>`<article class="framework-card" style="--item-color:${item.color||'#a78b67'}"><header><h4>${esc(item.name)}</h4><span class="item-id">${esc(item.id)}</span></header>${item.description?'<p>'+esc(item.description)+'</p>':''}<div class="meta">${kind==='statuses'?(item.isDone?'计入已完成':item.isPending?'计入待决':'普通状态'):kind==='people'?'别名：'+esc(item.aliases.join('、')||'无'):kind==='stages'?esc(item.date):kind==='views'?(item.enabled?'已启用':'已停用'):item.color?esc(item.color):'可配置条目'}</div><footer><button data-edit-framework="${esc(item.id)}">编辑</button><button class="danger" data-delete-framework="${esc(item.id)}">删除</button></footer></article>`).join('')||'<p class="help">暂无条目，可新增。</p>';
  }
  function newEntity(kind){const base={id:'',name:'待补充'};if(['threads','categories','statuses','people','layers','locations'].includes(kind))base.color='#8A765D';if(kind==='threads')base.description='待补充';if(kind==='people')base.aliases=[];if(kind==='categories'||kind==='locations')base.icon=Object.keys(state.board.framework.icons)[0];if(kind==='statuses'){base.isDone=false;base.isPending=false;}if(kind==='stages')base.date=state.board.meta.event.date;if(kind==='layers')base.background='#EFE7DA';if(kind==='views'){base.id=['chain','network','board','timeline'].find(id=>!collection(kind).some(v=>v.id===id))||'';base.icon=base.id;base.description='待补充';base.mobileDescription='待补充';base.enabled=true;}return base}
  function fieldHtml(key,label,value,type='text',wide=false){return `<label class="${wide?'span-two':''}"><span>${label}</span>${type==='textarea'?`<textarea id="framework-${key}" name="${key}" rows="3">${esc(value)}</textarea>`:type==='color'?`<div class="color-field-row"><input type="color" data-color-target="framework-${key}" value="${esc(value)}" aria-label="${label}取色"><input id="framework-${key}" name="${key}" value="${esc(value)}" pattern="#[0-9A-Fa-f]{6}" required></div>`:`<input id="framework-${key}" name="${key}" type="${type}" value="${esc(value)}" ${key==='id'&&state.entityOriginal?'readonly':''} required>`}</label>`}
  function openFramework(id){
    const kind=state.frameworkKind;state.entityOriginal=id||null;state.editingEntity=id?clone(collection(kind).find(item=>item.id===id)):newEntity(kind);const e=state.editingEntity;
    $('#framework-editor-title').textContent=(id?'编辑':'新增')+collectionNames[kind];
    let html=fieldHtml('id','稳定编号',e.id)+fieldHtml('name','显示名称',e.name);
    if('color'in e)html+=fieldHtml('color','颜色',e.color,'color');
    if('background'in e)html+=fieldHtml('background','底色',e.background,'color');
    if('date'in e)html+=fieldHtml('date','阶段日期',e.date,'date');
    if('icon'in e)html+=`<label><span>图标</span><select id="framework-icon" name="icon">${Object.keys(state.board.framework.icons).map(icon=>`<option value="${esc(icon)}" ${icon===e.icon?'selected':''}>${esc(icon)}</option>`).join('')}</select></label>`;
    if('description'in e)html+=fieldHtml('description','说明',e.description,'textarea',true);
    if('mobileDescription'in e)html+=fieldHtml('mobileDescription','手机视图说明',e.mobileDescription,'textarea',true);
    if('aliases'in e)html+=`<label class="span-two"><span>别名（逗号分隔）</span><input id="framework-aliases" name="aliases" value="${esc(e.aliases.join('，'))}"></label>`;
    for(const [key,label] of [['isDone','计入已完成统计'],['isPending','计入待决统计'],['enabled','启用此视图']])if(key in e)html+=`<label class="check-label"><input type="checkbox" id="framework-${key}" name="${key}" ${e[key]?'checked':''}><span>${label}</span></label>`;
    $('#framework-fields').innerHTML=html;validateFramework();$('#framework-editor').showModal();$('#framework-editor').scrollTop=0;
  }
  function entityCandidate(){const b=clone(state.board),list=collection(state.frameworkKind,b),index=list.findIndex(item=>item.id===state.entityOriginal);if(index<0)list.push(clone(state.editingEntity));else list[index]=clone(state.editingEntity);return b}
  function validateFramework(){const errors=boardErrors(entityCandidate());$('#framework-validation').innerHTML=errors.length?'<ul>'+errors.map(e=>'<li>'+esc(e.message)+'</li>').join('')+'</ul>':'';$('#save-framework').disabled=!!errors.length;return errors}
  function readFrameworkField(el){if(!state.editingEntity||!el.name)return;state.editingEntity[el.name]=el.type==='checkbox'?el.checked:el.name==='aliases'?el.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean):el.value;validateFramework()}
  function deleteFramework(id){
    const kind=state.frameworkKind,b=clone(state.board),list=collection(kind,b),index=list.findIndex(item=>item.id===id);list.splice(index,1);const errors=boardErrors(b);
    if(errors.length){toast('不能删除：'+errors.slice(0,3).map(e=>e.message).join('；'));return;}
    if(!confirm('删除'+collectionNames[kind]+'“'+id+'”？仅修改本地草稿。'))return;
    state.board=b;markChanged();toast('配置已从本地草稿删除。');
  }
  function renderSettings(){
    $('#meta-form').innerHTML=metaFields.map(([path,label,type])=>{const value=path.startsWith('event.')?state.board.meta.event[path.slice(6)]:state.board.meta[path];return `<label class="${['title','event.name','event.venue'].includes(path)?'wide':''}"><span>${label}</span><input name="${path}" id="meta-${path.replace('.','-')}" type="${type||'text'}" value="${esc(value)}" required></label>`}).join('')+'<button class="primary form-submit" type="submit">保存活动信息</button>';
    $('#colors-form').innerHTML=Object.entries(colorNames).map(([key,label])=>`<label><input type="color" data-theme-color="${key}" value="${state.board.framework.colors[key]}" aria-label="${label}"><span>${label}</span></label>`).join('');
  }
  function switchTab(tab){
    if(state.activeTab==='advanced'&&state.advancedDirty&&tab!=='advanced'){if(!confirm('高级 JSON 尚未应用，离开将放弃此编辑区修改。'))return;state.advancedDirty=false;setValidation(boardErrors(state.board));}
    if(state.repairOnly&&tab!=='advanced'){toast('先修复 JSON 并应用，再使用可视化编辑。');return;}
    state.activeTab=tab;$$('[data-admin-tab]').forEach(button=>{const active=button.dataset.adminTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
    for(const name of ['tasks','expenses','framework','advanced'])$('#tab-'+name).hidden=name!==tab;
    for(const id of ['board-actions','admin-summary','validation-panel'])$('#'+id).hidden=tab==='expenses';window.dispatchEvent(new CustomEvent('board-admin-tab',{detail:tab}));
    if(tab==='advanced'&&!state.advancedDirty)$('#json-editor').value=JSON.stringify(state.board,null,2);
  }
  function validateJSON(){let parsed;try{parsed=JSON.parse($('#json-editor').value);}catch(e){const errors=[{code:'json',message:'JSON 语法错误：'+e.message}];setValidation(errors,'高级 JSON');$('#apply-json').disabled=true;return null;}
    const errors=boardErrors(parsed);setValidation(errors,'高级 JSON');$('#apply-json').disabled=!!errors.length;return errors.length?null:parsed;
  }
  function store(key){try{localStorage.setItem(key,JSON.stringify(state.board,null,2));return true;}catch(e){toast('本地存储失败，请检查浏览器空间或直接导出 JSON。');return false;}}
  function exportBoard(){if(boardErrors(state.board).length)return;const blob=new Blob([JSON.stringify(state.board,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='board.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出 board.json；替换站点数据文件后重新部署。')}
  async function importFile(file){if(!file)return;let text;try{text=await file.text();const data=JSON.parse(text),errors=boardErrors(data);if(errors.length){state.activeTab='advanced';$$('[data-admin-tab]').forEach(b=>b.classList.toggle('active',b.dataset.adminTab==='advanced'));for(const name of ['tasks','expenses','framework','advanced'])$('#tab-'+name).hidden=name!=='advanced';$('#json-editor').value=text;state.advancedDirty=true;validateJSON();toast('导入内容需要修正，已放入高级 JSON；当前草稿未替换。');return;}if(state.dirty&&!confirm('导入会替换当前本地草稿，继续？'))return;state.board=data;state.repairOnly=false;state.advancedDirty=false;markChanged();toast('已导入到本地草稿。');}catch(e){toast('导入失败：'+e.message)}}
  function bind(){
    document.addEventListener('click',event=>{
      const taskEdit=event.target.closest('[data-edit-task]');if(taskEdit){openTask(taskEdit.dataset.editTask);return;}
      const taskDelete=event.target.closest('[data-delete-task]');if(taskDelete){deleteTask(taskDelete.dataset.deleteTask);return;}
      const entityEdit=event.target.closest('[data-edit-framework]');if(entityEdit){openFramework(entityEdit.dataset.editFramework);return;}
      const entityDelete=event.target.closest('[data-delete-framework]');if(entityDelete){deleteFramework(entityDelete.dataset.deleteFramework);return;}
      const tab=event.target.closest('[data-admin-tab]');if(tab){switchTab(tab.dataset.adminTab);return;}
      const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;
      if(action==='add-task')openTask();
      if(action==='close-task')$('#task-editor').close();
      if(action==='add-framework')openFramework();
      if(action==='close-framework')$('#framework-editor').close();
      if(action==='save-draft'&&store(DRAFT_KEY))toast('本地草稿已保存，站点数据未改变。');
      if(action==='restore-draft'){let raw;try{raw=localStorage.getItem(DRAFT_KEY);}catch(e){toast('无法读取本地存储。');return;}if(!raw){toast('没有已保存的本地草稿。');return;}if(state.dirty&&!confirm('恢复将替换当前本地修改，继续？'))return;try{const candidate=JSON.parse(raw),errors=boardErrors(candidate);if(errors.length){toast('保存的草稿校验失败，请通过导入或高级 JSON 修正。');return;}state.board=candidate;state.repairOnly=false;state.advancedDirty=false;state.dirty=true;renderAll();toast('已恢复本地草稿。');}catch(e){toast('本地草稿不是有效 JSON。');}}
      if(action==='import')$('#import-file').click();
      if(action==='export')exportBoard();
      if(action==='preview'&&!boardErrors(state.board).length){if(window.ExpenseAdmin){window.ExpenseAdmin.preview(false);}else if(store(BoardCore.PREVIEW_KEY)){window.open('index.html?preview=1','_blank','noopener');toast('已打开本地预览；公开展示站仍读取原数据。');}}
      if(action==='reset-json'){if(state.advancedDirty&&!confirm('放弃编辑区尚未应用的内容？'))return;$('#json-editor').value=JSON.stringify(state.board,null,2);state.advancedDirty=false;validateJSON();}
      if(action==='apply-json'){const candidate=validateJSON();if(!candidate)return;state.board=candidate;state.repairOnly=false;state.advancedDirty=false;markChanged();toast('JSON 已应用到本地草稿。');}
    });
    document.addEventListener('input',event=>{
      const el=event.target;
      if(el.id==='admin-search'){state.search=el.value.trim();renderTable();}
      if(el.closest('#task-form')&&(el.name||el.dataset.multi))readTaskField(el);
      if(el.dataset.multiSearch){const query=el.value.toLowerCase();$$('.multi-options label',el.closest('.multiselect')).forEach(label=>label.hidden=!label.dataset.optionText.includes(query));}
      if(el.closest('#framework-form')&&el.name)readFrameworkField(el);
      if(el.dataset.colorTarget){const input=$('#'+el.dataset.colorTarget);input.value=el.value;readFrameworkField(input);}
      if(el.id==='json-editor'){state.advancedDirty=true;validateJSON();}
    });
    document.addEventListener('change',event=>{
      const el=event.target;
      if(el.id==='admin-filter-status'){state.status=el.value;renderTable();}
      if(el.id==='admin-filter-executor'){state.executor=el.value;renderTable();}
      if(el.id==='framework-kind'){state.frameworkKind=el.value;renderFramework();}
      if(el.dataset.inlineStatus){const task=state.board.tasks.find(t=>t.id===el.dataset.inlineStatus);if(task.status!==el.value){task.status=el.value;markChanged();toast(task.id+' 状态已更新到本地草稿。');}}
      if(el.closest('#task-form')&&(el.name||el.dataset.multi))readTaskField(el);
      if(el.closest('#framework-form')&&el.name)readFrameworkField(el);
      if(el.dataset.themeColor){state.board.framework.colors[el.dataset.themeColor]=el.value;markChanged();}
      if(el.id==='import-file'){importFile(el.files[0]);el.value='';}
    });
    $('#task-form').addEventListener('submit',event=>{event.preventDefault();if(validateTask().length)return;state.board=taskCandidates();$('#task-editor').close();markChanged();toast('任务已保存到本地草稿。');});
    $('#framework-form').addEventListener('submit',event=>{event.preventDefault();if(validateFramework().length)return;state.board=entityCandidate();$('#framework-editor').close();markChanged();toast('配置已保存到本地草稿。');});
    $('#meta-form').addEventListener('submit',event=>{event.preventDefault();const candidate=clone(state.board);for(const [path]of metaFields){const value=new FormData(event.target).get(path);if(path.startsWith('event.'))candidate.meta.event[path.slice(6)]=value;else candidate.meta[path]=value;}const errors=boardErrors(candidate);if(errors.length){setValidation(errors,'活动信息');return;}state.board=candidate;markChanged();toast('活动信息已保存到本地草稿。');});
    $('#colors-form').addEventListener('submit',event=>event.preventDefault());
    window.addEventListener('beforeunload',event=>{if(state.dirty||state.advancedDirty){event.preventDefault();event.returnValue='';}});
  }
  async function init(){
    bind();
    try{state.board=await BoardCore.loadBoard();const errors=BoardCore.validate(state.board);if(errors.length){state.repairOnly=true;$('#board-title').textContent='数据需要修正';$('#data-state').textContent='数据校验未通过';$('#add-task').disabled=true;state.activeTab='advanced';for(const name of ['tasks','expenses','framework','advanced'])$('#tab-'+name).hidden=name!=='advanced';$$('[data-admin-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.adminTab==='advanced');b.setAttribute('aria-selected',String(b.dataset.adminTab==='advanced'))});$('#json-editor').value=JSON.stringify(state.board,null,2);state.advancedDirty=true;validateJSON();return;}renderAll();}
    catch(e){$('.admin-app').innerHTML='<section class="fatal"><h1>无法打开管理后台</h1><p>'+esc(e.message)+'</p><p>在项目目录运行 python3 -m http.server 8000 --directory site，再打开 http://localhost:8000/admin.html。</p></section>';}
  }
  window.BoardAdmin={getState:()=>state,notify:toast,switchTab,refresh:renderAll,validate:boardErrors,ready:null};
  window.BoardAdmin.ready=init();
})();
