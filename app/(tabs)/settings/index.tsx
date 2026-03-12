import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import {
  Brain,
  MessageSquare,
  Info,
  ChevronRight,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "../../../constants/colors";
import { useConversations } from "@/providers/ConversationsProvider";

function SettingsRow({
  icon: Icon,
  iconColor,
  label,
  detail,
  onPress,
  destructive,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
    >
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
      <ChevronRight size={16} color={Colors.dark.textTertiary} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { conversations, memories, clearConversations, clearMemories } =
    useConversations();

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            <Text style={styles.aboutText}>NEXUS AI Assistant</Text>
          </View>
          <Text style={styles.aboutDetail}>
            Context-aware AI with persistent memory, semantic search, and
            multi-tool orchestration.
          </Text>
          <View style={styles.aboutChips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>TF-IDF Memory</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Auto-Extract</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Voice Mode</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Web Search</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Image Gen</Text>
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
