/* 展示站与后台共用的数据校验和读取；不修改 board.json。 */
(function (root) {
  'use strict';
  const PREVIEW_KEY = 'cmi-board-preview-v3';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const nonempty = v => typeof v === 'string' && v.trim().length > 0;
  const hex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  function dateOK(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function safeIconMarkup(markup) {
    if (typeof markup !== 'string' || !markup.trim()) return '';
    if (/<!|<\?|&(?:#|[a-z])/i.test(markup)) return '';
    const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + markup + '</svg>', 'image/svg+xml');
    if (doc.querySelector('parsererror')) return '';
    const tags = new Set(['path','circle','rect','line','polyline','polygon','ellipse']);
    const attrs = new Set(['d','cx','cy','r','x','y','x1','y1','x2','y2','width','height','rx','ry','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','transform']);
    const numeric = /^[\d\s.,+\-eE]+$/;
    for (const el of doc.documentElement.querySelectorAll('*')) {
      if (!tags.has(el.localName) || el.children.length) return '';
      for (const a of el.attributes) {
        if (!attrs.has(a.name)) return '';
        if (a.name === 'd' && !/^[MmZzLlHhVvCcSsQqTtAa\d\s.,+\-eE]+$/.test(a.value)) return '';
        if (a.name === 'points' && !numeric.test(a.value)) return '';
        if (['fill','stroke'].includes(a.name) && !/^(none|currentColor|#[\da-fA-F]{3,8})$/.test(a.value)) return '';
        if (a.name === 'transform' && !/^(?:(?:translate|scale|rotate|matrix|skewX|skewY)\([\d\s.,+\-eE]+\)\s*)+$/.test(a.value)) return '';
        if (['stroke-linecap','stroke-linejoin','fill-rule','clip-rule'].includes(a.name) && !/^(butt|round|square|miter|bevel|nonzero|evenodd)$/.test(a.value)) return '';
        if (!['d','points','fill','stroke','transform','stroke-linecap','stroke-linejoin','fill-rule','clip-rule'].includes(a.name) && !numeric.test(a.value)) return '';
      }
    }
    if ([...doc.documentElement.childNodes].some(n => n.nodeType !== 1 && n.textContent.trim())) return '';
    return [...doc.documentElement.children].map(el => new XMLSerializer().serializeToString(el)).join('');
  }
  // v8：进度记录配图。仓库图片只能由 board.py --image 入库；浏览器只查路径格式，不查文件是否存在。
  const MAX_IMAGES=2,MAX_ALT=80,MAX_URL=500;
  const REPO_IMAGE_RE=/^assets\/progress\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/;
  function httpsUrlError(v){
    if(typeof v!=='string'||!v)return '链接不能为空';
    if(v.length>MAX_URL)return '链接不能超过 '+MAX_URL+' 个字符';
    if(!v.startsWith('https://'))return '外链必须以 https:// 开头';
    if(/[\s"'<>\\`]/.test(v)||/[\u0000-\u001f]/.test(v))return '链接里不能有空白、引号、尖括号或反斜杠';
    let u;try{u=new URL(v);}catch(e){return '链接格式不正确';}
    if(u.protocol!=='https:'||!u.hostname||u.username||u.password||/^https:\/\/[^/?#]*@/.test(v))return '链接必须是 https://主机/路径，且不能带用户名或口令';
    return '';
  }
  function imageSrcError(v){
    if(typeof v!=='string'||!v)return 'src 不能为空';
    if(v.startsWith('assets/'))return REPO_IMAGE_RE.test(v)&&!v.includes('..')?'':'仓库图片路径只能是 assets/progress/文件名.jpg|jpeg|png|webp';
    return httpsUrlError(v);
  }
  function imageAltError(v){if(typeof v!=='string'||!v.trim())return 'alt（图片说明）必填';if([...v].length>MAX_ALT)return 'alt 不能超过 '+MAX_ALT+' 个字';return '';}
  function logTimeOK(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(v))return false;return dateOK(v.slice(0,10));}
  function validate(board) {
    const errors = [];
    const error = (code, message, taskId, field) => errors.push({code, message, ...(taskId ? {taskId} : {}), ...(field ? {field} : {})});
    if (!obj(board)) return [{code:'shape',message:'数据根节点必须是 JSON 对象'}];
    if (board.version !== 3) error('version','version 必须为 3');
    if (!obj(board.meta)) error('shape','meta 必须是对象');
    else {
      const m = board.meta;
      for (const k of ['title','heroTitle','updatedAt','timeZone']) if (!nonempty(m[k])) error('required','meta.' + k + ' 不能为空',null,'meta.'+k);
      if (m.timeZone !== 'Asia/Bangkok') error('timezone','时区必须为 Asia/Bangkok');
      if (typeof m.updatedAt === 'string' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+07:00$/.test(m.updatedAt) || !Number.isFinite(Date.parse(m.updatedAt)))) error('timestamp','更新时间必须使用带 +07:00 的完整时间');
      if (!obj(m.event)) error('shape','meta.event 必须是对象');
      else {
        for (const k of ['name','venue','city','startTime','endTime','bonfire','attendees','fee']) if (!nonempty(m.event[k])) error('required','活动信息 '+k+' 不能为空');
        if (!dateOK(m.event.date)) error('date','活动日期格式或日期值无效');
        for (const k of ['startTime','endTime']) if (typeof m.event[k] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(m.event[k])) error('time','活动时间 '+k+' 必须使用 HH:MM');
      }
      if (!obj(m.logos)) error('shape','meta.logos 必须是对象');
      else for (const key of ['icon','community']) {
        const logo=m.logos[key];
        if (!obj(logo)) {error('shape','缺少 '+key+' 标识');continue;}
        if (typeof logo.src!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/\r\n]+={0,2}$/.test(logo.src)) error('logo',key+' 标识必须为内联 PNG base64');
        if (!Number.isInteger(logo.width)||logo.width<1||!Number.isInteger(logo.height)||logo.height<1) error('logo',key+' 标识宽高必须为正整数');
        if (!Array.isArray(logo.crop)||logo.crop.length!==4||logo.crop.some(n=>!Number.isInteger(n)||n<0)||logo.crop[2]<=logo.crop[0]||logo.crop[3]<=logo.crop[1]) error('logo',key+' 裁切框无效');
        else if (logo.crop[2]-logo.crop[0]!==logo.width||logo.crop[3]-logo.crop[1]!==logo.height) error('logo',key+' 裁切框与原尺寸不一致');
      }
    }
    const collections = {};
    function collection(name, list, fields, min=0) {
      const map = new Map(); collections[name]=map;
      if (!Array.isArray(list)) {error('shape',name+' 必须是数组');return;}
      if (list.length<min) error('required',name+' 至少保留 '+min+' 项');
      list.forEach((entry, index)=>{
        if (!obj(entry)) {error('shape',name+' 第 '+(index+1)+' 项必须是对象');return;}
        if (!nonempty(entry.id)) error('required',name+' 的编号不能为空');
        else if (map.has(entry.id)) error('duplicate',name+' 编号重复：'+entry.id);
        else map.set(entry.id,entry);
        for (const field of fields) if (!nonempty(entry[field])) error('required',name+' '+(entry.id||index+1)+' 的 '+field+' 不能为空');
        for (const field of ['color','background']) if (own(entry,field)&&!hex(entry[field])) error('color',name+' '+entry.id+' 的 '+field+' 必须为 #RRGGBB');
      });
    }
    collection('people',board.people,['name','color']);
    (Array.isArray(board.people)?board.people:[]).forEach(p=>{
      if (!obj(p)) return;
      if (!Array.isArray(p.aliases)||p.aliases.some(a=>!nonempty(a))) error('shape','执行人 '+p.id+' 的 aliases 必须为非空字符串数组');
      else if (new Set(p.aliases).size!==p.aliases.length) error('duplicate','执行人 '+p.id+' 的别名重复');
    });
    const f=obj(board.framework)?board.framework:{};
    if (!obj(board.framework)) error('shape','framework 必须是对象');
    collection('categories',f.categories,['name','color','icon'],1);
    collection('threads',f.threads,['name','color']);
    collection('stages',f.stages,['name','date']);
    collection('statuses',f.statuses,['name','color'],1);
    collection('layers',f.layers,['name','color','background'],1);
    collection('locations',f.locations,['name','color','icon'],1);
    collection('views',f.views,['name','icon','description','mobileDescription'],1);
    for (const t of collections.threads.values()) if (typeof t.description!=='string') error('shape','线索 '+t.id+' 的 description 必须为字符串');
    const stageDates=new Set();
    for (const t of collections.stages.values()) {
      if (!dateOK(t.date)) error('date','阶段 '+t.id+' 的日期无效');
      if (stageDates.has(t.date)) error('duplicate','阶段日期重复：'+t.date);stageDates.add(t.date);
    }
    for (const t of collections.statuses.values()) for (const k of ['isDone','isPending']) if (typeof t[k]!=='boolean') error('shape','状态 '+t.id+' 的 '+k+' 必须为布尔值');
    for (const t of collections.statuses.values()) if (t.isDone&&t.isPending) error('status','状态 '+t.id+' 不能同时设为已完成和搁置');
    for (const t of collections.views.values()) {
      if (!['chain','network','board','timeline'].includes(t.id)) error('view','不支持的视图类型：'+t.id);
      if (typeof t.enabled!=='boolean') error('shape','视图 '+t.id+' 的 enabled 必须为布尔值');
    }
    if (![...collections.views.values()].some(v=>v.enabled===true)) error('view','至少启用一个视图');
    if (!obj(f.colors)) error('shape','framework.colors 必须是对象');
    else for (const key of ['paper','surface','white','ink','muted','brown','line','accent','green','sameTag']) if (!hex(f.colors[key])) error('color','主题色 '+key+' 必须为 #RRGGBB');
    if (!obj(f.icons)) error('shape','framework.icons 必须是对象');
    else for (const [name,markup] of Object.entries(f.icons)) if (!nonempty(markup)||!safeIconMarkup(markup)) error('icon','图标 '+name+' 仅支持安全 SVG 几何元素');
    for (const name of ['categories','locations','views']) for (const entry of collections[name].values()) if (!obj(f.icons)||!own(f.icons,entry.icon)) error('reference',name+' '+entry.id+' 引用不存在的图标 '+entry.icon);
    for (const entry of collections.threads.values()) if (own(entry,'icon')&&(!obj(f.icons)||!own(f.icons,entry.icon))) error('reference','threads '+entry.id+' 引用不存在的图标 '+entry.icon);
    if (!Array.isArray(board.tasks)) {error('shape','tasks 必须是数组');return errors;}
    const tasks=new Map();
    for (const t of board.tasks) {
      if (!obj(t)) {error('shape','任务必须是对象');continue;}
      const id=nonempty(t.id)?t.id:'（无编号任务）';
      if (!/^T\d+$/.test(t.id)) error('id','任务编号必须为 T 加数字：'+id,id,'id');
      if (tasks.has(t.id)) error('duplicate','任务编号重复：'+id,id,'id');else tasks.set(t.id,t);
      for (const k of ['title','description']) if (!nonempty(t[k])) error('required',id+' '+k+' 不能为空，资料不足请填待补充',id,k);
      for (const k of ['timeHint','pendingNote','notes']) if (typeof t[k]!=='string') error('shape',id+' '+k+' 必须为字符串',id,k);
      if (!dateOK(t.date)) error('date',id+' 日期无效，使用 YYYY-MM-DD',id,'date');
      for (const [field,name] of [['category','categories'],['status','statuses'],['layer','layers'],['location','locations']]) if (!collections[name].has(t[field])) error('reference',id+' 的 '+field+' 引用不存在：'+String(t[field]),id,field);
      for (const key of ['executor','threads','pre','participants']) {
        if (!Array.isArray(t[key])||t[key].some(v=>!nonempty(v))) error('shape',id+' '+key+' 必须是非空字符串数组（允许空数组）',id,key);
        else if (new Set(t[key]).size!==t[key].length) error('duplicate',id+' '+key+' 存在重复值',id,key);
      }
      for (const [field,name] of [['executor','people'],['threads','threads']]) if (Array.isArray(t[field])) for (const ref of t[field]) if (!collections[name].has(ref)) error('reference',id+' 的 '+field+' 引用不存在：'+String(ref),id,field);
      for (const field of ['successors','post']) if (own(t,field)) error('derived',id+' 不得存储 '+field+'；后置从 pre 推导',id,field);
      // 进度记录（可选）：曼谷时间 YYYY-MM-DD HH:MM；状态为空或已配置的状态；备注不能为空
      if (own(t,'progress_log')) {
        if (!Array.isArray(t.progress_log)) error('shape',id+' progress_log 必须是数组',id,'progress_log');
        else t.progress_log.forEach((e,i)=>{
          const where=id+' 进度记录第 '+(i+1)+' 条';
          if (!obj(e)) {error('shape',where+'必须是对象',id,'progress_log');return;}
          const extra=Object.keys(e).filter(k=>!['time','status','note','by','images'].includes(k));
          if (extra.length) error('shape',where+'含未知字段：'+extra.join('、'),id,'progress_log');
          if (!logTimeOK(e.time)) error('time',where+'时间格式不正确，应为曼谷时间 YYYY-MM-DD HH:MM',id,'progress_log');
          const st=e.status==null?'':e.status;
          if (typeof st!=='string'||(st&&!collections.statuses.has(st))) error('reference',where+'状态只能为空或已配置的状态',id,'progress_log');
          if (!nonempty(e.note)) error('required',where+'备注不能为空',id,'progress_log');
          if (own(e,'by')&&!nonempty(e.by)) error('required',where+'记录人如填写则不能为空',id,'progress_log');
          if (own(e,'images')) {
            const im=e.images;
            if (!Array.isArray(im)||im.length<1||im.length>MAX_IMAGES) error('shape',where+'图片应为 1–'+MAX_IMAGES+' 张的数组（没有图时省略 images）',id,'progress_log');
            else im.forEach((g,j)=>{const at=where+'第 '+(j+1)+' 张图片';
              if (!obj(g)) {error('shape',at+'必须是对象',id,'progress_log');return;}
              const bad=Object.keys(g).filter(k=>k!=='src'&&k!=='alt');if (bad.length) error('shape',at+'含未知字段：'+bad.join('、'),id,'progress_log');
              const se=imageSrcError(g.src);if (se) error('shape',at+'：'+se,id,'progress_log');
              const ae=imageAltError(g.alt);if (ae) error('required',at+'：'+ae,id,'progress_log');});
          }
        });
      }
    }
    for (const [id,t] of tasks) if (Array.isArray(t.pre)) for (const pre of t.pre) {
      if (!tasks.has(pre)) error('dangling',id+' 的前置编号不存在：'+String(pre),id,'pre');
      else {
        if (pre===id) error('self-cycle',id+' 不能以前置指向自身',id,'pre');
        if (dateOK(tasks.get(pre).date)&&dateOK(t.date)&&tasks.get(pre).date>t.date) error('date-order',pre+'（'+tasks.get(pre).date+'）晚于 '+id+'（'+t.date+'），日期倒挂',id,'pre');
      }
    }
    const visited=new Set(),visiting=new Set(),path=[];
    function visit(id) {
      if (visiting.has(id)) {const start=path.indexOf(id);error('cycle','依赖存在循环：'+path.slice(start).concat(id).join(' → '),id,'pre');return;}
      if (visited.has(id)) return;
      visiting.add(id);path.push(id);
      const t=tasks.get(id);
      for (const pre of (Array.isArray(t.pre)?t.pre:[])) if (tasks.has(pre)&&pre!==id) visit(pre);
      path.pop();visiting.delete(id);visited.add(id);
    }
    for (const id of tasks.keys()) visit(id);
    return errors;
  }
  function deriveSuccessors(board) {
    const out=Object.create(null),tasks=Array.isArray(board&&board.tasks)?board.tasks:[];
    tasks.forEach(t=>{if(obj(t)&&nonempty(t.id))out[t.id]=[]});
    tasks.forEach(t=>{if(obj(t)&&Array.isArray(t.pre))t.pre.forEach(pre=>{if(own(out,pre)&&!out[pre].includes(t.id))out[pre].push(t.id)})});
    return out;
  }
  async function loadBoard() {
    if (new URLSearchParams(location.search).get('preview')==='1') {
      let text;
      try {text=localStorage.getItem(PREVIEW_KEY);} catch(e) {throw new Error('无法读取本地预览，请允许浏览器本地存储后重新预览。');}
      if (!text) throw new Error('没有可用的本地预览，请在管理后台点击“本地预览”。');
      try {return JSON.parse(text);} catch(e) {throw new Error('本地预览数据不是有效 JSON，请重新生成预览。');}
    }
    let response;
    try {response=await fetch('data/board.json',{cache:'no-store'});} catch(e) {throw new Error('无法读取 data/board.json，请通过本地 HTTP 服务或静态网站地址打开。');}
    if (!response.ok) throw new Error('读取 board.json 失败：HTTP '+response.status);
    try {return await response.json();} catch(e) {throw new Error('board.json 不是有效的 JSON 文件。');}
  }
  root.BoardCore=Object.freeze({validate,deriveSuccessors,loadBoard,safeIconMarkup,PREVIEW_KEY,dateOK,logTimeOK,httpsUrlError,imageSrcError,imageAltError,MAX_IMAGES,MAX_ALT});
})(window);
