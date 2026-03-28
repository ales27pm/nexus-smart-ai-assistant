import React from "react";
import { StyleSheet, View } from "react-native";

export function EmptyStateBackground() {
  return (
    <View style={styles.background} pointerEvents="none">
      <View style={styles.atmosphereTop} />
      <View style={styles.atmosphereBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  atmosphereTop: {
    position: "absolute",
    top: -180,
    left: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
  },
  atmosphereBottom: {
    position: "absolute",
    right: -130,
    bottom: -220,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(251, 191, 36, 0.16)",
  },
});
