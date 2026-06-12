import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Image, TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, Database } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

type Circle = Database['public']['Tables']['circles']['Row'];
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
  const [circle,       setCircle]       = useState<Circle | null>(null);
  const [members,      setMembers]      = useState<Member[]>([]);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [copied,       setCopied]       = useState(false);

  // Rename state
  const [renaming,     setRenaming]     = useState(false);
  const [newName,      setNewName]      = useState('');
  const [savingName,   setSavingName]   = useState(false);

  // Description state
  const [editingDesc,  setEditingDesc]  = useState(false);
  const [newDesc,      setNewDesc]      = useState('');
  const [savingDesc,   setSavingDesc]   = useState(false);

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
      .eq('id', id).select().single();
    if (data) setCircle(data as Circle);
  }

  async function changeAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !circle) return;
    const uri  = result.assets[0].uri;
    const ext  = uri.split('.').pop() ?? 'jpg';
    const path = `${session!.user.id}/${circle.id}.${ext}`;
    const blob = await (await fetch(uri)).blob();
    await supabase.storage.from('avatars').upload(path, blob, { upsert: true });
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { data } = await supabase.from('circles').update({ avatar_url: publicUrl })
      .eq('id', id).select().single();
    if (data) setCircle(data as Circle);
  }

  async function renameCircle() {
    if (!newName.trim() || !circle) return;
    setSavingName(true);
    const { data } = await supabase.from('circles')
      .update({ name: newName.trim() })
      .eq('id', id).select().single();
    if (data) setCircle(data as Circle);
    setRenaming(false);
    setSavingName(false);
  }

  async function saveDescription() {
    if (!circle) return;
    setSavingDesc(true);
    const { data } = await supabase.from('circles')
      .update({ description: newDesc.trim() || null })
      .eq('id', id).select().single();
    if (data) setCircle(data as Circle);
    setEditingDesc(false);
    setSavingDesc(false);
  }

  async function leaveCircle() {
    await supabase.from('circle_members')
      .delete().eq('circle_id', id).eq('user_id', session!.user.id);
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

      {/* Avatar + name + member count */}
      <View style={styles.heroSection}>
        <TouchableOpacity onPress={isAdmin ? changeAvatar : undefined} style={styles.avatarWrap}>
          <Avatar uri={circle.avatar_url} name={circle.name} size={88} />
          {isAdmin && <View style={styles.editBadge}><Text style={styles.editBadgeText}>✏️</Text></View>}
        </TouchableOpacity>
        <Text style={styles.circleName}>{circle.name}</Text>
        <Text style={styles.memberCount}>{circle.member_count} member{circle.member_count !== 1 ? 's' : ''}</Text>
      </View>

      {/* Description */}
      {(isAdmin || circle.description) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          {editingDesc ? (
            <View style={styles.editBlock}>
              <TextInput
                style={styles.descInput}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                placeholder="What's this circle about?"
                placeholderTextColor="#bbb"
                autoFocus
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, savingDesc && styles.actionBtnDisabled]}
                  onPress={saveDescription}
                  disabled={savingDesc}>
                  <Text style={styles.actionBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingDesc(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={isAdmin ? () => { setNewDesc(circle.description ?? ''); setEditingDesc(true); } : undefined}
              activeOpacity={isAdmin ? 0.6 : 1}>
              {circle.description
                ? <Text style={styles.descText}>{circle.description}</Text>
                : <Text style={styles.descPlaceholder}>Tap to add a description…</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Admin: rename */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Circle name</Text>
          {renaming ? (
            <View style={styles.editBlock}>
              <TextInput
                style={styles.nameInput}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={renameCircle}
                placeholder={circle.name}
                placeholderTextColor="#bbb"
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, savingName && styles.actionBtnDisabled]}
                  onPress={renameCircle}
                  disabled={savingName}>
                  <Text style={styles.actionBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRenaming(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.renameBtn}
              onPress={() => { setNewName(circle.name); setRenaming(true); }}>
              <Text style={styles.renameBtnText}>Rename circle</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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
  container:   { flex: 1, backgroundColor: '#fff' },
  content:     { paddingBottom: 60 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
  back:        { fontSize: 16, color: '#555' },
  heroSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatarWrap:  { position: 'relative' },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#fff', borderRadius: 12, padding: 2,
    borderWidth: 1, borderColor: '#eee',
  },
  editBadgeText: { fontSize: 12 },
  circleName:  { fontSize: 24, fontWeight: '700' },
  memberCount: { fontSize: 14, color: '#888' },

  section:      { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },

  // Description
  descText:        { fontSize: 15, color: '#333', lineHeight: 22 },
  descPlaceholder: { fontSize: 15, color: '#bbb' },
  descInput: {
    fontSize: 15, color: '#111', lineHeight: 22,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 12, minHeight: 80, textAlignVertical: 'top',
  },

  // Rename
  renameBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1.5, borderColor: '#000', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  renameBtnText: { fontSize: 15, fontWeight: '600', color: '#000' },
  nameInput: {
    fontSize: 17, fontWeight: '600', color: '#111',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  // Shared edit UI
  editBlock:   { gap: 10 },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionBtn: {
    backgroundColor: '#000', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  actionBtnDisabled: { backgroundColor: '#999' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelText:    { fontSize: 14, color: '#888', fontWeight: '500' },

  // Invite code
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { flex: 1, fontSize: 28, fontWeight: '700', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeBtn: {
    backgroundColor: '#000', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  codeBtnSecondary:    { backgroundColor: '#f0f0f0' },
  codeBtnText:         { color: '#fff', fontWeight: '600', fontSize: 14 },
  codeBtnTextSecondary:{ color: '#333', fontWeight: '600', fontSize: 14 },
  codeExpiry:          { fontSize: 12, color: '#aaa', marginTop: 6 },

  // Members
  memberRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 16, fontWeight: '500' },
  adminBadge: {
    fontSize: 11, fontWeight: '600', color: '#666',
    backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  avatarFallback: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },

  // Leave
  leaveBtn:     { borderWidth: 1.5, borderColor: '#e53e3e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  leaveBtnText: { color: '#e53e3e', fontSize: 16, fontWeight: '600' },
});
