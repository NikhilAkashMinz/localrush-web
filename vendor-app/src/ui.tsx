// The pieces every screen is built from: cards, buttons, pills, the header, a bottom sheet,
// form fields, and the banner that announces new orders.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, type Banner } from './store';
import { color, radius, type } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, tint = color.ink, style }: { name: IconName; size?: number; tint?: string; style?: StyleProp<TextStyle> }) {
  return <MaterialCommunityIcons name={name} size={size} color={tint} style={style} />;
}

/** The LocalRush mark: a white centre in a ring of gold dots, the 5 km radius. */
export function LogoMark({ size = 40 }: { size?: number }) {
  const dots = 12;
  const dot = Math.max(2.5, size * 0.085);
  const ring = size * 0.34;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.teal, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: dots }, (_, i) => {
        const a = (i / dots) * Math.PI * 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: color.gold,
              left: size / 2 + ring * Math.cos(a) - dot / 2,
              top: size / 2 + ring * Math.sin(a) - dot / 2,
            }}
          />
        );
      })}
      <View style={{ width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: color.white }} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'gold' | 'secondary' | 'danger' | 'onDeep';

const BUTTON: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
  primary: { bg: color.teal, fg: color.white, border: color.teal },
  gold: { bg: color.gold, fg: color.deep, border: color.gold },
  secondary: { bg: color.card, fg: color.teal, border: color.teal },
  danger: { bg: color.card, fg: color.red, border: color.red },
  onDeep: { bg: color.onDeepFaint, fg: color.white, border: 'rgba(255,255,255,0.35)' },
};

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  busy,
  compact,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = BUTTON[kind];
  const off = !!disabled || !!busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        compact && s.buttonCompact,
        { backgroundColor: look.bg, borderColor: look.border },
        disabled && s.disabled,
        pressed && s.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={compact ? 18 : 21} tint={look.fg} /> : null}
          <Text style={[s.buttonText, compact && s.buttonTextCompact, { color: look.fg }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type Tone = 'neutral' | 'teal' | 'gold' | 'green' | 'red' | 'onDeep';
const PILL: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: color.paper, fg: color.mute },
  teal: { bg: color.tealTint, fg: color.tealDark },
  gold: { bg: color.goldTint, fg: color.goldDeep },
  green: { bg: color.greenTint, fg: color.green },
  red: { bg: color.redTint, fg: color.red },
  onDeep: { bg: color.onDeepFaint, fg: color.white },
};

export function Pill({ text, tone = 'neutral', icon, dot }: { text: string; tone?: Tone; icon?: IconName; dot?: string }) {
  const look = PILL[tone];
  return (
    <View style={[s.pill, { backgroundColor: look.bg }]}>
      {dot ? <View style={[s.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Icon name={icon} size={14} tint={look.fg} /> : null}
      <Text style={[s.pillText, { color: look.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionText}>{title}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: ReactNode }) {
  return (
    <Card style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={30} tint={color.teal} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {children}
    </Card>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[s.segment, on && s.segmentOn]}
          >
            <Text style={[s.segmentText, on && s.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The dark band at the top of every screen, with the LocalRush mark. */
export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
      <LogoMark size={30} />
      <Text style={s.topTitle} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/** "LIVE" in the top bar while the live connection is up: changes made on the website or in the other app arrive at once. */
export function LiveBadge() {
  const { live } = useApp();
  if (!live) return null;
  return (
    <View style={s.live} accessibilityLabel="Live updates on">
      <View style={s.liveDot} />
      <Text style={s.liveText}>LIVE</Text>
    </View>
  );
}

/** A panel that slides up from the bottom of the screen. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={s.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: 18 + insets.bottom }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" tint={color.mute} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={s.sheetBody}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const BANNER: Record<Banner['tone'], { bg: string; fg: string; icon: IconName }> = {
  new: { bg: color.gold, fg: color.deep, icon: 'bell-ring' },
  good: { bg: color.green, fg: color.white, icon: 'check-circle' },
  bad: { bg: color.red, fg: color.white, icon: 'alert-circle' },
  info: { bg: color.deep, fg: color.white, icon: 'information-outline' },
};

/** New orders, changes and problems, shown over the top of the screen for a few seconds. Tapping it closes it. */
export function BannerView({ onOpen }: { onOpen?: (banner: Banner) => void }) {
  const { banner, dismiss } = useApp();
  const insets = useSafeAreaInsets();
  if (!banner) return null;
  const look = BANNER[banner.tone];
  return (
    <View style={[s.bannerWrap, { top: insets.top + 8 }]}>
      <Pressable
        onPress={() => {
          dismiss();
          onOpen?.(banner);
        }}
        accessibilityRole="alert"
        accessibilityLabel={banner.title}
        style={[s.banner, { backgroundColor: look.bg }]}
      >
        <Icon name={look.icon} size={26} tint={look.fg} />
        <View style={s.bannerText}>
          <Text style={[s.bannerTitle, { color: look.fg }]}>{banner.title}</Text>
          {banner.body ? <Text style={[s.bannerBody, { color: look.fg }]}>{banner.body}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}

/** A text box with its label above it, and an optional hint below. */
export function Field({ label, hint, style, ...input }: { label: string; hint?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  return (
    <View style={[s.field, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={color.faint} accessibilityLabel={label} {...input} style={s.input} />
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** A number with − and + buttons either side, for stock. */
export function Stepper({ value, onChange, label, max = 9999 }: { value: string; onChange: (v: string) => void; label: string; max?: number }) {
  const n = /^\d+$/.test(value) ? Number(value) : 0;
  const set = (v: number) => onChange(String(Math.max(0, Math.min(max, v))));
  return (
    <View style={s.stepper}>
      <Pressable
        onPress={() => set(n - 1)}
        disabled={n <= 0}
        accessibilityRole="button"
        accessibilityLabel={`One less, ${label}`}
        style={({ pressed }) => [s.stepButton, n <= 0 && s.disabled, pressed && s.pressed]}
      >
        <Icon name="minus" size={26} tint={color.teal} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, String(max).length))}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={label}
        style={s.stepValue}
      />
      <Pressable
        onPress={() => set(n + 1)}
        disabled={n >= max}
        accessibilityRole="button"
        accessibilityLabel={`One more, ${label}`}
        style={({ pressed }) => [s.stepButton, n >= max && s.disabled, pressed && s.pressed]}
      >
        <Icon name="plus" size={26} tint={color.teal} />
      </Pressable>
    </View>
  );
}

/** A small rounded button that is on or off, for filters and choices. */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [s.chip, on && s.chipOn, pressed && s.pressed]}
    >
      <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A red line explaining what went wrong. */
export function ErrorLine({ text }: { text: string }) {
  return (
    <View style={s.error} accessibilityRole="alert">
      <Icon name="alert-circle" size={18} tint={color.red} />
      <Text style={s.errorText}>{text}</Text>
    </View>
  );
}

/** A label and a value, side by side, for details such as opening hours. */
export function Line({ icon, label, value, sub, right }: { icon: IconName; label: string; value: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={s.line}>
      <View style={s.lineIcon}>
        <Icon name={icon} size={20} tint={color.teal} />
      </View>
      <View style={s.lineText}>
        <Text style={s.lineLabel}>{label}</Text>
        <Text style={s.lineValue}>{value}</Text>
        {sub ? <Text style={s.lineSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const s = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.line,
    padding: 16,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.button,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextCompact: { fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12.5, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  sectionText: { fontSize: type.heading, fontWeight: '800', color: color.ink },
  empty: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 22, gap: 8 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: color.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: type.heading, fontWeight: '800', color: color.ink, textAlign: 'center' },
  emptyBody: { fontSize: type.body, color: color.mute, textAlign: 'center', lineHeight: 21 },
  segmented: { flexDirection: 'row', backgroundColor: '#E7EAF0', borderRadius: 14, padding: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segmentOn: { backgroundColor: color.card },
  segmentText: { fontSize: 14, fontWeight: '700', color: color.mute },
  segmentTextOn: { color: color.ink },
  topBar: {
    backgroundColor: color.deep,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topTitle: { flex: 1, color: color.white, fontSize: 18, fontWeight: '800' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(74,222,128,0.16)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  liveText: { color: '#4ADE80', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7,63,61,0.45)' },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: color.line, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: type.title, fontWeight: '800', color: color.ink },
  sheetBody: { maxHeight: 560 },
  bannerWrap: { position: 'absolute', left: 12, right: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 16, fontWeight: '800' },
  bannerBody: { fontSize: 14, marginTop: 2, opacity: 0.9 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.tealTint, alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1 },
  lineLabel: { fontSize: 12.5, fontWeight: '700', color: color.faint, textTransform: 'uppercase', letterSpacing: 0.6 },
  lineValue: { fontSize: type.heading, fontWeight: '800', color: color.ink, marginTop: 1 },
  lineSub: { fontSize: 14, color: color.mute, marginTop: 2, lineHeight: 19 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: color.mute, marginBottom: 6 },
  fieldHint: { fontSize: 12.5, color: color.mute, marginTop: 5 },
  input: {
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 17,
    color: color.ink,
    backgroundColor: color.paper,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: color.teal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  stepValue: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.button,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: color.ink,
    backgroundColor: color.paper,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.card,
  },
  chipOn: { borderColor: color.teal, backgroundColor: color.teal },
  chipText: { fontSize: 14, fontWeight: '700', color: color.ink },
  chipTextOn: { color: color.white },
  error: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: color.redTint, marginBottom: 12 },
  errorText: { flex: 1, color: color.red, fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
