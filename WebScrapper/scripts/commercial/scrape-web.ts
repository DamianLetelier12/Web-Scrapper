/**
 * Claude-powered web scraper for DobProtocol CRM.
 * Uses Anthropic API with web_search tool to find companies via Google.
 * Works for ALL lead types: customer (Web3), investor, rwa-client.
 *
 * Cron: Weekly Wednesday 10am UTC
 * Usage: npx tsx scripts/commercial/scrape-web.ts [category]
 *
 * Categories: all | rwa | web3 | investors
 * Default: all
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('[scrape-web] ANTHROPIC_API_KEY required. Set it in .env.local')
  process.exit(1)
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

interface ScrapedCompany {
  companyName: string
  website: string | null
  country: string | null
  contactName: string | null
  email: string | null
  industry: string
  description: string
  tags: string[]
}

// ── Search queries by category ───────────────────────────────────

const RWA_SEARCHES = [
  // Mining
  { query: 'mining companies Chile copper lithium 2025 2026', industry: 'mining', tags: ['mining', 'chile'] },
  { query: 'mining companies Peru gold silver copper operations', industry: 'mining', tags: ['mining', 'peru'] },
  { query: 'mining companies Colombia gold emerald operations', industry: 'mining', tags: ['mining', 'colombia'] },
  { query: 'mining companies Brazil iron ore lithium operations', industry: 'mining', tags: ['mining', 'brazil'] },
  { query: 'mining companies Mexico silver copper operations', industry: 'mining', tags: ['mining', 'mexico'] },
  { query: 'mining companies Argentina lithium gold operations', industry: 'mining', tags: ['mining', 'argentina'] },

  // Fleet & Logistics
  { query: 'fleet management companies Latin America logistics trucking', industry: 'fleet', tags: ['fleet', 'logistics'] },
  { query: 'car rental fleet companies Chile Argentina Brazil', industry: 'fleet', tags: ['fleet', 'car-rental'] },
  { query: 'shipping logistics companies LATAM freight operations', industry: 'fleet', tags: ['fleet', 'shipping'] },
  { query: 'trucking transportation companies Colombia Mexico', industry: 'fleet', tags: ['fleet', 'trucking'] },

  // Real Estate
  { query: 'real estate investment companies Chile REIT funds', industry: 'real-estate', tags: ['real-estate', 'chile'] },
  { query: 'real estate development companies Brazil commercial residential', industry: 'real-estate', tags: ['real-estate', 'brazil'] },
  { query: 'real estate tokenization companies Latin America blockchain', industry: 'real-estate', tags: ['real-estate', 'tokenization'] },
  { query: 'FIBRA REIT Mexico real estate investment trust', industry: 'real-estate', tags: ['real-estate', 'mexico', 'reit'] },
  { query: 'proptech real estate companies Colombia Peru', industry: 'real-estate', tags: ['real-estate', 'proptech'] },

  // Machinery & Equipment
  { query: 'heavy equipment leasing companies Latin America construction mining', industry: 'machinery', tags: ['machinery', 'leasing'] },
  { query: 'industrial machinery companies Chile Brazil operations', industry: 'machinery', tags: ['machinery', 'industrial'] },
  { query: 'construction equipment rental companies LATAM', industry: 'machinery', tags: ['machinery', 'construction'] },

  // Agriculture
  { query: 'agribusiness companies Chile wine agriculture export', industry: 'agriculture', tags: ['agriculture', 'chile'] },
  { query: 'farmland agriculture companies Brazil soy cattle', industry: 'agriculture', tags: ['agriculture', 'brazil'] },
  { query: 'agriculture companies Argentina agtech farming operations', industry: 'agriculture', tags: ['agriculture', 'argentina'] },
  { query: 'coffee agriculture companies Colombia export operations', industry: 'agriculture', tags: ['agriculture', 'colombia'] },

  // Energy
  { query: 'renewable energy companies Chile solar wind operations', industry: 'energy', tags: ['energy', 'renewable', 'chile'] },
  { query: 'energy companies Brazil power generation renewable', industry: 'energy', tags: ['energy', 'brazil'] },
  { query: 'solar energy companies Latin America projects operations', industry: 'energy', tags: ['energy', 'solar'] },
  { query: 'oil gas companies Argentina Colombia operations', industry: 'energy', tags: ['energy', 'oil-gas'] },

  // Infrastructure
  { query: 'infrastructure concession companies Chile toll roads', industry: 'infrastructure', tags: ['infrastructure', 'concession'] },
  { query: 'infrastructure companies Brazil concessions airports roads', industry: 'infrastructure', tags: ['infrastructure', 'brazil'] },
  { query: 'port operators Latin America logistics infrastructure', industry: 'infrastructure', tags: ['infrastructure', 'ports'] },
]

const WEB3_SEARCHES = [
  { query: 'DeFi protocols token distribution revenue sharing 2025 2026', industry: 'defi', tags: ['defi', 'distribution'] },
  { query: 'DAO treasury management tools platforms 2025', industry: 'dao', tags: ['dao', 'treasury'] },
  { query: 'Stellar Soroban projects ecosystem new 2025 2026', industry: 'stellar', tags: ['stellar', 'soroban'] },
  { query: 'Web3 payroll crypto payment platforms companies', industry: 'payroll', tags: ['web3', 'payroll'] },
  { query: 'tokenization platforms real world assets RWA blockchain 2025', industry: 'rwa-platform', tags: ['rwa', 'tokenization-platform'] },
  { query: 'airdrop distribution platforms tools Web3 2025', industry: 'distribution', tags: ['web3', 'airdrop', 'distribution'] },
  { query: 'DeFi yield distribution protocols new launch 2025 2026', industry: 'defi', tags: ['defi', 'yield'] },
  { query: 'blockchain infrastructure companies Series A funding 2025', industry: 'infrastructure', tags: ['web3', 'infrastructure'] },
]

const INVESTOR_SEARCHES = [
  { query: 'Web3 crypto VC funds investing DeFi infrastructure 2025 2026', industry: 'vc', tags: ['vc', 'defi'] },
  { query: 'angel investors blockchain infrastructure Latin America', industry: 'angel', tags: ['angel', 'latam'] },
  { query: 'crypto venture capital firms RWA tokenization investments 2025', industry: 'vc', tags: ['vc', 'rwa'] },
  { query: 'Stellar ecosystem investors backers funding', industry: 'vc', tags: ['vc', 'stellar'] },
  { query: 'Latin America fintech Web3 investors venture capital 2025', industry: 'vc', tags: ['vc', 'latam', 'fintech'] },
]

// ── Claude web search ────────────────────────────────────────────

async function searchAndExtract(
  query: string,
  industry: string,
  baseTags: string[],
  leadType: string
): Promise<ScrapedCompany[]> {
  const typeContext = leadType === 'rwa-client'
    ? 'companies that own real-world physical assets (mining operations, vehicle fleets, real estate properties, heavy machinery, farmland, energy installations, infrastructure concessions) that could be tokenized on blockchain'
    : leadType === 'investor'
    ? 'venture capital firms, angel investors, or investment funds active in Web3/crypto/blockchain'
    : 'Web3/DeFi/DAO projects and protocols that could use token distribution infrastructure'

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305' as any, name: 'web_search', max_uses: 5 }],
      messages: [{
        role: 'user',
        content: `Search the web for: "${query}"

I'm looking for ${typeContext}.

After searching, return a JSON array of companies you found. Each object should have:
- companyName: string (official company name)
- website: string or null (company website URL)
- country: string or null (headquarters country)
- contactName: string or null (CEO or key executive name if found)
- email: string or null (contact email if publicly available)
- description: string (1 sentence about what they do and their assets)

RULES:
- Only include REAL companies with verifiable information
- Skip news articles, blog posts, or generic mentions
- Focus on companies with significant physical assets or operations
- Include 5-15 companies per search
- Return ONLY the JSON array, no other text
- If you find fewer than 5, that's fine — quality over quantity`
      }],
    })

    // Extract text from response
    let text = ''
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log(`[scrape-web] No JSON found for query: ${query}`)
      return []
    }

    const companies: ScrapedCompany[] = JSON.parse(jsonMatch[0])
    return companies.map(c => ({
      ...c,
      industry,
      tags: [...baseTags, ...c.tags || []],
    }))
  } catch (err: any) {
    console.error(`[scrape-web] Search failed for "${query}":`, err.message)
    return []
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const category = process.argv[2] || 'all'
  console.log(`[scrape-web] Starting Claude web scraper (category: ${category})...\n`)

  // Select searches based on category
  let searches: { query: string; industry: string; tags: string[]; leadType: string }[] = []

  if (category === 'all' || category === 'rwa') {
    searches.push(...RWA_SEARCHES.map(s => ({ ...s, leadType: 'rwa-client' })))
  }
  if (category === 'all' || category === 'web3') {
    searches.push(...WEB3_SEARCHES.map(s => ({ ...s, leadType: 'customer' })))
  }
  if (category === 'all' || category === 'investors') {
    searches.push(...INVESTOR_SEARCHES.map(s => ({ ...s, leadType: 'investor' })))
  }

  console.log(`[scrape-web] Running ${searches.length} search queries...\n`)

  // Load existing for dedup
  const existing = await prisma.crmLead.findMany({ select: { companyName: true } })
  const existingNames = new Set(existing.map(l => l.companyName.toLowerCase()))

  let totalFound = 0
  let totalInserted = 0
  const allCompanies: (ScrapedCompany & { leadType: string })[] = []

  for (const search of searches) {
    console.log(`[scrape-web] Searching: "${search.query}"`)
    const companies = await searchAndExtract(search.query, search.industry, search.tags, search.leadType)
    console.log(`[scrape-web]   Found: ${companies.length} companies`)

    for (const c of companies) {
      allCompanies.push({ ...c, leadType: search.leadType })
    }
    totalFound += companies.length

    // Rate limit between searches
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`\n[scrape-web] Total found: ${totalFound}`)

  // Deduplicate
  const seen = new Set<string>()

  for (const company of allCompanies) {
    const key = company.companyName.toLowerCase().trim()
    if (existingNames.has(key) || seen.has(key)) continue
    seen.add(key)

    try {
      const tierMap: Record<string, string> = {
        'rwa-client': 'growth',
        'customer': 'growth',
        'investor': 'mid-market',
      }

      await prisma.crmLead.create({
        data: {
          companyName: company.companyName,
          website: company.website,
          email: company.email,
          contactName: company.contactName,
          country: company.country,
          source: 'claude-web',
          stage: 'prospect',
          tier: tierMap[company.leadType] || 'growth',
          leadType: company.leadType,
          tags: [...new Set(['claude-web', ...company.tags])],
          notes: company.description,
          investorFocus: company.leadType === 'investor' ? company.industry : company.leadType === 'rwa-client' ? `${company.industry}: ${company.description}` : null,
        },
      })
      totalInserted++
    } catch (err: any) {
      if (!err.message?.includes('Unique constraint')) {
        console.error(`[scrape-web] Insert failed for ${company.companyName}:`, err.message)
      }
    }
  }

  console.log(`[scrape-web] Inserted: ${totalInserted} new leads`)
  console.log(`[scrape-web] Done.\n`)
}

main()
  .catch(err => { console.error('[scrape-web] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
