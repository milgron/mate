import fs from 'fs';
import path from 'path';
import type { ConfigFile } from './types';
import { DEFAULT_CONFIG } from './types';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export function loadConfig(): ConfigFile {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(data) as ConfigFile;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: ConfigFile): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Update timestamp
    config.updatedAt = new Date().toISOString();

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
}
