import {
  addDays,
  chinaDateTime, formatDateTime,  formatDuration,
  timePart,
} from './lib/datetime'
import { getAnchor } from './lib/map'
import { resolveWeekendFriday, searchReachableDestinations, summarizeProvinces } from './lib/search'
import type { RailLeg, RailSnapshot, ReachabilityResult, SearchInput } from './types'
const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('缺少 #app 根节点')

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="周末开往首页">
      <span class="brand__mark"><i></i><i></i><i></i></span>
      <span><b>周末开往</b><small>WEEKEND RAIL</small></span>
    </a>
    <div class="header-note"><span class="live-dot"></span> 定期更新的时刻表快照</div>
  </header>

  <main>
    <section class="hero-copy">
      <p class="eyebrow">FRIDAY OR SATURDAY OUT · SUNDAY BACK</p>      <h1>下班以后，<br><em>北京能开往哪里？</em></h1>
      <p class="hero-copy__intro">只需选择星期和时间。系统会自动采用最近可用的周末，查看直达 G / C / D 车次，并找到周日尽可能晚的返京方案。</p>    </section>

    <form class="search-panel" id="search-form">
      <label class="field">
        <span>出发星期</span>
        <select id="departure-weekday" name="departureWeekday" required>
          <option value="friday">周五</option>
          <option value="saturday">周六</option>
        </select>
      </label>
      <label class="field">
        <span>最早出发</span>
        <input id="departure-time" name="departureTime" type="time" value="18:00" required>
      </label>
      <label class="field">
        <span>最晚抵京星期</span>
        <select id="arrival-weekday" name="arrivalWeekday" required>
          <option value="sunday">周日</option>
          <option value="monday" selected>周一</option>
        </select>
      </label>
      <label class="field">
        <span>最晚抵京时间</span>
        <input id="arrival-time" name="arrivalTime" type="time" value="08:30" required>
      </label>      <label class="field">
        <span>最长单程</span>
        <select id="max-duration" name="maxDuration">
          <option value="">不限</option>
          <option value="180">3 小时</option>
          <option value="300">5 小时</option>
          <option value="480">8 小时</option>
          <option value="720">12 小时</option>
        </select>
      </label>
      <details class="station-picker">
        <summary><span>北京车站</span><b id="station-summary">全部车站</b></summary>
        <div class="station-picker__menu" id="station-options"></div>
      </details>
      <button class="search-button" type="submit"><span>开始计算</span><b>→</b></button>
    </form>
    <p id="schedule-note" class="schedule-note" hidden></p>
    <div id="notice" class="notice" hidden></div>

    <section class="workspace" aria-live="polite">
      <div class="map-card">
        <div class="section-heading">
          <div><span>01 / 可达范围</span><h2>周末目的地地图</h2></div>
          <button class="text-button" id="clear-province" type="button" hidden>显示全部</button>
        </div>
        <div class="map-stats" id="map-stats"></div>
        <div class="map-stage" id="map-stage">
          <img class="standard-map" src="${import.meta.env.BASE_URL}map/china-standard-map-gs2023-2767.jpg" alt="中华人民共和国标准地图，审图号 GS(2023)2767号">
          <div class="map-stage__grid" aria-hidden="true"></div>
          <div class="map-stage__labels" aria-hidden="true"><span>西北</span><span>东北</span><span>西南</span><span>东南</span></div>
          <svg class="route-layer" id="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div id="province-bubbles"></div>
          <div class="beijing-origin" style="--x:72;--y:35"><span></span>北京</div>
          <div class="map-legend"><span><i></i>停留较短</span><span><i></i>停留较长</span></div>
          <p class="map-caption">底图审图号 GS(2023)2767号 · 连线不代表真实铁路走向</p>
        </div>
      </div>

      <aside class="result-panel">
        <div class="section-heading section-heading--results">
          <div><span>02 / 行程排行</span><h2 id="result-title">正在读取快照</h2></div>
          <span class="result-count" id="result-count">—</span>
        </div>
        <div class="result-list" id="result-list">
          <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
        </div>
      </aside>
    </section>
  </main>

  <footer>
    <div><b>周末开往</b><p>一张帮你把周末拉长一点的铁路时刻表。</p></div>
    <div class="footer-meta">
      <p>车次数据：<a href="https://railgo.dev" target="_blank" rel="noreferrer">RailGo</a> · 仅限个人非商业展示</p>
      <p>数据时间：<time id="generated-at">—</time></p>
      <p>地图来源：<a href="http://bzdt.ch.mnr.gov.cn/" target="_blank" rel="noreferrer">自然资源部标准地图服务系统</a> · 审图号 GS(2023)2767号</p>
      <p>不含余票、晚点、进站及市内交通信息，请以铁路官方信息为准。</p>
    </div>
  </footer>

  <dialog id="trip-dialog" class="trip-dialog">
    <button class="dialog-close" id="dialog-close" type="button" aria-label="关闭">×</button>
    <div id="dialog-content"></div>
  </dialog>
`

const form = getElement<HTMLFormElement>('search-form')
const departureWeekdaySelect = getElement<HTMLSelectElement>('departure-weekday')
const departureTimeInput = getElement<HTMLInputElement>('departure-time')
const arrivalWeekdaySelect = getElement<HTMLSelectElement>('arrival-weekday')
const arrivalTimeInput = getElement<HTMLInputElement>('arrival-time')
const scheduleNote = getElement<HTMLParagraphElement>('schedule-note')const maxDurationSelect = getElement<HTMLSelectElement>('max-duration')
const notice = getElement<HTMLDivElement>('notice')
const resultList = getElement<HTMLDivElement>('result-list')
const resultTitle = getElement<HTMLHeadingElement>('result-title')
const resultCount = getElement<HTMLSpanElement>('result-count')
const clearProvince = getElement<HTMLButtonElement>('clear-province')
const dialog = getElement<HTMLDialogElement>('trip-dialog')

let snapshot: RailSnapshot
let results: ReachabilityResult[] = []
let selectedProvince: string | undefined
let persistentWarnings: string[] = []

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`缺少 #${id} 元素`)
  return element as T
}

function escapeHtml(value: string): string {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function stationName(code: string): string {
  return snapshot.stations[code]?.name ?? code
}

function trainLine(leg: RailLeg): string {
  return `${escapeHtml(stationName(leg.fromStationCode))} → ${escapeHtml(stationName(leg.toStationCode))}`
}

function setNotice(message: string, kind: 'warning' | 'error'): void {
  notice.hidden = false
  notice.className = `notice notice--${kind}`
  notice.innerHTML = message
}


function renderStationOptions(): void {
  const container = getElement<HTMLDivElement>('station-options')
  container.innerHTML = snapshot.beijingStations
    .map(
      (station) => `
        <label><input type="checkbox" name="beijingStation" value="${escapeHtml(station.code)}" checked>
        <span>${escapeHtml(station.name)}</span></label>`,
    )
    .join('')

  container.addEventListener('change', () => {
    const selected = form.querySelectorAll<HTMLInputElement>('input[name="beijingStation"]:checked')
    getElement('station-summary').textContent =
      selected.length === snapshot.beijingStations.length ? '全部车站' : `已选 ${selected.length} 站`
  })
}

function readStationSelection(): string[] | undefined {
  const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="beijingStation"]:checked')]
  if (!selected.length || selected.length === snapshot.beijingStations.length) return undefined
  return selected.map((input) => input.value)
}

function renderMap(): void {
  const summaries = summarizeProvinces(snapshot, results)
  const maxStay = Math.max(...summaries.map((item) => item.longestStayMinutes), 1)
  const maxCount = Math.max(...summaries.map((item) => item.destinationCount), 1)
  const active = selectedProvince

  getElement('map-stats').innerHTML = `
    <div><b>${results.length}</b><span>可达城市</span></div>
    <div><b>${summaries.length}</b><span>覆盖省份</span></div>
    <div><b>${results[0] ? formatDuration(results[0].stayMinutes) : '—'}</b><span>最长停留</span></div>`

  getElement('route-layer').innerHTML = summaries
    .filter((item) => !active || item.province === active)
    .map((item) => {
      const anchor = getAnchor(item.province)
      const middleX = (72 + anchor.x) / 2
      const middleY = Math.min(35, anchor.y) - Math.abs(72 - anchor.x) * 0.08 - 5
      return `<path d="M72 35 Q${middleX} ${middleY} ${anchor.x} ${anchor.y}" />`
    })
    .join('')

  getElement('province-bubbles').innerHTML = summaries
    .map((item) => {
      const anchor = getAnchor(item.province)
      const heat = Math.round((item.longestStayMinutes / maxStay) * 100)
      const size = 34 + Math.round((item.destinationCount / maxCount) * 22)
      const isActive = active === item.province
      return `<button class="province-bubble${isActive ? ' is-active' : ''}" type="button"
        style="--x:${anchor.x};--y:${anchor.y};--heat:${heat};--size:${size}px"
        data-province="${escapeHtml(item.province)}" aria-pressed="${isActive}">
        <b>${item.destinationCount}</b><span>${escapeHtml(item.province)}</span></button>`
    })
    .join('')

  getElement('province-bubbles').querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.addEventListener('click', () => {
      selectedProvince = button.dataset.province
      renderAll()
    })
  })
}

function renderResults(): void {
  const visible = selectedProvince
    ? results.filter((result) => result.destination.province === selectedProvince)
    : results
  resultTitle.textContent = selectedProvince ? `${selectedProvince}目的地` : '按最长停留排序'
  resultCount.textContent = String(visible.length).padStart(2, '0')
  clearProvince.hidden = !selectedProvince

  if (!visible.length) {
    resultList.innerHTML = `<div class="empty-state"><b>这组条件没有完整往返</b><p>试试提前下班时间、放宽车站或单程耗时。</p></div>`
    return
  }

  resultList.innerHTML = visible
    .map((result) => {
      const originalIndex = results.indexOf(result)
      return `<button class="result-card" type="button" data-index="${originalIndex}">
        <span class="result-card__rank">${String(originalIndex + 1).padStart(2, '0')}</span>
        <span class="result-card__main">
          <span class="result-card__place"><b>${escapeHtml(result.destination.name)}</b><small>${escapeHtml(result.destination.province)}</small></span>
          <span class="result-card__route">
            <i>${escapeHtml(result.outboundTrain.number)}</i> ${timePart(result.outboundLeg.departureAt)} 出发
            <em>·</em> <i>${escapeHtml(result.returnTrain.number)}</i> 周日 ${timePart(result.returnLeg.departureAt)} 返回
          </span>
        </span>
        <span class="result-card__stay"><small>可停留</small><b>${formatDuration(result.stayMinutes)}</b></span>
        <span class="result-card__arrow">↗</span>
      </button>`
    })
    .join('')

  resultList.querySelectorAll<HTMLButtonElement>('.result-card').forEach((button) => {
    button.addEventListener('click', () => openTrip(Number(button.dataset.index)))
  })
}

function renderAll(): void {
  renderMap()
  renderResults()
}

function alternativeRows(legs: RailLeg[], direction: 'outbound' | 'return'): string {
  return legs
    .map(
      (leg) => `<li><b>${escapeHtml(leg.number)}</b><span>${trainLine(leg)}</span><time>${timePart(leg.departureAt)}—${timePart(leg.arrivalAt)}</time>
        <small>${direction === 'outbound' ? '周五' : '周日'} · ${formatDuration(leg.durationMinutes)}</small></li>`,
    )
    .join('')
}

function openTrip(index: number): void {
function weekdayName(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))
}

  const result = results[index]
  if (!result) return
  getElement('dialog-content').innerHTML = `
    <p class="eyebrow">WEEKEND ITINERARY</p>
    <h2>北京 <span>↗</span> ${escapeHtml(result.destination.name)}</h2>
    <div class="trip-highlight"><span>目的地停留</span><b>${formatDuration(result.stayMinutes)}</b><small>从抵达到返程发车</small></div>
    <div class="trip-legs">
      <article><header><span>去程 · 周五</span><b>${escapeHtml(result.outboundTrain.number)}</b></header>
        <div class="trip-time"><b>${timePart(result.outboundLeg.departureAt)}</b><i></i><b>${timePart(result.outboundLeg.arrivalAt)}</b></div>
        <div class="trip-stations"><span>${escapeHtml(stationName(result.outboundLeg.fromStationCode))}</span><small>${formatDuration(result.outboundLeg.durationMinutes)}</small><span>${escapeHtml(stationName(result.outboundLeg.toStationCode))}</span></div>
        <p>${formatDateTime(result.outboundLeg.departureAt)} 发车</p></article>
      <article><header><span>返程 · 周日</span><b>${escapeHtml(result.returnTrain.number)}</b></header>
        <div class="trip-time"><b>${timePart(result.returnLeg.departureAt)}</b><i></i><b>${timePart(result.returnLeg.arrivalAt)}</b></div>
        <div class="trip-stations"><span>${escapeHtml(stationName(result.returnLeg.fromStationCode))}</span><small>${formatDuration(result.returnLeg.durationMinutes)}</small><span>${escapeHtml(stationName(result.returnLeg.toStationCode))}</span></div>
        <p>${formatDateTime(result.returnLeg.arrivalAt)} 抵京</p></article>
    </div>
    <div class="alternatives"><h3>备选车次</h3><div><section><h4>去程</h4><ul>${alternativeRows(result.alternatives.outbound, 'outbound')}</ul></section>
      <section><h4>返程</h4><ul>${alternativeRows(result.alternatives.returns, 'return')}</ul></section></div></div>
    <p class="dialog-disclaimer">时刻表快照仅供行程筛选，不代表余票或实时运行状态。</p>`
  dialog.showModal()
  const outboundHeader = getElement('dialog-content').querySelector('.trip-legs article:first-child header span')
  if (outboundHeader) {
    outboundHeader.textContent = '\u53bb\u7a0b \u00b7 ' + weekdayName(result.outboundLeg.departureAt)
  }
  getElement('dialog-content')
    .querySelectorAll('.alternatives section:first-child li small')
    .forEach((element, alternativeIndex) => {
      const leg = result.alternatives.outbound[alternativeIndex]
      if (!leg) return
      element.textContent = weekdayName(leg.departureAt) + ' \u00b7 ' + formatDuration(leg.durationMinutes)
    })

}

function readSearchInput(): SearchInput {
  return {
    departureWeekday: departureWeekdaySelect.value as SearchInput['departureWeekday'],
    departureTime: departureTimeInput.value,
    latestBeijingArrivalWeekday:
      arrivalWeekdaySelect.value as SearchInput['latestBeijingArrivalWeekday'],
    latestBeijingArrivalTime: arrivalTimeInput.value,
    beijingStationCodes: readStationSelection(),
    maxDurationMinutes: maxDurationSelect.value ? Number(maxDurationSelect.value) : undefined,
  }
}

function showPersistentWarnings(): void {
  if (!persistentWarnings.length) {
    notice.hidden = true
    return
  }
  setNotice(persistentWarnings.map(escapeHtml).join(' / '), 'warning')
}

function runSearch(): void {
  const input = readSearchInput()
  const now = new Date()
  const weekendFriday = resolveWeekendFriday(snapshot, input, now)  if (!weekendFriday) {
    results = []
    selectedProvince = undefined
    scheduleNote.hidden = true
    setNotice('\u5feb\u7167\u4e0d\u5305\u542b\u7b26\u5408\u8be5\u51fa\u53d1\u661f\u671f\u548c\u65f6\u95f4\u7684\u540e\u7eed\u8f66\u6b21\uff0c\u8bf7\u7b49\u5f85\u4e0b\u4e00\u6b21\u6570\u636e\u66f4\u65b0\u3002', 'error')
    renderAll()
    return
  }

  const departureDate = addDays(weekendFriday, input.departureWeekday === 'saturday' ? 1 : 0)
  const arrivalDate = addDays(
    weekendFriday,
    input.latestBeijingArrivalWeekday === 'monday' ? 3 : 2,
  )
  scheduleNote.hidden = false
  scheduleNote.innerHTML =
    '\u672c\u6b21\u6309 <b>' + escapeHtml(formatDateTime(chinaDateTime(departureDate, input.departureTime))) +
    '</b> \u51fa\u53d1\uff0c\u6700\u665a <b>' +
    escapeHtml(formatDateTime(chinaDateTime(arrivalDate, input.latestBeijingArrivalTime))) +
    '</b> \u62b5\u4eac'
  showPersistentWarnings()
  results = searchReachableDestinations(snapshot, input, now)  selectedProvince = undefined
  renderAll()
}

async function boot(): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/rail-snapshot.json`, {
      cache: 'no-cache',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    snapshot = (await response.json()) as RailSnapshot
    if (
      snapshot.schemaVersion !== 2 ||      !Array.isArray(snapshot.availableWeekends) ||
      snapshot.availableWeekends.some(
        (friday) =>
          !Array.isArray(snapshot.outboundIndex[friday]?.friday) ||
          !Array.isArray(snapshot.outboundIndex[friday]?.saturday),
      ) ||
      !Number.isFinite(Date.parse(snapshot.generatedAt))
    ) {
      throw new Error('快照结构不受支持')
    }

    renderStationOptions()
    getElement<HTMLTimeElement>('generated-at').dateTime = snapshot.generatedAt
    getElement('generated-at').textContent = formatDateTime(snapshot.generatedAt)

    const warnings = [...snapshot.dataWarnings]
    const snapshotAge = Date.now() - Date.parse(snapshot.generatedAt)
    if (snapshotAge > 7 * 24 * 60 * 60 * 1000) {
      warnings.push('铁路时刻表快照已超过 7 天，结果可能过期')
    }
    persistentWarnings = warnings
    if (warnings.length) {      setNotice(warnings.map(escapeHtml).join(' · '), 'warning')
    }
    runSearch()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    setNotice(`铁路时刻表快照暂时不可用（${escapeHtml(detail)}）。请稍后刷新或检查数据更新任务。`, 'error')
    resultTitle.textContent = '数据加载失败'
    resultCount.textContent = '00'
    resultList.innerHTML = `<div class="empty-state"><b>暂时无法计算</b><p>页面本身可以访问，但静态数据文件没有成功加载。</p></div>`
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (form.reportValidity()) runSearch()
})
clearProvince.addEventListener('click', () => {
  selectedProvince = undefined
  renderAll()
})
getElement('dialog-close').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

void boot()
