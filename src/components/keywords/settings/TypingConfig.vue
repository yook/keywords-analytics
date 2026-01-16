<template>
  <div class="p-4">
    <h3>Определение класса</h3>
    <p class="text-sm text-gray-500 mb-4">
      Настройки определения класса ключевых запросов.
    </p>
    <el-switch v-model="enabled" class="mt-3"
      >Включить определение класса</el-switch
    >
    <div class="mt-6">
      <el-button type="primary" @click="runTypingProcess">
        Начать определение класса
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, defineEmits } from "vue";
import { useKeywordsStore } from "../../../stores/keywords";
import { useProjectStore } from "../../../stores/project";

const keywordsStore = useKeywordsStore();
const project = useProjectStore();
const enabled = ref(false);
const emit = defineEmits(["close-dialog"]);

async function runTypingProcess() {
  if (!project.currentProjectId) {
    alert("Сначала выберите проект");
    return;
  }

  // Закрыть диалог после запуска
  emit("close-dialog");

  // Здесь можно добавить логику запуска процесса определения класса
  console.log("Starting typing process...");
}
</script>

<style scoped>
.mt-3 {
  margin-top: 12px;
}
.mt-6 {
  margin-top: 24px;
}
.p-4 {
  padding: 16px;
}
</style>
