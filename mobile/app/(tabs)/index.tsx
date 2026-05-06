import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import ListingCard from '../../src/components/ListingCard';
import BottomTimeLogo from '../../src/components/BottomTimeLogo';
import Chip from '../../src/components/ui/Chip';

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'courses', label: 'Courses' },
  { value: 'dives', label: 'Fun Dives' },
  { value: 'day_trips', label: 'Trips' },
  { value: 'liveaboards', label: 'Liveaboards' },
  { value: 'snorkeling', label: 'Snorkeling' },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeType, setActiveType] = useState('');

  const fetchListings = useCallback(async () => {
    try {
      const params: any = { sort_by: 'rating', limit: 20, include_reviews: true };
      if (searchTerm) params.search = searchTerm;
      if (activeType) params.type = activeType;
      const res = await api.get('/listings', { params });
      setListings(res.data.listings || []);
    } catch (e) {
      console.log('Failed to fetch listings:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, activeType]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchListings();
  }, [fetchListings]);

  const handleSearch = () => {
    setLoading(true);
    fetchListings();
  };

  return (
    <SafeAreaView style={styles.container} testID="discover-screen">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <BottomTimeLogo size="md" showTM={false} />
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow} testID="search-bar">
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={16} color={Colors.slate400} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search dives, courses..."
            placeholderTextColor={Colors.slate400}
            value={searchTerm}
            onChangeText={setSearchTerm}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            testID="search-input"
          />
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} testID="search-btn">
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Type Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {TYPE_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            active={activeType === opt.value}
            onPress={() => { setActiveType(opt.value); setLoading(true); }}
            testID={`pill-${opt.value || 'all'}`}
          >
            {opt.label}
          </Chip>
        ))}
      </ScrollView>

      {/* Listings */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
          <Text style={styles.loadingText}>Finding experiences...</Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="compass-outline" size={48} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No listings found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search or filters</Text>
            </View>
          }
          testID="listings-flatlist"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 20, fontWeight: '700', color: Colors.slate900, letterSpacing: -0.5 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.slate50, borderRadius: 12, borderWidth: 1, borderColor: Colors.slate200, paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: Colors.slate900 },
  searchBtn: { backgroundColor: Colors.cyan400, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  filterRow: { maxHeight: 44, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.slate100 },
  pillActive: { backgroundColor: Colors.cyan400 },
  pillText: { fontSize: 12, fontWeight: '600', color: Colors.slate600 },
  pillTextActive: { color: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.slate500 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: Colors.slate500, marginTop: 4 },
});
