# Lantern - Folklore & Legend Explorer

## Overview

Lantern is a React Native mobile application built with Expo that helps users discover and explore folklore, legends, and mysterious locations in London. The app features an interactive map, browseable location catalog, curated walking routes, and detailed information about each supernatural or historical site. Users can search, filter by categories (ghosts, folklore, historical events, Fortean phenomena), and navigate to locations of interest.

The application uses a client-server architecture with a React Native frontend and Express backend, connected to a PostgreSQL database for storing location data, categories, regions, and routes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React Native 0.81.5 with Expo SDK 54
- React 19.1.0 with new architecture enabled
- React Navigation for routing (native-stack and bottom-tabs)
- TanStack Query for server state management
- Reanimated and Gesture Handler for animations

**Navigation Structure:**
- Stack navigator as root with tab navigator nested inside
- Single "Explore" tab with full-screen map
- Compass screen for hunt navigation (full-screen modal)
- Platform-specific implementations (.web.tsx files for web compatibility)

**Place Detail Screen:**
- PlaceDetailScreen is a full-screen experience for viewing place details
- Autoplays audio narration on open
- Shows map hero, title, audio player, description, and facts
- Compass button in top-right navigates to hunt mode
- "Back to Tour" button appears when accessed from a tour
- Accessible from TourDetailScreen (tour stops) and potentially other flows
- Includes vote (thumbs up/down) and report functionality

**Compass Navigation ("Hunt" Mode):**
- HuntContext provides global state for active hunt target
- CompassScreen displays directional arrow pointing to target
- Magnetometer integration with circular mean low-pass filter for smooth rotation
- Real-time distance readout with arrival detection at <10m
- Haptic feedback on arrival
- Map shows gold target marker and greyed other markers during hunt

**Curated Lists ("Tours" Tab):**
- Authenticated users can create custom lists to save places
- ListsScreen shows all user lists with item counts
- Swipe-to-delete gesture for list removal
- ListDetailScreen shows saved places with drag-and-drop reordering
- "Save to List" modal on MapScreen place panel
- Guests see sign-in prompts when trying to access lists
- Uses Supabase `lists` and `list_items` tables with RLS policies
- Unique constraint prevents duplicate places in same list
- Order persistence via `order_index` field with bulk updates

**State Management:**
- TanStack Query handles all server data fetching and caching
- Local component state for UI interactions (search, filters, selections)
- HuntContext (React Context) for compass navigation hunt state
- No additional global state management library needed

**Theming System:**
- ThemeContext (`client/contexts/ThemeContext.tsx`) provides light/dark/system preference stored in AsyncStorage
- `useTheme()` hook returns `{ theme, isDark, preference, setPreference }` — all screens use this
- `Colors.light` and `Colors.dark` palettes in `client/constants/theme.ts` define full colour sets
- Light palette: warm cream/parchment backgrounds (#F5F2ED), dark text, muted gold accents
- Dark palette: deep navy backgrounds (#0A0E14), light text, bright gold accents
- All screens use `createStyles(theme: ThemeColors)` factory pattern with `useMemo` for dynamic styles
- Map has separate light (`lightMapStyle`) and dark (`darkMapStyle`) Google Maps styles in `client/constants/mapStyle.ts`
- Theme toggle lives in ProfileScreen as a segmented control (Light / Dark / System)
- BlurView tint dynamically set to `isDark ? "dark" : "light"` throughout

**Key Design Patterns:**
- Themed components (ThemedView, ThemedText) for consistent styling
- Custom hooks (useTheme, useScreenOptions) for reusable logic
- Error boundaries for graceful error handling
- Platform-specific file extensions for web/native differences
- Safe area context for handling device notches and system UI

**Map Implementation:**
- Conditional rendering based on platform capabilities
- React Native Maps for native platforms with Google Maps provider
- Custom dark map style (`client/constants/mapStyle.ts`) suppresses business labels, roads, and POIs; emphasises parks, water, and transit
- Marker hierarchy with 5 visual tiers: ambient (26px), selected (38px with glow), hunt target (44px gold with pulse), greyed (during hunt), completed (gold border with checkmark)
- HuntPulseMarker component: Reanimated-driven expanding ring animation overlay on hunt targets
- Expanded category type system (12+ categories with unique colours and icons, landmark shapes for major categories)
- Enhanced selection panel: animated slide-up with category badge, distance indicator, audio availability, and "Read more" affordance
- Camera choreography: marker select offsets camera to accommodate bottom sheet; hunt start frames user + target with fitToCoordinates
- Auto-refresh: 20 nearest places fetched on map pan (400ms debounce) via `getNearest20` in `client/lib/supabase.ts`
- Fallback UI for web and environments where maps are unavailable
- SafeMapView component wraps map with error boundary

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript
- RESTful API design pattern
- Modular route registration system
- CORS configuration for Replit deployment environment

**API Endpoints:**
- `GET /api/categories` - Fetch all location categories
- `GET /api/locations` - Fetch all locations
- `GET /api/locations/:id` - Fetch single location by ID
- `GET /api/locations/category/:categoryId` - Filter by category
- `GET /api/locations/nearby` - Geospatial queries for proximity search
- `GET /api/routes` - Fetch walking routes
- `GET /api/routes/:id` - Fetch route with stops

**Data Layer:**
- Storage interface pattern (IStorage) for database abstraction
- DatabaseStorage class implements storage operations
- Drizzle ORM for type-safe database queries
- Schema-driven development with shared types

**Database Schema:**

*Categories:* Store types of locations (ghosts, folklore, historical, Fortean)
- Fields: id, name, slug, color, iconName, description, timestamps
- One-to-many relationship with locations

*Locations:* Core entity for mysterious sites
- Fields: id, name, slug, description, story, latitude, longitude, address, categoryId, imageUrl, sourceAttribution, regionId, isActive, timestamps
- Belongs to category and region
- Has many route stops

*Regions:* Geographic groupings for locations
- Referenced by locations and routes

*Routes:* Curated walking tours
- Fields: id, name, slug, description, estimatedDurationMinutes, distanceMeters, difficulty
- Has many route stops
- Belongs to region

*RouteStops:* Junction table connecting routes to locations
- Maintains order of stops in route
- References both route and location

**Geospatial Features:**
- Latitude/longitude coordinates for all locations
- Distance calculation using Haversine formula
- Nearby location queries with configurable radius

### External Dependencies

**Expo Modules:**
- expo-location: User geolocation and permission handling
- expo-blur: Glassmorphism effects for UI
- expo-constants: App metadata access
- expo-haptics: Tactile feedback for arrival detection
- expo-image: Optimized image loading
- expo-symbols: System icons
- expo-web-browser: External link handling
- expo-sensors: Magnetometer for compass heading
- expo-audio: Audio playback for place detail narrations

**Geospatial Libraries:**
- geolib: Bearing calculation and distance measurement for compass navigation

**Navigation:**
- @react-navigation/native: Core navigation
- @react-navigation/native-stack: Stack navigation
- @react-navigation/bottom-tabs: Tab bar navigation
- react-native-safe-area-context: Device inset handling
- react-native-screens: Native screen optimization

**Maps & Location:**
- react-native-maps: Interactive maps (native only)
- Google Maps Platform: Map tiles and provider

**Database:**
- PostgreSQL: Primary data store (configured via DATABASE_URL)
- Drizzle ORM: TypeScript ORM with schema migrations
- pg: PostgreSQL client for Node.js
- drizzle-zod: Schema validation integration

**UI & Interaction:**
- react-native-gesture-handler: Touch gesture system
- react-native-reanimated: High-performance animations
- react-native-keyboard-controller: Keyboard behavior management
- @expo/vector-icons: Icon library (Feather icons primarily)

**Data Fetching:**
- @tanstack/react-query: Server state management and caching
- Custom query client with retry logic and error handling

**Build & Development:**
- TypeScript: Type safety across codebase
- tsx: TypeScript execution for server
- esbuild: Server bundling for production
- drizzle-kit: Database migration tooling

**Deployment Environment:**
- Replit-specific environment variables for domain configuration
- HTTP proxy middleware for development
- WebSocket support (ws package)
- Express static file serving for production builds

**Validation:**
- Zod: Runtime schema validation
- drizzle-zod: Automatic schema generation from database
- zod-validation-error: Friendly error formatting