// 02-equalizer-glue.js — equalizer 模块（经典脚本，index.html 在 music.js 之前加载）
// 迁出 legacy-music.js 的 equalizer 状态 + UI 控制 + 音频图胶水（2026-08-07，2.4 首批真抽取）
// 依赖全局：window.MineradioEqualizer（equalizer-core.js 先于本文件加载）、audioCtx/analyser（music.js 运行时填充）
// 顶层 var/function 天然挂 window，与各模块经典脚本语义一致（无 IIFE、无 tree-shake）。
// 本文件不得含 import/export，保持经典脚本，方可被 <script> 直接加载且全局可见。

var equalizerFilters = [];
var equalizerHeadroom = null;
var equalizerLimiter = null;
var equalizerAudioSupported = !!(window.AudioContext || window.webkitAudioContext);
var EQUALIZER_STORE_KEY = 'stellaflix-equalizer-state-v1';
var equalizerState = loadEqualizerState();
var equalizerSaveTimer = 0;
function loadEqualizerState() {
  try {
    return window.MineradioEqualizer.normalizeState(JSON.parse(localStorage.getItem(EQUALIZER_STORE_KEY) || 'null'));
  } catch (e) {
    return window.MineradioEqualizer.defaultState();
  }
}

function saveEqualizerState() {
  if (equalizerSaveTimer) {
    clearTimeout(equalizerSaveTimer);
    equalizerSaveTimer = 0;
  }
  try { localStorage.setItem(EQUALIZER_STORE_KEY, JSON.stringify(equalizerState)); } catch (e) {}
}

function scheduleEqualizerSave() {
  if (equalizerSaveTimer) clearTimeout(equalizerSaveTimer);
  equalizerSaveTimer = setTimeout(saveEqualizerState, 120);
}
// === [02-equalizer · UI 控制块] 区域横幅（2026-08-07 标订；2.3 仅标记边界，不搬迁） ===
function formatEqualizerFrequency(value) {
  return value >= 1000 ? (value / 1000) + 'K' : String(value);
}

function formatEqualizerGain(value) {
  var number = Number(value) || 0;
  return (number > 0 ? '+' : '') + number.toFixed(1);
}

function renderEqualizerBands() {
  var list = document.getElementById('equalizer-band-list');
  if (!list || list.children.length) return;
  window.MineradioEqualizer.BAND_FREQUENCIES.forEach(function addBand(frequency, index) {
    var band = document.createElement('div');
    band.className = 'equalizer-band';
    var output = document.createElement('output');
    output.id = 'equalizer-gain-' + index;
    output.textContent = '0.0';
    var input = document.createElement('input');
    input.type = 'range';
    input.min = '-12';
    input.max = '12';
    input.step = '0.5';
    input.value = '0';
    input.id = 'equalizer-band-' + index;
    input.dataset.eqBand = String(index);
    input.setAttribute('aria-label', formatEqualizerFrequency(frequency) + ' Hz 增益');
    output.htmlFor = input.id;
    var label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = formatEqualizerFrequency(frequency);
    band.append(output, input, label);
    list.appendChild(band);
  });
}

function updateEqualizerUi() {
  var gains = window.MineradioEqualizer.gainsForState(equalizerState);
  var button = document.getElementById('equalizer-btn');
  var status = document.getElementById('equalizer-unavailable-status');
  var panel = document.getElementById('equalizer-panel');
  var toggle = document.getElementById('equalizer-switch');
  var protection = document.getElementById('equalizer-protection-state');
  var unavailable = !equalizerAudioSupported;
  var effectiveEnabled = equalizerAudioSupported && equalizerState.enabled;
  if (unavailable && isEqualizerPanelOpen()) closeEqualizerPanel();
  if (button) {
    button.classList.toggle('active', effectiveEnabled);
    button.disabled = unavailable;
    button.title = equalizerAudioSupported ? '均衡器' : '当前环境不支持均衡器';
    if (unavailable) button.setAttribute('aria-expanded', 'false');
  }
  if (status) {
    status.hidden = !unavailable;
    status.textContent = 'EQ 不可用，请重启播放器';
  }
  if (panel) {
    panel.inert = unavailable;
    panel.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    panel.setAttribute('aria-hidden', isEqualizerPanelOpen() ? 'false' : 'true');
  }
  document.querySelectorAll('#equalizer-panel button, #equalizer-panel input').forEach(function syncAvailability(control) {
    control.disabled = unavailable;
  });
  if (toggle) {
    toggle.setAttribute('aria-checked', effectiveEnabled ? 'true' : 'false');
    toggle.textContent = effectiveEnabled ? '开启' : '关闭';
  }
  if (protection) {
    if (unavailable) protection.textContent = 'EQ 不可用';
    else if (!effectiveEnabled) protection.textContent = '保护未启用';
    else if (window.MineradioEqualizer.shouldEnableLimiter(gains)) {
      protection.textContent = '余量 '
        + window.MineradioEqualizer.calculateHeadroomDb(gains).toFixed(1)
        + ' dB · 峰值保护开启';
    } else protection.textContent = '无需峰值保护';
  }
  document.querySelectorAll('[data-eq-preset]').forEach(function syncPreset(item) {
    var selected = item.dataset.eqPreset === equalizerState.selectedPreset;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  gains.forEach(function syncBand(value, index) {
    var input = document.getElementById('equalizer-band-' + index);
    var output = document.getElementById('equalizer-gain-' + index);
    if (input) input.value = String(value);
    if (output) output.textContent = formatEqualizerGain(value);
  });
}

function setEqualizerEnabled(enabled) {
  if (!equalizerAudioSupported) return;
  equalizerState = window.MineradioEqualizer.setEnabled(equalizerState, enabled);
  saveEqualizerState();
  applyEqualizerAudioState(false);
  updateEqualizerUi();
}

function selectEqualizerPreset(presetId) {
  if (!equalizerAudioSupported) return;
  equalizerState = window.MineradioEqualizer.applyPreset(equalizerState, presetId);
  saveEqualizerState();
  applyEqualizerAudioState(false);
  updateEqualizerUi();
}

function setEqualizerBand(index, value, finalChange) {
  if (!equalizerAudioSupported) return;
  equalizerState = window.MineradioEqualizer.updateBand(equalizerState, index, value);
  if (finalChange) saveEqualizerState();
  else scheduleEqualizerSave();
  applyEqualizerAudioState(false);
  updateEqualizerUi();
}

function resetEqualizer() {
  if (!equalizerAudioSupported) return;
  equalizerState = window.MineradioEqualizer.reset(equalizerState);
  saveEqualizerState();
  applyEqualizerAudioState(false);
  updateEqualizerUi();
}

function toggleEqualizerPanel(event) {
  if (event) event.stopPropagation();
  if (!equalizerAudioSupported) {
    showToast('当前环境不支持均衡器');
    return;
  }
  var wrap = document.getElementById('equalizer-control');
  if (!wrap) return;
  if (wrap.classList.contains('open')) closeEqualizerPanel();
  else {
    wrap.classList.add('open');
    revealBottomControls(900);
    if (controlsHideTimer) {
      clearTimeout(controlsHideTimer);
      controlsHideTimer = null;
    }
  }
  var button = document.getElementById('equalizer-btn');
  var panel = document.getElementById('equalizer-panel');
  var open = wrap.classList.contains('open');
  if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (panel) panel.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function isEqualizerPanelOpen() {
  var wrap = document.getElementById('equalizer-control');
  return !!(wrap && wrap.classList.contains('open'));
}

function closeEqualizerPanel(restoreFocus) {
  var wrap = document.getElementById('equalizer-control');
  if (wrap) wrap.classList.remove('open');
  var button = document.getElementById('equalizer-btn');
  var panel = document.getElementById('equalizer-panel');
  if (button) button.setAttribute('aria-expanded', 'false');
  if (panel) panel.setAttribute('aria-hidden', 'true');
  if (restoreFocus && button) button.focus();
  if (controlsAutoHide) scheduleControlsHide(520);
}

function bindEqualizerControl() {
  renderEqualizerBands();
  var wrap = document.getElementById('equalizer-control');
  var toggle = document.getElementById('equalizer-switch');
  var reset = document.getElementById('equalizer-reset');
  var list = document.getElementById('equalizer-band-list');
  var presets = document.getElementById('equalizer-presets');
  if (toggle) toggle.addEventListener('click', function(){ setEqualizerEnabled(!equalizerState.enabled); });
  if (reset) reset.addEventListener('click', resetEqualizer);
  if (presets) presets.addEventListener('click', function(event){
    var button = event.target.closest('[data-eq-preset]');
    if (button) selectEqualizerPreset(button.dataset.eqPreset);
  });
  if (list) {
    list.addEventListener('input', function(event){
      if (event.target.matches('[data-eq-band]')) setEqualizerBand(Number(event.target.dataset.eqBand), Number(event.target.value), false);
    });
    list.addEventListener('change', function(event){
      if (event.target.matches('[data-eq-band]')) setEqualizerBand(Number(event.target.dataset.eqBand), Number(event.target.value), true);
    });
  }
  document.addEventListener('click', function(event){
    if (wrap && !wrap.contains(event.target)) closeEqualizerPanel();
  });
  document.addEventListener('keydown', function(event){
    if (event.code === 'Escape' && wrap && wrap.classList.contains('open')) closeEqualizerPanel(true);
  });
  updateEqualizerUi();
}
// === [02-equalizer · 音频图块] 区域横幅（2026-08-07 标订；2.3 仅标记边界，不搬迁） ===
function setEqualizerAudioParam(param, value, immediate) {
  if (!param || !audioCtx) return;
  var now = audioCtx.currentTime || 0;
  param.cancelScheduledValues(now);
  if (immediate) param.setValueAtTime(value, now);
  else param.setTargetAtTime(value, now, 0.020);
}

function applyEqualizerAudioStateToGraph(graph, immediate) {
  if (!graph || !graph.filters.length || !graph.headroom || !graph.limiter) return;
  var state = typeof equalizerState === 'undefined'
    ? window.MineradioEqualizer.defaultState()
    : window.MineradioEqualizer.normalizeState(equalizerState);
  var active = state.enabled;
  var savedGains = window.MineradioEqualizer.gainsForState(state);
  var gains = active ? savedGains : savedGains.map(function zeroGain() { return 0; });
  graph.filters.forEach(function applyBand(filter, index) {
    setEqualizerAudioParam(filter.gain, gains[index], immediate);
  });
  setEqualizerAudioParam(
    graph.headroom.gain,
    Math.pow(10, (active ? window.MineradioEqualizer.calculateHeadroomDb(gains) : 0) / 20),
    immediate,
  );
  setEqualizerAudioParam(
    graph.limiter.ratio,
    active && window.MineradioEqualizer.shouldEnableLimiter(gains) ? 20 : 1,
    immediate,
  );
}

function disconnectEqualizerAudioGraph(graph) {
  if (!graph) return;
  if (analyser && graph.filters && graph.filters.length) {
    try { analyser.disconnect(graph.filters[0]); } catch (disconnectInputError) {}
  }
  var nodes = graph.filters ? graph.filters.slice() : [];
  if (graph.headroom) nodes.push(graph.headroom);
  if (graph.limiter) nodes.push(graph.limiter);
  nodes.forEach(function disconnectCandidate(node) {
    try { node.disconnect(); } catch (disconnectNodeError) {}
  });
}

function createEqualizerAudioGraph() {
  var graph = { filters: [], headroom: null, limiter: null };
  try {
    var frequencies = window.MineradioEqualizer.BAND_FREQUENCIES;
    for (var i = 0; i < frequencies.length; i += 1) {
      var filter = audioCtx.createBiquadFilter();
      graph.filters.push(filter);
      filter.type = 'peaking';
      filter.frequency.value = frequencies[i];
      filter.Q.value = 1.4;
      filter.gain.value = 0;
    }
    graph.headroom = audioCtx.createGain();
    graph.limiter = audioCtx.createDynamicsCompressor();
    graph.limiter.threshold.value = -1;
    graph.limiter.knee.value = 0;
    graph.limiter.ratio.value = 1;
    graph.limiter.attack.value = 0.003;
    graph.limiter.release.value = 0.15;

    applyEqualizerAudioStateToGraph(graph, true);
    for (var j = 0; j < graph.filters.length - 1; j += 1) {
      graph.filters[j].connect(graph.filters[j + 1]);
    }
    graph.filters[graph.filters.length - 1].connect(graph.headroom);
    graph.headroom.connect(graph.limiter);
    return graph;
  } catch (equalizerGraphError) {
    disconnectEqualizerAudioGraph(graph);
    throw equalizerGraphError;
  }
}

function applyEqualizerAudioState(immediate) {
  applyEqualizerAudioStateToGraph({
    filters: equalizerFilters,
    headroom: equalizerHeadroom,
    limiter: equalizerLimiter,
  }, immediate);
}
