import fs from 'fs';
import path from 'path';
import type { UsageFile } from './types';
import { DEFAULT_USAGE } from './types';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
const USAGE_PATH = path.join(DATA_DIR, 'usage.json');

export function loadUsage(): UsageFile {
  try {
    if (fs.existsSync(USAGE_PATH)) {
      const data = fs.readFileSync(USAGE_PATH, 'utf-8');
      return JSON.parse(data) as UsageFile;
    }
  } catch (error) {
    console.error('Error loading usage:', error);
  }
  return DEFAULT_USAGE;
}

export function saveUsage(usage: UsageFile): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(USAGE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2));
  } catch (error) {
    console.error('Error saving usage:', error);
    throw error;
  }
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
