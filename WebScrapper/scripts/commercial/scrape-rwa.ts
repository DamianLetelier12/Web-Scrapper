/**
 * RWA Client Scraper for Dob Capital.
 * Finds companies with tokenizable real-world assets:
 * mining, fleets, real estate, machinery, agriculture, energy.
 *
 * Sources: Apollo.io (company search by industry), curated list
 * Cron: Weekly Tuesday 9am UTC
 *
 * Usage: npx tsx scripts/commercial/scrape-rwa.ts
 */

import { prisma } from './db'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || ''

interface RwaLead {
  companyName: string
  contactName: string | null
  email: string | null
  website: string | null
  country: string | null
  industry: string
  assetType: string
  source: string
  tags: string[]
  linkedinUrl: string | null
  notes: string | null
}

// ── Source 1: Curated LATAM & global companies ───────────────────

function getCuratedCompanies(): RwaLead[] {
  return [
    // Mining - LATAM
    { companyName: 'Codelco', contactName: null, email: null, website: 'https://codelco.com', country: 'Chile', industry: 'mining', assetType: 'copper-mining', source: 'curated', tags: ['mining', 'copper', 'state-owned', 'large-cap'], linkedinUrl: null, notes: 'Largest copper producer globally' },
    { companyName: 'SQM', contactName: null, email: null, website: 'https://sqm.com', country: 'Chile', industry: 'mining', assetType: 'lithium-mining', source: 'curated', tags: ['mining', 'lithium', 'publicly-traded'], linkedinUrl: null, notes: 'Major lithium producer' },
    { companyName: 'Antofagasta Minerals', contactName: null, email: null, website: 'https://antofagasta.co.uk', country: 'Chile', industry: 'mining', assetType: 'copper-mining', source: 'curated', tags: ['mining', 'copper', 'publicly-traded'], linkedinUrl: null, notes: 'Chilean copper mining group' },
    { companyName: 'Pan American Silver', contactName: null, email: null, website: 'https://panamericansilver.com', country: 'Chile', industry: 'mining', assetType: 'silver-mining', source: 'curated', tags: ['mining', 'silver', 'gold', 'publicly-traded'], linkedinUrl: null, notes: 'Silver/gold mines across Americas' },
    { companyName: 'Minera Escondida (BHP)', contactName: null, email: null, website: 'https://bhp.com', country: 'Chile', industry: 'mining', assetType: 'copper-mining', source: 'curated', tags: ['mining', 'copper', 'large-cap'], linkedinUrl: null, notes: 'Largest copper mine in the world' },
    { companyName: 'Goldcorp / Newmont', contactName: null, email: null, website: 'https://newmont.com', country: 'United States', industry: 'mining', assetType: 'gold-mining', source: 'curated', tags: ['mining', 'gold', 'large-cap'], linkedinUrl: null, notes: 'Largest gold mining corporation' },
    { companyName: 'Vale', contactName: null, email: null, website: 'https://vale.com', country: 'Brazil', industry: 'mining', assetType: 'iron-mining', source: 'curated', tags: ['mining', 'iron', 'nickel', 'large-cap'], linkedinUrl: null, notes: 'Largest iron ore producer' },
    { companyName: 'Grupo México', contactName: null, email: null, website: 'https://gmexico.com', country: 'Mexico', industry: 'mining', assetType: 'copper-mining', source: 'curated', tags: ['mining', 'copper', 'infrastructure'], linkedinUrl: null, notes: 'Mining + infrastructure conglomerate' },

    // Fleet & Logistics - LATAM
    { companyName: 'LATAM Cargo', contactName: null, email: null, website: 'https://latamcargo.com', country: 'Chile', industry: 'fleet', assetType: 'air-fleet', source: 'curated', tags: ['fleet', 'aviation', 'cargo', 'large-cap'], linkedinUrl: null, notes: 'Largest cargo airline in LATAM' },
    { companyName: 'Localiza', contactName: null, email: null, website: 'https://localiza.com', country: 'Brazil', industry: 'fleet', assetType: 'vehicle-fleet', source: 'curated', tags: ['fleet', 'car-rental', 'publicly-traded'], linkedinUrl: null, notes: 'Largest car rental in LATAM' },
    { companyName: 'Movida', contactName: null, email: null, website: 'https://movida.com.br', country: 'Brazil', industry: 'fleet', assetType: 'vehicle-fleet', source: 'curated', tags: ['fleet', 'car-rental', 'fleet-management'], linkedinUrl: null, notes: 'Fleet management + car rental' },
    { companyName: 'Rutas de Lima', contactName: null, email: null, website: 'https://rutasdelima.com', country: 'Peru', industry: 'fleet', assetType: 'toll-infrastructure', source: 'curated', tags: ['fleet', 'infrastructure', 'concession'], linkedinUrl: null, notes: 'Road concession - tokenizable toll revenue' },
    { companyName: 'Vamos Locação', contactName: null, email: null, website: 'https://vamoslocacao.com.br', country: 'Brazil', industry: 'fleet', assetType: 'heavy-fleet', source: 'curated', tags: ['fleet', 'trucks', 'machinery-rental'], linkedinUrl: null, notes: 'Heavy machinery & truck leasing' },

    // Real Estate - LATAM
    { companyName: 'Cencosud', contactName: null, email: null, website: 'https://cencosud.com', country: 'Chile', industry: 'real-estate', assetType: 'commercial-real-estate', source: 'curated', tags: ['real-estate', 'retail', 'shopping-centers', 'large-cap'], linkedinUrl: null, notes: 'Shopping centers across LATAM' },
    { companyName: 'Parque Arauco', contactName: null, email: null, website: 'https://parauco.com', country: 'Chile', industry: 'real-estate', assetType: 'commercial-real-estate', source: 'curated', tags: ['real-estate', 'shopping-centers', 'publicly-traded'], linkedinUrl: null, notes: 'REIT - shopping centers Chile/Peru/Colombia' },
    { companyName: 'IDB Inmobiliaria', contactName: null, email: null, website: 'https://idb.cl', country: 'Chile', industry: 'real-estate', assetType: 'residential-development', source: 'curated', tags: ['real-estate', 'residential', 'development'], linkedinUrl: null, notes: 'Real estate development Chile' },
    { companyName: 'Cyrela', contactName: null, email: null, website: 'https://cyrela.com.br', country: 'Brazil', industry: 'real-estate', assetType: 'residential-development', source: 'curated', tags: ['real-estate', 'residential', 'publicly-traded'], linkedinUrl: null, notes: 'Largest residential developer Brazil' },
    { companyName: 'Fibra Uno', contactName: null, email: null, website: 'https://fibrauno.mx', country: 'Mexico', industry: 'real-estate', assetType: 'reit', source: 'curated', tags: ['real-estate', 'reit', 'commercial', 'industrial'], linkedinUrl: null, notes: 'Largest REIT in Mexico' },

    // Machinery & Equipment
    { companyName: 'Finning International', contactName: null, email: null, website: 'https://finning.com', country: 'Chile', industry: 'machinery', assetType: 'heavy-machinery', source: 'curated', tags: ['machinery', 'caterpillar', 'mining-equipment'], linkedinUrl: null, notes: 'Caterpillar dealer - mines equipment leasing' },
    { companyName: 'Sigdo Koppers', contactName: null, email: null, website: 'https://sigdokoppers.cl', country: 'Chile', industry: 'machinery', assetType: 'industrial-equipment', source: 'curated', tags: ['machinery', 'industrial', 'engineering'], linkedinUrl: null, notes: 'Industrial conglomerate - heavy machinery' },
    { companyName: 'Komatsu LATAM', contactName: null, email: null, website: 'https://komatsu.com', country: 'Chile', industry: 'machinery', assetType: 'mining-machinery', source: 'curated', tags: ['machinery', 'mining-equipment', 'heavy'], linkedinUrl: null, notes: 'Mining & construction machinery' },
    { companyName: 'Randon', contactName: null, email: null, website: 'https://randon.com.br', country: 'Brazil', industry: 'machinery', assetType: 'trailers-equipment', source: 'curated', tags: ['machinery', 'trailers', 'auto-parts', 'publicly-traded'], linkedinUrl: null, notes: 'Trailer & auto parts manufacturer' },

    // Agriculture
    { companyName: 'Agrosuper', contactName: null, email: null, website: 'https://agrosuper.cl', country: 'Chile', industry: 'agriculture', assetType: 'agribusiness', source: 'curated', tags: ['agriculture', 'food', 'livestock'], linkedinUrl: null, notes: 'Largest food company in Chile' },
    { companyName: 'SLC Agrícola', contactName: null, email: null, website: 'https://slcagricola.com.br', country: 'Brazil', industry: 'agriculture', assetType: 'farmland', source: 'curated', tags: ['agriculture', 'soy', 'cotton', 'farmland', 'publicly-traded'], linkedinUrl: null, notes: 'Largest farmland company Brazil - tokenizable land' },
    { companyName: 'Viña Concha y Toro', contactName: null, email: null, website: 'https://conchaytoro.com', country: 'Chile', industry: 'agriculture', assetType: 'vineyards', source: 'curated', tags: ['agriculture', 'wine', 'vineyards', 'publicly-traded'], linkedinUrl: null, notes: 'Largest wine producer LATAM' },
    { companyName: 'Cresud', contactName: null, email: null, website: 'https://cresud.com.ar', country: 'Argentina', industry: 'agriculture', assetType: 'farmland', source: 'curated', tags: ['agriculture', 'farmland', 'livestock', 'publicly-traded'], linkedinUrl: null, notes: 'Agricultural land owner Argentina' },

    // Energy
    { companyName: 'Enel Chile', contactName: null, email: null, website: 'https://enel.cl', country: 'Chile', industry: 'energy', assetType: 'power-generation', source: 'curated', tags: ['energy', 'renewable', 'solar', 'wind'], linkedinUrl: null, notes: 'Renewable energy - tokenizable power purchase agreements' },
    { companyName: 'Atlas Renewable Energy', contactName: null, email: null, website: 'https://atlasrenewableenergy.com', country: 'Chile', industry: 'energy', assetType: 'solar-farms', source: 'curated', tags: ['energy', 'solar', 'renewable', 'latam'], linkedinUrl: null, notes: 'Solar farms across LATAM' },
    { companyName: 'Colbún', contactName: null, email: null, website: 'https://colbun.cl', country: 'Chile', industry: 'energy', assetType: 'power-generation', source: 'curated', tags: ['energy', 'hydro', 'solar', 'publicly-traded'], linkedinUrl: null, notes: 'Hydro + solar power generation' },
    { companyName: 'YPF', contactName: null, email: null, website: 'https://ypf.com', country: 'Argentina', industry: 'energy', assetType: 'oil-gas', source: 'curated', tags: ['energy', 'oil', 'gas', 'state-owned'], linkedinUrl: null, notes: 'State oil company Argentina' },

    // Infrastructure
    { companyName: 'Autopista Central', contactName: null, email: null, website: 'https://autopistacentral.cl', country: 'Chile', industry: 'infrastructure', assetType: 'toll-roads', source: 'curated', tags: ['infrastructure', 'toll-road', 'concession'], linkedinUrl: null, notes: 'Toll road concession - tokenizable revenue stream' },
    { companyName: 'Sacyr Concesiones', contactName: null, email: null, website: 'https://sacyr.com', country: 'Chile', industry: 'infrastructure', assetType: 'concessions', source: 'curated', tags: ['infrastructure', 'concession', 'roads', 'hospitals'], linkedinUrl: null, notes: 'Infrastructure concessions LATAM' },
    { companyName: 'CCR', contactName: null, email: null, website: 'https://ccr.com.br', country: 'Brazil', industry: 'infrastructure', assetType: 'toll-roads', source: 'curated', tags: ['infrastructure', 'toll-road', 'airports', 'publicly-traded'], linkedinUrl: null, notes: 'Infrastructure concessionaire Brazil' },
  ]
}

// ── Source 2: Apollo.io industry search ──────────────────────────

async function scrapeApollo(): Promise<RwaLead[]> {
  if (!APOLLO_API_KEY) {
    console.log('[scrape-rwa] No APOLLO_API_KEY, skipping Apollo search')
    return []
  }

  const leads: RwaLead[] = []

  const searches = [
    { industry: 'mining', keywords: ['mining', 'minerals', 'extraction'], assetType: 'mining-assets', countries: ['Chile', 'Peru', 'Brazil', 'Mexico', 'Colombia', 'Argentina'] },
    { industry: 'fleet', keywords: ['fleet management', 'logistics', 'trucking', 'car rental'], assetType: 'vehicle-fleet', countries: ['Chile', 'Brazil', 'Mexico', 'Colombia', 'Argentina'] },
    { industry: 'real-estate', keywords: ['real estate investment', 'property management', 'REIT'], assetType: 'real-estate', countries: ['Chile', 'Brazil', 'Mexico', 'Colombia'] },
    { industry: 'machinery', keywords: ['heavy equipment', 'machinery rental', 'construction equipment'], assetType: 'heavy-machinery', countries: ['Chile', 'Brazil', 'Mexico'] },
    { industry: 'agriculture', keywords: ['agribusiness', 'farming', 'agricultural'], assetType: 'farmland', countries: ['Chile', 'Brazil', 'Argentina', 'Colombia'] },
    { industry: 'energy', keywords: ['renewable energy', 'solar energy', 'power generation'], assetType: 'energy-assets', countries: ['Chile', 'Brazil', 'Mexico', 'Colombia'] },
  ]

  for (const search of searches) {
    try {
      console.log(`[scrape-rwa] Apollo: searching ${search.industry} in ${search.countries.join(', ')}...`)

      const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
        body: JSON.stringify({
          q_keywords: search.keywords.join(' OR '),
          organization_locations: search.countries,
          organization_num_employees_ranges: ['51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+'],
          per_page: 25,
        }),
      })

      if (!res.ok) {
        console.log(`[scrape-rwa] Apollo ${search.industry}: ${res.status}`)
        continue
      }

      const data = await res.json()
      const orgs = data.organizations || []

      for (const org of orgs) {
        leads.push({
          companyName: org.name,
          contactName: null,
          email: null,
          website: org.primary_domain ? `https://${org.primary_domain}` : org.website_url || null,
          country: org.country || null,
          industry: search.industry,
          assetType: search.assetType,
          source: 'apollo',
          tags: [search.industry, 'dob-capital', 'apollo', search.assetType],
          linkedinUrl: org.linkedin_url || null,
          notes: org.short_description || null,
        })
      }

      await new Promise(r => setTimeout(r, 1500))
    } catch (err) {
      console.error(`[scrape-rwa] Apollo ${search.industry} failed:`, err)
    }
  }

  console.log(`[scrape-rwa] Apollo: ${leads.length} companies found`)

  // Enrich top results with contacts
  let enriched = 0
  for (const lead of leads.slice(0, 30)) {
    try {
      const domain = lead.website?.replace('https://', '').replace('http://', '').split('/')[0]
      if (!domain) continue

      const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
        body: JSON.stringify({
          q_organization_domains: domain,
          person_titles: ['CEO', 'CFO', 'CTO', 'COO', 'Director of Finance', 'Head of Innovation', 'VP Operations'],
          per_page: 1,
        }),
      })

      if (!res.ok) continue
      const data = await res.json()
      const person = data.people?.[0]

      if (person) {
        lead.contactName = [person.first_name, person.last_name].filter(Boolean).join(' ')
        lead.email = person.email || null
        if (person.linkedin_url) lead.linkedinUrl = person.linkedin_url
        if (lead.email) enriched++
      }

      await new Promise(r => setTimeout(r, 500))
    } catch { }
  }

  console.log(`[scrape-rwa] Apollo: enriched ${enriched} with contact emails`)
  return leads
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('[scrape-rwa] Starting Dob Capital RWA client scraping...\n')

  const existing = await prisma.crmLead.findMany({
    where: { leadType: 'rwa-client' },
    select: { companyName: true, website: true },
  })
  const existingNames = new Set(existing.map(l => l.companyName.toLowerCase()))

  // Collect from all sources
  const curated = getCuratedCompanies()
  const apolloLeads = await scrapeApollo()
  const allLeads = [...curated, ...apolloLeads]

  console.log(`\n[scrape-rwa] Total collected: ${allLeads.length}`)

  // Deduplicate
  const seen = new Set<string>()
  const newLeads: RwaLead[] = []

  for (const lead of allLeads) {
    const key = lead.companyName.toLowerCase()
    if (existingNames.has(key) || seen.has(key)) continue
    seen.add(key)
    newLeads.push(lead)
  }

  console.log(`[scrape-rwa] After dedup: ${newLeads.length} new leads`)

  if (newLeads.length === 0) {
    console.log('[scrape-rwa] No new leads. Done.')
    return
  }

  // Insert
  let inserted = 0
  for (const lead of newLeads) {
    try {
      await prisma.crmLead.create({
        data: {
          companyName: lead.companyName,
          contactName: lead.contactName,
          email: lead.email,
          website: lead.website,
          country: lead.country,
          source: lead.source,
          stage: 'prospect',
          tier: lead.tags.includes('large-cap') ? 'enterprise' : lead.tags.includes('publicly-traded') ? 'mid-market' : 'growth',
          leadType: 'rwa-client',
          tags: [...lead.tags, 'rwa'],
          linkedinUrl: lead.linkedinUrl,
          notes: lead.notes,
          investorFocus: `${lead.industry}: ${lead.assetType}`,
        },
      })
      inserted++
      console.log(`[scrape-rwa] Added: ${lead.companyName} (${lead.industry}, ${lead.country})`)
    } catch (err: any) {
      if (!err.message?.includes('Unique constraint')) {
        console.error(`[scrape-rwa] Failed for ${lead.companyName}:`, err.message)
      }
    }
  }

  console.log(`\n[scrape-rwa] Done. Inserted: ${inserted}`)
}

main()
  .catch(err => { console.error('[scrape-rwa] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
