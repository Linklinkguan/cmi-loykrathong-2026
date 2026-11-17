/* 只读费用视图；记录与选项全部读取 expenses.json。 */
(function(root){
'use strict';
async function create({board,onChange,openTask,icon}){
 const C=ExpensesCore,esc=C.escapeHTML,$=s=>document.querySelector(s);
 let data=null,error='';
 try{data=await C.loadExpenses();const errors=C.validate(data,board);if(errors.length)throw new Error(errors.map(e=>e.message).join('；'))}catch(e){error=e.message;data=null}
 const state={filters:{category:'',status:'',payer:'',task:''},search:'',filtersOpen:false,selectedId:null};
 const tasks=new Map(board.tasks.map(t=>[t.id,t]));
 const name=(kind,id)=>data?.config[kind].find(x=>x.id===id)?.name||(kind==='payers'&&!id?'未指定付款人':id);
 const color=(kind,id)=>data?.config[kind].find(x=>x.id===id)?.color||'#8A765D';
 const amount=v=>esc(C.money(v));
 const date=v=>v||'日期待补充';
 const time=v=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
 function visible(){if(!data)return [];const f=state.filters,q=state.search.toLocaleLowerCase();return data.expenses.filter(r=>(!f.category||r.category===f.category)&&(!f.status||r.status===f.status)&&(!f.payer||(f.payer==='__none__'?!r.payer:r.payer===f.payer))&&(!f.task||(f.task==='__none__'?!r.taskIds.length:r.taskIds.includes(f.task)))&&(!q||[r.id,r.item,r.purpose,r.place,r.notes,r.source,...r.taskIds].join(' ').toLocaleLowerCase().includes(q)))}
 function summary(compact=false){const f=state.filters,parts=['费用'];if(f.category)parts.push((compact?'':'类目：')+name('categories',f.category));if(f.status)parts.push((compact?'':'状态：')+name('statuses',f.status));if(f.payer)parts.push('付款人：'+(f.payer==='__none__'?'未指定':name('payers',f.payer)));if(f.task)parts.push(f.task==='__none__'?'未关联任务':(compact?'任务：':'关联任务：')+f.task);if(parts.length===1)parts.push('全部类目 · 全部付款人');return parts.join(' · ')}
 function filterHTML(){
  const select=(key,label,items,first)=>`<label><span>${label}</span><select id="expense-filter-${key}" data-expense-filter="${key}"><option value="">${first}</option>${items.map(e=>`<option value="${esc(e.id)}" ${e.id===state.filters[key]?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>`;
  return `<div class="expense-filter-toggle"><button data-expense-action="toggle-filters" aria-expanded="${state.filtersOpen}" aria-controls="expense-filters">筛选费用 <span>${Object.values(state.filters).filter(Boolean).length?'已选 '+Object.values(state.filters).filter(Boolean).length+' 项':'全部'}</span><b>${state.filtersOpen?'收起 −':'展开 ＋'}</b></button></div><section class="expense-filters ${state.filtersOpen?'':'collapsed'}" id="expense-filters" aria-label="费用筛选">${select('category','类目',data.config.categories,'全部类目')}${select('status','状态',data.config.statuses,'全部状态')}${select('payer','付款人',[{id:'__none__',name:'未指定付款人'},...data.config.payers],'全部付款人')}${select('task','关联任务',[{id:'__none__',name:'未关联任务'},...board.tasks.map(t=>({id:t.id,name:t.id+' · '+t.title}))],'全部关联任务')}<button class="quiet-button" data-expense-action="reset">${icon('reset',13)}清空费用筛选</button></section>`;
 }
 function totalCard(key,title,value,subtitle,style=''){return `<div class="expense-total ${style}" data-expense-total="${key}"><span>${title}</span><strong>${typeof value==='number'?esc(C.money(value)):esc(value===null?'未填写':value)}</strong><small>${subtitle}</small></div>`}
 function groupTable(groups,label){return `<table class="expense-group-table"><thead><tr><th>${label}</th><th>条目</th><th>预算 · 铢</th><th>实际 · 铢</th></tr></thead><tbody>${groups.map(g=>`<tr data-expense-group="${esc(g.id)}"><th>${esc(g.name)}</th><td>${g.count}</td><td>${amount(g.budget.total)}<small>${g.budget.missing?'缺 '+g.budget.missing+' 项':''}</small></td><td>${amount(g.actual.total)}<small>${g.actual.missing?'缺 '+g.actual.missing+' 项':''}</small></td></tr>`).join('')}</tbody></table>`}
 function pill(kind,id){return `<span class="expense-pill" style="--expense-color:${color(kind,id)}">${esc(name(kind,id))}</span>`}
 function links(r){return r.taskIds.length?r.taskIds.map(id=>`<button class="expense-task-link" data-expense-task="${esc(id)}" title="${esc(tasks.get(id).title)}">${esc(id)}</button>`).join(''):'<span class="expense-muted">未关联任务</span>'}
 function ledger(rows){return `<div class="expense-ledger"><div class="expense-list-heading"><h3>逐项明细 <span>${rows.length} 条</span></h3><span>金额单位：泰铢 · 点击条目查看详情</span></div><table class="expense-table"><thead><tr><th>编号／物品与用途</th><th>类目／状态</th><th>数量／日期</th><th>预算小计</th><th>实际花费</th><th>付款人</th></tr></thead><tbody>${rows.map(r=>`<tr data-expense-row="${esc(r.id)}"><td class="expense-item-cell"><button data-expense="${esc(r.id)}" class="expense-item-button"><span>${esc(r.id)} ${icon('arrow',12)}</span><strong>${esc(r.item)}</strong></button><p>${esc(r.purpose||'用途待补充')}</p><div class="expense-links">${links(r)}</div></td><td class="expense-pills">${pill('categories',r.category)}${pill('statuses',r.status)}</td><td class="expense-quantity"><span>${esc((r.quantity||'数量待补充')+(r.quantity?r.unit:''))}</span><small>${esc(date(r.date))}</small></td><td class="expense-budget" data-label="预算小计"><span>${amount(r.budgetSubtotal)}</span></td><td class="expense-actual" data-label="实际花费"><strong>${amount(r.actual)}</strong></td><td class="expense-payer"><span>${esc(name('payers',r.payer))}</span><small>${esc(r.place||'购买地点待补充')}</small></td></tr>`).join('')}</tbody></table></div>`}
 function render(container){
  if(error){container.innerHTML=`<div class="error-banner"><h3>费用数据需要检查</h3><p>${esc(error)}</p></div>`;return}
  const rows=visible(),s=C.summarize(rows,data),quoted=rows.filter(r=>r.budgetUnitPrice==='待报价'||r.budgetSubtotal==='待报价').length;
  container.innerHTML=`<div class="expenses-wrap">${filterHTML()}<div class="expense-total-grid" aria-label="当前筛选费用合计">${totalCard('count','当前费用条目',String(s.count),`全账 ${data.expenses.length} 条 · 待报价 ${quoted} 条`)}${totalCard('budget','预算合计 · 泰铢',s.budget.total,`已填写 ${s.budget.count} 项 · 未填写 ${s.budget.missing} 项`)}${totalCard('actual','实际合计 · 泰铢',s.actual.total,`已填写 ${s.actual.count} 项 · 未填写 ${s.actual.missing} 项`,'actual-total')}</div><p class="expense-calculation-note">只合计当前筛选内已填写的小计；空白与待报价不计为零，不根据数量估算。费用更新 ${esc(time(data.meta.updatedAt))}（曼谷）。</p><div class="expense-groups"><details class="expense-group" data-expense-group-kind="payer" open><summary>按付款人合计 <span>${s.byPayer.length} 组</span></summary>${groupTable(s.byPayer,'付款人')}</details><details class="expense-group" data-expense-group-kind="category"><summary>按类目合计 <span>${s.byCategory.length} 组 · 展开查看</span></summary>${groupTable(s.byCategory,'类目')}</details></div>${rows.length?ledger(rows):'<div class="empty-state"><h3>没有符合条件的费用</h3><p>调整类目、状态、付款人或关联任务后查看。</p><button class="primary-button" data-expense-action="reset">清空费用筛选</button></div>'}</div>`;
 }
 const dialog=document.createElement('dialog');dialog.id='expense-dialog';dialog.setAttribute('aria-labelledby','expense-detail-title');document.body.append(dialog);
 function open(id){
  const r=data?.expenses.find(r=>r.id===id);if(!r)return;state.selectedId=id;
  const fields=[['类目',name('categories',r.category)],['状态',name('statuses',r.status)],['数量／单位',(r.quantity||'待补充')+(r.quantity&&r.unit?' '+r.unit:'')],['日期',r.date||'待补充'],['预算单价 · 泰铢',C.money(r.budgetUnitPrice)],['预算小计 · 泰铢',C.money(r.budgetSubtotal)],['实际花费 · 泰铢',C.money(r.actual)],['付款人',name('payers',r.payer)],['购买地点',r.place||'待补充'],['来源',r.source||'待补充'],['最后修改 · 曼谷',time(r.updatedAt)]];
  dialog.innerHTML=`<div class="expense-dialog-context">${esc(summary())}${state.search?`<small>搜索：${esc(state.search)}</small>`:''}</div><div class="expense-dialog-header"><span>费用详情 · 只读</span><button class="icon-button" data-expense-action="close" aria-label="关闭费用详情">×</button></div><div class="expense-detail-body"><p class="expense-detail-id">${esc(r.id)}</p><h2 id="expense-detail-title">${esc(r.item)}</h2><section class="expense-purpose"><h3>用途／对应环节</h3><p>${esc(r.purpose||'待补充')}</p></section><dl class="expense-detail-fields">${fields.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><section class="detail-section"><h3>关联任务</h3><div class="expense-detail-tasks">${r.taskIds.length?r.taskIds.map(id=>`<button class="dependency-button" data-expense-task="${esc(id)}"><span>${esc(id)}</span><span>${esc(tasks.get(id).title)}</span>${icon('arrow',13)}</button>`).join(''):'<p>未关联任务</p>'}</div></section><section class="detail-section"><h3>备注</h3><p>${esc(r.notes||'待补充')}</p></section>${r.sourceRow?`<details class="expense-source"><summary>导入时的原始记录</summary><dl>${Object.entries(r.sourceRow).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v===''?'（空）':v)}</dd></div>`).join('')}</dl></details>`:''}</div>`;
  $('#task-dialog')?.close();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;dialog.querySelector('[data-expense-action="close"]').focus({preventScroll:true});
 }
 function taskExpensesHTML(id){
  if(error)return `<section class="detail-section"><h3>关联费用</h3><p>费用数据暂时无法读取，请在费用视图查看提示。</p></section>`;
  const rows=data.expenses.filter(r=>r.taskIds.includes(id));
  return `<section class="detail-section" id="task-linked-expenses"><h3>${icon('money',15)}关联费用 <small>${rows.length} 条</small></h3>${rows.length?`<div class="detail-links">${rows.map(r=>`<button class="dependency-button" data-expense="${esc(r.id)}"><span>${esc(r.id)}</span><span>${esc(r.item)}<small class="linked-expense-amount">实际 ${amount(r.actual)}${typeof r.actual==='number'?' 泰铢':''} · ${esc(name('payers',r.payer))}</small></span>${icon('arrow',13)}</button>`).join('')}</div>`:'<p>暂无关联费用</p>'}</section>`;
 }
 document.addEventListener('click',e=>{
  const expense=e.target.closest('[data-expense]');if(expense){open(expense.dataset.expense);return}
  const task=e.target.closest('[data-expense-task]');if(task){dialog.close();openTask(task.dataset.expenseTask,task);return}
  const action=e.target.closest('[data-expense-action]')?.dataset.expenseAction;
  if(action==='close')dialog.close();
  if(action==='toggle-filters'){state.filtersOpen=!state.filtersOpen;onChange()}
  if(action==='reset'){state.filters={category:'',status:'',payer:'',task:''};state.search='';$('#search-input').value='';onChange()}
 });
 document.addEventListener('change',e=>{if(e.target.matches('[data-expense-filter]')){state.filters[e.target.dataset.expenseFilter]=e.target.value;onChange()}});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 const api={render,summary,visible,taskExpensesHTML,open,setSearch(value){state.search=value.trim()},getState:()=>state,getData:()=>data,getError:()=>error,getSummary:()=>data?C.summarize(visible(),data):null};
 root.ExpenseView=api;return api;
}
root.ExpensesViewer={create};
})(window);
