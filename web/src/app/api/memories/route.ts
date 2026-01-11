import { NextResponse } from 'next/server';
import {
  getAllMemories,
  searchMemories,
  deleteMemory,
  filterByTime,
} from '@/lib/memories';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;
    const query = searchParams.get('q');
    const timeFilter = searchParams.get('time') || 'all';

    let memories;

    if (query) {
      // Search by query
      memories = await searchMemories(userId || '', query);
    } else {
      // Get all memories
      memories = await getAllMemories(userId);
    }

    // Apply time filter
    memories = filterByTime(memories, timeFilter);

    // Sort by created_at descending (newest first)
    memories.sort((a, b) => b.created_at - a.created_at);

    return NextResponse.json({
      memories,
      count: memories.length,
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');

    if (!memoryId) {
      return NextResponse.json(
        { error: 'Memory ID is required' },
        { status: 400 }
      );
    }

    const success = await deleteMemory(memoryId);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Failed to delete memory' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error deleting memory:', error);
    return NextResponse.json(
      { error: 'Failed to delete memory', details: String(error) },
      { status: 500 }
    );
  }
}
