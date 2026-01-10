'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import type { UsageFile } from '@/lib/types';

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function getMonthName(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/usage')
      .then((res) => res.json())
      .then((data) => {
        setUsage(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading usage:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">Error loading usage data</p>
      </div>
    );
  }

  const maxCost = Math.max(
    usage.usage.reasoning.cost,
    usage.usage.tts.cost,
    usage.usage.stt.cost,
    0.01
  );

  const totalRequests =
    usage.usage.reasoning.requests +
    usage.usage.tts.requests +
    usage.usage.stt.requests;

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Usage Dashboard
          </h1>
          <p className="text-muted-foreground">
            {getMonthName(new Date(usage.period.start))}
          </p>
        </div>

        {/* Total Cost Card */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-foreground">
              {formatCost(usage.totalCost)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {totalRequests} total requests
            </p>
          </CardContent>
        </Card>

        {/* Usage by Model */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              By Model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reasoning */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Reasoning</span>
                <span className="text-sm text-muted-foreground">
                  {formatCost(usage.usage.reasoning.cost)}
                </span>
              </div>
              <Progress
                value={(usage.usage.reasoning.cost / maxCost) * 100}
                className="h-2"
              />
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {usage.usage.reasoning.requests} requests
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {formatNumber(usage.usage.reasoning.inputTokens || 0)} in
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {formatNumber(usage.usage.reasoning.outputTokens || 0)} out
                </Badge>
              </div>
            </div>

            {/* TTS */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Text-to-Speech</span>
                <span className="text-sm text-muted-foreground">
                  {formatCost(usage.usage.tts.cost)}
                </span>
              </div>
              <Progress
                value={(usage.usage.tts.cost / maxCost) * 100}
                className="h-2"
              />
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {usage.usage.tts.requests} requests
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {formatNumber(usage.usage.tts.characters || 0)} chars
                </Badge>
              </div>
            </div>

            {/* STT */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Speech-to-Text</span>
                <span className="text-sm text-muted-foreground">
                  {formatCost(usage.usage.stt.cost)}
                </span>
              </div>
              <Progress
                value={(usage.usage.stt.cost / maxCost) * 100}
                className="h-2"
              />
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {usage.usage.stt.requests} requests
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {(usage.usage.stt.minutes || 0).toFixed(1)} min
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Activity */}
        {usage.daily.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {usage.daily.slice(-7).reverse().map((day) => (
                  <div
                    key={day.date}
                    className="flex justify-between items-center py-1"
                  >
                    <span className="text-sm text-muted-foreground">
                      {new Date(day.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {day.requests} req
                      </Badge>
                      <span className="text-sm font-medium">
                        {formatCost(day.cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* No activity message */}
        {usage.daily.length === 0 && (
          <Card className="mb-6">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No activity recorded yet this month.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Start chatting with your assistant to see usage stats here.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="flex flex-col items-center gap-4">
          <Separator className="my-4" />

          <Link
            href="/config"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <span aria-hidden="true">&larr;</span>
            Configure
          </Link>
        </div>
      </div>
    </main>
  );
}
