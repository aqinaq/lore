import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.title}>lore</Text>
        <Text style={styles.tagline}>your circle, your moments.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={() => router.push({ pathname: '/(auth)/email', params: { mode: 'signup' } })}>
          <Text style={styles.buttonPrimaryText}>Create account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => router.push({ pathname: '/(auth)/email', params: { mode: 'signin' } })}>
          <Text style={styles.buttonSecondaryText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingBottom: 56,
  },
  top: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 18,
    color: '#777',
    marginTop: 8,
  },
  actions: {
    gap: 12,
  },
  buttonPrimary: {
    backgroundColor: '#000',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  buttonSecondary: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '500',
  },
});
