import { NextResponse } from 'next/server';
import { loadConfig, saveConfig } from '@/lib/config';
import type { ConfigFile } from '@/lib/types';

export async function GET() {
  try {
    const config = loadConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error loading config:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ConfigFile;
    saveConfig(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
