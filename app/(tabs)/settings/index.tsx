import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import {
  Brain,
  MessageSquare,
  Info,
  ChevronRight,
  Server,
  Wifi,
  WifiOff,
  Thermometer,
  Hash,
  RotateCw,
  Cpu,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "../../../constants/colors";
import { useConversations } from "@/providers/ConversationsProvider";
import { useLlama } from "@/providers/LlamaProvider";

function SettingsRow({
  icon: Icon,
  iconColor,
  label,
  detail,
  onPress,
  destructive,
  rightElement,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  detail?: string;
  onPress?: () => void;
  destructive?: boolean;
  rightElement?: React.ReactNode;
}) {
  const content = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: iconColor + "15" }]}>
        <Icon size={16} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text
          style={[styles.rowLabel, destructive && { color: Colors.dark.error }]}
        >
          {label}
        </Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {rightElement ?? <ChevronRight size={16} color={Colors.dark.textTertiary} />}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const decrease = () => {
    const next = Math.max(min, value - step);
    onChange(parseFloat(next.toFixed(2)));
    void Haptics.selectionAsync();
  };
  const increase = () => {
    const next = Math.min(max, value + step);
    onChange(parseFloat(next.toFixed(2)));
    void Haptics.selectionAsync();
  };

  return (
    <View style={styles.paramRow}>
      <Text style={styles.paramLabel}>{label}</Text>
      <View style={styles.paramControls}>
        <TouchableOpacity style={styles.paramBtn} onPress={decrease} activeOpacity={0.6}>
          <Text style={styles.paramBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.paramValue}>{value}</Text>
        <TouchableOpacity style={styles.paramBtn} onPress={increase} activeOpacity={0.6}>
          <Text style={styles.paramBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { conversations, memories, clearConversations, clearMemories } =
    useConversations();
  const { config, isConnected, isCheckingHealth, updateConfig, checkHealth } =
    useLlama();
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(config.serverUrl);

  const handleClearHistory = useCallback(() => {
    if (conversations.length === 0) {
      Alert.alert("No History", "There are no conversations to clear.");
      return;
    }
    Alert.alert(
      "Clear All History",
      `Delete all ${conversations.length} conversations? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearConversations();
          },
        },
      ],
    );
  }, [conversations.length, clearConversations]);

  const handleClearMemories = useCallback(() => {
    if (memories.length === 0) {
      Alert.alert("No Memories", "The memory bank is already empty.");
      return;
    }
    Alert.alert(
      "Erase Memory Bank",
      `Delete all ${memories.length} stored memories? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Erase All",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearMemories();
          },
        },
      ],
    );
  }, [memories.length, clearMemories]);

  const handleSaveUrl = useCallback(() => {
    const trimmed = urlDraft.trim().replace(/\/+$/, '');
    if (!trimmed) return;
    updateConfig({ serverUrl: trimmed });
    setEditingUrl(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => checkHealth(trimmed), 500);
  }, [urlDraft, updateConfig, checkHealth]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LLAMA.CPP SERVER</Text>
        <View style={styles.card}>
          <SettingsRow
            icon={isConnected ? Wifi : WifiOff}
            iconColor={isConnected ? Colors.dark.accent : Colors.dark.error}
            label="Server Status"
            detail={isConnected ? "Connected" : "Disconnected"}
            rightElement={
              isCheckingHealth ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : (
                <TouchableOpacity
                  onPress={() => checkHealth()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <RotateCw size={16} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
              )
            }
          />
          <View style={styles.separator} />
          {editingUrl ? (
            <View style={styles.urlEditRow}>
              <View style={[styles.rowIcon, { backgroundColor: Colors.dark.info + "15" }]}>
                <Server size={16} color={Colors.dark.info} />
              </View>
              <TextInput
                style={styles.urlInput}
                value={urlDraft}
                onChangeText={setUrlDraft}
                placeholder="http://localhost:8080"
                placeholderTextColor={Colors.dark.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleSaveUrl}
                autoFocus
                testID="server-url-input"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl} activeOpacity={0.7}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SettingsRow
              icon={Server}
              iconColor={Colors.dark.info}
              label="Server URL"
              detail={config.serverUrl}
              onPress={() => {
                setUrlDraft(config.serverUrl);
                setEditingUrl(true);
              }}
            />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MODEL PARAMETERS</Text>
        <View style={styles.card}>
          <View style={styles.paramSection}>
            <View style={styles.paramHeader}>
              <Thermometer size={13} color={Colors.dark.toolAnalysis} />
              <Text style={styles.paramHeaderText}>Temperature</Text>
            </View>
            <ParamSlider
              label="Creativity"
              value={config.temperature}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => updateConfig({ temperature: v })}
            />
          </View>
          <View style={styles.separator} />
          <View style={styles.paramSection}>
            <View style={styles.paramHeader}>
              <Cpu size={13} color={Colors.dark.cyan} />
              <Text style={styles.paramHeaderText}>Top P</Text>
            </View>
            <ParamSlider
              label="Nucleus sampling"
              value={config.topP}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => updateConfig({ topP: v })}
            />
          </View>
          <View style={styles.separator} />
          <View style={styles.paramSection}>
            <View style={styles.paramHeader}>
              <Hash size={13} color={Colors.dark.purple} />
              <Text style={styles.paramHeaderText}>Max Tokens</Text>
            </View>
            <ParamSlider
              label="Response length"
              value={config.maxTokens}
              min={256}
              max={8192}
              step={256}
              onChange={(v) => updateConfig({ maxTokens: v })}
            />
          </View>
          <View style={styles.separator} />
          <View style={styles.paramSection}>
            <View style={styles.paramHeader}>
              <RotateCw size={13} color={Colors.dark.rose} />
              <Text style={styles.paramHeaderText}>Repeat Penalty</Text>
            </View>
            <ParamSlider
              label="Repetition control"
              value={config.repeatPenalty}
              min={1}
              max={2}
              step={0.05}
              onChange={(v) => updateConfig({ repeatPenalty: v })}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DATA</Text>
        <View style={styles.card}>
          <SettingsRow
            icon={MessageSquare}
            iconColor={Colors.dark.accent}
            label="Clear Conversation History"
            detail={`${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`}
            onPress={handleClearHistory}
            destructive
          />
          <View style={styles.separator} />
          <SettingsRow
            icon={Brain}
            iconColor={Colors.dark.purple}
            label="Erase Memory Bank"
            detail={`${memories.length} memor${memories.length !== 1 ? "ies" : "y"}`}
            onPress={handleClearMemories}
            destructive
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Info size={14} color={Colors.dark.textTertiary} />
            <Text style={styles.aboutText}>NEXUS — Powered by llama.cpp</Text>
          </View>
          <Text style={styles.aboutDetail}>
            Local-first AI assistant using llama.cpp for inference. Features persistent
            memory, semantic search, tool orchestration, and streaming responses.
          </Text>
          <View style={styles.aboutChips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>llama.cpp</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Local Inference</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>TF-IDF Memory</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Tool Calling</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Streaming</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "500" as const,
  },
  rowDetail: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.dark.borderSubtle,
    marginLeft: 60,
  },
  urlEditRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  urlInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  saveBtn: {
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  paramSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  paramHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  paramHeaderText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  paramRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paramLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
  },
  paramControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paramBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  paramBtnText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  paramValue: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600" as const,
    minWidth: 48,
    textAlign: "center" as const,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  aboutText: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  aboutDetail: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  aboutChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  chip: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  chipText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "500" as const,
  },
});
