import { fetchWithRetry } from '@bettercallclaude-italia/shared';
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const DOWNLOAD_BASE = 'https://dati.cortecostituzionale.it/opendata/distribuzione/pronunce';
const CACHE_DIR = join(tmpdir(), 'bcc-cortecostituzionale-cache');
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Pronuncia {
  numero_pronuncia: string;
  anno_pronuncia: string;
  data_decisione?: string;
  data_deposito?: string;
  epigrafe?: string;
  testo?: string;
  ecli?: string;
  tipologia_pronuncia?: string;
  dispositivo?: string;
  relatore_pronuncia?: string;
  presidente?: string;
  collegio?: string;
  redattore_pronuncia?: string;
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(anno: number): string {
  return join(CACHE_DIR, `pronunce_${anno}.json`);
}

function isCacheValid(path: string): boolean {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  return Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS;
}

function getZipUrlForYear(anno: number): string {
  if (anno >= 2001) return `${DOWNLOAD_BASE}/P_json2001_oggi.zip`;
  if (anno >= 1981) return `${DOWNLOAD_BASE}/P_json1981_2000.zip`;
  return `${DOWNLOAD_BASE}/P_json1956_1980.zip`;
}

function getInnerZipName(anno: number): string {
  return `Cc_Opendata_Pronunce_${anno}_json.zip`;
}

/**
 * Download and extract a specific year's JSON from the nested ZIP structure.
 */
async function downloadYear(anno: number): Promise<Pronuncia[]> {
  const zipUrl = getZipUrlForYear(anno);
  const innerName = getInnerZipName(anno);

  const buffer = await fetchWithRetry(
    'cortecostituzionale',
    async () => {
      const res = await fetch(zipUrl, {
        headers: { 'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.1' },
      });
      if (!res.ok) throw new Error(`Download ZIP HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    { retries: 1 }
  );

  const outerZip = new AdmZip(buffer);
  const innerEntry = outerZip.getEntry(innerName);
  if (!innerEntry) {
    throw new Error(`Anno ${anno} non trovato nel dataset (${innerName})`);
  }

  const innerBuffer = innerEntry.getData();
  const innerZip = new AdmZip(innerBuffer);
  const jsonEntry = innerZip.getEntries().find(e => e.entryName.endsWith('.json'));
  if (!jsonEntry) {
    throw new Error(`File JSON non trovato nell'archivio per anno ${anno}`);
  }

  const jsonText = jsonEntry.getData().toString('latin1');
  const data = JSON.parse(jsonText) as { elenco_pronunce?: Pronuncia[] };
  return data.elenco_pronunce ?? [];
}

/**
 * Get pronouncements for a year, using disk cache.
 */
export async function getPronunceForYear(anno: number): Promise<Pronuncia[]> {
  ensureCacheDir();
  const cachePath = getCachePath(anno);

  if (isCacheValid(cachePath)) {
    const raw = readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw) as Pronuncia[];
  }

  const pronunce = await downloadYear(anno);

  // Cache to disk
  writeFileSync(cachePath, JSON.stringify(pronunce), 'utf-8');

  return pronunce;
}

/**
 * Search pronouncements by criteria.
 */
export async function searchPronunce(params: {
  anno?: number;
  numero?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: Pronuncia[]; total: number }> {
  const { anno, numero, keyword, limit = 20, offset = 0 } = params;

  // Determine which years to search
  let years: number[];
  if (anno) {
    years = [anno];
  } else {
    // Search last 3 years if no anno specified
    const currentYear = new Date().getFullYear();
    years = [currentYear, currentYear - 1, currentYear - 2];
  }

  let allResults: Pronuncia[] = [];

  for (const year of years) {
    try {
      const pronunce = await getPronunceForYear(year);
      let filtered = pronunce;

      if (numero) {
        filtered = filtered.filter(p => p.numero_pronuncia === numero);
      }

      if (keyword) {
        const kw = keyword.toLowerCase();
        filtered = filtered.filter(p =>
          (p.epigrafe?.toLowerCase().includes(kw)) ||
          (p.testo?.toLowerCase().includes(kw)) ||
          (p.dispositivo?.toLowerCase().includes(kw))
        );
      }

      allResults = allResults.concat(filtered);
    } catch {
      // Skip years that fail to load (may not exist yet)
      continue;
    }
  }

  const total = allResults.length;
  const paged = allResults.slice(offset, offset + limit);

  return { results: paged, total };
}

/**
 * Get a single pronouncement by anno and numero.
 */
export async function getPronuncia(anno: number, numero: string): Promise<Pronuncia | null> {
  const pronunce = await getPronunceForYear(anno);
  return pronunce.find(p => p.numero_pronuncia === numero) ?? null;
}
