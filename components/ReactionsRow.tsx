import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Dimensions } from 'react-native';
import { supabase } from '@/lib/supabase';

export type Reaction = { emoji: string; user_id: string };

export const REACTION_PRESETS = ['❤️', '😂', '🔥', '😮', '😢', '👏', '🥳', '💯', '😍', '👀', '🙌', '✨'];

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '😮', '😢', '👏', '🥳'];
const SCREEN_H = Dimensions.get('window').height;

// ─── Hook — owns state + upsert/delete logic ──────────────────────────────────

export function useReactions(dropId: string, myId: string, initial: Reaction[]) {
  const [reactions, setReactions] = useState<Reaction[]>(initial);
  const [pending,   setPending]   = useState(false);

  async function react(emoji: string) {
    if (pending) return;
    const mine = reactions.find(r => r.user_id === myId);
    const toggleOff = mine?.emoji === emoji;

    // Optimistic update
    setReactions(prev => [
      ...prev.filter(r => r.user_id !== myId),
      ...(toggleOff ? [] : [{ emoji, user_id: myId }]),
    ]);

    setPending(true);
    if (toggleOff) {
      await supabase.from('drop_reactions').delete()
        .eq('drop_id', dropId).eq('user_id', myId);
    } else {
      await supabase.from('drop_reactions').upsert(
        { drop_id: dropId, user_id: myId, emoji },
        { onConflict: 'drop_id,user_id' },
      );
    }
    setPending(false);
  }

  return { reactions, react };
}

// ─── Telegram-style floating emoji pill ──────────────────────────────────────

export function EmojiPicker({ onSelect, onClose, anchorY }: {
  onSelect(emoji: string): void;
  onClose(): void;
  anchorY?: number;
}) {
  const top = anchorY != null
    ? Math.max(56, anchorY - 56)
    : SCREEN_H * 0.38;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.pill, { top }]} onPress={() => {}}>
          {QUICK_REACTIONS.map(e => (
            <TouchableOpacity key={e} style={s.emojiBtn} onPress={() => onSelect(e)}>
              <Text style={s.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Pure display row ─────────────────────────────────────────────────────────

export function ReactionsRow({ reactions, myId, onReact }: {
  reactions: Reaction[];
  myId: string;
  onReact(emoji: string): void;
}) {
  // Group by emoji, sorted by count desc
  const groups: Record<string, string[]> = {};
  for (const r of reactions) {
    (groups[r.emoji] ??= []).push(r.user_id);
  }
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  if (entries.length === 0) return null;

  return (
    <View style={s.row}>
      {entries.map(([emoji, users]) => {
        const mine = users.includes(myId);
        return (
          <TouchableOpacity
            key={emoji}
            style={[s.chip, mine && s.chipMine]}
            onPress={() => onReact(emoji)}
            activeOpacity={0.7}>
            <Text style={s.chipEmoji}>{emoji}</Text>
            <Text style={[s.chipCount, mine && s.chipCountMine]}>{users.length}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: 'transparent',
  },
  chipMine:      { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  chipEmoji:     { fontSize: 15 },
  chipCount:     { fontSize: 13, fontWeight: '600', color: '#555' },
  chipCountMine: { color: '#2563eb' },

  overlay: { flex: 1 },
  pill: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'space-evenly',
    backgroundColor: '#fff', borderRadius: 40,
    paddingHorizontal: 6, paddingVertical: 4,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 10,
  },
  emojiBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  emoji:    { fontSize: 22 },
});
