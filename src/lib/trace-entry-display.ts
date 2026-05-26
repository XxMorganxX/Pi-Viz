import type { TraceFeedEntry } from './types';

export interface TraceEntryDisplayBlock {
  id: string;
  title?: string;
  text: string;
  tone: 'plain' | 'content' | 'json';
  defaultOpen: boolean;
  collapsedSummary: string;
  expandedSummary: string;
}

export function traceEntryDisplayBlocks(entry: TraceFeedEntry): TraceEntryDisplayBlock[] {
  const blocks: TraceEntryDisplayBlock[] = [];

  if (entry.inputSchema) {
    blocks.push({
      id: 'input-schema',
      title: 'Input schema',
      text: JSON.stringify(entry.inputSchema, null, 2),
      tone: 'json',
      defaultOpen: false,
      collapsedSummary: 'Show Input schema',
      expandedSummary: 'Hide Input schema',
    });
  }

  if (!entry.text) return blocks;

  const parsed = parseJson(entry.text);
  if (entry.type === 'tool' && parsed.ok) {
    const contentBlocks = contentTextBlocks(parsed.value);
    if (contentBlocks.length > 0) return blocks.concat(contentBlocks);
  }

  if (parsed.ok) {
    return blocks.concat([
      {
        id: 'json',
        title: entry.type === 'tool' ? 'Output JSON' : 'Details',
        text: JSON.stringify(parsed.value, null, 2),
        tone: 'json',
        defaultOpen: false,
        collapsedSummary: `Show ${entry.type === 'tool' ? 'Output JSON' : 'Details'}`,
        expandedSummary: `Hide ${entry.type === 'tool' ? 'Output JSON' : 'Details'}`,
      },
    ]);
  }

  return blocks.concat([
    {
      id: 'text',
      title: entry.type === 'tool' ? 'Output' : undefined,
      text: entry.text.trimEnd(),
      tone: 'plain',
      defaultOpen: false,
      collapsedSummary: `Show ${entry.type === 'tool' ? 'Output' : 'Details'}`,
      expandedSummary: `Hide ${entry.type === 'tool' ? 'Output' : 'Details'}`,
    },
  ]);
}

export function traceEntryPreviewText(entry: TraceFeedEntry): string {
  const blocks = traceEntryDisplayBlocks(entry);
  const firstBlock = blocks.find((block) => block.id !== 'input-schema') ?? blocks[0];
  if (!firstBlock) return '';

  const text = firstBlock.text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return firstBlock.title ? `${firstBlock.title} · ${text}` : text;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function contentTextBlocks(value: unknown): TraceEntryDisplayBlock[] {
  if (!isRecord(value) || !Array.isArray(value.content)) return [];
  const content = value.content;

  return content.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    if (item.type !== 'text' || typeof item.text !== 'string') return [];

    return [
      {
        id: `content-${index}`,
        title: content.length === 1 ? 'Content' : `Content ${index + 1}`,
        text: item.text.trimEnd(),
        tone: 'content' as const,
        defaultOpen: false,
        collapsedSummary: `Show ${content.length === 1 ? 'Content' : `Content ${index + 1}`}`,
        expandedSummary: `Hide ${content.length === 1 ? 'Content' : `Content ${index + 1}`}`,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
