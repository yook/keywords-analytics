<template>
  <el-container class="body-page">
    <el-main class="body-main">
      <div class="flex mb-1">
        <KeywordsAdd
          class="flex-1"
          h1="Проверка согласованности"
          pageType="morphologyCheckRunning"
        />
      </div>

      <KeywordsTable
        :activeColumns="activeColumns"
        columnsKey="keywords-consistency"
      />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import KeywordsAdd from "../keywords/KeywordsAdd.vue";
import KeywordsTable from "../keywords/KeywordsTable.vue";
import { onMounted, ref, watch } from "vue";

const PAGE_COLUMNS_KEY = "keywords-consistency-table-columns";
const defaultColumns = ["is_valid_headline", "validation_reason"];
function getSavedColumns() {
  try {
    const saved = localStorage.getItem(PAGE_COLUMNS_KEY);
    if (saved) {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {}
  return null;
}
const activeColumns = ref(getSavedColumns() || defaultColumns);

watch(
  activeColumns,
  (val) => {
    try {
      localStorage.setItem(PAGE_COLUMNS_KEY, JSON.stringify(val));
    } catch (e) {}
  },
  { deep: true }
);

onMounted(() => {
  console.log("[ConsistencyCheckPage] mounted");
});
</script>

<style scoped>
.body-main {
  height: 100%;
}
</style>
