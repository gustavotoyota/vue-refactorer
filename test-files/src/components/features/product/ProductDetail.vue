<script setup lang="ts">
import { computed } from "vue";
import { useProduct } from "@/composables/useProduct";
import ProductCard from "./ProductCard.vue";
import { Button, Input } from "../../common";
import { capitalize } from "@/utils/string-utils";
import { formatPrice } from "~/utils/format-utils";

interface Props {
  productId: string;
}

const props = defineProps<Props>();

const { product, isLoading } = useProduct(props.productId);

const fullPrice = computed(() => {
  return product.value ? formatPrice(product.value.price) : "N/A";
});

const categoryDisplay = computed(() => {
  return product.value ? capitalize(product.value.category) : "";
});

function handleAddToCart() {
  if (product.value) {
    console.log("Adding to cart:", product.value.id);
  }
}

function handleViewSimilar() {
  if (product.value) {
    console.log("Viewing similar products to:", product.value.category);
  }
}
</script>

<template>
  <div class="product-detail">
    <div v-if="isLoading">Loading product details...</div>
    <div v-else-if="product">
      <h1>{{ product.name }}</h1>
      <p class="description">{{ product.description }}</p>
      <div class="details">
        <p class="price">{{ fullPrice }}</p>
        <p class="category">Category: {{ categoryDisplay }}</p>
        <p
          :class="{
            'in-stock': product.inStock,
            'out-of-stock': !product.inStock,
          }"
        >
          {{ product.inStock ? "In Stock" : "Out of Stock" }}
        </p>
      </div>
      <div class="actions">
        <Button
          label="Add to Cart"
          :disabled="!product.inStock"
          @click="handleAddToCart"
        />
        <Button
          label="View Similar"
          variant="secondary"
          @click="handleViewSimilar"
        />
      </div>
      <div class="card-preview">
        <h3>Preview</h3>
        <ProductCard :product="product" :show-full-description="true" />
      </div>
    </div>
  </div>
</template>
