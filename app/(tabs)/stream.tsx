import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ScrollView, RefreshControl, ActivityIndicator, Image, Modal,
  Dimensions, StatusBar, Pressable, TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase, Database } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { EmojiPicker, useReactions, type Reaction } from '@/components/ReactionsRow';

type Circle = Database['public']['Tables']['circles']['Row'];
type Drop   = Database['public']['Tables']['drops']['Row'] & {
  author:    { display_name: string; avatar_url?: string | null } | null;
  reply_count: number;
  reactions:   Reaction[];
};
type Reply = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: { display_name: string; avatar_url?: string | null } | null;
};

const CARD_WIDTH  = Dimensions.get('window').width - 32;
const MEDIA_WIDTH = CARD_WIDTH - 20; // inset 10px each side

// ─── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function InitialAvatar({ uri, name, size = 36 }: { uri?: string | null; name: string; size?: number }) {
  const letters = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.initAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  );
}

// ─── Fullscreen modal ─────────────────────────────────────────────────────────

function FullscreenImage({ uri, visible, onClose }: {
  uri: string; visible: boolean; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <StatusBar hidden />
      <View style={styles.fsContainer}>
        <Image source={{ uri }} style={styles.fsImage} resizeMode="contain" />
        <TouchableOpacity style={styles.fsClose} onPress={onClose}>
          <Text style={styles.fsCloseText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Media sub-components (hooks isolated per type) ───────────────────────────

function PhotoContent({ drop }: { drop: Drop }) {
  const [fs, setFs] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (drop.content_url) {
      Image.getSize(drop.content_url, (w, h) => { if (w && h) setRatio(w / h); });
    }
  }, [drop.content_url]);
  if (!drop.content_url) return null;
  const h = ratio ? Math.min(MEDIA_WIDTH / ratio, 240) : 140;
  return (
    <>
      <TouchableOpacity onPress={() => setFs(true)} activeOpacity={0.95}>
        <Image
          source={{ uri: drop.content_url }}
          style={[styles.mediaInset, { height: h }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
      <FullscreenImage uri={drop.content_url} visible={fs} onClose={() => setFs(false)} />
    </>
  );
}

function VideoContent({ drop }: { drop: Drop }) {
  const [fs, setFs] = useState(false);
  const player = useVideoPlayer(drop.content_url, p => { p.loop = true; p.muted = true; });

  if (!drop.content_url) return null;
  return (
    <>
      <TouchableOpacity
        onPress={() => {
          player.muted = false;
          setFs(true);
        }}
        activeOpacity={0.95}>
        <View style={styles.mediaInset}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
          <View style={styles.videoPlayOverlay}>
            <View style={styles.videoPlayBtn}>
              <Text style={styles.videoPlayIcon}>▶</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <Modal visible={fs} animationType="fade" statusBarTranslucent>
        <StatusBar hidden />
        <View style={styles.fsContainer}>
          <VideoView
            player={player}
            style={styles.fsVideo}
            contentFit="contain"
            nativeControls
          />
          <TouchableOpacity style={styles.fsClose} onPress={() => { player.muted = true; setFs(false); }}>
            <Text style={styles.fsCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

function VoiceContent({ drop }: { drop: Drop }) {
  const player = useAudioPlayer({ uri: drop.content_url! });
  const status = useAudioPlayerStatus(player);
  const pct    = status.duration > 0 ? status.currentTime / status.duration : 0;
  const fmt    = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (!drop.content_url) return null;
  return (
    <View style={styles.voiceBar}>
      <TouchableOpacity
        style={styles.voicePlayBtn}
        onPress={() => status.playing ? player.pause() : player.play()}>
        <Text style={styles.voicePlayIcon}>{status.playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={styles.voiceProgressTrack}>
        <View style={[styles.voiceProgressFill, { width: `${pct * 100}%` as any }]} />
      </View>
      <Text style={styles.voiceTime}>
        {fmt(status.currentTime)}{status.duration > 0 ? ` / ${fmt(status.duration)}` : ''}
      </Text>
    </View>
  );
}


// ─── Inline reactions row (no padding, fits in footer) ───────────────────────

function InlineReactionsRow({ reactions, myId, onReact }: {
  reactions: Reaction[]; myId: string; onReact(emoji: string): void;
}) {
  const groups: Record<string, string[]> = {};
  for (const r of reactions) (groups[r.emoji] ??= []).push(r.user_id);
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([emoji, users]) => {
        const mine = users.includes(myId);
        return (
          <TouchableOpacity
            key={emoji}
            style={[styles.chip, mine && styles.chipMine]}
            onPress={() => onReact(emoji)}
            activeOpacity={0.7}>
            <Text style={styles.chipEmoji}>{emoji}</Text>
            <Text style={[styles.chipCount, mine && styles.chipCountMine]}>{users.length}</Text>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

// ─── Drop card ────────────────────────────────────────────────────────────────

function DropCard({ drop, myId }: { drop: Drop; myId: string }) {
  const name = drop.author?.display_name ?? '?';
  const isDrawing = drop.type === 'drawing';
  const { reactions, react } = useReactions(drop.id, myId, drop.reactions ?? []);
  const [showPicker,     setShowPicker]     = useState(false);
  const [pickerAnchorY,  setPickerAnchorY]  = useState(0);
  const [drawingFs,      setDrawingFs]      = useState(false);
  const [replyExpanded,  setReplyExpanded]  = useState(false);
  const [replies,        setReplies]        = useState<Reply[]>([]);
  const [replyText,      setReplyText]      = useState('');
  const [sending,        setSending]        = useState(false);
  const replyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  async function fetchReplies() {
    const { data } = await supabase
      .from('drop_replies')
      .select('*, author:users!author_id(display_name, avatar_url)')
      .eq('drop_id', drop.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setReplies(((data as unknown as Reply[]) ?? []).reverse());
  }

  useEffect(() => {
    if (!replyExpanded) {
      replyChannelRef.current?.unsubscribe();
      replyChannelRef.current = null;
      return;
    }
    fetchReplies();
    replyChannelRef.current = supabase
      .channel(`replies:${drop.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'drop_replies',
        filter: `drop_id=eq.${drop.id}`,
      }, () => fetchReplies())
      .subscribe();
    return () => {
      replyChannelRef.current?.unsubscribe();
      replyChannelRef.current = null;
    };
  }, [replyExpanded]);

  async function sendReply() {
    if (!replyText.trim() || sending) return;
    setSending(true);
    const text = replyText.trim();
    setReplyText('');
    await supabase.from('drop_replies').insert({
      drop_id: drop.id,
      circle_id: drop.circle_id,
      author_id: myId,
      content: text,
    });
    setSending(false);
  }

  return (
    <Pressable
      style={[styles.card, isDrawing && styles.cardDrawing]}
      onLongPress={(e) => {
        setPickerAnchorY(e.nativeEvent.pageY);
        setShowPicker(true);
      }}
      delayLongPress={400}>

      {/* Drawing: full-bleed background image */}
      {isDrawing && drop.content_url && (
        <>
          <Image
            source={{ uri: drop.content_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <FullscreenImage uri={drop.content_url} visible={drawingFs} onClose={() => setDrawingFs(false)} />
        </>
      )}

      {/* Author row */}
      <View style={styles.authorRow}>
        <InitialAvatar uri={drop.author?.avatar_url} name={name} />
        <View style={styles.authorMeta}>
          <Text style={styles.authorName}>{name}</Text>
          <Text style={styles.authorTime}>{timeAgo(drop.created_at)}</Text>
        </View>
        {drop.is_pinned && <Text style={{ fontSize: 14 }}>📌</Text>}
      </View>

      {/* Content */}
      {drop.type === 'text'  && <Text style={styles.textContent}>{drop.caption}</Text>}
      {drop.type === 'photo' && <PhotoContent drop={drop} />}
      {drop.type === 'video' && <VideoContent drop={drop} />}
      {drop.type === 'voice' && <VoiceContent drop={drop} />}

      {/* Drawing: tappable spacer fills the canvas area */}
      {isDrawing && (
        <TouchableOpacity
          style={styles.drawingSpacer}
          onPress={() => setDrawingFs(true)}
          activeOpacity={1}
        />
      )}

      {/* Caption under media */}
      {drop.type !== 'text' && drop.type !== 'drawing' && !!drop.caption && (
        <Text style={styles.mediaCaption}>{drop.caption}</Text>
      )}

      {/* Footer: reaction chips + reply button */}
      <View style={styles.cardFooter}>
        <View style={styles.footerReactions}>
          <InlineReactionsRow reactions={reactions} myId={myId} onReact={react} />
        </View>
        <TouchableOpacity
          style={styles.replyBtn}
          onPress={() => setReplyExpanded(e => !e)}
          activeOpacity={0.7}>
          <Text style={styles.replyIcon}>💬</Text>
          {drop.reply_count > 0 && (
            <Text style={styles.replyCount}>{drop.reply_count}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Inline replies */}
      {replyExpanded && (
        <View style={styles.replySection}>
          {replies.map(r => (
            <View key={r.id} style={styles.replyRow}>
              <InitialAvatar uri={r.author?.avatar_url} name={r.author?.display_name ?? '?'} size={24} />
              <View style={styles.replyBubble}>
                <Text style={styles.replyAuthor}>{r.author?.display_name ?? '?'}</Text>
                <Text style={styles.replyContent}>{r.content}</Text>
              </View>
            </View>
          ))}
          {drop.reply_count > 5 && (
            <TouchableOpacity onPress={() => router.push(`/drop/${drop.id}`)}>
              <Text style={styles.seeAll}>See all {drop.reply_count} replies →</Text>
            </TouchableOpacity>
          )}
          <View style={styles.replyInputRow}>
            <TextInput
              style={styles.replyInputField}
              placeholder="Reply..."
              placeholderTextColor="#bbb"
              value={replyText}
              onChangeText={setReplyText}
              onSubmitEditing={sendReply}
              returnKeyType="send"
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.replySendBtn, (!replyText.trim() || sending) && styles.replySendBtnOff]}
              onPress={sendReply}
              disabled={!replyText.trim() || sending}>
              <Text style={styles.replySendText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showPicker && (
        <EmojiPicker
          anchorY={pickerAnchorY}
          onSelect={e => { react(e); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Pressable>
  );
}

// ─── Avatar fallback ──────────────────────────────────────────────────────────

function Avatar({ uri, name, size = 36 }: { uri?: string | null; name: string; size?: number }) {
  const letters = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.initAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  );
}

// ─── Stream screen ────────────────────────────────────────────────────────────

export default function StreamScreen() {
  const { session } = useAuth();
  const [circles,       setCircles]       = useState<Circle[]>([]);
  const [activeCircle,  setActiveCircle]  = useState<Circle | null>(null);
  const [drops,         setDrops]         = useState<Drop[]>([]);
  const [loadingCircles, setLoadingCircles] = useState(true);
  const [loadingDrops,   setLoadingDrops]   = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);

  const channelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeCircleRef = useRef<Circle | null>(null);

  useEffect(() => { activeCircleRef.current = activeCircle; }, [activeCircle]);

  async function fetchCircles() {
    const { data } = await supabase
      .from('circle_members')
      .select('circles(*)')
      .eq('user_id', session!.user.id);

    const list = (data ?? [])
      .map(r => (r as unknown as { circles: Circle }).circles)
      .filter(Boolean);

    setCircles(list);
    setLoadingCircles(false);

    if (list.length > 0 && !activeCircleRef.current) {
      setActiveCircle(list[0]);
    }
    return list;
  }

  async function fetchDrops(circleId: string) {
    setLoadingDrops(true);
    const { data } = await supabase
      .from('drops')
      .select('*, author:users!author_id(display_name, avatar_url), reactions:drop_reactions(emoji, user_id)')
      .eq('circle_id', circleId)
      .gt('expires_at', new Date().toISOString())
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    setDrops((data as unknown as Drop[]) ?? []);
    setLoadingDrops(false);
  }

  function subscribeToDrops(circleId: string) {
    channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`drops:${circleId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'drops',
        filter: `circle_id=eq.${circleId}`,
      }, () => fetchDrops(circleId))
      .subscribe();
  }

  useFocusEffect(useCallback(() => {
    fetchCircles();
    const c = activeCircleRef.current;
    if (c) {
      fetchDrops(c.id);
      subscribeToDrops(c.id);
    }
    return () => { channelRef.current?.unsubscribe(); };
  }, []));

  useEffect(() => {
    if (!activeCircle) return;
    fetchDrops(activeCircle.id);
    subscribeToDrops(activeCircle.id);
    return () => { channelRef.current?.unsubscribe(); };
  }, [activeCircle?.id]);

  async function onRefresh() {
    setRefreshing(true);
    const list = await fetchCircles();
    const c = activeCircleRef.current ?? list[0];
    if (c) await fetchDrops(c.id);
    setRefreshing(false);
  }

  if (!loadingCircles && circles.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No circles yet</Text>
        <Text style={styles.emptySub}>Create one or join with an invite code.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/circle/new')}>
          <Text style={styles.btnText}>Create a circle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnOutline} onPress={() => router.push('/circle/join')}>
          <Text style={styles.btnOutlineText}>Join with code</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadingCircles) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Circle tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.circleRow}>
        {circles.map(c => {
          const on = activeCircle?.id === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.circleTab, on && styles.circleTabOn]}
              onPress={() => setActiveCircle(c)}
              onLongPress={() => router.push(`/circle/${c.id}`)}>
              {!!(c as any).avatar_url && (
                <Image source={{ uri: (c as any).avatar_url }} style={styles.circleTabAvatar} />
              )}
              <Text style={[styles.circleTabText, on && styles.circleTabTextOn]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={styles.addCircleBtn}
          onPress={() => router.push('/circle/new')}>
          <Text style={styles.addCircleBtnText}>+</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Active circle name bar → settings */}
      {activeCircle && (
        <TouchableOpacity
          style={styles.circleBar}
          onPress={() => router.push(`/circle/${activeCircle.id}`)}>
          <Text style={styles.circleBarName}>{activeCircle.name}</Text>
          <Text style={styles.circleBarChevron}>›</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={drops}
        keyExtractor={d => d.id}
        renderItem={({ item }) => <DropCard drop={item} myId={session!.user.id} />}
        contentContainerStyle={drops.length === 0 ? styles.feedEmpty : styles.feed}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loadingDrops
            ? <ActivityIndicator style={{ marginTop: 60 }} />
            : (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>No drops yet</Text>
                <Text style={styles.emptySub}>Be the first to drop something</Text>
              </View>
            )
        }
      />

      {activeCircle && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push({ pathname: '/drop/new', params: { circleId: activeCircle.id } })}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f2f2f7' },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySub:   { fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 8 },
  btn: {
    backgroundColor: '#000', borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 32, width: '100%', alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnOutline: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center',
  },
  btnOutlineText: { fontSize: 16, fontWeight: '500' },

  // Circle tabs
  circleRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  circleTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fff',
  },
  circleTabOn: { backgroundColor: '#000', borderColor: '#000' },
  circleTabAvatar: { width: 16, height: 16, borderRadius: 8 },
  circleTabText: { fontSize: 14, fontWeight: '500', color: '#555' },
  circleTabTextOn: { color: '#fff' },
  addCircleBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  addCircleBtnText: { fontSize: 22, color: '#888', lineHeight: 26 },
  circleBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ebebeb',
  },
  circleBarName:    { fontSize: 15, fontWeight: '600' },
  circleBarChevron: { fontSize: 20, color: '#aaa' },

  // Feed
  feed:      { padding: 16, gap: 12, paddingBottom: 100 },
  feedEmpty: { flex: 1 },

  // Drop card
  card: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardDrawing: { minHeight: 300 },
  drawingSpacer: { flex: 1, minHeight: 180 },
  authorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10,
  },
  initAvatar:  { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  authorMeta:  { flex: 1 },
  authorName:  { fontSize: 14, fontWeight: '600' },
  authorTime:  { fontSize: 12, color: '#aaa', marginTop: 1 },
  textContent: {
    fontSize: 17, color: '#111', lineHeight: 26,
    paddingHorizontal: 14, paddingBottom: 16,
  },
  mediaCaption: {
    fontSize: 14, color: '#555', lineHeight: 20,
    paddingHorizontal: 14, paddingVertical: 10,
  },

  // Media: inset with margin + rounded corners
  mediaInset: {
    width: MEDIA_WIDTH,
    height: 150,
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },

  // Video overlay
  videoPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  videoPlayBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayIcon: { fontSize: 18, marginLeft: 3 },

  // Voice player bar
  voiceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  voicePlayBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },
  voicePlayIcon:      { color: '#fff', fontSize: 15, marginLeft: 2 },
  voiceProgressTrack: { flex: 1, height: 4, backgroundColor: '#e8e8e8', borderRadius: 2, overflow: 'hidden' },
  voiceProgressFill:  { height: '100%', backgroundColor: '#000', borderRadius: 2 },
  voiceTime:          { fontSize: 12, color: '#888', width: 76, textAlign: 'right' },

  // Fullscreen
  fsContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fsImage:     { width: '100%', height: '100%' },
  fsVideo:     { width: '100%', height: '100%' },
  fsClose: {
    position: 'absolute', top: 56, left: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  fsCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Reaction chips (used in InlineReactionsRow)
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14,
    backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: 'transparent',
  },
  chipMine:      { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  chipEmoji:     { fontSize: 14 },
  chipCount:     { fontSize: 12, fontWeight: '600', color: '#555' },
  chipCountMine: { color: '#2563eb' },

  // Card footer: reactions + reply button in one row
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  footerReactions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  replyBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  replyIcon:  { fontSize: 14 },
  replyCount: { fontSize: 13, color: '#888', fontWeight: '500' },

  // Inline replies
  replySection: {
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 8,
  },
  replyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  replyBubble: {
    flex: 1, backgroundColor: '#f7f7f7', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  replyAuthor:  { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 2 },
  replyContent: { fontSize: 14, color: '#444', lineHeight: 19 },
  seeAll: { fontSize: 13, color: '#2563eb', fontWeight: '500' },
  replyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  replyInputField: {
    flex: 1, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0',
    paddingHorizontal: 14, fontSize: 14, color: '#111',
  },
  replySendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },
  replySendBtnOff: { backgroundColor: '#ddd' },
  replySendText:   { color: '#fff', fontSize: 16, fontWeight: '700' },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
});
