/* 费用数据：共享校验、读取与仅对已填写金额求和。 */
(function(root){
'use strict';
const PREVIEW_KEY='cmi-expenses-preview-v4',DRAFT_KEY='cmi-expenses-draft-v4';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const empty=v=>v===''||v===null;
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowBangkok=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,23)+'+07:00';
function timestamp(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+07:00$/.test(v)||!BoardCore.dateOK(v.slice(0,10)))return false;return Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60&&Number.isFinite(Date.parse(v))}
function validate(data,board){
 const errors=[],error=(code,message,id,field)=>errors.push({code,message,id,field});
 if(!obj(data))return [{code:'shape',message:'费用数据必须是对象'}];
 if(data.version!==1)error('version','费用数据 version 必须为 1');
 if(!obj(data.meta))error('shape','费用 meta 必须是对象');else{
  if(!nonempty(data.meta.title))error('required','费用标题不能为空');
  if(!timestamp(data.meta.updatedAt))error('date','费用更新时间须为曼谷时间（+07:00）');
  if(data.meta.timeZone!=='Asia/Bangkok')error('date','费用时区须为 Asia/Bangkok');
  if(data.meta.currency!=='THB')error('currency','费用币种须为 THB（泰铢）');
 }
 if(!obj(data.config)){error('shape','费用 config 必须是对象');return errors}
 const maps={};
 for(const kind of ['categories','statuses','payers']){
  maps[kind]=new Map();
  if(!Array.isArray(data.config[kind])){error('shape',kind+' 必须是数组');continue}
  for(const entry of data.config[kind]){
   if(!obj(entry)){error('shape',kind+' 配置条目必须是对象');continue}
   if(!nonempty(entry.id)||!nonempty(entry.name))error('required',kind+' 的编号与名称不能为空');
   if(maps[kind].has(entry.id))error('duplicate',kind+' 编号重复：'+entry.id);
   maps[kind].set(entry.id,entry);
   if(!/^#[0-9a-f]{6}$/i.test(entry.color))error('color',kind+' '+entry.id+' 颜色须为 #RRGGBB');
   if(own(entry,'aliases')&&(!Array.isArray(entry.aliases)||entry.aliases.some(v=>!nonempty(v))||new Set(entry.aliases).size!==entry.aliases.length))error('shape',kind+' '+entry.id+' 别名须为不重复的非空字符串数组');
  }
 }
 if(!Array.isArray(data.expenses)){error('shape','expenses 必须是数组');return errors}
 const ids=new Set(),taskIds=new Set((board?.tasks||[]).map(t=>t.id));
 for(const row of data.expenses){
  if(!obj(row)){error('shape','费用条目必须是对象');continue}
  const id=row.id||'（无编号）';
  if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(row.id||''))error('id','费用编号须以字母开头，仅用字母、数字、下划线或连字符：'+id,id,'id');
  if(ids.has(row.id))error('duplicate','费用编号重复：'+id,id,'id');ids.add(row.id);
  if(!nonempty(row.item))error('required',id+' 物品／改动不能为空，资料不足填待补充',id,'item');
  for(const key of ['purpose','quantity','unit','place','source','notes'])if(typeof row[key]!=='string')error('shape',id+' '+key+' 必须为字符串',id,key);
  for(const [field,kind] of [['category','categories'],['status','statuses']])if(!maps[kind].has(row[field]))error('reference',id+' '+field+' 配置不存在：'+row[field],id,field);
  if(row.payer!==''&&!maps.payers.has(row.payer))error('reference',id+' 付款人不存在：'+row.payer,id,'payer');
  for(const key of ['budgetUnitPrice','budgetSubtotal','actual']){
   const v=row[key],allowQuote=key!=='actual';
   if(!numeric(v)&&!empty(v)&&!(allowQuote&&v==='待报价'))error('amount',id+' '+({budgetUnitPrice:'预算单价',budgetSubtotal:'预算小计',actual:'实际花费'}[key])+' 须为非负数字或空'+(allowQuote?'，也可保留待报价':''),id,key);
  }
  if(!Array.isArray(row.taskIds)||row.taskIds.some(v=>!nonempty(v)))error('shape',id+' 关联任务须为编号数组',id,'taskIds');else{
   if(new Set(row.taskIds).size!==row.taskIds.length)error('duplicate',id+' 关联任务编号重复',id,'taskIds');
   for(const ref of row.taskIds)if(!taskIds.has(ref))error('reference',id+' 关联任务不存在：'+ref,id,'taskIds');
  }
  if(row.date!==''&&row.date!=='待定'&&!BoardCore.dateOK(row.date))error('date',id+' 日期须为 YYYY-MM-DD、待定或空',id,'date');
  if(!timestamp(row.updatedAt))error('date',id+' 最后修改时间须为曼谷时间（+07:00）',id,'updatedAt');
  if(own(row,'sourceRow')&&(!obj(row.sourceRow)||Object.values(row.sourceRow).some(v=>typeof v!=='string')))error('shape',id+' 原始行必须是字符串字段对象',id,'sourceRow');
 }
 return errors;
}
async function loadExpenses(){
 if(new URLSearchParams(location.search).get('expenses-preview')==='1'){
  let text;try{text=localStorage.getItem(PREVIEW_KEY)}catch(e){throw new Error('无法读取费用本地预览，请允许浏览器本地存储。')}
  if(!text)throw new Error('没有费用本地预览，请在后台费用页重新点击本地预览。');
  try{return JSON.parse(text)}catch(e){throw new Error('费用本地预览不是有效 JSON。')}
 }
 let response;try{response=await fetch('data/expenses.json',{cache:'no-store'})}catch(e){throw new Error('无法读取费用数据，请通过静态 HTTP 服务打开。')}
 if(!response.ok)throw new Error('读取 expenses.json 失败：HTTP '+response.status);
 try{return await response.json()}catch(e){throw new Error('expenses.json 不是有效 JSON。')}
}
// 用十进制定点求和，避免 0.1 + 0.2 的二进制浮点尾差；不以空值填零。
function decimalParts(value){
 const [mantissa,exponent='0']=String(value).toLowerCase().split('e');const [integer,fraction='']=mantissa.split('.');
 let digits=BigInt(integer+fraction),scale=fraction.length-Number(exponent);
 if(scale<0){digits*=10n**BigInt(-scale);scale=0}return {digits,scale};
}
function amountSummary(rows,key){
 const values=rows.map(row=>row[key]).filter(numeric),parts=values.map(decimalParts),scale=Math.max(0,...parts.map(p=>p.scale));
 const sum=parts.reduce((n,p)=>n+p.digits*10n**BigInt(scale-p.scale),0n);
 const text=sum.toString().padStart(scale+1,'0');
 const total=values.length?Number(scale?text.slice(0,-scale)+'.'+text.slice(-scale):text):null;
 return {total,count:values.length,missing:rows.length-values.length};
}
function summarize(rows,data){
 const make=items=>({count:items.length,budget:amountSummary(items,'budgetSubtotal'),actual:amountSummary(items,'actual')});
 const groups=(field,config)=>{const ids=[...new Set(rows.map(row=>row[field]))];return ids.map(id=>({id,name:config.find(c=>c.id===id)?.name||(id||'未指定付款人'),...make(rows.filter(row=>row[field]===id))}))};
 return {...make(rows),byPayer:groups('payer',data.config.payers),byCategory:groups('category',data.config.categories)};
}
function money(value){if(value==='待报价')return '待报价';if(!numeric(value))return '未填写';return new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:20}).format(value)}
root.ExpensesCore=Object.freeze({PREVIEW_KEY,DRAFT_KEY,validate,loadExpenses,summarize,money,nowBangkok,escapeHTML});
})(window);
