/**
 * Shared Prisma client for CRM scripts.
 * Loads .env.local from project root.
 */

import dotenv from 'dotenv'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const PROJECT_ROOT = path.resolve(__dirname, '../..')
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') })

export const prisma = new PrismaClient()
