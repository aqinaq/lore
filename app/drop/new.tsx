import { useRef, useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
  PanResponder, ScrollView, Dimensions, Modal, Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder, useAudioRecorderState,
  requestRecordingPermissionsAsync, RecordingPresets,
} from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from 'react-native-svg';
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

const CP_SIZE = 260;
const CP_BAR  = 22;

const PRESET_COLORS = [
  '#000000', '#ffffff', '#e53e3e', '#ff9800',
  '#ffeb3b', '#38a169', '#3182ce', '#805ad5', '#f06292',
];
const BRUSHES = [3, 6, 12];

// ─── Color math ───────────────────────────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function toRgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

// ─── Full HSV color picker modal ──────────────────────────────────────────────

function ColorPickerModal({ initial, onDone, onClose }: {
  initial: string;
  onDone: (rgba: string) => void;
  onClose: () => void;
}) {
  const initRgb = hexToRgb(initial.startsWith('rgba') ? '#000000' : initial) ?? [0, 0, 0];
  const [ih, is, iv] = rgbToHsv(...initRgb);

  const hRef  = useRef(ih);
  const sRef  = useRef(is);
  const vRef  = useRef(iv);
  const aRef  = useRef(1);

  const [hue,   setHue]   = useState(ih);
  const [sat,   setSat]   = useState(is);
  const [val,   setVal]   = useState(iv);
  const [alpha, setAlpha] = useState(1);
  const [hexIn, setHexIn] = useState(rgbToHex(...initRgb).replace('#', ''));

  const hex     = rgbToHex(...hsvToRgb(hue, sat, val));
  const hueHex  = rgbToHex(...hsvToRgb(hue, 1, 1));

  function applyHsv(h: number, s: number, v: number) {
    hRef.current = h; sRef.current = s; vRef.current = v;
    setHue(h); setSat(s); setVal(v);
    setHexIn(rgbToHex(...hsvToRgb(h, s, v)).replace('#', ''));
  }

  const svPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: e => {
      const s = Math.max(0, Math.min(1, e.nativeEvent.locationX / CP_SIZE));
      const v = Math.max(0, Math.min(1, 1 - e.nativeEvent.locationY / CP_SIZE));
      applyHsv(hRef.current, s, v);
    },
    onPanResponderMove: e => {
      const s = Math.max(0, Math.min(1, e.nativeEvent.locationX / CP_SIZE));
      const v = Math.max(0, Math.min(1, 1 - e.nativeEvent.locationY / CP_SIZE));
      applyHsv(hRef.current, s, v);
    },
  })).current;

  const huePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: e => {
      const h = Math.max(0, Math.min(360, (e.nativeEvent.locationX / CP_SIZE) * 360));
      applyHsv(h, sRef.current, vRef.current);
    },
    onPanResponderMove: e => {
      const h = Math.max(0, Math.min(360, (e.nativeEvent.locationX / CP_SIZE) * 360));
      applyHsv(h, sRef.current, vRef.current);
    },
  })).current;

  const alphaPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: e => {
      const a = Math.max(0, Math.min(1, e.nativeEvent.locationX / CP_SIZE));
      aRef.current = a; setAlpha(a);
    },
    onPanResponderMove: e => {
      const a = Math.max(0, Math.min(1, e.nativeEvent.locationX / CP_SIZE));
      aRef.current = a; setAlpha(a);
    },
  })).current;

  function onHexChange(raw: string) {
    const clean = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setHexIn(clean);
    if (clean.length === 6) {
      const rgb = hexToRgb('#' + clean);
      if (rgb) {
        const [h, s, v] = rgbToHsv(...rgb);
        applyHsv(h, s, v);
      }
    }
  }

  const thumbSx = sat * CP_SIZE;
  const thumbSy = (1 - val) * CP_SIZE;
  const thumbHx = (hue / 360) * CP_SIZE;
  const thumbAx = alpha * CP_SIZE;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.cpOverlay} onPress={onClose}>
        <Pressable style={styles.cpBox}>

          {/* SV square */}
          <View {...svPan.panHandlers} style={styles.cpSvWrap}>
            <Svg width={CP_SIZE} height={CP_SIZE} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgGrad id="wh" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#fff" />
                  <Stop offset="1" stopColor={hueHex} />
                </SvgGrad>
                <SvgGrad id="bk" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000" stopOpacity="0" />
                  <Stop offset="1" stopColor="#000" />
                </SvgGrad>
              </Defs>
              <SvgRect width={CP_SIZE} height={CP_SIZE} fill="url(#wh)" />
              <SvgRect width={CP_SIZE} height={CP_SIZE} fill="url(#bk)" />
            </Svg>
            <View style={[styles.cpCursor, { left: thumbSx - 11, top: thumbSy - 11 }]} />
          </View>

          {/* Hue bar */}
          <View {...huePan.panHandlers} style={styles.cpBarWrap}>
            <Svg width={CP_SIZE} height={CP_BAR} style={styles.cpBarSvg}>
              <Defs>
                <SvgGrad id="hue" x1="0" y1="0" x2="1" y2="0">
                  {[0,60,120,180,240,300,360].map((deg, i) => (
                    <Stop key={i} offset={`${(deg/360*100).toFixed(0)}%`}
                      stopColor={rgbToHex(...hsvToRgb(deg === 360 ? 0 : deg, 1, 1))} />
                  ))}
                </SvgGrad>
              </Defs>
              <SvgRect width={CP_SIZE} height={CP_BAR} rx={CP_BAR / 2} fill="url(#hue)" />
            </Svg>
            <View style={[styles.cpBarThumb, { left: thumbHx - 13 }]} />
          </View>

          {/* Opacity bar */}
          <View {...alphaPan.panHandlers} style={styles.cpBarWrap}>
            <Svg width={CP_SIZE} height={CP_BAR} style={styles.cpBarSvg}>
              <Defs>
                <SvgGrad id="alpha" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0"   stopColor={hex} stopOpacity="0" />
                  <Stop offset="1"   stopColor={hex} stopOpacity="1" />
                </SvgGrad>
              </Defs>
              <SvgRect width={CP_SIZE} height={CP_BAR} rx={CP_BAR / 2} fill="#ccc" />
              <SvgRect width={CP_SIZE} height={CP_BAR} rx={CP_BAR / 2} fill="url(#alpha)" />
            </Svg>
            <View style={[styles.cpBarThumb, { left: thumbAx - 13 }]} />
          </View>

          {/* Preview + hex input */}
          <View style={styles.cpBottomRow}>
            <View style={styles.cpPreviewWrap}>
              <View style={styles.cpCheckers} />
              <View style={[StyleSheet.absoluteFill, {
                backgroundColor: hex, opacity: alpha, borderRadius: 10,
              }]} />
            </View>
            <View style={styles.cpHexRow}>
              <Text style={styles.cpHash}>#</Text>
              <TextInput
                style={styles.cpHexInput}
                value={hexIn}
                onChangeText={onHexChange}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={6}
                placeholder="000000"
                placeholderTextColor="#bbb"
              />
            </View>
            <Text style={styles.cpAlphaPct}>{Math.round(alpha * 100)}%</Text>
          </View>

          <View style={styles.cpActions}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cpCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cpDone}
              onPress={() => onDone(toRgba(hex, alpha))}>
              <Text style={styles.cpDoneText}>Done</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Drawing panel ────────────────────────────────────────────────────────────

function DrawingPanel({ canvasRef }: { canvasRef: React.RefObject<View | null> }) {
  const [paths, setPaths] = useState<{ d: string; color: string; w: number }[]>([]);
  const colorRef = useRef('#000000');
  const brushRef = useRef(6);
  const liveD    = useRef('');
  const [color,      setColor]      = useState('#000000');
  const [brush,      setBrush]      = useState(6);
  const [tick,       setTick]       = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

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
        <View style={styles.colorRow}>
          {PRESET_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.colorSwatch, { backgroundColor: c }, c === color && styles.colorActive]}
              onPress={() => pickColor(c)}
            />
          ))}
          {/* Custom color picker button */}
          <TouchableOpacity
            style={[styles.colorSwatch, styles.colorPickerBtn,
              !PRESET_COLORS.includes(color) && styles.colorActive]}
            onPress={() => setPickerOpen(true)}>
            {!PRESET_COLORS.includes(color)
              ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: 13 }]} />
              : null}
            <Text style={styles.colorPickerIcon}>⊕</Text>
          </TouchableOpacity>
        </View>

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

      {pickerOpen && (
        <ColorPickerModal
          initial={color}
          onDone={c => { pickColor(c); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
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
  colorRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  colorSwatch: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  colorActive:    { borderColor: '#333', borderWidth: 2.5, transform: [{ scale: 1.18 }] },
  colorPickerBtn: {
    alignItems: 'center', justifyContent: 'center',
    borderStyle: 'dashed', overflow: 'hidden',
  },
  colorPickerIcon: { fontSize: 16, color: '#888', lineHeight: 28 },

  // Color picker modal
  cpOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  cpBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36, gap: 16, alignItems: 'center',
  },
  cpSvWrap: {
    width: CP_SIZE, height: CP_SIZE, borderRadius: 10, overflow: 'hidden',
  },
  cpCursor: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11,
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  cpBarWrap: {
    width: CP_SIZE, height: CP_BAR + 10,
    justifyContent: 'center',
  },
  cpBarSvg: { borderRadius: CP_BAR / 2 },
  cpBarThumb: {
    position: 'absolute', width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', top: -2,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    borderWidth: 1, borderColor: '#ddd',
  },
  cpBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: CP_SIZE },
  cpPreviewWrap: {
    width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#eee',
  },
  cpCheckers: { ...StyleSheet.absoluteFill, backgroundColor: '#ccc' },
  cpHexRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e8e8e8', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  cpHash:     { fontSize: 15, fontWeight: '600', color: '#999' },
  cpHexInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111', letterSpacing: 1 },
  cpAlphaPct: { fontSize: 13, color: '#888', width: 36, textAlign: 'right', fontWeight: '600' },
  cpActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    alignItems: 'center', gap: 16, width: CP_SIZE,
  },
  cpCancel:   { fontSize: 15, color: '#888', fontWeight: '500' },
  cpDone:     { backgroundColor: '#000', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 },
  cpDoneText: { color: '#fff', fontWeight: '600', fontSize: 15 },
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
