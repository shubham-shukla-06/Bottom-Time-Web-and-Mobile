/**
 * Icon — single-source-of-truth icon component for the mobile app.
 *
 * Standardised on lucide-react-native to match web (frontend uses
 * lucide-react). Mobile previously mixed `@expo/vector-icons` (Ionicons,
 * Feather, MaterialCommunityIcons) across 48 files / 311 call sites; this
 * shim collapses them all to one library while preserving the existing
 * `<Icon name="X" size={N} color="..." />` ergonomics that the call sites
 * already use — including the ~15 places that pass a dynamic `name={var}`
 * which couldn't be statically rewritten to per-icon JSX.
 *
 * To add a new icon: append a mapping entry below. The `name` strings are
 * the original Ionicons names — keeps call-site diffs to zero and
 * preserves the codebase's familiar lookup vocabulary.
 */
import React from 'react';
import { Platform, View } from 'react-native';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import AppleMark from './brand/AppleMark';
import {
  AlertCircle, Anchor, ArrowLeft, ArrowRight, Banknote, Bed, Bell,
  Bookmark, Box, Briefcase, Building2, Calculator, Calendar, Car, Check,
  CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle,
  CircleDot, Clock, Compass, Droplets, Eye, ExternalLink, Fish, Globe,
  GraduationCap, HeartPulse, Heart, Image as ImageIcon, Info, Layers,
  Lightbulb, Lock, LogOut, Map, MapPin, MessageCircle, Minus, Navigation,
  PenLine, Plane, Plus, PlusCircle, Receipt, Ribbon, Search, Send, Share2,
  ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal, Sparkles,
  Star, Sun, Thermometer, ThumbsUp, Trash2, TrendingDown, User, UserMinus,
  UserPlus, Users, Wrench, X, XCircle,
} from 'lucide-react-native';

type LucideComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; fill?: string }>;

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle | TextStyle>;
  /** True → fills the glyph (used for star ratings). */
  fill?: boolean;
}

// Map from Ionicons-style names → lucide component. `-outline` variants
// map to the same lucide glyph as their filled counterparts (lucide is
// uniformly outlined; fill is controlled via the `fill` prop).
const NAME_MAP: Record<string, LucideComp> = {
  // navigation
  'arrow-back': ArrowLeft,
  'arrow-forward': ArrowRight,
  'chevron-back': ChevronLeft,
  'chevron-forward': ChevronRight,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  navigate: Navigation,
  'navigate-outline': Navigation,
  compass: Compass,
  'compass-outline': Compass,
  map: Map,
  'map-outline': Map,
  location: MapPin,
  'location-outline': MapPin,

  // X / close family
  close: X,
  'close-circle': XCircle,
  'close-circle-outline': XCircle,

  // plus / minus / check
  add: Plus,
  'add-circle': PlusCircle,
  'add-circle-outline': PlusCircle,
  remove: Minus,
  checkmark: Check,
  'checkmark-circle': CheckCircle,
  'radio-button-on': CircleDot,
  'radio-button-off': Circle,

  // generic UI
  calendar: Calendar,
  'calendar-outline': Calendar,
  search: Search,
  'search-outline': Search,
  image: ImageIcon,
  'image-outline': ImageIcon,
  bookmark: Bookmark,
  'bookmark-outline': Bookmark,
  eye: Eye,
  'eye-outline': Eye,
  time: Clock,
  'time-outline': Clock,
  'alert-circle': AlertCircle,
  'alert-circle-outline': AlertCircle,
  'information-circle-outline': Info,
  'lock-closed': Lock,
  'lock-closed-outline': Lock,
  'options-outline': SlidersHorizontal,
  'create-outline': PenLine,
  'open-outline': ExternalLink,
  'trash-outline': Trash2,
  'notifications-outline': Bell,
  'log-out-outline': LogOut,
  calculator: Calculator,
  sparkles: Sparkles,
  'sparkles-outline': Sparkles,
  'bulb-outline': Lightbulb,

  // people
  person: User,
  'person-outline': User,
  'person-add': UserPlus,
  'person-remove-outline': UserMinus,
  people: Users,
  'people-outline': Users,
  'people-circle-outline': Users,

  // chat
  chatbubble: MessageCircle,
  'chatbubble-outline': MessageCircle,
  'chatbubbles-outline': MessageCircle,
  'chatbubble-ellipses-outline': MessageCircle,
  'paper-plane': Send,

  // commerce
  cart: ShoppingCart,
  'cart-outline': ShoppingCart,
  'bag-outline': ShoppingBag,
  'bag-handle-outline': ShoppingBag,
  receipt: Receipt,
  'receipt-outline': Receipt,
  'cash-outline': Banknote,
  'cube-outline': Box,

  // hearts / shares / likes
  heart: Heart,
  'heart-outline': Heart,
  'share-outline': Share2,
  'thumbs-up': ThumbsUp,
  'thumbs-up-outline': ThumbsUp,
  'shield-checkmark': ShieldCheck,
  'shield-checkmark-outline': ShieldCheck,

  // rating
  star: Star,
  'star-outline': Star,

  // diving / outdoor / nautical
  fish: Fish,
  'fish-outline': Fish,
  water: Droplets,
  'water-outline': Droplets,
  anchor: Anchor,
  airplane: Plane,
  'airplane-outline': Plane,
  'globe-outline': Globe,
  'sunny-outline': Sun,
  sunny: Sun,
  'trending-down-outline': TrendingDown,
  'layers-outline': Layers,
  'ribbon-outline': Ribbon,
  'thermometer-outline': Thermometer,
  'medical-outline': HeartPulse,

  // business / accommodation
  business: Building2,
  'briefcase': Briefcase,
  'briefcase-outline': Briefcase,
  'bed-outline': Bed,
  'car-outline': Car,
  'construct-outline': Wrench,
  'school-outline': GraduationCap,

  // logos
  // 'logo-apple' is handled by the brand short-circuit in the component
  // body (renders the proper Apple silhouette SVG, NOT lucide's apple-fruit
  // glyph). Keep this slot empty so any future brand additions follow the
  // same pattern.
};

const OUTLINE_NAMES = new Set(
  Object.keys(NAME_MAP).filter((n) => n.endsWith('-outline')),
);

// Filled glyph names: Ionicons treats the non-`-outline` variant as filled.
// Lucide is uniformly outlined, so we flip the `fill` prop when the caller
// asked for a filled version (e.g. <Icon name="star"/> vs "star-outline").
//
// IMPORTANT: do NOT add multi-path glyphs here (e.g. `checkmark-circle`,
// `close-circle`). Lucide fills ALL paths in the SVG when `fill` is set,
// which would obscure the inner check/X behind a solid disc. Keep this
// allow-list to single-closed-path glyphs only.
function isFilled(name: string): boolean {
  if (name.endsWith('-outline')) return false;
  return name === 'star' || name === 'heart' || name === 'bookmark';
}

export default function Icon({ name, size = 16, color, style, fill }: IconProps) {
  // Brand marks bypass Lucide entirely — see /components/brand/.
  // Lucide's `Apple` is the apple-fruit glyph, NOT the bitten-apple brand
  // mark. The same applies to logo-google / logo-microsoft (currently
  // inlined in welcome.tsx so not routed through this shim).
  if (name === 'logo-apple') {
    return (
      <View style={style as ViewStyle}>
        <AppleMark size={size} color={color || '#000'} />
      </View>
    );
  }

  const Comp = NAME_MAP[name];
  if (!Comp) {
    if (__DEV__) console.warn(`[Icon] missing mapping for "${name}" — falling back to a 0x0 spacer`);
    return <View style={[{ width: size, height: size }, style as ViewStyle]} />;
  }
  const filled = fill ?? isFilled(name);
  const stroke = filled ? 2.25 : 2;
  return (
    <View style={style as ViewStyle}>
      <Comp size={size} color={color} strokeWidth={stroke} fill={filled ? (color || 'currentColor') : 'none'} />
    </View>
  );
}

// Diagnostics — used by the migration codemod & tests.
export const __ICON_NAMES__ = Object.keys(NAME_MAP);
export const __OUTLINE_NAMES__ = OUTLINE_NAMES;
export { NAME_MAP as __NAME_MAP__ };

// Web placeholder so the file imports cleanly on react-native-web in case a
// future story bundles SVG icons differently per platform.
if (Platform.OS === 'web') {
  // no-op currently — lucide-react-native works on web via react-native-svg-web.
}
