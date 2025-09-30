<script setup lang="ts">
import { ref, computed } from "vue";
import type { Product } from "~/types/product";
import { Button } from "@/components/common";
import { formatPrice } from "@/utils/format-utils";

interface CartItem {
  product: Product;
  quantity: number;
}

const cartItems = ref<CartItem[]>([]);

const totalItems = computed(() =>
  cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
);

const totalPrice = computed(() =>
  cartItems.value.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
);

const formattedTotal = computed(() => formatPrice(totalPrice.value));

function addToCart(product: Product) {
  const existing = cartItems.value.find(
    (item) => item.product.id === product.id
  );
  if (existing) {
    existing.quantity++;
  } else {
    cartItems.value.push({ product, quantity: 1 });
  }
}

function removeFromCart(productId: string) {
  const index = cartItems.value.findIndex(
    (item) => item.product.id === productId
  );
  if (index !== -1) {
    cartItems.value.splice(index, 1);
  }
}

function updateQuantity(productId: string, quantity: number) {
  const item = cartItems.value.find((i) => i.product.id === productId);
  if (item) {
    item.quantity = Math.max(1, quantity);
  }
}

function clearCart() {
  cartItems.value = [];
}

function checkout() {
  console.log("Checking out with items:", cartItems.value);
}
</script>

<template>
  <div class="shopping-cart">
    <h2>Shopping Cart ({{ totalItems }} items)</h2>
    <div v-if="cartItems.length === 0" class="empty-cart">
      Your cart is empty
    </div>
    <div v-else>
      <div v-for="item in cartItems" :key="item.product.id" class="cart-item">
        <div class="item-info">
          <h3>{{ item.product.name }}</h3>
          <p>{{ formatPrice(item.product.price) }}</p>
        </div>
        <div class="item-actions">
          <input
            type="number"
            :value="item.quantity"
            min="1"
            @input="(e) => updateQuantity(item.product.id, parseInt((e.target as HTMLInputElement).value))"
          />
          <Button
            label="Remove"
            variant="danger"
            @click="removeFromCart(item.product.id)"
          />
        </div>
      </div>
      <div class="cart-summary">
        <p class="total">Total: {{ formattedTotal }}</p>
        <div class="actions">
          <Button label="Clear Cart" variant="secondary" @click="clearCart" />
          <Button label="Checkout" variant="primary" @click="checkout" />
        </div>
      </div>
    </div>
  </div>
</template>
