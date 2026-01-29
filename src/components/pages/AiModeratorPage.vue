<template>
  <el-container class="body-page">
    <el-main class="body-main">
      <div class="flex mb-1">
        <KeywordsAdd
          class="flex-1"
          h1="AI модератор"
          pageType="moderationRunning"
          @help="helpDrawer = true"
        />
      </div>
      <KeywordsTable class="table-fill" columnsKey="keywords-moderation" />
    </el-main>
  </el-container>

  <el-drawer
    v-model="helpDrawer"
    title="Как это работает?"
    direction="rtl"
    size="1000px"
  >
    <div class="text-sm leading-6">
      <p class="mb-3">
        Используется модель <b>omni-moderation-latest</b> от OpenAI. Она
        проверяет каждую фразу и возвращает категории, которые сработали.
      </p>
      <p class="mb-2">Критерии модерации включают:</p>
      <ul class="list-disc pl-5 mb-3">
        <li>насилие и угрозы</li>
        <li>самоповреждение</li>
        <li>ненависть и преследование</li>
        <li>сексуальный контент</li>
        <li>прочие запрещённые категории</li>
      </ul>
      <p>
        Если не сработала ни одна категория — ставится зелёная галочка (1). Если
        есть хотя бы одна категория — красный крест (0) и список категорий.
      </p>
    </div>
  </el-drawer>
</template>

<script setup>
import KeywordsAdd from "../keywords/KeywordsAdd.vue";
import KeywordsTable from "../keywords/KeywordsTable.vue";
import { onMounted, ref } from "vue";

const helpDrawer = ref(false);

onMounted(() => {
  console.log("[AiModeratorPage] mounted");
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
