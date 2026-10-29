#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="$SCRIPT_DIR/ffmpeg-8.1.1.tar.gz"
EXPECTED_SHA256="ec0aa20fb9f6fd3692ffc04dc12ffa43cfffc4a479e388ccd7910ec6cfe188a2"
SRC_DIR="$SCRIPT_DIR/_src"
BUILD_DIR="$SCRIPT_DIR/_build"
PREFIX="$BUILD_DIR/prefix"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
BIN_DIR="$REPO_ROOT/src-tauri/binaries"

command -v x86_64-w64-mingw32-gcc >/dev/null
command -v nasm >/dev/null
command -v mingw32-make >/dev/null
command -v strip >/dev/null

test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$EXPECTED_SHA256"
rm -rf "$SRC_DIR" "$BUILD_DIR"
mkdir -p "$SRC_DIR" "$PREFIX"
tar -xzf "$ARCHIVE" -C "$SRC_DIR" --strip-components=1
cd "$SRC_DIR"

./configure \
  --prefix="$PREFIX" \
  --target-os=mingw32 \
  --arch=x86_64 \
  --cross-prefix=x86_64-w64-mingw32- \
  --nm=nm --ar=ar --ranlib=ranlib --disable-stripping \
  --extra-ldflags='-static -static-libgcc -static-libstdc++ -Wl,--no-insert-timestamp' \
  --enable-gpl --enable-version3 --enable-small \
  --disable-debug --disable-doc --disable-autodetect \
  --enable-ffmpeg --enable-ffprobe \
  --enable-avcodec --enable-avformat --enable-avfilter \
  --enable-swresample --enable-swscale --enable-avutil \
  --enable-d3d11va --enable-w32threads --enable-runtime-cpudetect \
  --enable-mediafoundation \
  --disable-everything \
  --enable-demuxer=mov,matroska,ogg,wav,mp3,image2 \
  --enable-muxer=mp4,ipod,adts,mp3,ogg,wav,image2 \
  --enable-parser=aac,ac3,flac,mjpeg,mpegaudio,opus,vorbis \
  --enable-decoder=aac,ac3,alac,flac,mjpeg,mp3,opus,pcm_s16le,pcm_s24le,vorbis \
  --enable-encoder=aac_mf,mp3_mf,mjpeg,pcm_s16le \
  --enable-protocol=file,pipe \
  --enable-filter=aresample,scale,format \
  --enable-bsf=aac_adtstoasc,extract_extradata

mingw32-make -j"${FFMPEG_JOBS:-2}"
mingw32-make install
cp "$PREFIX/bin/ffmpeg.exe" "$BIN_DIR/ffmpeg.exe"
cp "$PREFIX/bin/ffprobe.exe" "$BIN_DIR/ffprobe.exe"

sha256sum "$BIN_DIR/ffmpeg.exe" "$BIN_DIR/ffprobe.exe"
