import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Send, Plus, Mic } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    onSend(trimmed);
    setText('');
  };

  const hasText = text.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.container}>
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6}>
            <Plus size={18} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Ask anything..."
            placeholderTextColor={Colors.dark.textTertiary}
            multiline
            maxLength={4000}
            editable={!disabled}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            testID="chat-input"
          />
          {hasText ? (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={disabled}
                activeOpacity={0.7}
                testID="send-button"
              >
                <Send size={16} color={disabled ? Colors.dark.textTertiary : '#fff'} />
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6}>
              <Mic size={18} color={Colors.dark.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.background,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 4,
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.dark.surfaceHover,
  },
});
