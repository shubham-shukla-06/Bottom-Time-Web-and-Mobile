import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import ProductCard from '../../src/components/ProductCard';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'merch', label: 'Merch' },
  { value: 'gear', label: 'Gear' },
  { value: 'essentials', label: 'Essentials' },
];

export default function ShopScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      const params: any = { limit: 30 };
      if (search) params.search = search;
      if (category) params.category = category;
      const res = await api.get('/products', { params });
      setProducts(res.data.products || res.data || []);
    } catch (e) {
      console.log('Failed to fetch products:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, category]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProducts();
  }, [fetchProducts]);

  return (
    <SafeAreaView style={styles.container} testID="shop-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Shop</Text>
        <Text style={styles.subtitle}>Gear, merch & dive essentials</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={16} color={Colors.slate400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={Colors.slate400}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => { setLoading(true); fetchProducts(); }}
            returnKeyType="search"
            testID="shop-search-input"
          />
        </View>
      </View>

      {/* Category Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            style={[styles.pill, category === cat.value && styles.pillActive]}
            onPress={() => { setCategory(cat.value); setLoading(true); }}
            testID={`shop-cat-${cat.value || 'all'}`}
          >
            <Text style={[styles.pillText, category === cat.value && styles.pillTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => router.push(`/product/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bag-outline" size={48} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No products found</Text>
            </View>
          }
          testID="products-flatlist"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  subtitle: { fontSize: 14, color: Colors.slate500, marginTop: 2 },
  searchRow: { paddingHorizontal: 16, marginBottom: 12 },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.slate50, borderRadius: 12, borderWidth: 1, borderColor: Colors.slate200, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: Colors.slate900 },
  filterRow: { maxHeight: 44, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.slate100 },
  pillActive: { backgroundColor: Colors.cyan400 },
  pillText: { fontSize: 12, fontWeight: '600', color: Colors.slate600 },
  pillTextActive: { color: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  listContent: { paddingHorizontal: 10, paddingBottom: 20 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.slate700, marginTop: 12 },
});
