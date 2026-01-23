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

      <KeywordsTable class="table-fill" columnsKey="keywords-consistency" />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import KeywordsAdd from "../keywords/KeywordsAdd.vue";
import KeywordsTable from "../keywords/KeywordsTable.vue";
import { onMounted } from "vue";

onMounted(() => {
  console.log("[ConsistencyCheckPage] mounted");
});
</script>

<style scoped>
.body-main {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.table-fill {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
