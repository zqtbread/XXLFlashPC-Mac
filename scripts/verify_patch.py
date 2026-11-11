#!/usr/bin/env python3
"""校验 Mac PPAPI Flash 34.0.0.372 的 OOD / Flash Center 补丁是否完整。

补丁来自 darktohka/FlashPatch 的同一套 OOD 处理：停用 oodAlert 的父函数，
把相关条件跳转改成无条件跳转。原版与补丁版共 7 处、20 字节不同。

用法:
    python3 scripts/verify_patch.py <PepperFlashPlayer 可执行文件> [--expect original|patched]

退出码: 0 = 与预期一致, 1 = 不一致, 2 = 参数/文件错误
"""

import argparse
import pathlib
import sys

# (偏移, 原版字节, 补丁后字节)
PATCHES = [
    (0x56C3F9, "744c",       "9090"),
    (0x56C438, "740d",       "9090"),
    (0x56C441, "0f842e03",   "e92f0300"),
    (0x56C446, "00",         "90"),
    (0x5CA720, "554889e54156", "b801000000c3"),
    (0x9EB23B, "0f858901",   "e98a0100"),
    (0x9EB240, "00",         "90"),
]

EXPECTED_SIZE = 15313744  # 34.0.0.372 Mac PPAPI 可执行文件原始大小


def main() -> int:
    ap = argparse.ArgumentParser(description="校验 Flash OOD 补丁字节")
    ap.add_argument("binary", help="PepperFlashPlayer 可执行文件路径")
    ap.add_argument("--expect", choices=["original", "patched"], default="patched")
    args = ap.parse_args()

    path = pathlib.Path(args.binary)
    if not path.is_file():
        print(f"文件不存在: {path}", file=sys.stderr)
        return 2
    data = path.read_bytes()

    if len(data) != EXPECTED_SIZE:
        print(f"警告: 文件大小为 {len(data)}，预期 {EXPECTED_SIZE}；"
              "不同版本的 Flash 偏移不适用，结果不可信。", file=sys.stderr)

    mismatches = []
    for off, orig_hex, patched_hex in PATCHES:
        orig = bytes.fromhex(orig_hex)
        patched = bytes.fromhex(patched_hex)
        want = orig if args.expect == "original" else patched
        got = data[off:off + len(want)]
        if got != want:
            mismatches.append((off, want.hex(), got.hex()))

    label = "原版（未打补丁）" if args.expect == "original" else "已打 OOD 补丁"
    if mismatches:
        print(f"不一致：该文件不是 {label} 状态，共 {len(mismatches)} 处不符")
        for off, want, got in mismatches:
            print(f"  0x{off:x}: 期望 {want}, 实际 {got}")
        return 1

    print(f"OK: {path} 是 {label}，7 处 / 20 字节全部匹配。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
