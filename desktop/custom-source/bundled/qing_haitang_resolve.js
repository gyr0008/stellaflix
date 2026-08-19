/*!
 * @name 青听·海棠解析源
 * @description 基于 QingMusic(kejichangqing)客户端解析后端 musicserver.haitangw.cc 适配的洛雪音源。上游为青听作者私人服务,可能限流或关停;仅供个人学习使用,禁止批量下载。
 * @version 1.0.0
 * @author Stellaflix(适配;后端与音源线路来自 QingMusic 项目)
 */
const DEV_ENABLE = false
const API_URL = 'https://musicserver.haitangw.cc/v1/music/resolve-url'

// 线路音质声明与 QingMusic 线上 music.json 对齐(tx 上限无损,mg 仅标准)
const MUSIC_QUALITY = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac'],
  mg: ['128k'],
}
// 洛雪音质档位 -> 青听 level 档位
const LEVEL_MAP = {
  '128k': 'standard',
  '320k': 'exhigh',
  'flac': 'lossless',
  'flac24bit': 'hires',
}
const MUSIC_SOURCE = Object.keys(MUSIC_QUALITY)
const { EVENT_NAMES, request, on, send, env, version } = globalThis.lx

const httpFetch = (url, options = { method: 'GET' }) => {
  return new Promise((resolve, reject) => {
    request(url, options, (err, resp, body) => {
      if (err) return reject(err)
      resolve({ ...resp, body })
    })
  })
}

const handleGetMusicUrl = async (source, musicInfo, quality) => {
  // kg 歌曲用 hash,其余用 songmid(与洛雪客户端 MusicInfo 字段契约一致)
  const rid = musicInfo.hash ?? musicInfo.songmid
  const level = LEVEL_MAP[quality] ?? 'standard'

  const resp = await httpFetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`,
    },
    body: JSON.stringify({ source, rid: String(rid ?? ''), level }),
  })
  const body = resp.body
  if (!body || typeof body !== 'object') throw new Error('response invalid')
  if (Number(body.code) !== 0) throw new Error(body.message || body.msg || `code ${body.code}`)
  const url = body.data && body.data.url
  if (!url || typeof url !== 'string') throw new Error('url missing')
  return url
}

const musicSources = {}
MUSIC_SOURCE.forEach(item => {
  musicSources[item] = {
    name: item,
    type: 'music',
    actions: ['musicUrl'],
    qualitys: MUSIC_QUALITY[item],
  }
})

on(EVENT_NAMES.request, ({ action, source, info }) => {
  switch (action) {
    case 'musicUrl':
      return handleGetMusicUrl(source, info.musicInfo, info.type)
        .then(data => Promise.resolve(data))
        .catch(err => Promise.reject(err))
    default:
      return Promise.reject('action not support')
  }
})
send(EVENT_NAMES.inited, { status: true, openDevTools: DEV_ENABLE, sources: musicSources })
