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
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function verify() {
    setError('');
    if (token.length !== 6) {
      setError('Enter the 6-digit code sent to your email.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    setLoading(false);

    if (authError) setError(authError.message);
    // On success auth state fires → root layout guard redirects
  }

  async function resend() {
    setError('');
    setResent(false);
    const { error: authError } = await supabase.auth.signInWithOtp({ email });
    if (authError) setError(authError.message);
    else setResent(true);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="000000"
          placeholderTextColor="#bbb"
          keyboardType="number-pad"
          maxLength={6}
          value={token}
          onChangeText={(t) => { setToken(t); setError(''); }}
          onSubmitEditing={verify}
          returnKeyType="done"
          textAlign="center"
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {resent && <Text style={styles.successText}>Code resent — check your inbox.</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={verify}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Verify</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={resend}>
          <Text style={styles.resend}>Resend code</Text>
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
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#555', lineHeight: 22 },
  emailText: { fontWeight: '600', color: '#000' },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 18,
    fontSize: 32,
    letterSpacing: 12,
    fontVariant: ['tabular-nums'],
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 14 },
  successText: { color: '#38a169', fontSize: 14 },
  button: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resend: { textAlign: 'center', color: '#555', textDecorationLine: 'underline' },
});
