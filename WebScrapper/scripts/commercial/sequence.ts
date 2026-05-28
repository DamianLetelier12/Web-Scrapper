/**
 * Email Sequence Processor for DobProtocol CRM.
 * Cron: Every 2 hours
 *
 * Usage: npx tsx scripts/commercial/sequence.ts
 */

import { prisma } from './db'
import { aiGenerate } from './ai-helper'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = process.env.CRM_FROM_EMAIL || 'DobProtocol <noreply@dobprotocol.com>'
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

function replacePlaceholders(text: string, lead: any) {
  return text.replace(/\{\{company\}\}/g, lead.companyName || '').replace(/\{\{contact\}\}/g, lead.contactName || 'there')
}

async function main() {
  console.log('[sequence] Processing email sequences...')

  if (!RESEND_API_KEY) { console.log('[sequence] No RESEND_API_KEY. Skipping.'); return }

  const enrollments = await prisma.crmSequenceEnrollment.findMany({
    where: { status: 'active', nextSendAt: { lte: new Date() } },
    include: { sequence: true, lead: true },
  })

  if (enrollments.length === 0) { console.log('[sequence] No enrollments due.'); return }
  console.log(`[sequence] Processing ${enrollments.length} enrollment(s)`)

  let sent = 0

  for (const enrollment of enrollments) {
    const { sequence, lead } = enrollment
    if (!lead?.email) continue

    const steps = (sequence.steps as any[]) || []
    const currentStep = steps[enrollment.currentStep]

    if (!currentStep) {
      await prisma.crmSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'completed', completedAt: new Date() },
      })
      continue
    }

    const template = await prisma.crmEmailTemplate.findUnique({ where: { id: currentStep.template_id } })
    if (!template) continue

    const subject = replacePlaceholders(template.subject, lead)
    let body = replacePlaceholders(template.body, lead)

    try {
      const enhanced = await aiGenerate(
        `Lightly personalize this email for "${lead.companyName}". Add one relevant sentence. Return ONLY HTML body.\n\nBody: ${body}`
      )
      if (enhanced && enhanced.length > 50) body = enhanced
    } catch {}

    try {
      const result = await sendEmail(lead.email, subject, body)
      console.log(`[sequence] Sent step ${enrollment.currentStep + 1} to ${lead.email}`)

      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'sequence_email', subject, content: body, metadata: { sequence_id: sequence.id, step: enrollment.currentStep, resend_id: result.id } },
      })

      const nextStepIndex = enrollment.currentStep + 1
      const nextStep = steps[nextStepIndex]

      if (nextStep) {
        const nextSendAt = new Date()
        nextSendAt.setDate(nextSendAt.getDate() + (nextStep.delay_days || 3))
        await prisma.crmSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { currentStep: nextStepIndex, nextSendAt },
        })
      } else {
        await prisma.crmSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'completed', completedAt: new Date() },
        })
      }
      sent++
    } catch (err) {
      console.error(`[sequence] Failed for ${lead.email}:`, err)
    }
  }

  console.log(`[sequence] Done. Sent: ${sent}`)
}

main()
  .catch((err) => { console.error('[sequence] Fatal error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
