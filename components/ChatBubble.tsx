import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  text: string;
}

export default React.memo(function ChatBubble({ role, text }: ChatBubbleProps) {
  const isUser = role === 'user';

  const hasCodeBlock = text.includes('```');
  const hasList = /^\s*[-•*]\s/m.test(text) || /^\s*\d+\.\s/m.test(text);

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {!isUser && (hasCodeBlock || hasList) ? (
          <FormattedText text={text} />
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

function FormattedText({ text }: { text: string }) {
  const segments = text.split(/(```[\s\S]*?```)/g);

  return (
    <View>
      {segments.map((segment, i) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx > 0 ? inner.substring(0, newlineIdx).trim() : '';
          const code = newlineIdx > 0 ? inner.substring(newlineIdx + 1) : inner;

          return (
            <View key={i} style={styles.codeBlock}>
              {lang ? <Text style={styles.codeLang}>{lang}</Text> : null}
              <Text style={styles.codeText} selectable>{code.trim()}</Text>
            </View>
          );
        }

        if (!segment.trim()) return null;

        return (
          <Text key={i} style={styles.textAssistant} selectable>
            {segment}
          </Text>
        );
      })}
    </View>
  );
}

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
    fontFamily: 'monospace',
  },
});
