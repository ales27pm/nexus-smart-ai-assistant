import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { ConversationsProvider } from "@/providers/ConversationsProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Colors from "@/constants/colors";
import { installGlobalErrorHandlers } from "@/utils/globalErrorHandler";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    installGlobalErrorHandlers();
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: Colors.dark.background }}
      >
        <ErrorBoundary>
          <ConversationsProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
          </ConversationsProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
