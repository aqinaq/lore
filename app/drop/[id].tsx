import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal,
  StatusBar, Dimensions, Pressable,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, Database } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ReactionsRow, EmojiPicker, useReactions, type Reaction } from '@/components/ReactionsRow';

type Drop = Database['public']['Tables']['drops']['Row'] & {
  author:    { display_name: string; avatar_url: string | null } | null;
  reactions: Reaction[];
};
type Reply = Database['public']['Tables']['drop_replies']['Row'] & {
  author: { display_name: string; avatar_url: string | null } | null;
};

const W = Dimensions.get('window').width;

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Avi({ uri, name, size = 36 }: { uri?: string | null; name: string; size?: number }) {
  const letters = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[s.avi, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  );
}

// ─── Drop content renderers (hook-isolated sub-components) ────────────────────

function FullscreenImg({ uri, visible, onClose }: { uri: string; visible: boolean; onClose(): void }) {
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <StatusBar hidden />
      <View style={s.fs}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        <TouchableOpacity style={s.fsClose} onPress={onClose}>
          <Text style={s.fsCloseText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function PhotoDrop({ drop }: { drop: Drop }) {
  const [fs, setFs] = useState(false);
  if (!drop.content_url) return null;
  return (
    <>
      <TouchableOpacity onPress={() => setFs(true)}>
        <Image source={{ uri: drop.content_url }} style={s.dropMedia} resizeMode="cover" />
      </TouchableOpacity>
      <FullscreenImg uri={drop.content_url} visible={fs} onClose={() => setFs(false)} />
    </>
  );
}

function DrawingDrop({ drop }: { drop: Drop }) {
  const [fs, setFs] = useState(false);
  if (!drop.content_url) return null;
  return (
    <>
      <TouchableOpacity onPress={() => setFs(true)}>
        <Image source={{ uri: drop.content_url }} style={[s.dropMedia, { backgroundColor: '#fafafa' }]} resizeMode="cover" />
      </TouchableOpacity>
      <FullscreenImg uri={drop.content_url} visible={fs} onClose={() => setFs(false)} />
    </>
  );
}

function VideoDrop({ drop }: { drop: Drop }) {
  const [fs, setFs] = useState(false);
  const player = useVideoPlayer(drop.content_url, p => { p.loop = true; p.muted = true; });
  if (!drop.content_url) return null;
  return (
    <>
      <TouchableOpacity onPress={() => { player.muted = false; setFs(true); }}>
        <View style={s.dropMedia}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          <View style={s.videoOverlay}>
            <View style={s.videoPlayCircle}>
              <Text style={s.videoPlayIcon}>▶</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
      <Modal visible={fs} animationType="fade" statusBarTranslucent>
        <StatusBar hidden />
        <View style={s.fs}>
          <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls />
          <TouchableOpacity style={s.fsClose} onPress={() => { player.muted = true; setFs(false); }}>
            <Text style={s.fsCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

function VoiceDrop({ drop }: { drop: Drop }) {
  const player = useAudioPlayer({ uri: drop.content_url! });
  const status = useAudioPlayerStatus(player);
  const pct = status.duration > 0 ? status.currentTime / status.duration : 0;
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  if (!drop.content_url) return null;
  return (
    <View style={s.voiceRow}>
      <TouchableOpacity
        style={s.voicePlay}
        onPress={() => status.playing ? player.pause() : player.play()}>
        <Text style={s.voicePlayIcon}>{status.playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={s.voiceTrack}>
        <View style={[s.voiceFill, { width: `${pct * 100}%` as any }]} />
      </View>
      <Text style={s.voiceTime}>
        {fmt(status.currentTime)}{status.duration > 0 ? ` / ${fmt(status.duration)}` : ''}
      </Text>
    </View>
  );
}

// ─── Drop header card ─────────────────────────────────────────────────────────

function DropHeader({ drop, myId }: { drop: Drop; myId: string }) {
  const name = drop.author?.display_name ?? '?';
  const { reactions, react } = useReactions(drop.id, myId, drop.reactions ?? []);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <Pressable
      style={s.dropCard}
      onLongPress={() => setShowPicker(true)}
      delayLongPress={400}>

      <View style={s.authorRow}>
        <Avi uri={drop.author?.avatar_url} name={name} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.authorName}>{name}</Text>
          <Text style={s.authorTime}>{timeAgo(drop.created_at)}</Text>
        </View>
      </View>

      {drop.type === 'text'    && <Text style={s.dropText}>{drop.caption}</Text>}
      {drop.type === 'photo'   && <PhotoDrop   drop={drop} />}
      {drop.type === 'video'   && <VideoDrop   drop={drop} />}
      {drop.type === 'drawing' && <DrawingDrop drop={drop} />}
      {drop.type === 'voice'   && <VoiceDrop   drop={drop} />}

      {drop.type !== 'text' && !!drop.caption && (
        <Text style={s.dropCaption}>{drop.caption}</Text>
      )}

      <ReactionsRow reactions={reactions} myId={myId} onReact={react} />

      <View style={s.replyCountRow}>
        <Text style={s.replyCountText}>
          {drop.reply_count === 0
            ? 'No replies yet'
            : `${drop.reply_count} ${drop.reply_count === 1 ? 'reply' : 'replies'}`}
        </Text>
      </View>

      {showPicker && (
        <EmojiPicker
          onSelect={e => { react(e); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Pressable>
  );
}

// ─── Reply row ────────────────────────────────────────────────────────────────

function ReplyRow({ reply, myId }: { reply: Reply; myId: string }) {
  const name = reply.author?.display_name ?? '?';
  const isMe = reply.author_id === myId;

  async function del() {
    await supabase.from('drop_replies').delete().eq('id', reply.id);
  }

  return (
    <View style={s.replyRow}>
      <Avi uri={reply.author?.avatar_url} name={name} size={32} />
      <View style={s.replyBubble}>
        <View style={s.replyMeta}>
          <Text style={s.replyName}>{name}</Text>
          <Text style={s.replyTime}>{timeAgo(reply.created_at)}</Text>
          {isMe && (
            <TouchableOpacity onPress={del} style={{ marginLeft: 'auto' }}>
              <Text style={s.replyDelete}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.replyText}>{reply.content}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DropDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const [drop,    setDrop]    = useState<Drop | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    loadAll();
    return () => { channelRef.current?.unsubscribe(); };
  }, [id]);

  async function loadAll() {
    const [{ data: d }, { data: r }] = await Promise.all([
      supabase
        .from('drops')
        .select('*, author:users!author_id(display_name, avatar_url), reactions:drop_reactions(emoji, user_id)')
        .eq('id', id)
        .single(),
      supabase
        .from('drop_replies')
        .select('*, author:users!author_id(display_name, avatar_url)')
        .eq('drop_id', id)
        .order('created_at', { ascending: true }),
    ]);

    setDrop(d as unknown as Drop);
    setReplies((r as unknown as Reply[]) ?? []);
    setLoading(false);

    // Subscribe to new replies
    if (d) {
      channelRef.current = supabase
        .channel(`replies:${id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'drop_replies',
          filter: `drop_id=eq.${id}`,
        }, () => fetchReplies())
        .subscribe();
    }
  }

  async function fetchReplies() {
    const { data } = await supabase
      .from('drop_replies')
      .select('*, author:users!author_id(display_name, avatar_url)')
      .eq('drop_id', id)
      .order('created_at', { ascending: true });
    setReplies((data as unknown as Reply[]) ?? []);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function sendReply() {
    const content = text.trim();
    if (!content || !drop) return;
    setSending(true);
    setText('');
    await supabase.from('drop_replies').insert({
      drop_id:   id,
      circle_id: drop.circle_id,
      author_id: session!.user.id,
      content,
    });
    setSending(false);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator /></View>;
  }
  if (!drop) {
    return (
      <View style={s.center}>
        <Text>Drop not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.backLink}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Drop</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ref={listRef}
        data={replies}
        keyExtractor={r => r.id}
        renderItem={({ item }) => (
          <ReplyRow reply={item} myId={session!.user.id} />
        )}
        ListHeaderComponent={<DropHeader drop={drop} myId={session!.user.id} />}
        ListEmptyComponent={
          <Text style={s.emptyReplies}>Be the first to reply</Text>
        }
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      {/* Reply input */}
      <View style={s.inputBar}>
        <Avi
          uri={null}
          name={session!.user.email ?? '?'}
          size={32}
        />
        <TextInput
          style={s.input}
          placeholder="Reply…"
          placeholderTextColor="#bbb"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={sendReply}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDim]}
          onPress={sendReply}
          disabled={!text.trim() || sending}>
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.sendBtnText}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f2f2f7' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  backLink:   { color: '#555', fontSize: 16, marginTop: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ebebeb',
  },
  backBtn:     { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  backBtnText: { fontSize: 22, color: '#000' },
  headerTitle: { fontSize: 16, fontWeight: '600' },

  list: { padding: 16, gap: 10, paddingBottom: 16 },

  // Drop card
  dropCard: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2, marginBottom: 4,
  },
  authorRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 10 },
  avi:         { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  authorName:  { fontSize: 14, fontWeight: '600' },
  authorTime:  { fontSize: 12, color: '#aaa', marginTop: 1 },
  dropText:    { fontSize: 17, lineHeight: 26, color: '#111', paddingHorizontal: 14, paddingBottom: 14 },
  dropCaption: { fontSize: 14, color: '#555', paddingHorizontal: 14, paddingVertical: 10 },
  dropMedia:   { width: W - 32, height: 220, backgroundColor: '#f0f0f0' },
  replyCountRow: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  replyCountText: { fontSize: 13, color: '#aaa', fontWeight: '500' },

  // Video
  videoOverlay:   { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.12)' },
  videoPlayCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  videoPlayIcon:  { fontSize: 18, marginLeft: 3 },

  // Voice
  voiceRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  voicePlay:    { width: 44, height: 44, borderRadius: 22, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  voicePlayIcon: { color: '#fff', fontSize: 14, marginLeft: 2 },
  voiceTrack:   { flex: 1, height: 4, backgroundColor: '#e8e8e8', borderRadius: 2, overflow: 'hidden' },
  voiceFill:    { height: '100%', backgroundColor: '#000', borderRadius: 2 },
  voiceTime:    { fontSize: 12, color: '#888', width: 76, textAlign: 'right' },

  // Fullscreen
  fs:          { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fsClose:     { position: 'absolute', top: 56, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  fsCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Replies
  emptyReplies: { textAlign: 'center', color: '#bbb', marginTop: 20, fontSize: 14 },
  replyRow:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  replyBubble: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 4 },
  replyMeta:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyName:   { fontSize: 13, fontWeight: '600' },
  replyTime:   { fontSize: 12, color: '#aaa' },
  replyDelete: { fontSize: 12, color: '#ccc' },
  replyText:   { fontSize: 15, color: '#111', lineHeight: 22 },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ebebeb',
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  input: {
    flex: 1, backgroundColor: '#f2f2f7', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, lineHeight: 20,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDim:  { backgroundColor: '#ddd' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
