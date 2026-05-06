import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Minus, Plus, Trash2, Bookmark, Heart } from 'lucide-react';

export function CartItemList({ cartItems, fmt, fmtLine, updatingItem, updateQuantity, removeItem, handleSaveForLater, handleMoveToWishlist }) {
  const navigate = useNavigate();
  if (cartItems.length === 0) {
    return (
      <div className="text-center py-8 mb-4">
        <ShoppingCart className="text-slate-200 mx-auto mb-2" size={40} />
        <p className="text-sm text-slate-500">Your cart is empty</p>
        <button onClick={() => navigate('/shop')} className="text-sm font-semibold text-cyan-500 hover:text-cyan-600 mt-2">Browse Shop</button>
      </div>
    );
  }
  return (
    <div className="space-y-3 mb-6">
      {cartItems.map((item, idx) => (
        <div key={`k${idx}`} className="p-3 rounded-2xl border border-slate-100 group/item" data-testid="cart-item">
          <div className="flex items-center gap-3">
            <img src={item.product?.image_url} alt={item.product?.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 cursor-pointer" onClick={() => navigate(`/product/${item.product_id}`)} />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/product/${item.product_id}`)}>
              <h3 className="font-bold text-sm line-clamp-1 group-hover/item:text-cyan-500 transition-colors">{item.product?.name}</h3>
              <p className="text-xs text-slate-500">{item.size ? `Size: ${item.size} · ` : ''}{fmt(item.product?.price, item.product?.currency || 'USD')} each</p>
            </div>
            <div className="flex items-center gap-2">
              {updatingItem === `${item.product_id}-${item.size || ''}` ? (
                <div className="w-[86px] flex items-center justify-center" data-testid="cart-qty-loading">
                  <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <button onClick={() => updateQuantity(item.product_id, item.size, item.quantity - 1)} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50" data-testid="cart-qty-minus"><Minus size={12} /></button>
                  <span className="text-sm font-bold w-5 text-center" data-testid="cart-qty">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.product_id, item.size, item.quantity + 1)} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50" data-testid="cart-qty-plus"><Plus size={12} /></button>
                </>
              )}
            </div>
            <div className="text-right w-20">
              <p className="font-bold text-sm">{fmtLine(item.product?.price, item.quantity, item.product?.currency || 'USD')}</p>
              <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600 text-[10px] mt-0.5" data-testid="remove-item-btn">Remove</button>
            </div>
          </div>
          <div className="flex gap-3 ml-[76px] mt-2 pt-2 border-t border-slate-50">
            <button onClick={() => handleSaveForLater(item.product_id, item.size)} className="text-[10px] text-slate-400 hover:text-cyan-500 font-medium flex items-center gap-1" data-testid="save-later-btn">
              <Bookmark size={10} /> Save for later
            </button>
            <button onClick={() => handleMoveToWishlist(item.product_id)} className="text-[10px] text-slate-400 hover:text-rose-500 font-medium flex items-center gap-1" data-testid="move-wishlist-btn">
              <Heart size={10} /> Move to wishlist
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SavedItemList({ savedItems, fmt, handleMoveToCart, handleRemoveSaved }) {
  const navigate = useNavigate();
  if (savedItems.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Bookmark size={14} /> Saved for Later ({savedItems.length})</h3>
      <div className="space-y-2">
        {savedItems.map(item => (
          <div key={item.product_id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3" data-testid="saved-item">
            <img src={item.product?.image_url} alt={item.product?.name} className="w-12 h-12 rounded-lg object-cover" loading="lazy" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{item.product?.name}</p>
              <p className="text-xs text-slate-500">{fmt(item.product?.price, item.product?.currency || 'USD')}</p>
            </div>
            <button onClick={() => handleMoveToCart(item.product_id)} className="text-[11px] font-semibold text-cyan-500 hover:text-cyan-600" data-testid="move-to-cart-btn">Move to Cart</button>
            <button onClick={() => handleRemoveSaved(item.product_id)} className="text-slate-300 hover:text-red-400"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WishlistItemList({ wishlistItems, fmt, handleWishlistToCart, handleRemoveWishlist }) {
  const navigate = useNavigate();
  if (wishlistItems.length === 0) return null;
  return (
    <div className="mt-6" data-testid="cart-wishlist-section">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Heart size={14} className="text-rose-400" /> Wishlist ({wishlistItems.length})</h3>
      <div className="space-y-3">
        {wishlistItems.map(item => (
          <div key={item.id} className="flex items-center gap-4 bg-rose-50/50 border border-rose-100 rounded-xl p-4" data-testid="wishlist-cart-item">
            <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover cursor-pointer" loading="lazy" onClick={() => navigate(`/product/${item.id}`)} />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/product/${item.id}`)}>
              <p className="text-sm font-semibold truncate">{item.name}</p>
              <p className="text-xs text-slate-500">{fmt(item.price)}</p>
              {!item.in_stock && <p className="text-[10px] text-red-400 font-medium mt-0.5">Out of stock</p>}
            </div>
            {item.in_stock !== false ? (
              <button onClick={() => handleWishlistToCart(item.id)} className="text-[11px] font-semibold text-cyan-500 hover:text-cyan-600" data-testid="wishlist-to-cart-btn">Move to Cart</button>
            ) : (
              <span className="text-[11px] font-medium text-slate-300" data-testid="wishlist-out-of-stock">Unavailable</span>
            )}
            <button onClick={() => handleRemoveWishlist(item.id)} className="text-slate-300 hover:text-red-400" data-testid="remove-wishlist-btn"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
