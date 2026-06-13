import { useRef, useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
  PanResponder, ScrollView, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder, useAudioRecorderState,
  requestRecordingPermissionsAsync, RecordingPresets,
} from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Database } from '@/lib/supabase';

type DropType = Database['public']['Tables']['drops']['Row']['type'];

const CANVAS_SIZE = Dimensions.get('window').width - 40;

// ─── Voice panel ──────────────────────────────────────────────────────────────

function VoicePanel({
  recorded, onRecorded, onDiscard,
}: {
  recorded: boolean;
  onRecorded: (uri: string) => void;
  onDiscard: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state    = useAudioRecorderState(recorder, 500);

  const [phase, setPhase] = useState(0);
  const rafRef      = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.isRecording) {
      const step = (now: number) => {
        const dt = lastTimeRef.current != null ? now - lastTimeRef.current : 0;
        lastTimeRef.current = now;
        setPhase(p => p + dt * 0.003);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastTimeRef.current = null;
      setPhase(0);
    }
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [state.isRecording]);

  const elapsed = state.durationMillis ?? 0;
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');

  async function toggle() {
    if (state.isRecording) {
      await recorder.stop();
      if (recorder.uri) onRecorded(recorder.uri);
    } else {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
    }
  }

  if (recorded) {
    return (
      <View style={styles.voiceDoneBox}>
        <Text style={styles.voiceDoneIcon}>🎙️</Text>
        <Text style={styles.voiceDoneLabel}>Recording ready</Text>
        <TouchableOpacity onPress={onDiscard}>
          <Text style={styles.voiceDiscardText}>Record again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.voicePanel}>
      <Text style={styles.voiceTimer}>{mm}:{ss}</Text>
      <View style={styles.voiceWave}>
        {Array.from({ length: 24 }).map((_, i) => {
          const h = state.isRecording
            ? 5 + Math.abs(
                Math.sin(phase + i * 0.68) * 15 +
                Math.sin(phase * 0.6 + i * 0.42) * 11
              )
            : 4;
          return <View key={i} style={[styles.voiceBar, { height: h }]} />;
        })}
      </View>
      <TouchableOpacity
        style={[styles.recBtn, state.isRecording && styles.recBtnLive]}
        onPress={toggle}>
        <View style={state.isRecording ? styles.recStop : styles.recDot} />
      </TouchableOpacity>
      <Text style={styles.voiceHint}>
        {state.isRecording ? 'Tap to stop' : 'Tap to record'}
      </Text>
    </View>
  );
}

// ─── Drawing panel ────────────────────────────────────────────────────────────

const COLORS = [
  // Neutrals
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
  // Reds & pinks
  '#ff0000', '#e53e3e', '#c62828', '#ff6b6b', '#f06292', '#e91e8c', '#ff4081',
  // Oranges & yellows
  '#ff6d00', '#ff9800', '#ffc107', '#ffeb3b', '#f9a825',
  // Greens
  '#38a169', '#2e7d32', '#66bb6a', '#00c853', '#1de9b6', '#00bfa5',
  // Blues & cyans
  '#3182ce', '#1565c0', '#42a5f5', '#00b0ff', '#00e5ff', '#26c6da',
  // Purples & magentas
  '#805ad5', '#6a1b9a', '#ab47bc', '#ce93d8', '#ea80fc', '#d500f9',
  // Browns
  '#795548', '#a1887f', '#d7a17a',
];
const BRUSHES = [3, 6, 12];

function DrawingPanel({ canvasRef }: { canvasRef: React.RefObject<View | null> }) {
  const [paths, setPaths] = useState<{ d: string; color: string; w: number }[]>([]);
  const colorRef = useRef('#000000');
  const brushRef = useRef(6);
  const liveD    = useRef('');
  const [color, setColor] = useState('#000000');
  const [brush, setBrush] = useState(6);
  const [tick,  setTick]  = useState(0);

  function pickColor(c: string) { setColor(c); colorRef.current = c; }
  function pickBrush(b: number) { setBrush(b); brushRef.current = b; }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: e => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        liveD.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        setTick(t => t + 1);
      },
      onPanResponderMove: e => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        liveD.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        setTick(t => t + 1);
      },
      onPanResponderRelease: () => {
        const d = liveD.current;
        if (d) setPaths(ps => [...ps, { d, color: colorRef.current, w: brushRef.current }]);
        liveD.current = '';
        setTick(t => t + 1);
      },
    })
  ).current;

  return (
    <View style={styles.drawPanel}>
      <View style={styles.drawToolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.colorRow}>
            {COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c }, c === color && styles.colorActive]}
                onPress={() => pickColor(c)}
              />
            ))}
          </View>
        </ScrollView>
        <View style={styles.brushRow}>
          {BRUSHES.map(b => (
            <TouchableOpacity
              key={b}
              style={[styles.brushBtn, b === brush && styles.brushBtnActive]}
              onPress={() => pickBrush(b)}>
              <View style={[styles.brushDot, { width: b * 2, height: b * 2, borderRadius: b }]} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setPaths([]); liveD.current = ''; setTick(t => t + 1); }}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View
        ref={canvasRef}
        style={styles.canvas}
        {...pan.panHandlers}
        collapsable={false}>
        <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} style={StyleSheet.absoluteFill}>
          {paths.map((p, i) => (
            <Path key={i} d={p.d} stroke={p.color} strokeWidth={p.w}
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {!!liveD.current && (
            <Path d={liveD.current} stroke={color} strokeWidth={brush}
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const TITLES: Record<DropType, string> = {
  text:    'Write a note',
  photo:   'Take a photo',
  video:   'Record a video',
  voice:   'Record voice',
  drawing: 'Draw something',
};

export default function NewDropScreen() {
  const { circleId, type: typeParam } = useLocalSearchParams<{ circleId: string; type: string }>();
  const { session } = useAuth();
  const type = (typeParam as DropType) || 'text';

  const [caption,  setCaption]  = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [recUri,   setRecUri]   = useState<string | null>(null);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const canvasRef = useRef<View>(null);

  // Auto-open camera for photo/video on mount
  useEffect(() => {
    if (type === 'photo') takePhoto();
    if (type === 'video') recordVideo();
  }, []);

  async function takePhoto() {
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.85,
    });
    if (!r.canceled) setPhotoUri(r.assets[0].uri);
    else if (!photoUri) router.back(); // user cancelled with nothing selected
  }

  async function recordVideo() {
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'], videoMaxDuration: 60,
    });
    if (!r.canceled) setVideoUri(r.assets[0].uri);
    else if (!videoUri) router.back();
  }

  async function uploadFile(uri: string, mime: string, ext: string): Promise<string | null> {
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${circleId}/${session!.user.id}/${rand}.${ext}`;
    const blob = await (await fetch(uri)).blob();
    const { error } = await supabase.storage
      .from('drops').upload(path, blob, { contentType: mime, upsert: false });
    if (error) return null;
    return supabase.storage.from('drops').getPublicUrl(path).data.publicUrl;
  }

  async function post() {
    setError('');
    let contentUrl: string | null = null;
    const finalCaption = caption.trim() || null;
    setLoading(true);
    try {
      if (type === 'text') {
        if (!finalCaption) { setError('Write something first.'); setLoading(false); return; }

      } else if (type === 'photo') {
        if (!photoUri) { setError('Take a photo first.'); setLoading(false); return; }
        const raw = photoUri.split('?')[0];
        const ext = raw.split('.').pop()?.toLowerCase() ?? 'jpg';
        contentUrl = await uploadFile(photoUri, `image/${ext === 'jpg' ? 'jpeg' : ext}`, ext);
        if (!contentUrl) { setError('Upload failed, try again.'); setLoading(false); return; }

      } else if (type === 'video') {
        if (!videoUri) { setError('Record a video first.'); setLoading(false); return; }
        const raw = videoUri.split('?')[0];
        const ext = raw.split('.').pop()?.toLowerCase() ?? 'mp4';
        const mime = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
        contentUrl = await uploadFile(videoUri, mime, ext);
        if (!contentUrl) { setError('Upload failed, try again.'); setLoading(false); return; }

      } else if (type === 'voice') {
        if (!recUri) { setError('Record audio first.'); setLoading(false); return; }
        contentUrl = await uploadFile(recUri, 'audio/m4a', 'm4a');
        if (!contentUrl) { setError('Upload failed, try again.'); setLoading(false); return; }

      } else if (type === 'drawing') {
        const drawUri = await captureRef(canvasRef, { format: 'png', quality: 0.9, result: 'tmpfile' });
        contentUrl = await uploadFile(drawUri, 'image/png', 'png');
        if (!contentUrl) { setError('Upload failed, try again.'); setLoading(false); return; }
      }

      const { error: dbErr } = await supabase.from('drops').insert({
        circle_id: circleId, author_id: session!.user.id,
        type, content_url: contentUrl, caption: finalCaption,
      });
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
      setLoading(false);
    }
  }

  const canPost = () => {
    if (type === 'text')    return caption.trim().length > 0;
    if (type === 'photo')   return photoUri !== null;
    if (type === 'video')   return videoUri !== null;
    if (type === 'voice')   return recorded;
    if (type === 'drawing') return true;
    return false;
  };

  const videoPlayer = useVideoPlayer(videoUri, p => { p.loop = true; });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{TITLES[type]}</Text>
        <TouchableOpacity onPress={post} disabled={loading || !canPost()}>
          {loading
            ? <ActivityIndicator size="small" />
            : <Text style={[styles.postBtn, !canPost() && styles.postBtnDim]}>Post</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">

        {/* ── Text ── */}
        {type === 'text' && (
          <TextInput
            style={styles.textInput}
            placeholder="What's going on?"
            placeholderTextColor="#bbb"
            multiline autoFocus
            value={caption}
            onChangeText={setCaption}
          />
        )}

        {/* ── Photo ── */}
        {type === 'photo' && (
          <>
            {photoUri ? (
              <TouchableOpacity style={styles.mediaBox} onPress={takePhoto} activeOpacity={0.9}>
                <Image source={{ uri: photoUri }} style={styles.mediaFill} resizeMode="cover" />
                <View style={styles.retakeBadge}>
                  <Text style={styles.retakeBadgeText}>📷 Retake</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.mediaBox} onPress={takePhoto} activeOpacity={0.85}>
                <View style={styles.emptyMedia}>
                  <Text style={styles.emptyIcon}>📷</Text>
                  <Text style={styles.emptyLabel}>Tap to open camera</Text>
                </View>
              </TouchableOpacity>
            )}
            <CaptionInput value={caption} onChange={setCaption} />
          </>
        )}

        {/* ── Video ── */}
        {type === 'video' && (
          <>
            {videoUri ? (
              <>
                <View style={styles.mediaBox}>
                  <VideoView
                    player={videoPlayer}
                    style={styles.mediaFill}
                    contentFit="cover"
                    nativeControls
                  />
                </View>
                <TouchableOpacity style={styles.retakeLink} onPress={recordVideo}>
                  <Text style={styles.retakeLinkText}>🎬 Record again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.mediaBox} onPress={recordVideo} activeOpacity={0.85}>
                <View style={styles.emptyMedia}>
                  <Text style={styles.emptyIcon}>🎬</Text>
                  <Text style={styles.emptyLabel}>Tap to open camera</Text>
                </View>
              </TouchableOpacity>
            )}
            {videoUri && <CaptionInput value={caption} onChange={setCaption} />}
          </>
        )}

        {/* ── Voice ── */}
        {type === 'voice' && (
          <>
            <VoicePanel
              recorded={recorded}
              onRecorded={uri => { setRecUri(uri); setRecorded(true); }}
              onDiscard={() => { setRecorded(false); setRecUri(null); }}
            />
            {recorded && <CaptionInput value={caption} onChange={setCaption} />}
          </>
        )}

        {/* ── Drawing ── */}
        {type === 'drawing' && (
          <>
            <DrawingPanel canvasRef={canvasRef} />
            <CaptionInput value={caption} onChange={setCaption} />
          </>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CaptionInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <TextInput
      style={styles.captionInput}
      placeholder="Add a caption… (optional)"
      placeholderTextColor="#bbb"
      value={value}
      onChangeText={onChange}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  cancel:      { fontSize: 16, color: '#555' },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  postBtn:     { fontSize: 16, fontWeight: '700', color: '#000' },
  postBtnDim:  { color: '#ccc' },
  body: { padding: 20, gap: 14, paddingBottom: 80 },
  textInput: {
    fontSize: 18, color: '#000', minHeight: 220,
    textAlignVertical: 'top', lineHeight: 28,
  },
  captionInput: {
    borderWidth: 1.5, borderColor: '#e8e8e8', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15,
  },
  errorText: { color: '#e53e3e', fontSize: 14 },

  // Media
  mediaBox:  { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f5f5f5' },
  mediaFill: { width: '100%', height: '100%' },
  emptyMedia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyLabel: { fontSize: 15, color: '#aaa' },
  retakeBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  retakeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  retakeLink: { alignItems: 'center', paddingVertical: 10 },
  retakeLinkText: { fontSize: 14, color: '#555', fontWeight: '500' },

  // Voice
  voicePanel:    { alignItems: 'center', gap: 20, paddingVertical: 28 },
  voiceTimer:    { fontSize: 52, fontWeight: '200', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  voiceWave:     { flexDirection: 'row', alignItems: 'center', gap: 3, height: 48 },
  voiceBar:      { width: 3, backgroundColor: '#000', borderRadius: 2 },
  recBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  recBtnLive: { borderColor: '#e53e3e' },
  recDot:     { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e53e3e' },
  recStop:    { width: 22, height: 22, borderRadius: 4,  backgroundColor: '#e53e3e' },
  voiceHint:  { fontSize: 14, color: '#888' },
  voiceDoneBox: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  voiceDoneIcon:    { fontSize: 52 },
  voiceDoneLabel:   { fontSize: 18, fontWeight: '600' },
  voiceDiscardText: { fontSize: 15, color: '#888' },

  // Drawing
  drawPanel:   { gap: 10 },
  drawToolbar: { gap: 8 },
  colorRow:    { flexDirection: 'row', gap: 8 },
  colorSwatch: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  colorActive:    { borderColor: '#333', borderWidth: 2.5, transform: [{ scale: 1.2 }] },
  brushRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brushBtn: {
    width: 38, height: 38, borderRadius: 8, borderWidth: 1.5, borderColor: '#e8e8e8',
    alignItems: 'center', justifyContent: 'center',
  },
  brushBtnActive: { borderColor: '#000', backgroundColor: '#f0f0f0' },
  brushDot:       { backgroundColor: '#000' },
  clearBtn: {
    marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  clearBtnText: { fontSize: 13, color: '#555' },
  canvas: {
    width: CANVAS_SIZE, height: CANVAS_SIZE,
    backgroundColor: '#fafafa', borderRadius: 12,
    borderWidth: 1, borderColor: '#e8e8e8', overflow: 'hidden',
  },
});
