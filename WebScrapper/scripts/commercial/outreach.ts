/**
 * CRM Outreach Automation for DobProtocol.
 * Cron: Daily 2pm UTC
 *
 * Usage: npx tsx scripts/commercial/outreach.ts
 */

import { prisma } from './db'
import { aiGenerate } from './ai-helper'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = process.env.CRM_FROM_EMAIL || 'DobProtocol <noreply@dobprotocol.com>'
const REPLY_TO = process.env.CRM_REPLY_TO || 'oscar@dobprotocol.com'
const FOLLOWUP_DAYS = 3

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

function replacePlaceholders(text: string, lead: { companyName: string; contactName: string | null }) {
  return text.replace(/\{\{company\}\}/g, lead.companyName || '').replace(/\{\{contact\}\}/g, lead.contactName || 'there')
}

async function main() {
  console.log('[outreach] Starting automated outreach...')

  if (!RESEND_API_KEY) { console.log('[outreach] No RESEND_API_KEY. Skipping.'); return }

  const leads = await prisma.crmLead.findMany({
    where: {
      nextFollowupAt: { lte: new Date() },
      stage: { in: ['prospect', 'contacted'] },
      email: { not: null },
      leadType: 'customer',
    },
  })

  if (leads.length === 0) { console.log('[outreach] No leads due. Done.'); return }
  console.log(`[outreach] Found ${leads.length} lead(s) due`)

  const templates = await prisma.crmEmailTemplate.findMany({
    where: { active: true, targetType: 'customer' },
  })
  if (templates.length === 0) { console.log('[outreach] No templates. Skipping.'); return }

  let sent = 0, failed = 0

  for (const lead of leads) {
    const template = templates.find((t) => t.stage === lead.stage) || templates[0]
    const subject = replacePlaceholders(template.subject, lead)
    let body = replacePlaceholders(template.body, lead)

    const isDefi = (lead.tags || []).some((t) => t.includes('defi') || t.includes('stellar'))
    const context = isDefi
      ? 'DeFi protocol. Focus on: scalable token distribution, lazy-pull model, multi-chain.'
      : 'DAO/Web3 team. Focus on: treasury management, participation marketplace, payroll.'

    try {
      const enhanced = await aiGenerate(
        `Personalize this email for "${lead.companyName}".\nCONTEXT: ${context}\nAdd 1-2 personalized sentences. Return ONLY HTML body.\n\nBody: ${body}`
      )
      if (enhanced && enhanced.length > 50) body = enhanced
    } catch {}

    try {
      const result = await sendEmail(lead.email!, subject, body)
      console.log(`[outreach] Sent to ${lead.email} (${lead.companyName})`)

      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'email_sent', subject, content: body, metadata: { template_id: template.id, resend_id: result.id, automated: true } },
      })

      const nextFollowup = new Date()
      nextFollowup.setDate(nextFollowup.getDate() + FOLLOWUP_DAYS)

      await prisma.crmLead.update({
        where: { id: lead.id },
        data: { lastContactedAt: new Date(), nextFollowupAt: nextFollowup, stage: lead.stage === 'prospect' ? 'contacted' : lead.stage },
      })
      sent++
    } catch (err) {
      console.error(`[outreach] Failed for ${lead.email}:`, err)
      failed++
    }
  }

  console.log(`[outreach] Done. Sent: ${sent}, Failed: ${failed}`)
}

main()
  .catch((err) => { console.error('[outreach] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
