<template>
  <el-container class="body-page">
    <el-main class="body-main">
      <div class="flex mb-1">
        <KeywordsAdd
          class="flex-1"
          h1="Фильтр по стоп-словам"
          pageType="stopwordsRunning"
        />
      </div>
      <KeywordsTable
        :activeColumns="activeColumns"
        columnsKey="keywords-filter"
      />
    </el-main>
  </el-container>
</template>

<script setup>
import KeywordsAdd from "../keywords/KeywordsAdd.vue";
import KeywordsMenu from "../keywords/KeywordsMenu.vue";
import KeywordsTable from "../keywords/KeywordsTable.vue";
import { onMounted, ref, watch } from "vue";

const PAGE_COLUMNS_KEY = "keywords-filter-table-columns";
const defaultColumns = ["target_query", "blocking_rule"];
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
  console.log("[KeywordsFilter] mounted");
});
</script>

<style scoped>
.body-main {
  height: 100%;
}
</style>
