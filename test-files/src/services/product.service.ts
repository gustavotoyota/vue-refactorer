// Product service
import { apiClient } from './api';
import type { Product, ProductFilter } from '@/types/product';
import { isValidPrice } from '../utils/validators';

export class ProductService {
  async getProduct(productId: string): Promise<Product> {
    return apiClient.get<Product>(`/products/${productId}`);
  }

  async getProducts(filter?: ProductFilter): Promise<Product[]> {
    const query = this.buildFilterQuery(filter);
    return apiClient.get<Product[]>(`/products${query}`);
  }

  async createProduct(data: Omit<Product, 'id'>): Promise<Product> {
    if (!isValidPrice(data.price)) {
      throw new Error('Invalid price');
    }
    return apiClient.post<Product>('/products', data);
  }

  private buildFilterQuery(filter?: ProductFilter): string {
    if (!filter) return '';

    const params = new URLSearchParams();
    if (filter.category) params.append('category', filter.category);
    if (filter.minPrice) params.append('minPrice', filter.minPrice.toString());
    if (filter.maxPrice) params.append('maxPrice', filter.maxPrice.toString());
    if (filter.inStockOnly) params.append('inStock', 'true');

    return params.toString() ? `?${params.toString()}` : '';
  }
}

export const productService = new ProductService();

