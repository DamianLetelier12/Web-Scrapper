/**
 * Professional fund, grant & accelerator scraping for DobProtocol CRM.
 * Expanded curated list + periodic checking.
 * Cron: Monthly 1st at 10am UTC
 *
 * Usage: npx tsx scripts/commercial/scrape-funds.ts
 */

import { prisma } from './db'

interface FundEntry {
  name: string
  type: 'grant' | 'accelerator' | 'vc' | 'ecosystem'
  website: string
  focusAreas: string[]
  checkSize: string
  country: string
  notes?: string
}

const FUNDS: FundEntry[] = [
  // ── Stellar Ecosystem (highest priority) ───────────────────
  { name: 'Stellar Community Fund (SCF)', type: 'grant', website: 'https://communityfund.stellar.org', focusAreas: ['stellar', 'soroban', 'defi'], checkSize: '$5K-$150K', country: 'Global', notes: 'SCF 7.0 - Build + Marketing grants' },
  { name: 'SDF Grants', type: 'grant', website: 'https://stellar.org/foundation/grants', focusAreas: ['stellar', 'infrastructure', 'payments'], checkSize: 'Varies', country: 'Global' },
  { name: 'SDF Enterprise Fund', type: 'ecosystem', website: 'https://stellar.org/foundation', focusAreas: ['stellar', 'enterprise', 'cross-border'], checkSize: '$100K-$500K', country: 'Global' },

  // ── EVM L2 Grants (deployed chains) ────────────────────────
  { name: 'Arbitrum Foundation Grants', type: 'grant', website: 'https://arbitrum.foundation/grants', focusAreas: ['arbitrum', 'defi', 'tooling'], checkSize: '$50K-$500K', country: 'Global' },
  { name: 'Arbitrum LTIPP', type: 'grant', website: 'https://forum.arbitrum.foundation', focusAreas: ['arbitrum', 'defi', 'liquidity'], checkSize: '$50K-$2M', country: 'Global', notes: 'Long-term incentive pilot program' },
  { name: 'Base Ecosystem Fund', type: 'ecosystem', website: 'https://base.org/ecosystem', focusAreas: ['base', 'defi', 'infrastructure'], checkSize: 'Varies', country: 'United States' },
  { name: 'Base Builder Grants', type: 'grant', website: 'https://base.org/grants', focusAreas: ['base', 'defi', 'consumer'], checkSize: '$10K-$100K', country: 'Global' },
  { name: 'Lisk Grants Program', type: 'grant', website: 'https://lisk.com/grants', focusAreas: ['lisk', 'defi', 'rwa'], checkSize: '$10K-$250K', country: 'Global' },
  { name: 'Optimism RPGF', type: 'grant', website: 'https://optimism.io/retropgf', focusAreas: ['optimism', 'public-goods', 'infrastructure'], checkSize: '$5K-$500K', country: 'Global', notes: 'Retroactive public goods funding' },
  { name: 'Polygon Community Grants', type: 'grant', website: 'https://polygon.technology/community-grants', focusAreas: ['polygon', 'defi', 'gaming'], checkSize: '$10K-$100K', country: 'Global' },

  // ── Major Ethereum Grants ──────────────────────────────────
  { name: 'Ethereum Foundation Grants', type: 'grant', website: 'https://ethereum.org/en/community/grants', focusAreas: ['ethereum', 'infrastructure', 'public-goods'], checkSize: '$10K-$500K', country: 'Global' },
  { name: 'Uniswap Foundation Grants', type: 'grant', website: 'https://uniswapfoundation.org', focusAreas: ['defi', 'amm', 'governance'], checkSize: '$50K-$300K', country: 'Global' },
  { name: 'Aave Grants DAO', type: 'grant', website: 'https://aavegrants.org', focusAreas: ['defi', 'lending', 'governance'], checkSize: '$10K-$100K', country: 'Global' },
  { name: 'Compound Grants', type: 'grant', website: 'https://compoundgrants.org', focusAreas: ['defi', 'lending', 'tooling'], checkSize: '$10K-$150K', country: 'Global' },
  { name: 'Gitcoin Grants', type: 'grant', website: 'https://grants.gitcoin.co', focusAreas: ['public-goods', 'web3', 'open-source'], checkSize: 'Community-funded', country: 'Global' },
  { name: 'MolochDAO Grants', type: 'grant', website: 'https://molochdao.com', focusAreas: ['ethereum', 'public-goods', 'dao'], checkSize: '$10K-$50K', country: 'Global' },

  // ── Web3 Accelerators ──────────────────────────────────────
  { name: 'Alliance DAO', type: 'accelerator', website: 'https://alliance.xyz', focusAreas: ['web3', 'crypto', 'defi'], checkSize: '$250K', country: 'United States' },
  { name: 'Outlier Ventures', type: 'accelerator', website: 'https://outlierventures.io', focusAreas: ['web3', 'defi', 'dao', 'RWA'], checkSize: '$100K-$200K', country: 'United Kingdom' },
  { name: 'Encode Club Accelerator', type: 'accelerator', website: 'https://encode.club', focusAreas: ['web3', 'defi', 'education'], checkSize: '$100K-$200K', country: 'United Kingdom' },
  { name: 'Consensys Mesh', type: 'accelerator', website: 'https://mesh.xyz', focusAreas: ['ethereum', 'infrastructure', 'defi'], checkSize: '$100K-$500K', country: 'United States' },
  { name: 'Binance Labs', type: 'accelerator', website: 'https://labs.binance.com', focusAreas: ['defi', 'infrastructure', 'web3'], checkSize: '$500K', country: 'Global' },
  { name: 'Coinbase Ventures', type: 'vc', website: 'https://ventures.coinbase.com', focusAreas: ['crypto', 'defi', 'infrastructure', 'payments'], checkSize: '$250K-$5M', country: 'United States' },

  // ── LATAM-focused ──────────────────────────────────────────
  { name: 'Start-Up Chile', type: 'accelerator', website: 'https://startupchile.org', focusAreas: ['tech', 'latam', 'global-expansion'], checkSize: '$20K-$80K', country: 'Chile' },
  { name: 'Kaszek Ventures', type: 'vc', website: 'https://kaszek.com', focusAreas: ['latam', 'fintech', 'web3'], checkSize: '$500K-$5M', country: 'Argentina' },
  { name: 'NXTP Ventures', type: 'vc', website: 'https://nxtpventures.com', focusAreas: ['latam', 'fintech', 'tech'], checkSize: '$250K-$2M', country: 'Argentina' },
  { name: 'Platanus Ventures', type: 'vc', website: 'https://platanus.vc', focusAreas: ['latam', 'tech', 'seed'], checkSize: '$100K-$500K', country: 'Chile' },
  { name: 'Magma Partners', type: 'vc', website: 'https://magmapartners.com', focusAreas: ['latam', 'fintech', 'blockchain'], checkSize: '$100K-$1M', country: 'Chile' },

  // ── DeFi Infrastructure VCs ────────────────────────────────
  { name: 'Dragonfly', type: 'vc', website: 'https://dragonfly.xyz', focusAreas: ['defi', 'infrastructure', 'web3'], checkSize: '$1M-$10M', country: 'United States' },
  { name: 'Variant Fund', type: 'vc', website: 'https://variant.fund', focusAreas: ['dao', 'defi', 'token-distribution', 'ownership'], checkSize: '$1M-$5M', country: 'United States' },
  { name: 'Polychain Capital', type: 'vc', website: 'https://polychain.capital', focusAreas: ['crypto', 'defi', 'infrastructure'], checkSize: '$1M-$20M', country: 'United States' },
  { name: 'Placeholder VC', type: 'vc', website: 'https://placeholder.vc', focusAreas: ['crypto', 'governance', 'infrastructure'], checkSize: '$1M-$10M', country: 'United States' },
  { name: 'Multicoin Capital', type: 'vc', website: 'https://multicoin.capital', focusAreas: ['crypto', 'defi', 'cross-chain'], checkSize: '$1M-$25M', country: 'United States' },
  { name: 'Paradigm', type: 'vc', website: 'https://paradigm.xyz', focusAreas: ['crypto', 'defi', 'infrastructure'], checkSize: '$5M-$100M', country: 'United States' },
  { name: 'a16z crypto', type: 'vc', website: 'https://a16zcrypto.com', focusAreas: ['crypto', 'defi', 'infrastructure', 'web3'], checkSize: '$5M-$100M', country: 'United States' },

  // ── Cloud & Dev Grants ─────────────────────────────────────
  { name: 'Google Cloud Web3 Program', type: 'grant', website: 'https://cloud.google.com/web3', focusAreas: ['infrastructure', 'cloud', 'web3'], checkSize: 'Cloud credits', country: 'Global', notes: 'Up to $100K in cloud credits' },
  { name: 'AWS Activate', type: 'grant', website: 'https://aws.amazon.com/activate', focusAreas: ['infrastructure', 'cloud', 'startup'], checkSize: 'Up to $100K credits', country: 'Global' },

  // ── RWA & Distribution specific ────────────────────────────
  { name: 'Centrifuge Grants', type: 'grant', website: 'https://centrifuge.io', focusAreas: ['rwa', 'defi', 'credit'], checkSize: '$10K-$100K', country: 'Global' },
  { name: 'Ondo Finance Ecosystem', type: 'ecosystem', website: 'https://ondo.finance', focusAreas: ['rwa', 'tokenization', 'yield'], checkSize: 'Varies', country: 'United States' },
]

async function main() {
  console.log('[scrape-funds] Starting fund & grant scraping...\n')

  const existing = await prisma.crmFund.findMany({ select: { name: true } })
  const existingNames = new Set(existing.map(f => f.name.toLowerCase()))

  let inserted = 0, skipped = 0

  for (const fund of FUNDS) {
    if (existingNames.has(fund.name.toLowerCase())) { skipped++; continue }

    await prisma.crmFund.create({
      data: {
        name: fund.name,
        type: fund.type,
        website: fund.website,
        status: 'discovered',
        focusAreas: fund.focusAreas,
        checkSize: fund.checkSize,
        country: fund.country,
        notes: fund.notes || null,
      },
    })
    inserted++
    console.log(`[scrape-funds] Added: ${fund.name} (${fund.type}) - ${fund.checkSize}`)
  }

  console.log(`\n[scrape-funds] Done. Inserted: ${inserted}, Skipped (existing): ${skipped}`)
  console.log(`[scrape-funds] Total funds tracked: ${existing.length + inserted}`)
}

main()
  .catch(err => { console.error('[scrape-funds] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
