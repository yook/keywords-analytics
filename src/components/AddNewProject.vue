<template>
  <el-button
    type="primary"
    class="add-project-btn no-drag"
    @click="openNewProjectDialog"
  >
    <el-icon><Plus /></el-icon>
    {{ t("header.addProject") }}
  </el-button>

  <el-dialog
    v-model="showNewProjectDialog"
    :title="t('addProject.title') || 'New project'"
    width="600px"
    :modal="true"
    class="no-drag"
    :close-on-click-modal="allowClose"
    :close-on-press-escape="allowClose"
    :show-close="allowClose"
    @close="onRequestClose"
  >
    <div class="flex flex-col items-center">
      <el-form
        label-position="top"
        label-width="100px"
        class="form-compact"
        ref="ruleFormRef"
        :model="RuleForm"
        :rules="rules"
        status-icon
        @keydown.enter.prevent="submitForm(ruleFormRef)"
      >
        <el-form-item
          :label="t('common.name') || 'Name'"
          prop="name"
          class="w-[450px] max-w-[450px]"
        >
          <el-input
            v-model="RuleForm.name"
            :placeholder="t('addProject.namePlaceholder') || 'Project name'"
            autofocus
          />
        </el-form-item>

        <el-form-item
          :label="t('common.url') || 'URL'"
          prop="url"
          class="w-[450px] max-w-[450px]"
        >
          <el-input
            v-model="RuleForm.url"
            :placeholder="
              t('addProject.urlPlaceholder') || 'https://example.com'
            "
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div style="display: flex; justify-content: center; width: 100%">
        <el-button type="primary" @click="submitForm(ruleFormRef)">
          {{ t("common.save") || "Save" }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

const { t } = useI18n();
const emit = defineEmits(["project-created"]);
const project = useProjectStore();

const showNewProjectDialog = ref(false);
const ruleFormRef = ref();
const RuleForm = reactive({ name: "", url: "" });

const rules = reactive({
  name: [
    {
      required: true,
      message: t("addProject.validations.nameRequired") || "Name is required",
      trigger: "blur",
    },
  ],
  url: [
    {
      type: "url",
      message: t("addProject.validations.urlInvalid") || "Invalid URL",
      trigger: "blur",
    },
  ],
});

async function submitForm(formEl: any) {
  if (!formEl) return;
  await formEl.validate(async (valid: boolean, fields: any) => {
    if (valid) {
      try {
        await project.saveNewProject({
          name: RuleForm.name,
          url: RuleForm.url,
        });
        RuleForm.name = "";
        RuleForm.url = "";
        project.getProjects();
        emit("project-created");
        showNewProjectDialog.value = false;
      } catch (error) {
        console.error("Error saving project:", error);
        ElMessage.error(t("addProject.saveError") || "Error saving project");
      }
    } else {
      console.log("error submit!", fields);
    }
  });
}

function openNewProjectDialog() {
  showNewProjectDialog.value = true;
}

const allowClose = computed(
  () => !!(project.projectsList && project.projectsList.length > 0),
);

function onRequestClose() {
  if (!allowClose.value) {
    ElMessage.warning(
      t("addProject.createFirstWarning") ||
        "Создайте проект прежде чем закрывать диалог",
    );
    showNewProjectDialog.value = true;
    return;
  }
  showNewProjectDialog.value = false;
}

const autoOpened = ref(false);
watch(
  () => ({
    len: project.projectsList?.length ?? 0,
    loaded: project.projectsLoaded,
  }),
  ({ len, loaded }) => {
    if (
      loaded &&
      len === 0 &&
      !showNewProjectDialog.value &&
      !autoOpened.value
    ) {
      showNewProjectDialog.value = true;
      autoOpened.value = true;
    }
  },
  { immediate: true, deep: false },
);

watch(
  () => showNewProjectDialog.value,
  (val) => {
    if (
      val === false &&
      !(project.projectsList && project.projectsList.length > 0)
    ) {
      showNewProjectDialog.value = true;
      ElMessage.warning(
        t("addProject.createFirstWarning") ||
          "Создайте проект прежде чем закрывать диалог",
      );
    }
  },
);
</script>

<style scoped>
.input-with-select .el-input-group__prepend {
  background-color: var(--el-fill-color-blank);
}

.add-project {
  margin: 70px 0 50px;
  text-align: center;
}
.el-form-item.el-form-item--large {
  margin-right: 0px;
}
.alert {
  text-align: -webkit-center;
}

.el-dialog__body {
  padding-bottom: 6px !important;
}

.form-compact .el-form-item {
  margin-bottom: 10px;
}
.form-compact .el-form-item:last-of-type {
  margin-bottom: 6px;
}

.add-project-btn .el-icon {
  margin-right: 8px;
  display: inline-flex;
  align-items: center;
}

html.dark .add-project-btn {
  background-color: #2d3748 !important;
  border-color: #4a5568 !important;
  color: #e2e8f0 !important;
}

html.dark .add-project-btn:hover {
  background-color: #4a5568 !important;
  border-color: #718096 !important;
  color: #f7fafc !important;
}
</style>
