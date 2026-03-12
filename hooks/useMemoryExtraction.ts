import { useEffect, useRef } from 'react';
import { MemoryEntry, MemoryCategory } from '@/types';
import {
  loadMemories,
  generateId,
  buildAssociativeLinks,
  loadAssociativeLinks,
  saveAssociativeLinks,
  scheduleAssociativeLinkPruning,
  shouldExtractMemory,
} from '@/utils/memory';
import { extractMemoryCandidates } from '@/utils/context';

interface UseMemoryExtractionOptions {
  messages: unknown[];
  addMemory: (entry: MemoryEntry) => void;
  minMessages?: number;
}

export function useMemoryExtraction({
  messages,
  addMemory,
  minMessages = 4,
}: UseMemoryExtractionOptions) {
  const extractionRef = useRef(false);

  useEffect(() => {
    if (extractionRef.current || messages.length < minMessages) return;

    const last = messages[messages.length - 1] as any;
    const secondLast = messages.length >= 2
      ? (messages[messages.length - 2] as any)
      : null;

    if (last?.role !== 'assistant' || secondLast?.role !== 'user') return;

    const userText =
      secondLast.parts?.find((p: any) => p.type === 'text')?.text ?? '';
    const assistantText =
      last.parts
        ?.filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join(' ') ?? '';

    if (!shouldExtractMemory(userText, assistantText)) return;

    extractionRef.current = true;

    extractMemoryCandidates(userText, assistantText)
      .then(async (candidates) => {
        for (const c of candidates) {
          const entry: MemoryEntry = {
            id: generateId(),
            content: c.content,
            keywords: c.keywords,
            category: c.category as MemoryCategory,
            timestamp: Date.now(),
            importance: c.importance,
            source: 'auto-extract',
            accessCount: 0,
            lastAccessed: Date.now(),
            relations: [],
            consolidated: false,
            decay: 1.0,
            activationLevel: 0,
            emotionalValence: 0,
            contextSignature: '',
          };
          addMemory(entry);
          try {
            const allMems = await loadMemories();
            const existingLinks = await loadAssociativeLinks();
            const newLinks = buildAssociativeLinks(entry, allMems, existingLinks);
            if (newLinks.length > 0)
              await saveAssociativeLinks([...existingLinks, ...newLinks]);
            scheduleAssociativeLinkPruning();
          } catch (e) {
            console.log('[NEXUS] Auto-link error', e);
          }
        }
        extractionRef.current = false;
      })
      .catch(() => {
        extractionRef.current = false;
      });
  }, [messages, addMemory, minMessages]);
}
