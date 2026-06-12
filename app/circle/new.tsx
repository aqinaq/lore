import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export default function NewCircleScreen() {
  const { session } = useAuth();
  const [name, setName]           = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  }

  async function uploadAvatar(circleId: string): Promise<string | null> {
    if (!avatarUri) return null;
    const ext  = avatarUri.split('.').pop() ?? 'jpg';
    const path = `${session!.user.id}/${circleId}.${ext}`;

    const response = await fetch(avatarUri);
    const blob     = await response.blob();

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });

    if (error) return null;

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }

  async function create() {
    setError('');
    if (name.trim().length < 2) { setError('Circle name must be at least 2 characters.'); return; }

    setLoading(true);
    const circleId      = randomUUID();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const avatarUrl     = await uploadAvatar(circleId);

    const { error: circleError } = await supabase.from('circles').insert({
      id: circleId,
      name: name.trim(),
      avatar_url: avatarUrl,
      invite_code: randomCode(),
      invite_expires: inviteExpires,
      created_by: session!.user.id,
      member_count: 1,
    });

    if (circleError) { setError(circleError.message); setLoading(false); return; }

    const { error: memberError } = await supabase.from('circle_members').insert({
      circle_id: circleId,
      user_id: session!.user.id,
      role: 'admin',
    });

    setLoading(false);
    if (memberError) { setError(memberError.message); return; }
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.title}>New circle</Text>
        <Text style={styles.subtitle}>A private group of up to 20 people.</Text>

        {/* Avatar picker */}
        <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>📷</Text>
              <Text style={styles.avatarPlaceholderLabel}>Add photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="Circle name"
          placeholderTextColor="#999"
          autoCapitalize="words"
          value={name}
          onChangeText={(t) => { setName(t); setError(''); }}
          onSubmitEditing={create}
          returnKeyType="done"
          autoFocus
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={create}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 32, paddingTop: 56, gap: 16, alignItems: 'center' },
  cancel: { color: '#555', fontSize: 16, alignSelf: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700', alignSelf: 'flex-start' },
  subtitle: { fontSize: 15, color: '#666', alignSelf: 'flex-start', marginBottom: 8 },
  avatarPicker: { marginVertical: 8 },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  avatarPlaceholderText: { fontSize: 28 },
  avatarPlaceholderLabel: { fontSize: 11, color: '#999' },
  input: {
    width: '100%', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 18,
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 14, alignSelf: 'flex-start' },
  button: {
    width: '100%', backgroundColor: '#000', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
