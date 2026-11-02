(() => {
      const root=document.getElementById('red-two-home');
      const defaults=['阿薛','小陈','老张','阿林','老王'];
      let names=defaults.slice(),view='home',mask=0,fans=0,rounds=[],opening=[0,0,0,0,0],earlier=0,notice='',historyLimit=20,revision=0;
      let sessionId=null,startedAt=null,sessions=[],selectedId=null,ending=false,saveError='';
      let rewards=[0,0,0,0,0],redOwner=-1,rewardSeat=-1;
      const STORAGE_KEY='hong-er-ledger-v1',PREVIOUS_KEY=STORAGE_KEY+'-previous',IMPORT_KEY=STORAGE_KEY+'-before-import',MAX_BYTES=1000000;
      let persistedText=null,goodText=null,storageBlocked=false,pendingImport=null;
      const screens=['home','score','overview','history','players','sessions','summary'];
      function ids(bits) { return [0,1,2,3,4].filter(i=>bits&(1<<i)); }
      function validRewards(value) { return Array.isArray(value)&&value.length===5&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=6); }
      function validOwner(value) { return Number.isInteger(value)&&value>=-1&&value<5; }
      function rewardScores(tiers,owner=-1) {
        if(!validRewards(tiers)||!validOwner(owner))throw new RangeError('无效的奖励');
        const payments=tiers.map((tier,i)=>[0,20,30,50,100,500,1000][tier]+(i===owner?30:0)),sum=payments.reduce((a,b)=>a+b,0);
        return payments.map(n=>n*5-sum);
      }
      function rewardLabels(tiers,owner,labels) {
        const lines=tiers.flatMap((tier,i)=>tier?[labels[i]+' '+(tier+6)+'同 +'+[0,80,120,200,400,2000,4000][tier]]:[]);
        if(owner>=0)lines.push(labels[owner]+' 三红二 +120');
        return lines;
      }
      function validRound(round) {
        if(!Array.isArray(round)||![3,5].includes(round.length)||!round.slice(0,3).every(Number.isInteger))return false;
        const [bits,fan,count]=round;
        if(round.length===5&&(!validOwner(round[3])||!validRewards(round[4])))return false;
        if(round.length===5&&round[3]>=0)return count===0?bits===0&&fan===0:bits>0&&bits<31&&fan>=0&&fan<=5&&count===1&&(bits===1<<round[3]||bits===(31^(1<<round[3])));
        return bits>0&&bits<31&&fan>=0&&fan<=5&&count>=1&&count<=Math.min(3,5-ids(bits).length);
      }
      function handScores(round) {
        if(!validRound(round))throw new RangeError('无效的本局结果');
        if(round.length===5&&round[3]>=0){
          if(round[2]===0)return [0,0,0,0,0];
          const owner=round[3];
          if(round[0]===1<<owner){const loss=Math.min(12*2**round[1],300);return [0,1,2,3,4].map(i=>i===owner?loss*4:-loss);}
          const loss=Math.min(3*2**round[1],80);return [0,1,2,3,4].map(i=>i===owner?-loss*4:loss);
        }
        const [bits,fan,count]=round,winners=ids(bits),loss=Math.min(3*count*2**fan,80);
        const pool=loss*(5-winners.length),base=Math.floor(pool/winners.length),remainder=pool%winners.length;
        return [0,1,2,3,4].map(i=>bits&(1<<i)?base+(winners.indexOf(i)<remainder?1:0):-loss);
      }
      function bonusScores(round) { return round.length===5?rewardScores(round[4],round[3]):[0,0,0,0,0]; }
      function calculate(round) { const hand=handScores(round),bonus=bonusScores(round);return hand.map((n,i)=>n+bonus[i]); }
      function makeRound(count,bits=mask) {
        if(redOwner>=0)return [bits,count===0?0:fans,count===0?0:1,redOwner,rewards.slice()];
        return rewards.some(Boolean)?[bits,fans,count,-1,rewards.slice()]:[bits,fans,count];
      }
      function clearDraft() { mask=0;fans=0;rewards=[0,0,0,0,0];redOwner=-1;rewardSeat=-1; }
      function hasDraft() { return !!(mask||fans||redOwner>=0||rewards.some(Boolean)); }
      function format(points,signed=false) { return points<0?'−'+Math.abs(points):points>0&&signed?'+'+points:String(points); }
      function sumRows(base,rows) { return rows.reduce((sum,row)=>calculate(row).map((n,i)=>n+sum[i]),base.slice()); }
      function total() { return sumRows(opening,rounds); }
      function validNames(value) { return Array.isArray(value)&&value.length===5&&value.every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=8)&&new Set(value.map(n=>n.trim())).size===5; }
      function receipt(round,index) {
        return '第 '+index+' 局已记';
      }
      function snapshot() { return {version:5,revision,names,view,mask,fans,rewards,redOwner,notice,rounds,opening,earlier,sessionId,startedAt,sessions,selectedId}; }
      function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
      function save() {
        revision++;
        try {
          if(storageBlocked)throw new Error('记录读取失败，请先恢复备份，避免覆盖原记录。');
          if(localStorage.getItem(STORAGE_KEY)!==persistedText)throw new Error('另一页面已更新记录。请重新打开 App，本页没有覆盖它。');
          const text=JSON.stringify(snapshot());
          if(bytes(snapshot())>MAX_BYTES)throw new Error('记录容量已满，请先保存备份；已有牌局完整保留。');
          if(goodText!==null)localStorage.setItem(PREVIOUS_KEY,goodText);
          localStorage.setItem(STORAGE_KEY,text);
          persistedText=goodText=text;saveError='';return true;
        } catch(error) {
          saveError=error.name==='QuotaExceededError'?'设备存储不足，这次操作未入账。请先保存备份，腾出空间后重试。':error.name==='SecurityError'?'无法保存，请退出无痕浏览并用 Safari 重新打开。':error.message;
          return false;
        }
      }
      function migrateOpening(units) {
        const points=units.map(n=>n/12),integers=points.map(Math.floor),remainder=-integers.reduce((a,b)=>a+b,0);
        const order=[0,1,2,3,4].sort((a,b)=>(points[b]-integers[b])-(points[a]-integers[a])||a-b);
        for(let i=0;i<remainder;i++)integers[order[i]]++;
        return integers;
      }
      function validRecord(value) {
        return value&&Array.isArray(value.rounds)&&value.rounds.every(validRound)&&Array.isArray(value.opening)&&value.opening.length===5&&value.opening.every(Number.isSafeInteger)&&value.opening.reduce((a,b)=>a+b,0)===0&&Number.isSafeInteger(value.earlier)&&value.earlier>=0&&sumRows(value.opening,value.rounds).every(Number.isSafeInteger);
      }
      function validTime(value) { return Number.isSafeInteger(value)&&value>0&&value<=8640000000000000; }
      function validId(value) { return typeof value==='string'&&/^[a-z0-9-]{1,64}$/.test(value); }
      function validSession(value) { return validRecord(value)&&validNames(value.names)&&validId(value.id)&&validTime(value.endedAt)&&(value.startedAt===null||validTime(value.startedAt)&&value.startedAt<=value.endedAt)&&value.earlier+value.rounds.length>0; }
      function validState(value) {
        if(!value||![2,3,4,5].includes(value.version)||bytes(value)>MAX_BYTES||!validRecord(value)||value.version<4&&value.rounds.length>1000)return false;
        if(value.version>=4&&(!validNames(value.names)||!Array.isArray(value.sessions)||!value.sessions.every(validSession)||new Set(value.sessions.map(s=>s.id)).size!==value.sessions.length))return false;
        if(value.version>=4&&(!(value.sessionId===null||validId(value.sessionId))||!(value.startedAt===null||validTime(value.startedAt))||value.sessions.some(s=>s.id===value.sessionId)||!value.sessionId&&(value.rounds.length||value.earlier||value.mask||value.fans||value.startedAt||value.opening.some(Boolean))))return false;
        if(value.version===5&&(!validRewards(value.rewards)||!validOwner(value.redOwner)||!value.sessionId&&(value.redOwner>=0||value.rewards.some(Boolean))||value.redOwner>=0&&value.mask!==0&&value.mask!==1<<value.redOwner&&value.mask!==(31^(1<<value.redOwner))))return false;
        return true;
      }
      function restore(value) {
        if(!validState(value))return false;
        const incomingRevision=Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0;
        if(incomingRevision<revision)return false;
        revision=incomingRevision;
        names=validNames(value.names)?value.names.map(n=>n.trim()):defaults.slice();
        view=value.view==='rewards'?'score':value.version>=3&&screens.includes(value.view)?value.view:'home';
        mask=Number.isInteger(value.mask)&&value.mask>=0&&value.mask<31?value.mask:0;
        fans=Number.isInteger(value.fans)&&value.fans>=0&&value.fans<=5?value.fans:0;
        rounds=JSON.parse(JSON.stringify(value.rounds));opening=value.version===2?migrateOpening(value.opening):value.opening.slice();earlier=value.earlier;
        notice=value.version>=3&&typeof value.notice==='string'?value.notice.slice(0,300):rounds.length?receipt(rounds[rounds.length-1],earlier+rounds.length):'';
        rewards=value.version===5?value.rewards.slice():[0,0,0,0,0];redOwner=value.version===5?value.redOwner:-1;
        sessions=value.version>=4?JSON.parse(JSON.stringify(value.sessions)):[];
        sessionId=value.version>=4?value.sessionId:earlier+rounds.length||mask||fans?'legacy-session':null;
        startedAt=value.version>=4?value.startedAt:null;
        selectedId=value.version>=4&&sessions.some(s=>s.id===value.selectedId)?value.selectedId:null;
        if(view==='summary'&&!selectedId)view='sessions';
        if(view==='score'&&!sessionId)view='home';
        if(view!=='score')rewardSeat=-1;ending=false;return true;
      }
      function change(action) {
        const before=JSON.parse(JSON.stringify(snapshot())),seat=rewardSeat;action();
        if(!save()){revision=before.revision;restore(before);rewardSeat=seat;render();return false;}
        render();return true;
      }
      function begin() {
        if(sessionId)return true;
        return change(()=>{startedAt=Date.now();sessionId=startedAt.toString(36)+'-'+Math.random().toString(36).slice(2,8);selectedId=null;view='score';notice='';});
      }
      function finish(discard=false) {
        if(!sessionId||!earlier&&!rounds.length)return false;
        if(hasDraft()&&!discard){ending=true;render();return false;}
        return change(()=>{
          sessions.unshift({id:sessionId,names:names.slice(),startedAt,endedAt:Date.now(),rounds:JSON.parse(JSON.stringify(rounds)),opening:opening.slice(),earlier});
          selectedId=sessionId;sessionId=null;startedAt=null;rounds=[];opening=[0,0,0,0,0];earlier=0;clearDraft();notice='';ending=false;view='summary';historyLimit=20;
        });
      }
      function reopen() {
        if(sessionId||!selectedId||sessions[0]?.id!==selectedId)return false;
        return change(()=>{
          const last=sessions.shift();names=last.names.slice();sessionId=last.id;startedAt=last.startedAt;rounds=JSON.parse(JSON.stringify(last.rounds));opening=last.opening.slice();earlier=last.earlier;
          selectedId=null;clearDraft();view='score';notice='已撤销结束，可以继续记分。';
        });
      }
      function reviewing() { return sessions.find(s=>s.id===selectedId)||null; }
      function dateLabel(time,withTime=false) {
        if(time===null)return '开始时间未记录';
        return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',...(withTime?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(time);
      }
      function go(next) {
        if(!screens.includes(next))return;
        if(next==='score'&&!begin())return;
        if(next==='overview'){selectedId=null;if(!sessionId&&sessions.length){selectedId=sessions[0].id;next='summary';}}
        if(['home','players','sessions','score'].includes(next))selectedId=null;
        ending=false;rewardSeat=-1;historyLimit=20;
        view=next;
        if(next==='players')root.querySelectorAll('[data-name-fields] input').forEach((input,i)=>input.value=names[i]);
        root.querySelector('[data-name-error]').textContent='';save();render();
      }
      function commit(count,bits=mask) {
        if(rewardSeat>=0)return false;
        const round=makeRound(count,bits);if(!sessionId||view!=='score'||!validRound(round))return false;
        return change(()=>{rounds.push(round);notice=receipt(round,earlier+rounds.length);clearDraft();});
      }
      function commitSide(won) { return redOwner<0?false:commit(1,won?1<<redOwner:31^(1<<redOwner)); }
      function commitDraw() { return redOwner<0?false:commit(0,0); }
      function setReward(choice) {
        if(!sessionId||view!=='score'||rewardSeat<0||rewardSeat>4||!Number.isInteger(choice)||choice<0||choice>7)return false;
        const seat=rewardSeat;
        return change(()=>{
          if(choice===7){redOwner=redOwner===seat?-1:seat;mask=0;}
          else {rewards[seat]=choice===rewards[seat]?0:choice;if(choice===0&&redOwner===seat){redOwner=-1;mask=0;}}
          rewardSeat=-1;notice='';
        });
      }
      function undo() {
        if(!sessionId||view!=='score'||!rounds.length)return false;
        return change(()=>{const round=rounds.pop();[mask,fans]=round;redOwner=round.length===5?round[3]:-1;rewards=round.length===5?round[4].slice():[0,0,0,0,0];rewardSeat=-1;notice='已撤销';});
      }
      function renderHistory() {
        const record=reviewing()||{names,rounds,opening,earlier},rows=record.rounds,labels=record.names;
        const list=root.querySelector('[data-history]');list.replaceChildren();
        root.querySelector('[data-history-back-label]').textContent=selectedId?'返回结算':'返回总览';
        root.querySelector('[data-history-meta]').textContent=(selectedId?dateLabel(record.endedAt)+' · ':'')+'共 '+(record.earlier+rows.length)+' 局'+(record.earlier?' · 早期 '+record.earlier+' 局仅有累计分':'');
        [...rows].reverse().slice(0,historyLimit).forEach((round,index)=>{
          const article=document.createElement('article');article.className='ra-round-card';
          const head=document.createElement('div');head.className='ra-between';
          const title=document.createElement('h3');title.textContent='第 '+(record.earlier+rows.length-index)+' 局';
          const special=round.length===5&&round[3]>=0,draw=round[0]===0;
          const result=special?'三红二 · '+(draw?'和局':round[0]===1<<round[3]?'抓四家':'输四家'):'抓'+['','一','两','三'][round[2]]+'家';
          const meta=document.createElement('span');meta.className='ra-meta';meta.textContent=result+(draw?'':' · '+(round[1]===5?'5番以上':round[1]+'番'));head.append(title,meta);
          const winners=document.createElement('p');winners.className='ra-round-winners';winners.textContent=draw?labels[round[3]]+' · 仅计奖励':'牌局赢家：'+ids(round[0]).map(i=>labels[i]).join('、');
          const scores=document.createElement('div');scores.className='ra-round-scores';calculate(round).forEach((points,i)=>{const item=document.createElement('span'),name=document.createElement('span'),number=document.createElement('b');name.textContent=labels[i];number.textContent=format(points,true);item.append(name,number);scores.append(item);});
          article.append(head,winners,scores);list.append(article);
          if(round.length===5){
            const reward=document.createElement('p');reward.className='ra-round-winners';reward.textContent='奖励：'+rewardLabels(round[4],round[3],labels).join('；');article.append(reward);
            const details=document.createElement('details');details.className='ra-breakdown';const summary=document.createElement('summary');summary.textContent='查看牌局 / 奖励拆分';details.append(summary);
            const table=document.createElement('table'),thead=document.createElement('thead'),header=document.createElement('tr');['玩家','牌局','奖励'].forEach(text=>{const th=document.createElement('th');th.scope='col';th.textContent=text;header.append(th);});thead.append(header);table.append(thead);
            const tbody=document.createElement('tbody'),hand=handScores(round),bonus=bonusScores(round);labels.forEach((label,i)=>{const row=document.createElement('tr');[label,format(hand[i],true),format(bonus[i],true)].forEach(text=>{const cell=document.createElement('td');cell.textContent=text;row.append(cell);});tbody.append(row);});table.append(tbody);details.append(table);article.append(details);
          }
        });
        if(!rows.length){const empty=document.createElement('p');empty.className='ra-empty';empty.textContent=record.earlier?'早期记录仅保留累计分。':'还没记第一局，记完会自动出现在这里。';list.append(empty);}
        root.querySelector('[data-more]').hidden=historyLimit>=rows.length;
      }
      function renderBoard(selector,labels,scores) {
        const board=root.querySelector(selector);board.replaceChildren();labels.forEach((name,i)=>{const row=document.createElement('div');row.className='ra-board-row';const label=document.createElement('span');label.className='ra-board-name';label.textContent=name;const number=document.createElement('span');number.className='ra-board-score'+(scores[i]>0?' ra-positive':'');number.textContent=format(scores[i],true);row.append(label,number);board.append(row);});
      }
      function renderSessions() {
        const list=root.querySelector('[data-sessions]');list.replaceChildren();
        root.querySelector('[data-sessions-meta]').textContent=sessions.length?sessions.length+' 场':'暂无';
        sessions.forEach(session=>{
          const button=document.createElement('button');button.type='button';button.className='ra-session cursor-interaction';
          const text=document.createElement('span'),date=document.createElement('strong'),meta=document.createElement('small'),icon=document.createElement('i');
          date.textContent=dateLabel(session.endedAt,true);meta.textContent=(session.earlier+session.rounds.length)+' 局 · '+session.names.join('、');
          icon.dataset.lucide='chevron-right';icon.setAttribute('aria-hidden','true');text.append(date,meta);button.append(text,icon);
          button.addEventListener('click',()=>{selectedId=session.id;go('summary');});list.append(button);
        });
        if(!sessions.length){const empty=document.createElement('p');empty.className='ra-empty';empty.textContent='暂无记录';list.append(empty);}
        if(globalThis.lucide)lucide.createIcons({attrs:{width:18,height:18}});
      }
      function renderSummary() {
        const session=reviewing();if(!session)return;
        root.querySelector('[data-summary-date]').textContent=dateLabel(session.endedAt,true)+' 结束';
        root.querySelector('[data-summary-meta]').textContent=(session.earlier+session.rounds.length)+' 局';
        renderBoard('[data-summary-board]',session.names,sumRows(session.opening,session.rounds));
        root.querySelector('[data-new-session]').textContent=sessionId?'继续本场':'新开一场';
        root.querySelector('[data-reopen]').hidden=!!sessionId||sessions[0]?.id!==selectedId;
      }
      function render() {
        const scores=total(),current=earlier+rounds.length,winners=ids(mask),loserCount=5-winners.length;
        root.querySelectorAll('[data-screen]').forEach(screen=>screen.hidden=screen.dataset.screen!==view);
        const active=['history','summary'].includes(view)?'overview':['players','sessions'].includes(view)?'home':view;
        root.querySelectorAll('[data-tab]').forEach(button=>{if(button.dataset.tab===active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
        root.querySelector('.ra-phone').dataset.current=view;
        root.querySelector('[data-save-error]').hidden=!saveError;root.querySelector('[data-save-message]').textContent=saveError;
        root.querySelector('[data-header]').textContent=view==='score'?'第 '+(current+1)+' 局':['summary','sessions'].includes(view)||view==='history'&&selectedId?'牌局回顾':'5 人局';
        root.querySelector('#ra-home-title').textContent=sessionId?'本场':'开一桌';
        root.querySelector('[data-home-meta]').textContent=sessionId?current+' 局':'5 人';
        root.querySelector('[data-start]').textContent=sessionId?'继续':'开一场';
        root.querySelector('[data-sessions-count]').textContent=sessions.length?sessions.length+' 场':'暂无';
        const special=redOwner>=0,picking=rewardSeat>=0;
        root.querySelector('#ra-score-title').textContent=special?'三红二':'普通局';
        root.querySelector('[data-score-mode]').textContent=special?names[redOwner]+' · 1 打 4':'选赢家';
        root.querySelector('[data-result-note]').textContent=special?'含奖励净分':'点即记账';
        root.querySelector('[data-picker-title]').textContent=picking?names[rewardSeat]+' · 奖励':'';
        const picker=root.querySelector('[data-reward-picker]');
        if(picking&&!picker.open)picker.showModal();else if(!picking&&picker.open)picker.close();
        root.querySelectorAll('[data-reward-choice]').forEach(button=>{const choice=Number(button.dataset.rewardChoice),selected=picking&&(choice===7?redOwner===rewardSeat:rewards[rewardSeat]===choice);if(choice===0)button.removeAttribute('aria-pressed');else button.setAttribute('aria-pressed',String(selected));});
        root.querySelectorAll('[data-reward-trigger]').forEach(button=>{const i=Number(button.dataset.rewardTrigger),labels=[];if(rewards[i])labels.push((rewards[i]+6)+'同');if(redOwner===i)labels.push('三红二');button.textContent=labels.join(' · ')||'＋奖励';button.dataset.filled=String(!!labels.length);button.setAttribute('aria-label',names[i]+'奖励'+(labels.length?'，'+labels.join('、'):''));button.setAttribute('aria-expanded',String(rewardSeat===i));});
        root.querySelector('[data-normal-outcomes]').hidden=special;root.querySelector('[data-special-outcome]').hidden=!special;
        root.querySelectorAll('[data-side]').forEach(button=>{button.disabled=!special||picking;if(special){const draw=button.dataset.side==='draw',won=button.dataset.side==='owner',bits=draw?0:won?1<<redOwner:31^(1<<redOwner),points=calculate(makeRound(draw?0:1,bits))[redOwner],label=draw?'和局':won?'抓四家':'输四家';button.querySelector('small').textContent=format(points,true);button.setAttribute('aria-label',names[redOwner]+label+'，含奖励净计分'+format(points,true)+'，直接记分');}});
        const members=root.querySelector('[data-members]');members.replaceChildren();names.forEach(name=>{const item=document.createElement('div');item.className='ra-member';const avatar=document.createElement('span');avatar.className='ra-avatar';avatar.textContent=name.slice(-1);avatar.setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='ra-member-name';label.textContent=name;item.append(avatar,label);members.append(item);});
        root.querySelectorAll('[data-person]').forEach(button=>{const i=Number(button.dataset.person),picked=!special&&!!(mask&(1<<i));button.disabled=special||picking;button.setAttribute('aria-pressed',String(picked));button.setAttribute('aria-label',names[i]+'，累计'+format(scores[i])+'分'+(special?'':'，'+(picked?'已选赢家':'选择为赢家')));button.querySelector('.ra-person-name').textContent=names[i];button.querySelector('.ra-person-score').textContent=format(scores[i],true);});
        root.querySelectorAll('[data-fan]').forEach(button=>{button.disabled=picking;button.setAttribute('aria-pressed',String(Number(button.dataset.fan)===fans));});
        root.querySelectorAll('[data-count]').forEach(button=>{const count=Number(button.dataset.count),allowed=winners.length>0&&count<=loserCount,loss=Math.min(3*count*2**fans,80);button.disabled=!allowed||picking;button.querySelector('small').textContent=allowed?'−'+loss:'';button.setAttribute('aria-label','抓'+['','一','两','三'][count]+'家'+(allowed?'，牌局输家每人扣'+loss+'分，直接记分':''));});
        const savedMatch=notice.match(/^第\s*(\d+)\s*局已记/);
        root.querySelector('[data-status]').textContent=savedMatch?'第 '+savedMatch[1]+' 局已记':notice.includes('撤销')?'已撤销':notice;
        root.querySelector('[data-undo]').disabled=!rounds.length;
        root.querySelector('[data-overview-meta]').textContent=current+' 局';
        renderBoard('[data-board]',names,scores);
        const imbalance=scores.reduce((a,b)=>a+b,0);root.querySelector('[data-balance]').hidden=!imbalance;root.querySelector('[data-balance]').textContent='合计差 '+format(imbalance);
        root.querySelector('[data-finish]').disabled=!current;root.querySelector('[data-finish]').hidden=ending;
        root.querySelector('[data-finish-confirm]').hidden=!ending;
        if(view==='sessions')renderSessions();
        if(view==='summary')renderSummary();
        if(view==='history')renderHistory();
      }
      for(let i=0;i<5;i++){
        const player=document.createElement('div');player.className='ra-player';
        const button=document.createElement('button');button.type='button';button.className='ra-person cursor-interaction';button.dataset.person=i;button.innerHTML='<span class="ra-person-name"></span><span class="ra-person-score">0</span>';
        button.addEventListener('click',()=>{const next=mask^(1<<i);if(next===31){notice='留一位输家';render();return;}change(()=>{mask=next;notice='';});});player.append(button);
        const rewardButton=document.createElement('button');rewardButton.type='button';rewardButton.className='ra-reward-trigger cursor-interaction';rewardButton.dataset.rewardTrigger=i;rewardButton.setAttribute('aria-controls','ra-reward-picker');
        rewardButton.addEventListener('click',()=>{rewardSeat=rewardSeat===i?-1:i;render();if(rewardSeat>=0)root.querySelector('[data-reward-choice="'+(rewards[i]||1)+'"]').focus();});player.append(rewardButton);root.querySelector('[data-people]').append(player);
        const label=document.createElement('label');label.textContent='第 '+(i+1)+' 位';const input=document.createElement('input');input.name='player-'+i;input.maxLength=8;input.required=true;input.value=names[i];input.autocomplete='off';label.append(input);root.querySelector('[data-name-fields]').append(label);
      }
      for(const choice of [1,2,3,4,5,6,7,0]){const button=document.createElement('button');button.type='button';button.className='cursor-interaction';button.dataset.rewardChoice=choice;button.textContent=choice===7?'三红二':choice===0?'清除':(choice+6)+'同';button.addEventListener('click',()=>{const seat=rewardSeat;if(setReward(choice))root.querySelector('[data-reward-trigger="'+seat+'"]').focus();});root.querySelector('[data-reward-options]').append(button);}
      function closeReward() { const seat=rewardSeat;rewardSeat=-1;render();if(seat>=0)root.querySelector('[data-reward-trigger="'+seat+'"]').focus(); }
      root.querySelector('[data-picker-close]').addEventListener('click',closeReward);
      root.querySelector('[data-reward-picker]').addEventListener('cancel',event=>{event.preventDefault();closeReward();});
      root.querySelector('[data-reward-picker]').addEventListener('close',()=>{if(rewardSeat>=0)closeReward();});
      for(let fan=0;fan<=5;fan++){const button=document.createElement('button');button.type='button';button.className='ra-fan cursor-interaction';button.dataset.fan=fan;button.textContent=fan===5?'5+':fan+'番';button.setAttribute('aria-label',fan===5?'5番及以上':fan+'番');button.addEventListener('click',()=>change(()=>{fans=fan;notice='';}));root.querySelector('[data-fans]').append(button);}
      for(let count=1;count<=3;count++){const button=document.createElement('button');button.type='button';button.className='ra-outcome cursor-interaction';button.dataset.count=count;button.innerHTML='<strong>抓'+['','一','两','三'][count]+'家</strong><small>先选赢家</small>';button.addEventListener('click',()=>commit(count));root.querySelector('[data-outcomes]').append(button);}
      root.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.go)));
      root.querySelector('[data-undo]').addEventListener('click',undo);
      root.querySelectorAll('[data-side]').forEach(button=>button.addEventListener('click',()=>button.dataset.side==='draw'?commitDraw():commitSide(button.dataset.side==='owner')));
      root.querySelector('[data-finish]').addEventListener('click',()=>finish());
      root.querySelector('[data-discard-finish]').addEventListener('click',()=>finish(true));
      root.querySelector('[data-reopen]').addEventListener('click',reopen);
      root.querySelector('[data-history-back]').addEventListener('click',()=>go(selectedId?'summary':'overview'));
      root.querySelector('[data-retry]').addEventListener('click',()=>{save();render();});
      root.querySelector('[data-more]').addEventListener('click',()=>{historyLimit+=20;renderHistory();});
      function saveNames() {
        const value=[...root.querySelectorAll('[data-name-fields] input')].map(input=>input.value.trim());
        if(!validNames(value)){root.querySelector('[data-name-error]').textContent='请填 5 个不重复的昵称，每个 1～8 个字。';return;}
        change(()=>{names=value;notice=rounds.length?receipt(rounds[rounds.length-1],earlier+rounds.length):'';view='home';});
      }
      root.querySelector('[data-save-names]').addEventListener('click',saveNames);
      root.querySelector('[data-name-form]').addEventListener('submit',event=>{event.preventDefault();saveNames();});
      root.querySelector('[data-name-form]').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();saveNames();}});
      function decodeBackup(text) {
        if(new TextEncoder().encode(text).length>MAX_BYTES+1000)throw new Error('备份文件过大，无法恢复。');
        const content=JSON.parse(text),value=content.app==='hong-er'&&content.format===1?content.state:content.privateContent||content;
        if(!validState(value))throw new Error('这份备份无效，原记录没有改动。');
        return value;
      }
      function loadLedger() {
        try {
          persistedText=localStorage.getItem(STORAGE_KEY);
          const candidates=[persistedText,localStorage.getItem(PREVIOUS_KEY)];
          for(let i=0;i<candidates.length;i++)if(candidates[i]!==null){
            try {const value=decodeBackup(candidates[i]);if(restore(value)){goodText=JSON.stringify(snapshot());if(i)saveError='已从上一份存档恢复，请保存一份备份。';return true;}}catch{}
          }
          if(candidates.some(text=>text!==null)){storageBlocked=true;saveError='存档读取失败，原文件已保留。请在首页恢复备份。';}
        }catch{storageBlocked=true;saveError='无法读取设备存储，请退出无痕浏览并用 Safari 重新打开。';}
        return false;
      }
      function backupText() { return JSON.stringify({app:'hong-er',format:1,exportedAt:new Date().toISOString(),state:snapshot()}); }
      async function exportBackup() {
        const button=root.querySelector('[data-export]'),message=root.querySelector('[data-tools-message]');button.disabled=true;message.textContent='';
        try {
          const file=new File([backupText()],'红二记分-'+new Date().toISOString().slice(0,10)+'.json',{type:'application/json'});
          if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'红二记分备份'});
          else {const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
          message.textContent='备份已交给系统，请保存到“文件”或 iCloud。';
        }catch(error){if(error.name!=='AbortError')message.textContent='备份未导出，请重试。';}finally{button.disabled=false;}
      }
      function applyBackup(value,remember=true) {
        if(!validState(value))return false;
        const before=JSON.parse(JSON.stringify(snapshot())),oldSeat=rewardSeat,blocked=storageBlocked;
        let priorImport=null,remembered=false;
        try {
          if(localStorage.getItem(STORAGE_KEY)!==persistedText)throw new Error('另一页面已更新记录，请重新打开 App 后恢复。');
          if(remember){priorImport=localStorage.getItem(IMPORT_KEY);localStorage.setItem(IMPORT_KEY,JSON.stringify(before));remembered=true;}
          const incoming=JSON.parse(JSON.stringify(value));incoming.revision=revision+1;
          if(!restore(incoming))throw new Error('备份读取失败。');
          rewardSeat=-1;storageBlocked=false;
          if(!save())throw new Error(saveError);
          root.querySelectorAll('[data-name-fields] input').forEach((input,i)=>input.value=names[i]);render();return true;
        }catch(error){
          if(remembered)try{if(priorImport===null)localStorage.removeItem(IMPORT_KEY);else localStorage.setItem(IMPORT_KEY,priorImport);}catch{}
          revision=before.revision;restore(before);rewardSeat=oldSeat;storageBlocked=blocked;saveError=error.message;render();return false;
        }
      }
      const tools=root.querySelector('[data-tools]'),importDialog=root.querySelector('[data-import-confirm]');
      root.querySelector('[data-tools-open]').addEventListener('click',()=>{
        root.querySelector('[data-tools-message]').textContent='';
        try{root.querySelector('[data-import-undo]').hidden=localStorage.getItem(IMPORT_KEY)===null;}catch{root.querySelector('[data-import-undo]').hidden=true;}
        root.querySelector('[data-install]').hidden=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
        tools.showModal();
      });
      root.querySelectorAll('[data-dialog-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
      root.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{const box=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))dialog.close();}));
      root.querySelector('[data-export]').addEventListener('click',exportBackup);
      root.querySelector('[data-import-open]').addEventListener('click',()=>root.querySelector('[data-import-file]').click());
      root.querySelector('[data-import-file]').addEventListener('change',async event=>{
        const file=event.target.files[0];event.target.value='';if(!file)return;
        try {
          if(file.size>MAX_BYTES+1000)throw new Error('备份文件过大，无法恢复。');
          pendingImport={value:decodeBackup(await file.text()),undo:false};
          const value=pendingImport.value;
          root.querySelector('[data-import-title]').textContent='恢复这份备份？';
          root.querySelector('[data-import-meta]').textContent=(value.sessions?.length||0)+' 场历史 · 本场 '+(value.earlier+value.rounds.length)+' 局';
          tools.close();importDialog.showModal();
        }catch(error){root.querySelector('[data-tools-message]').textContent=error instanceof SyntaxError?'文件格式不正确，原记录没有改动。':error.message;}
      });
      root.querySelector('[data-import-undo]').addEventListener('click',()=>{
        try {
          pendingImport={value:decodeBackup(localStorage.getItem(IMPORT_KEY)||''),undo:true};
          root.querySelector('[data-import-title]').textContent='撤销上次恢复？';
          root.querySelector('[data-import-meta]').textContent='回到恢复备份之前的记录。';tools.close();importDialog.showModal();
        }catch{root.querySelector('[data-tools-message]').textContent='无法读取恢复前的记录，请选择备份文件。';}
      });
      root.querySelector('[data-import-apply]').addEventListener('click',()=>{
        if(pendingImport&&applyBackup(pendingImport.value,!pendingImport.undo)){pendingImport=null;importDialog.close();}
        else {importDialog.close();tools.showModal();root.querySelector('[data-tools-message]').textContent=saveError;}
      });
      window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&event.newValue!==persistedText){saveError='另一页面已更新记录。请重新打开 App，本页没有覆盖它。';render();}});
      // shortcut: 记录只存在本设备；跨设备同步有需要时再接云端，现通过备份迁移。
      navigator.storage?.persist?.().catch(()=>{});
      if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{root.querySelector('[data-storage-note]').textContent='记录已保存在本机。离线安装未完成，请联网重开一次；重要牌局请另存备份。';}));
      loadLedger();
      if(view==='players')root.querySelectorAll('[data-name-fields] input').forEach((input,i)=>input.value=names[i]);
      render();
      if(globalThis.lucide)lucide.createIcons({attrs:{width:20,height:20}});
    })();
