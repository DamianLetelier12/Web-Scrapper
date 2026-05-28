/**
 * RWA Client Outreach for Dob Capital.
 * Sends personalized emails to companies with tokenizable assets.
 * Cron: Daily 4pm UTC (max 5/day to start)
 *
 * Usage: npx tsx scripts/commercial/rwa-outreach.ts
 */

import { prisma } from './db'
import { aiGenerate } from './ai-helper'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = process.env.CRM_FROM_EMAIL_PERSONAL || 'Oscar from Dob Capital <oscar@dobprotocol.com>'
const REPLY_TO = process.env.CRM_REPLY_TO || 'oscar@dobprotocol.com'

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, reply_to: REPLY_TO, bcc: ['oscar@dobprotocol.com', 'simon@dobprotocol.com'] }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Resend error: ${data.message || JSON.stringify(data)}`)
  return data
}

const DOB_CAPITAL_CONTEXT = `
Dob Capital is a Web3 company that helps businesses tokenize their real-world assets on blockchain.

VALUE PROPOSITION:
- Convert physical assets (mining rights, vehicles, real estate, machinery, energy contracts) into digital tokens
- Fractional ownership: allow investors to buy shares of high-value assets
- Transparent on-chain distribution of revenue/yields to token holders
- Automated compliance and reporting via smart contracts
- Built on Stellar + EVM chains for low fees and high throughput

BENEFITS FOR ASSET OWNERS:
- Access global capital markets without traditional IPO costs
- Unlock liquidity from illiquid assets
- Automated revenue distribution to investors (no manual accounting)
- 24/7 secondary market for tokenized shares
- Reduced administrative overhead

TRACTION:
- Live infrastructure on Stellar mainnet + Arbitrum + Base + Lisk
- Lazy-pull distribution model supporting 10,000+ token holders
- TRUFA device validation for trust scoring
- Backed by DobProtocol's proven distribution technology
`

async function main() {
  console.log('[rwa-outreach] Starting Dob Capital outreach...')

  if (!RESEND_API_KEY) { console.log('[rwa-outreach] No RESEND_API_KEY. Skipping.'); return }

  const clients = await prisma.crmLead.findMany({
    where: {
      leadType: 'rwa-client',
      stage: { in: ['prospect', 'contacted'] },
      email: { not: null },
      nextFollowupAt: { lte: new Date() },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
  })

  if (clients.length === 0) { console.log('[rwa-outreach] No RWA clients due for outreach.'); return }
  console.log(`[rwa-outreach] Found ${clients.length} client(s)`)

  let sent = 0

  for (const client of clients) {
    const firstName = (client.contactName || '').split(' ')[0] || 'there'
    const industry = client.tags.find(t => ['mining', 'fleet', 'real-estate', 'machinery', 'agriculture', 'energy', 'infrastructure'].includes(t)) || 'assets'
    const assetInfo = client.investorFocus || industry

    try {
      const emailHtml = await aiGenerate(
        `Write a professional business email from Oscar (Dob Capital) to ${client.contactName || 'the team'} at ${client.companyName}.
INDUSTRY: ${industry}. ASSET TYPE: ${assetInfo}. COUNTRY: ${client.country || 'LATAM'}.
${DOB_CAPITAL_CONTEXT}
RULES:
- Address by first name (${firstName}). Reference their specific industry and assets.
- Explain how tokenization could benefit THEIR specific business (not generic).
- Keep it 150-250 words. Professional but warm tone.
- Mention ONE concrete example relevant to their industry.
- Return ONLY clean HTML body (no subject line).`
      )

      const subject = `${client.companyName} — Unlocking liquidity through asset tokenization`
      const result = await sendEmail(client.email!, subject, emailHtml)
      console.log(`[rwa-outreach] Sent to ${client.contactName || client.companyName} (${client.companyName})`)

      await prisma.crmActivity.create({
        data: {
          leadId: client.id,
          type: 'rwa_outreach',
          subject,
          content: emailHtml,
          metadata: { resend_id: result.id, automated: true, industry },
        },
      })

      const nextFollowup = new Date()
      nextFollowup.setDate(nextFollowup.getDate() + 5)

      await prisma.crmLead.update({
        where: { id: client.id },
        data: {
          lastContactedAt: new Date(),
          nextFollowupAt: nextFollowup,
          stage: client.stage === 'prospect' ? 'contacted' : client.stage,
        },
      })
      sent++
    } catch (err) {
      console.error(`[rwa-outreach] Failed for ${client.companyName}:`, err)
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`[rwa-outreach] Done. Sent: ${sent}/${clients.length}`)
}

main()
  .catch(err => { console.error('[rwa-outreach] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
