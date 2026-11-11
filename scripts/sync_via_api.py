#!/usr/bin/env python3
"""git push 不通时，用 GitHub Git Data API 把当前分支同步到远端 main。

适用场景：本机到 github.com 的 git 传输被代理拦截（502 / 超时），
但 api.github.com 可用（gh 能正常访问）。脚本会按本地 git 索引重建
完整 tree 与 commit，复刻 author/committer/message，使远端 commit 的
SHA 与本地 HEAD 完全一致，之后本地仓库依然是干净、可继续提交的状态。

用法:
    python3 scripts/sync_via_api.py
    GITHUB_REPO=owner/repo python3 scripts/sync_via_api.py   # 覆盖仓库

前提:
    - 已安装 gh 且已登录（gh auth status）
    - 本地改动已 commit，工作区干净
    - 远端的 main 是本地 HEAD 的祖先（正常线性历史）
"""
import base64
import json
import os
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
BRANCH = "main"


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True,
                          capture_output=True).stdout


def detect_repo():
    if os.environ.get("GITHUB_REPO"):
        return os.environ["GITHUB_REPO"].strip()
    url = git("remote", "get-url", "origin").decode().strip()
    m = re.search(r"github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$", url)
    if not m:
        raise RuntimeError(f"无法从 origin 解析 GitHub 仓库: {url}；请设置 GITHUB_REPO")
    return m.group(1)


REPO = detect_repo()


def api(path, payload=None, method="POST"):
    cmd = ["gh", "api", f"repos/{REPO}/{path}", "--method", method]
    if payload is not None:
        cmd += ["--input", "-"]
    p = subprocess.run(
        cmd,
        input=json.dumps(payload, ensure_ascii=False) if payload is not None else None,
        text=True, capture_output=True,
    )
    if p.returncode:
        raise RuntimeError(f"API {path} 失败: {p.stderr.strip()}")
    return json.loads(p.stdout) if p.stdout.strip() else {}


def iso_from_git(ts, tz):
    sign = 1 if tz[0] == "+" else -1
    delta = timedelta(hours=int(tz[1:3]), minutes=int(tz[3:5])) * sign
    return datetime.fromtimestamp(int(ts), timezone(delta)).isoformat()


def current_remote_head():
    p = subprocess.run(
        ["gh", "api", f"repos/{REPO}/git/refs/heads/{BRANCH}"],
        capture_output=True, text=True,
    )
    if p.returncode == 0:
        return json.loads(p.stdout)["object"]["sha"]
    # 空仓库：先用 Contents API 造一个占位提交，让 Git Data API 可用
    api("contents/.gitkeep", {
        "message": "init",
        "content": base64.b64encode(b"init\n").decode("ascii"),
        "branch": BRANCH,
    }, method="PUT")
    print("已初始化空的 main 分支")
    return None


def main():
    dirty = git("status", "--porcelain").decode().strip()
    if dirty:
        print("工作区有未提交改动，请先 commit：\n" + dirty, file=sys.stderr)
        return 2

    parent = current_remote_head()
    local_head = git("cat-file", "-p", "HEAD").decode()
    header, message = local_head.split("\n\n", 1)

    entries = []
    for rec in git("ls-files", "-s", "-z").split(b"\0"):
        if not rec:
            continue
        meta, _, relb = rec.partition(b"\t")
        entries.append((os.fsdecode(relb), meta.split()[0].decode()))

    print(f"仓库 {REPO} | 待上传 {len(entries)} 个文件")
    tree = []
    for rel, mode in sorted(entries):
        data = (ROOT / rel).read_bytes()
        blob = api("git/blobs", {
            "content": base64.b64encode(data).decode("ascii"),
            "encoding": "base64",
        })
        tree.append({"path": rel, "mode": mode, "type": "blob", "sha": blob["sha"]})

    t = api("git/trees", {"tree": tree})
    local_tree = re.search(r"^tree (\w+)", header, re.M).group(1)
    if t["sha"] != local_tree:
        raise RuntimeError(f"tree 不一致: 远端 {t['sha']} / 本地 {local_tree}")
    print(f"tree 一致: {t['sha'][:8]}")

    am = re.search(r"^author (.*) <([^>]+)> (\d+) ([+-]\d{4})$", header, re.M)
    cm = re.search(r"^committer (.*) <([^>]+)> (\d+) ([+-]\d{4})$", header, re.M)
    commit = api("git/commits", {
        "message": message,
        "tree": t["sha"],
        "parents": [parent] if parent else [],
        "author": {"name": am.group(1), "email": am.group(2),
                   "date": iso_from_git(am.group(3), am.group(4))},
        "committer": {"name": cm.group(1), "email": cm.group(2),
                      "date": iso_from_git(cm.group(3), cm.group(4))},
    })
    local_sha = git("rev-parse", "HEAD").decode().strip()
    if commit["sha"] != local_sha:
        raise RuntimeError(f"commit 不一致: 远端 {commit['sha']} / 本地 {local_sha}")

    api(f"git/refs/heads/{BRANCH}", {"sha": commit["sha"], "force": True}, method="PATCH")
    print(f"同步完成: {BRANCH} -> {commit['sha']}（与本地 HEAD 一致）")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)
