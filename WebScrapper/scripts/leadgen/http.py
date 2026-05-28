"""
HTTP con caché en disco, reintentos con backoff y logging.

Uso:
    from leadgen.http import safe_request
    html = safe_request("https://example.com")
    if html:
        ...

A diferencia de la versión anterior:
- Devuelve `str` (el HTML) en vez de un objeto Response, para que el caller no
  tenga que acordarse de usar `.text`.
- Loguea el motivo real de cada fallo (SSL, DNS, timeout, status != 200).
- Cachea en ./.cache/<md5(url)>.html para que re-ejecutar el pipeline no
  vuelva a pegarle a los mismos sitios (acelera enormemente las iteraciones).
- Rota User-Agents más realistas.
"""

import hashlib
import logging
import random
import time
from pathlib import Path

import requests

log = logging.getLogger("leadgen.http")

CACHE_DIR = Path(".cache")
CACHE_DIR.mkdir(exist_ok=True)

UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) "
    "Gecko/20100101 Firefox/124.0",
]


def _cache_path(url: str) -> Path:
    return CACHE_DIR / (hashlib.md5(url.encode("utf-8")).hexdigest() + ".html")


def safe_request(
    url: str,
    *,
    timeout: int = 10,
    use_cache: bool = True,
    max_retries: int = 3,
) -> str | None:
    """
    Descarga una URL devolviendo el HTML como string, o None si falla.

    - use_cache=True (por defecto): lee/escribe en ./.cache
    - Reintentos con backoff exponencial + jitter
    - Cada tipo de error se loguea con su causa
    """
    if use_cache:
        cp = _cache_path(url)
        if cp.exists():
            return cp.read_text(encoding="utf-8", errors="ignore")

    headers = {
        "User-Agent": random.choice(UA_POOL),
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    for attempt in range(max_retries):
        try:
            r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            if r.status_code == 200 and r.text:
                if use_cache:
                    try:
                        _cache_path(url).write_text(r.text, encoding="utf-8", errors="ignore")
                    except OSError as e:
                        log.debug("cache write failed url=%s err=%s", url, e)
                return r.text
            log.info("status=%s url=%s attempt=%d", r.status_code, url, attempt + 1)
        except requests.exceptions.SSLError as e:
            log.info("ssl url=%s err=%s", url, e)
        except requests.exceptions.ConnectionError as e:
            log.info("conn url=%s err=%s", url, e)
        except requests.exceptions.Timeout:
            log.info("timeout url=%s", url)
        except requests.exceptions.RequestException as e:
            log.info("req url=%s err=%s", url, e)

        time.sleep((1.5 ** attempt) + random.random())

    return None
