#!/usr/bin/env bash
# 生成极小的编解码测试样本（需本机已安装 ffmpeg，且含 libx264/libx265/libaom/libvpx/libopus/ac3/eac3）。
# 用法: bash gen-samples.sh [输出目录，默认 ./samples]
set -e
OUT="${1:-samples}"
mkdir -p "$OUT"
FF="${FFMPEG:-ffmpeg}"
# 2s、320x240 的纯色+正弦音，保证极小体积
COMMON="-f lavfi -i color=c=blue:s=320x240:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -shortest"

echo ">> H.264 + AAC (mp4)"
$FF $COMMON -c:v libx264 -c:a aac "$OUT/h264_aac.mp4" -y

echo ">> HEVC + AAC (mp4)  —— Electron 不支持，用于验证『不能播』"
$FF $COMMON -c:v libx265 -c:a aac "$OUT/hevc_aac.mp4" -y

echo ">> AV1 + Opus (mkv)"
$FF $COMMON -c:v libaom-av1 -c:a libopus "$OUT/av1_opus.mkv" -y

echo ">> VP9 + Opus (webm)"
$FF $COMMON -c:v libvpx-vp9 -c:a libopus "$OUT/vp9_opus.webm" -y

echo ">> H.264 + AC-3 (mp4)  —— Electron 不支持音轨，用于验证『无声/报错』"
$FF $COMMON -c:v libx264 -c:a ac3 "$OUT/h264_ac3.mp4" -y

echo ">> H.264 + E-AC-3 (mp4)  —— 同上"
$FF $COMMON -c:v libx264 -c:a eac3 "$OUT/h264_eac3.mp4" -y

echo ">> HLS (H.264 + AAC): master + 分片"
$FF $COMMON -c:v libx264 -c:a aac -f hls -hls_time 2 -hls_list_size 0 "$OUT/h264_aac.m3u8" -y

echo ">> 字幕样本 (VTT / SRT)"
printf 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello subtitle\n' > "$OUT/sample.vtt"
printf '1\n00:00:00,000 --> 00:00:02,000\nHello subtitle\n' > "$OUT/sample.srt"

echo "完成。样本位于: $OUT"
echo "下一步: 用 Electron/Chrome 打开 s3-decode-probe.html，选择 $OUT 下文件做真实解码验证。"
