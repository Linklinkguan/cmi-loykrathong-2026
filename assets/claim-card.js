/* 认领卡片只在本地绘制，不提交表单数据。 */
(function(root){
  'use strict';
  const family='"Card Rounded Subset","Resource Han Rounded CN","PingFang SC","Noto Sans CJK SC",sans-serif';
  let fontPromise;
  function loadFont(){
    if(!fontPromise){
      const face=new FontFace('Card Rounded Subset','url("assets/fonts/card-rounded-bold.woff2?v=10")');
      fontPromise=Promise.race([face.load().then(f=>{document.fonts.add(f);return 'loaded'}).catch(()=> 'fallback'),new Promise(resolve=>setTimeout(()=>resolve('fallback'),6000))]);
    }
    return fontPromise;
  }
  // English runs stay together where possible; CJK characters are independent units.
  function layoutText(ctx,text,maxWidth,maxLines=Infinity){
    const tokens=String(text).match(/\n|[A-Za-z0-9]+(?:[’'_-][A-Za-z0-9]+)*|[^\n]/gu)||[];
    const lines=[];let line='';
    for(const token of tokens){
      if(token==='\n'){lines.push(line.trimEnd());line='';continue}
      const next=line+token;
      if(line&&ctx.measureText(next).width>maxWidth&&!/^[，。、；：？！）》」』】]/u.test(token)){
        lines.push(line.trimEnd());line=token.trimStart();
      }else line=next;
      while(ctx.measureText(line).width>maxWidth&&Array.from(line).length>1&&!/^[，。、；：？！）》」』】]/u.test(token)){
        const chars=Array.from(line);let cut=1;
        while(cut<chars.length&&ctx.measureText(chars.slice(0,cut+1).join('')).width<=maxWidth)cut++;
        lines.push(chars.slice(0,cut).join(''));line=chars.slice(cut).join('');
      }
    }
    if(line||!lines.length)lines.push(line.trimEnd());
    const truncated=lines.length>maxLines;
    const result=lines.slice(0,maxLines);
    if(truncated&&result.length){let chars=Array.from(result.at(-1));while(chars.length&&ctx.measureText(chars.join('')+'…').width>maxWidth)chars.pop();result[result.length-1]=chars.join('').replace(/[，。、；：？！\s]+$/u,'')+'…'}
    return {lines:result,truncated};
  }
  function dateLabel(now,zone){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone||'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now||new Date());
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  }
  function loadLogo(path){return new Promise(resolve=>{if(!path){resolve(null);return}let url;try{url=new URL(path,location.href)}catch(e){resolve(null);return}if(url.origin!==location.origin){resolve(null);return}const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=url.href})}
  function zoneLabel(zone,cfg){
    if(cfg.texts&&cfg.texts.timeZoneLabel)return cfg.texts.timeZoneLabel;
    return ({'Asia/Bangkok':'曼谷时间','Asia/Shanghai':'北京时间','Asia/Tokyo':'东京时间'})[zone||'Asia/Bangkok']||(zone||'');
  }
  // 任务深链：看板地址（配置优先，否则当前页）+ ?task=编号，打开即进入该任务详情。
  function taskUrl(cfg,taskId){
    let u;try{u=new URL(cfg.boardUrl||location.origin+location.pathname,location.href)}catch(e){u=new URL(location.origin+location.pathname)}
    u.searchParams.set('task',taskId);u.hash='';return u.href;
  }
  // 二维码库（MIT，本地文件）按需加载；不调用任何外部服务。
  let qrPromise;
  function loadQr(){
    if(root.qrcode)return Promise.resolve(root.qrcode);
    if(!qrPromise)qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='assets/vendor/qrcode-generator/qrcode.js?v=10.1';s.onload=()=>root.qrcode?resolve(root.qrcode):reject(Error('二维码组件加载失败'));s.onerror=()=>{qrPromise=null;reject(Error('二维码组件加载失败'))};document.head.appendChild(s)});
    return qrPromise;
  }
  function drawQr(ctx,qrcode,text,x,y,size,colors,ecl){
    const qr=qrcode(0,ecl||'M');qr.addData(text);qr.make();
    const n=qr.getModuleCount(),quiet=12,cell=(size-quiet*2)/n;
    ctx.fillStyle='#FFFFFF';ctx.strokeStyle=colors.line;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,size,size,14);ctx.fill();ctx.stroke();
    ctx.fillStyle=colors.ink;
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c)){const x0=Math.round(x+quiet+c*cell),y0=Math.round(y+quiet+r*cell),x1=Math.round(x+quiet+(c+1)*cell),y1=Math.round(y+quiet+(r+1)*cell);ctx.fillRect(x0,y0,x1-x0,y1-y0)}
    return n;
  }
  // 竖版卡片：宽 1080，高度随内容在 1080–1440 之间；留言与页脚固定间距 48。
  // 所有文字用 textBaseline=top 按行高排版；版式只依赖配置与任务数据。
  const W=1080,H_MIN=1080,H_MAX=1440,M=48,PAD=88,CW=W-PAD*2,GAP=48,QR_DEFAULT=220,MIN_MSG=24;
  async function render({board,task,nickname,message,now,privacyFlag,qrSize,qrEcl}){
    const QR=qrSize||QR_DEFAULT,FOOT_PAD=20,FOOT=FOOT_PAD+QR+FOOT_PAD;
    const cfg=BoardCore.claimsConfig(board), colors={paper:'#FFF9F0',surface:'#FFFCF7',ink:'#3A2E25',muted:'#8C7867',brown:'#5A4636',line:'#E9DED0',accent:'#C4553F',green:'#2F8F7E',pending:'#C98A2B',pendingText:'#946116',...board.framework?.colors};
    const [font,logo,qrcode]=await Promise.all([loadFont(),loadLogo(cfg.logo),loadQr()]);
    const url=taskUrl(cfg,task.id);
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H_MAX;let ctx=canvas.getContext('2d');
    const set=(size,color=colors.ink)=>{ctx.font=`bold ${size}px ${family}`;ctx.fillStyle=color};
    const draw=(lines,x,y,step)=>lines.forEach((t,i)=>ctx.fillText(t,x,y+i*step));
    const rule=(y,dash)=>{ctx.save();ctx.strokeStyle=colors.line;ctx.lineWidth=2;if(dash)ctx.setLineDash([10,10]);ctx.beginPath();ctx.moveTo(PAD,y);ctx.lineTo(W-PAD,y);ctx.stroke();ctx.restore()};
    // 第一遍只量版：页眉、任务、申请人高度固定；留言先缩字（40→26）再截断，以最大高度 1440 为上限。
    ctx.textBaseline='top';
    const top=96, logoW=Number.isInteger(cfg.logoWidth)?cfg.logoWidth:150;
    const logoH=logo?Math.round(logo.naturalHeight*logoW/logo.naturalWidth):0, headH=Math.max(logoH,106), textX=logo?PAD+logoW+32:PAD;
    const ruleY=top+headH+28, idY=ruleY+36, titleY=idY+76;
    set(52);const title=layoutText(ctx,task.title,CW,2);
    set(30);const desc=layoutText(ctx,task.description||'',CW,3);
    const descY=titleY+title.lines.length*68+12, boxY=descY+desc.lines.length*44+28, boxH=170, labelY=boxY+boxH+36, msgY=labelY+50;
    const area=H_MAX-M-FOOT-GAP-msgY;let size=40,msg,step;
    for(;size>=MIN_MSG;size-=2){set(size);step=Math.round(size*1.5);msg=layoutText(ctx,message,CW,Math.max(1,Math.floor((area+step-size)/step)));if(!msg.truncated)break}
    if(size<MIN_MSG){size=MIN_MSG;step=Math.round(MIN_MSG*1.5);set(size);msg=layoutText(ctx,message,CW,Math.max(1,Math.floor((area+step-size)/step)))}
    const msgBottom=msgY+(msg.lines.length-1)*step+size;
    const H=Math.min(H_MAX,Math.max(H_MIN,Math.ceil(msgBottom+GAP+FOOT+M)));
    canvas.height=H;ctx=canvas.getContext('2d');ctx.textBaseline='top';
    // 底与卡面
    ctx.fillStyle=colors.paper;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=colors.surface;ctx.strokeStyle=colors.line;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(M,M,W-M*2,H-M*2,36);ctx.fill();ctx.stroke();
    ctx.fillStyle=colors.accent;ctx.beginPath();ctx.roundRect(M,M,W-M*2,14,[36,36,0,0]);ctx.fill();
    // 页眉：Logo（配置宽度，等比缩放，不裁切）+ 活动名 + 卡片标题
    if(logo)ctx.drawImage(logo,PAD,top+(headH-logoH)/2,logoW,logoH);
    const textTop=top+(headH-106)/2;
    set(30,colors.muted);draw(layoutText(ctx,board.meta?.event?.name||board.meta?.title||'',W-PAD-textX,1).lines,textX,textTop,40);
    set(54,colors.brown);draw(layoutText(ctx,cfg.texts.cardTitle,W-PAD-textX,1).lines,textX,textTop+42,64);
    rule(ruleY,true);
    // 任务：编号胶囊 + 状态描边标签 + 标题 ≤2 行 + 简短描述 ≤3 行
    set(30,'#fff');const idw=ctx.measureText(task.id).width+48;ctx.fillStyle=colors.accent;ctx.beginPath();ctx.roundRect(PAD,idY,idw,52,26);ctx.fill();set(30,'#fff');ctx.fillText(task.id,PAD+24,idY+10);
    set(26,colors.pendingText);const tagText=cfg.texts.cardStatus,tagW=ctx.measureText(tagText).width+40,tagX=PAD+idw+16;
    ctx.strokeStyle=colors.pending;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(tagX+1.5,idY+1.5,tagW-3,49,24.5);ctx.stroke();set(26,colors.pendingText);ctx.fillText(tagText,tagX+20,idY+13);
    set(52,colors.ink);draw(title.lines,PAD,titleY,68);
    set(30,colors.muted);draw(desc.lines,PAD,descY,44);
    // 申请人：浅色底板 + 昵称大字（过长缩字）
    ctx.fillStyle=colors.paper;ctx.strokeStyle=colors.line;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(PAD,boxY,CW,boxH,24);ctx.fill();ctx.stroke();
    set(28,colors.muted);ctx.fillText('申请认领人',PAD+32,boxY+26);
    let nick=76;set(nick,colors.brown);while(nick>34&&ctx.measureText(nickname).width>CW-64){nick-=2;set(nick,colors.brown)}
    draw(layoutText(ctx,nickname,CW-64,1).lines,PAD+32,boxY+70+(76-nick)/2,nick);
    // 留言
    set(28,colors.muted);ctx.fillText('留言',PAD,labelY);
    set(size,colors.ink);draw(msg.lines,PAD,msgY,step);
    // 页脚：左侧生成时间与扫码提示，右侧任务详情二维码
    const footTop=H-M-FOOT;rule(footTop);
    const qrX=W-PAD-QR,qrY=footTop+FOOT_PAD,leftW=qrX-PAD-32;
    const qrMid=qrY+QR/2-90;
    set(26,colors.muted);draw(layoutText(ctx,'生成于 '+dateLabel(now,board.meta?.timeZone)+'（'+zoneLabel(board.meta?.timeZone,cfg)+'）',leftW,2).lines,PAD,qrMid+(privacyFlag?30:52),36);
    set(30,colors.brown);draw(layoutText(ctx,cfg.texts.qrHint,leftW,1).lines,PAD,qrMid+(privacyFlag?78:100),40);
    if(privacyFlag&&cfg.texts.cardPrivacyNote){set(24,colors.pendingText);ctx.fillStyle=colors.pending;ctx.beginPath();ctx.arc(PAD+8,qrMid+142,7,0,Math.PI*2);ctx.fill();set(24,colors.pendingText);draw(layoutText(ctx,cfg.texts.cardPrivacyNote,leftW-24,1).lines,PAD+24,qrMid+128,32)}
    const modules=drawQr(ctx,qrcode,url,qrX,qrY,QR,colors,qrEcl);
    Object.assign(canvas.dataset,{font,messageFont:String(size),truncated:msg.truncated?'1':'0',gap:String(Math.round(footTop-msgBottom)),qrModules:String(modules),qrSize:String(QR),privacyNote:privacyFlag?'1':'0',logoWidth:logo?String(logoW):'0'});
    return canvas;
  }
  root.ClaimCard={render,layoutText,loadFont,loadQr,taskUrl,dateLabel,zoneLabel,WIDTH:W,HEIGHT:H_MAX,MIN_HEIGHT:H_MIN};
})(window);
