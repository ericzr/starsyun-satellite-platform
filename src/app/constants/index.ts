/**
 * Application-wide constants
 */

// API Endpoints (for future backend integration)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.starsyun.com';
export const API_ENDPOINTS = {
  products: '/api/products',
  satellites: '/api/satellites',
  orders: '/api/orders',
  auth: '/api/auth',
} as const;

// Map Configuration
export const MAP_CONFIG = {
  defaultCenter: { lng: 116.3, lat: 39.9 } as const,
  defaultZoom: 4,
  minZoom: 2,
  maxZoom: 18,
  styleUrl: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

// Pagination
export const PAGINATION = {
  defaultPageSize: 20,
  pageSizeOptions: [10, 20, 50, 100],
} as const;

// File Upload
export const UPLOAD_LIMITS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedGeoTypes: ['.geojson', '.kml', '.shp'],
} as const;

// Cache Duration (milliseconds)
export const CACHE_DURATION = {
  short: 5 * 60 * 1000, // 5 minutes
  medium: 30 * 60 * 1000, // 30 minutes
  long: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Date Formats
export const DATE_FORMATS = {
  display: 'yyyy-MM-dd',
  displayWithTime: 'yyyy-MM-dd HH:mm',
  api: "yyyy-MM-dd'T'HH:mm:ss'Z'",
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  theme: 'theme',
  language: 'language',
  user: 'user',
  recentSearches: 'recentSearches',
  compareList: 'compareList',
} as const;
