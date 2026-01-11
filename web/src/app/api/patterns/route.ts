import { NextResponse } from 'next/server';
import {
  getAllPatterns,
  addPattern,
  deletePattern,
  togglePattern,
  createPattern,
  type PatternAction,
} from '@/lib/patterns';

export async function GET() {
  try {
    const patterns = getAllPatterns();
    return NextResponse.json({ patterns });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patterns', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trigger, action, key } = body as {
      trigger: string;
      action: PatternAction;
      key?: string;
    };

    if (!trigger || !action) {
      return NextResponse.json(
        { error: 'Trigger and action are required' },
        { status: 400 }
      );
    }

    // Validate action type
    if (!['memory', 'note', 'journal'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action type' },
        { status: 400 }
      );
    }

    // Create and add the new pattern
    const pattern = createPattern(trigger, action, key);
    addPattern(pattern);

    return NextResponse.json({ success: true, pattern });
  } catch (error) {
    console.error('Error creating pattern:', error);
    return NextResponse.json(
      { error: 'Failed to create pattern', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Pattern ID is required' },
        { status: 400 }
      );
    }

    const success = deletePattern(id);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error deleting pattern:', error);
    return NextResponse.json(
      { error: 'Failed to delete pattern', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Pattern ID is required' },
        { status: 400 }
      );
    }

    const success = togglePattern(id);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error toggling pattern:', error);
    return NextResponse.json(
      { error: 'Failed to toggle pattern', details: String(error) },
      { status: 500 }
    );
  }
}
