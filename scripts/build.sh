#!/bin/bash
# 从源码组装「开心消消乐PC版.app」并打包可分发 zip。
#
# 本脚本只自动下载 Electron（MIT）。Mac 版 PPAPI Flash 插件属于第三方专有软件，
# 需由使用者自行合法取得并放到 vendor/ 下，脚本不会下载它。
#
# 用法:
#   ./scripts/build.sh
#
# 可用环境变量:
#   FLASH_PLUGIN       flash.plugin 目录          默认 ./vendor/flash.plugin
#   PATCHED_BIN        已打 OOD 补丁的可执行文件   默认 ./vendor/PepperFlashPlayer.patched
#   ELECTRON_VERSION   Electron 版本              默认 11.5.0
#   ICON               可选 applet.icns 路径      默认空
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"
CACHE="$BUILD/cache"
RUNTIME="$BUILD/runtime"
APP_NAME="开心消消乐PC版"
OUT_APP="$BUILD/$APP_NAME.app"
OUT_ZIP="$BUILD/$APP_NAME-Mac.zip"

ELECTRON_VERSION="${ELECTRON_VERSION:-11.5.0}"
ELECTRON_ZIP="electron-v${ELECTRON_VERSION}-darwin-x64.zip"
FLASH_PLUGIN="${FLASH_PLUGIN:-$ROOT/vendor/flash.plugin}"
PATCHED_BIN="${PATCHED_BIN:-$ROOT/vendor/PepperFlashPlayer.patched}"
ICON="${ICON:-}"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '错误: %s\n' "$*" >&2; exit 1; }

say "检查环境"
[[ "$(uname -s)" == "Darwin" ]] || die "只能在 macOS 上构建"
if [[ "$(uname -m)" != "x86_64" ]]; then
  printf '警告: 当前架构 %s，Flash 插件是 x86_64 Mach-O，Apple Silicon 未经测试。\n' "$(uname -m)" >&2
fi
command -v osacompile >/dev/null || die "缺少 osacompile（请安装 Xcode 命令行工具）"
command -v codesign >/dev/null || die "缺少 codesign"
command -v python3 >/dev/null || die "缺少 python3"
[[ -f "$ROOT/launcher.applescript" ]] || die "缺少 launcher.applescript"
[[ -f "$ROOT/app/main.js" ]] || die "缺少 app/main.js"

if [[ ! -d "$FLASH_PLUGIN" ]]; then
  cat >&2 <<EOF

缺少 Mac 版 PPAPI Flash 插件目录: $FLASH_PLUGIN

请自行合法取得 Adobe Flash Player 34.0.0.372 (macOS, PPAPI) 的 flash.plugin，
放到 vendor/flash.plugin，并把打过 OOD 补丁的可执行文件放到
vendor/PepperFlashPlayer.patched。

补丁方法见 docs/BUILD.md；校验方法:
  python3 scripts/verify_patch.py <PepperFlashPlayer> --expect patched

本仓库不提供、也不自动下载该插件。
EOF
  exit 1
fi

say "准备 Electron ${ELECTRON_VERSION}"
mkdir -p "$CACHE"
if [[ ! -f "$CACHE/$ELECTRON_ZIP" ]]; then
  URLS=(
    "https://npmmirror.com/mirrors/electron/${ELECTRON_VERSION}/${ELECTRON_ZIP}"
    "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${ELECTRON_ZIP}"
  )
  ok=0
  for url in "${URLS[@]}"; do
    printf '尝试下载: %s\n' "$url"
    if curl -fL --retry 2 --connect-timeout 15 -o "$CACHE/$ELECTRON_ZIP.tmp" "$url"; then
      mv "$CACHE/$ELECTRON_ZIP.tmp" "$CACHE/$ELECTRON_ZIP"
      ok=1
      break
    fi
  done
  if [[ "$ok" -ne 1 ]]; then
    rm -f "$CACHE/$ELECTRON_ZIP.tmp"
    die "Electron 下载失败，请手动把 ${ELECTRON_ZIP} 放到 ${CACHE}/ 后重试"
  fi
fi

say "展开运行时"
rm -rf "$RUNTIME" "$CACHE/unpacked" "$OUT_APP" "$OUT_ZIP"
mkdir -p "$RUNTIME" "$CACHE/unpacked"
ditto -x -k "$CACHE/$ELECTRON_ZIP" "$CACHE/unpacked"
[[ -d "$CACHE/unpacked/Electron.app" ]] || die "zip 里没有 Electron.app"
cp -R "$CACHE/unpacked/Electron.app" "$RUNTIME/Electron.app"
# 有 app/ 目录时 Electron 会优先加载它，删掉官方占位应用省体积
rm -f "$RUNTIME/Electron.app/Contents/Resources/default_app.asar"

say "安装主程序与 Flash 插件"
ELEC="$RUNTIME/Electron.app"
mkdir -p "$ELEC/Contents/Resources/app" "$ELEC/Contents/Resources"
cp -R "$ROOT/app/." "$ELEC/Contents/Resources/app/"
cp -R "$FLASH_PLUGIN" "$ELEC/Contents/Resources/flash.plugin"

PLUGIN_BIN="$ELEC/Contents/Resources/flash.plugin/Contents/MacOS/PepperFlashPlayer"
[[ -f "$PLUGIN_BIN" ]] || die "插件里找不到 Contents/MacOS/PepperFlashPlayer"
if [[ -f "$PATCHED_BIN" ]]; then
  cp "$PATCHED_BIN" "$PLUGIN_BIN"
fi
chmod +x "$PLUGIN_BIN"
python3 "$ROOT/scripts/verify_patch.py" "$PLUGIN_BIN" --expect patched \
  || die "Flash 插件未打 OOD 补丁，成品会弹出 Flash Center 更新占位"

say "签名内嵌 Electron"
codesign --force --deep --sign - "$ELEC"

say "编译外层启动器"
osacompile -o "$OUT_APP" "$ROOT/launcher.applescript"
mkdir -p "$OUT_APP/Contents/Resources"
mv "$RUNTIME" "$OUT_APP/Contents/Resources/runtime"
if [[ -n "$ICON" && -f "$ICON" ]]; then
  cp "$ICON" "$OUT_APP/Contents/Resources/applet.icns"
fi

say "签名并校验成品"
codesign --force --deep --sign - "$OUT_APP"
codesign --verify --deep --strict "$OUT_APP"

say "打包 zip"
ditto -c -k --keepParent "$OUT_APP" "$OUT_ZIP"

printf '\n完成:\n  %s\n  %s (%s)\n' "$OUT_APP" "$OUT_ZIP" "$(du -h "$OUT_ZIP" | cut -f1)"
printf '提示: 用 macOS 自带「归档实用工具」解压 zip；首次打开若被 Gatekeeper 拦，右键 → 打开。\n'
