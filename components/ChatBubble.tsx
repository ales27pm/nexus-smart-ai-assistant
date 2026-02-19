import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Linking, TouchableOpacity, Platform } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  text: string;
}

interface TextSegment {
  type: 'text' | 'bold' | 'italic' | 'bolditalic' | 'code' | 'link' | 'header' | 'listItem' | 'blockquote';
  content: string;
  url?: string;
  level?: number;
}

interface ParsedBlock {
  type: 'paragraph' | 'code' | 'image' | 'header' | 'listItem' | 'blockquote' | 'divider';
  content: string;
  language?: string;
  level?: number;
  ordered?: boolean;
  index?: number;
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', content: codeLines.join('\n'), language: lang || undefined });
      i++;
      continue;
    }

    if (/^!\[.*?\]\(.*?\)/.test(line)) {
      const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (match) {
        blocks.push({ type: 'image', content: match[2] });
        i++;
        continue;
      }
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      blocks.push({ type: 'header', content: headerMatch[2], level: headerMatch[1].length });
      i++;
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: 'divider', content: '' });
      i++;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*+]\s+(.+)/);
    if (ulMatch) {
      blocks.push({ type: 'listItem', content: ulMatch[1], ordered: false });
      i++;
      continue;
    }

    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (olMatch) {
      blocks.push({ type: 'listItem', content: olMatch[2], ordered: true, index: parseInt(olMatch[1], 10) });
      i++;
      continue;
    }

    const bqMatch = line.match(/^>\s*(.*)/);
    if (bqMatch) {
      blocks.push({ type: 'blockquote', content: bqMatch[1] });
      i++;
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    blocks.push({ type: 'paragraph', content: line });
    i++;
  }

  return blocks;
}

function parseInline(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      segments.push({ type: 'bolditalic', content: match[2] });
    } else if (match[3]) {
      segments.push({ type: 'bold', content: match[3] });
    } else if (match[4]) {
      segments.push({ type: 'italic', content: match[4] });
    } else if (match[5]) {
      segments.push({ type: 'bold', content: match[5] });
    } else if (match[6]) {
      segments.push({ type: 'italic', content: match[6] });
    } else if (match[7]) {
      segments.push({ type: 'code', content: match[7] });
    } else if (match[8] && match[9]) {
      segments.push({ type: 'link', content: match[8], url: match[9] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.length === 0 ? [{ type: 'text', content: text }] : segments;
}

function InlineText({ text, isUser }: { text: string; isUser: boolean }) {
  const segments = useMemo(() => parseInline(text), [text]);
  const baseColor = isUser ? Colors.dark.text : Colors.dark.text;

  return (
    <Text style={{ color: baseColor, fontSize: 15, lineHeight: 22 }} selectable>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold':
            return <Text key={i} style={styles.bold}>{seg.content}</Text>;
          case 'italic':
            return <Text key={i} style={styles.italic}>{seg.content}</Text>;
          case 'bolditalic':
            return <Text key={i} style={styles.boldItalic}>{seg.content}</Text>;
          case 'code':
            return <Text key={i} style={styles.inlineCode}>{seg.content}</Text>;
          case 'link':
            return (
              <Text
                key={i}
                style={styles.link}
                onPress={() => {
                  if (seg.url) Linking.openURL(seg.url).catch(() => {});
                }}
              >
                {seg.content}
              </Text>
            );
          default:
            return <Text key={i}>{seg.content}</Text>;
        }
      })}
    </Text>
  );
}

function RenderedContent({ text, isUser }: { text: string; isUser: boolean }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <View>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'code':
            return (
              <View key={i} style={styles.codeBlock}>
                {block.language ? (
                  <Text style={styles.codeLang}>{block.language}</Text>
                ) : null}
                <Text style={styles.codeText} selectable>{block.content}</Text>
              </View>
            );

          case 'image':
            return (
              <View key={i} style={styles.imageWrap}>
                <Image
                  source={{ uri: block.content }}
                  style={styles.inlineImage}
                  resizeMode="contain"
                />
              </View>
            );

          case 'header':
            const headerSize = block.level === 1 ? 20 : block.level === 2 ? 18 : block.level === 3 ? 16 : 15;
            return (
              <Text
                key={i}
                style={[
                  styles.header,
                  { fontSize: headerSize, marginTop: i > 0 ? 10 : 0 },
                ]}
                selectable
              >
                {block.content}
              </Text>
            );

          case 'listItem':
            const bullet = block.ordered ? `${block.index ?? i + 1}.` : '•';
            return (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listBullet}>{bullet}</Text>
                <View style={styles.listContent}>
                  <InlineText text={block.content} isUser={isUser} />
                </View>
              </View>
            );

          case 'blockquote':
            return (
              <View key={i} style={styles.blockquote}>
                <InlineText text={block.content} isUser={isUser} />
              </View>
            );

          case 'divider':
            return <View key={i} style={styles.divider} />;

          default:
            return (
              <View key={i} style={i > 0 ? styles.paragraphSpacing : undefined}>
                <InlineText text={block.content} isUser={isUser} />
              </View>
            );
        }
      })}
    </View>
  );
}

export default React.memo(function ChatBubble({ role, text }: ChatBubbleProps) {
  const isUser = role === 'user';
  const needsRichRender = !isUser && (/[*_`#\[\]!>-]/.test(text) || /^\s*\d+\.\s/m.test(text));

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {needsRichRender ? (
          <RenderedContent text={text} isUser={isUser} />
        ) : (
          <Text
            style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}
            selectable
          >
            {text}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    marginVertical: 3,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: Colors.dark.userBubble,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.dark.assistantBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  textUser: {
    color: Colors.dark.text,
  },
  textAssistant: {
    color: Colors.dark.text,
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700' as const,
  },
  italic: {
    fontStyle: 'italic' as const,
  },
  boldItalic: {
    fontWeight: '700' as const,
    fontStyle: 'italic' as const,
  },
  inlineCode: {
    backgroundColor: Colors.dark.surface,
    color: Colors.dark.cyan,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  link: {
    color: Colors.dark.info,
    textDecorationLine: 'underline' as const,
  },
  header: {
    color: Colors.dark.text,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  listRow: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingRight: 4,
  },
  listBullet: {
    color: Colors.dark.accent,
    fontSize: 14,
    width: 18,
    fontWeight: '600' as const,
  },
  listContent: {
    flex: 1,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.accent,
    paddingLeft: 10,
    marginVertical: 4,
    opacity: 0.85,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: 8,
  },
  paragraphSpacing: {
    marginTop: 6,
  },
  codeBlock: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  codeLang: {
    fontSize: 10,
    color: Colors.dark.textTertiary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  codeText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.dark.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  imageWrap: {
    marginVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  inlineImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
  },
});
