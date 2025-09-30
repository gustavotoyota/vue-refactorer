<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Header, Footer, Sidebar } from "./layout";
import { UserProfile } from "./features/user";
import { ProductList } from "./features/product";
import type { Product } from "@/types/product";
import { useAuth } from "@/composables";

const { fetchCurrentUser, isAuthenticated } = useAuth();

const currentView = ref<"home" | "products" | "profile">("home");
const products = ref<Product[]>([
  {
    id: "1",
    name: "Sample Product",
    description: "A great product",
    price: 99.99,
    category: "electronics",
    inStock: true,
  },
]);

onMounted(async () => {
  await fetchCurrentUser();
});

function navigateTo(view: "home" | "products" | "profile") {
  currentView.value = view;
}
</script>

<template>
  <div id="app">
    <Header />
    <div class="main-layout">
      <Sidebar />
      <main>
        <div v-if="currentView === 'home'">
          <h1>Welcome to My App</h1>
        </div>
        <div v-else-if="currentView === 'products'">
          <ProductList :products="products" />
        </div>
        <div v-else-if="currentView === 'profile' && isAuthenticated">
          <UserProfile user-id="123" />
        </div>
      </main>
    </div>
    <Footer />
  </div>
</template>
