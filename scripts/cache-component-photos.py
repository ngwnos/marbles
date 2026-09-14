"""Cache the comparison video's original reference photos, without modifying them."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[1]
parts = json.loads((root / 'tests/fixtures/component-photos.json').read_text())
cache = root / 'tmp/component-video/photos'
cache.mkdir(parents=True, exist_ok=True)
urls = list(dict.fromkeys(p['url'] for part in parts for p in part['photos']))

def download(url):
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    path = cache / (key + '.image')
    if not path.exists():
        data = urllib.request.urlopen(url, timeout=30).read()
        if len(data) < 1000:
            raise ValueError(f'Empty reference photo: {url}')
        path.write_bytes(data)
    return url, '/tmp/component-video/photos/' + path.name

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    manifest = dict(pool.map(download, urls))
(cache.parent / 'photos.json').write_text(json.dumps(manifest, indent=2))
print(f'Cached {len(manifest)} original photos for {len(parts)} components')
