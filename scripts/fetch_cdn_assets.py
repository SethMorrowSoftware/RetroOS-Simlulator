#!/usr/bin/env python3
"""Vendor external CDN assets into local files and optionally rewrite source refs.

Usage:
  python scripts/fetch_cdn_assets.py

Behavior:
- Downloads assets from config/cdn-assets.json
- Recursively localizes CSS url(...) dependencies
- Scans project source for external CDN asset URLs and rewrites them to local files
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / 'config' / 'cdn-assets.json'

CSS_URL_RE = re.compile(r"url\((?P<quote>['\"]?)(?P<url>[^)'\"]+)(?P=quote)\)", re.IGNORECASE)
HTTP_URL_RE = re.compile(r"https?://[^\s'\")]+", re.IGNORECASE)
SOURCE_GLOBS = ('*.html', '*.css', '*.js')
SCAN_DIRS = ('styles', '.', 'admin')
CDN_HOST_HINTS = ('cdnjs.', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com')
ASSET_EXTS = {'.css', '.js', '.mjs', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'}


def log(message: str) -> None:
    print(f"[vendor] {message}")


def fetch_bytes(url: str) -> bytes:
    req = Request(url, headers={'User-Agent': 'newRetroOS-vendor-fetcher/1.0', 'Accept': '*/*'})
    with urlopen(req, timeout=30) as response:
        return response.read()


def safe_filename_from_url(url: str) -> str:
    parsed = urlparse(url)
    name = Path(parsed.path).name or 'asset'
    stem = Path(name).stem
    suffix = Path(name).suffix
    digest = hashlib.sha1(url.encode('utf-8')).hexdigest()[:10]
    return f"{stem}.{digest}{suffix}" if suffix else f"{stem}.{digest}"


def should_skip_url(raw_url: str) -> bool:
    lowered = raw_url.strip().lower()
    return not lowered or lowered.startswith(('data:', 'blob:', '#'))


def write_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def vendor_css_dependencies(css_text: str, source_url: str, css_output: Path) -> str:
    deps_dir = css_output.parent / 'deps'

    def replace(match: re.Match) -> str:
        raw = match.group('url').strip()
        if should_skip_url(raw):
            return match.group(0)

        resolved = urljoin(source_url, raw)
        parsed = urlparse(resolved)
        if parsed.scheme not in ('http', 'https'):
            return match.group(0)

        target = deps_dir / safe_filename_from_url(resolved)
        if not target.exists():
            try:
                write_file(target, fetch_bytes(resolved))
                log(f"fetched dependency {resolved} -> {target.relative_to(REPO_ROOT)}")
            except Exception as exc:  # noqa: BLE001
                log(f"warning: failed dependency {resolved}: {exc}")
                return match.group(0)

        rel = target.relative_to(css_output.parent).as_posix()
        return f"url('{rel}')"

    return CSS_URL_RE.sub(replace, css_text)


def vendor_asset(url: str, output: Path) -> None:
    payload = fetch_bytes(url)
    if output.suffix.lower() == '.css':
        css = payload.decode('utf-8', errors='replace')
        css = vendor_css_dependencies(css, url, output)
        write_file(output, css.encode('utf-8'))
    else:
        write_file(output, payload)
    log(f"fetched {url} -> {output.relative_to(REPO_ROOT)}")


def is_cdn_asset_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    host = (parsed.netloc or '').lower()
    path = parsed.path.lower()
    if any(hint in host for hint in CDN_HOST_HINTS):
        return True
    return any(path.endswith(ext) for ext in ASSET_EXTS)


def local_output_for_scanned_url(url: str) -> Path:
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace(':', '_')
    filename = safe_filename_from_url(url)
    return REPO_ROOT / 'assets' / 'vendor' / 'auto' / host / filename


def rewrite_source_urls() -> int:
    rewrites = 0
    files = []
    for folder in SCAN_DIRS:
        base = REPO_ROOT / folder
        if not base.exists():
            continue
        for pattern in SOURCE_GLOBS:
            files.extend(base.rglob(pattern))

    # de-dupe and skip vendor output itself
    files = sorted({f for f in files if 'assets/vendor/' not in f.as_posix()})

    for file_path in files:
        text = file_path.read_text(encoding='utf-8', errors='ignore')
        urls = sorted(set(HTTP_URL_RE.findall(text)))
        if not urls:
            continue

        updated = text
        for url in urls:
            if not is_cdn_asset_url(url):
                continue
            out = local_output_for_scanned_url(url)
            if not out.exists():
                try:
                    vendor_asset(url, out)
                except Exception as exc:  # noqa: BLE001
                    log(f"warning: failed scanned URL {url}: {exc}")
                    continue
            rel = Path(out).relative_to(file_path.parent).as_posix()
            updated = updated.replace(url, rel)

        if updated != text:
            file_path.write_text(updated, encoding='utf-8')
            rewrites += 1
            log(f"rewrote CDN URLs in {file_path.relative_to(REPO_ROOT)}")

    return rewrites


def process_manifest() -> int:
    if not MANIFEST_PATH.exists():
        log(f"warning: manifest not found: {MANIFEST_PATH}")
        return 0

    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    assets = manifest.get('assets', [])
    failures = 0
    for entry in assets:
        url = entry.get('url')
        output = entry.get('output')
        if not url or not output:
            log(f"warning: invalid manifest entry: {entry!r}")
            failures += 1
            continue
        try:
            vendor_asset(url, REPO_ROOT / output)
        except Exception as exc:  # noqa: BLE001
            failures += 1
            log(f"error: failed {url}: {exc}")
    return failures


def main() -> int:
    failures = process_manifest()
    rewrites = rewrite_source_urls()
    log(f"source files rewritten: {rewrites}")
    return 0 if failures == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
