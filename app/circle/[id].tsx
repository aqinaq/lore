import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Image, Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, Database } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

type Circle = Database['public']['Tables']['circles']['Row'] & { avatar_url?: string | null };
type Member = Database['public']['Tables']['circle_members']['Row'] & {
  user: { display_name: string; avatar_url: string | null } | null;
};

function Avatar({ uri, name, size = 48 }: { uri?: string | null; name: string; size?: number }) {
  const letters = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  );
}

export default function CircleSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [circle, setCircle]   = useState<Circle | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('circles').select('*').eq('id', id).single(),
      supabase.from('circle_members')
        .select('*, user:users(display_name, avatar_url)')
        .eq('circle_id', id),
    ]);
    setCircle(c as Circle);
    setMembers((m as unknown as Member[]) ?? []);
    setIsAdmin((m ?? []).some(
      (row: { user_id: string; role: string }) =>
        row.user_id === session!.user.id && row.role === 'admin'
    ));
    setLoading(false);
  }

  async function copyCode() {
    if (!circle) return;
    await Clipboard.setStringAsync(circle.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerateCode() {
    if (!circle) return;
    const code    = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('circles')
      .update({ invite_code: code, invite_expires: expires })
      .eq('id', id)
      .select()
      .single();
    if (data) setCircle(data as Circle);
  }

  async function changeAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !circle) return;

    const uri  = result.assets[0].uri;
    const ext  = uri.split('.').pop() ?? 'jpg';
    const path = `${session!.user.id}/${circle.id}.${ext}`;

    const blob = await (await fetch(uri)).blob();
    await supabase.storage.from('avatars').upload(path, blob, { upsert: true });
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    const { data } = await supabase
      .from('circles')
      .update({ avatar_url: publicUrl })
      .eq('id', id)
      .select()
      .single();
    if (data) setCircle(data as Circle);
  }

  async function leaveCircle() {
    await supabase.from('circle_members')
      .delete()
      .eq('circle_id', id)
      .eq('user_id', session!.user.id);
    router.replace('/(tabs)/stream');
  }

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!circle)  return <View style={styles.center}><Text>Circle not found.</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Avatar + name */}
      <View style={styles.heroSection}>
        <TouchableOpacity onPress={isAdmin ? changeAvatar : undefined} style={styles.avatarWrap}>
          <Avatar uri={(circle as any).avatar_url} name={circle.name} size={88} />
          {isAdmin && <View style={styles.editBadge}><Text style={styles.editBadgeText}>✏️</Text></View>}
        </TouchableOpacity>
        <Text style={styles.circleName}>{circle.name}</Text>
        <Text style={styles.memberCount}>{circle.member_count} member{circle.member_count !== 1 ? 's' : ''}</Text>
      </View>

      {/* Invite code */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite code</Text>
        <View style={styles.codeRow}>
          <Text style={styles.code}>{circle.invite_code}</Text>
          <TouchableOpacity style={styles.codeBtn} onPress={copyCode}>
            <Text style={styles.codeBtnText}>{copied ? '✓ Copied' : 'Copy'}</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={[styles.codeBtn, styles.codeBtnSecondary]} onPress={regenerateCode}>
              <Text style={styles.codeBtnTextSecondary}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.codeExpiry}>
          Expires {new Date(circle.invite_expires).toLocaleDateString()}
        </Text>
      </View>

      {/* Members */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {members.map(m => (
          <View key={m.user_id} style={styles.memberRow}>
            <Avatar uri={m.user?.avatar_url} name={m.user?.display_name ?? '?'} size={40} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.user?.display_name ?? 'Unknown'}</Text>
              {m.role === 'admin' && <Text style={styles.adminBadge}>admin</Text>}
            </View>
          </View>
        ))}
      </View>

      {/* Danger zone */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.leaveBtn} onPress={leaveCircle}>
          <Text style={styles.leaveBtnText}>Leave circle</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
  back: { fontSize: 16, color: '#555' },
  heroSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatarWrap: { position: 'relative' },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#fff', borderRadius: 12, padding: 2,
    borderWidth: 1, borderColor: '#eee',
  },
  editBadgeText: { fontSize: 12 },
  circleName: { fontSize: 24, fontWeight: '700' },
  memberCount: { fontSize: 14, color: '#888' },
  section: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { flex: 1, fontSize: 28, fontWeight: '700', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeBtn: {
    backgroundColor: '#000', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  codeBtnSecondary: { backgroundColor: '#f0f0f0' },
  codeBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  codeBtnTextSecondary: { color: '#333', fontWeight: '600', fontSize: 14 },
  codeExpiry: { fontSize: 12, color: '#aaa', marginTop: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 16, fontWeight: '500' },
  adminBadge: {
    fontSize: 11, fontWeight: '600', color: '#666',
    backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  avatarFallback: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  leaveBtn: {
    borderWidth: 1.5, borderColor: '#e53e3e', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  leaveBtnText: { color: '#e53e3e', fontSize: 16, fontWeight: '600' },
});
