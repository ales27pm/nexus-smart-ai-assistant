import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Modal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.background,
  },
  text: {
    color: Colors.dark.text,
    fontSize: 18,
  },
});
