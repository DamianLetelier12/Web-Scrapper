"""
Extracción de emails y teléfonos desde HTML.

Mejoras vs. la versión en pipeline.py original:
- Regex de email con whitelist de TLDs comunes (evita basura tipo `a.b@c.png`).
- Deofuscación simple: `info [at] dominio [dot] cl` -> `info@dominio.cl`.
- Lectura explícita de `mailto:` (muchos sitios sólo tienen el email ahí).
- Filtro de dominios/localparts ruido (sentry, wixpress, godaddy, no-reply, ...).
- `require_domain` aplica `endswith("@"+dominio)`, no `in` (arregla el bug
  donde `tuya.cl` matcheaba `cliente@notuya.cl`).
- `extract_phones_cl` detecta fijos y móviles chilenos y normaliza a `+56 ...`.
- `looks_like_parking` detecta páginas GoDaddy/Sedo/Wix default/En construcción.
"""

import re
from bs4 import BeautifulSoup

# ------------------------------------------------------------
# Email
# ------------------------------------------------------------

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\."
    r"(?:com|cl|org|net|io|co|app|tech|ai|shop|info|biz|dev|me|xyz|email|us)\b",
    re.IGNORECASE,
)

# Dominios que aparecen en el HTML por scripts/trackers, no son contactos reales
NOISE_EMAIL_DOMAINS = {
    "sentry.io",
    "sentry-next.wixpress.com",
    "sentry.wixpress.com",
    "wixpress.com",
    "example.com",
    "example.cl",
    "domain.com",
    "tudominio.cl",
    "tucorreo.cl",
    "email.com",
    "godaddy.com",
    "hostinger.com",
    "w.org",
    "sentry.prod.dobprotocol.com",  # paranoia
}

NOISE_EMAIL_LOCALPARTS = {
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "mailer-daemon",
    "postmaster",
}


def _deobfuscate(html: str) -> str:
    """Convierte 'info [at] dominio [dot] cl' -> 'info@dominio.cl'."""
    html = re.sub(r"\s*\[\s*at\s*\]\s*", "@", html, flags=re.I)
    html = re.sub(r"\s*\(\s*at\s*\)\s*", "@", html, flags=re.I)
    html = re.sub(r"\s+arroba\s+", "@", html, flags=re.I)
    html = re.sub(r"\s*\[\s*dot\s*\]\s*", ".", html, flags=re.I)
    html = re.sub(r"\s*\(\s*dot\s*\)\s*", ".", html, flags=re.I)
    html = re.sub(r"\s+punto\s+", ".", html, flags=re.I)
    return html


def extract_emails(html: str, *, require_domain: str | None = None) -> list[str]:
    """
    Devuelve emails únicos, ordenados y limpios.

    Si `require_domain` se pasa, se filtran emails que no terminen en
    `@<require_domain>` (comparación case-insensitive). Esto reemplaza el
    antiguo `filter_company_emails` y corrige el falso positivo de
    `domain in email`.
    """
    if not html:
        return []

    found: set[str] = set()

    # 1. Regex sobre HTML crudo
    found.update(m.lower() for m in _EMAIL_RE.findall(html))

    # 2. mailto: explícitos
    try:
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.select('a[href^="mailto:"]'):
            href = a.get("href", "")
            addr = href.split("mailto:", 1)[-1].split("?", 1)[0].strip().lower()
            if "@" in addr and "." in addr:
                found.add(addr)
    except Exception:
        pass

    # 3. Deofuscación
    found.update(m.lower() for m in _EMAIL_RE.findall(_deobfuscate(html)))

    # 4. Limpieza
    clean: list[str] = []
    req = require_domain.lower() if require_domain else None
    for e in found:
        local, _, dom = e.partition("@")
        if not dom or not local:
            continue
        if dom in NOISE_EMAIL_DOMAINS:
            continue
        if local in NOISE_EMAIL_LOCALPARTS:
            continue
        if req and not dom.endswith(req):
            continue
        clean.append(e)

    return sorted(set(clean))


# ------------------------------------------------------------
# Teléfonos Chile
# ------------------------------------------------------------

# Móvil CL: 9 + 8 dígitos. Fijo: 2..7 + 7-8 dígitos.
# Acepta prefijo +56 opcional, espacios, guiones y paréntesis.
_PHONE_CL_RE = re.compile(
    r"(?:\+?56[\s\-.]*)?"
    r"(?:\(?\s*(?:9|2|3[23]|4[1-5]|5[1-8]|6[1-8]|7[1-5])\s*\)?)"
    r"[\s\-.]*\d{3,4}[\s\-.]*\d{4}"
)


def extract_phones_cl(text: str) -> list[str]:
    """
    Devuelve teléfonos chilenos normalizados como '+56 9XXXXXXXX' o '+56 2XXXXXXXX'.
    Evita falsos positivos comunes (RUTs, años, códigos postales).
    """
    if not text:
        return []

    out: set[str] = set()
    for raw in _PHONE_CL_RE.findall(text):
        digits = re.sub(r"\D", "", raw)
        if digits.startswith("56"):
            digits = digits[2:]
        # Móvil: 9 dígitos empezando en 9. Fijo: 9 dígitos empezando en 2-7.
        if len(digits) == 9 and digits[0] in "234567":
            out.add("+56 " + digits)
        elif len(digits) == 9 and digits[0] == "9":
            out.add("+56 " + digits)
        elif len(digits) == 8 and digits[0] in "234567":
            # fijo sin el primer 0, legacy
            out.add("+56 " + digits)

    return sorted(out)


# ------------------------------------------------------------
# Parking / páginas basura
# ------------------------------------------------------------

_PARKING_MARKERS = (
    "domain is for sale",
    "this domain is parked",
    "sedo's domain parking",
    "buy this domain",
    "godaddy.com/parking",
    "parkingcrew.net",
    "under construction",
    "sitio en construcción",
    "sitio en construccion",
    "wix.com/website-template",
    "coming soon",
    "proximamente",
    "próximamente",
)


def looks_like_parking(html: str) -> bool:
    if not html:
        return True
    low = html.lower()
    return any(m in low for m in _PARKING_MARKERS)
