/**
 * Investor Outreach for DobProtocol CRM.
 * Cron: Daily 3pm UTC (max 10/day)
 *
 * Usage: npx tsx scripts/commercial/investor-outreach.ts
 */

import { prisma } from './db'
import { aiGenerate } from './ai-helper'
import { PITCH_CONTEXT } from './pitch-context'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = process.env.CRM_FROM_EMAIL_PERSONAL || 'Oscar from DobProtocol <oscar@dobprotocol.com>'
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

async function main() {
  console.log('[investor-outreach] Starting...')

  if (!RESEND_API_KEY) { console.log('[investor-outreach] No RESEND_API_KEY. Skipping.'); return }

  const investors = await prisma.crmLead.findMany({
    where: { leadType: 'investor', stage: 'prospect', email: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  if (investors.length === 0) { console.log('[investor-outreach] No investors to contact.'); return }
  console.log(`[investor-outreach] Found ${investors.length} investor(s)`)

  let sent = 0

  for (const inv of investors) {
    const firstName = (inv.contactName || '').split(' ')[0] || 'there'

    try {
      const emailHtml = await aiGenerate(
        `Write a personalized investor pitch email from Oscar (founder of DobProtocol) to ${inv.contactName} at ${inv.companyName}.
INVESTOR FOCUS: ${inv.investorFocus || 'Web3/blockchain'}
${PITCH_CONTEXT}
RULES: Address by first name (${firstName}). Reference their focus. 150-250 words. Return ONLY clean HTML.`
      )

      const subject = `DobProtocol — On-chain distribution infrastructure`
      const result = await sendEmail(inv.email!, subject, emailHtml)
      console.log(`[investor-outreach] Sent to ${inv.contactName} (${inv.companyName})`)

      await prisma.crmActivity.create({
        data: { leadId: inv.id, type: 'investor_pitch', subject, content: emailHtml, metadata: { resend_id: result.id, automated: true } },
      })

      const nextFollowup = new Date()
      nextFollowup.setDate(nextFollowup.getDate() + 5)

      await prisma.crmLead.update({
        where: { id: inv.id },
        data: { lastContactedAt: new Date(), nextFollowupAt: nextFollowup, stage: 'pitch_sent' },
      })
      sent++
    } catch (err) {
      console.error(`[investor-outreach] Failed for ${inv.contactName}:`, err)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  console.log(`[investor-outreach] Done. Sent: ${sent}/${investors.length}`)
}

main()
  .catch((err) => { console.error('[investor-outreach] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
