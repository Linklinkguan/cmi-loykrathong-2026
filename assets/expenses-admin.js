(function () {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const core=window.ExpensesCore, esc=core.escapeHTML, clone=v=>JSON.parse(JSON.stringify(v));
  const state={data:null,dirty:false,section:'entries',filters:{search:'',category:'',status:'',payer:'',task:''},editing:null,originalId:null,configKind:'categories',entity:null,entityId:null,loadError:''};
  const configNames={categories:'类目',statuses:'状态',payers:'付款人'};
  const note=text=>BoardAdmin.notify(text), board=()=>BoardAdmin.getState().board;
  const lookup=(kind,id)=>state.data.config[kind].find(e=>e.id===id);
  const name=(kind,id)=>lookup(kind,id)?.name||id||'未填写';
  function selectOptions(list,selected='',empty){return (empty!==undefined?`<option value="">${esc(empty)}</option>`:'')+list.map(e=>`<option value="${esc(e.id)}" ${e.id===selected?'selected':''}>${esc(e.name||e.title||e.id)}</option>`).join('')}
  function listErrors(errors){return errors.length?'<ul>'+errors.slice(0,35).map(e=>'<li>'+esc(e.message)+'</li>').join('')+'</ul>':''}
  function validateBoardReferences(candidate){
    if(!state.data)return [{code:'expense-load',message:state.loadError?'费用数据未载入，暂不能校验关联任务：'+state.loadError:'费用数据正在载入，稍后重试。'}];
    const ids=new Set((candidate?.tasks||[]).map(t=>t?.id));
    return state.data.expenses.flatMap(e=>(e.taskIds||[]).filter(id=>!ids.has(id)).map(id=>({code:'expense-task',id:e.id,field:'taskIds',message:'费用 '+e.id+' 关联任务 '+id+' 不存在，请先修改费用的关联任务。'})));
  }
  function checked(data=state.data){return core.validate(data,board())}
  function displayValidation(){
    const errors=checked(),panel=$('#expense-admin-validation');panel.classList.toggle('invalid',!!errors.length);
    panel.innerHTML=errors.length?'<strong>费用草稿有 '+errors.length+' 项需要修正</strong>'+listErrors(errors):'<strong>费用校验通过</strong> · 编号唯一、金额有效、关联任务存在<small>费用草稿单独保存；导出后替换 site/data/expenses.json。</small>';
    ['save-expense-draft','preview-expenses','export-expenses'].forEach(id=>$('#'+id).disabled=!!errors.length);
    return errors;
  }
  function visibleRows(){const f=state.filters;return state.data.expenses.filter(e=>(!f.category||e.category===f.category)&&(!f.status||e.status===f.status)&&(!f.payer||(f.payer==='__none__'?!e.payer:e.payer===f.payer))&&(!f.task||(f.task==='__none__'?!e.taskIds.length:e.taskIds.includes(f.task)))&&(!f.search||[e.id,e.item,e.purpose,e.notes,e.place].join(' ').toLowerCase().includes(f.search.toLowerCase())))}
  function amount(value){return esc(core.money(value))}
  function summaryText(metric){return metric.count?amount(metric.total)+' ฿':'未填写'}
  function renderSummary(rows){
    const s=core.summarize(rows,state.data);
    $('#expense-admin-summary').innerHTML=`<div><span>筛选结果</span><strong>${rows.length}<small> / ${state.data.expenses.length} 项</small></strong></div><div><span>预算合计</span><strong>${summaryText(s.budget)}</strong><small>已填 ${s.budget.count} 项 · 未填 ${s.budget.missing} 项</small></div><div><span>实际合计</span><strong>${summaryText(s.actual)}</strong><small>已填 ${s.actual.count} 项 · 未填 ${s.actual.missing} 项</small></div>`;
  }
  function contextText(){const f=state.filters,a=[];if(f.category)a.push('类目：'+name('categories',f.category));if(f.status)a.push('状态：'+name('statuses',f.status));if(f.payer)a.push('付款人：'+(f.payer==='__none__'?'未填写':name('payers',f.payer)));if(f.task)a.push('关联：'+(f.task==='__none__'?'未关联任务':f.task));if(f.search)a.push('搜索：'+f.search);return '当前费用 · '+(a.join(' · ')||'全部费用')}
  function renderTable(){
    if(!state.data)return;
    const rows=visibleRows();renderSummary(rows);$('#expense-admin-context').textContent=contextText()+' · '+rows.length+' 项';
    $('#expense-table-empty').hidden=!!rows.length;
    $('#expense-table-body').innerHTML=rows.map(e=>`<tr data-expense-row="${esc(e.id)}"><td data-label="编号／类目"><strong class="expense-row-id">${esc(e.id)}</strong><span class="expense-category-text" style="--expense-color:${lookup('categories',e.category)?.color||'#8A765D'}">${esc(name('categories',e.category))}</span></td><td data-label="物品／改动"><strong class="expense-item-name">${esc(e.item)}</strong><p class="expense-purpose">${esc(e.purpose||'用途待补充')}</p><small>${esc(e.quantity||'数量待补充')}${esc(e.unit)}</small></td><td data-label="预算小计">${amount(e.budgetSubtotal)}</td><td data-label="实际花费"><strong>${amount(e.actual)}</strong></td><td data-label="付款人／状态"><span>${esc(name('payers',e.payer))}</span><span class="expense-status-pill" style="--expense-color:${lookup('statuses',e.status)?.color||'#8A765D'}">${esc(name('statuses',e.status))}</span></td><td data-label="日期／关联任务">${esc(e.date||'日期待补充')}<small class="expense-task-refs">${e.taskIds.length?e.taskIds.map(esc).join('、'):'未关联任务'}</small></td><td><div class="row-actions"><button data-edit-expense="${esc(e.id)}">编辑</button><button class="danger" data-delete-expense="${esc(e.id)}">删除</button></div></td></tr>`).join('');
  }
  function renderConfig(){
    $('#expense-config-list').innerHTML=state.data.config[state.configKind].map(e=>`<article class="framework-card" style="--item-color:${esc(e.color)}"><header><h4>${esc(e.name)}</h4><span class="item-id">${esc(e.id)}</span></header><p>${esc(e.color)}${e.aliases?.length?' · 别名：'+e.aliases.map(esc).join('、'):''}</p><footer><button data-edit-expense-config="${esc(e.id)}">编辑</button><button class="danger" data-delete-expense-config="${esc(e.id)}">删除</button></footer></article>`).join('')||'<p class="help">暂无配置，可新增。</p>';
  }
  function renderAll(){
    if(!state.data)return;
    const f=state.filters;
    for(const [key,kind,label]of [['category','categories','全部类目'],['status','statuses','全部状态'],['payer','payers','全部付款人']])$('#expense-admin-'+key).innerHTML=selectOptions(state.data.config[kind],f[key],label)+(key==='payer'?`<option value="__none__" ${f.payer==='__none__'?'selected':''}>未填写付款人</option>`:'');
    $('#expense-admin-task').innerHTML=selectOptions((board()?.tasks||[]).map(t=>({id:t.id,name:t.id+' · '+t.title})),f.task,'全部关联任务')+`<option value="__none__" ${f.task==='__none__'?'selected':''}>未关联任务</option>`;
    $('#expense-data-state').textContent=state.dirty?'费用有本地修改':'已读取费用数据';$('#expense-data-state').classList.toggle('dirty',state.dirty);
    $('#expense-admin-updated').textContent='费用更新时间 '+state.data.meta.updatedAt.replace('T',' ').replace('+07:00','')+' · 曼谷时间';
    $('#add-expense').disabled=false;displayValidation();renderTable();renderConfig();
  }
  function changed(){state.dirty=true;state.data.meta.updatedAt=core.nowBangkok();renderAll();BoardAdmin.refresh()}
  function field(key,label,value,opts={}){
    const a=`id="expense-${key}" name="${key}"`, wide=opts.wide?'span-two':'';
    let control=opts.select?`<select ${a}>${selectOptions(opts.select,value,opts.empty)}</select>`:opts.textarea?`<textarea ${a} rows="${opts.rows||3}">${esc(value??'')}</textarea>`:`<input ${a} value="${esc(value??'')}" ${opts.readonly?'readonly':''} ${opts.decimal?'inputmode="decimal"':''} ${opts.placeholder?'placeholder="'+esc(opts.placeholder)+'"':''}>`;
    return `<label class="${wide}"><span>${label}</span>${control}${opts.help?'<small>'+esc(opts.help)+'</small>':''}</label>`;
  }
  function taskControl(ids){return `<div class="field span-two"><label>关联任务（可多选）</label><details class="multiselect" id="expense-task-dropdown"><summary><span>${ids.length?'已选 '+ids.length+' 项':'未关联任务'}</span></summary><div class="multi-search"><input id="expense-task-search" type="search" placeholder="查找任务编号或标题" aria-label="查找关联任务"></div><div class="multi-options">${(board()?.tasks||[]).map(t=>`<label data-expense-option="${esc((t.id+' '+t.title).toLowerCase())}"><input type="checkbox" data-expense-task="${esc(t.id)}" value="${esc(t.id)}" ${ids.includes(t.id)?'checked':''}><span>${esc(t.id+' · '+t.title)}</span></label>`).join('')}</div></details></div>`}
  function candidateExpense(){const data=clone(state.data),i=data.expenses.findIndex(e=>e.id===state.originalId);if(i<0)data.expenses.push(clone(state.editing));else data.expenses[i]=clone(state.editing);return data}
  function validateEditor(){const errors=checked(candidateExpense());$('#expense-editor-validation').innerHTML=listErrors(errors);$('#save-expense').disabled=!!errors.length;return errors}
  function openExpense(id){
    state.originalId=id||null;
    const next=Math.max(0,...state.data.expenses.map(e=>/^P\d+$/.test(e.id)?Number(e.id.slice(1)):0))+1;
    state.editing=id?clone(state.data.expenses.find(e=>e.id===id)):{id:'P'+String(next).padStart(3,'0'),item:'待补充',purpose:'待补充',category:state.data.config.categories[0]?.id||'',taskIds:[],quantity:'',unit:'',budgetUnitPrice:'',budgetSubtotal:'',actual:'',payer:'',place:'',date:'',status:state.data.config.statuses.find(s=>s.id==='未购')?.id||state.data.config.statuses[0]?.id||'',source:'待补充',notes:'',updatedAt:core.nowBangkok()};
    const e=state.editing;
    $('#expense-editor-title').textContent=id?'编辑 '+id:'新增费用';
    $('#expense-form-fields').innerHTML=field('id','编号',e.id,{readonly:!!id,help:id?'已有编号保持稳定。':'例如 P082；也可使用其他唯一编号。'})+field('date','日期',e.date,{placeholder:'2026-11-19 或待定；可留空'})+field('item','物品／改动',e.item,{wide:true})+field('purpose','用途／对应环节',e.purpose,{textarea:true,wide:true})+field('category','类目',e.category,{select:state.data.config.categories})+field('status','状态',e.status,{select:state.data.config.statuses})+field('quantity','数量',e.quantity,{placeholder:'按实际资料填写；可留空'})+field('unit','单位',e.unit)+field('budgetUnitPrice','预算单价（泰铢）',e.budgetUnitPrice,{decimal:true,help:'非负数字、待报价或留空。'})+field('budgetSubtotal','预算小计（泰铢）',e.budgetSubtotal,{decimal:true,help:'按明确预算填写；不自动推算。'})+field('actual','实际花费（泰铢）',e.actual,{decimal:true,help:'非负数字或留空；明确为零时填 0。'})+field('payer','付款人',e.payer,{select:state.data.config.payers,empty:'未填写付款人'})+field('place','购买地点',e.place,{wide:true})+taskControl(e.taskIds)+field('source','来源',e.source,{wide:true})+field('notes','备注',e.notes,{textarea:true,wide:true,rows:4});
    $('#expense-source-details').hidden=!e.sourceRow;$('#expense-source-details').open=false;
    $('#expense-source-row').innerHTML=e.sourceRow?Object.entries(e.sourceRow).map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value||'（空）')}</dd></div>`).join(''):'';
    validateEditor();$('#expense-editor').showModal();$('#expense-editor').scrollTop=0;
  }
  function moneyInput(value){const text=value.trim();if(!text)return '';if(/^[+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(Number(text)))return Number(text);return text}
  function readExpense(el){
    if(!state.editing)return;
    if(el.dataset.expenseTask){state.editing.taskIds=$$('[data-expense-task]:checked',$('#expense-form')).map(e=>e.value);$('#expense-task-dropdown summary span').textContent=state.editing.taskIds.length?'已选 '+state.editing.taskIds.length+' 项':'未关联任务';}
    else if(el.name){state.editing[el.name]=['budgetUnitPrice','budgetSubtotal','actual'].includes(el.name)?moneyInput(el.value):el.value;}
    validateEditor();
  }
  function removeExpense(id){if(!confirm('删除费用 '+id+'？仅修改费用本地草稿。'))return;state.data.expenses=state.data.expenses.filter(e=>e.id!==id);changed();note(id+' 已从费用草稿删除。')}
  function configCandidate(){const data=clone(state.data),list=data.config[state.configKind],i=list.findIndex(e=>e.id===state.entityId);if(i<0)list.push(clone(state.entity));else list[i]=clone(state.entity);return data}
  function validateConfig(){const errors=checked(configCandidate());$('#expense-config-validation').innerHTML=listErrors(errors);$('#save-expense-config').disabled=!!errors.length;return errors}
  function openConfig(id){
    state.entityId=id||null;state.entity=id?clone(lookup(state.configKind,id)):{id:'',name:'',color:'#8A765D',...(state.configKind==='payers'?{aliases:[]}: {})};const e=state.entity;
    $('#expense-config-title').textContent=(id?'编辑':'新增')+'费用'+configNames[state.configKind];
    $('#expense-config-fields').innerHTML=`<label><span>稳定编号</span><input id="expense-config-id" name="id" value="${esc(e.id)}" ${id?'readonly':''}><small>引用通过编号匹配；已有编号保持稳定。</small></label><label><span>显示名称</span><input id="expense-config-name" name="name" value="${esc(e.name)}"></label><label class="span-two"><span>颜色</span><div class="color-field-row"><input type="color" id="expense-config-color-picker" value="${esc(e.color)}" aria-label="费用配置取色"><input id="expense-config-color" name="color" value="${esc(e.color)}" placeholder="#8A765D"></div></label>${state.configKind==='payers'?`<label class="span-two"><span>别名（逗号分隔）</span><input id="expense-config-aliases" name="aliases" value="${esc((e.aliases||[]).join('，'))}"></label>`:''}`;
    validateConfig();$('#expense-config-editor').showModal();
  }
  function readConfig(el){if(!state.entity||!el.name)return;state.entity[el.name]=el.name==='aliases'?el.value.split(/[,，\n]/).map(x=>x.trim()).filter(Boolean):el.value;validateConfig()}
  function removeConfig(id){
    const data=clone(state.data);data.config[state.configKind]=data.config[state.configKind].filter(e=>e.id!==id);const errors=checked(data);if(errors.length){note('不能删除：'+errors.slice(0,3).map(e=>e.message).join('；'));return;}
    if(!confirm('删除费用'+configNames[state.configKind]+'“'+name(state.configKind,id)+'”？'))return;state.data=data;if(state.filters[{categories:'category',statuses:'status',payers:'payer'}[state.configKind]]===id)state.filters[{categories:'category',statuses:'status',payers:'payer'}[state.configKind]]='';changed();note('费用配置已删除。');
  }
  function saveLocal(key,data){try{localStorage.setItem(key,JSON.stringify(data,null,2));return true;}catch(error){note('本地存储失败，请直接导出费用 JSON。');return false;}}
  function exportExpenses(){if(checked().length)return;const blob=new Blob([JSON.stringify(state.data,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='expenses.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);note('已导出 expenses.json；替换站点费用数据文件后生效。')}
  function preview(expensesTab=true){
    if(!state.data||checked().length||BoardCore.validate(board()).length){note('请先修正任务与费用草稿的校验问题。');return;}
    if(!saveLocal(BoardCore.PREVIEW_KEY,board())||!saveLocal(core.PREVIEW_KEY,state.data))return;
    window.open('index.html?preview=1&expenses-preview=1'+(expensesTab?'#expenses':''),'_blank','noopener');note('已打开任务与费用的本地预览；普通展示站读取站点数据。');
  }
  async function importExpenses(file){
    if(!file)return;try{const data=JSON.parse(await file.text()),errors=checked(data);if(errors.length){note('费用导入校验失败：'+errors.slice(0,3).map(e=>e.message).join('；'));return;}if(state.dirty&&!confirm('导入将替换当前费用草稿，继续？'))return;state.data=data;state.filters={search:'',category:'',status:'',payer:'',task:''};$('#expense-admin-search').value='';changed();note('已导入费用草稿，任务数据保持原样。');}catch(error){note('无法导入费用 JSON：'+error.message);}
  }
  function restoreDraft(){let raw;try{raw=localStorage.getItem(core.DRAFT_KEY);}catch(error){note('无法读取费用本地草稿。');return;}if(!raw){note('没有保存的费用草稿。');return;}try{const data=JSON.parse(raw),errors=checked(data);if(errors.length){note('费用草稿校验失败：'+errors.slice(0,3).map(e=>e.message).join('；'));return;}if(state.dirty&&!confirm('恢复将替换当前费用修改，继续？'))return;state.data=data;state.dirty=true;renderAll();BoardAdmin.refresh();note('已恢复费用本地草稿。');}catch(error){note('费用本地草稿不是有效 JSON。');}}
  function switchSection(section){state.section=section;$('#expense-entries-section').hidden=section!=='entries';$('#expense-config-section').hidden=section!=='config';$$('[data-expense-section]').forEach(b=>{b.classList.toggle('active',b.dataset.expenseSection===section);b.setAttribute('aria-pressed',String(b.dataset.expenseSection===section));});}
  function bind(){
    document.addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-expense]');if(edit){openExpense(edit.dataset.editExpense);return;}
      const remove=event.target.closest('[data-delete-expense]');if(remove){removeExpense(remove.dataset.deleteExpense);return;}
      const conf=event.target.closest('[data-edit-expense-config]');if(conf){openConfig(conf.dataset.editExpenseConfig);return;}
      const removeConf=event.target.closest('[data-delete-expense-config]');if(removeConf){removeConfig(removeConf.dataset.deleteExpenseConfig);return;}
      const section=event.target.closest('[data-expense-section]');if(section){switchSection(section.dataset.expenseSection);return;}
      const btn=event.target.closest('[data-expense-action]');if(!btn||btn.disabled)return;
      const action=btn.dataset.expenseAction;
      if(action==='close-editor'){$('#expense-editor').close();return;}if(action==='close-config'){$('#expense-config-editor').close();return;}
      if(action==='import'){$('#expense-import-file').click();return;}if(!state.data)return;
      if(action==='add')openExpense();if(action==='add-config')openConfig();if(action==='export')exportExpenses();if(action==='preview')preview();if(action==='restore-draft')restoreDraft();
      if(action==='save-draft'&&!checked().length&&saveLocal(core.DRAFT_KEY,state.data))note('费用草稿已保存到当前浏览器。');
    });
    document.addEventListener('input',event=>{
      const el=event.target;if(el.id==='expense-admin-search'){state.filters.search=el.value.trim();renderTable();}
      if(el.closest('#expense-form')&&(el.name||el.dataset.expenseTask))readExpense(el);
      if(el.id==='expense-task-search'){$$('[data-expense-option]').forEach(label=>label.hidden=!label.dataset.expenseOption.includes(el.value.toLowerCase()));}
      if(el.closest('#expense-config-form')&&el.name)readConfig(el);
      if(el.id==='expense-config-color-picker'){$('#expense-config-color').value=el.value;readConfig($('#expense-config-color'));}
    });
    document.addEventListener('change',event=>{
      const el=event.target;
      for(const field of ['category','status','payer','task'])if(el.id==='expense-admin-'+field){state.filters[field]=el.value;renderTable();}
      if(el.closest('#expense-form')&&(el.name||el.dataset.expenseTask))readExpense(el);
      if(el.closest('#expense-config-form')&&el.name)readConfig(el);
      if(el.id==='expense-config-kind'){state.configKind=el.value;renderConfig();}
      if(el.id==='expense-import-file'){importExpenses(el.files[0]);el.value='';}
    });
    $('#expense-form').addEventListener('submit',event=>{event.preventDefault();if(validateEditor().length)return;state.editing.updatedAt=core.nowBangkok();state.data=candidateExpense();$('#expense-editor').close();changed();note('费用已保存到本地草稿。');});
    $('#expense-config-form').addEventListener('submit',event=>{event.preventDefault();if(validateConfig().length)return;state.data=configCandidate();$('#expense-config-editor').close();changed();note('费用配置已保存到本地草稿。');});
    window.addEventListener('board-admin-change',()=>{if(state.data)renderAll()});
    window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  }
  async function init(){
    bind();await BoardAdmin.ready;
    try{state.data=await core.loadExpenses();const errors=checked();if(errors.length){state.loadError=errors[0].message;$('#expense-admin-validation').classList.add('invalid');$('#expense-admin-validation').innerHTML='<strong>费用数据需要修正</strong>'+listErrors(errors);['save-expense-draft','preview-expenses','export-expenses','add-expense','add-expense-config'].forEach(id=>$('#'+id).disabled=true);$('#expense-data-state').textContent='费用数据校验未通过';state.data=null;return;}renderAll();BoardAdmin.refresh();}
    catch(error){state.loadError=error.message;$('#expense-admin-validation').classList.add('invalid');$('#expense-admin-validation').textContent='无法读取费用：'+error.message;$('#expense-data-state').textContent='费用载入失败';['save-expense-draft','preview-expenses','export-expenses','add-expense','add-expense-config'].forEach(id=>$('#'+id).disabled=true);}
  }
  window.ExpenseAdmin={getState:()=>state,validateBoardReferences,preview,ready:null};
  window.ExpenseAdmin.ready=init();
})();
