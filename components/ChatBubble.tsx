import React, { memo, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Linking,
  Image,
  TouchableOpacity,
} from "react-native";
import Markdown from "react-native-markdown-display";
import Colors from "@/constants/colors";
import { getDisplayHost, getSafeExternalUrl } from "@/utils/urlSafety";

interface ChatBubbleProps {
  role: "user" | "assistant";
  text: string;
}

function openExternalLink(rawUrl?: string | null) {
  if (!rawUrl || typeof rawUrl !== "string") {
    Alert.alert("Blocked link", "Invalid or missing URL.");
    return;
  }
  const safeUrl = getSafeExternalUrl(rawUrl);
  if (!safeUrl) {
    Alert.alert("Blocked link", "Only valid HTTPS links can be opened.");
    return;
  }

  Alert.alert("Open external link?", safeUrl, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Open",
      onPress: () => {
        Linking.openURL(safeUrl).catch(() => {
          Alert.alert("Unable to open link", "Please try again later.");
        });
      },
    },
  ]);
}

function SafeRemoteImage({ url }: { url: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const safeUrl = getSafeExternalUrl(url);
  if (!safeUrl) {
    return (
      <Text style={styles.blockedImage}>
        Blocked image URL for safety. HTTPS required.
      </Text>
    );
  }

  return (
    <View style={styles.imageWrap}>
      <Image
        source={{ uri: safeUrl }}
        style={styles.image}
        resizeMode="cover"
        onLoadStart={() => {
          setHasError(false);
          setIsLoading(true);
        }}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
      {isLoading ? (
        <Text style={styles.imageStatus}>Loading image…</Text>
      ) : null}
      {hasError ? (
        <Text style={styles.blockedImage}>Image failed to load.</Text>
      ) : null}
      <TouchableOpacity onPress={() => openExternalLink(safeUrl)}>
        <Text style={styles.imageCaption}>{getDisplayHost(safeUrl)}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ChatBubble({ role, text }: ChatBubbleProps) {
  const isUser = role === "user";
  const markdownText = useMemo(() => text || "", [text]);

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Markdown
          style={markdownStyles}
          rules={{
            link: (node, children, parent, styles) => (
              <Text
                key={node.key}
                style={styles.link}
                onPress={() => {
                  const href = node.attributes?.href;
                  if (typeof href === "string") {
                    openExternalLink(href);
                  } else {
                    Alert.alert("Blocked link", "Invalid or missing URL.");
                  }
                }}
              >
                {children}
              </Text>
            ),
            image: (node) => {
                const src = node.attributes?.src;
                return typeof src === "string" ? (
                  <SafeRemoteImage key={node.key} url={src} />
                ) : (
                  <Text key={node.key} style={markdownStyles.link}>
                    Blocked image URL for safety. HTTPS required.
                  </Text>
                );
              },
          }}
        >
          {markdownText}
        </Markdown>
      </View>
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: Colors.dark.text, fontSize: 15, lineHeight: 22 },
  text: { color: Colors.dark.text },
  heading1: { color: Colors.dark.text, fontWeight: "700" },
  heading2: { color: Colors.dark.text, fontWeight: "700" },
  heading3: { color: Colors.dark.text, fontWeight: "700" },
  code_inline: {
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    color: "#E2E8F0",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    color: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
  },
  fence: {
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    color: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
  },
  link: { color: "#7DD3FC", textDecorationLine: "underline" },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  table: { borderWidth: 1, borderColor: "#334155" },
  th: { borderWidth: 1, borderColor: "#334155", padding: 6 },
  td: { borderWidth: 1, borderColor: "#334155", padding: 6 },
});

const styles = StyleSheet.create({
  imageStatus: { marginTop: 6, fontSize: 12, color: "#CBD5E1" },
  row: { paddingHorizontal: 12, marginVertical: 4 },
  userRow: { alignItems: "flex-end" },
  assistantRow: { alignItems: "flex-start" },
  bubble: { maxWidth: "92%", borderRadius: 16, padding: 12 },
  userBubble: { backgroundColor: Colors.dark.userBubble },
  assistantBubble: { backgroundColor: "#1E293B" },
  imageWrap: { marginVertical: 6 },
  image: {
    width: 240,
    height: 160,
    borderRadius: 12,
    backgroundColor: "#0F172A",
  },
  imageCaption: { marginTop: 6, fontSize: 12, color: "#93C5FD" },
  blockedImage: { color: "#FCA5A5", fontSize: 12 },
});

export default memo(
  ChatBubble,
  (prev, next) => prev.role === next.role && prev.text === next.text,
);
