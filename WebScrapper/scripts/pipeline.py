import logging
from datetime import datetime
from urllib.parse import urlparse

import pandas as pd
from bs4 import BeautifulSoup

from leadgen.http import safe_request
from leadgen.extract import extract_emails, extract_phones_cl, looks_like_parking

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

print("🚀 Pipeline Chile + Apollo CSV iniciado")

# ========================
# STATS
# ========================
stats = {
    "profiles_found": 0,
    "websites_extracted": 0,
    "websites_failed": 0,
    "emails_found": 0,
    "apollo_loaded": 0
}

# ========================
# DOMAIN
# ========================
def get_domain(url):
    try:
        return urlparse(url).netloc.replace("www.", "")
    except:
        return ""

# ========================
# EMPRESACHILE
# ========================
def extract_empresachile():
    print("🌐 Empresachile scraping...")

    companies = set()

    for kw in ["energia", "industrial", "construccion"]:
        for p in range(1, 6):
            url = f"https://www.empresachile.cl/index.php?s={kw}&page={p}"

            html = safe_request(url)
            if not html:
                continue

            soup = BeautifulSoup(html, "html.parser")

            for a in soup.find_all("a", href=True):
                href = a["href"]

                if "perfil_publico.php?id=" in href:
                    stats["profiles_found"] += 1

                    if not href.startswith("http"):
                        href = "https://www.empresachile.cl/" + href

                    companies.add(href)

    print(f"📊 perfiles encontrados: {stats['profiles_found']}")
    return list(companies)

# ========================
# WEBSITE EXTRACTION
# ========================
def extract_website_empresachile(url):
    html = safe_request(url)
    if not html:
        stats["websites_failed"] += 1
        return None

    soup = BeautifulSoup(html, "html.parser")

    for a in soup.find_all("a", href=True):
        href = a["href"]

        if not href:
            continue

        if any(x in href for x in ["wa.me", "facebook", "instagram", "linkedin", "empresachile"]):
            continue

        if href.startswith("http"):
            stats["websites_extracted"] += 1
            return href

    stats["websites_failed"] += 1
    return None

# ========================
# SCRAPER
# ========================
def scrape_site(url, domain):
    emails = set()
    phones = set()

    if not url or not domain:
        return [], []

    paths = ["", "/contacto", "/contactenos", "/contact",
             "/about", "/nosotros", "/quienes-somos"]

    for p in paths:
        html = safe_request(url.rstrip("/") + p)
        if not html:
            continue
        if looks_like_parking(html):
            continue
        emails.update(extract_emails(html, require_domain=domain))
        phones.update(extract_phones_cl(html))

    stats["emails_found"] += len(emails)
    return sorted(emails), sorted(phones)

# ========================
# APOLLO CSV
# ========================
def load_apollo_csv(file="apollo_leads.csv"):
    try:
        df = pd.read_csv(file)

        leads = []
        for _, row in df.iterrows():
            website = row.get("website")
            if pd.notna(website):
                leads.append(str(website))

        stats["apollo_loaded"] = len(leads)

        print(f"📊 Apollo loaded: {len(leads)}")
        return leads

    except Exception as e:
        print("⚠️ error loading apollo csv:", e)
        return []

# ========================
# MAIN
# ========================
if __name__ == "__main__":

    print("🚀 Iniciando pipeline...\n")

    empresachile_sources = extract_empresachile()
    apollo_sources = load_apollo_csv()

    print(f"\n📊 Empresachile: {len(empresachile_sources)}")
    print(f"📊 Apollo: {len(apollo_sources)}\n")

    results = []
    seen_domains = set()

    # ========================
    # EMPRESACHILE
    # ========================
    for idx, c in enumerate(empresachile_sources[:50]):

        print(f"\n🔍 EC [{idx}] {c}")

        website = extract_website_empresachile(c)
        if not website:
            continue

        domain = get_domain(website)
        if not domain or domain in seen_domains:
            continue

        emails, phones = scrape_site(website, domain)

        if not emails:
            continue

        seen_domains.add(domain)

        print("📧", emails, "📞", phones)

        results.append({
            "source": "empresachile",
            "website": website,
            "domain": domain,
            "emails": ", ".join(emails),
            "phones": ", ".join(phones),
            "date": datetime.now().strftime("%Y-%m-%d")
        })

    # ========================
    # APOLLO
    # ========================
    for idx, website in enumerate(apollo_sources):

        print(f"\n🔍 AP [{idx}] {website}")

        if not website:
            continue

        domain = get_domain(website)
        if not domain or domain in seen_domains:
            continue

        emails, phones = scrape_site(website, domain)

        if not emails:
            continue

        seen_domains.add(domain)

        print("📧", emails, "📞", phones)

        results.append({
            "source": "apollo",
            "website": website,
            "domain": domain,
            "emails": ", ".join(emails),
            "phones": ", ".join(phones),
            "date": datetime.now().strftime("%Y-%m-%d")
        })

    # ========================
    # EXPORT CSV ONLY
    # ========================
    if len(results) > 0:
        df = pd.DataFrame(results)
        cols = ["source", "website", "domain", "emails", "phones", "date"]
        df = df[[c for c in cols if c in df.columns]]
    else:
        print("⚠️ No hay leads para exportar")
        df = pd.DataFrame(columns=["source", "website", "domain", "emails", "phones", "date"])

    csv_file = "leads_final.csv"
    df.to_csv(csv_file, index=False)

    # ========================
    # RESUMEN FINAL
    # ========================
    print("\n========================")
    print("📊 RESUMEN")
    print("========================")
    print(f"Empresachile: {len(empresachile_sources)}")
    print(f"Apollo: {len(apollo_sources)}")
    print(f"leads finales: {len(results)}")
    print(f"emails encontrados: {stats['emails_found']}")
    print("========================")
    print(f"📦 CSV generado: {csv_file}")
    print("✅ Pipeline finalizado correctamente")
