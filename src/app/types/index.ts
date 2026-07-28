/**
 * Centralized type definitions
 */

import type { Product, Region, Satellite } from '../data/products';
import type { ValueAddedService } from '../data/products';

// Re-export data types for easier imports
export type { Product, Region, Satellite, ValueAddedService };

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  company?: string;
  avatar?: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  company?: string;
}

// Order Types
export interface Order {
  id: string;
  userId: string;
  products: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  processingLevel?: string;
  services?: ValueAddedService[];
}

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

// Filter Types (extend from FilterPanel)
export interface ProductFilters {
  dataTypes: string[];
  categories: string[];
  processingLevels: string[];
  timeMode: 'preset' | 'range' | 'single';
  timePreset: string;
  dateStart?: string;
  dateEnd?: string;
  resMode: 'preset' | 'range';
  resMax: string;
  resMin?: number;
  resMaxCustom?: number;
  cloudMax: string;
  searchQuery?: string;
  regionId?: string;
}

// Map Types
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'Point' | 'LineString' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][];
  };
  properties?: Record<string, unknown>;
}

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncData<T> = {
  data: Nullable<T>;
  loading: boolean;
  error: Nullable<Error>;
};
