/**
 * Professional investor lead scraping for DobProtocol CRM.
 * Sources: CryptoRank (funding rounds), curated list, Apollo enrichment
 * Cron: Bi-weekly (1st and 15th) 11am UTC
 *
 * Usage: npx tsx scripts/commercial/scrape-investors.ts
 */

import { prisma } from './db'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || ''
const HUNTER_API_KEY = process.env.HUNTER_API_KEY || ''
const CRYPTORANK_API_KEY = process.env.CRYPTORANK_API_KEY || ''

interface InvestorLead {
  name: string
  company: string
  focus: string
  linkedin: string | null
  email: string | null
  website: string | null
  source: string
  tags: string[]
}

// ── Source 1: Curated Web3 investors (expanded list) ─────────────

function getCuratedInvestors(): InvestorLead[] {
  const investors = [
    // Stellar ecosystem
    { name: 'Denelle Dixon', company: 'Stellar Development Foundation', focus: 'Stellar ecosystem, infrastructure' },
    { name: 'Tomer Weller', company: 'Stellar Development Foundation', focus: 'Stellar developer tools, Soroban' },
    { name: 'Justin Rice', company: 'Stellar Development Foundation', focus: 'Stellar ecosystem growth' },

    // DeFi infrastructure VCs (Partners)
    { name: 'Haseeb Qureshi', company: 'Dragonfly Capital', focus: 'DeFi infrastructure, protocols' },
    { name: 'Tom Schmidt', company: 'Dragonfly Capital', focus: 'DeFi, developer tooling' },
    { name: 'Jesse Walden', company: 'Variant Fund', focus: 'DAO tooling, token distribution, ownership economy' },
    { name: 'Li Jin', company: 'Variant Fund', focus: 'Creator economy, token distribution' },
    { name: 'Kyle Samani', company: 'Multicoin Capital', focus: 'DeFi, cross-chain infrastructure' },
    { name: 'Spencer Noon', company: 'Variant Fund', focus: 'DeFi, on-chain data' },

    // LATAM-focused
    { name: 'Hernan Kazah', company: 'Kaszek Ventures', focus: 'LATAM fintech, Web3' },
    { name: 'Wences Casares', company: 'Xapo', focus: 'Crypto infrastructure, LATAM' },
    { name: 'Santiago Siri', company: 'Democracy Earth', focus: 'DAOs, governance, LATAM' },
    { name: 'Federico Ast', company: 'Kleros', focus: 'Decentralized justice, DAOs' },

    // Infrastructure & DeFi angels
    { name: 'Balaji Srinivasan', company: 'Angel', focus: 'Web3 infrastructure, network states' },
    { name: 'Naval Ravikant', company: 'AngelList', focus: 'Infrastructure, developer tools' },
    { name: 'Sandeep Nailwal', company: 'Polygon Ventures', focus: 'L2, DeFi infrastructure' },
    { name: 'Andre Cronje', company: 'Fantom / Solidly', focus: 'DeFi protocols, yield' },
    { name: 'Stani Kulechov', company: 'Aave / Lens', focus: 'DeFi, lending, social' },
    { name: 'Robert Leshner', company: 'Compound / Superstate', focus: 'DeFi, governance, RWA' },
    { name: 'Hayden Adams', company: 'Uniswap', focus: 'DEX, DeFi, AMM' },

    // DAO & distribution focused
    { name: 'Aaron Wright', company: 'Tribute Labs', focus: 'DAOs, governance frameworks' },
    { name: 'Kain Warwick', company: 'Synthetix / Infinex', focus: 'DeFi, token distribution, staking' },
    { name: 'Jordan Fish', company: 'Cobie / Angel', focus: 'DeFi, fair launches, distribution' },

    // Grants & accelerator leads
    { name: 'Lani Lazzari', company: 'Alliance DAO', focus: 'Web3 acceleration' },
    { name: 'Jamie Burke', company: 'Outlier Ventures', focus: 'Web3 accelerator, DeFi' },

    // RWA & payroll (DobProtocol verticals)
    { name: 'Tyler Mulvihill', company: 'Trident Digital', focus: 'RWA tokenization, distribution' },
    { name: 'Opolis', company: 'Opolis', focus: 'Web3 payroll, employment DAO' },

    // Infrastructure VCs
    { name: 'Olaf Carlson-Wee', company: 'Polychain Capital', focus: 'Crypto infrastructure' },
    { name: 'Chris Burniske', company: 'Placeholder VC', focus: 'Crypto infrastructure, governance' },
    { name: 'Joel Monegro', company: 'Placeholder VC', focus: 'Fat protocol thesis, infrastructure' },
    { name: 'Arianna Simpson', company: 'a16z crypto', focus: 'DeFi, infrastructure' },
    { name: 'Ali Yahya', company: 'a16z crypto', focus: 'Crypto infrastructure, protocols' },
    { name: 'Dan Robinson', company: 'Paradigm', focus: 'DeFi, AMM research' },
    { name: 'Georgios Konstantopoulos', company: 'Paradigm', focus: 'Infrastructure, MEV' },
  ]

  return investors.map(i => ({
    ...i,
    linkedin: null,
    email: null,
    website: null,
    source: 'curated',
    tags: ['curated', 'web3-investor'],
  }))
}

// ── Source 2: CryptoRank (recent funding rounds in DeFi/infra) ───

async function scrapeRecentFundings(): Promise<InvestorLead[]> {
  const leads: InvestorLead[] = []

  if (!CRYPTORANK_API_KEY) {
    console.log('[scrape-investors] No CRYPTORANK_API_KEY, trying public endpoint...')
  }

  try {
    // Try CryptoRank API for recent funding rounds
    const url = CRYPTORANK_API_KEY
      ? `https://api.cryptorank.io/v1/funding-rounds?limit=100&category=defi,infrastructure&api_key=${CRYPTORANK_API_KEY}`
      : 'https://api.cryptorank.io/v1/funding-rounds?limit=50'

    const res = await fetch(url)
    if (!res.ok) {
      console.log(`[scrape-investors] CryptoRank: ${res.status}`)
      return leads
    }
    const data = await res.json()
    const rounds = data.data || []

    const seen = new Set<string>()

    for (const round of rounds) {
      const investors = round.investors || round.funds || []
      for (const inv of investors) {
        const name = inv.name || inv.fundName
        if (!name || seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())

        leads.push({
          name: name,
          company: name,
          focus: `Invested in ${round.projectName || 'Web3'} (${round.type || 'funding'})`,
          linkedin: null,
          email: null,
          website: inv.website || inv.url || null,
          source: 'cryptorank',
          tags: ['cryptorank', 'active-investor', round.type || 'funding'].filter(Boolean),
        })
      }
    }
    console.log(`[scrape-investors] CryptoRank: ${leads.length} investors from recent rounds`)
  } catch (err) {
    console.error('[scrape-investors] CryptoRank failed:', err)
  }
  return leads
}

// ── Email enrichment ─────────────────────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '')
  } catch { return null }
}

async function findDomainViaApollo(company: string): Promise<string | null> {
  if (!APOLLO_API_KEY) return null
  try {
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
      body: JSON.stringify({ q_organization_name: company, per_page: 1 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.organizations?.[0]?.primary_domain || null
  } catch { return null }
}

async function findEmailViaApollo(firstName: string, lastName: string, domain: string): Promise<{ email: string | null, linkedin: string | null }> {
  if (!APOLLO_API_KEY) return { email: null, linkedin: null }
  try {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, organization_domain: domain }),
    })
    if (!res.ok) return { email: null, linkedin: null }
    const data = await res.json()
    return {
      email: data.person?.email || null,
      linkedin: data.person?.linkedin_url || null,
    }
  } catch { return { email: null, linkedin: null } }
}

async function findEmailViaHunter(firstName: string, lastName: string, domain: string): Promise<string | null> {
  if (!HUNTER_API_KEY) return null
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${HUNTER_API_KEY}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.data?.email && data.data.score >= 50) return data.data.email
  } catch { }
  return null
}

async function enrichInvestor(inv: InvestorLead): Promise<void> {
  const [firstName, ...rest] = inv.name.split(' ')
  const lastName = rest.join(' ')

  // Find company domain
  let domain = extractDomain(inv.website)
  if (!domain) {
    domain = await findDomainViaApollo(inv.company)
    if (domain) inv.website = `https://${domain}`
  }
  if (!domain) return

  // Try Apollo first (better free tier)
  const apollo = await findEmailViaApollo(firstName, lastName, domain)
  if (apollo.email) {
    inv.email = apollo.email
    if (apollo.linkedin) inv.linkedin = apollo.linkedin
    return
  }

  // Fallback to Hunter
  const hunterEmail = await findEmailViaHunter(firstName, lastName, domain)
  if (hunterEmail) inv.email = hunterEmail
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('[scrape-investors] Starting professional investor scraping...\n')

  const existing = await prisma.crmLead.findMany({
    where: { leadType: 'investor' },
    select: { contactName: true, companyName: true },
  })
  const existingNames = new Set(existing.map(l => l.contactName?.toLowerCase()))
  const existingCompanies = new Set(existing.map(l => l.companyName.toLowerCase()))

  // Get investors from all sources
  const curated = getCuratedInvestors()
  const fundingInvestors = await scrapeRecentFundings()
  const allInvestors = [...curated, ...fundingInvestors]

  // Deduplicate
  const seen = new Set<string>()
  const newInvestors: InvestorLead[] = []

  for (const inv of allInvestors) {
    const nameKey = inv.name.toLowerCase()
    const companyKey = inv.company.toLowerCase()
    if (existingNames.has(nameKey)) continue
    if (inv.source === 'cryptorank' && existingCompanies.has(companyKey)) continue
    if (seen.has(nameKey)) continue
    seen.add(nameKey)
    newInvestors.push(inv)
  }

  console.log(`[scrape-investors] New investors to process: ${newInvestors.length}`)

  if (newInvestors.length === 0) {
    console.log('[scrape-investors] No new investors. Done.')
    return
  }

  // Enrich with emails (top 30 to save API credits)
  const toEnrich = newInvestors.slice(0, 30)
  let enriched = 0

  for (const inv of toEnrich) {
    await enrichInvestor(inv)
    if (inv.email) enriched++
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log(`[scrape-investors] Enriched ${enriched}/${toEnrich.length} with emails`)

  // Insert all
  let inserted = 0
  for (const inv of newInvestors) {
    try {
      await prisma.crmLead.create({
        data: {
          companyName: inv.company,
          contactName: inv.name,
          email: inv.email,
          website: inv.website,
          source: inv.source,
          stage: 'prospect',
          leadType: 'investor',
          linkedinUrl: inv.linkedin,
          investorFocus: inv.focus,
          tags: inv.tags,
        },
      })
      inserted++
      console.log(`[scrape-investors] Added: ${inv.name} (${inv.company})${inv.email ? ` - ${inv.email}` : ''}`)
    } catch (err: any) {
      if (!err.message?.includes('Unique constraint')) {
        console.error(`[scrape-investors] Failed for ${inv.name}:`, err.message)
      }
    }
  }

  console.log(`\n[scrape-investors] Done. Inserted: ${inserted}`)
}

main()
  .catch(err => { console.error('[scrape-investors] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
