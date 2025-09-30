<script setup lang="ts">
import { ref, computed } from "vue";
import type { Product, ProductFilter } from "~/types/product";
import ProductCard from "./ProductCard.vue";
import { Input } from "@/components/common";

interface Props {
  products: Product[];
}

const props = defineProps<Props>();

const filter = ref<ProductFilter>({
  inStockOnly: false,
});

const searchQuery = ref("");

const filteredProducts = computed(() => {
  return props.products.filter((product) => {
    if (filter.value.inStockOnly && !product.inStock) {
      return false;
    }
    if (filter.value.category && product.category !== filter.value.category) {
      return false;
    }
    if (filter.value.minPrice && product.price < filter.value.minPrice) {
      return false;
    }
    if (filter.value.maxPrice && product.price > filter.value.maxPrice) {
      return false;
    }
    if (searchQuery.value) {
      return product.name
        .toLowerCase()
        .includes(searchQuery.value.toLowerCase());
    }
    return true;
  });
});

function handleAddToCart(productId: string) {
  console.log("Adding to cart:", productId);
}

function handleViewDetails(productId: string) {
  console.log("Viewing details:", productId);
}

function toggleInStockFilter() {
  filter.value.inStockOnly = !filter.value.inStockOnly;
}
</script>

<template>
  <div class="product-list">
    <div class="filters">
      <Input v-model="searchQuery" placeholder="Search products..." />
      <button @click="toggleInStockFilter">
        {{ filter.inStockOnly ? "Show All" : "In Stock Only" }}
      </button>
    </div>
    <div class="products">
      <ProductCard
        v-for="product in filteredProducts"
        :key="product.id"
        :product="product"
        @add-to-cart="handleAddToCart"
        @view-details="handleViewDetails"
      />
    </div>
  </div>
</template>
