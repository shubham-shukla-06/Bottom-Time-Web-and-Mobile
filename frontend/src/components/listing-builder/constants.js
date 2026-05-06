import { FileText, Camera, Anchor, Shirt, MapPin, Home, Plus, DollarSign, Navigation, Stethoscope } from 'lucide-react';

export const LISTING_TYPES = [
  { value: 'day_dive', label: 'Day Dive' },
  { value: 'trip', label: 'Multi-Day Trip' },
  { value: 'course', label: 'Certification Course' },
  { value: 'liveaboard', label: 'Liveaboard' },
  { value: 'package', label: 'Package Deal' },
  { value: 'snorkeling', label: 'Snorkeling' },
];

export const DIFFICULTY_LEVELS = [
  { value: 'beginner', label: 'Beginner / Discover' },
  { value: 'open_water', label: 'Open Water' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'rescue', label: 'Rescue Diver' },
  { value: 'divemaster', label: 'Divemaster' },
  { value: 'technical', label: 'Technical' },
];

export const CERT_LEVELS = ['None Required', 'Open Water', 'Advanced Open Water', 'Rescue Diver', 'Divemaster', 'Instructor', 'Nitrox Certified', 'Deep Diver'];

export const GEAR_ITEMS = ['BCD', 'Regulator', 'Wetsuit', 'Mask & Snorkel', 'Fins', 'Dive Computer', 'Torch', 'SMB', 'Tank', 'Weight Belt', 'Camera Housing'];

export const ROOM_TYPES = ['Single', 'Double', 'Twin', 'Triple', 'Shared Dorm', 'Suite', 'Cabin'];

export const SECTION_CONFIG = [
  { key: 'basic', label: 'Basic Info', icon: FileText },
  { key: 'media', label: 'Photos & Videos', icon: Camera },
  { key: 'dive', label: 'Dive Details', icon: Anchor },
  { key: 'gear', label: 'Gear & Equipment', icon: Shirt },
  { key: 'dates', label: 'Dates & Schedule', icon: MapPin },
  { key: 'accommodation', label: 'Accommodation', icon: Home },
  { key: 'inclusions', label: 'Inclusions / Exclusions', icon: Plus },
  { key: 'pricing', label: 'Pricing', icon: DollarSign },
  { key: 'policies', label: 'Policies & Legal', icon: FileText },
  { key: 'directions', label: 'How to Get There', icon: Navigation },
  { key: 'medical', label: 'Medical & Safety', icon: Stethoscope },
];
