'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { REASONING_MODELS, TTS_VOICES } from '@/lib/constants';
import type { ConfigFile } from '@/lib/types';

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

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading config:', err);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error saving config:', err);
    }
    setSaving(false);
  };

  const updateConfig = (updates: Partial<ConfigFile>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
  };

  const selectedModel = REASONING_MODELS.find(
    (m) =>
      m.provider === config?.models.reasoning.provider &&
      m.model === config?.models.reasoning.model
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">Error loading configuration</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Configure your Mate
          </h1>
          <p className="text-muted-foreground">
            Set up your personal AI assistant
          </p>
        </div>

        {/* Section 01: Assistant Name */}
        <section className="mb-10">
          <SectionHeader number="01" title="Assistant Name" />
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={config.assistant.name}
              onChange={(e) =>
                updateConfig({
                  assistant: { ...config.assistant, name: e.target.value },
                })
              }
              placeholder="Mate"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              How your assistant will introduce itself
            </p>
          </div>
        </section>

        {/* Section 02: Reasoning Model */}
        <section className="mb-10">
          <SectionHeader number="02" title="Reasoning Model" />
          <RadioGroup
            value={`${config.models.reasoning.provider}:${config.models.reasoning.model}`}
            onValueChange={(value) => {
              const model = REASONING_MODELS.find((m) => m.id === value);
              if (model) {
                updateConfig({
                  models: {
                    ...config.models,
                    reasoning: {
                      provider: model.provider,
                      model: model.model,
                    },
                  },
                  features: {
                    ...config.features,
                    extendedThinking: model.supportsThinking,
                  },
                });
              }
            }}
            className="space-y-3"
          >
            {REASONING_MODELS.map((model) => (
              <div
                key={model.id}
                className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer"
              >
                <RadioGroupItem value={model.id} id={model.id} className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor={model.id}
                    className="font-medium cursor-pointer"
                  >
                    {model.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({model.provider})
                    </span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {model.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {model.pricing}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </section>

        {/* Section 03: Voice */}
        <section className="mb-10">
          <SectionHeader number="03" title="Voice" />
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-sm font-medium mb-1">Speech-to-Text</p>
              <p className="text-sm text-muted-foreground">
                Whisper Large v3 Turbo (Groq)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Text-to-Speech Voice</Label>
              <Select
                value={config.models.tts.voice}
                onValueChange={(value) =>
                  updateConfig({
                    models: {
                      ...config.models,
                      tts: { ...config.models.tts, voice: value },
                    },
                  })
                }
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name} - {voice.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Section 04: Features */}
        <section className="mb-10">
          <SectionHeader number="04" title="Features" />
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="thinking"
                checked={config.features.extendedThinking}
                onCheckedChange={(checked) =>
                  updateConfig({
                    features: {
                      ...config.features,
                      extendedThinking: checked as boolean,
                    },
                  })
                }
                disabled={!selectedModel?.supportsThinking}
              />
              <div>
                <Label htmlFor="thinking" className="cursor-pointer">
                  Extended thinking
                </Label>
                <p className="text-xs text-muted-foreground">
                  Deep reasoning for complex tasks (Anthropic only)
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="voice"
                checked={config.features.voiceEnabled}
                onCheckedChange={(checked) =>
                  updateConfig({
                    features: {
                      ...config.features,
                      voiceEnabled: checked as boolean,
                    },
                  })
                }
              />
              <div>
                <Label htmlFor="voice" className="cursor-pointer">
                  Voice responses
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive audio responses in Telegram
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full max-w-xs"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
          </Button>

          <Separator className="my-4" />

          <Link
            href="/use"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            View usage
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
