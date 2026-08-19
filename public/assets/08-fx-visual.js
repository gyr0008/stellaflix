var fxDefaults={preset:0,intensity:.85,cinemaShake:.5,depth:1,coverResolution:1.55,point:1,speed:1,twist:0,color:1.1,scatter:0,bgFade:.2,bloomStrength:.62,lyricGlowStrength:.28,lyricScale:1,lyricOffsetX:0,lyricOffsetY:0,lyricOffsetZ:0,lyricTiltX:0,lyricTiltY:0,lyricColorMode:"auto",lyricColor:"#a9b8c8",lyricHighlightMode:"auto",lyricHighlightColor:"#fac900",lyricGlowLinked:!0,lyricGlowColor:"#008aff",lyricFont:"hei",lyricLetterSpacing:0,lyricLineHeight:1,lyricWeight:900,visualTintMode:"auto",visualTintColor:"#9db8cf",uiAccentColor:"#ffffff",homeAccentColor:"#ffffff",homeIconColor:"#ffffff",visualIconColor:"#ffffff",backgroundColorMode:"cover",backgroundColor:"#000000",backgroundOpacity:1,controlGlassChromaticOffset:90,backgroundColorCustom:!1,backgroundImage:"",backgroundMedia:null,shapeMaterialMedia:null,desktopLyrics:!1,desktopLyricsSize:1,desktopLyricsOpacity:.92,desktopLyricsY:.76,desktopLyricsClickThrough:!1,desktopLyricsCinema:!0,desktopLyricsHighlight:!1,desktopLyricsFps:60,wallpaperMode:!1,wallpaperOpacity:1,floatLayer:!1,cinema:!0,edge:!1,aiDepth:!1,bloom:!1,lyricGlow:!0,lyricGlowBeat:!0,lyricGlowParticles:!1,lyricNextLine:!0,lyricCameraLock:!1,particleLyrics:!0,backCover:!1,shelf:"side",shelfCameraMode:"static",shelfPresence:"always",shelfShowPodcasts:!1,shelfMergeCollections:!1,shelfSize:1,shelfOffsetX:0,shelfOffsetY:0,shelfOffsetZ:0,shelfAngleY:-15,shelfAngleYManual:!1,shelfOpacity:1,shelfBgOpacity:.9,shelfAccentColor:"#ffffff",performanceBackground:"auto",performanceQuality:"high",liveBackgroundKeep:!1,cam:"off"},PACKAGED_DEFAULT_USER_FX_ARCHIVE_NAME="\u9ED8\u8BA4\u6D4B\u8BD5",PACKAGED_DEFAULT_USER_FX_ARCHIVE_EXPORTED_AT=1782276031784,PACKAGED_DEFAULT_USER_FX_ARCHIVE_SAVED_AT=1782273019045,PACKAGED_DEFAULT_FX_SNAPSHOT=Object.freeze({visualPresetSchema:VISUAL_PRESET_SCHEMA,preset:0,intensity:.85,cinemaShake:.5,depth:1,coverResolution:1.55,point:1,speed:1,twist:0,color:1.1,scatter:0,bgFade:.2,bloomStrength:.62,lyricGlowStrength:.28,lyricScale:1,lyricOffsetX:0,lyricOffsetY:0,lyricOffsetZ:0,lyricTiltX:0,lyricTiltY:0,lyricCameraLock:!1,lyricColorMode:"auto",lyricColor:"#a9b8c8",lyricHighlightMode:"auto",lyricHighlightColor:"#fac900",lyricGlowLinked:!0,lyricGlowColor:"#008aff",lyricFont:"hei",lyricLetterSpacing:0,lyricLineHeight:1,lyricWeight:900,visualTintMode:"auto",visualTintColor:"#9db8cf",uiAccentColor:"#ffffff",homeAccentColor:"#ffffff",homeIconColor:"#ffffff",visualIconColor:"#ffffff",backgroundColorMode:"cover",backgroundColor:"#000000",backgroundOpacity:1,controlGlassChromaticOffset:90,backgroundColorCustom:!1,floatLayer:!1,cinema:!0,edge:!1,aiDepth:!1,bloom:!1,lyricGlow:!0,lyricGlowBeat:!0,lyricGlowParticles:!1,lyricNextLine:!0,desktopLyrics:!1,desktopLyricsSize:1,desktopLyricsOpacity:.92,desktopLyricsY:.76,desktopLyricsClickThrough:!1,desktopLyricsCinema:!0,desktopLyricsHighlight:!1,desktopLyricsFps:60,performanceBackground:"auto",performanceQuality:"high",liveBackgroundKeep:!1,particleLyrics:!0,backCover:!1,shelf:"side",shelfCameraMode:"static",shelfPresence:"always",shelfShowPodcasts:!1,shelfMergeCollections:!1,shelfSize:1,shelfOffsetX:0,shelfOffsetY:0,shelfOffsetZ:0,shelfAngleY:-15,shelfAngleYManual:!1,shelfOpacity:1,shelfBgOpacity:.9,shelfAccentColor:"#ffffff",cam:"off"});function clonePackagedDefaultFxSnapshot(){return Object.assign({},PACKAGED_DEFAULT_FX_SNAPSHOT)}function packagedDefaultLyricLayoutRaw(){return Object.assign({desktopLyricsSchema:"desktop-lyrics-v3"},clonePackagedDefaultFxSnapshot())}var DEVELOPMENT_LOCKED_FX={wallpaperMode:!0};function isDevelopmentLockedFx(e){return!!DEVELOPMENT_LOCKED_FX[e]}function normalizeDevelopmentLockedFxState(){fx&&(fx.wallpaperMode=!1)}function readSavedPlaybackVisualPreset(){try{var e=JSON.parse(localStorage.getItem(LYRIC_LAYOUT_STORE_KEY)||"{}")||{};if(!Object.prototype.hasOwnProperty.call(e,"preset"))return fxDefaults.preset;var t=clampRange(Number(e.preset)||0,0,6);return t===3&&e.visualPresetSchema!==VISUAL_PRESET_SCHEMA&&(t=5),t}catch{return fxDefaults.preset}}var playbackVisualPreset=readSavedPlaybackVisualPreset(),startupVisualPreviewActive=!1,fx=Object.assign({},fxDefaults,readSavedLyricLayout());normalizeDevelopmentLockedFxState();var presetTransition={active:!1,start:-10,duration:.92,from:0,to:0},mouseWorld=new THREE.Vector3(-999,-999,0),mouseActive=!1,mouseDownAt={x:0,y:0,t:0,hadDrag:!1},particlePointerSpin={active:!1,lastX:0,lastY:0,lastT:0},particlePointerRay=new THREE.Raycaster,particlePointerNdc=new THREE.Vector2,particlePointerPlane=new THREE.Plane,particlePointerPlanePoint=new THREE.Vector3,particlePointerPlaneNormal=new THREE.Vector3,particlePointerWorldHit=new THREE.Vector3,particlePointerLocalHit=new THREE.Vector3,particlePointerQuat=new THREE.Quaternion,particlePointerFrame={dirty:!1,ndcX:0,ndcY:0},CLICK_THRESHOLD=6,UI_HIT_SELECTOR="#search-area,#top-right,#fullscreen-diy-zone,#fx-panel,#fx-fab,#fx-fab-hide-btn,#shape-workshop-stage,#playlist-panel,#bottom-bar,#thumb-wrap,#empty-home,#visual-guide,#trial-banner,#source-fallback-notice,.modal-mask,#toast,#ai-depth-chip,#beat-chip,#drop-overlay";function isPointerOverUi(e){if(!e)return!1;var t=document.elementFromPoint(e.clientX,e.clientY);return!!(t&&t.closest&&t.closest(UI_HIT_SELECTOR))}function particleLocalPointFromNdc(e,t,a){particlePointerNdc.set(e,t),particlePointerRay.setFromCamera(particlePointerNdc,camera);var r=typeof isCustomShapeRenderActive=="function"&&isCustomShapeRenderActive()&&customShapeGroup?customShapeGroup:particles;if(r){if(r.updateMatrixWorld(!0),r.getWorldPosition(particlePointerPlanePoint),r.getWorldQuaternion(particlePointerQuat),particlePointerPlaneNormal.set(0,0,1).applyQuaternion(particlePointerQuat).normalize(),Math.abs(particlePointerPlaneNormal.dot(particlePointerRay.ray.direction))<.16)return!1;if(particlePointerPlane.setFromNormalAndCoplanarPoint(particlePointerPlaneNormal,particlePointerPlanePoint),particlePointerRay.ray.intersectPlane(particlePointerPlane,particlePointerWorldHit))return a.copy(particlePointerWorldHit),r.worldToLocal(a),isFinite(a.x)&&isFinite(a.y)&&Math.abs(a.x)<8.5&&Math.abs(a.y)<8.5}return particlePointerPlaneNormal.set(0,0,1),particlePointerPlane.set(particlePointerPlaneNormal,0),particlePointerRay.ray.intersectPlane(particlePointerPlane,particlePointerWorldHit)?(a.copy(particlePointerWorldHit),isFinite(a.x)&&isFinite(a.y)&&Math.abs(a.x)<8.5&&Math.abs(a.y)<8.5):!1}function queueParticlePointerFrame(e,t){var a=e/innerWidth*2-1,r=-(t/innerHeight)*2+1;pointerTarget.x=a,pointerTarget.y=r,particlePointerFrame.ndcX=a,particlePointerFrame.ndcY=r,particlePointerFrame.dirty=!0}function updateParticlePointerFrame(){particlePointerFrame.dirty&&(particlePointerFrame.dirty=!1,particleLocalPointFromNdc(particlePointerFrame.ndcX,particlePointerFrame.ndcY,particlePointerLocalHit)?(mouseWorld.x=particlePointerLocalHit.x,mouseWorld.y=particlePointerLocalHit.y,mouseActive=!0):(mouseWorld.set(-999,-999,0),mouseActive=!1))}function beginParticlePointerDrag(e){e.button!==2&&(isPointerOverUi(e)||(markRenderInteraction("canvas-drag",1200),idleGuidePointerDown(e),orbit.rotating=!0,orbit.last.x=e.clientX,orbit.last.y=e.clientY,particlePointerSpin.active=!0,particlePointerSpin.lastX=e.clientX,particlePointerSpin.lastY=e.clientY,particlePointerSpin.lastT=performance.now(),typeof particleSpin<"u"&&(particleSpin.vx=particleSpin.vy=0),mouseDownAt.x=e.clientX,mouseDownAt.y=e.clientY,mouseDownAt.t=performance.now(),mouseDownAt.hadDrag=!1))}function makeDotTexture(){var e=document.createElement("canvas");e.width=e.height=64;var t=e.getContext("2d"),a=t.createRadialGradient(32,32,0,32,32,31);a.addColorStop(0,"rgba(255,255,255,0.96)"),a.addColorStop(.42,"rgba(255,255,255,0.78)"),a.addColorStop(.72,"rgba(255,255,255,0.22)"),a.addColorStop(1,"rgba(255,255,255,0)"),t.fillStyle=a,t.fillRect(0,0,64,64);var r=new THREE.CanvasTexture(e);return r.minFilter=THREE.LinearFilter,r.magFilter=THREE.LinearFilter,r}var dotTexture=makeDotTexture(),PLANE_SIZE=4.8,RIPPLE_MAX=12,GRID_X=coverParticleGridForResolution(fx.coverResolution),GRID_Y=GRID_X,PCOUNT=GRID_X*GRID_Y,positions=null,uvs=null,aRand=null,coverResolutionReloadTimer=null,currentCoverSource=null,coverPickerCanvas=null;function buildCoverParticleGeometry(e){e=coverParticleGridForResolution(e/118);for(var t=e*e,a=new THREE.BufferGeometry,r=new Float32Array(t*3),o=new Float32Array(t*2),l=new Float32Array(t),s=1/e,i=0;i<t;i++){var u=i%e,n=Math.floor(i/e),h=(u+.5)*s,v=(n+.5)*s,f=u/(e-1),m=n/(e-1);r[i*3]=(f-.5)*PLANE_SIZE,r[i*3+1]=(m-.5)*PLANE_SIZE,r[i*3+2]=0,o[i*2]=h,o[i*2+1]=v,l[i]=Math.random()}return a.setAttribute("position",new THREE.BufferAttribute(r,3)),a.setAttribute("aUv",new THREE.BufferAttribute(o,2)),a.setAttribute("aRand",new THREE.BufferAttribute(l,1)),a.userData.grid=e,a.userData.count=t,positions=r,uvs=o,aRand=l,a}var geo=buildCoverParticleGeometry(GRID_X);function applyCoverParticleResolution(e,t){t=t||{},fx.coverResolution=normalizeCoverResolution(e);var a=coverParticleGridForResolution(fx.coverResolution);if(!(a===GRID_X&&geo&&geo.userData&&geo.userData.grid===a)){var r=geo,o=buildCoverParticleGeometry(a);geo=o,GRID_X=GRID_Y=a,PCOUNT=a*a,particles&&(particles.geometry=o),bloomParticles&&(bloomParticles.geometry=o),r&&r!==o&&r.dispose(),uniforms.uBurstAmt.value=Math.max(uniforms.uBurstAmt.value,.18),t.reload!==!1&&scheduleCoverResolutionReload()}}function scheduleCoverResolutionReload(){!currentCoverSource||!currentCoverSource.src||(coverResolutionReloadTimer&&clearTimeout(coverResolutionReloadTimer),coverResolutionReloadTimer=setTimeout(function(){coverResolutionReloadTimer=null,!(!currentCoverSource||!currentCoverSource.src)&&(currentCoverSource.kind==="url"?loadCoverFromUrl(currentCoverSource.src,{trackToken:trackSwitchToken,fromResolutionChange:!0}):currentCoverSource.kind==="data"&&applyCoverDataUrl(currentCoverSource.src,{trackToken:trackSwitchToken,fromResolutionChange:!0}))},260))}var rippleData=new Float32Array(RIPPLE_MAX*4),rippleTex=new THREE.DataTexture(rippleData,1,RIPPLE_MAX,THREE.RGBAFormat,THREE.FloatType);rippleTex.magFilter=THREE.NearestFilter,rippleTex.minFilter=THREE.NearestFilter;for(var ripples=[],ri=0;ri<RIPPLE_MAX;ri++)ripples.push({x:0,y:0,age:-10,str:0});var coverTex=new THREE.Texture;coverTex.minFilter=THREE.LinearFilter,coverTex.magFilter=THREE.LinearFilter,coverTex.wrapS=THREE.ClampToEdgeWrapping,coverTex.wrapT=THREE.ClampToEdgeWrapping;var coverEdgeTex=new THREE.Texture;coverEdgeTex.minFilter=THREE.LinearFilter,coverEdgeTex.magFilter=THREE.LinearFilter,(function(){var e=document.createElement("canvas");e.width=e.height=4;var t=e.getContext("2d");t.fillStyle="#1c1c28",t.fillRect(0,0,4,4),coverTex.image=e,coverTex.needsUpdate=!0;var a=document.createElement("canvas");a.width=a.height=4;var r=a.getContext("2d");r.fillStyle="rgba(128,0,0,255)",r.fillRect(0,0,4,4),coverEdgeTex.image=a,coverEdgeTex.needsUpdate=!0})();var prevCoverTex=new THREE.Texture;prevCoverTex.minFilter=THREE.LinearFilter,prevCoverTex.magFilter=THREE.LinearFilter,(function(){var e=document.createElement("canvas");e.width=e.height=4;var t=e.getContext("2d");t.fillStyle="#1c1c28",t.fillRect(0,0,4,4),prevCoverTex.image=e,prevCoverTex.needsUpdate=!0})();var uniforms={uTime:{value:0},uBass:{value:0},uMid:{value:0},uTreble:{value:0},uBeat:{value:0},uEnergy:{value:0},uBurstAmt:{value:0},uVinylSpin:{value:0},uPreset:{value:0},uIntensity:{value:.85},uDepth:{value:1},uPointScale:{value:1},uSpeed:{value:1},uTwist:{value:0},uColorBoost:{value:1.1},uScatter:{value:0},uCoverRes:{value:1},uBgFade:{value:.2},uBloomStrength:{value:.62},uBloomSize:{value:2.65},uTintColor:{value:new THREE.Color("#9db8cf")},uTintStrength:{value:0},uCoverTex:{value:coverTex},uPrevCoverTex:{value:prevCoverTex},uColorMixT:{value:1},uEdgeTex:{value:coverEdgeTex},uRippleTex:{value:rippleTex},uRippleCount:{value:0},uDotTex:{value:dotTexture},uHasCover:{value:0},uHasDepth:{value:0},uEdgeEnabled:{value:1},uAiBoost:{value:0},uMouseXY:{value:new THREE.Vector2(-999,-999)},uMouseActive:{value:0},uHandXY:{value:new THREE.Vector2(-999,-999)},uHandActive:{value:0},uGestureGrip:{value:0},uPixel:{value:renderer.getPixelRatio()},uAlpha:{value:0},uParticleDim:{value:1},uFloatAlpha:{value:0},uLoading:{value:0}};installRenderPowerHooks(),applyRendererPowerMode();var vs=`
precision highp float;
uniform float uTime, uBass, uMid, uTreble, uBeat, uEnergy, uBurstAmt;
uniform float uPreset, uIntensity, uDepth, uPointScale, uSpeed, uTwist;
uniform float uVinylSpin;
uniform float uColorBoost, uScatter, uCoverRes, uBgFade;
uniform float uHasCover, uHasDepth, uEdgeEnabled, uAiBoost;
uniform float uMouseActive, uPixel, uColorMixT, uLoading;
uniform sampler2D uCoverTex, uPrevCoverTex, uEdgeTex, uRippleTex;
uniform int uRippleCount;
uniform vec2 uMouseXY, uHandXY;
uniform float uHandActive, uGestureGrip;
uniform vec3 uTintColor;
uniform float uTintStrength;
attribute vec2 aUv;
attribute float aRand;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

#define PI 3.14159265359

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289v(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 perm(vec4 x){return mod289v(((x*34.0)+1.0)*x);}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

vec2 safeCoverUv(vec2 uv) {
  return clamp(uv, vec2(0.0012), vec2(0.9988));
}

vec3 sampleNewCoverColor(vec2 uv) {
  return texture2D(uCoverTex, safeCoverUv(uv)).rgb;
}

vec3 samplePrevCoverColor(vec2 uv) {
  return texture2D(uPrevCoverTex, safeCoverUv(uv)).rgb;
}

vec4 sampleEdgeColor(vec2 uv) {
  return texture2D(uEdgeTex, safeCoverUv(uv));
}

float rippleSumAt(vec2 p, out float maxAmp) {
  float sum = 0.0; maxAmp = 0.0;
  for (int ri = 0; ri < 12; ri++) {
    if (ri >= uRippleCount) break;
    float vCoord = (float(ri) + 0.5) / 12.0;
    vec4 rd = texture2D(uRippleTex, vec2(0.5, vCoord));
    float age = rd.z; float str = rd.w;
    if (str < 0.005 || age < 0.0 || age > 2.0) continue;
    float dx = p.x - rd.x, dy = p.y - rd.y;
    float dist = sqrt(dx*dx + dy*dy);
    float lifeN = age / 2.0;
    float fadeIn  = smoothstep(0.0, 0.06, age);
    float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeN);
    float env = fadeIn * fadeOut;
    // v7.1: \u628A\u5E45\u5EA6\u653E\u5927 \u2014 \u4E2D\u5FC3\u51F8\u8D77\u66F4\u9AD8\u66F4\u5BBD
    float bulgeW = 0.55 + age * 0.80;
    float bulge  = exp(-dist*dist / (2.0 * bulgeW * bulgeW)) * (1.0 - smoothstep(0.0, 0.55, lifeN));
    float waveR  = age * 2.10;
    float ringW  = 0.40 + age * 0.22;
    float ring   = exp(-pow((dist - waveR) / ringW, 2.0));
    // v7.1: \u63D0\u5347\u6574\u4F53\u5E45\u5EA6 \xD72
    float local  = (bulge * 2.4 + ring * 1.30) * env * str;
    sum += local;
    maxAmp = max(maxAmp, abs(local));
  }
  return sum;
}

void main(){
  float t = uTime * uSpeed;
  vec3 pos;
  vec2 sampleUv = safeCoverUv(aUv);
  // \u5207\u6B4C\u989C\u8272\u6E10\u53D8: \u5728\u65B0\u65E7\u5C01\u9762\u95F4 mix
  vec3 newCol = sampleNewCoverColor(sampleUv);
  vec3 prevCol = samplePrevCoverColor(sampleUv);
  vec3 coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
  vec4 edge = sampleEdgeColor(sampleUv);
  float depthVal = edge.r;
  float edgeVal  = edge.g;
  float fgMask   = edge.b;
  float lumVal   = edge.a;
  float maxRippleAmp = 0.0;
  float rippleZ = 0.0;

  vec3 defaultColor = mix(
    vec3(0.36, 0.28, 0.72),
    mix(vec3(0.85, 0.55, 0.95), vec3(0.45, 0.78, 0.95), aUv.x),
    aUv.y
  );
  vColor = mix(defaultColor, coverColor, uHasCover);
  vAlpha = 1.0;

  // \u5F8B\u52A8\u5F3A\u5EA6\u7684\u771F\u5B9E\u500D\u6570 (\u653E\u5927 intensity \u6ED1\u5757\u7684\u5F71\u54CD)
  float K = uIntensity * 1.6;   // \u6ED1\u5757 1.0 \u2192 K=1.6, \u6ED1\u5757 1.6 \u2192 K=2.56

  // ====================================================
  //  Preset 0: SILK \u2014 \u4E1D\u7EF8 (xy \u5E73\u9762, z \u6D9F\u6F2A)
  //  v7.1: \u5168\u90E8\u4F4D\u79FB \xD72.5
  // ====================================================
  if (uPreset < 0.5) {
    pos = position;
    rippleZ = rippleSumAt(pos.xy, maxRippleAmp);

    float midN = snoise(vec3(pos.x*1.4, pos.y*1.4, t*0.55)) * 0.6
               + snoise(vec3(pos.x*2.8+5.0, pos.y*2.8-3.0, t*0.85)) * 0.4;
    float midMask = 0.55 + 0.45 * snoise(vec3(pos.x*0.4, pos.y*0.4, t*0.18));
    float midDisp = midN * uMid * 0.55 * midMask * K;       // 0.20 \u2192 0.55

    float trebleJ = snoise(vec3(pos.x*6.5, pos.y*6.5, t*3.5 + aRand*4.0)) * uTreble * 0.18 * K;  // 0.06\u21920.18
    float bassBreath = snoise(vec3(pos.x*0.35, pos.y*0.35, t*0.4)) * uBass * 0.42 * K;          // 0.14\u21920.42

    // AI \u6DF1\u5EA6: \u663E\u8457\u5F3A\u5316 (0.85 \u2192 1.4)
    float depthZ = (depthVal - 0.5) * uAiBoost * uDepth * 1.40 * uHasDepth;

    pos.z = rippleZ * 1.30 + midDisp + trebleJ + bassBreath + depthZ;
  }

  // ====================================================
  //  Preset 1: TUNNEL \u2014 \u96A7\u9053 + \u81EA\u65CB
  // ====================================================
  else if (uPreset < 1.5) {
    // v7.1: \u6574\u4F53\u81EA\u65CB \u2014 \u6574\u7BA1\u7F13\u6162\u7ED5 Z \u8F74
    float spin = t * 0.12;
    float angle = aUv.x * 2.0 * PI + spin;
    float flow = aUv.y - t * 0.08 * (1.0 + uBass * 0.55);
    flow = fract(flow);
    float zPos = (flow - 0.5) * 9.0;
    float baseR = 2.0 - uBass * 0.28 * K;                  // bass \u6536\u7F29\u66F4\u660E\u663E
    float ripG  = sin(angle * 5.0 + zPos * 1.4 + t * 2.2) * 0.10 * (uMid + uTreble) * K;   // 0.04\u21920.10
    float r = baseR + ripG;
    pos.x = cos(angle) * r;
    pos.y = sin(angle) * r;
    pos.z = zPos;

    sampleUv = vec2(aUv.x, flow);
    sampleUv = safeCoverUv(sampleUv);
    newCol = sampleNewCoverColor(sampleUv);
    prevCol = samplePrevCoverColor(sampleUv);
    coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
    vColor = mix(defaultColor, coverColor, uHasCover);

    float depthFade = smoothstep(-4.5, 4.5, zPos);
    vColor *= 0.4 + depthFade * 0.7;
  }

  // ====================================================
  //  Preset 2: ORBIT \u2014 \u661F\u7403 (\u4FDD\u7559\u81EA\u8F6C)
  //  v7.1: \u5F8B\u52A8\u5E45\u5EA6\u52A0\u5927
  // ====================================================
  else if (uPreset < 2.5) {
    float theta = aUv.x * 2.0 * PI;
    float phi   = (aUv.y - 0.5) * PI;
    float baseR = 2.2;
    float trebFlare = snoise(vec3(theta * 1.5, phi * 1.5, t * 0.7)) * uTreble * 0.85 * K;   // 0.40\u21920.85
    float bassExpand = uBass * 0.35 * K;                                                      // 0.18\u21920.35
    float r = baseR * (1.0 + bassExpand) + trebFlare;

    pos.x = r * cos(phi) * cos(theta);
    pos.y = r * sin(phi);
    pos.z = r * cos(phi) * sin(theta);

    float yaw = t * 0.18;
    float cy = cos(yaw), sy = sin(yaw);
    pos.xz = mat2(cy, -sy, sy, cy) * pos.xz;
  }

  // ====================================================
  //  Preset 3: VOID \u2014 \u865A\u7A7A (\u65E0\u7C92\u5B50, \u9002\u5408\u81EA\u5B9A\u4E49\u80CC\u666F)
  // ====================================================
  else if (uPreset < 3.5) {
    pos = vec3((aUv.x - 0.5) * 0.01, (aUv.y - 0.5) * 0.01, -90.0);
    vAlpha = 0.0;
    vColor = vec3(0.0);
    maxRippleAmp = 0.0;
  }

  // ====================================================
  //  Preset 4: VINYL RECORD
  //  A real record layout: circular album cover in the center, black vinyl
  //  grooves outside, and a complete white particle rim.
  // ====================================================
  else if (uPreset < 4.5) {
    float bassDrive = smoothstep(0.08, 0.78, uBass + uBeat * 0.82);
    float highDrive = smoothstep(0.05, 0.46, uTreble);
    float hiResGuard = smoothstep(1.08, 1.55, uCoverRes);
    float edgeGuard = mix(1.0, 0.38, hiResGuard);
    float depthGuard = mix(1.0, 0.44, hiResGuard);
    float grooveGuard = mix(1.0, 0.48, hiResGuard);
    float beatGuard = mix(1.0, 0.36, hiResGuard);

    vec2 p = (aUv - 0.5) * 5.12;
    float spin = uVinylSpin;
    float cs = cos(spin), sn = sin(spin);
    vec2 rp = mat2(cs, -sn, sn, cs) * p;
    float d = length(p);
    float angle0 = atan(p.y, p.x);
    float recordR = 2.46;
    float coverR = 1.18;
    float recordAlpha = 1.0 - smoothstep(recordR - 0.02, recordR + 0.05, d);
    float coverMask = 1.0 - smoothstep(coverR - 0.012, coverR + 0.018, d);
    float border = exp(-pow((d - coverR) / 0.064, 2.0)) * edgeGuard;
    float outerRim = exp(-pow((d - (recordR - 0.050)) / 0.055, 2.0)) * edgeGuard;
    float vinylN = clamp((d - coverR) / max(0.001, recordR - coverR), 0.0, 1.0);

    pos = vec3(rp * (1.0 + bassDrive * 0.012 * beatGuard + uBeat * 0.026 * beatGuard), 0.0);
    vAlpha = recordAlpha;

    if (coverMask > 0.02) {
      vec2 coverUv = p / (coverR * 2.0) + 0.5;
      newCol = sampleNewCoverColor(coverUv);
      prevCol = samplePrevCoverColor(coverUv);
      coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
      if (hiResGuard > 0.001) {
        vec2 sx = vec2(0.0026, 0.0);
        vec2 sy = vec2(0.0, 0.0026);
        vec3 softNew = (sampleNewCoverColor(coverUv + sx) + sampleNewCoverColor(coverUv - sx) + sampleNewCoverColor(coverUv + sy) + sampleNewCoverColor(coverUv - sy)) * 0.25;
        vec3 softPrev = (samplePrevCoverColor(coverUv + sx) + samplePrevCoverColor(coverUv - sx) + samplePrevCoverColor(coverUv + sy) + samplePrevCoverColor(coverUv - sy)) * 0.25;
        coverColor = mix(coverColor, mix(softPrev, softNew, clamp(uColorMixT, 0.0, 1.0)), hiResGuard * 0.42);
      }
      vColor = mix(defaultColor, coverColor, uHasCover);
      float coverShade = 1.02 + 0.10 * (1.0 - smoothstep(0.0, coverR, d));
      vColor *= coverShade;
      vColor = mix(vColor, vec3(1.0), border * 0.54);
      pos.z = 0.040 + border * 0.026 * depthGuard + uBeat * 0.018 * beatGuard;
      maxRippleAmp = max(maxRippleAmp, border * 0.30 + bassDrive * 0.075 * beatGuard + uBeat * 0.075 * beatGuard);
    } else {
      float groove = 0.5 + 0.5 * sin((d - coverR) * mix(98.0, 58.0, hiResGuard));
      float fineGroove = 0.5 + 0.5 * sin((d - coverR) * mix(170.0, 92.0, hiResGuard) + aRand * 3.0);
      float tick = smoothstep(0.82, 0.995, hash11(floor((angle0 + PI) * 38.0) + floor(d * 72.0) * 2.1));
      vec3 vinyl = vec3(0.052, 0.054, 0.058) + vec3(0.052 * grooveGuard) * groove + vec3(0.026 * grooveGuard) * fineGroove;
      vinyl = mix(vinyl, coverColor * 0.32, 0.18 * (1.0 - vinylN));
      float whiteRing = max(border * 0.92, outerRim * 0.26);
      vColor = mix(vinyl, vec3(0.92, 0.94, 0.94), whiteRing);
      vColor = mix(vColor, vec3(1.0), tick * highDrive * (0.06 + border * 0.12) * grooveGuard);
      pos.z = groove * 0.010 * grooveGuard + border * 0.024 * depthGuard + bassDrive * vinylN * 0.016 * K * beatGuard + tick * highDrive * 0.010 * grooveGuard;
      maxRippleAmp = max(maxRippleAmp, border * 0.32 + outerRim * 0.12 + bassDrive * vinylN * 0.11 * beatGuard + tick * highDrive * 0.10 * grooveGuard + uBeat * vinylN * 0.08 * beatGuard);
    }
  }

  // ====================================================
  //  Preset 5: WALLPAPER PULSE
  //  Layered music-particle wallpaper: aurora ribbons, depth sparks,
  //  and cover-colored audio flow.
  // ====================================================
  else {
    float bassGlow = smoothstep(0.07, 0.78, uBass) * 0.34 + uBeat * 0.014;
    float midGlow = smoothstep(0.07, 0.62, uMid) * 0.42;
    float highGlow = smoothstep(0.04, 0.46, uTreble) * 0.46;
    float lane = aUv.y;
    float transition = clamp(uBurstAmt, 0.0, 1.0);

    if (lane < 0.80) {
      float laneWarp = snoise(vec3(aUv.x * 0.42, lane * 1.7, t * 0.026)) * 0.11 + (hash11(aRand * 73.1) - 0.5) * 0.045;
      float warpedLane = clamp(lane + laneWarp, 0.0, 0.80);
      float bandCoord = warpedLane / 0.80 * 5.65 + snoise(vec3(aUv.x * 0.82, lane * 2.25, t * 0.032)) * 0.62;
      float band = floor(bandCoord);
      float local = fract(bandCoord + hash11(band * 9.13 + aRand * 2.4) * 0.18);
      float bandN = clamp((band + 0.5) / 5.65, 0.0, 1.0);
      float seed = hash11(band * 19.17 + aRand * 31.0);
      float flow = fract(aUv.x + t * (0.0034 + bandN * 0.0038 + seed * 0.0022) + seed * 0.53);
      float arc = (flow - 0.5) * PI * (1.35 + bandN * 0.72 + seed * 0.24);
      float armCurve = sin(arc + bandN * 2.2 + seed * 5.3);
      float spiralRadius = 9.2 + bandN * 11.8 + seed * 6.0 + local * 2.9;
      float x = cos(arc * 0.72 + bandN * 0.92 + seed * 1.3) * spiralRadius + (flow - 0.5) * (13.5 + bandN * 9.5);
      float ribbonPhase = flow * PI * 2.0 * (0.55 + bandN * 0.24 + seed * 0.10) + t * (0.010 + bandN * 0.007) + seed * 5.7;
      float broadWave = sin(ribbonPhase) * 0.92;
      float fineWave = sin(ribbonPhase * (1.36 + seed * 0.62) - t * 0.044 + seed * 5.0) * 0.045;
      float yBase = (bandN - 0.5) * 13.2 + armCurve * (2.3 + bandN * 1.6) + (seed - 0.5) * 1.85 + snoise(vec3(bandN * 2.0, flow * 0.62, seed)) * 0.92;
      float ridgeCenter = 0.43 + (seed - 0.5) * 0.18;
      float ridge = exp(-pow((local - ridgeCenter) / (0.25 + seed * 0.04), 2.0));
      float softMask = smoothstep(0.010, 0.12, lane) * (1.0 - smoothstep(0.72, 0.81, lane));
      float ribbonNoise = snoise(vec3(flow * 1.18 + seed, bandN * 2.0, t * 0.018)) * 0.74;
      float zLayer = mix(-23.5, 15.5, bandN) + (seed - 0.5) * 6.0;

      pos.x = x + ribbonNoise * 1.40 + sin(t * 0.012 + seed * 8.0) * 0.22;
      pos.y = yBase + broadWave + fineWave + (local - 0.5) * (0.58 + ridge * 0.14);
      pos.z = zLayer + broadWave * 1.35 + ribbonNoise * 1.85;

      float pulseLine = 0.5 + 0.5 * sin(ribbonPhase * (1.7 + seed * 0.9) - t * 0.32 + seed * 6.0);
      vec3 aurora = mix(vec3(0.52, 0.86, 1.0), vec3(0.70, 0.58, 1.0), bandN);
      aurora = mix(aurora, vec3(0.96, 0.98, 0.92), bassGlow * 0.05);
      vAlpha = (0.18 + ridge * 0.78 + pulseLine * highGlow * 0.035 + bassGlow * 0.025) * softMask * (0.96 + transition * 0.02);
      vColor = mix(coverColor, aurora, 0.62 + ridge * 0.22) * (0.76 + ridge * 0.86 + pulseLine * highGlow * 0.05 + bassGlow * 0.04);
      maxRippleAmp = max(maxRippleAmp, ridge * (0.12 + midGlow * 0.05) + pulseLine * highGlow * 0.045 + bassGlow * 0.030);
    } else {
      float q = (lane - 0.80) / 0.20;
      float seed = hash11(aRand * 917.0 + floor(q * 130.0));
      float depth = mix(-32.0, 18.0, seed);
      float drift = fract(aUv.x + t * (0.0014 + seed * 0.0048) + seed * 0.63);
      float cluster = snoise(vec3(seed * 2.0, q * 3.2, t * 0.007));
      float x = (drift - 0.5) * (45.0 + seed * 22.0) + cluster * 3.4;
      float y = (hash11(aRand * 331.0 + seed * 5.0) - 0.5) * 22.0 + sin(t * (0.018 + seed * 0.028) + seed * 7.0) * 0.86;
      float z = depth + sin(t * (0.020 + seed * 0.032) + aRand * 8.0) * 1.05;
      float twinkle = pow(0.5 + 0.5 * sin(t * (0.24 + seed * 0.42) + aRand * 17.0), 5.0);
      float dust = smoothstep(0.22, 0.98, hash11(aRand * 661.0 + floor(q * 160.0)));

      pos = vec3(x, y, z);
      vAlpha = dust * (0.16 + twinkle * 0.46 + highGlow * 0.025 + bassGlow * 0.018) * (1.0 - q * 0.06);
      vColor = mix(coverColor, vec3(0.92, 0.97, 1.0), 0.62 + twinkle * 0.14) * (0.72 + twinkle * 0.62 + bassGlow * 0.025);
      maxRippleAmp = max(maxRippleAmp, twinkle * highGlow * 0.055 + dust * bassGlow * 0.030);
    }

    if (transition > 0.001) {
      float bloom = smoothstep(0.0, 1.0, transition);
      vec2 burstVec = pos.xy + vec2(hash11(aRand * 31.0) - 0.5, hash11(aRand * 47.0) - 0.5) * 0.75;
      vec2 burstDir = burstVec / max(length(burstVec), 0.001);
      pos.xy += burstDir * bloom * 0.026;
      pos.xy += vec2(snoise(vec3(aRand, t * 0.014, 1.0)), snoise(vec3(aRand, t * 0.014, 5.0))) * bloom * 0.06;
      pos.xy *= 1.0 + bloom * 0.014;
      pos.z += (hash11(aRand * 123.0) - 0.5) * bloom * 0.18;
      vAlpha *= 0.86 + bloom * 0.22;
      maxRippleAmp = max(maxRippleAmp, bloom * 0.10);
    }
  }

  // ====================================================
  //  \u9F20\u6807\u4EA4\u4E92 (\u4EC5 SILK)
  // ====================================================
  if (uMouseActive > 0.5 && uPreset < 0.5) {
    float mdx = pos.x - uMouseXY.x;
    float mdy = pos.y - uMouseXY.y;
    float md = sqrt(mdx*mdx + mdy*mdy);
    if (md < 1.0) {
      float push = (1.0 - md) * (1.0 - md);
      pos.z += push * 0.55;
    }
  }

  // ====================================================
  //  v8 \u624B\u52BF\u906E\u6321 \u2014 uHandActive \u662F 0..1 \u5E73\u6ED1\u8FC7\u6E21, \u5927\u534A\u5F84\u63A8\u5F00
  // ====================================================
  if (uHandActive > 0.01) {
    float hdx = pos.x - uHandXY.x;
    float hdy = pos.y - uHandXY.y;
    float hd = sqrt(hdx*hdx + hdy*hdy);
    float rad = 1.55;
    if (hd < rad) {
      float push = (rad - hd) / rad;
      push = push * push * uHandActive;
      pos.z += push * 1.10;
      vec2 outDir = vec2(hdx, hdy) / max(0.001, hd);
      pos.xy += outDir * push * 0.28;
    }
  }
  if (uGestureGrip > 0.001) {
    float grip = clamp(uGestureGrip, 0.0, 1.0);
    float gripWave = 0.5 + 0.5 * sin(uTime * 2.2 + aRand * 6.2831);
    pos.xy *= mix(1.0, 0.66 + gripWave * 0.035, grip);
    pos.z += grip * (0.18 + uBass * 0.22 + gripWave * 0.10);
  }

  // ====================================================
  //  \u901A\u7528: \u79BB\u6563\u611F / \u626D\u66F2
  // ====================================================
  if (uScatter > 0.001) {
    vec2 jdir = vec2(cos(aRand * 6.2831), sin(aRand * 6.2831));
    pos.xy += jdir * uScatter * (0.05 + uTreble * 0.10);
  }
  if (uTwist > 0.001 && uPreset < 0.5) {
    float ta = uTwist * pos.z * 0.6;
    float cs = cos(ta), sn = sin(ta);
    pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;
  }

  // \u989C\u8272
  float vinylHiResGuard = smoothstep(1.08, 1.55, uCoverRes) * step(3.5, uPreset) * (1.0 - step(4.5, uPreset));
  float edgeBoost = uEdgeEnabled * edgeVal * mix(1.0, 0.42, vinylHiResGuard);
  vSourceLum = dot(max(vColor, vec3(0.0)), vec3(0.299, 0.587, 0.114));
  float blackParticleGuard = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  vEdgeBoost = edgeBoost * (uPreset > 3.5 ? 0.22 : 1.0) * (1.0 - blackParticleGuard);
  vColor = pow(max(vColor, vec3(0.0)), vec3(1.0 / max(0.35, uColorBoost)));
  float edgeColorMix = edgeBoost * (uPreset > 3.5 ? 0.20 : 0.50) * (1.0 - blackParticleGuard);
  vColor = mix(vColor, vColor + vec3(0.20), edgeColorMix);
  float tintLum = max(max(vColor.r, vColor.g), vColor.b);
  vec3 tintedColor = uTintColor * max(0.24, tintLum * 1.12);
  vColor = mix(vColor, tintedColor, clamp(uTintStrength, 0.0, 1.0) * (1.0 - blackParticleGuard));

  vBright = 0.82 + maxRippleAmp * 0.55 + uBass * 0.10 + edgeBoost * 0.30 + uEnergy * 0.05 + uBurstAmt * 0.40;
  if (uPreset > 4.5) {
    vBright = 0.94 + maxRippleAmp * 0.34 + uBass * 0.020 + uEnergy * 0.026 + uBurstAmt * 0.025;
  } else if (uPreset > 3.5) {
    vBright = 0.94 + maxRippleAmp * 0.64 + uBass * 0.08 + edgeBoost * 0.12 + uEnergy * 0.05 + uBeat * 0.16 + uBurstAmt * 0.16;
  }
  vRipple = clamp(maxRippleAmp * 1.5, 0.0, 1.0);

  if (uHasDepth > 0.5 && uPreset < 0.5) {
    float bgMul = mix(1.0, 0.55, uBgFade * (1.0 - fgMask));
    vBright *= bgMul;
  }
  vBright += uGestureGrip * 0.22;
  float loadingMistSize = 1.0;

  // \u52A0\u8F7D\u5F62\u6001: \u96FE\u72B6\u5FAE\u5C18\u6D41\uFF0C\u907F\u514D\u5EC9\u4EF7\u65CB\u8F6C\u5706\u73AF
  if (uLoading > 0.001) {
    float mistSeed = hash11(aRand * 931.7);
    float mistLayer = floor(mistSeed * 4.0);
    float layerN = (mistLayer + 0.5) / 4.0;
    float mistAngle = aRand * 6.2831 + uTime * (0.16 + mistSeed * 0.18) + snoise(vec3(aRand * 2.1, uTime * 0.24, 2.0)) * 1.85;
    float mistR = mix(1.35, 3.15, sqrt(hash11(aRand * 127.3))) * (1.0 + sin(uTime * 0.42 + aRand * 7.0) * 0.13);
    vec2 mistCurl = vec2(
      snoise(vec3(aRand * 4.1, uTime * 0.32, 3.0)),
      snoise(vec3(aRand * 4.7, uTime * 0.30, 8.0))
    );
    float mistBreath = 0.5 + 0.5 * sin(uTime * (0.82 + mistSeed * 0.55) + aRand * 17.0);
    float mistRibbon = sin(mistAngle * (1.35 + layerN * 0.55) + uTime * 0.34 + mistSeed * 4.0);
    float glowPick = smoothstep(0.88, 0.997, hash11(aRand * 1501.0 + mistLayer * 17.0));
    float dustPick = 0.34 + glowPick * 0.66;
    vec3 mistPos = vec3(
      cos(mistAngle) * mistR * (1.24 + mistCurl.x * 0.16) + mistCurl.x * 0.72,
      sin(mistAngle * 0.82 + mistRibbon * 0.25) * mistR * (0.56 + layerN * 0.10) + mistCurl.y * 0.62,
      (layerN - 0.5) * 4.85 + mistCurl.x * 0.56 + mistBreath * 0.36 + mistRibbon * 0.24
    );
    vec3 mistCol = mix(vec3(0.62, 0.86, 0.84), vec3(0.36, 0.46, 0.78), mistSeed);
    mistCol = mix(mistCol, vec3(0.94, 1.0, 0.97), glowPick * (0.45 + mistBreath * 0.35));
    vColor = mix(vColor, mistCol, uLoading * 0.78);
    vBright = mix(vBright, 0.20 + mistBreath * 0.18 + abs(mistCurl.x) * 0.06 + glowPick * (0.72 + abs(mistRibbon) * 0.24), uLoading);
    vAlpha = mix(vAlpha, 0.08 + mistBreath * 0.11 + dustPick * 0.11 + glowPick * 0.30, uLoading);
    pos = mix(pos, mistPos, uLoading);
    loadingMistSize = 1.26 + mistBreath * 0.24 + abs(mistRibbon) * 0.14 + glowPick * 0.78;
  }

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 36.0 / max(0.5, -mvPos.z);
  float audioBoost = 1.0 + maxRippleAmp * 0.7 + edgeBoost * 0.55 + uBeat * 0.30 + uBurstAmt * 0.5;
  float sz = clamp(depthSize * audioBoost, 1.05, 4.95);
  if (uPreset > 4.5) {
    float flowDrive = uBass * 0.070 + uMid * 0.046 + uTreble * 0.060 + uBurstAmt * 0.090 + uBeat * 0.055;
    sz = clamp(depthSize * (1.05 + flowDrive), 1.00, 5.45);
  } else if (uPreset > 3.5) {
    float ringDrive = uBass * 0.30 + uMid * 0.18 + uTreble * 0.22 + uBeat * 0.30;
    sz = clamp(depthSize * (0.90 + ringDrive * 0.62), 1.05, 3.90);
  }
  // \u52A0\u8F7D\u6001\u4E0B\u7C92\u5B50\u7A0D\u5927
  sz = mix(sz, sz * loadingMistSize, uLoading);
  gl_PointSize = sz * uPixel * uPointScale;
  gl_Position = projectionMatrix * mvPos;
}
`,fs=`
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha, uPreset, uParticleDim;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.02) discard;
  vec3 col = vColor * vBright;
  col = mix(col, col * 1.3 + vec3(0.05), vEdgeBoost * 0.35);
  col = mix(col, col * 1.2, vRipple * 0.4);
  float keepBlack = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  float nonBlack = 1.0 - keepBlack;
  float dotDist = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float readableRim = smoothstep(0.44, 0.94, dotDist) * (1.0 - smoothstep(0.94, 1.08, dotDist)) * tex.a;
  float outLum = dot(col, vec3(0.299, 0.587, 0.114));
  float lightParticle = smoothstep(0.50, 0.82, outLum) * nonBlack;
  float darkParticle = (1.0 - smoothstep(0.20, 0.50, outLum)) * nonBlack;
  col = mix(col, vec3(0.0), readableRim * lightParticle * 0.38);
  col = mix(col, vec3(1.0), readableRim * darkParticle * 0.20);
  col = clamp(col, vec3(0.0), vec3(1.6));
  gl_FragColor = vec4(col, tex.a * uAlpha * uParticleDim * vAlpha);
}
`,material=new THREE.ShaderMaterial({uniforms,vertexShader:vs,fragmentShader:fs,transparent:!0,depthWrite:!1,blending:THREE.NormalBlending}),bloomVs=vs.replace("uniform float uMouseActive, uPixel, uColorMixT, uLoading;","uniform float uMouseActive, uPixel, uColorMixT, uLoading, uBloomSize;").replace("gl_PointSize = sz * uPixel * uPointScale;","gl_PointSize = sz * uPixel * uPointScale * uBloomSize;"),bloomFs=`
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha, uBloomStrength, uPreset, uParticleDim;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.01) discard;
  float soft = tex.a * tex.a;
  vec3 col = vColor * (0.55 + vBright * 0.62);
  col = mix(col, col + vec3(0.22, 0.18, 0.10), vEdgeBoost * 0.35);
  col = clamp(col, vec3(0.0), vec3(1.8));
  float pulse = 1.0 + vRipple * 0.65;
  float keepBlack = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  float bloomKeep = 1.0 - keepBlack * 0.92;
  gl_FragColor = vec4(col, soft * uAlpha * uBloomStrength * uParticleDim * pulse * 0.55 * vAlpha * bloomKeep);
}
`,bloomMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:bloomVs,fragmentShader:bloomFs,transparent:!0,depthWrite:!1,depthTest:!1,blending:THREE.AdditiveBlending}),bloomParticles=new THREE.Points(geo,bloomMaterial);bloomParticles.frustumCulled=!1,bloomParticles.renderOrder=0,scene.add(bloomParticles);var particles=new THREE.Points(geo,material);particles.frustumCulled=!1,particles.renderOrder=1,scene.add(particles),console.log("v7 shell loaded, JS pending");var FLOAT_COUNT=1300,floatGroup=null,floatPositionsArr=null,floatBaseArr=null,floatPhaseArr=null,floatColorArr=null;function createFloatLayer(){fx.floatLayer=!1,uniforms.uFloatAlpha.value=0,floatGroup&&destroyFloatLayer();return;for(var e,t,a,r;r<FLOAT_COUNT;r++){var o=r<FLOAT_COUNT*.76,l,s,i;if(o){var u=Math.random()*Math.PI*2,n=.62+Math.pow(Math.random(),.72)*2.75,h=(Math.random()-.5)*.62;l=Math.cos(u)*n,s=Math.sin(u)*n*.54+h,i=(Math.random()-.5)*2.4-.25}else l=(Math.random()-.5)*8.4,s=(Math.random()-.5)*5.8,i=(Math.random()-.5)*5.6;floatBaseArr[r*3]=l,floatBaseArr[r*3+1]=s,floatBaseArr[r*3+2]=i,floatPositionsArr[r*3]=l,floatPositionsArr[r*3+1]=s,floatPositionsArr[r*3+2]=i,floatPhaseArr[r*3]=Math.random()*Math.PI*2,floatPhaseArr[r*3+1]=Math.random()*Math.PI*2,floatPhaseArr[r*3+2]=Math.random()*Math.PI*2,a[r]=.15+Math.random()*.35;var v=.88+Math.random()*.12;floatColorArr[r*3]=v,floatColorArr[r*3+1]=v,floatColorArr[r*3+2]=v,t[r]=Math.random()}var f,m,c}function destroyFloatLayer(){floatGroup&&(scene.remove(floatGroup),floatGroup.geometry.dispose(),floatGroup.material.dispose(),floatGroup=null)}var SKULL_PRESET_INDEX=6,SKULL_MODEL_BASE_ROTATION_X=-.26,SKULL_MODEL_BASE_ROTATION_Y=0,SKULL_MODEL_SCALE=2.34,SKULL_MODEL_BASE_POSITION={x:0,y:.22,z:.1},skullAmpPulse=0,skullBeatFlash=0,skullJawOpen=0,skullCameraBlend=0,skullWheelZoom=0,skullWheelZoomTarget=0,skullCameraTargetPos=new THREE.Vector3,skullCameraTargetLook=new THREE.Vector3,skullCameraBasePos=new THREE.Vector3,skullCameraBaseLook=new THREE.Vector3,skullCameraShelfPos=new THREE.Vector3,skullCameraShelfLook=new THREE.Vector3,skullCameraMixedLook=new THREE.Vector3,skullShelfCameraMix=0,skullLyricMouthLocal=new THREE.Vector3(.025,-.72,.62),skullLyricMouthTarget=new THREE.Vector3,skullLyricMouthForward=new THREE.Vector3,skullLyricMouthQuat=new THREE.Quaternion,skullLyricReadableQuat=new THREE.Quaternion,skullParticleGroup=null,skullParticleOpacity=0,skullParticleAsset={data:null,promise:null,failed:!1},skullBaseColors={boneA:new THREE.Color("#b8ae98"),boneB:new THREE.Color("#fff4d8"),shadow:new THREE.Color("#100d0d"),light:new THREE.Color("#ffe3a0"),neutralBoneA:new THREE.Color("#9fb7c8"),neutralBoneB:new THREE.Color("#eef9ff"),neutralShadow:new THREE.Color("#070b12"),neutralLight:new THREE.Color("#d6f3ff")},skullTintScratch={tint:new THREE.Color,soft:new THREE.Color,bright:new THREE.Color,dark:new THREE.Color,boneA:new THREE.Color,boneB:new THREE.Color,shadow:new THREE.Color,light:new THREE.Color};function effectiveSkullVisualTint(){var e=stageLyrics&&(stageLyrics.coverPalette||stageLyrics.palette)||{},t=fx&&fx.visualTintMode==="custom",a=t?fx.visualTintColor:e.secondary||e.primary||fx.visualTintColor||fxDefaults.visualTintColor||"#9db8cf";a=normalizeHexColor(a||"#9db8cf","#9db8cf");var r=t?.98:e&&(e.secondary||e.primary)?.3:.14;return{color:a,strength:r,custom:t}}function syncSkullParticleColors(){if(!(!skullParticleGroup||!skullParticleGroup.material||!skullParticleGroup.material.uniforms)){var e=skullParticleGroup.material.uniforms,t=effectiveSkullVisualTint(),a=!!t.custom,r=clampRange(Number(t.strength)||0,0,a?.99:.78);skullTintScratch.tint.set(t.color),skullTintScratch.soft.copy(skullTintScratch.tint).lerp(new THREE.Color("#e8f5ff"),a?.05:.28),skullTintScratch.bright.copy(skullTintScratch.tint).lerp(new THREE.Color(a?"#f6fbff":"#fff7d6"),a?.14:.46),skullTintScratch.dark.copy(skullTintScratch.tint).lerp(new THREE.Color("#05070c"),a?.74:.72),skullTintScratch.boneA.copy(a?skullBaseColors.neutralBoneA:skullBaseColors.boneA).lerp(skullTintScratch.soft,r*(a?.99:.64)),skullTintScratch.boneB.copy(a?skullBaseColors.neutralBoneB:skullBaseColors.boneB).lerp(skullTintScratch.bright,r*(a?.94:.46)),skullTintScratch.shadow.copy(a?skullBaseColors.neutralShadow:skullBaseColors.shadow).lerp(skullTintScratch.dark,r*(a?.72:.42)),skullTintScratch.light.copy(a?skullBaseColors.neutralLight:skullBaseColors.light).lerp(skullTintScratch.bright,r*(a?.98:.76)),e.uColorA&&e.uColorA.value.copy(skullTintScratch.boneA),e.uColorB&&e.uColorB.value.copy(skullTintScratch.boneB),e.uShadow&&e.uShadow.value.copy(skullTintScratch.shadow),e.uLight&&e.uLight.value.copy(skullTintScratch.light)}}function buildSkullParticleGeometryFromAsset(e){for(var t=Math.floor((e&&e.length||0)/5),a=new THREE.BufferGeometry,r=new Float32Array(t*3),o=new Float32Array(t),l=new Float32Array(t),s=0;s<t;s++)r[s*3]=e[s*5],r[s*3+1]=e[s*5+1],r[s*3+2]=e[s*5+2],l[s]=e[s*5+3],o[s]=e[s*5+4];return a.setAttribute("position",new THREE.BufferAttribute(r,3)),a.setAttribute("seed",new THREE.BufferAttribute(o,1)),a.setAttribute("kind",new THREE.BufferAttribute(l,1)),a}function loadSkullParticleAsset(){return skullParticleAsset.data||skullParticleAsset.promise||skullParticleAsset.failed?skullParticleAsset.promise||Promise.resolve(skullParticleAsset.data):typeof fetch!="function"?(skullParticleAsset.failed=!0,Promise.resolve(null)):(skullParticleAsset.promise=fetch("assets/skull-decimation-points.bin?v=regular-surface-teeth-soften-20260621",{cache:"reload"}).then(function(e){if(!e.ok)throw new Error("skull asset "+e.status);return e.arrayBuffer()}).then(function(e){if(!e||e.byteLength<20||e.byteLength%20!==0)throw new Error("invalid skull asset");return skullParticleAsset.data=new Float32Array(e),skullParticleAsset.promise=null,skullParticleAsset.data}).catch(function(e){return console.warn("skull particle asset load failed:",e),skullParticleAsset.failed=!0,skullParticleAsset.promise=null,null}),skullParticleAsset.promise)}function skullPushPoint(e,t,a,r,o,l,s){e.push(r,o,l),t.push(Math.random()*1e3),a.push(s??0)}function skullPushCurve(e,t,a,r,o,l,s){s=s??.012;for(var i=0;i<r;i++){var u=r>1?i/(r-1):0,n=o(u);skullPushPoint(e,t,a,n.x+(Math.random()-.5)*s,n.y+(Math.random()-.5)*s,n.z+(Math.random()-.5)*s,l)}}function createSkullParticleLayer(){if(skullParticleGroup)return skullParticleGroup;var e=skullParticleAsset.data;if(!e)return null;var t=[],a=[],r=[];if(!e){let E=function(p,d,y){var M=Math.cos(y),x=Math.sin(y);return{x:p*M-d*x,y:p*x+d*M}},S=function(p,d,y,M){if(y<.16)return!1;var x=E(p-M*.38,d-.02,M*.1),H=Math.pow(Math.abs(x.x)/.34,1.7)+Math.pow(Math.abs(x.y)/.215,1.34),D=x.y<.22-Math.abs(x.x)*.12&&x.y>-.24+Math.abs(x.x)*.1;return H<1&&D},T=function(p,d,y){if(y<.2||d>-.12||d<-.62)return!1;var M=clampRange((-.12-d)/.5,0,1),x=.05+M*.185;return Math.abs(p)<x&&y>.38+M*.18},k=function(p,d,y){return y>.18&&d<-.66&&d>-1.03&&Math.abs(p)<.3},w=function(p,d,y,M,x,H,D,W,V,U,K){for(var G=0,_=0;G<p&&_<p*8;){_++;var N=K?-Math.PI*.07+Math.random()*Math.PI*1.14:Math.random()*Math.PI*2,I=Math.acos(1-Math.random()*2),Y=Math.sin(I)*Math.cos(N),X=Math.cos(I),j=Math.sin(I)*Math.sin(N),F=d+Y*x*(.96+Math.max(0,-X)*.12),L=y+X*H,O=M+j*D;if(!(L<W||L>V)&&!(S(F,L,O,-1)||S(F,L,O,1)||T(F,L,O)||k(F,L,O))){var q=O>.18&&L<-.18&&L>-.66&&Math.abs(F)>.26&&Math.abs(F)<.58&&Math.random()<.36;q||(skullPushPoint(t,a,r,F,L,O,U+Math.random()*.08),G++)}}};var B=E,A=S,P=T,b=k,z=w;w(3150,0,.46,0,.93,.88,.58,-.16,1.35,.055,!0),w(2100,0,-.34,.1,.7,.66,.46,-.95,.14,.1,!0);for(var o=0;o<1450;o++){var l=Math.random()*Math.PI*2,s=Math.random(),i=-1.16+s*.48,u=clampRange((i+1.16)/.48,0,1),n=.32+u*.31,h=.22+u*.18,v=Math.cos(l)*n,f=.22+Math.sin(l)*h;k(v,i,f)||i>-.94&&Math.abs(v)<.22&&f>.18||skullPushPoint(t,a,r,v,i,f,.15+Math.random()*.1)}[-1,1].forEach(function(p){var d=p*.38;skullPushCurve(t,a,r,520,function(y){var M=y*Math.PI*2,x=Math.cos(M)*(.345+Math.sin(M*2)*.012),H=Math.sin(M)*(.205+Math.cos(M*2)*.01),D=E(x,H,-p*.1);return{x:d+D.x,y:.02+D.y-Math.max(0,Math.cos(M))*.018,z:.72+Math.sin(M*2)*.03}},.96,.01),skullPushCurve(t,a,r,330,function(y){var M=p*(.13+y*.58),x=.245-y*.085+Math.sin(y*Math.PI)*.055;return{x:M,y:x,z:.66+Math.sin(y*Math.PI)*.055}},.98,.01),skullPushCurve(t,a,r,300,function(y){return{x:p*(.3+y*.47),y:-.18-y*.25+Math.sin(y*Math.PI)*.07,z:.69-y*.095}},.84,.012),skullPushCurve(t,a,r,330,function(y){return{x:p*(.62-y*.2),y:-.28-y*.55+Math.sin(y*Math.PI)*.065,z:.5+Math.sin(y*Math.PI)*.07}},.72,.014)}),skullPushCurve(t,a,r,360,function(p){var d=-.72+p*1.44;return{x:d,y:.235-Math.abs(d)*.055+Math.sin(p*Math.PI)*.035,z:.62+Math.sin(p*Math.PI)*.04}},.86,.012),[-1,1].forEach(function(p){skullPushCurve(t,a,r,260,function(d){return{x:p*(.035+d*.205),y:-.15-d*.43,z:.79-d*.035}},.98,.007)}),skullPushCurve(t,a,r,240,function(p){var d=-.25+p*.5;return{x:d,y:-.62+Math.sin(p*Math.PI)*.03,z:.7}},.86,.008),skullPushCurve(t,a,r,420,function(p){var d=Math.PI+p*Math.PI;return{x:Math.cos(d)*.5,y:-.98+Math.sin(d)*.205,z:.46+Math.sin(p*Math.PI)*.075}},.82,.014),skullPushCurve(t,a,r,360,function(p){var d=-.39+p*.78;return{x:d,y:-.7+Math.sin(p*Math.PI)*.018,z:.73}},.96,.006),skullPushCurve(t,a,r,320,function(p){var d=-.36+p*.72;return{x:d,y:-1.005-Math.sin(p*Math.PI)*.018,z:.7}},.78,.008);for(var m=-4;m<=4;m++){var c=m*.082,g=m===0?.3:.25+(4-Math.abs(m))*.012;skullPushCurve(t,a,r,58,function(p){return{x:c+Math.sin(p*Math.PI)*.006,y:-.715-p*g,z:.735-p*.02}},.94,.004)}skullPushCurve(t,a,r,520,function(p){var d=Math.PI*.12+p*Math.PI*.76;return{x:Math.cos(d)*.98,y:.42+Math.sin(d)*.92,z:.48+Math.sin(p*Math.PI)*.1}},.7,.012),skullPushCurve(t,a,r,360,function(p){var d=p*Math.PI*2;return{x:Math.cos(d)*.52,y:-1.19+Math.sin(d)*.082,z:.24+Math.sin(d*2)*.028}},.72,.01)}var R=e?buildSkullParticleGeometryFromAsset(e):new THREE.BufferGeometry;e||(R.setAttribute("position",new THREE.BufferAttribute(new Float32Array(t),3)),R.setAttribute("seed",new THREE.BufferAttribute(new Float32Array(a),1)),R.setAttribute("kind",new THREE.BufferAttribute(new Float32Array(r),1)));var C=new THREE.ShaderMaterial({uniforms:{uMap:{value:dotTexture},uTime:uniforms.uTime,uPixel:uniforms.uPixel,uBass:uniforms.uBass,uMid:uniforms.uMid,uTreble:uniforms.uTreble,uBeat:uniforms.uBeat,uJawOpen:{value:0},uSkullFlash:{value:0},uPointScale:uniforms.uPointScale,uBloomStrength:uniforms.uBloomStrength,uColorBoost:uniforms.uColorBoost,uOpacity:{value:0},uColorA:{value:new THREE.Color("#b8ae98")},uColorB:{value:new THREE.Color("#fff4d8")},uShadow:{value:new THREE.Color("#100d0d")},uLight:{value:new THREE.Color("#ffe3a0")}},vertexShader:["precision highp float;","attribute float seed,kind;","uniform float uTime,uPixel,uPointScale,uBloomStrength,uColorBoost;","uniform float uBass,uMid,uTreble,uBeat,uJawOpen,uSkullFlash;","varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;","void main(){","  vec3 pos = position;","  float jawGroup = step(1.0, kind);","  float boneKind = fract(kind);","  vKind = boneKind;","  vec3 n = normalize(vec3(position.x * 0.82, position.y * 0.68, position.z * 1.22 + 0.16));","  float toothBand = smoothstep(0.48, 0.70, position.z) * (1.0 - smoothstep(0.27, 0.48, abs(position.x))) * (1.0 - smoothstep(0.18, 0.46, abs(position.y + 0.72)));","  float toothNoise = fract(sin(seed * 21.731 + floor((position.x + 0.52) * 21.0) * 5.137) * 43758.5453);","  pos.y += toothBand * (toothNoise - 0.5) * 0.020;","  pos.z += toothBand * (fract(sin(seed * 17.923 + position.y * 31.0) * 24634.6345) - 0.5) * 0.012;","  float jawSidePull = jawGroup * smoothstep(-0.42, -1.06, position.y) * smoothstep(0.24, 0.62, abs(position.x)) * (1.0 - smoothstep(0.78, 1.04, abs(position.x))) * smoothstep(0.16, 0.70, position.z);","  pos.x *= 1.0 - jawSidePull * 0.10;","  float fallbackJaw = smoothstep(-0.48, -0.90, position.y) * smoothstep(0.08, 0.52, position.z) * (1.0 - smoothstep(0.62, 0.96, abs(position.x)));","  float jawMask = jawGroup;","  float jawSideAnchor = smoothstep(0.36, 0.66, abs(position.x)) * (1.0 - smoothstep(0.78, 0.98, abs(position.x))) * smoothstep(-0.34, -0.74, position.y) * (1.0 - smoothstep(0.62, 0.86, position.z));","  float jawMotion = jawMask * (1.0 - jawSideAnchor * 0.32);","  vec2 jawHinge = vec2(-0.45, 0.18);","  float jawAngle = uJawOpen * 0.52 * jawMotion;","  float jc = cos(jawAngle);","  float js = sin(jawAngle);","  vec2 jr = pos.yz - jawHinge;","  vec2 openedJaw = vec2(jr.x * jc - jr.y * js, jr.x * js + jr.y * jc) + jawHinge;","  pos.yz = mix(pos.yz, openedJaw, jawMotion);","  float jawDrop = jawMotion * smoothstep(-0.32, -0.88, position.y) * (0.58 + smoothstep(0.18, 0.62, abs(position.x)) * 0.04);","  float openDrive = clamp(uJawOpen, 0.0, 1.25);","  pos.y -= jawDrop * (0.038 + openDrive * 0.100);","  pos.z += jawDrop * (0.003 + openDrive * 0.014);","  float ampDrive = smoothstep(0.20, 0.82, uBass * 0.44 + uMid * 0.22 + uBeat * 0.72);","  float ampPhase = 0.50 + 0.50 * sin(uTime * (1.05 + uMid * 0.30) + seed * 6.2831);","  vFlash = clamp(uSkullFlash * (0.68 + ampPhase * 0.32), 0.0, 1.0);","  vAmp = clamp(ampDrive * 0.045 + vFlash * 0.92 + uTreble * 0.012, 0.0, 1.0);","  vec4 mv = modelViewMatrix * vec4(pos, 1.0);","  float dist = max(0.55, -mv.z);","  vec3 vn = normalize(normalMatrix * n);","  vec3 keyDir = normalize(vec3(-0.48, 0.64, 0.60));","  vec3 lowDir = normalize(vec3(-0.10, -0.78, 0.34));","  vec3 fillDir = normalize(vec3(0.36, -0.04, 0.64));","  vec3 rimDir = normalize(vec3(0.88, 0.18, -0.44));","  float key = pow(max(dot(vn, keyDir), 0.0), 1.18);","  float low = pow(max(dot(vn, lowDir), 0.0), 1.34) * 0.10;","  float fill = max(dot(vn, fillDir), 0.0) * 0.055;","  float gothicShadow = smoothstep(-0.10, 0.36, dot(vn, normalize(vec3(0.44, -0.06, -0.58))));","  float dentalLift = smoothstep(0.48, 0.72, position.z) * (1.0 - smoothstep(0.30, 0.54, abs(position.x))) * (1.0 - smoothstep(0.18, 0.48, abs(position.y + 0.70))) * (0.62 + toothNoise * 0.20);","  vRim = pow(max(dot(vn, rimDir), 0.0), 2.50) * (0.24 + uBloomStrength * 0.08 + vFlash * 0.62);","  float dust = fract(sin(seed * 13.871 + position.x * 19.7 + position.y * 7.1) * 43758.5453);","  vDensity = clamp(0.30 + key * 0.70 + vRim * 0.24 - gothicShadow * 0.24 + dust * 0.025 + vFlash * 0.08, 0.16, 1.20);","  vLight = clamp(0.115 + key * 1.02 + low + fill + dentalLift * 0.20 + boneKind * 0.070 + vAmp * 0.56 - gothicShadow * 0.08, 0.035, 1.72);","  float scaleCtl = clamp(uPointScale, 0.48, 2.35);","  float size = (0.035 + boneKind * 0.026) * (0.84 + vDensity * 0.22 + vLight * 0.13 + uBloomStrength * 0.030 + vFlash * 0.18);","  gl_PointSize = clamp(size * uPixel * scaleCtl * 128.0 / dist, 0.95, 7.60);","  gl_Position = projectionMatrix * mv;","}"].join(`
`),fragmentShader:["precision highp float;","uniform sampler2D uMap;","uniform vec3 uColorA,uColorB,uShadow,uLight;","uniform float uOpacity,uBloomStrength,uColorBoost;","varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;","void main(){","  vec4 tex = texture2D(uMap, gl_PointCoord);","  if(tex.a < 0.070) discard;","  float contrast = clamp(uColorBoost, 0.50, 2.00);","  float lit = clamp(pow(vLight, mix(1.18, 0.74, (contrast - 0.50) / 1.50)), 0.0, 1.28);","  vec3 bone = mix(uColorA, uColorB, clamp((vKind - 0.34) * 2.0 + lit * 0.18, 0.0, 1.0));","  vec3 col = mix(uShadow, bone, clamp(lit, 0.0, 1.0));","  col = mix(col, uLight, clamp(vRim * (0.14 + uBloomStrength * 0.035 + vFlash * 0.40), 0.0, 0.54));","  col = mix(col, uLight, clamp(vAmp * (0.09 + uBloomStrength * 0.025) + vFlash * 0.56, 0.0, 0.68));","  float alpha = tex.a * uOpacity * clamp(0.20 + lit * 0.44 + vDensity * 0.40 + vRim * 0.10 + vFlash * 0.46, 0.12, 1.56);","  gl_FragColor = vec4(col, alpha);","}"].join(`
`),transparent:!0,depthWrite:!1,depthTest:!0,blending:THREE.NormalBlending});return skullParticleGroup=new THREE.Points(R,C),skullParticleGroup.frustumCulled=!1,skullParticleGroup.visible=!1,skullParticleGroup.userData.source=e?"asset":"fallback",skullParticleGroup.position.set(SKULL_MODEL_BASE_POSITION.x,SKULL_MODEL_BASE_POSITION.y,SKULL_MODEL_BASE_POSITION.z),skullParticleGroup.scale.setScalar(SKULL_MODEL_SCALE),skullParticleGroup.rotation.x=SKULL_MODEL_BASE_ROTATION_X,skullParticleGroup.rotation.y=SKULL_MODEL_BASE_ROTATION_Y,skullParticleGroup.renderOrder=32,syncSkullParticleColors(),scene.add(skullParticleGroup),skullParticleGroup}function isSkullShelfCompositionActive(){return!(fx&&fx.preset===SKULL_PRESET_INDEX)||!shelfManager||!shelfManager.getMode||shelfManager.getMode()!=="side"?!1:shelfPinnedOpen||shelfVisibility>.18?!0:!!(shelfManager.hasOpenContent&&shelfManager.hasOpenContent())}function clearSkullPresetResidue(){skullParticleOpacity=0,skullAmpPulse=0,skullBeatFlash=0,skullJawOpen=0,skullCameraBlend=0,skullParticleGroup&&(skullParticleGroup.visible=!1,skullParticleGroup.material&&skullParticleGroup.material.uniforms&&(skullParticleGroup.material.uniforms.uOpacity&&(skullParticleGroup.material.uniforms.uOpacity.value=0),skullParticleGroup.material.uniforms.uJawOpen&&(skullParticleGroup.material.uniforms.uJawOpen.value=0),skullParticleGroup.material.uniforms.uSkullFlash&&(skullParticleGroup.material.uniforms.uSkullFlash.value=0)))}function resetSkullPresetView(e,t){if(t=t||{},!!(fx&&fx.preset===SKULL_PRESET_INDEX)&&(skullWheelZoomTarget=0,t.smooth||(skullWheelZoom=0),skullCameraBlend=Math.max(skullCameraBlend,1),!t.keepLyricLock&&typeof stageLyrics<"u"&&stageLyrics&&stageLyrics.group&&stageLyrics.group.userData&&(stageLyrics.group.userData.skullMouthLocked=!1),!t.keepLyricLock&&typeof requestStageLyricCameraSnap=="function"&&requestStageLyricCameraSnap(10),!(!e||!skullParticleGroup))){var a=isSkullShelfCompositionActive();if(skullShelfCameraMix=a?1:0,skullParticleGroup.position.set(a?-1.18:SKULL_MODEL_BASE_POSITION.x,a?.32:SKULL_MODEL_BASE_POSITION.y,SKULL_MODEL_BASE_POSITION.z),skullParticleGroup.scale.setScalar(a?3.02:SKULL_MODEL_SCALE),skullParticleGroup.rotation.set(SKULL_MODEL_BASE_ROTATION_X,SKULL_MODEL_BASE_ROTATION_Y,0),skullParticleGroup.updateMatrixWorld(!0),camera&&typeof setSkullCameraTargetVectors=="function"){var r=innerHeight>innerWidth*1.08;setSkullCameraTargetVectors(skullCameraTargetPos,skullCameraTargetLook,r,a,0),camera.position.copy(skullCameraTargetPos),skullCameraMixedLook.copy(skullCameraTargetLook),camera.lookAt(skullCameraMixedLook),camera.updateProjectionMatrix()}}}function skullBreathOffset(e,t){var a=t?.7:1;return{x:a*(Math.sin(e*.33+1.7)*.028+Math.sin(e*.61+.4)*.01),y:a*(Math.sin(e*.38+.2)*.036+Math.sin(e*.83+2.1)*.012),z:a*(Math.sin(e*.24+2.6)*.026)}}function setSkullCameraTargetVectors(e,t,a,r,o){if(o=Number(o)||0,r){e.set(a?-.06:0,a?-2.36:-2.5,(a?4.88:4.96)+o*.78),t.set(a?-.04:0,a?-.26:-.2,.03);return}e.set(0,a?-2.38:-2.52,(a?4.92:4.98)+o),t.set(0,a?-.28:-.2,.02)}function applySkullCameraPose(e){if(!(freeCamera&&(freeCamera.active||freeCamera.locked||freeCamera.resetTween))){var t=fx&&fx.preset===SKULL_PRESET_INDEX;if(skullCameraBlend+=((t?1:0)-skullCameraBlend)*Math.min(1,e*(t?4.8:7.2)),!(skullCameraBlend<.002)){skullWheelZoom+=(skullWheelZoomTarget-skullWheelZoom)*Math.min(1,e*8);var a=innerHeight>innerWidth*1.08,r=isSkullShelfCompositionActive(),o=r?1:0;skullShelfCameraMix+=(o-skullShelfCameraMix)*Math.min(1,e*(o>skullShelfCameraMix?4.6:5.8)),Math.abs(skullShelfCameraMix-o)<.002&&(skullShelfCameraMix=o),setSkullCameraTargetVectors(skullCameraBasePos,skullCameraBaseLook,a,!1,skullWheelZoom),setSkullCameraTargetVectors(skullCameraShelfPos,skullCameraShelfLook,a,!0,skullWheelZoom),skullCameraTargetPos.copy(skullCameraBasePos).lerp(skullCameraShelfPos,skullShelfCameraMix),skullCameraTargetLook.copy(skullCameraBaseLook).lerp(skullCameraShelfLook,skullShelfCameraMix),camera.position.lerp(skullCameraTargetPos,skullCameraBlend),skullCameraMixedLook.set(orbit.lookAt.x,orbit.lookAt.y,orbit.lookAt.z).lerp(skullCameraTargetLook,skullCameraBlend),camera.lookAt(skullCameraMixedLook),camera.updateProjectionMatrix()}}}function updateSkullParticleLayer(e){var t=fx&&fx.preset===SKULL_PRESET_INDEX;if(t&&!skullParticleAsset.data&&!skullParticleAsset.failed){loadSkullParticleAsset();return}if(!(t&&!skullParticleAsset.data)&&(t&&createSkullParticleLayer(),!!skullParticleGroup)){var a=t?1:0;if(skullParticleOpacity+=(a-skullParticleOpacity)*Math.min(1,e*(t?3.2:2.4)),skullParticleOpacity<.006&&!t){skullParticleGroup.visible=!1;return}skullParticleGroup.visible=!0,skullParticleGroup.material.uniforms.uOpacity.value=skullParticleOpacity*clampRange(.78+(fx.intensity||.85)*.18,.56,1);var r=clampRange(Math.max(0,beatPulse-.16)/.84,0,1.35),o=clampRange(Math.pow(r,1.34)*1.08+Math.max(0,bass-.6)*.18*r,0,1);skullBeatFlash+=(o-skullBeatFlash)*Math.min(1,e*(o>skullBeatFlash?24:6.2)),skullParticleGroup.material.uniforms.uSkullFlash&&(skullParticleGroup.material.uniforms.uSkullFlash.value=skullBeatFlash);var l=clampRange(.6+(.5+.5*Math.sin(uniforms.uTime.value*.5))*.05+bass*.06+skullBeatFlash*.09,.52,.88);skullJawOpen+=(l-skullJawOpen)*Math.min(1,e*(l>skullJawOpen?7.8:3.4)),skullParticleGroup.material.uniforms.uJawOpen&&(skullParticleGroup.material.uniforms.uJawOpen.value=skullJawOpen);var s=isSkullShelfCompositionActive(),i=clampRange(skullShelfCameraMix||(s?1:0),0,1),u=skullBreathOffset(uniforms.uTime.value,s),n=clampRange(bass*.006+mid*.004+skullBeatFlash*.07,0,.09);skullAmpPulse+=(n-skullAmpPulse)*Math.min(1,e*(n>skullAmpPulse?11:4));var h=3.02,v=(SKULL_MODEL_SCALE+(h-SKULL_MODEL_SCALE)*i)*(1+skullAmpPulse)*clampRange(1-skullWheelZoom*.055,.92,1.08),f=-1.18,m=.32,c=SKULL_MODEL_BASE_POSITION.x+(f-SKULL_MODEL_BASE_POSITION.x)*i+u.x,g=SKULL_MODEL_BASE_POSITION.y+(m-SKULL_MODEL_BASE_POSITION.y)*i+u.y,R=SKULL_MODEL_BASE_POSITION.z+u.z;skullParticleGroup.position.x+=(c-skullParticleGroup.position.x)*Math.min(1,e*4.2),skullParticleGroup.position.y+=(g-skullParticleGroup.position.y)*Math.min(1,e*4.8),skullParticleGroup.position.z+=(R-skullParticleGroup.position.z)*Math.min(1,e*4.2),skullParticleGroup.scale.x+=(v-skullParticleGroup.scale.x)*Math.min(1,e*4.6),skullParticleGroup.scale.y=skullParticleGroup.scale.x,skullParticleGroup.scale.z=skullParticleGroup.scale.x;var C=SKULL_MODEL_BASE_ROTATION_Y+(orbit.centerLocked?0:(headParallax.active?headParallax.x*.5:0)+gestureRotation.y),B=SKULL_MODEL_BASE_ROTATION_X+(orbit.centerLocked?0:(headParallax.active?-headParallax.y*.35:0)+gestureRotation.x),A=Math.min(1,e*7.4);skullParticleGroup.rotation.y+=(C-skullParticleGroup.rotation.y)*A,skullParticleGroup.rotation.x+=(B-skullParticleGroup.rotation.x)*A,skullParticleGroup.rotation.z+=(0-skullParticleGroup.rotation.z)*Math.min(1,e*6)}}var BACK_COVER_COUNT=3e3,backCoverGroup=null,backCoverColorArr=null;function createBackCoverLayer(){if(!backCoverGroup){for(var e=new THREE.BufferGeometry,t=new Float32Array(BACK_COVER_COUNT*3),a=new Float32Array(BACK_COVER_COUNT*3),r=new Float32Array(BACK_COVER_COUNT),o=new Float32Array(BACK_COVER_COUNT*2),l=0;l<BACK_COVER_COUNT;l++){var s=Math.random(),i=Math.random();t[l*3]=(s-.5)*PLANE_SIZE,t[l*3+1]=(i-.5)*PLANE_SIZE,t[l*3+2]=-1.5-Math.random()*.4,o[l*2]=1-s,o[l*2+1]=i,r[l]=Math.random(),a[l*3]=.7,a[l*3+1]=.6,a[l*3+2]=.8}e.setAttribute("position",new THREE.BufferAttribute(t,3)),e.setAttribute("aColor",new THREE.BufferAttribute(a,3)),e.setAttribute("aRand",new THREE.BufferAttribute(r,1)),e.setAttribute("aUv",new THREE.BufferAttribute(o,2));var u=`
    precision highp float;
    uniform float uTime, uBass, uPixel, uAlpha;
    attribute vec3 aColor;
    attribute vec2 aUv;
    attribute float aRand;
    varying vec3 vC;
    varying float vA;
    void main(){
      vec3 pos = position;
      // \u7F13\u6162\u547C\u5438
      pos.x += sin(uTime * 0.20 + aRand * 8.0) * 0.20;
      pos.y += cos(uTime * 0.18 + aRand * 6.0) * 0.22;
      pos.z += sin(uTime * 0.12 + aRand * 5.0) * 0.18 + uBass * 0.12 * sin(aRand * 11.0);
      vC = aColor;
      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float dist = -mvPos.z;
      vA = clamp(0.30 + 0.4 * sin(uTime * 0.6 + aRand * 5.0), 0.10, 0.65);
      float sz = clamp(46.0 / max(0.5, dist), 1.4, 4.5);
      gl_PointSize = sz * uPixel;
      gl_Position = projectionMatrix * mvPos;
    }
  `,n=`
    precision highp float;
    uniform sampler2D uDotTex;
    uniform float uAlpha;
    varying vec3 vC;
    varying float vA;
    void main(){
      vec4 tex = texture2D(uDotTex, gl_PointCoord);
      if (tex.a < 0.02) discard;
      gl_FragColor = vec4(vC, tex.a * vA * uAlpha);
    }
  `,h=new THREE.ShaderMaterial({uniforms:{uTime:uniforms.uTime,uBass:uniforms.uBass,uPixel:uniforms.uPixel,uDotTex:uniforms.uDotTex,uAlpha:uniforms.uAlpha},vertexShader:u,fragmentShader:n,transparent:!0,depthWrite:!1,blending:THREE.NormalBlending});backCoverGroup=new THREE.Points(e,h),backCoverGroup.frustumCulled=!1,backCoverColorArr=a,scene.add(backCoverGroup)}}function destroyBackCoverLayer(){backCoverGroup&&(scene.remove(backCoverGroup),backCoverGroup.geometry.dispose(),backCoverGroup.material.dispose(),backCoverGroup=null,backCoverColorArr=null)}function refreshBackCoverColorsFromCanvas(e){if(!(!backCoverGroup||!e||!backCoverColorArr)){for(var t=e.getContext("2d"),a=t.getImageData(0,0,e.width,e.height).data,r=e.width,o=e.height,l=backCoverGroup.geometry.attributes,s=l.aUv.array,i=0;i<BACK_COVER_COUNT;i++){var u=s[i*2],n=s[i*2+1],h=Math.floor(u*r),v=Math.floor(n*o),f=(v*r+h)*4;backCoverColorArr[i*3]=a[f]/255*.85,backCoverColorArr[i*3+1]=a[f+1]/255*.85,backCoverColorArr[i*3+2]=a[f+2]/255*.85}l.aColor.needsUpdate=!0}}function updateFloatLayer(e){}function refreshFloatColorsFromCover(e){if(!(!floatGroup||!e)){for(var t=e.getContext("2d"),a=t.getImageData(0,0,e.width,e.height).data,r=e.width,o=e.height,l=0;l<FLOAT_COUNT;l++){var s=Math.floor(Math.random()*r),i=Math.floor(Math.random()*o),u=(i*r+s)*4;floatColorArr[l*3]=a[u]/255*.95,floatColorArr[l*3+1]=a[u+1]/255*.95,floatColorArr[l*3+2]=a[u+2]/255*.95}floatGroup.geometry.attributes.aColor.needsUpdate=!0}}function resetFloatColorsToIdle(){if(!(!floatGroup||!floatColorArr)){for(var e=0;e<FLOAT_COUNT;e++){var t=.88+e%17/17*.12;floatColorArr[e*3]=t,floatColorArr[e*3+1]=t,floatColorArr[e*3+2]=t}floatGroup.geometry.attributes.aColor.needsUpdate=!0}}for(var rippleIdx=0,lastRippleAt=0,lastBassRising=!1,BASS_THRESHOLD=.3,RIPPLE_COOLDOWN=.32,regions=[],ry=0;ry<3;ry++)for(var rx=0;rx<3;rx++)regions.push({x:(rx/2-.5)*PLANE_SIZE*.72,y:(ry/2-.5)*PLANE_SIZE*.72});function triggerRipple(e,t,a){var r=ripples[rippleIdx];r.x=e,r.y=t,r.age=0,r.str=a,rippleIdx=(rippleIdx+1)%RIPPLE_MAX}function updateRipples(e){var t=bass>BASS_THRESHOLD&&!lastBassRising;lastBassRising=bass>BASS_THRESHOLD*.75;var a=uniforms.uTime.value;if(t&&a-lastRippleAt>RIPPLE_COOLDOWN){lastRippleAt=a;for(var r=2+(Math.random()<.5?0:1),o={},l=0;l<r;l++){var s,i=0;do s=Math.floor(Math.random()*9),i++;while(o[s]&&i<12);o[s]=!0;var u=regions[s],n=u.x+(Math.random()-.5)*.7,h=u.y+(Math.random()-.5)*.7,v=.65+bass*1.4+Math.random()*.25;triggerRipple(n,h,v)}}for(var f=0;f<RIPPLE_MAX;f++){var m=ripples[f];m.str>.005&&(m.age+=e,m.age>2&&(m.str=0,m.age=-10));var c=f*4;rippleData[c]=m.x,rippleData[c+1]=m.y,rippleData[c+2]=m.age,rippleData[c+3]=m.str}rippleTex.needsUpdate=!0;for(var g=0,f=0;f<RIPPLE_MAX;f++)ripples[f].str>.005&&g++;uniforms.uRippleCount.value=g}function customShapeRecipeForRender(){return shapeWorkshopState&&shapeWorkshopState.open?shapeWorkshopPreviewRecipeForRender():activeUserShapeRecipe&&fx&&Number(fx.preset)===3?normalizeShapeRecipe(activeUserShapeRecipe):null}function ensureCustomShapeGroup(){return customShapeGroup||(customShapeGroup=new THREE.Group,customShapeGroup.name="MineradioCustomShapePreset",customShapeGroup.visible=!1,customShapeGroup.renderOrder=24,scene.add(customShapeGroup),customShapeGroup)}function disposeCustomShapeObject(e){e&&(e.geometry&&e.geometry.dispose&&e.geometry.dispose(),e.material&&e.material.dispose&&e.material.dispose())}function clearCustomShapeLayer(){if(customShapeGroup){for(;customShapeGroup.children.length;){var e=customShapeGroup.children[0];customShapeGroup.remove(e),disposeCustomShapeObject(e)}customShapeRecipeKey="",customShapeRenderRecipe=null,customShapeGroup.visible=!1}}function customShapeSeedFromId(e,t){for(var a=String(e||"shape")+":"+t,r=0,o=0;o<a.length;o++)r=(r*31+a.charCodeAt(o))%1e5;return r+17}function customShapeRand(e){var t=Math.sin(e*12.9898)*43758.5453;return t-Math.floor(t)}function customShapeCoverSampler(){var e=ensureShapeMaterialCanvas()||coverPickerCanvas||(coverTex&&coverTex.image&&coverTex.image.getContext?coverTex.image:null);if(!e||!e.getContext)return null;try{var t=e.getContext("2d"),a=t.getImageData(0,0,e.width,e.height).data;return function(r,o){var l=clampRange(Math.floor(clampRange(r,0,.999)*e.width),0,e.width-1),s=clampRange(Math.floor(clampRange(o,0,.999)*e.height),0,e.height-1),i=(s*e.width+l)*4;return[a[i]/255,a[i+1]/255,a[i+2]/255]}}catch{return null}}function customShapePalette(){var e=stageLyrics&&(stageLyrics.coverPalette||stageLyrics.palette)||{},t=normalizeHexColor(e.primary||fx.visualTintColor||fxDefaults.visualTintColor||"#9db8cf","#9db8cf"),a=normalizeHexColor(e.secondary||fx.uiAccentColor||fxDefaults.uiAccentColor||"#f4d28a","#f4d28a");return{a:new THREE.Color(t),b:new THREE.Color(a),mono:new THREE.Color("#eaf2f5")}}function customShapeColorForPoint(e,t,a,r,o,l){if(e.material==="mono")return[l.mono.r,l.mono.g,l.mono.b];if(e.material==="cover"&&t){var s=t(a,r),i=.22+customShapeRand(o+21)*.22;return[clampRange(s[0]+i,0,1),clampRange(s[1]+i,0,1),clampRange(s[2]+i,0,1)]}var u=clampRange(.25+customShapeRand(o+9)*.65,0,1),n=l.a.clone().lerp(l.b,e.material==="accent"?.7:u);return[n.r,n.g,n.b]}function customShapeUsesCoverTexture(e){return e=normalizeShapeRecipe(e),!!(e.materialBinding&&e.materialBinding.mode==="cover-texture"&&e.primitives.some(function(t){return t.material==="cover"}))}function customShapeTextureReady(){return!!(ensureShapeMaterialCanvas()||coverTex&&coverTex.image)}function customShapeCoverParticleMaterial(e,t){return new THREE.PointsMaterial({size:clampRange(.03+(Number(t)||0),.028,.09),map:dotTexture,vertexColors:!0,transparent:!0,opacity:clampRange(e,.14,.96),depthWrite:!1,sizeAttenuation:!0,blending:THREE.AdditiveBlending})}function applyCustomShapePrimitiveTransform(e,t){e.position.set(t.x*2.55,-t.y*2.05,t.z*2.55),e.rotation.set(t.depth*.34,t.rotation*Math.PI*.34,t.rotation*Math.PI*2)}function buildCustomShapeCoverParticlePoints(e){e=e||{};var t=Math.max(48,Math.min(1400,Math.round(Number(e.count)||420))),a=Math.max(8,Math.round(Math.sqrt(t*(e.aspect||1)))),r=Math.max(8,Math.ceil(t/a));t=a*r;for(var o=Number(e.width)||1.4,l=Number(e.height)||1.4,s=Number(e.depth)||.18,i=customShapeSeedFromId(e.id||"cover-particles",Number(e.index)||0),u=customShapeCoverSampler(),n=customShapePalette(),h=new Float32Array(t*3),v=new Float32Array(t*3),f=new Float32Array(t),m=new Float32Array(t*3),c=0;c<t;c++){var g=c%a,R=Math.floor(c/a),C=a>1?g/(a-1):.5,B=r>1?R/(r-1):.5,A=customShapeRand(i+c*11+3),P=(C-.5)*o,b=(B-.5)*l,z=(A-.5)*s;v[c*3]=P,v[c*3+1]=b,v[c*3+2]=z,h[c*3]=P,h[c*3+1]=b,h[c*3+2]=z,f[c]=A;var E=u?u(C,B):null;E||(E=[n.a.r,n.a.g,n.a.b]);var S=.08+customShapeRand(i+c*7+17)*.13;m[c*3]=clampRange(E[0]+S,0,1),m[c*3+1]=clampRange(E[1]+S,0,1),m[c*3+2]=clampRange(E[2]+S,0,1)}var T=new THREE.BufferGeometry;T.setAttribute("position",new THREE.BufferAttribute(h,3)),T.setAttribute("color",new THREE.BufferAttribute(m,3)),T.userData.basePositions=v,T.userData.rand=f;var k=customShapeCoverParticleMaterial(e.opacity,e.sizeBoost),w=new THREE.Points(T,k);return w.frustumCulled=!1,w}function customShapeLocalPoint(e,t,a,r){var o=a>1?t/(a-1):0,l=customShapeRand(r+t*3+1),s=customShapeRand(r+t*3+2),i=customShapeRand(r+t*3+3),u=e.size,n=e.depth,h=o*Math.PI*2,v=0,f=0,m=0,c=o,g=s;if(e.type==="line")v=(o-.5)*3.2*u,f=(l-.5)*.08*u,m=(s-.5)*n*1.2,g=.5+f;else if(e.type==="ring"){var R=(.82+(l-.5)*.08)*u;v=Math.cos(h)*R,f=Math.sin(h)*R,m=Math.sin(h*2+s*2)*n*.3,c=.5+Math.cos(h)*.48,g=.5+Math.sin(h)*.48}else if(e.type==="curve"){var C=o*Math.PI*2,B=(l-.5)*.18,A=Math.sin(C),P=Math.sin(C)*Math.cos(C);v=(A*1.46+Math.cos(C)*B)*u,f=(P*1.08+Math.sin(C*2)*B*.5)*u,m=(Math.cos(C*2)*.34+(s-.5)*.42)*n*u,c=clampRange(.5+A*.46,0,1),g=clampRange(.5+P*.46,0,1)}else if(e.type==="plane"||e.type==="card"){var b=Math.max(2,Math.round(Math.sqrt(a*(e.type==="card"?1.55:1)))),z=t%b,E=Math.floor(t/b),S=Math.max(2,Math.ceil(a/b));c=b>1?z/(b-1):.5,g=S>1?E/(S-1):.5;var T=e.type==="card"?1.42:1;v=(c-.5)*2.1*u*T,f=(g-.5)*2.1*u,m=(i-.5)*n*.18}else if(e.type==="spiral"){var k=2.2+n*1.6;h=o*Math.PI*2*k;var w=Math.pow(o,.72)*1.35*u+(l-.5)*.1;v=Math.cos(h)*w,f=Math.sin(h)*w,m=(o-.5)*n*2.4+Math.sin(h*.5)*n*.24,c=.5+Math.cos(h)*Math.min(.48,w*.24),g=.5+Math.sin(h)*Math.min(.48,w*.24)}else if(e.type==="wave"){var p=Math.max(2,Math.round(Math.sqrt(a))),d=t%p,y=Math.floor(t/p),M=Math.max(2,Math.ceil(a/p));c=p>1?d/(p-1):.5,g=M>1?y/(M-1):.5,v=(c-.5)*2.5*u,f=(g-.5)*1.7*u,m=Math.sin(c*Math.PI*3+g*Math.PI*1.6)*n*.62}else if(e.type==="tunnel"){var x=Math.max(4,Math.round(Math.sqrt(a)*.55)),H=t%x,D=Math.floor(t/x),W=D/Math.max(1,Math.ceil(a/x)-1);h=H/x*Math.PI*2+l*.18;var V=(.78+s*.18)*u;v=Math.cos(h)*V,f=Math.sin(h)*V,m=(W-.5)*(2.2+n*3.2),c=H/x,g=W}else if(e.type==="sphere"){var U=Math.acos(1-2*o),K=Math.PI*(3-Math.sqrt(5))*t,G=(.92+(l-.5)*.08+n*.08)*u;v=Math.sin(U)*Math.cos(K)*G,f=Math.cos(U)*G,m=Math.sin(U)*Math.sin(K)*G,c=.5+Math.atan2(m,v)/(Math.PI*2),g=.5-Math.asin(f/Math.max(.001,G))/Math.PI}else if(e.type==="dust"){var _=l*Math.PI*2,N=Math.pow(s,.42)*(1.25+n*1.5)*u;v=Math.cos(_)*N,f=(i-.5)*(1.8+n)*u,m=Math.sin(_)*N+(customShapeRand(r+t*5+4)-.5)*n*2.4,c=l,g=s}else{var I=l*Math.PI*2,Y=Math.pow(s,.55)*.58*u;v=Math.cos(I)*Y,f=Math.sin(I)*Y,m=(i-.5)*n*1.4,c=l,g=s}return{x:v,y:f,z:m,u:clampRange(c,0,1),v:clampRange(g,0,1)}}function buildCustomShapePrimitiveCoverObject(e,t,a){if(e=normalizeShapePrimitive(e,t),a=normalizeShapeRecipe(a),!customShapeTextureReady()||!customShapeUsesCoverTexture(a)||e.material!=="cover"||e.type!=="plane"&&e.type!=="card")return null;var r=e.type==="card"?1.42:1,o=buildCustomShapeCoverParticlePoints({id:e.id+"-cover-particles",index:t,count:Math.max(180,Math.round(e.count*1.25)),width:2.1*e.size*r,height:2.1*e.size,depth:Math.max(.08,e.depth*.32),aspect:r,opacity:e.opacity*(e.type==="card"?.58:.52),sizeBoost:e.size*.01});return o.name="MineradioCustomShapeCoverParticlePrimitive",o.renderOrder=23+t,applyCustomShapePrimitiveTransform(o,e),o.userData.primitive=e,o.userData.layerIndex=t,o.userData.coverParticles=!0,o.userData.coverBaseOpacity=o.material.opacity,o}function buildCustomShapeCoverPlate(e){if(e=normalizeShapeRecipe(e),!customShapeTextureReady()||!customShapeUsesCoverTexture(e))return null;var t=e.primitives.some(function(l){return l.type==="plane"||l.type==="card"});if(t)return null;var a=e.primitives.reduce(function(l,s){return l+s.size},0)/Math.max(1,e.primitives.length),r=clampRange(1.1+a*.32+Math.min(e.primitives.length,4)*.05,1.12,1.62),o=buildCustomShapeCoverParticlePoints({id:"cover-particle-plate",index:0,count:Math.max(360,Math.min(1100,Math.round(shapeRecipeTotalParticles(e)*.72))),width:r,height:r,depth:.2,aspect:1,opacity:.62,sizeBoost:.012});return o.name="MineradioCustomShapeCoverParticlePlate",o.renderOrder=22,o.position.set(0,0,-.32),o.rotation.set(-.1,0,0),o.userData.primitive={id:"cover-particle-plate",type:"plane",x:0,y:0,z:-.12,count:o.geometry&&o.geometry.userData&&o.geometry.userData.rand?o.geometry.userData.rand.length:420,size:1,depth:.38,rotation:.08,audioFollow:.78,opacity:.62,material:"cover"},o.userData.layerIndex=-1,o.userData.coverParticles=!0,o.userData.coverPlate=!0,o.userData.coverBaseOpacity=o.material.opacity,o}function buildCustomShapePrimitiveObject(e,t){e=normalizeShapePrimitive(e,t);for(var a=!!(shapeWorkshopState&&shapeWorkshopState.open&&e.id&&e.id===shapeWorkshopState.selectedId),r=Math.max(8,Math.min(1200,e.count)),o=customShapeSeedFromId(e.id,t),l=new Float32Array(r*3),s=new Float32Array(r*3),i=new Float32Array(r),u=new Float32Array(r*3),n=customShapeCoverSampler(),h=customShapePalette(),v=0;v<r;v++){var f=customShapeLocalPoint(e,v,r,o);s[v*3]=f.x,s[v*3+1]=f.y,s[v*3+2]=f.z,l[v*3]=f.x,l[v*3+1]=f.y,l[v*3+2]=f.z,i[v]=customShapeRand(o+v*7+5);var m=customShapeColorForPoint(e,n,f.u,f.v,o+v,h);u[v*3]=m[0],u[v*3+1]=m[1],u[v*3+2]=m[2]}var c=new THREE.BufferGeometry;c.setAttribute("position",new THREE.BufferAttribute(l,3)),c.setAttribute("color",new THREE.BufferAttribute(u,3)),c.userData.basePositions=s,c.userData.rand=i;var g=new THREE.PointsMaterial({size:clampRange(.026+e.size*.024+e.depth*.012+(a?.014:0),.024,.095),map:dotTexture,vertexColors:!0,transparent:!0,opacity:clampRange(e.opacity*(a?1.16:1),.12,1),depthWrite:!1,sizeAttenuation:!0,blending:a||e.type==="dust"||e.type==="spiral"?THREE.AdditiveBlending:THREE.NormalBlending}),R=new THREE.Points(c,g);return R.frustumCulled=!1,R.renderOrder=24+t,applyCustomShapePrimitiveTransform(R,e),R.userData.primitive=e,R.userData.layerIndex=t,R}function syncCustomShapeLayer(e){var t=customShapeRecipeForRender(),a=ensureCustomShapeGroup();if(shapeWorkshopState&&shapeWorkshopState.open&&!shapeWorkshopState.motionPreview&&(a.rotation.set(0,0,0),a.userData.autoSpinY=0),!t||!t.primitives||!t.primitives.length){clearCustomShapeLayer();return}var r=shapeRecipeRenderKey(t);if(!e&&r===customShapeRecipeKey){a.visible=!0;return}clearCustomShapeLayer(),customShapeRenderRecipe=normalizeShapeRecipe(t);var o=buildCustomShapeCoverPlate(customShapeRenderRecipe);o&&a.add(o),customShapeRenderRecipe.primitives.forEach(function(l,s){var i=buildCustomShapePrimitiveCoverObject(l,s,customShapeRenderRecipe);i&&a.add(i),a.add(buildCustomShapePrimitiveObject(l,s))}),customShapeRecipeKey=r,a.visible=!0}function isCustomShapeRenderActive(){return!!(customShapeGroup&&customShapeGroup.visible&&customShapeRenderRecipe&&customShapeRenderRecipe.primitives&&customShapeRenderRecipe.primitives.length)}function shapeWorkshopHasLiveAudio(){return!!(audio&&playing&&!audio.paused&&!audio.ended)}function shapeWorkshopDemoAudioEnergy(e){var t=Math.pow(Math.max(0,Math.sin(e*Math.PI*1.65)),5),a=Math.pow(Math.max(0,Math.sin(e*Math.PI*.58+1.1)),2);return clampRange(.18+t*.78+a*.16,0,1.12)}function updateCustomShapeLayer(e){if(isCustomShapeRenderActive()){var t=uniforms.uTime.value,a=!!(shapeWorkshopState&&shapeWorkshopState.open&&!shapeWorkshopState.motionPreview),r=typeof isCustomShapeLayerDriftLocked=="function"&&isCustomShapeLayerDriftLocked(customShapeRenderRecipe),o=a?0:clampRange((bass*.58+mid*.3+treble*.22+beatPulse*.55)*(fx.intensity||1),0,1.4);if(!a&&shapeWorkshopState&&shapeWorkshopState.open&&shapeWorkshopState.motionPreview&&!shapeWorkshopHasLiveAudio()&&(o=Math.max(o,shapeWorkshopDemoAudioEnergy(t))),customShapeGroup.userData||(customShapeGroup.userData={}),!a){customShapeGroup.userData.autoSpinY=(customShapeGroup.userData.autoSpinY||0)+e*(.03+o*.026);var l=(orbit.centerLocked?0:(headParallax.active?headParallax.x*.5:0)+gestureRotation.y)+customShapeGroup.userData.autoSpinY,s=orbit.centerLocked?0:(headParallax.active?-headParallax.y*.35:0)+gestureRotation.x;customShapeGroup.rotation.y+=(l-customShapeGroup.rotation.y)*.055,customShapeGroup.rotation.x+=(s-customShapeGroup.rotation.x)*.055}customShapeGroup.children.forEach(function(i,u){var n=i.userData||{},h=n.primitive;if(n.coverMesh&&!n.coverParticles){var v=h?h.audioFollow*o:0;!a&&h&&!r&&(i.rotation.z+=e*(h.rotation*.18+v*.03),i.rotation.y+=e*(h.rotation*.045+v*.018)),i.material&&(i.material.opacity=clampRange((n.coverBaseOpacity||.22)*(.88+Math.min(.22,v*.16)),.08,.58));return}if(!(!h||!i.geometry||!i.geometry.attributes||!i.geometry.attributes.position)){var f=i.geometry.attributes.position,m=f.array,c=i.geometry.userData.basePositions,g=i.geometry.userData.rand;if(!(!c||!g)){for(var R=n.coverParticles?1.9:1.22,C=h.audioFollow*o*R,B=n.layerIndex!=null?n.layerIndex:u,A=mouseActive&&!a?1:0,P=0;P<g.length;P++){var b=P*3,z=Math.sin(t*(.86+h.audioFollow*1.55)+g[P]*6.2831+c[b]*1.3+B),E=Math.cos(t*1.28+g[P]*9.2+c[b+1]*1.8),S=0,T=0;if(A){var k=c[b]-mouseWorld.x,w=c[b+1]-mouseWorld.y,p=k*k+w*w,d=Math.max(0,1-p/1.35)*.09;S=k*d,T=w*d}m[b]=c[b]+Math.cos(t*.36+g[P]*5.1)*C*(n.coverParticles?.034:.022)+S,m[b+1]=c[b+1]+Math.sin(t*.32+g[P]*4.7)*C*(n.coverParticles?.034:.022)+T,m[b+2]=c[b+2]+(z*.72+E*.28)*C*(n.coverParticles?.17+h.depth*.42:.1+h.depth*.3)}if(f.needsUpdate=!0,!a&&!r&&(i.rotation.z+=e*(h.rotation*.18+C*(n.coverParticles?.042:.03)),i.rotation.y+=e*(h.rotation*.045+C*(n.coverParticles?.026:.018))),i.material){var y=n.coverParticles&&n.coverBaseOpacity||h.opacity;i.material.opacity=clampRange(y*(.86+Math.min(.26,C*.18)),.1,1)}}}})}}function tickPresetTransition(){if(presetTransition.active){var e=(uniforms.uTime.value-presetTransition.start)/presetTransition.duration,t=Math.max(0,Math.min(1,e)),a=Math.sin(t*Math.PI),r=presetTransition.to>=4,o=presetTransition.to===5;uniforms.uScatter.value=Math.max(uniforms.uScatter.value,fx.scatter+a*(r?o?.008:.026:.16)),uniforms.uBurstAmt.value=Math.max(uniforms.uBurstAmt.value,a*(o?.045:r?.12:.15)),uniforms.uPointScale.value=fx.point*(1+a*(o?.016:.048)),e>=1&&(presetTransition.active=!1,syncFxUniforms())}}function updateHomeAudioVisual(e){if(emptyHomeActive){var t=document.getElementById("home-wave-track");if(t){var a=performance.now();if(!(homeWaveTrackState.lastAt&&a-homeWaveTrackState.lastAt<80)){homeWaveTrackState.lastAt=a,ensureHomeWaveTrackBars();for(var r=t.children,o=uniforms&&uniforms.uTime?uniforms.uTime.value:performance.now()/1e3,l=0;l<r.length;l++){var s=r.length>1?l/(r.length-1):0,i=0;frequencyData&&frequencyData.length?i=(frequencyData[Math.min(frequencyData.length-1,Math.floor(Math.pow(s,1.2)*(frequencyData.length-1)))]||0)/255:i=.16+Math.sin(o*1.4+l*.34)*.06;var u=clampRange(Math.max(i,smoothBass*.35+smoothMid*.18+beatPulse*.24),.03,1),n=homeWaveTrackState.smooth[l]||0;n+=(u-n)*(u>n?.34:.12),homeWaveTrackState.smooth[l]=n,r[l].style.height=Math.max(4,n*18)+"px",r[l].style.opacity=String(clampRange(.36+n*.68,.32,1))}}}}}
