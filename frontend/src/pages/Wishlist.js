import { useState, useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import { formatPrice } from '../utils/currency';
import Navbar from '../components/Navbar';
import { Heart, MapPin, Star, Clock, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import Footer from '../components/Footer';
import { ListingGridSkeleton } from '../components/Skeletons';

export default function Wishlist() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const currency = useUIStore(s => s.currency);
  const exchangeRates = useUIStore(s => s.exchangeRates);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWishlist(); }, []);

  const fetchWishlist = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/wishlist');
      setListings(res.data.listings);
    } catch (e) { toast.error('Failed to load wishlist'); }
    finally { setLoading(false); }
  };

  const removeItem = async (listingId) => {
    try {
      await axios.post(`/wishlist/${listingId}`);
      setListings(prev => prev.filter(l => l.id !== listingId));
      toast.success('Removed from wishlist');
    } catch (e) { toast.error('Failed to remove'); }
  };

  const typeStyles = {
    dives: { bg: 'bg-blue-50 text-blue-700', label: 'Fun Dive' },
    courses: { bg: 'bg-amber-50 text-amber-700', label: 'Course' },
    liveaboards: { bg: 'bg-violet-50 text-violet-700', label: 'Liveaboard' },
    day_trips: { bg: 'bg-emerald-50 text-emerald-700', label: 'Land-based Trip' },
    snorkeling: { bg: 'bg-sky-50 text-sky-700', label: 'Snorkeling' }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-6 lg:px-10 py-12" data-testid="wishlist-page">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-none mb-3">
            My Wishlist
          </h1>
          <p className="text-base text-slate-500">
            {listings.length} saved experience{listings.length !== 1 ? 's' : ''}
          </p>
        </div>

        {loading && listings.length === 0 ? (
          <ListingGridSkeleton count={6} cols="grid-cols-1 md:grid-cols-2 lg:grid-cols-3" />
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {listings.map(listing => {
              const style = typeStyles[listing.type] || { bg: 'bg-slate-100 text-slate-700', label: listing.type };
              return (
                <div key={listing.id} className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.1)] transition-all duration-500" data-testid="wishlist-card">
                  <div className="relative h-52 overflow-hidden cursor-pointer" onClick={() => navigate(`/listing/${listing.id}`)}>
                    <img src={listing.image_url} alt={listing.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold ${style.bg}`}>{style.label}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(listing.id); }}
                      className="absolute top-3 left-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-red-50 transition-colors"
                      data-testid="remove-wishlist-btn"
                    >
                      <Heart size={16} className="text-red-500 fill-red-500" />
                    </button>
                  </div>
                  <div className="p-5 cursor-pointer" onClick={() => navigate(`/listing/${listing.id}`)}>
                    <h3 className="text-lg font-bold mb-1.5 line-clamp-1 group-hover:text-cyan-400 transition-colors">{listing.name}</h3>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
                      <MapPin size={14} className="flex-shrink-0" />
                      <span className="line-clamp-1">{listing.location}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Star className="text-amber-400 fill-amber-400" size={15} />
                        <span className="font-semibold text-sm">{listing.rating}</span>
                        <span className="text-slate-400 text-xs">({listing.review_count})</span>
                      </div>
                      {listing.price ? (
                        <span className="text-lg font-bold text-cyan-400">{formatPrice(listing.price, currency, exchangeRates)}</span>
                      ) : (
                        <span className="text-slate-500 text-sm">Contact</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20">
            <Heart className="text-slate-300 mx-auto mb-4" size={56} />
            <h3 className="text-lg font-bold mb-2">No saved experiences</h3>
            <p className="text-slate-500 mb-6">Discover dive experiences and save your favorites</p>
            <button onClick={() => navigate('/discover')} className="btn-primary px-6 py-3" data-testid="browse-btn">
              Browse Experiences
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
