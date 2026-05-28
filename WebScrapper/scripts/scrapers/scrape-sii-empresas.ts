/**
 * SII Chile - Medium-Sized Companies Scraper
 *
 * Downloads public company data from SII (Servicio de Impuestos Internos) and
 * filters for medium-sized companies (Medianas Empresas).
 *
 * SII size classification by annual sales in UF:
 *   - Tramo 5 / MEDIANA 1: 25,000.01 - 50,000 UF
 *   - Tramo 6 / MEDIANA 2: 50,000.01 - 100,000 UF
 *
 * Data sources (all public from sii.cl/estadisticas/nominas):
 *   - PUB_EMPRESAS_PJ_2020_A_2024.zip → 22-col files with RUT, name, size, region, activity, workers
 *   - PUB_NOM_DIRECCIONES.zip         → Company addresses (for contact purposes)
 *
 * Output: scripts/scrapers/csv/sii_empresas_medianas.csv
 *
 * Usage: npx tsx scripts/scrapers/scrape-sii-empresas.ts
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { createWriteStream, createReadStream } from 'fs'
import { createInterface } from 'readline'

const SII_BASE = 'https://www.sii.cl/estadisticas/nominas'

const SCRIPT_DIR = path.resolve(__dirname)
const CSV_DIR = path.join(SCRIPT_DIR, 'csv')
const TEMP_DIR = path.join(SCRIPT_DIR, '.tmp')

// SII "Tramo según ventas" values for medium-sized companies
// The column contains numeric tramo codes as text
const MEDIUM_TRAMOS = new Set(['5', '6'])
// Also match text labels in case format varies
const MEDIUM_KEYWORDS = ['mediana 1', 'mediana 2', 'mediana']

function log(msg: string) {
  console.log(`[sii-scraper] ${msg}`)
}

function ensureDirs() {
  for (const dir of [CSV_DIR, TEMP_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

function downloadFile(url: string, destPath: string): Promise<void> {
  log(`Downloading ${url}...`)
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        Accept: '*/*',
      },
    }

    const request = client.get(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        log(`  Redirecting to ${res.headers.location}`)
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
        return
      }

      if (res.statusCode && res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`))
        return
      }

      const fileStream = createWriteStream(destPath)
      let totalBytes = 0

      res.on('data', (chunk: Buffer) => { totalBytes += chunk.length })
      res.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close()
        log(`  Downloaded ${(totalBytes / 1024 / 1024).toFixed(1)} MB → ${path.basename(destPath)}`)
        resolve()
      })
      fileStream.on('error', reject)
    })

    request.on('error', reject)
  })
}

async function extractZip(zipPath: string, outDir: string): Promise<string[]> {
  log(`Extracting ${path.basename(zipPath)}...`)
  const { execSync } = await import('child_process')
  try {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'pipe' })
  } catch (e: any) {
    if (e.status > 1) throw new Error(`Failed to extract ${zipPath}: ${e.message}`)
  }

  const files = fs.readdirSync(outDir).filter(f =>
    f.endsWith('.txt') || f.endsWith('.csv') || f.endsWith('.TXT')
  )
  log(`  Extracted ${files.length} file(s): ${files.join(', ')}`)
  return files.map(f => path.join(outDir, f))
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(c.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

function isMediumTramo(value: string): boolean {
  const v = value.trim()
  if (MEDIUM_TRAMOS.has(v)) return true
  const lower = v.toLowerCase()
  return MEDIUM_KEYWORDS.some(k => lower.includes(k))
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function tramoLabel(tramo: string): string {
  const v = tramo.trim()
  if (v === '5' || v.toLowerCase().includes('mediana 1')) return 'MEDIANA 1 (25,000-50,000 UF)'
  if (v === '6' || v.toLowerCase().includes('mediana 2')) return 'MEDIANA 2 (50,000-100,000 UF)'
  return `MEDIANA (Tramo ${v})`
}

/**
 * Stream-process a single SII empresas TXT file.
 * Filters for medium-sized companies and writes matching rows to the CSV writer.
 * Returns count of matches and a set of unique RUTs found.
 */
async function streamProcessFile(
  filePath: string,
  csvStream: fs.WriteStream,
  seenRuts: Set<string>,
): Promise<{ matched: number; total: number; sampleTramos: string[] }> {
  const fileName = path.basename(filePath)
  log(`Processing ${fileName} (streaming)...`)

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' })
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers: string[] = []
  let lineNum = 0
  let matched = 0
  let total = 0
  const sampleTramos: string[] = []

  // Column indices (set after reading header)
  let iYear = -1, iRut = -1, iDv = -1, iRazon = -1, iTramo = -1
  let iTrab = -1, iInicio = -1, iTermino = -1
  let iRubro = -1, iSubrubro = -1, iActividad = -1
  let iRegion = -1, iProvincia = -1, iComuna = -1

  for await (const line of rl) {
    lineNum++
    if (!line.trim()) continue

    let fields = line.split('\t')
    if (fields.length < 3) fields = line.split(';')

    if (lineNum === 1) {
      headers = fields.map(f => f.trim())
      iYear = findCol(headers, 'año comercial', 'ano comercial', 'agno')
      iRut = findCol(headers, 'rut')
      iDv = findCol(headers, 'dv')
      iRazon = findCol(headers, 'social', 'razón social', 'razon social', 'nombre')
      iTramo = findCol(headers, 'tramo', 'tramo según ventas', 'tramo segun ventas')
      iTrab = findCol(headers, 'trabajador', 'número de trabajadores', 'numero de trabajadores')
      iInicio = findCol(headers, 'fecha inicio')
      iTermino = findCol(headers, 'término de giro', 'termino de giro', 'fecha termino')
      iRubro = findCol(headers, 'rubro econ', 'rubro')
      iSubrubro = findCol(headers, 'subrubro')
      iActividad = findCol(headers, 'actividad econ', 'actividad')
      iRegion = findCol(headers, 'regi', 'region')
      iProvincia = findCol(headers, 'provincia')
      iComuna = findCol(headers, 'comuna')

      log(`  Columns: rut=${iRut}, name=${iRazon}, tramo=${iTramo}, region=${iRegion}, comuna=${iComuna}`)

      if (iRut < 0 || iTramo < 0) {
        log(`  WARNING: Missing required columns, skipping file`)
        break
      }
      continue
    }

    total++
    const f = fields.map(x => x.trim())
    const tramo = f[iTramo] || ''

    // Collect sample tramo values for debugging
    if (sampleTramos.length < 20 && !sampleTramos.includes(tramo)) {
      sampleTramos.push(tramo)
    }

    if (!isMediumTramo(tramo)) continue

    const rut = f[iRut] || ''
    if (!rut) continue

    // Deduplicate: keep only the most recent year per RUT
    // Since files are per-year and we process newest first, skip if already seen
    if (seenRuts.has(rut)) continue
    seenRuts.add(rut)

    const dv = iDv >= 0 ? f[iDv] || '' : ''
    const terminoGiro = iTermino >= 0 ? f[iTermino] || '' : ''

    // Skip companies that have terminated
    if (terminoGiro && terminoGiro !== '' && terminoGiro !== '0' && terminoGiro !== '00/00/0000') continue

    const row = [
      rut,
      dv,
      dv ? `${rut}-${dv}` : rut,
      iRazon >= 0 ? f[iRazon] || '' : '',
      tramo,
      tramoLabel(tramo),
      iRegion >= 0 ? f[iRegion] || '' : '',
      iProvincia >= 0 ? f[iProvincia] || '' : '',
      iComuna >= 0 ? f[iComuna] || '' : '',
      iRubro >= 0 ? f[iRubro] || '' : '',
      iSubrubro >= 0 ? f[iSubrubro] || '' : '',
      iActividad >= 0 ? f[iActividad] || '' : '',
      iTrab >= 0 ? f[iTrab] || '' : '',
      iYear >= 0 ? f[iYear] || '' : fileName.match(/(\d{4})/)?.[1] || '',
      iInicio >= 0 ? f[iInicio] || '' : '',
      terminoGiro ? 'TERMINADA' : 'ACTIVA',
    ].map(escapeCsv).join(',')

    csvStream.write(row + '\n')
    matched++
  }

  log(`  ${fileName}: ${matched} medium companies out of ${total} total`)
  return { matched, total, sampleTramos }
}

/**
 * Load company addresses into a map keyed by RUT.
 * Only loads addresses for RUTs in the provided set (to save memory).
 */
async function loadAddresses(targetRuts: Set<string>): Promise<Map<string, string>> {
  const zipPath = path.join(TEMP_DIR, 'direcciones.zip')
  const extractDir = path.join(TEMP_DIR, 'direcciones')
  if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true })

  await downloadFile(`${SII_BASE}/PUB_NOM_DIRECCIONES.zip`, zipPath)
  const txtFiles = await extractZip(zipPath, extractDir)

  const addresses = new Map<string, string>()

  for (const txtFile of txtFiles) {
    const fileStream = createReadStream(txtFile, { encoding: 'utf-8' })
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity })

    let headers: string[] = []
    let lineNum = 0
    let iRut = -1, iDir = -1, iComuna = -1, iRegion = -1

    for await (const line of rl) {
      lineNum++
      if (!line.trim()) continue

      let fields = line.split('\t')
      if (fields.length < 3) fields = line.split(';')

      if (lineNum === 1) {
        headers = fields.map(f => f.trim())
        iRut = findCol(headers, 'rut')
        iDir = findCol(headers, 'direcci', 'calle', 'domicilio')
        iComuna = findCol(headers, 'comuna')
        iRegion = findCol(headers, 'regi', 'region')
        log(`  Address columns: rut=${iRut}, dir=${iDir}, comuna=${iComuna}`)
        if (iRut < 0) break
        continue
      }

      const f = fields.map(x => x.trim())
      const rut = f[iRut] || ''

      if (!targetRuts.has(rut)) continue
      if (addresses.has(rut)) continue // Keep first (HQ) address

      const parts = [
        iDir >= 0 ? f[iDir] : '',
        iComuna >= 0 ? f[iComuna] : '',
        iRegion >= 0 ? f[iRegion] : '',
      ].filter(Boolean)

      if (parts.length > 0) {
        addresses.set(rut, parts.join(', '))
      }
    }
  }

  log(`Loaded ${addresses.size} addresses for target companies`)
  return addresses
}

function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
    log('Cleaned up temp files')
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  SII Chile - Medium-Sized Companies Scraper')
  console.log('  Source: Servicio de Impuestos Internos (sii.cl)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log()

  ensureDirs()

  const csvPath = path.join(CSV_DIR, 'sii_empresas_medianas.csv')
  const tmpCsvPath = csvPath + '.tmp'

  try {
    // Step 1: Download empresas data
    log('STEP 1/4: Downloading company data from SII...')
    const zipPath = path.join(TEMP_DIR, 'empresas.zip')
    const extractDir = path.join(TEMP_DIR, 'empresas')
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true })

    await downloadFile(`${SII_BASE}/PUB_EMPRESAS_PJ_2020_A_2024.zip`, zipPath)
    const txtFiles = await extractZip(zipPath, extractDir)

    if (txtFiles.length === 0) throw new Error('No data files in zip')

    // Step 2: Stream-process files (newest first for dedup)
    log('STEP 2/4: Filtering medium-sized companies (streaming)...')

    // Sort files so newest year is first (for dedup - keep most recent record per RUT)
    txtFiles.sort((a, b) => b.localeCompare(a))

    const CSV_HEADERS = [
      'RUT', 'DV', 'RUT_COMPLETO', 'RAZON_SOCIAL',
      'TRAMO_VENTAS', 'CLASIFICACION',
      'REGION', 'PROVINCIA', 'COMUNA',
      'RUBRO', 'SUBRUBRO', 'ACTIVIDAD_ECONOMICA',
      'NUM_TRABAJADORES', 'ANO_COMERCIAL',
      'FECHA_INICIO_ACTIVIDADES', 'ESTADO',
    ]

    const csvStream = createWriteStream(tmpCsvPath, { encoding: 'utf-8' })
    csvStream.write(CSV_HEADERS.join(',') + '\n')

    const seenRuts = new Set<string>()
    let totalMatched = 0
    let allSampleTramos: string[] = []

    for (const txtFile of txtFiles) {
      const { matched, sampleTramos } = await streamProcessFile(txtFile, csvStream, seenRuts)
      totalMatched += matched
      allSampleTramos = [...new Set([...allSampleTramos, ...sampleTramos])]
    }

    csvStream.end()
    await new Promise<void>(resolve => csvStream.on('finish', resolve))

    log(`Sample tramo values found: ${allSampleTramos.join(', ')}`)

    if (totalMatched === 0) {
      log('WARNING: No medium-sized companies matched!')
      log(`Tramo values in data: ${allSampleTramos.join(', ')}`)
      log('You may need to adjust MEDIUM_TRAMOS to match these values.')

      // Write a debug CSV with sample data from each tramo
      fs.unlinkSync(tmpCsvPath)
      cleanup()
      return
    }

    // Delete the zip and extracted files early to free disk space
    log('Freeing disk space (removing raw downloads)...')
    fs.rmSync(path.join(TEMP_DIR, 'empresas'), { recursive: true, force: true })
    fs.unlinkSync(zipPath)

    // Step 3: Download addresses for matched companies
    log('STEP 3/4: Downloading company addresses...')
    let addresses: Map<string, string>
    try {
      addresses = await loadAddresses(seenRuts)
    } catch (err) {
      log(`WARNING: Could not load addresses: ${err}. Continuing without them.`)
      addresses = new Map()
    }

    // Step 4: Merge addresses into final CSV
    log('STEP 4/4: Generating final CSV with addresses...')

    if (addresses.size > 0) {
      const FINAL_HEADERS = [...CSV_HEADERS, 'DIRECCION']
      const finalStream = createWriteStream(csvPath, { encoding: 'utf-8' })
      finalStream.write(FINAL_HEADERS.join(',') + '\n')

      const tmpRead = createReadStream(tmpCsvPath, { encoding: 'utf-8' })
      const rl = createInterface({ input: tmpRead, crlfDelay: Infinity })

      let isHeader = true
      for await (const line of rl) {
        if (isHeader) { isHeader = false; continue }

        // Extract RUT from line (first column)
        const rut = line.split(',')[0].replace(/"/g, '')
        const addr = addresses.get(rut) || ''

        finalStream.write(line + ',' + escapeCsv(addr) + '\n')
      }

      finalStream.end()
      await new Promise<void>(resolve => finalStream.on('finish', resolve))
      fs.unlinkSync(tmpCsvPath)
    } else {
      // No addresses - just rename temp CSV
      fs.renameSync(tmpCsvPath, csvPath)
    }

    const stats = fs.statSync(csvPath)

    console.log()
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Done! ${totalMatched} active medium-sized companies`)
    console.log(`  Output: ${csvPath}`)
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`)
    console.log(`  Companies with addresses: ${addresses.size}`)
    console.log('═══════════════════════════════════════════════════════════')
  } catch (error) {
    console.error('[sii-scraper] ERROR:', error)
    // Clean up temp CSV on error
    if (fs.existsSync(tmpCsvPath)) fs.unlinkSync(tmpCsvPath)
    throw error
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
