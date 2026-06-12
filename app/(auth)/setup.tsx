import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function SetupScreen() {
  const { session, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function save() {
    setError('');
    const name = displayName.trim();
    if (name.length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }

    setLoading(true);

    // Upsert so it works whether or not the trigger already created the row
    const { error: dbError } = await supabase
      .from('users')
      .upsert({
        id: session!.user.id,
        display_name: name,
        email_hash: session!.user.email ?? session!.user.id,
      });

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
      return;
    }

    // Refresh profile in context → auth guard will redirect to tabs
    await refreshProfile();
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.title}>What should we{'\n'}call you?</Text>
        <Text style={styles.subtitle}>This is what your circle sees.</Text>

        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="Your name"
          placeholderTextColor="#999"
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          value={displayName}
          onChangeText={(t) => { setDisplayName(t); setError(''); }}
          onSubmitEditing={save}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={save}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Let's go</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    gap: 16,
  },
  title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 14 },
  button: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
