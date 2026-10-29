#!/usr/bin/env python3
"""Verify the CiceroMachine distribution; Python 3.9+, standard library only.

This checks file identity and local references. It does not execute a debate,
install a skill, or prove that the host provides GPT agents and search tools.
"""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--overlay", action="store_true", help="check additions only")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    manifest_path = root / "docs/chatgpt-skill/release-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors = []
    originals = {item["path"]: item for item in manifest["upstream_files"]}
    additions = {item["path"]: item for item in manifest["added_files"]}
    modifications = {item["path"]: item for item in manifest.get("modified_upstream_files", [])}
    expected = set(originals) | set(additions)

    def require(condition, message):
        if not condition:
            errors.append(message)

    def safe_file(relative):
        part = PurePosixPath(relative)
        if part.is_absolute() or ".." in part.parts or "\\" in relative:
            raise ValueError("Unsafe manifest path: " + relative)
        candidate = root / relative
        if candidate.is_symlink() or root not in candidate.resolve().parents:
            raise ValueError("Path is not a contained regular file: " + relative)
        return candidate

    require(len(originals) == manifest["counts"]["upstream_files"], "Original count mismatch")
    require(len(additions) == manifest["counts"]["added_files"], "Addition count mismatch")
    require(len(modifications) == manifest["counts"]["modified_files"], "Modification count mismatch")
    require(set(modifications) <= set(originals), "Modified path is absent from upstream baseline")
    for relative, item in modifications.items():
        require(item.get("baseline_git_blob_sha1") == originals.get(relative, {}).get("git_blob_sha1"),
                "Modified file baseline mismatch: " + relative)
    require(not set(originals) & set(additions), "An addition collides with an original file")
    checked = 0
    current_originals = [modifications.get(relative, item) for relative, item in originals.items()]
    for item in list(additions.values()) + ([] if args.overlay else current_originals):
        relative = item["path"]
        try:
            path = safe_file(relative)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if not path.is_file():
            errors.append("Missing file: " + relative)
            continue
        data = path.read_bytes()
        if item.get("sha256"):
            require(sha256(data) == item["sha256"], "SHA-256 mismatch: " + relative)
            require(len(data) == item["size_bytes"], "Size mismatch: " + relative)
            checked += 1
        else:
            require(path == manifest_path, "Unexpected unhashed file: " + relative)
        if item.get("git_blob_sha1"):
            require(git_blob_sha(data) == item["git_blob_sha1"], "Git blob mismatch: " + relative)

    skill = root / "skills/cicero-machine"
    entry = skill / "SKILL.md"
    if entry.is_file():
        source = entry.read_text(encoding="utf-8")
        frontmatter = re.match(r"\A---\n(.*?)\n---\n", source, re.S)
        require(bool(frontmatter), "SKILL.md lacks YAML frontmatter delimiters")
        if frontmatter:
            fields = dict(re.findall(r"^([a-z_]+):\s*(.+)$", frontmatter.group(1), re.M))
            require(set(fields) == {"name", "description"}, "Unexpected frontmatter fields")
            require(fields.get("name") == "cicero-machine", "Unexpected skill name")
            require(bool(fields.get("description", "").strip()), "Missing description")
        require(len(source.splitlines()) < 500, "SKILL.md exceeds the concise-entry guideline")

    metadata = skill / "agents/openai.yaml"
    icon_refs = 0
    if metadata.is_file():
        text = metadata.read_text(encoding="utf-8")
        require("$cicero-machine" in text, "Default prompt does not mention the skill")
        for value in re.findall(r"^\s+icon_(?:small|large):\s*(.+)$", text, re.M):
            value = value.strip().strip("\"'")
            target = (skill / value).resolve()
            require(skill in target.parents and target.is_file(), "Broken icon reference: " + value)
            icon_refs += 1
        require(icon_refs == 2, "Expected both existing icon references")
    icon = skill / "assets/icon.svg"
    if icon.is_file():
        try:
            ET.parse(icon)
        except ET.ParseError as exc:
            errors.append("Invalid SVG XML: " + str(exc))

    report = skill / "references/report-template.md"
    if report.is_file():
        headings = re.findall(r"^## ([1-8])\.", report.read_text(encoding="utf-8"), re.M)
        require(headings == list("12345678"), "Report does not contain the eight ordered sections")
    upstream_note = skill / "references/upstream.md"
    if upstream_note.is_file():
        require(manifest["upstream"]["commit"] in upstream_note.read_text(encoding="utf-8"),
                "Skill upstream reference differs from the release baseline")
    license_path = skill / "LICENSE"
    if license_path.is_file():
        require(sha256(license_path.read_bytes()) == originals["LICENSE"]["sha256"],
                "Skill MIT license differs from upstream")

    local_links = 0
    pinned_links = 0
    markdown_paths = sorted(p for p in (additions if args.overlay else expected) if p.endswith(".md"))
    for relative in markdown_paths:
        path = safe_file(relative)
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        text = re.sub(r"(?ms)^```[^\n]*\n.*?^```[ \t]*$", "", text)
        text = re.sub(r"`+[^`\n]*`+", "", text)
        links = re.findall(r"\[[^\]]*\]\(([^\s)]+)(?:\s+\"[^\"]*\")?\)", text)
        links += re.findall(r"(?:href|src)=[\"']([^\"']+)[\"']", text)
        for target in links:
            target = target.strip("<>")
            parts = urlsplit(target)
            if parts.scheme or parts.netloc:
                match = re.match(r"https://github\.com/TimeCracker/CiceroMachine/blob/([0-9a-f]{40})/(.+)", target)
                if match:
                    revision, repo_path = match.groups()
                    repo_path = unquote(urlsplit(repo_path).path)
                    require(revision == manifest["upstream"]["commit"], "Unexpected pinned revision: " + target)
                    require(repo_path in originals, "Pinned upstream file absent from baseline: " + repo_path)
                    pinned_links += 1
                continue
            if not parts.path:
                continue
            candidate = (path.parent / unquote(parts.path)).resolve()
            require(candidate == root or root in candidate.parents, "Reference escapes release: " + target)
            try:
                repo_path = candidate.relative_to(root).as_posix()
            except ValueError:
                continue
            exists = candidate.exists() or (args.overlay and repo_path in originals)
            require(exists, "Broken local reference in " + relative + ": " + target)
            local_links += 1

    result = {
        "mode": "additions-only" if args.overlay else "full-release",
        "upstream_commit": manifest["upstream"]["commit"],
        "upstream_files_verified": 0 if args.overlay else len(originals),
        "unchanged_upstream_files_verified": 0 if args.overlay else len(originals) - len(modifications),
        "modified_upstream_files_verified": 0 if args.overlay else len(modifications),
        "added_files_present": len(additions),
        "files_hash_checked": checked,
        "local_links_checked": local_links,
        "pinned_upstream_links_checked": pinned_links,
        "icon_references_checked": icon_refs,
        "manifest_self_hash_excluded": True,
        "live_debate_tested": False,
        "errors": errors,
        "status": "FAIL" if errors else "PASS",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("Verification failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
