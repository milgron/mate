'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus, Sparkles } from 'lucide-react';

type PatternAction = 'memory' | 'note' | 'journal';

interface CustomPattern {
  id: string;
  trigger: string;
  triggerRegex: string;
  action: PatternAction;
  key?: string;
  enabled: boolean;
}

const ACTION_INFO: Record<PatternAction, { name: string; icon: string; description: string }> = {
  memory: {
    name: 'Save to Memory',
    icon: '\uD83E\uDDE0',
    description: 'Stores in semantic memory',
  },
  note: {
    name: 'Create Note',
    icon: '\uD83D\uDCDD',
    description: 'Creates a file in notes/',
  },
  journal: {
    name: 'Add to Journal',
    icon: '\uD83D\uDCD3',
    description: 'Appends to daily journal',
  },
};

const EXAMPLE_PATTERNS = [
  { trigger: 'Recordame que...', action: 'memory' as PatternAction, result: 'Saves to memory' },
  { trigger: 'Crea una nota sobre...', action: 'note' as PatternAction, result: 'Creates note file' },
  { trigger: 'Anota en el diario...', action: 'journal' as PatternAction, result: 'Adds to daily journal' },
];

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="text-sm font-mono text-muted-foreground">{number}</span>
      <Separator className="flex-1" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {title}
      </span>
    </div>
  );
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<CustomPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [newTrigger, setNewTrigger] = useState('');
  const [newAction, setNewAction] = useState<PatternAction>('memory');
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchPatterns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/patterns');
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setPatterns([]);
      } else {
        setPatterns(data.patterns || []);
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch patterns');
      setPatterns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigger.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: newTrigger,
          action: newAction,
          key: newKey || undefined,
        }),
      });

      if (res.ok) {
        setNewTrigger('');
        setNewKey('');
        fetchPatterns();
      }
    } catch (err) {
      console.error('Failed to add pattern:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pattern?')) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/patterns?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setPatterns(patterns.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete pattern:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (id: string) => {
    setToggling(id);
    try {
      const res = await fetch(`/api/patterns?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
      });

      if (res.ok) {
        setPatterns(
          patterns.map((p) =>
            p.id === id ? { ...p, enabled: !p.enabled } : p
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle pattern:', err);
    } finally {
      setToggling(null);
    }
  };

  const enabledPatterns = patterns.filter((p) => p.enabled);
  const disabledPatterns = patterns.filter((p) => !p.enabled);

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Natural Language Patterns
          </h1>
          <p className="text-muted-foreground">
            Create Siri-style commands for your assistant
          </p>
        </div>

        {/* Examples Section */}
        <section className="mb-10">
          <SectionHeader number="01" title="How It Works" />
          <Card className="bg-muted/30">
            <CardContent className="py-4">
              <div className="flex items-start gap-3 mb-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  When your message starts with a trigger phrase, the action executes
                  automatically - no LLM tool calling needed!
                </p>
              </div>
              <div className="space-y-2">
                {EXAMPLE_PATTERNS.map((example, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">&quot;{example.trigger}&quot;</span>
                    <span className="text-muted-foreground/50">&rarr;</span>
                    <Badge variant="secondary" className="text-xs">
                      {ACTION_INFO[example.action].icon} {example.result}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Add New Pattern */}
        <section className="mb-10">
          <SectionHeader number="02" title="Add Pattern" />
          <Card>
            <CardContent className="py-4">
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="trigger">Trigger Phrase</Label>
                  <Input
                    id="trigger"
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    placeholder="recordame que"
                    className="max-w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Message must start with this phrase (case insensitive)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action">Action</Label>
                  <Select
                    value={newAction}
                    onValueChange={(value) => setNewAction(value as PatternAction)}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACTION_INFO) as PatternAction[]).map((action) => (
                        <SelectItem key={action} value={action}>
                          {ACTION_INFO[action].icon} {ACTION_INFO[action].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ACTION_INFO[newAction].description}
                  </p>
                </div>

                {newAction === 'memory' && (
                  <div className="space-y-2">
                    <Label htmlFor="key">Memory Key (optional)</Label>
                    <Input
                      id="key"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="reminder"
                      className="max-w-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Category for the memory (e.g., reminder, todo, idea)
                    </p>
                  </div>
                )}

                <Button type="submit" disabled={saving || !newTrigger.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  {saving ? 'Adding...' : 'Add Pattern'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        {/* Active Patterns */}
        <section className="mb-10">
          <SectionHeader number="03" title="Active Patterns" />

          {/* Error State */}
          {error && (
            <Card className="mb-4">
              <CardContent className="py-4 text-center">
                <p className="text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {loading && !error && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading patterns...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && patterns.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No patterns yet.</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Add your first pattern above!
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pattern List */}
          {!loading && !error && enabledPatterns.length > 0 && (
            <div className="space-y-3">
              {enabledPatterns.map((pattern) => (
                <Card key={pattern.id} className="group">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">
                            {ACTION_INFO[pattern.action].icon}
                          </span>
                          <span className="font-medium text-foreground">
                            &quot;{pattern.trigger}...&quot;
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {ACTION_INFO[pattern.action].name}
                          </Badge>
                          {pattern.key && (
                            <Badge variant="outline" className="text-xs">
                              key: {pattern.key}
                            </Badge>
                          )}
                          {pattern.id.startsWith('default-') && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              default
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={pattern.enabled}
                          onCheckedChange={() => handleToggle(pattern.id)}
                          disabled={toggling === pattern.id}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => handleDelete(pattern.id)}
                          disabled={deleting === pattern.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Disabled Patterns */}
        {!loading && !error && disabledPatterns.length > 0 && (
          <section className="mb-10">
            <SectionHeader number="04" title="Disabled Patterns" />
            <div className="space-y-3 opacity-60">
              {disabledPatterns.map((pattern) => (
                <Card key={pattern.id} className="group">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">
                            {ACTION_INFO[pattern.action].icon}
                          </span>
                          <span className="font-medium text-muted-foreground line-through">
                            &quot;{pattern.trigger}...&quot;
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {ACTION_INFO[pattern.action].name}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={pattern.enabled}
                          onCheckedChange={() => handleToggle(pattern.id)}
                          disabled={toggling === pattern.id}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => handleDelete(pattern.id)}
                          disabled={deleting === pattern.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        {!loading && !error && patterns.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mb-6">
            {enabledPatterns.length} active, {disabledPatterns.length} disabled
          </p>
        )}

        <Separator className="my-8" />

        {/* Navigation */}
        <div className="flex justify-center gap-6">
          <Link
            href="/config"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Configure
          </Link>
          <Link
            href="/memories"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Memories &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
