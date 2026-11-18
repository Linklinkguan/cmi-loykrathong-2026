/* v9 状态显示配置：显示名、颜色、标记、筛选顺序都只在这里改。
 * 键是 board.json 里 framework.statuses 的 id。
 * - fg／bg／line：标签文字色、底色、边框；tone：在米色底上写状态名用的文字色。
 * - label 留空则用数据里的 name；kind 决定卡片样式：todo／doing／done（整体变淡加勾）／held（斜纹＋深色标签）。
 * - aliases：旧编号 → 新编号。数据还没迁移时，旧编号也按新配置显示（例：待决 → 搁置）。
 * - order：筛选项和统计的顺序；数据里有但这里没列的状态排在最后，用数据里的颜色。
 */
(function(){
  'use strict';
  const STATUS_UI={
    order:['未开始','进行中','已完成','搁置'],
    aliases:{'待决':'搁置'},
    items:{
      '未开始':{label:'未开始',mark:'○',kind:'todo', fg:'#5E4B3B',bg:'#EFE4D4',line:'#C9B49A',tone:'#7A6552'},
      '进行中':{label:'进行中',mark:'▶\uFE0E',kind:'doing',fg:'#FFFFFF',bg:'#4A5FB8',line:'#4A5FB8',tone:'#4A5FB8'},
      '已完成':{label:'已完成',mark:'✓',kind:'done', fg:'#FFFFFF',bg:'#3F7A4B',line:'#3F7A4B',tone:'#3F7A4B'},
      '搁置':  {label:'搁置',  mark:'‖',kind:'held', fg:'#FFFFFF',bg:'#6E6A64',line:'#6E6A64',tone:'#5E5A55'}
    }
  };
  function canonical(id){return STATUS_UI.aliases[id]||id}
  /** 返回某状态的显示配置；statuses 为 board.framework.statuses（用于未配置状态的兜底）。 */
  function info(id,statuses){
    const key=canonical(id),base=STATUS_UI.items[key],data=(statuses||[]).find(s=>s.id===id||canonical(s.id)===key);
    if(base)return {id,key,...base,label:base.label||data?.name||key};
    const color=data?.color||'#8C7867';
    return {id,key,label:data?.name||key,mark:'•',kind:data?.isDone?'done':data?.isPending?'held':'todo',fg:'#FFFFFF',bg:color,line:color,tone:color};
  }
  /** 筛选顺序：配置 order 在前，其余数据状态在后；返回数据里实际存在的 id。 */
  function ordered(statuses){
    const ids=(statuses||[]).map(s=>s.id),rank=id=>{const i=STATUS_UI.order.indexOf(canonical(id));return i<0?99:i};
    return ids.slice().sort((a,b)=>rank(a)-rank(b));
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  /** 卡片上的状态标签：颜色＋文字（颜色不是唯一区分）。 */
  function badge(id,statuses,extraClass=''){
    const s=info(id,statuses);
    return `<span class="status-badge status-${s.kind} ${extraClass}" style="--st-fg:${s.fg};--st-bg:${s.bg};--st-line:${s.line}" title="状态：${esc(s.label)}"><i aria-hidden="true">${s.mark}</i>${esc(s.label)}</span>`;
  }
  /** 状态多选筛选组：selected 为已选 id 数组，counts 为 {id:数量}。 */
  function chips(statuses,selected,counts,attr='data-status-chip'){
    return ordered(statuses).map(id=>{const s=info(id,statuses),on=selected.includes(id);
      return `<button type="button" class="status-chip status-${s.kind}${on?' is-on':''}" ${attr}="${esc(id)}" aria-pressed="${on}" style="--st-fg:${s.fg};--st-bg:${s.bg};--st-line:${s.line};--st-tone:${s.tone}" title="${on?'已选，点按取消':'点按只看'}「${esc(s.label)}」，可多选"><i aria-hidden="true">${s.mark}</i>${esc(s.label)}<b>${counts?.[id]??0}</b></button>`}).join('');
  }
  /** 屏幕上的筛选条件文字，例如「状态：未开始、进行中」。 */
  function summary(statuses,selected){
    if(!selected.length)return '';
    return '状态：'+ordered(statuses).filter(id=>selected.includes(id)).map(id=>info(id,statuses).label).join('、');
  }
  window.StatusUI={config:STATUS_UI,canonical,info,ordered,badge,chips,summary};
})();
