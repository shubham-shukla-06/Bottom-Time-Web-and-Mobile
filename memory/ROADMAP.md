# Bottom Time - Roadmap

## P0 (Next Sprint)
- **Room selector in booking flow**: Allow users to select single/double/shared occupancy rooms when listing has accommodations
- **Multi-PAN collection for group bookings**: If user books for multiple non-family participants, collect PAN cards for all individuals (TCS compliance)

## P1 (Important)
- **Razorpay webhook secret**: Configure production webhook endpoint with proper secret verification
- **E-commerce payments**: Move from test/mock Razorpay keys to live credentials
- **Operator Dashboard polish**: UX improvements based on operator feedback

## P2 (Nice to Have)
- **Component splitting candidates**:
  - `DiveShareModal.js` (263 lines)
  - `EnhancedProfileViewer.js` (231 lines)
- **Web-Vitals monitoring**: Add performance tracking
- **Shiprocket Admin Panel**: Full admin shipping management
- **Deeper Social Features**: Enhanced feed, stories, etc.
- **Mobile responsiveness**: Adapt layouts for phone (currently desktop-first per user directive)
- **TypeScript migration**: 0% → incremental .tsx conversion
- **Python type hints**: 28% → higher coverage
