import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function JoinCircleScreen() {
  const { session } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function join() {
    setError('');
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) { setError('Enter a valid invite code.'); return; }

    setLoading(true);

    const { data: circle, error: findError } = await supabase
      .from('circles')
      .select('*')
      .eq('invite_code', trimmed)
      .gt('invite_expires', new Date().toISOString())
      .single();

    if (findError || !circle) {
      setError('Invalid or expired invite code.');
      setLoading(false);
      return;
    }

    if (circle.member_count >= 20) {
      setError('This circle is full (20 members max).');
      setLoading(false);
      return;
    }

    const { error: joinError } = await supabase
      .from('circle_members')
      .insert({ circle_id: circle.id, user_id: session!.user.id, role: 'member' });

    setLoading(false);
    if (joinError) {
      setError(joinError.code === '23505' ? 'You are already in this circle.' : joinError.message);
      return;
    }

    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Join a circle</Text>
        <Text style={styles.subtitle}>Enter the invite code you received.</Text>

        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="XXXXXX"
          placeholderTextColor="#bbb"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={(t) => { setCode(t); setError(''); }}
          onSubmitEditing={join}
          returnKeyType="done"
          textAlign="center"
          maxLength={8}
          autoFocus
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={join}
          disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 32, paddingTop: 56, gap: 16 },
  cancel: { color: '#555', fontSize: 16, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 18, fontSize: 28, letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 14 },
  button: {
    backgroundColor: '#000', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
