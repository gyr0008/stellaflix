/* 04d-audio-beat.js — 节拍/tempo 分析子系统（加载顺序：04a → 04b → 04c → 04d → 08）
   从 legacy-music.js 外科式抽取的最独立单元：MusicTempo 动态加载器 + Worker URL 构建器。
   仅依赖全局 window / fetch / URL / Blob，无 legacy 内部状态耦合；运行时由
   legacy 的 analyzeMusicTempoInWorker() 经全局作用域闭包调用 getMusicTempoWorkerUrl()。
   顶层声明必须保持 function/var（不得 IIFE 包裹），否则 143 关键全局闸门与 video/* 链路失效。 */

var musicTempoLoadPromise = null;
function ensureMusicTempo() {
  if (window.MusicTempo) return Promise.resolve(window.MusicTempo);
  if (musicTempoLoadPromise) return musicTempoLoadPromise;
  musicTempoLoadPromise = fetch('/vendor/music-tempo.min.js')
    .then(function(resp){
      if (!resp.ok) throw new Error('music-tempo load failed: ' + resp.status);
      return resp.text();
    })
    .then(function(code){
      (0, eval)(code);
      return window.MusicTempo || null;
    })
    .catch(function(err){
      console.warn('music-tempo dynamic load failed:', err);
      return null;
    });
  return musicTempoLoadPromise;
}

var musicTempoWorkerUrl = null;
function getMusicTempoWorkerUrl() {
  if (musicTempoWorkerUrl) return musicTempoWorkerUrl;
  var code = [
    'self.onmessage=function(e){',
    'var d=e.data||{};',
    'try{',
    'importScripts(d.scriptUrl||"/vendor/music-tempo.min.js");',
    'var C=self.MusicTempo||(typeof MusicTempo!=="undefined"?MusicTempo:null);',
    'if(!C)throw new Error("MusicTempo unavailable");',
    'var mono=new Float32Array(d.mono);',
    'var mt=new C(mono,{bufferSize:2048,hopSize:Math.max(128,Math.round(d.sampleRate*0.010)),timeStep:0.010,minBeatInterval:0.36,maxBeatInterval:0.95,expiryTime:8});',
    'self.postMessage({ok:true,tempo:mt.tempo||0,beats:mt.beats||[]});',
    '}catch(err){self.postMessage({ok:false,error:(err&&err.message)||String(err)});}',
    '};'
  ].join('');
  musicTempoWorkerUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  return musicTempoWorkerUrl;
}

