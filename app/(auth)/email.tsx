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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function EmailScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'signin' | 'signup' }>();
  const isSignUp = mode === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit() {
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@')) { setError('Enter a valid email address.'); return; }
    if (password.length < 6)        { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);

    if (isSignUp) {
      const { data, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });
      setLoading(false);
      if (authError) { setError(authError.message); return; }
      if (!data.session) {
        // Email confirmation is on — show waiting screen
        setAwaitingConfirmation(true);
        return;
      }
      // Confirmation off — session created immediately, guard redirects
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      setLoading(false);
      if (authError) setError(authError.message);
      // On success onAuthStateChange fires → guard redirects
    }
  }

  // ── Confirmation waiting screen ──────────────────────────────────────────────
  if (awaitingConfirmation) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.confirmText}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.emailBold}>{email}</Text>
            {'\n\n'}Click the link to activate your account, then come back and sign in.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace({ pathname: '/(auth)/email', params: { mode: 'signin' } })}>
            <Text style={styles.buttonText}>Go to sign in</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setAwaitingConfirmation(false)}>
            <Text style={styles.link}>← Use a different email</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Sign in / Sign up form ───────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{isSignUp ? 'Create account' : 'Welcome back'}</Text>

        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="Email"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(''); }}
          returnKeyType="next"
        />

        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          value={password}
          onChangeText={(t) => { setPassword(t); setError(''); }}
          onSubmitEditing={submit}
          returnKeyType="done"
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{isSignUp ? 'Sign up' : 'Sign in'}</Text>}
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
    paddingTop: 64,
    gap: 16,
  },
  back: { marginBottom: 8 },
  backText: { fontSize: 16, color: '#555' },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 8 },
  confirmText: { fontSize: 16, color: '#444', lineHeight: 26 },
  emailBold: { fontWeight: '700', color: '#000' },
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
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#555', textDecorationLine: 'underline' },
});
