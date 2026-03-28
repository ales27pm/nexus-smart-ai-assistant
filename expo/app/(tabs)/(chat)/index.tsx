import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import {
  RefreshCw,
  X,
  Menu,
  Orbit,
  Search,
  SquarePen,
  ChevronRight,
  Sparkles,
} from "lucide-react-native";
import Colors from "../../../constants/colors";
import ChatBubble from "@/components/ChatBubble";
import ToolCard from "@/components/ToolCard";
import ChatInput, { ChatFile } from "@/components/ChatInput";
import VoiceMode from "@/components/VoiceMode";
import { useConversations } from "@/providers/ConversationsProvider";
import { useLlama } from "@/providers/LlamaProvider";
import { useLlamaChat, ChatMessage } from "@/hooks/useLlamaChat";
import { loadMessages } from "@/utils/conversations";
import { conversationPersistenceService } from "@/utils/conversationPersistence";
import { loadMemories, generateId } from "@/utils/memory";
import { getEnhancedSystemPrompt } from "@/utils/context";
import { createAgentTools } from "@/utils/tools";
import { useMemoryExtraction } from "@/hooks/useMemoryExtraction";

function TypingIndicator() {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              {
                opacity: dot,
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0.3, 1],
                      outputRange: [0, -4],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const {
    activeId,
    setActiveId,
    upsertConversation,
    addMemory,
    conversations,
    startNewChat,
  } = useConversations();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const { config } = useLlama();
  const convIdRef = useRef<string>(activeId ?? generateId());
  const hasLoadedRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const messagesCountRef = useRef(0);

  useEffect(() => {
    if (!activeId) {
      const newId = generateId();
      convIdRef.current = newId;
      setActiveId(newId);
    }
  }, [activeId, setActiveId]);

  const tools = useMemo(
    () =>
      createAgentTools({
        addMemory,
        getMessageCount: () => messagesCountRef.current,
      }),
    [addMemory],
  );

  const [dismissed, setDismissed] = useState(false);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [isAgentResponding, setIsAgentResponding] = useState(false);
  const lastAssistantLenRef = useRef(0);
  const respondingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, sendMessage, setMessages, error } = useLlamaChat(config, {
    tools,
  });

  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (error) {
      setDismissed(false);
      setIsAgentResponding(false);
    }
  }, [error]);

  useEffect(() => {
    if (!isAgentResponding || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    const hasActiveTool = last.parts?.some(
      (p) =>
        p.type === "tool" &&
        (p.state === "input-streaming" || p.state === "input-available"),
    );
    if (hasActiveTool) {
      if (respondingTimerRef.current) clearTimeout(respondingTimerRef.current);
      return;
    }
    const textLen =
      last.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("").length ?? 0;
    if (textLen !== lastAssistantLenRef.current) {
      lastAssistantLenRef.current = textLen;
      if (respondingTimerRef.current) clearTimeout(respondingTimerRef.current);
      respondingTimerRef.current = setTimeout(() => {
        console.log("[NEXUS] Agent response stabilized, marking done");
        setIsAgentResponding(false);
        lastAssistantLenRef.current = 0;
      }, 1200);
    }
  }, [messages, isAgentResponding]);

  useEffect(() => {
    if (activeId && activeId !== convIdRef.current) {
      convIdRef.current = activeId;
      hasLoadedRef.current = false;
      void loadMessages(activeId).then((msgs) => {
        if (msgs && msgs.length > 0) {
          setMessages(msgs as ChatMessage[]);
        } else {
          setMessages([] as ChatMessage[]);
        }
        hasLoadedRef.current = true;
      });
    } else if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
    }
  }, [activeId, setMessages]);

  useEffect(() => {
    if (!hasLoadedRef.current || messages.length === 0) return;
    const id = convIdRef.current;
    conversationPersistenceService.schedule({
      conversationId: id,
      messages,
      onPersistMeta: (pendingMessages) => {
        const typedMessages = pendingMessages as ChatMessage[];
        const firstUserMsg = typedMessages.find((m) => m.role === "user");
        const title =
          firstUserMsg?.parts
            ?.find((p) => p.type === "text")
            ?.text?.substring(0, 60) ?? "New Chat";
        const lastMsg = typedMessages[typedMessages.length - 1];
        const lastText =
          lastMsg?.parts
            ?.filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(" ") ?? "";
        upsertConversation({
          id,
          title,
          preview: lastText.substring(0, 100),
          timestamp: Date.now(),
          messageCount: typedMessages.length,
        });
      },
    });
    return () => {
      conversationPersistenceService.flush();
    };
  }, [messages, upsertConversation]);

  useMemoryExtraction({ messages, addMemory });

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages]);

  const handleSend = useCallback(
    async (
      text: string,
      files?: ChatFile[],
      options?: { isVoiceMode?: boolean },
    ) => {
      if (!text.trim() && (!files || files.length === 0)) return;
      console.log(
        "[NEXUS] Sending:",
        text.substring(0, 50),
        files ? `with ${files.length} file(s)` : "",
        options?.isVoiceMode ? "(voice)" : "",
      );
      hasLoadedRef.current = true;
      setIsAgentResponding(true);
      lastAssistantLenRef.current = 0;
      if (respondingTimerRef.current) clearTimeout(respondingTimerRef.current);
      const memories = await loadMemories();
      const systemPrompt = await getEnhancedSystemPrompt(
        memories,
        text,
        messages,
        { isVoiceMode: options?.isVoiceMode },
      );
      const userText = text.trim();
      sendMessage({ text: userText, systemPrompt, files });
    },
    [sendMessage, messages],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      void handleSend(text);
    },
    [handleSend],
  );

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    return (
      <View>
        {item.parts.map((part, i) => {
          if (part.type === "text" && part.text) {
            return (
              <ChatBubble
                key={`${item.id}-${i}`}
                role={item.role as "user" | "assistant"}
                text={part.text}
              />
            );
          }
          if (part.type === "tool" && part.toolName) {
            return (
              <ToolCard
                key={`${item.id}-${i}`}
                toolName={part.toolName}
                state={part.state ?? "pending"}
                input={part.input}
                output={part.output}
              />
            );
          }
          return null;
        })}
      </View>
    );
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const isStreaming = useMemo(() => {
    if (isAgentResponding) return true;
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    if (last.role === "user") return true;
    return last.parts.some(
      (p) =>
        p.type === "tool" &&
        (p.state === "input-streaming" || p.state === "input-available"),
    );
  }, [messages, isAgentResponding]);

  const streamingAssistantText = useMemo(() => {
    if (messages.length === 0) return "";
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return "";
    return (
      last.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? ""
    );
  }, [messages]);

  const lastAssistantText = useMemo(() => {
    if (messages.length === 0) return "";
    const last = messages[messages.length - 1];
    return (
      last?.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? ""
    );
  }, [messages]);

  return (
    <View style={styles.container}>
      <View
        style={[styles.mainSurface, isDesktop && styles.mainSurfaceDesktop]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.circleButton}
            activeOpacity={0.7}
            onPress={() => setDrawerVisible(true)}
          >
            <Menu size={26} color={Colors.light.text} />
          </TouchableOpacity>
          <View style={styles.thinkingPill}>
            <Text style={styles.thinkingText}>Thinking</Text>
          </View>
          <TouchableOpacity style={styles.circleButton} activeOpacity={0.7}>
            <Orbit size={22} color={Colors.light.text} />
          </TouchableOpacity>
        </View>

        {messages.length === 0 ? (
          <View style={styles.emptyShell}>
            <View style={styles.suggestionRail}>
              <Pressable
                style={styles.suggestionCard}
                onPress={() =>
                  handleSuggestion("Crée une illustration pour une boulangerie")
                }
              >
                <Text style={styles.suggestionTitle}>
                  Crée une illustration
                </Text>
                <Text style={styles.suggestionSubtitle}>
                  pour une boulangerie
                </Text>
              </Pressable>
              <Pressable
                style={styles.suggestionCard}
                onPress={() =>
                  handleSuggestion(
                    "Prépare un plan d'entraînement pour faire de la musculation",
                  )
                }
              >
                <Text style={styles.suggestionTitle}>
                  Prépare un plan d'entraînement
                </Text>
                <Text style={styles.suggestionSubtitle}>
                  pour faire de la musculation
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={isStreaming ? <TypingIndicator /> : null}
          />
        )}

        {error && !dismissed && (
          <View style={styles.errorBar}>
            <View style={styles.errorContent}>
              <Text style={styles.errorText}>
                {error.message === "Load failed" ||
                error.message === "Failed to fetch"
                  ? "Connection error — check your network and llama.cpp server"
                  : (error.message ?? "Something went wrong")}
              </Text>
              <View style={styles.errorActions}>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setDismissed(true);
                    const lastUserMsg = [...messages]
                      .reverse()
                      .find((m) => m.role === "user");
                    const lastText = lastUserMsg?.parts?.find(
                      (p) => p.type === "text",
                    )?.text;
                    if (lastText) void handleSend(lastText);
                  }}
                  activeOpacity={0.7}
                >
                  <RefreshCw size={13} color="#fff" />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => setDismissed(true)}
                  activeOpacity={0.7}
                >
                  <X size={13} color={Colors.dark.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <ChatInput
          onSend={handleSend}
          disabled={isStreaming}
          onOpenVoiceMode={() => setVoiceModeVisible(true)}
          appearance="light"
          placeholder="Demander à ChatGPT"
        />
      </View>

      {drawerVisible && (
        <View style={styles.drawerLayer}>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setDrawerVisible(false)}
          />
          <View
            style={[styles.drawerPanel, { width: Math.min(420, width * 0.82) }]}
          >
            <View style={styles.drawerSearch}>
              <Search size={25} color={Colors.light.textSecondary} />
              <Text style={styles.drawerSearchText}>
                Recherchez des clavardages
              </Text>
            </View>
            <View style={styles.drawerActionRow}>
              <SquarePen size={28} color={Colors.light.text} />
              <Text style={styles.drawerActionText}>Nouveau clavardage</Text>
            </View>
            <View style={styles.drawerSectionRow}>
              <Text style={styles.drawerSectionTitle}>Mon contenu</Text>
              <ChevronRight size={22} color={Colors.light.textSecondary} />
            </View>
            <View style={styles.drawerSectionRow}>
              <Text style={styles.drawerSectionTitle}>Gems</Text>
              <ChevronRight size={22} color={Colors.light.textSecondary} />
            </View>
            <View style={styles.gemsList}>
              <View style={styles.gemRow}>
                <Sparkles size={20} color={Colors.light.textSecondary} />
                <Text style={styles.drawerItemText}>Partenaire de codage</Text>
              </View>
              <View style={styles.gemRow}>
                <Sparkles size={20} color={Colors.light.textSecondary} />
                <Text style={styles.drawerItemText}>monGARS</Text>
              </View>
            </View>
            <Text style={styles.drawerSectionTitle}>Clavardages</Text>
            <ScrollView
              style={styles.chatList}
              showsVerticalScrollIndicator={false}
            >
              {conversations.map((conversation) => (
                <Pressable
                  key={conversation.id}
                  style={styles.chatRow}
                  onPress={() => {
                    setActiveId(conversation.id);
                    setDrawerVisible(false);
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chatRowText,
                      conversation.id === activeId && styles.chatRowTextActive,
                    ]}
                  >
                    {conversation.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.newChatCta}
              onPress={() => {
                startNewChat();
                setDrawerVisible(false);
              }}
            >
              <SquarePen size={20} color="#fff" />
              <Text style={styles.newChatCtaText}>Session de clavardage</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <VoiceMode
        visible={voiceModeVisible}
        onClose={() => setVoiceModeVisible(false)}
        onSend={(text) => {
          void handleSend(text, undefined, { isVoiceMode: true });
        }}
        isResponding={isStreaming}
        lastAssistantText={lastAssistantText}
        streamingText={isStreaming ? streamingAssistantText : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  mainSurface: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: Colors.light.background,
  },
  mainSurfaceDesktop: {
    maxWidth: 900,
  },
  topBar: {
    paddingHorizontal: 28,
    paddingTop: 62,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  circleButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thinkingPill: {
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.light.borderSubtle,
  },
  thinkingText: {
    color: Colors.light.accent,
    fontSize: 52 / 2,
    fontWeight: "500" as const,
  },
  emptyShell: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 12,
  },
  suggestionRail: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 28,
  },
  suggestionCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: 24,
    backgroundColor: Colors.light.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  suggestionTitle: {
    fontSize: 23 / 2,
    color: Colors.light.text,
    fontWeight: "700" as const,
  },
  suggestionSubtitle: {
    fontSize: 22 / 2,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  messageList: { paddingTop: 12, paddingBottom: 12, paddingHorizontal: 10 },
  typingWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: "row",
    backgroundColor: Colors.dark.assistantBubble,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 5,
    alignSelf: "flex-start",
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  errorBar: {
    backgroundColor: Colors.dark.errorDim,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  errorText: { color: Colors.dark.error, fontSize: 13, flex: 1 },
  errorActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.error,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "600" as const },
  dismissBtn: { padding: 4 },
  drawerLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: Colors.light.overlay,
  },
  drawerPanel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.light.background,
    paddingTop: 56,
    paddingHorizontal: 18,
    borderRightWidth: 1,
    borderRightColor: Colors.light.borderSubtle,
  },
  drawerSearch: {
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 18,
  },
  drawerSearchText: { fontSize: 19 / 2, color: Colors.light.textSecondary },
  drawerActionRow: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  drawerActionText: {
    fontSize: 21 / 2,
    fontWeight: "700" as const,
    color: Colors.light.text,
  },
  drawerSectionRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  drawerSectionTitle: {
    fontSize: 24 / 2,
    fontWeight: "700" as const,
    color: Colors.light.text,
    marginVertical: 10,
  },
  gemsList: { marginBottom: 12, gap: 6 },
  gemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
  },
  drawerItemText: {
    fontSize: 20 / 2,
    color: Colors.light.textSecondary,
    fontWeight: "500" as const,
  },
  chatList: { flex: 1 },
  chatRow: {
    minHeight: 46,
    justifyContent: "center",
    paddingVertical: 6,
  },
  chatRowText: { color: Colors.light.textSecondary, fontSize: 19 / 2 },
  chatRowTextActive: { color: Colors.light.text, fontWeight: "700" as const },
  newChatCta: {
    alignSelf: "center",
    height: 72,
    minWidth: 300,
    borderRadius: 36,
    backgroundColor: "#1E2025",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 30,
    marginTop: 10,
    paddingHorizontal: 24,
  },
  newChatCtaText: {
    color: "#fff",
    fontSize: 21 / 2,
    fontWeight: "700" as const,
  },
});
