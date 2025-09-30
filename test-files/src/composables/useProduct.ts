// Product composable
import { ref, computed } from 'vue';
import type { Product, ProductFilter } from '~/types/product';
import { productService } from '@/services/product.service';
import { formatPrice } from '../utils/format-utils';

export function useProduct(productId?: string) {
  const product = ref<Product | null>(null);
  const products = ref<Product[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const hasProducts = computed(() => products.value.length > 0);
  const inStockProducts = computed(() =>
    products.value.filter(p => p.inStock)
  );

  async function fetchProduct(id: string) {
    isLoading.value = true;
    error.value = null;
    try {
      product.value = await productService.getProduct(id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch product';
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchProducts(filter?: ProductFilter) {
    isLoading.value = true;
    error.value = null;
    try {
      products.value = await productService.getProducts(filter);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch products';
    } finally {
      isLoading.value = false;
    }
  }

  function getProductPrice(productOrId: Product | string): string {
    const prod = typeof productOrId === 'string'
      ? products.value.find(p => p.id === productOrId)
      : productOrId;

    return prod ? formatPrice(prod.price) : 'N/A';
  }

  if (productId) {
    fetchProduct(productId);
  }

  return {
    product,
    products,
    isLoading,
    error,
    hasProducts,
    inStockProducts,
    fetchProduct,
    fetchProducts,
    getProductPrice,
  };
}

