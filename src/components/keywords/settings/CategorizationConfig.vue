<template>
  <div class="p-4">
    <h3>Categorization</h3>
    <p class="text-sm text-gray-500">
      Categorization configuration (placeholder).
    </p>
    <el-input
      v-model="categorySample"
      placeholder="Sample category"
      class="mt-3"
    />
  </div>
</template>

<script setup>
import { ref } from "vue";

const categorySample = ref("");
</script>

<style scoped>
.mt-3 {
  margin-top: 12px;
}
</style>
