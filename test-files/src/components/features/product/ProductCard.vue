<script setup lang="ts">
import type { Product } from "@/types/product";
import { capitalize, truncate } from "@/utils/string-utils";
import { isValidPrice } from "~/utils/validators";
import { Button } from "../../common";

interface Props {
  product: Product;
  showFullDescription?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showFullDescription: false,
});

const emit = defineEmits<{
  "add-to-cart": [productId: string];
  "view-details": [productId: string];
}>();

function formatPrice(price: number): string {
  if (!isValidPrice(price)) return "N/A";
  return `$${price.toFixed(2)}`;
}

function getCategoryLabel(category: string): string {
  return capitalize(category);
}

function getDescription(): string {
  if (props.showFullDescription) {
    return props.product.description;
  }
  return truncate(props.product.description, 100);
}

function handleAddToCart() {
  if (props.product.inStock) {
    emit("add-to-cart", props.product.id);
  }
}

function handleViewDetails() {
  emit("view-details", props.product.id);
}
</script>

<template>
  <div class="product-card">
    <div class="product-info">
      <h3>{{ product.name }}</h3>
      <p>{{ getDescription() }}</p>
      <p class="price">{{ formatPrice(product.price) }}</p>
      <span class="category">{{ getCategoryLabel(product.category) }}</span>
      <span v-if="!product.inStock" class="out-of-stock">Out of Stock</span>
    </div>
    <div class="actions">
      <Button
        label="Add to Cart"
        :disabled="!product.inStock"
        @click="handleAddToCart"
      />
      <Button
        label="View Details"
        variant="secondary"
        @click="handleViewDetails"
      />
    </div>
  </div>
</template>
