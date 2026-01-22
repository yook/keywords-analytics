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

      <KeywordsTable columnsKey="keywords-consistency" />
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
}
</style>
