<template>
  <div class="p-4">
    <h3>Clustering</h3>
    <p class="text-sm text-gray-500">Clustering configuration (placeholder).</p>
    <el-slider v-model="clusters" :min="1" :max="20" class="mt-3" />
    <div class="mt-2">Clusters: {{ clusters }}</div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const clusters = ref(5);
</script>

<style scoped>
.mt-3 {
  margin-top: 12px;
}
.mt-2 {
  margin-top: 8px;
}
</style>
