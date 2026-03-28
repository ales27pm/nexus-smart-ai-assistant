import { Platform } from "react-native";

export const Typography = {
  display: Platform.select({
    ios: "System",
    android: "sans-serif-medium",
    default: "system-ui",
  }),
  serifDisplay: Platform.select({
    ios: "Times New Roman",
    android: "serif",
    default: "ui-serif",
  }),
  body: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "system-ui",
  }),
} as const;
