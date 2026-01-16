<template>
  <div class="p-4">
    <h3>Морфология</h3>
    <p class="text-sm text-gray-500">
      Модуль морфологии уже ориентирован на Словарь лемм, который запускается
      через SharedWorker и использует загруженные DAWG-файлы. Дополнительных
      конфигураций не требуется.
    </p>
    <div class="mt-6 flex justify-end space-x-2">
      <el-button type="primary" @click="$emit('close-dialog')"
        >Закрыть</el-button
      >
    </div>
  </div>
</template>
