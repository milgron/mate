import { NextResponse } from 'next/server';
import { loadUsage } from '@/lib/usage';

export async function GET() {
  try {
    const usage = loadUsage();
    return NextResponse.json(usage);
  } catch (error) {
    console.error('Error loading usage:', error);
    return NextResponse.json(
      { error: 'Failed to load usage data' },
      { status: 500 }
    );
  }
}
