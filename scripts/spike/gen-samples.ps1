# 生成极小的编解码测试样本（需本机已安装 ffmpeg，且含 libx264/libx265/libaom/libvpx/libopus/ac3/eac3）。
# 用法: powershell -ExecutionPolicy Bypass -File gen-samples.ps1 [输出目录，默认 ./samples]
param([string]$Out = "samples")
$FF = if ($env:FFMPEG) { $env:FFMPEG } else { "ffmpeg.exe" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
# 2s、320x240 纯色 + 正弦音
$COMMON = "-f lavfi -i color=c=blue:s=320x240:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -shortest"

Write-Host ">> H.264 + AAC (mp4)"
& $FF $COMMON.Split(' ') -c:v libx264 -c:a aac "$Out/h264_aac.mp4" -y

Write-Host ">> HEVC + AAC (mp4)  -- Electron 不支持，用于验证不能播"
& $FF $COMMON.Split(' ') -c:v libx265 -c:a aac "$Out/hevc_aac.mp4" -y

Write-Host ">> AV1 + Opus (mkv)"
& $FF $COMMON.Split(' ') -c:v libaom-av1 -c:a libopus "$Out/av1_opus.mkv" -y

Write-Host ">> VP9 + Opus (webm)"
& $FF $COMMON.Split(' ') -c:v libvpx-vp9 -c:a libopus "$Out/vp9_opus.webm" -y

Write-Host ">> H.264 + AC-3 (mp4)  -- Electron 不支持音轨"
& $FF $COMMON.Split(' ') -c:v libx264 -c:a ac3 "$Out/h264_ac3.mp4" -y

Write-Host ">> H.264 + E-AC-3 (mp4)"
& $FF $COMMON.Split(' ') -c:v libx264 -c:a eac3 "$Out/h264_eac3.mp4" -y

Write-Host ">> HLS (H.264 + AAC)"
& $FF $COMMON.Split(' ') -c:v libx264 -c:a aac -f hls -hls_time 2 -hls_list_size 0 "$Out/h264_aac.m3u8" -y

Write-Host ">> 字幕样本 (VTT / SRT)"
Set-Content -Path "$Out/sample.vtt" -Value "WEBVTT`n`n00:00:00.000 --> 00:00:02.000`nHello subtitle"
Set-Content -Path "$Out/sample.srt" -Value "1`n00:00:00,000 --> 00:00:02,000`nHello subtitle"

Write-Host "完成。样本位于: $Out"
