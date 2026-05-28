/**
 * Fund Application Draft Generator for DobProtocol CRM.
 * Cron: Weekly Wednesday 9am UTC
 *
 * Usage: npx tsx scripts/commercial/apply-funds.ts
 */

import { prisma } from './db'
import { aiGenerate } from './ai-helper'
import { PITCH_CONTEXT } from './pitch-context'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const NOTIFY_EMAIL = process.env.CRM_REPLY_TO || 'oscar@dobprotocol.com'

async function main() {
  console.log('[apply-funds] Generating application drafts...')

  const funds = await prisma.crmFund.findMany({
    where: { status: { in: ['discovered', 'researching'] }, applicationDraft: null },
    orderBy: { deadline: 'asc' },
  })

  if (funds.length === 0) { console.log('[apply-funds] No funds need drafts.'); return }
  console.log(`[apply-funds] Generating drafts for ${funds.length} fund(s)`)

  const drafts: string[] = []

  for (const fund of funds) {
    try {
      const draft = await aiGenerate(
        `Write a compelling application for "${fund.name}" (${fund.type}).
FUND: Focus: ${(fund.focusAreas || []).join(', ')}. Check size: ${fund.checkSize || 'Unknown'}. Country: ${fund.country || 'Global'}.
${PITCH_CONTEXT}
RULES: 400-600 words. Tailor to their focus. Include traction metrics. Professional tone. Plain text.`
      )

      await prisma.crmFund.update({
        where: { id: fund.id },
        data: { applicationDraft: draft, status: 'applying' },
      })
      drafts.push(`${fund.name} (${fund.type})`)
      console.log(`[apply-funds] Draft generated for: ${fund.name}`)
    } catch (err) {
      console.error(`[apply-funds] Failed for ${fund.name}:`, err)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  if (RESEND_API_KEY && drafts.length > 0) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'DobProtocol CRM <noreply@dobprotocol.com>',
          to: NOTIFY_EMAIL,
          subject: `[CRM] ${drafts.length} fund application drafts ready`,
          html: `<p>Drafts generated for:</p><ul>${drafts.map((d) => `<li>${d}</li>`).join('')}</ul><p><a href="https://crm.dobprotocol.com/crm/funds">Review on CRM</a></p>`,
        }),
      })
    } catch {}
  }

  console.log(`[apply-funds] Done. Drafts: ${drafts.length}`)
}

main()
  .catch((err) => { console.error('[apply-funds] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
