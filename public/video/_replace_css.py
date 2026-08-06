import os
p = 'C:/Users/Administrator/Desktop/Mineradio-Extended-1.1.2-extended.1/public/video/player.css'
with open(p, encoding='utf-8') as f:
    lines = f.readlines()
start = end = None
for i, ln in enumerate(lines):
    if ln.lstrip().startswith('/* ===== 沉浸式详情页'):
        start = i
    if 'body:not(.video-space-active) .sfv-detail-immersive { display: none !important; }' in ln:
        end = i
        break
print('start', start, 'end', end)
assert start is not None and end is not None
BLOCK = """
/* ===== Plex 风详情页（detail.js · 电影 / 动漫 / 纪录片 共享）=====
   视觉契约（2026-08-06 重设计，推翻原 sfv-detail-immersive）：
   整页海报铺满视口(fixed) + 仅底部 50% 暗渐变压底；玻璃容器统一
   rgba(255,255,255,.10)+blur(16px)saturate(150%)+1px/.18+br16；
   左上圆形返回 + 右上 Plex 胶囊(-□×)；白色标题(甲:优先海报扣,回退文字)；
   药丸操作组(播放/追片6态/加入片单/音轨/下载)；HEADER 元数据只读4字段；
   演员直径70+相似/剧照卡；8px TMDB 署名。仅影视态可见(双态隔离)。 */

/* 沉浸态：隐藏全局顶栏(含原 -□× 与搜索/DIY/logo)，由详情页自绘控件接管 */
body.sfv-plex-immersive #sfv-nav { display: none !important; }

.sfv-detail-plex { position: relative; min-height: 100%; color: #fff; z-index: 1; }
.sfv-detail-plex * { box-sizing: border-box; }

.sfv-plex-bg {
  position: fixed; inset: 0; z-index: 0;
  background-size: cover; background-position: center top;
  background-color: #0b0e13;
}
.sfv-plex-bg::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to top, rgba(0,0,0,.62) 0%, rgba(0,0,0,.30) 28%, transparent 52%);
}
.sfv-plex-content { position: relative; z-index: 2; }

.sfv-plex-back {
  position: fixed; top: 20px; left: 20px; z-index: 5;
  width: 52px; height: 52px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; color: #fff; font-size: 24px;
  background: rgba(12,16,22,.42);
  border: 1px solid rgba(255,255,255,.18);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  transition: background .2s ease, transform .2s ease;
}
.sfv-plex-back:hover { background: rgba(12,16,22,.62); }
.sfv-plex-back:active { transform: scale(.94); }

.sfv-plex-win {
  position: fixed; top: 22px; right: 20px; z-index: 5;
  display: inline-flex; align-items: stretch;
  height: 42px; border-radius: 999px; overflow: hidden;
  background: rgba(12,16,22,.42);
  border: 1px solid rgba(255,255,255,.18);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.sfv-plex-win button {
  width: 52px; height: 100%; border: 0; margin: 0; padding: 0;
  background: transparent; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; border-left: 1px solid rgba(255,255,255,.10);
  transition: background .15s ease;
}
.sfv-plex-win button:first-child { border-left: 0; }
.sfv-plex-win button:hover { background: rgba(255,255,255,.14); }
.sfv-plex-win button:active { background: rgba(255,255,255,.24); }

.sfv-plex-header { padding: 340px 50px 0; max-width: 1180px; }

.sfv-plex-title { margin: 0; position: relative; display: flex; align-items: flex-end; gap: 16px; }
.sfv-plex-title-text {
  font-size: 64px; line-height: 1.04; font-weight: 800; color: #fff;
  letter-spacing: .01em; text-shadow: 0 2px 18px rgba(0,0,0,.55); margin: 0;
}
.sfv-plex-poster-title {
  width: 150px; height: 96px; border-radius: 10px; overflow: hidden; flex: 0 0 auto;
  box-shadow: 0 10px 30px rgba(0,0,0,.45); background: #11151c;
}
.sfv-plex-poster-title img { width: 100%; height: 100%; object-fit: cover; object-position: center 78%; display: block; }

.sfv-plex-subtitle {
  margin: 10px 0 0; font-size: 19px; font-weight: 600; color: #fff;
  text-transform: uppercase; letter-spacing: .16em; text-shadow: 0 1px 10px rgba(0,0,0,.5);
}

.sfv-plex-meta {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0 12px;
  margin-top: 16px; font-size: 14px; color: rgba(255,255,255,.86);
}
.sfv-plex-meta img.sfv-plex-tmdb-logo { height: 16px; width: auto; vertical-align: middle; opacity: .92; }
.sfv-plex-meta .sfv-plex-rating { font-weight: 700; color: #fff; }
.sfv-plex-meta .sfv-plex-sep { width: 1px; height: 14px; background: rgba(255,255,255,.25); display: inline-block; }
.sfv-plex-meta .sfv-plex-genres { color: rgba(255,255,255,.86); }

.sfv-plex-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.sfv-plex-pill {
  height: 44px; border-radius: 999px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 0 18px; font-size: 14px; font-weight: 700; color: #fff;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.20);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 6px 18px rgba(0,0,0,.28);
  transition: background .18s ease, transform .18s ease; position: relative;
}
.sfv-plex-pill:hover { background: rgba(255,255,255,.22); }
.sfv-plex-pill:active { transform: scale(.96); }
.sfv-plex-pill svg { width: 20px; height: 20px; display: block; }
.sfv-plex-pill--play {
  height: 48px; padding: 0 24px; font-size: 15px;
  background: rgba(255,255,255,.94); color: #0b0e13; border-color: rgba(255,255,255,.6);
}
.sfv-plex-pill--play:hover { background: #fff; }
.sfv-plex-pill--play svg { width: 22px; height: 22px; }

.sfv-plex-track-menu {
  position: absolute; top: calc(100% + 8px); left: 0; z-index: 30;
  min-width: 150px; padding: 6px; border-radius: 14px;
  background: rgba(18,22,30,.92);
  border: 1px solid rgba(255,255,255,.16);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  box-shadow: 0 16px 44px rgba(0,0,0,.5); display: none;
}
.sfv-plex-track-menu.open { display: block; }
.sfv-plex-track-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 9px 12px; border: 0; background: transparent; color: #eef1f5;
  font-size: 13.5px; font-weight: 600; border-radius: 9px; cursor: pointer; text-align: left;
}
.sfv-plex-track-item:hover { background: rgba(255,255,255,.10); }
.sfv-plex-track-item.active { color: #01b4e4; }
.sfv-plex-track-item .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }

.sfv-plex-overview {
  max-width: 760px; margin-top: 26px;
  font-size: 15px; line-height: 1.62; color: rgba(255,255,255,.92);
  text-shadow: 0 1px 8px rgba(0,0,0,.4);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.sfv-plex-overview.expanded { -webkit-line-clamp: unset; }
.sfv-plex-expand {
  margin-top: 10px; height: 32px; padding: 0 14px; border-radius: 999px;
  font-size: 12.5px; font-weight: 700; color: #fff; cursor: pointer;
  background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
.sfv-plex-expand:hover { background: rgba(255,255,255,.20); }

.sfv-plex-section { font-size: 16px; font-weight: 800; color: #fff; letter-spacing: .03em; margin: 40px 0 14px; }
.sfv-plex-rail { display: flex; gap: 18px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: thin; }
.sfv-plex-rail::-webkit-scrollbar { height: 6px; }
.sfv-plex-rail::-webkit-scrollbar-thumb { background: rgba(255,255,255,.22); border-radius: 3px; }

.sfv-plex-actor { flex: 0 0 auto; width: 70px; text-align: center; }
.sfv-plex-actor-img {
  width: 70px; height: 70px; border-radius: 50%; object-fit: cover; display: block;
  background: #1a1f28; border: 1px solid rgba(255,255,255,.18); transition: transform .25s ease;
}
.sfv-plex-actor:hover .sfv-plex-actor-img { transform: scale(1.1); }
.sfv-plex-actor-name { font-size: 12px; color: rgba(255,255,255,.8); margin-top: 7px; line-height: 1.25; }

.sfv-plex-card {
  flex: 0 0 auto; width: 195px; border-radius: 12px; overflow: hidden;
  background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18);
  box-shadow: 0 8px 22px rgba(0,0,0,.3); transition: transform .25s ease;
}
.sfv-plex-card:hover { transform: scale(1.04); }
.sfv-plex-card-img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; background: #1a1f28; }
.sfv-plex-card--poster .sfv-plex-card-img { aspect-ratio: 2 / 3; }

.sfv-plex-attrib {
  font-size: 8px; line-height: 1.5; color: rgba(255,255,255,.25);
  text-align: center; padding: 36px 20px 28px; letter-spacing: .02em;
}

body:not(.video-space-active) .sfv-detail-plex { display: none !important; }
"""
new = [l + '\n' for l in BLOCK.split('\n')]
lines[start:end+1] = new
with open(p, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('ok replaced', end - start + 1, 'lines with', len(new))
try:
    os.remove(__file__)
except Exception:
    pass
