# Design Guidelines: Folklore & Legend Explorer

## Architecture Decisions

### Authentication
**Initial Release**: No authentication required
- App functions as a read-only exploration tool
- Include a **Settings screen** accessible from tab bar with:
  - Display name field (for future social features)
  - App preferences (map style, distance units, notification preferences)
  - About section with app version and credits

**Future Implementation** (Phase 2): Social features require auth
- Implement Apple Sign-In (required for iOS)
- Add Google Sign-In for cross-platform expansion
- Required for: check-ins, user-contributed locations, saved routes, social features
- Auth screens should match dark, atmospheric aesthetic

### Navigation Structure
**Tab Navigation** (4 tabs + floating action):
1. **Map** - Interactive map with location markers (default tab)
2. **Explore** - List view with search and filters
3. **Routes** - Curated and generated walking routes
4. **Settings** - App preferences and account (future)
5. **Floating Action Button** - "Add Location" (Phase 2, requires auth)

### Screen Specifications

#### 1. Map Screen (Primary)
- **Purpose**: Discover nearby folklore locations visually
- **Layout**:
  - No navigation header (fullscreen map)
  - Map fills entire screen with tab bar overlay
  - Top-left: Search bar (semi-transparent, dark background with blur)
  - Top-right: Map style toggle button (standard/satellite), filter button
  - Bottom: Tab bar with safe area handling
  - Floating info card when location selected (bottom sheet style)
- **Safe Area Insets**: 
  - Top: insets.top + Spacing.md
  - Bottom: tabBarHeight + Spacing.xl
- **Components**:
  - Custom map markers (distinct icons for ghosts, folklore, historical events, Fortean phenomena)
  - Clustering for dense areas
  - User location indicator
  - Distance radius visualization (subtle)
  - Bottom sheet for location preview (swipe up for full details)

#### 2. Explore Screen
- **Purpose**: Browse and search all locations in list format
- **Layout**:
  - Transparent header with large title "Explore"
  - Right button: Filter icon
  - Search bar below header (integrated in ScrollView)
  - Scrollable list of location cards
- **Safe Area Insets**:
  - Top: headerHeight + Spacing.xl
  - Bottom: tabBarHeight + Spacing.xl
- **Components**:
  - Search bar with dark styling
  - Category filter chips (ghosts, folklore, historical, Fortean)
  - Location cards with: thumbnail image, title, category badge, distance, brief teaser
  - Pull-to-refresh functionality

#### 3. Location Detail Screen (Modal)
- **Purpose**: Display full story and historical context
- **Layout**:
  - Custom header with large background image (parallax scroll effect)
  - Left button: Back/Close
  - Right button: Share icon
  - Scrollable content area
  - Floating "Get Directions" button at bottom
- **Safe Area Insets**:
  - Bottom: insets.bottom + Spacing.xl (floating button)
- **Components**:
  - Hero image with gradient overlay
  - Title and subtitle
  - Category badge(s)
  - Story content (rich text with historical context)
  - Map snippet showing exact location
  - "Nearby Locations" section (3-4 related places)
  - Footer with source/attribution

#### 4. Routes Screen
- **Purpose**: Browse curated and suggested walking routes
- **Layout**:
  - Transparent header with title "Routes"
  - Right button: "Create Route" (Phase 2)
  - Scrollable list of route cards
- **Safe Area Insets**:
  - Top: headerHeight + Spacing.xl
  - Bottom: tabBarHeight + Spacing.xl
- **Components**:
  - Route cards with: map preview, title, distance, duration, number of stops
  - Filter by distance/duration
  - Route preview shows path on mini map

#### 5. Route Detail Screen
- **Purpose**: View route details and start navigation
- **Layout**:
  - Default navigation header with back button
  - Map preview at top (1/3 screen height)
  - Scrollable content below
  - Fixed "Start Route" button at bottom
- **Safe Area Insets**:
  - Bottom: insets.bottom + Spacing.xl
- **Components**:
  - Interactive route map
  - Route metadata (distance, estimated time, difficulty)
  - Ordered list of locations with brief descriptions
  - Elevation profile (future enhancement)

#### 6. Filter Modal
- **Purpose**: Refine location search by multiple criteria
- **Layout**:
  - Native modal presentation
  - Header with "Cancel" (left) and "Apply" (right)
  - Scrollable form
  - Submit/cancel buttons in header
- **Components**:
  - Category toggles (multi-select)
  - Distance slider
  - Sort options (distance, name, date added)
  - "Clear All" button

## Design System

### Color Palette
**Primary Theme**: Dark, atmospheric, mystical
- **Background**: 
  - Primary: #0A0E14 (deep charcoal)
  - Secondary: #151A23 (lighter charcoal for cards)
- **Accent Colors**:
  - Primary: #8B7355 (muted bronze/sepia - evokes old maps)
  - Secondary: #4A5F7F (muted slate blue - mysterious)
  - Ghost/Supernatural: #9B8AA4 (muted lavender)
  - Folklore: #7A8450 (muted sage green)
  - Historical: #8B7355 (bronze)
  - Fortean: #6B5B8E (deep purple)
- **Text**:
  - Primary: #E8E6E3 (warm off-white)
  - Secondary: #A8A5A0 (muted gray)
  - Accent: #D4AF7A (warm gold)
- **UI Elements**:
  - Borders: #2A2F3A (subtle)
  - Inactive: #4A4E57

### Typography
- **Headers**: SF Pro Display (iOS native)
  - Large Title: 34pt, Bold
  - Title: 28pt, Semibold
  - Headline: 17pt, Semibold
- **Body**: SF Pro Text
  - Body: 17pt, Regular
  - Callout: 16pt, Regular
  - Caption: 12pt, Regular
- **Story Content**: Georgia or Iowan Old Style (serif for historical feel)
  - Body: 18pt, Regular, line-height: 1.6

### Visual Design
- **Icons**: Use Feather icons for navigation and actions. Use custom category icons for location types (ghost, compass, scroll, eye for Fortean)
- **Cards**: 
  - Background: #151A23
  - Border radius: 12px
  - NO drop shadow for static cards
  - Subtle 1px border: #2A2F3A
- **Floating Buttons**:
  - Background: accent color with slight gradient
  - Drop shadow: offset (0, 2), opacity 0.10, radius 2
  - Border radius: 24px for circular, 12px for rounded rect
- **Map Markers**: Custom illustrations with color-coded glows matching category colors
- **Images**: All location images should have subtle sepia or desaturated overlay to maintain atmospheric consistency

### Interaction Design
- **Touchable Feedback**: All interactive elements have 0.6 opacity on press
- **Transitions**: 
  - Screen transitions: 300ms ease-in-out
  - Map animations: smooth pan and zoom
  - Bottom sheet: spring animation (damping 0.8)
- **Haptics**: 
  - Light impact on card tap
  - Medium impact on filter apply
  - Notification on location "check-in" (Phase 2)
- **Loading States**: 
  - Skeleton screens for location lists
  - Spinner for map data loading
  - Shimmer effect matching dark theme

### Accessibility
- **Contrast**: Ensure 4.5:1 minimum contrast ratio for all text
- **VoiceOver**: All interactive elements have descriptive labels
- **Dynamic Type**: Support text scaling for body content
- **Reduced Motion**: Disable parallax and spring animations when enabled
- **Color Independence**: Category distinction doesn't rely solely on color (use icons + text labels)

### Assets Required
1. **Category Icons** (4 custom icons):
   - Ghost (spectral figure or classic sheet ghost silhouette)
   - Folklore (Celtic knot or ancient scroll)
   - Historical (period building or crown)
   - Fortean (eye or question mark in mystical circle)
2. **Map Marker Styles** (4 variations matching categories with subtle glows)
3. **App Icon**: Mystical compass or lantern design with dark background
4. **Placeholder Images**: 5-6 atmospheric London location photos (Tower of London, fog-covered street, old pub exterior, etc.) with sepia treatment

### Platform-Specific Notes
- Follow iOS conventions for navigation gestures (swipe back)
- Use native iOS MapView with custom styling
- Bottom sheets should respect iOS safe area insets
- Tab bar icons should be simple line icons, filled when active