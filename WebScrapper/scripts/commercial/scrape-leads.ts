/**
 * Professional multi-source lead scraping for DobProtocol CRM.
 * Sources: DefiLlama, CoinGecko, DeepDAO, Stellar SCF, GitHub
 * Cron: Weekly Monday 8:30am UTC
 *
 * Usage: npx tsx scripts/commercial/scrape-leads.ts
 */

import { prisma } from './db'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const COINGECKO_DEMO_KEY = process.env.COINGECKO_API_KEY || ''

interface ScrapedLead {
  companyName: string
  website: string | null
  email: string | null
  contactName: string | null
  country: string | null
  source: string
  tier: string | null
  tags: string[]
  linkedinUrl: string | null
}

function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '')
  } catch {
    return null
  }
}

function githubHeaders() {
  const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'DobProtocolCRM' }
  if (GITHUB_TOKEN) h.Authorization = `token ${GITHUB_TOKEN}`
  return h
}

// ── Source 1: DefiLlama (3000+ DeFi protocols with TVL) ──────────

async function scrapeDefiLlama(): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  try {
    console.log('[scrape-leads] Fetching DefiLlama protocols...')
    const res = await fetch('https://api.llama.fi/protocols')
    if (!res.ok) throw new Error(`DefiLlama: ${res.status}`)
    const protocols = await res.json()

    // Filter: TVL > $50K, has a URL
    const relevant = protocols.filter((p: any) => p.tvl > 50000 && p.url)

    for (const p of relevant) {
      const chains = Array.isArray(p.chains) ? p.chains : []
      const tags = ['defillama', p.category || 'defi'].filter(Boolean)

      // Tag by chain relevance
      if (chains.includes('Stellar')) tags.push('stellar')
      if (chains.includes('Base')) tags.push('base')
      if (chains.includes('Arbitrum')) tags.push('arbitrum')
      if (chains.includes('Lisk')) tags.push('lisk')
      if (chains.includes('Ethereum')) tags.push('ethereum')
      if (chains.length > 3) tags.push('multichain')

      // Tier by TVL
      let tier = 'small'
      if (p.tvl > 100_000_000) tier = 'enterprise'
      else if (p.tvl > 10_000_000) tier = 'mid-market'
      else if (p.tvl > 1_000_000) tier = 'growth'

      leads.push({
        companyName: p.name,
        website: p.url || null,
        email: null,
        contactName: null,
        country: null,
        source: 'defillama',
        tier,
        tags,
        linkedinUrl: null,
      })
    }
    console.log(`[scrape-leads] DefiLlama: ${leads.length} protocols`)
  } catch (err) {
    console.error('[scrape-leads] DefiLlama failed:', err)
  }
  return leads
}

// ── Source 2: CoinGecko (enrich with social links) ───────────────

async function scrapeCoinGecko(): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  try {
    console.log('[scrape-leads] Fetching CoinGecko top coins...')
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (COINGECKO_DEMO_KEY) headers['x-cg-demo-api-key'] = COINGECKO_DEMO_KEY

    // Fetch top 250 coins by market cap (pages of 250)
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false',
      { headers }
    )
    if (!res.ok) throw new Error(`CoinGecko markets: ${res.status}`)
    const coins = await res.json()

    // Get detailed info for top 100 (rate limit: 30/min free)
    const top = coins.slice(0, 80)
    let fetched = 0

    for (const coin of top) {
      try {
        await new Promise(r => setTimeout(r, 2200)) // respect rate limit
        const detailRes = await fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`, { headers })
        if (!detailRes.ok) continue
        const detail = await detailRes.json()

        const homepage = detail.links?.homepage?.[0] || null
        const twitter = detail.links?.twitter_screen_name || null
        const github = detail.links?.repos_url?.github?.[0] || null
        const telegram = detail.links?.telegram_channel_identifier || null
        const categories = detail.categories || []

        // Only care about DeFi-related, infrastructure, DAO projects
        const relevantCats = ['decentralized-finance-defi', 'decentralized-exchange', 'yield-farming', 'governance',
          'infrastructure', 'oracle', 'cross-chain', 'layer-2', 'dao', 'real-world-assets', 'liquid-staking']
        const isRelevant = categories.some((c: string) =>
          relevantCats.some(rc => c.toLowerCase().includes(rc.replace('-', ' ')))
        )

        if (!isRelevant && coin.market_cap_rank > 50) continue

        const tags = ['coingecko', ...categories.slice(0, 3).map((c: string) => c.toLowerCase().replace(/\s+/g, '-'))]
        if (twitter) tags.push(`tw:${twitter}`)
        if (github) tags.push('has-github')

        leads.push({
          companyName: detail.name || coin.name,
          website: homepage,
          email: null,
          contactName: null,
          country: detail.country_origin || null,
          source: 'coingecko',
          tier: coin.market_cap_rank <= 50 ? 'enterprise' : coin.market_cap_rank <= 200 ? 'mid-market' : 'growth',
          tags,
          linkedinUrl: null,
        })
        fetched++
      } catch {
        continue
      }
    }
    console.log(`[scrape-leads] CoinGecko: ${fetched} projects enriched`)
  } catch (err) {
    console.error('[scrape-leads] CoinGecko failed:', err)
  }
  return leads
}

// ── Source 3: DeepDAO (DAOs with treasuries) ─────────────────────

async function scrapeDeepDAO(): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  try {
    console.log('[scrape-leads] Fetching DeepDAO organizations...')
    const res = await fetch('https://api.deepdao.io/v0.1/organizations', {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) {
      console.log(`[scrape-leads] DeepDAO returned ${res.status} (may need API key)`)
      return leads
    }
    const data = await res.json()
    const orgs = Array.isArray(data) ? data : data.data || data.organizations || []

    for (const org of orgs.slice(0, 300)) {
      const treasury = org.totalValueUSD || org.treasuryUSD || org.aum || 0
      if (treasury < 10000) continue

      let tier = 'small'
      if (treasury > 10_000_000) tier = 'enterprise'
      else if (treasury > 1_000_000) tier = 'mid-market'
      else if (treasury > 100_000) tier = 'growth'

      const tags = ['deepdao', 'dao']
      if (org.governanceToken) tags.push(`token:${org.governanceToken}`)

      leads.push({
        companyName: org.organizationName || org.name || 'Unknown DAO',
        website: org.website || org.url || null,
        email: null,
        contactName: null,
        country: null,
        source: 'deepdao',
        tier,
        tags,
        linkedinUrl: null,
      })
    }
    console.log(`[scrape-leads] DeepDAO: ${leads.length} DAOs`)
  } catch (err) {
    console.error('[scrape-leads] DeepDAO failed:', err)
  }
  return leads
}

// ── Source 4: Stellar Community Fund Projects ────────────────────

async function scrapeStellarSCF(): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []

  // Curated Stellar ecosystem + SCF-funded projects
  const projects = [
    { name: 'Aquarius', website: 'https://aqua.network', focus: 'AMM/liquidity', funded: true },
    { name: 'Blend Protocol', website: 'https://blend.capital', focus: 'lending', funded: true },
    { name: 'Script3', website: 'https://script3.io', focus: 'DeFi', funded: true },
    { name: 'Soroswap', website: 'https://soroswap.finance', focus: 'DEX', funded: true },
    { name: 'Phoenix Protocol', website: 'https://phoenix-hub.io', focus: 'DeFi hub', funded: true },
    { name: 'Lumenswap', website: 'https://lumenswap.io', focus: 'DEX', funded: false },
    { name: 'StellarTerm', website: 'https://stellarterm.com', focus: 'DEX', funded: false },
    { name: 'Lobstr', website: 'https://lobstr.co', focus: 'wallet', funded: false },
    { name: 'StellarX', website: 'https://stellarx.com', focus: 'DEX', funded: false },
    { name: 'Stellar Quest', website: 'https://quest.stellar.org', focus: 'education', funded: true },
    { name: 'Okashi', website: 'https://okashi.dev', focus: 'dev-tools', funded: true },
    { name: 'Mercury', website: 'https://mercurydata.app', focus: 'indexer', funded: true },
    { name: 'Paltalabs', website: 'https://paltalabs.io', focus: 'DeFi', funded: true },
    { name: 'Xycloo Labs', website: 'https://xycloo.com', focus: 'infrastructure', funded: true },
    { name: 'FxDAO', website: 'https://fxdao.xyz', focus: 'stablecoin', funded: true },
    { name: 'Liqpool', website: 'https://liqpool.finance', focus: 'liquidity', funded: true },
    { name: 'Sorosan', website: 'https://sorosan.building', focus: 'SDK', funded: true },
    { name: 'Stellar Battle', website: 'https://stellarbattle.com', focus: 'gaming', funded: true },
    { name: 'Beans App', website: 'https://beansapp.com', focus: 'payments', funded: false },
    { name: 'Vibrant', website: 'https://vibrantapp.com', focus: 'payments', funded: false },
    { name: 'MoneyGram Access', website: 'https://stellar.org/moneygram', focus: 'remittances', funded: false },
    { name: 'Arf Financial', website: 'https://arf.one', focus: 'cross-border', funded: false },
    { name: 'Airtm', website: 'https://airtm.com', focus: 'peer-exchange', funded: false },
    { name: 'Settling', website: 'https://settling.io', focus: 'payments', funded: false },
  ]

  for (const p of projects) {
    leads.push({
      companyName: p.name,
      website: p.website,
      email: null,
      contactName: null,
      country: null,
      source: p.funded ? 'stellar-scf' : 'stellar-ecosystem',
      tier: 'protocol',
      tags: ['stellar', `focus-${p.focus}`, 'high-priority', ...(p.funded ? ['scf-funded'] : [])],
      linkedinUrl: null,
    })
  }
  console.log(`[scrape-leads] Stellar: ${leads.length} projects`)
  return leads
}

// ── Source 5: GitHub (search for relevant repos + extract emails) ─

async function scrapeGitHub(): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  try {
    console.log('[scrape-leads] Searching GitHub for relevant projects...')
    const queries = [
      'dao+treasury+management language:Solidity stars:>10',
      'token+distribution+smart+contract stars:>15',
      'soroban+contract stars:>5',
      'defi+yield+distributor stars:>10',
      'payroll+web3+crypto stars:>5',
      'airdrop+tool+contract stars:>10',
      'revenue+sharing+smart+contract stars:>5',
    ]

    const seen = new Set<string>()

    for (const q of queries) {
      try {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=50`,
          { headers: githubHeaders() }
        )
        if (!res.ok) {
          console.log(`[scrape-leads] GitHub search rate limited (${res.status}), skipping remaining queries`)
          break
        }
        const data = await res.json()

        for (const repo of data.items || []) {
          if (!repo.owner || seen.has(repo.owner.login.toLowerCase())) continue
          seen.add(repo.owner.login.toLowerCase())

          // Try to get org/user email from profile
          let email: string | null = null
          try {
            await new Promise(r => setTimeout(r, 800))
            const userRes = await fetch(`https://api.github.com/users/${repo.owner.login}`, { headers: githubHeaders() })
            if (userRes.ok) {
              const user = await userRes.json()
              email = user.email || null
            }
          } catch { }

          const tags = ['github', `stars:${repo.stargazers_count}`]
          if (repo.language) tags.push(`lang:${repo.language}`)
          if (repo.topics) tags.push(...repo.topics.slice(0, 5))

          leads.push({
            companyName: repo.owner.login,
            website: repo.homepage || `https://github.com/${repo.owner.login}`,
            email,
            contactName: null,
            country: null,
            source: 'github',
            tier: repo.stargazers_count > 500 ? 'mid-market' : 'growth',
            tags,
            linkedinUrl: null,
          })
        }
        await new Promise(r => setTimeout(r, 2000))
      } catch {
        continue
      }
    }
    console.log(`[scrape-leads] GitHub: ${leads.length} organizations/users`)
  } catch (err) {
    console.error('[scrape-leads] GitHub failed:', err)
  }
  return leads
}

// ── Source 6: DappRadar (top dApps by usage) ─────────────────────

async function scrapeDappRadar(): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  try {
    console.log('[scrape-leads] Fetching DappRadar top dApps...')
    const res = await fetch('https://apis.dappradar.com/v2/dapps?chain=ethereum,arbitrum,base,stellar&range=30d&sort=relevance&order=desc&resultsPerPage=100', {
      headers: { 'X-API-Key': process.env.DAPPRADAR_API_KEY || '' }
    })
    if (!res.ok) {
      console.log(`[scrape-leads] DappRadar: ${res.status} (may need API key)`)
      return leads
    }
    const data = await res.json()
    const dapps = data.results || data.dapps || []

    for (const dapp of dapps) {
      leads.push({
        companyName: dapp.name || dapp.title,
        website: dapp.website || dapp.link || null,
        email: null,
        contactName: null,
        country: null,
        source: 'dappradar',
        tier: 'growth',
        tags: ['dappradar', ...(dapp.categories || []).slice(0, 3)],
        linkedinUrl: null,
      })
    }
    console.log(`[scrape-leads] DappRadar: ${leads.length} dApps`)
  } catch (err) {
    console.error('[scrape-leads] DappRadar failed:', err)
  }
  return leads
}

// ── Email enrichment via Apollo.io ───────────────────────────────

async function enrichWithApollo(leads: ScrapedLead[]): Promise<void> {
  const APOLLO_API_KEY = process.env.APOLLO_API_KEY
  if (!APOLLO_API_KEY) {
    console.log('[scrape-leads] No APOLLO_API_KEY, skipping email enrichment')
    return
  }

  console.log(`[scrape-leads] Enriching ${leads.length} leads via Apollo.io...`)
  let enriched = 0

  for (const lead of leads) {
    if (lead.email) continue // already has email
    const domain = extractDomain(lead.website)
    if (!domain) continue

    try {
      const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
        body: JSON.stringify({
          q_organization_domains: domain,
          person_titles: ['CEO', 'CTO', 'Founder', 'Co-founder', 'Head of Business Development'],
          per_page: 1,
        }),
      })

      if (!res.ok) continue
      const data = await res.json()
      const person = data.people?.[0]

      if (person?.email) {
        lead.email = person.email
        lead.contactName = [person.first_name, person.last_name].filter(Boolean).join(' ')
        if (person.linkedin_url) lead.linkedinUrl = person.linkedin_url
        enriched++
      }
    } catch { }
    await new Promise(r => setTimeout(r, 500))

    // Apollo free tier: limit enrichment to top 50 per run
    if (enriched >= 50) {
      console.log('[scrape-leads] Apollo enrichment limit reached (50)')
      break
    }
  }
  console.log(`[scrape-leads] Apollo enriched: ${enriched} leads with emails`)
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('[scrape-leads] Starting professional multi-source lead scraping...\n')

  // Load existing leads for dedup
  const existing = await prisma.crmLead.findMany({ select: { companyName: true, website: true } })
  const existingDomains = new Set(existing.map(l => extractDomain(l.website)).filter(Boolean))
  const existingNames = new Set(existing.map(l => l.companyName.toLowerCase()))

  // Run all sources (some in parallel where safe)
  const [defiLeads, stellarLeads, githubLeads] = await Promise.all([
    scrapeDefiLlama(),
    scrapeStellarSCF(),
    scrapeGitHub(),
  ])

  // Sequential due to rate limits
  const coinGeckoLeads = await scrapeCoinGecko()
  const deepDAOLeads = await scrapeDeepDAO()
  const dappRadarLeads = await scrapeDappRadar()

  const allLeads = [...stellarLeads, ...defiLeads, ...coinGeckoLeads, ...deepDAOLeads, ...githubLeads, ...dappRadarLeads]
  console.log(`\n[scrape-leads] Total scraped: ${allLeads.length}`)

  // Deduplicate
  const seen = new Set<string>()
  const newLeads: ScrapedLead[] = []

  for (const lead of allLeads) {
    const domain = extractDomain(lead.website)
    const nameKey = lead.companyName.toLowerCase()
    if (existingNames.has(nameKey)) continue
    if (domain && existingDomains.has(domain)) continue
    if (seen.has(nameKey)) continue
    seen.add(nameKey)
    if (domain) existingDomains.add(domain)
    newLeads.push(lead)
  }

  console.log(`[scrape-leads] After dedup: ${newLeads.length} new leads`)

  if (newLeads.length === 0) {
    console.log('[scrape-leads] No new leads. Done.')
    return
  }

  // Enrich top leads with emails via Apollo
  // Prioritize: Stellar > high-tier > has-github
  const prioritized = newLeads.sort((a, b) => {
    const aScore = (a.tags.includes('stellar') ? 10 : 0) + (a.tier === 'enterprise' ? 5 : a.tier === 'mid-market' ? 3 : 1) + (a.email ? -100 : 0)
    const bScore = (b.tags.includes('stellar') ? 10 : 0) + (b.tier === 'enterprise' ? 5 : b.tier === 'mid-market' ? 3 : 1) + (b.email ? -100 : 0)
    return bScore - aScore
  })
  await enrichWithApollo(prioritized)

  // Insert
  const result = await prisma.crmLead.createMany({
    data: newLeads.map(l => ({
      companyName: l.companyName,
      website: l.website,
      email: l.email,
      contactName: l.contactName,
      country: l.country,
      source: l.source,
      stage: 'prospect',
      tier: l.tier,
      tags: l.tags,
      leadType: 'customer',
      linkedinUrl: l.linkedinUrl,
    })),
    skipDuplicates: true,
  })

  console.log(`\n[scrape-leads] Inserted ${result.count} new leads. Done.`)
}

main()
  .catch(err => { console.error('[scrape-leads] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
