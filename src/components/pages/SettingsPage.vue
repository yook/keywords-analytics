<template>
  <el-container class="m-5 settings-page">
    <el-main>
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <h1>{{ t("settings.title") }}</h1>
          </div>
        </template>
        <div class="settings-content">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-card shadow="never" class="mb-4">
                <template #header>
                  <h2>{{ t("settings.general") }}</h2>
                </template>
                <el-form label-width="150px">
                  <el-form-item
                    :label="t('settings.projectName')"
                    v-if="
                      project.projectsList.length > 0 &&
                      project.currentProjectId
                    "
                  >
                    <el-input v-model="localProjectName" @change="saveData" />
                  </el-form-item>

                  <el-form-item label="" v-if="project.projectsList.length > 0">
                    <el-button
                      @click="deleteProjectConfirm"
                      :icon="Delete"
                      type="danger"
                      plain
                    >
                      {{ t("settings.deleteProject") }}
                    </el-button>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="never" class="mb-4">
                <template #header>
                  <h2>{{ t("settings.additional") }}</h2>
                </template>
                <div class="additional-settings">
                  <el-empty :description="t('settings.inDevelopment')" />
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-card>
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Delete } from "@element-plus/icons-vue";
import { ElMessageBox, ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../../stores/project";
import { socket } from "../../stores/socket-client";

const { t } = useI18n();
const project = useProjectStore();

// Local reactive name bound to input
const localProjectName = ref("");

const updateLocalNameFromStore = () => {
  const cur = project.projectsList.find(
    (p) => String(p.value) === String(project.currentProjectId)
  );
  localProjectName.value = cur ? cur.label : "";
};

onMounted(() => {
  updateLocalNameFromStore();
});

// Watch for project changes
onMounted(() => {
  project.getProjects();
  updateLocalNameFromStore();
});

onUnmounted(() => {
  // cleanup if needed
});

const saveData = async () => {
  // Update in-memory label
  const idx = project.projectsList.findIndex(
    (p) => String(p.value) === String(project.currentProjectId)
  );
  if (idx !== -1) {
    project.projectsList[idx].label = localProjectName.value;
  }
  // Persist
  await project.updateProject({
    id: project.currentProjectId,
    name: localProjectName.value,
  });
  try {
    await project.refreshProjectsList();
  } catch (_) {}
};

const deleteProjectConfirm = () => {
  ElMessageBox.confirm(
    t("settings.confirmDelete"),
    t("settings.confirmDeleteTitle"),
    {
      confirmButtonText: t("settings.confirmButton"),
      cancelButtonText: t("settings.cancel"),
      type: "error",
      icon: Delete,
      customClass: "delete-msgbox-class",
    }
  )
    .then(async () => {
      const id = project.currentProjectId;
      await project.deleteProject(id);
      ElMessage.success({
        message: t("settings.projectDeletedSuccess"),
        duration: 3000,
      });
    })
    .catch(() => {});
};

// Socket event handlers (optional)
const handleProjectDeleted = (deletedProjectId) => {
  ElMessage.success({
    message: t("settings.projectDeletedSuccess"),
    duration: 3000,
  });
};

const handleProjectDeleteError = (err) => {
  ElMessage.error({
    message: t("settings.projectDeletedError") + ": " + err,
    duration: 5000,
  });
};

onMounted(() => {
  try {
    socket.on("projectDeleted", handleProjectDeleted);
    socket.on("projectDeleteError", handleProjectDeleteError);
  } catch (e) {}
});

onUnmounted(() => {
  try {
    socket.off("projectDeleted", handleProjectDeleted);
    socket.off("projectDeleteError", handleProjectDeleteError);
  } catch (e) {}
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.settings-content {
  min-height: 400px;
}

.mb-4 {
  margin-bottom: 1rem;
}

.additional-settings {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
