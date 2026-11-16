'use strict';
const app = document.querySelector('#app');
const headerRight = document.querySelector('#headerRight');
let session = null, state = null, timer = null, mode = 'student', busy = false;
const fmt = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rateText = r => (r > 0 ? '+' : '') + r + '%';
const rateClass = r => r > 0 ? 'up' : r < 0 ? 'down' : 'neutral';
const rounds = () => state?.totalRounds || 5;
function notice(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(notice.timer); notice.timer = setTimeout(() => el.classList.remove('show'), 3500);
}
async function api(route, body = {}) {
  const response = await fetch('/api/' + route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await response.json(); if (!response.ok) throw Error(data.error || '요청 실패'); return data;
}
function credentials() { return session.role === 'teacher' ? {code:session.code, teacherToken:session.teacherToken} : {code:session.code, name:session.name}; }
async function action(route, extra = {}) {
  if (busy) return; busy = true;
  try { state = await api(route, {...credentials(), ...extra}); render(); if (route === 'reveal') openRanking(); } catch (error) { notice(error.message); } finally { busy = false; }
}
function save() { localStorage.setItem('stock-classroom-session', JSON.stringify(session)); }
function logout() { clearInterval(timer); localStorage.removeItem('stock-classroom-session'); location.reload(); }
function exitFooter() { return `<footer class="game-exit-footer"><button type="button" class="game-exit-button" data-exit>나가기</button></footer>`; }
function confirmExit() {
  const message = session?.role === 'teacher'
    ? '방에서 나가면 이 브라우저의 선생님 인증 정보가 삭제되어 기존 게임방을 다시 관리할 수 없어요. 게임방과 학생들의 기록은 서버에 남습니다. 나가시겠어요?'
    : '나가면 입장 화면으로 돌아가요. 투자 기록은 유지되며, 같은 방 코드와 이름으로 다시 입장할 수 있어요. 나가시겠어요?';
  confirmModal(message, logout);
}
function entry() {
  app.innerHTML = `<div class="entry-layout"><section class="hero"><div class="eyebrow">CLASSROOM EXCHANGE</div><h1>뉴스를 읽고,<br><em>나의 투자를 시작해요.</em></h1><p>8개 기업, 5번의 투자 기회.<br>경제뉴스 속 단서를 찾아 나만의 포트폴리오를 만들어 보세요.</p><div class="entry-stats"><div><span>시작 자금</span><b>1,000,000<span>원</span></b></div><div><span>전체 라운드</span><b>5<span>라운드</span></b></div></div><div class="how"><span>01 뉴스 읽기</span><span>02 매수·매도</span><span>03 투자 완료</span><span>04 결과 확인</span></div><p class="hint">실제 돈이 아닌 게임 머니를 사용하는 모의투자 게임입니다.</p></section><section class="entry"><div class="tabs"><button id="studentTab" class="${mode === 'student' ? 'active' : ''}">학생 입장</button><button id="teacherTab" class="${mode === 'teacher' ? 'active' : ''}">선생님 입장</button></div><div id="entryForm">${mode === 'student' ? `<h2>우리 반 투자에 참여하기</h2><p class="muted">선생님이 알려 준 방 코드를 입력해 주세요.</p><form id="join"><label for="code">게임방 코드</label><input id="code" name="code" maxlength="6" placeholder="예: A1B2C3" required autocomplete="off"><label for="name">학생 이름</label><input id="name" name="name" maxlength="20" placeholder="이름을 입력하세요" required autocomplete="off"><button class="btn wide">입장 또는 재접속</button><p class="hint">기존 이름으로 다시 입장하면 투자 기록이 이어집니다.</p></form>` : `<h2>새 게임방 만들기</h2><p class="muted">최대 10명이 함께하는 5라운드 모의투자 수업.</p><button id="create" class="btn wide">게임방 생성하기</button><p class="hint">선생님은 방을 만든 브라우저에서 계속 진행해 주세요.</p>`}</div></section></div>`;
  document.querySelector('#studentTab').onclick = () => { mode = 'student'; entry(); };
  document.querySelector('#teacherTab').onclick = () => { mode = 'teacher'; entry(); };
  const form = document.querySelector('#join');
  if (form) form.onsubmit = async event => {
    event.preventDefault(); const fields = new FormData(form);
    try { const data = await api('join', {code:fields.get('code'), name:fields.get('name')}); session = {role:'student', code:data.code, name:data.name}; state = data.view; save(); render(); poll(); } catch (error) { notice(error.message); }
  };
  const create = document.querySelector('#create');
  if (create) create.onclick = async () => {
    if (busy) return; busy = true;
    try { const data = await api('create'); session = {role:'teacher', code:data.code, teacherToken:data.teacherToken}; state = data.view; save(); render(); poll(); } catch (error) { notice(error.message); } finally { busy = false; }
  };
}
function statusName() { return {lobby:'시작 전', trading:'투자 진행', results:'결과 확인', finished:'게임 종료'}[state.status]; }
function dashboardHeader() {
  return `<section class="dashboard-heading full"><div class="topline"><div><div class="eyebrow">${session.role === 'teacher' ? 'CLASS MANAGEMENT' : 'MY PORTFOLIO'}</div><h1>${session.role === 'teacher' ? '우리 반 투자 현황' : esc(session.name) + '의 투자'}</h1></div><div class="actionrow"><span class="status room-code">방 코드 <b>${esc(state.code)}</b></span><span class="status ${state.status === 'trading' ? 'green' : ''}">${statusName()}</span>${session.role === 'teacher' ? '<button class="btn outline compact" data-exit>나가기</button>' : ''}</div></div><div class="round-progress" aria-label="전체 ${rounds()}라운드 중 ${state.round}라운드">${Array.from({length:rounds()}, (_, i) => `<div class="round-step ${i + 1 === state.round ? 'current' : i + 1 < state.round || state.status === 'finished' ? 'complete' : ''}"><span>${String(i + 1).padStart(2, '0')}</span><b>${i + 1}라운드</b></div>`).join('')}</div></section>`;
}
function news() {
  return `<section class="card full news-card"><div class="section-title"><span class="eyebrow">${state.round ? 'ROUND ' + state.round + ' / ' + rounds() : 'BEFORE THE OPEN'}</span><span class="tag">${state.news.hard ? '심화 뉴스' : state.round ? '경제뉴스' : '시작 전 함께 읽기'}</span></div><div class="news"><h2>${esc(state.news.title)}</h2><p>${esc(state.news.body).replace(/(?<=[.!?])\s+/g, '<br>')}</p></div></section>`;
}
// Shown only before round 1. The cards flow with the page so none covers content while scrolling.
function studentCompanyIntro() {
  return `<section class="card student-company-intro" aria-labelledby="companyIntroTitle">
    <div class="section-title"><div><span class="eyebrow">MEET THE COMPANIES</span><h2 id="companyIntroTitle">8개 기업은 무엇을 팔까요?</h2></div><span class="tag">기업 알아보기</span></div>
    <p class="student-company-intro-lead">각 기업이 판매하는 상품과 서비스를 살펴보세요.</p>
    <div class="student-company-intro-grid">${state.companies.map(company => `<article class="student-company-intro-item"><span class="student-company-intro-icon" aria-hidden="true">${esc(company.icon)}</span><div><h3>${esc(company.name)}</h3><p>${esc(company.description)}</p></div></article>`).join('')}</div>
  </section>`;
}
function priceChange(i) {
  const previous = state.history.length > 1 ? state.history[state.history.length - 2][i] : state.prices[i];
  return {previous, rate:Math.round((state.prices[i] / previous - 1) * 100)};
}
function marketStrip() {
  return `<div class="market-strip full" aria-label="기업별 현재 주가">${state.companies.map((company, i) => `<div class="ticker"><span>${esc(company.name)}</span><b>${fmt(state.prices[i])}</b><small class="${rateClass(priceChange(i).rate)}">${rateText(priceChange(i).rate)}</small></div>`).join('')}</div>`;
}
// Each round changes price once. High/low therefore equal the observed endpoints;
// no random intraround prices or decorative high/low wicks are invented.
function candles(i) {
  return state.history.slice(1).map((row, index) => {
    const open = state.history[index][i], close = row[i];
    return {round:index + 1, open, close, high:Math.max(open, close), low:Math.min(open, close)};
  });
}
function graph(i) {
  const bars = candles(i), base = state.history[0][i];
  const values = [base, ...bars.flatMap(bar => [bar.low, bar.high])];
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * .18, base * .05, 1), minimum = Math.max(0, low - padding), maximum = high + padding;
  const chartLeft = 16, chartRight = 422, chartTop = 20, chartBottom = 254;
  const y = value => chartBottom - (value - minimum) / (maximum - minimum) * (chartBottom - chartTop);
  const slot = (chartRight - chartLeft) / rounds();
  const grid = Array.from({length:5}, (_, j) => {
    const value = minimum + (maximum - minimum) * j / 4, height = y(value);
    return `<line class="chartgrid" x1="${chartLeft}" x2="${chartRight}" y1="${height}" y2="${height}"/><text class="chartlabel" x="434" y="${height + 4}">${Math.round(value).toLocaleString('ko-KR')}</text>`;
  }).join('');
  const slots = Array.from({length:rounds()}, (_, j) => `<line class="chartgrid vertical" x1="${chartLeft + (j + .5) * slot}" x2="${chartLeft + (j + .5) * slot}" y1="${chartTop}" y2="${chartBottom}"/><text class="chartlabel" text-anchor="middle" x="${chartLeft + (j + .5) * slot}" y="280">${j + 1}R</text>`).join('');
  const bodies = bars.map(bar => {
    const x = chartLeft + (bar.round - .5) * slot, bodyY = Math.min(y(bar.open), y(bar.close)), height = Math.abs(y(bar.open) - y(bar.close));
    const label = `${bar.round}라운드, 시작 ${fmt(bar.open)}, 종료 ${fmt(bar.close)}`;
    return `<g class="candle ${rateClass(bar.close - bar.open)}" role="button" tabindex="0" data-candle="${bar.round}" aria-label="${esc(label)}"><title>${esc(label)}</title><rect class="candle-hit" x="${x - slot / 2 + 2}" y="${chartTop}" width="${slot - 4}" height="${chartBottom - chartTop}"/><line class="candle-wick" x1="${x}" x2="${x}" y1="${y(bar.high)}" y2="${y(bar.low)}"/><rect class="candle-body" x="${x - 16}" y="${height < 2 ? bodyY - 1 : bodyY}" width="32" height="${Math.max(2, height)}" rx="1"/></g>`;
  }).join('');
  return `<div class="chart-toolbar"><span class="tag">라운드봉</span><span class="muted">단위: 원 · 시작 / 종료 가격</span></div><svg class="chart" viewBox="0 0 520 300" role="group" aria-label="${esc(state.companies[i].name)} 라운드별 캔들 차트">${grid}${slots}<line class="base-line" x1="${chartLeft}" x2="${chartRight}" y1="${y(base)}" y2="${y(base)}"/>${bodies}${!bars.length ? '<text class="chart-empty" x="220" y="132" text-anchor="middle">1라운드 종료 후 캔들이 표시돼요</text>' : ''}</svg><div class="chart-legend"><span class="up">● 상승</span><span class="down">● 하락</span><span class="neutral">● 유지</span></div><div id="candleDetail" class="candle-detail" aria-live="polite">${bars.length ? candleDetail(bars.at(-1)) : '시작 주가 ' + fmt(base)}</div><p class="hint">봉 하나는 한 라운드입니다. 봉을 누르면 시작·종료 가격을 확인할 수 있어요.</p>`;
}
function candleDetail(bar) {
  const rate = Math.round((bar.close / bar.open - 1) * 100);
  return `<b>${bar.round}라운드</b><span>시작 <strong>${fmt(bar.open)}</strong></span><span>종료 <strong>${fmt(bar.close)}</strong></span><b class="${rateClass(rate)}">${rateText(rate)}</b>`;
}
function openChart(i) {
  const company = state.companies[i], change = priceChange(i);
  modal(`<div class="section-title"><span class="eyebrow">ROUND CANDLE CHART</span><button class="icon-button" id="closeModal" aria-label="차트 닫기">×</button></div><h2>${esc(company.name)}</h2><div class="chart-price ${rateClass(change.rate)}">${fmt(state.prices[i])} <small>${rateText(change.rate)}</small></div>${graph(i)}`, 'chart-modal');
  document.querySelector('#closeModal').onclick = closeModal;
  document.querySelectorAll('[data-candle]').forEach(element => {
    const select = () => { document.querySelector('#candleDetail').innerHTML = candleDetail(candles(i)[Number(element.dataset.candle) - 1]); document.querySelectorAll('[data-candle]').forEach(el => el.classList.toggle('selected', el === element)); };
    element.onclick = select; element.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } };
  });
}
function companyCard(company, i) {
  const owned = state.student?.holdings[i] || 0, change = priceChange(i);
  const canTrade = state.role === 'student' && state.status === 'trading' && !state.student.done;
  return `<article class="company"><div class="company-heading"><span class="company-icon">${company.icon}</span><div><h3>${esc(company.name)}</h3><span class="company-code">${esc(company.id.toUpperCase())}</span></div><span class="price-indicator ${rateClass(change.rate)}">${change.rate > 0 ? '▲' : change.rate < 0 ? '▼' : '–'}</span></div><p class="desc">${esc(company.description)}</p><div class="price ${rateClass(change.rate)}">${fmt(state.prices[i])}</div><div class="price-comparison ${rateClass(change.rate)}">${state.history.length > 1 ? rateText(change.rate) + ' · 직전 라운드 대비' : '시작 주가'}</div>${state.role === 'student' ? `<div class="hold"><span>보유 <b>${owned}주</b></span><span>평가액 <b>${fmt(owned * state.prices[i])}</b></span></div>` : ''}<div class="tradebuttons">${state.role === 'student' ? `<button class="btn buy" data-trade="buy" data-id="${company.id}" ${!canTrade ? 'disabled' : ''}>매수</button><button class="btn sell" data-trade="sell" data-id="${company.id}" ${!canTrade ? 'disabled' : ''}>매도</button>` : ''}<button class="btn outline" data-chart="${i}">그래프</button></div></article>`;
}
function market() { return `<section class="card market-card"><div class="section-title"><h2>종목 시세</h2><span class="muted">8개 기업</span></div><p class="hint">기업 소개와 뉴스를 함께 읽고 투자해 보세요.</p><div class="gridcompanies">${state.companies.map(companyCard).join('')}</div></section>`; }
function teacherSidebar() {
  return `<nav class="teacher-sidebar" aria-label="선생님 메뉴">
    <div class="sidebar-menu">
      <button class="sidebar-link active" data-scroll="teacher-progress"><span aria-hidden="true">▷</span> 게임 진행</button>
      <button class="sidebar-link" data-scroll="teacher-market"><span aria-hidden="true">▥</span> 기업 정보</button>
      <button class="sidebar-link" data-scroll="teacher-members"><span aria-hidden="true">♟</span> 참가자 관리</button>
    </div>
    <button class="sidebar-link sidebar-exit" data-exit><span aria-hidden="true">⇥</span> 방 나가기</button>
  </nav>`;
}
function teacherProgress() {
  const current = state.status === 'lobby' ? 0 : state.round;
  return `<section class="teacher-progress card" id="teacher-progress"><h2>진행 상황</h2><div class="timeline" aria-label="5라운드 진행 상황">
  ${Array.from({length:rounds()+1},(_,i)=>{
    const done = state.status === 'finished' || i < current || (i === current && state.status === 'results');
    const active = i === current && !done;
    return `<div class="timeline-item ${done?'done':''} ${active?'active':''}"><span class="timeline-dot">${done?'✓':i===0?'▶':i+'R'}</span><small>${i===0?'설명':i+'라운드'}</small></div>`;
  }).join('')}</div></section>`;
}
function teacherNews() {
  if (state.status === 'lobby') {
    return `<section class="teacher-news teacher-intro-news card" id="teacher-intro-news" aria-label="1라운드 시작 전 설명용 경제뉴스">
      <div class="section-title"><h2>📰 시작 전 경제뉴스</h2><span class="tag">설명용 뉴스 · 1개</span></div>
      <div class="intro-guide"><strong>선생님 설명 시간</strong><span>아직 1라운드가 시작되지 않았어요. 학생들과 아래 뉴스를 읽고 이야기를 나눈 뒤 시작해 주세요.</span></div>
      <div class="teacher-news-body"><div class="news-illustration" aria-hidden="true">📰</div><div><h3>${esc(state.news.title)}</h3><p>${esc(state.news.body).replace(/(?<=[.!?])\s+/g,'<br>')}</p></div></div>
      <p class="intro-footnote">뉴스 설명을 마쳤다면 오른쪽의 <b>‘1라운드 시작’</b> 버튼을 눌러 주세요.</p>
    </section>`;
  }
  return `<section class="teacher-news card"><div class="section-title"><h2>이번 라운드 뉴스</h2><span class="tag">${state.news.hard?'심화 뉴스':'경제뉴스'}</span></div>
    <div class="teacher-news-body"><div class="news-illustration" aria-hidden="true">📰</div><div><h3>${esc(state.news.title)}</h3><p>${esc(state.news.body).replace(/(?<=[.!?])\s+/g,'<br>')}</p></div></div></section>`;
}
function miniChart(i) {
  const values=state.history.map(h=>h[i]);
  const min=Math.min(...values), max=Math.max(...values), range=Math.max(max-min,1);
  const points=values.map((n,j)=>`${6+j*(90/Math.max(values.length-1,1))},${31-(n-min)/range*25}`).join(' ');
  const change=priceChange(i).rate;
  return `<svg class="mini-chart ${rateClass(change)}" viewBox="0 0 102 36" aria-hidden="true"><line x1="3" x2="99" y1="33" y2="33" stroke="#edf1f6"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function teacherMarket() {
  return `<section class="teacher-market card" id="teacher-market"><div class="section-title"><h2>기업별 주가 현황</h2><span class="tag">8개 기업</span></div><div class="teacher-table-wrap"><table class="teacher-table"><thead><tr><th>기업</th><th>현재 주가</th><th>전 라운드 대비</th><th>변동률</th><th>차트</th><th>그래프</th></tr></thead><tbody>
    ${state.companies.map((c,i)=>{const change=priceChange(i), diff=state.prices[i]-change.previous;return `<tr><th scope="row"><span class="stock-name"><span class="stock-icon">${c.icon}</span><span>${esc(c.name)}</span></span></th><td class="stock-number">${fmt(state.prices[i])}</td><td class="${rateClass(diff)} stock-number">${diff>0?'+':''}${diff.toLocaleString('ko-KR')}원</td><td class="${rateClass(change.rate)} stock-number">${rateText(change.rate)}</td><td>${miniChart(i)}</td><td><button class="table-chart-btn" data-chart="${i}" aria-label="${esc(c.name)} 캔들 차트 보기">그래프</button></td></tr>`}).join('')}
    </tbody></table></div></section>`;
}
// Final student report: teacher-style company prices and the fifth-round explanations.
// No ranking or classmates' investment information is sent to this view.
function studentFinalReport() {
  const companyCards = state.companies.map((company, i) => {
    const change = priceChange(i);
    const diff = state.prices[i] - change.previous;
    return `<article class="final-stock-item">
      <div class="final-stock-name"><span class="stock-icon" aria-hidden="true">${esc(company.icon)}</span><h3>${esc(company.name)}</h3></div>
      <div class="final-stock-price">${fmt(state.prices[i])}</div>
      <div class="final-stock-change ${rateClass(change.rate)}">전 라운드 대비 ${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}원 <b>(${rateText(change.rate)})</b></div>
      <div class="final-stock-bottom">${miniChart(i)}<button class="table-chart-btn" data-chart="${i}" aria-label="${esc(company.name)} 캔들 차트 보기">그래프</button></div>
    </article>`;
  }).join('');
  return `<div class="student-final-report">
    <section class="final-complete" role="status"><span class="eyebrow">CLASSROOM STOCK EXCHANGE · FINAL REPORT</span><h1>모든 라운드가 완료되었습니다.</h1><p>5라운드까지의 기업별 주가 변화와 마지막 라운드 투자 결과를 확인해 보세요.</p></section>
    <div class="final-market-section">${teacherMarket()}<div class="final-mobile-market" aria-label="기업별 주가 현황">${companyCards}</div></div>
    <div class="final-results-section">${results()}</div>
    ${exitFooter()}
  </div>`;
}
function teacherStatus() {
  const members=state.members;
  return `<aside class="teacher-sidepanel"><section class="teacher-round-card card"><h2>${state.status === 'lobby' ? '시작 전 · 설명 시간' : `라운드 ${state.round} / ${rounds()}`}</h2><div class="round-card-body"><div class="round-current"><span>현재 단계</span><strong>${statusName()}</strong></div><p>${state.status==='trading'?"모든 학생이 '투자 완료'를 누르면 라운드 종료가 가능합니다.":state.status==='lobby'?'설명용 경제뉴스를 학생들과 읽은 다음 1라운드를 시작해 주세요.':state.status==='results'?'이번 라운드의 결과를 확인하고 다음 라운드를 시작해 주세요.':'모든 라운드가 종료되었습니다.'}</p></div></section>
  <section class="teacher-members card" id="teacher-members"><h2>투자 완료 현황 <span>(${state.completed} / ${members.length})</span></h2><div class="teacher-member-list">${members.map(m=>`<div class="teacher-member"><span>${esc(m.name)}</span><span class="${m.done?'done-text':'pending-text'}">${m.done?'● 완료':'● 진행 중'}</span></div>`).join('')||'<p class="hint">아직 입장한 학생이 없어요.</p>'}</div></section>
  <div class="teacher-controls">${state.status==='lobby'?'<button class="teacher-main-action" data-act="start">1라운드 시작</button>':''}${state.status==='trading'?`<button class="teacher-main-action" data-act="end" ${state.completed!==members.length?'disabled':''}>라운드 종료</button><small>모든 학생 완료 시 활성화</small>`:''}${state.status==='results'?'<button class="teacher-main-action" data-act="next">다음 라운드 시작</button><button class="teacher-rank-action" data-act="reveal">🏆 순위 확인</button>':''}${state.status==='finished'?'<button class="teacher-rank-action" data-act="reveal">🏆 최종 순위 확인</button>':''}${state.status==='lobby'||state.status==='trading'?'<button class="teacher-rank-action" data-ranking-preview="1">🏆 순위 확인</button>':''}</div></aside>`;
}
function teacherWorkspace() {
  return `<div class="teacher-workspace">${teacherSidebar()}<div class="teacher-main">${teacherProgress()}${teacherNews()}${teacherMarket()}${results()}</div>${teacherStatus()}${exitFooter()}</div>`;
}
function results() {
  if (!state.results) return '';
  return `<section class="card full"><div class="section-title"><h2>${state.round}라운드 투자 결과</h2><span class="tag">기업별 해설</span></div><p class="hint">뉴스가 주가의 방향과 변동 폭에 어떤 영향을 주었는지 확인하세요.</p><div class="result-grid">${state.results.map(result => `<article class="result-item"><div class="row"><b>${esc(result.name)}</b><strong class="${rateClass(result.rate)}">${rateText(result.rate)}</strong></div><div class="small muted result-price">${fmt(result.old)} → ${fmt(result.next)}</div><p><b>${esc(result.direction)} 이유</b><br>${esc(result.cause)}</p><p><b>변동 폭의 이유</b><br>${esc(result.magnitude)}</p></article>`).join('')}</div></section>`;
}
function openRanking() {
  if (state.role !== 'teacher') return;
  const ranking = state.ranking;
  if (!ranking) return;
  const title = state.status === 'finished' ? '최종 순위 확인' : '순위 확인';
  const rows = ranking.map(row => {
    const profitRate = (row.assets / 1000000 - 1) * 100;
    const rate = Math.abs(profitRate) < .05 ? 0 : profitRate;
    const medal = ({1:'🥇',2:'🥈',3:'🥉'})[row.rank];
    return `<tr><td><span class="rank-medal" aria-label="${row.rank}위">${medal || row.rank}</span></td><th scope="row">${esc(row.name)}</th><td class="ranking-assets"><b>₩${Number(row.assets).toLocaleString('ko-KR')}</b><span class="${rateClass(rate)}">(${rate > 0 ? '+' : ''}${rate.toFixed(1)}%)</span></td></tr>`;
  }).join('');
  modal(`<div class="ranking-heading"><h2 id="rankingTitle"><span aria-hidden="true">🏆</span> ${title} <small>(라운드 ${state.round} 기준)</small></h2><button class="icon-button" id="closeRanking" aria-label="순위 창 닫기">×</button></div><p class="hint ranking-privacy">선생님만 확인할 수 있는 순위입니다.</p><div class="ranking-list"><table class="ranking-table" aria-labelledby="rankingTitle"><thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">총자산</th></tr></thead><tbody>${rows || '<tr><td colspan="3">참가 학생이 없어요.</td></tr>'}</tbody></table></div>`, 'ranking-modal');
  document.querySelector('#closeRanking').onclick = closeModal;
}

function teacherPanel() {
  const members = state.members;
  return `<aside class="card account-card"><div class="section-title"><h2>라운드 관리</h2><span class="tag">${state.round}/${rounds()}</span></div><div class="statrow"><div><span class="muted">참가 학생</span><strong>${members.length}<small> / 10명</small></strong></div><div><span class="muted">투자 완료</span><strong>${state.completed}<small> / ${members.length}명</small></strong></div></div><hr class="line">${members.map(member => `<div class="member"><span>${esc(member.name)}</span><span class="status ${member.done ? 'green' : ''}">${member.done ? '완료' : '대기'}</span></div>`).join('') || '<p class="empty">학생 입장을 기다리고 있어요.</p>'}${state.status === 'lobby' ? '<button class="btn wide" data-act="start">1라운드 시작</button>' : ''}${state.status === 'trading' ? `<button class="btn wide" data-act="end" ${state.completed !== members.length ? 'disabled' : ''}>라운드 종료</button><p class="hint">모든 학생이 투자 완료하면 종료할 수 있어요.</p>` : ''}${state.status === 'results' ? '<button class="btn wide" data-act="next">다음 라운드 시작</button><button class="btn outline wide" data-act="reveal">현재 순위 확인</button>' : ''}${state.status === 'finished' ? '<button class="btn wide" data-act="reveal">최종 순위 확인</button>' : ''}</aside>`;
}
function studentPanel() {
  const student = state.student, stocks = student.holdings.reduce((sum, count, i) => sum + count * state.prices[i], 0), assets = student.cash + stocks;
  const profit = assets - 1000000, rate = Math.round(profit / 10000 * 100) / 100;
  return `<aside class="card account-card"><div class="section-title"><h2>내 투자 자산</h2><span class="tag">게임 머니</span></div><div class="muted">총자산</div><div class="bigmoney">${fmt(assets)}</div><div class="asset-return ${rateClass(profit)}">${profit > 0 ? '+' : ''}${fmt(profit)} <b>(${rateText(rate)})</b></div><hr class="line"><div class="balance-row"><span>사용 가능한 현금</span><b>${fmt(student.cash)}</b></div><div class="balance-row"><span>보유 주식 평가액</span><b>${fmt(stocks)}</b></div>${state.status === 'trading' ? !student.done ? '<button class="btn wide" id="done">투자 완료</button><p class="hint">라운드 종료 전까지 완료를 취소하고 다시 거래할 수 있어요.</p>' : '<div class="wait"><span class="status green">투자 완료</span><p>선생님의 라운드 종료를 기다려 주세요.</p><button class="btn outline wide" id="undone">투자 완료 취소</button></div>' : `<div class="wait"><span class="status">${statusName()}</span></div>`}<hr class="line"><h3>최근 거래</h3><div class="history">${student.transactions.slice().reverse().map(transaction => `<div class="transaction"><div><b>${esc(state.companies.find(c => c.id === transaction.company)?.name || '')}</b><span>${transaction.round}R · <em class="${transaction.side === 'buy' ? 'up' : 'down'}">${transaction.side === 'buy' ? '매수' : '매도'} ${transaction.quantity}주</em></span></div><b>${fmt(transaction.price * transaction.quantity)}</b></div>`).join('') || '<p class="empty">아직 거래 기록이 없어요.</p>'}</div></aside>`;
}
function render() {
  if (!session || !state) return entry();
  const studentFinished = state.role === 'student' && state.status === 'finished';
  document.body.classList.toggle('student-finished', studentFinished);
  if (studentFinished) {
    closeModal();
    headerRight.innerHTML = '';
    app.innerHTML = studentFinalReport();
    document.querySelectorAll('[data-chart]').forEach(element => element.onclick = () => openChart(Number(element.dataset.chart)));
    return;
  }
  document.body.classList.toggle('teacher-view', session.role === 'teacher');
  document.body.classList.toggle('student-view', session.role === 'student');
  document.querySelector('.brand b').textContent = session.role === 'teacher' ? '모의주식투자 게임 (선생님 화면)' : '모의주식투자 게임';
  document.querySelector('.brand small').textContent = session.role === 'teacher' ? 'CLASSROOM STOCK EXCHANGE' : '우리 반 모의주식투자';
  headerRight.innerHTML = session.role === 'teacher' ? `<span class="top-room">방 코드: <b>${esc(state.code)}</b></span><span class="top-players">참여 학생 ${state.members.length} / 10명</span><button class="room-info-btn" id="roomInfo">방 정보</button>` : `<span class="top-room">방 코드: <b>${esc(state.code)}</b></span><span class="header-label">학생 화면</span>`;
  if (session.role === 'student' && state.status === 'lobby') {
    app.innerHTML = `<div class="student-lobby-screen"><div class="student-lobby-heading"><span class="eyebrow">수업 시작 전 · 설명 시간</span><h1>경제뉴스를 함께 읽어요</h1><p>선생님의 설명을 듣고 1라운드가 시작될 때까지 기다려 주세요.</p><span class="status room-code">방 코드 <b>${esc(state.code)}</b></span></div>${news()}<div class="student-lobby-wait" role="status">⏳ 선생님이 1라운드를 시작하면 투자 화면이 열려요.</div>${studentCompanyIntro()}${exitFooter()}</div>`;
    return;
  }
  app.innerHTML = session.role === 'teacher' ? teacherWorkspace() : `<div class="dashboard">${dashboardHeader()}${marketStrip()}${news()}${state.status === 'lobby' ? `<section class="card full lobby"><div><h2>우리 반 투자 준비 중</h2><p>학생들은 방 코드를 입력해 입장해 주세요.<br><span class="hint">신규 입장은 1라운드 시작 전까지 가능해요.</span></p></div><b class="code">${esc(state.code)}</b></section>` : ''}${market()}${studentPanel()}${results()}${exitFooter()}</div>`;
  const info = document.querySelector('#roomInfo'); if (info) info.onclick = () => { modal(`<div class="section-title"><h2>게임방 정보</h2><button class="icon-button" id="closeInfo" aria-label="닫기">×</button></div><p>방 코드 <strong class="info-code">${esc(state.code)}</strong></p><p>참여 학생: ${state.members.length} / 10명</p><p>진행: ${state.round} / ${rounds()}라운드</p><p>학생들에게 방 코드를 알려 주세요.</p>`); document.querySelector('#closeInfo').onclick=closeModal; };
  document.querySelectorAll('[data-scroll]').forEach(el=>el.onclick=()=>{document.querySelectorAll('.sidebar-link').forEach(x=>x.classList.remove('active'));el.classList.add('active');document.querySelector('#'+el.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});});
  const rankPreview = document.querySelector('[data-ranking-preview]'); if(rankPreview) rankPreview.onclick=()=>notice('라운드 종료 후 순위를 확인할 수 있어요.');
  document.querySelectorAll('[data-act]').forEach(element => element.onclick = () => {
    const route = element.dataset.act, messages = {end:'모든 거래를 마감하고 주가를 변경할까요?', next:'다음 라운드를 시작할까요?'};
    if (messages[route]) confirmModal(messages[route], () => action(route)); else action(route);
  });
  document.querySelectorAll('[data-trade]').forEach(element => element.onclick = () => tradeModal(element.dataset.trade, element.dataset.id));
  document.querySelectorAll('[data-chart]').forEach(element => element.onclick = () => openChart(Number(element.dataset.chart)));
  const done = document.querySelector('#done'); if (done) done.onclick = () => confirmModal('투자를 완료할까요? 선생님이 라운드를 종료하기 전까지 취소할 수 있어요.', () => action('done'));
  const undone = document.querySelector('#undone'); if (undone) undone.onclick = () => action('undone');
}
app.addEventListener('click', event => { if (event.target.closest('[data-exit]')) confirmExit(); });
let returnFocus = null;
function modal(html, className = '') {
  closeModal(); returnFocus = document.activeElement;
  const element = document.createElement('div'); element.className = 'overlay'; element.id = 'overlay';
  element.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${className === 'chart-modal' ? '캔들 차트' : className === 'ranking-modal' ? '투자 순위' : '거래 확인'}" tabindex="-1">${html}</div>`;
  element.onclick = event => { if (event.target === element) closeModal(); }; document.body.appendChild(element);
  document.body.classList.add('modal-open'); element.querySelector('.modal').focus();
}
function closeModal() { document.querySelector('#overlay')?.remove(); document.body.classList.remove('modal-open'); if (returnFocus?.isConnected) returnFocus.focus(); returnFocus = null; }
document.addEventListener('keydown', event => {
  const dialog = document.querySelector('.modal'); if (!dialog) return;
  if (event.key === 'Escape') closeModal();
  if (event.key === 'Tab') {
    const elements = [...dialog.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')];
    if (!elements.length) return;
    if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === dialog)) { event.preventDefault(); elements.at(-1).focus(); }
    else if (!event.shiftKey && (document.activeElement === elements.at(-1) || document.activeElement === dialog)) { event.preventDefault(); elements[0].focus(); }
  }
});
function confirmModal(message, callback) {
  modal(`<h2>확인해 주세요</h2><p>${esc(message)}</p><div class="actionrow"><button class="btn outline" id="cancelModal">취소</button><button class="btn" id="confirmModal">확인</button></div>`);
  document.querySelector('#cancelModal').onclick = closeModal; document.querySelector('#confirmModal').onclick = () => { closeModal(); callback(); };
}
function tradeModal(side, id) {
  const i = state.companies.findIndex(c => c.id === id), company = state.companies[i];
  const maximum = side === 'buy' ? Math.floor(state.student.cash / state.prices[i]) : state.student.holdings[i], label = side === 'buy' ? '매수' : '매도';
  modal(`<span class="eyebrow">${side === 'buy' ? 'BUY ORDER' : 'SELL ORDER'}</span><h2>${esc(company.name)} ${label}</h2><p>현재 주가 <b>${fmt(state.prices[i])}</b><br>최대 ${maximum}주 ${label} 가능</p><form id="tradeForm"><label for="qty">거래 수량 (주)</label><input id="qty" type="number" min="1" max="${maximum}" step="1" required value="1"><p id="tradeCost">거래 금액: ${fmt(state.prices[i])}</p><div class="actionrow"><button type="button" class="btn outline" id="cancelModal">취소</button><button class="btn ${side === 'buy' ? 'buy' : 'sell'}" ${maximum < 1 ? 'disabled' : ''}>${label} 확인</button></div></form>`);
  document.querySelector('#cancelModal').onclick = closeModal;
  document.querySelector('#qty').oninput = event => document.querySelector('#tradeCost').textContent = '거래 금액: ' + fmt((Number(event.target.value) || 0) * state.prices[i]);
  document.querySelector('#tradeForm').onsubmit = async event => {
    event.preventDefault(); const quantity = Number(document.querySelector('#qty').value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximum) return notice('거래 수량을 확인해 주세요.');
    closeModal(); const txid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
    await action('trade', {side, company:id, quantity, txid});
  };
}
async function refresh() {
  if (!session || busy) return;
  try { const data = await api('state', credentials()); if (JSON.stringify(data) !== JSON.stringify(state)) { if (document.querySelector('#overlay') && !(data.role === 'student' && data.status === 'finished')) return; state = data; render(); } }
  catch (error) { if (/인증|등록되지|찾을 수/.test(error.message)) { clearInterval(timer); notice('다시 입장해 주세요.'); session = null; state = null; localStorage.removeItem('stock-classroom-session'); entry(); } }
}
function poll() { clearInterval(timer); timer = setInterval(refresh, 2500); }
(async () => { try { session = JSON.parse(localStorage.getItem('stock-classroom-session') || 'null'); if (session) { state = await api('state', credentials()); render(); poll(); } else entry(); } catch { session = null; localStorage.removeItem('stock-classroom-session'); entry(); } })();
