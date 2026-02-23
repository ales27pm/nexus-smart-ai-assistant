import { Stack } from "expo-router";
import { TouchableOpacity, StyleSheet } from "react-native";
import { SquarePen } from "lucide-react-native";
import Colors from "@/constants/colors";
import { useConversations } from "@/providers/ConversationsProvider";
import * as Haptics from "expo-haptics";

export default function ChatLayout() {
  const { startNewChat } = useConversations();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.dark.surface },
        headerTintColor: Colors.dark.text,
        headerTitleStyle: { fontWeight: "700" as const, fontSize: 16 },
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "NEXUS",
          headerTitleStyle: {
            fontWeight: "800" as const,
            fontSize: 16,
            color: Colors.dark.accent,
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                startNewChat();
              }}
              style={styles.newChatBtn}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="new-chat-button"
            >
              <SquarePen size={20} color={Colors.dark.accent} />
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  newChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.accentGlow,
    alignItems: "center",
    justifyContent: "center",
  },
});
