'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trash2, Search, Brain } from 'lucide-react';

interface Memory {
  id: string;
  user_id: string;
  type: 'fact' | 'preference' | 'note';
  key: string;
  content: string;
  created_at: number;
  last_accessed: number;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'fact':
      return '\uD83D\uDCCC'; // pin
    case 'preference':
      return '\u2764\uFE0F'; // heart
    case 'note':
      return '\uD83D\uDCDD'; // memo
    default:
      return '\uD83D\uDCA1'; // lightbulb
  }
}

const TIME_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'All', value: 'all' },
];

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      params.set('time', timeFilter);

      const res = await fetch(`/api/memories?${params}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setMemories([]);
      } else {
        setMemories(data.memories || []);
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch memories');
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, timeFilter]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleDelete = async (memoryId: string) => {
    if (!confirm('Delete this memory?')) return;

    setDeleting(memoryId);
    try {
      const res = await fetch(`/api/memories?id=${encodeURIComponent(memoryId)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMemories(memories.filter((m) => m.id !== memoryId));
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMemories();
  };

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Your Memories
          </h1>
          <p className="text-muted-foreground">
            View and manage stored memories
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </form>

        {/* Time Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {TIME_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={timeFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <Separator className="mb-6" />

        {/* Error State */}
        {error && (
          <Card className="mb-6">
            <CardContent className="py-8 text-center">
              <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">{error}</p>
              <p className="text-sm text-muted-foreground">
                Make sure the bot has been started and has stored memories.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading memories...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && memories.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'No memories found matching your search.'
                  : 'No memories stored yet.'}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Chat with your assistant to create memories.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Memory List */}
        {!loading && !error && memories.length > 0 && (
          <div className="space-y-3">
            {memories.map((memory) => (
              <Card key={memory.id} className="group">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{getTypeIcon(memory.type)}</span>
                        <span className="font-medium text-foreground truncate">
                          {memory.key}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {memory.type}
                        </Badge>
                      </div>
                      <p className="text-foreground mb-2">{memory.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(memory.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                      onClick={() => handleDelete(memory.id)}
                      disabled={deleting === memory.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && !error && memories.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            Showing {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
          </p>
        )}

        <Separator className="my-8" />

        {/* Navigation */}
        <div className="text-center">
          <Link
            href="/config"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Configure
          </Link>
        </div>
      </div>
    </main>
  );
}
