import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { useDexie } from "../composables/useDexie";

export interface TypingSample {
  id?: string;
  label: string;
  text: string;
  projectId?: number | string;
  created_at?: string;
}

export interface ClassificationModel {
  W: number[][];
  b: number[];
  labels: string[];
  D: number;
  model_version: string;
}

export const useTypingStore = defineStore("typing", () => {
  const samples = ref<TypingSample[]>([]);
  const model = ref<ClassificationModel | null>(null);
  const isTraining = ref(false);
  const trainingProgress = ref(0);
  const dexie = useDexie();

  async function loadSamples(projectId: number | string) {
    try {
      const db = await dexie.init();
      const loadedSamples = await dexie.getTypingSamplesByProject(projectId);
      samples.value = loadedSamples;
      console.log("Loaded typing samples for project:", projectId, loadedSamples);
      
      // Load model from database if exists
      await loadModel(projectId);
    } catch (error) {
      console.error("Error loading typing samples:", error);
      ElMessage.error("Failed to load typing samples");
    }
  }

  async function loadModel(projectId: number | string) {
    try {
      const loadedModel = await dexie.getClassificationModel(projectId);
      if (loadedModel) {
        model.value = loadedModel;
        console.log("Loaded classification model for project:", projectId);
      } else {
        model.value = null;
        console.log("No classification model found for project:", projectId);
      }
    } catch (error) {
      console.error("Error loading classification model:", error);
      model.value = null;
    }
  }

  async function saveModel(projectId: number | string, newModel: ClassificationModel) {
    try {
      await dexie.saveClassificationModel(projectId, newModel);
      model.value = newModel;
      console.log("Saved classification model for project:", projectId);
      ElMessage.success("Model saved successfully");
    } catch (error) {
      console.error("Error saving classification model:", error);
      ElMessage.error("Failed to save model");
    }
  }

  async function deleteModel(projectId: number | string) {
    try {
      await dexie.deleteClassificationModel(projectId);
      model.value = null;
      console.log("Deleted classification model for project:", projectId);
      ElMessage.success("Model deleted successfully");
    } catch (error) {
      console.error("Error deleting classification model:", error);
      ElMessage.error("Failed to delete model");
    }
  }

  async function addSamples(
    projectId: number | string,
    newSamples: Array<{ label: string; text: string }>
  ): Promise<boolean> {
    try {
      console.log("Adding typing samples:", newSamples);
      
      // Add to database
      const addedSamples: TypingSample[] = [];
      for (const s of newSamples) {
        const sample: TypingSample = {
          projectId,
          label: s.label,
          text: s.text,
        };
        await dexie.addTypingSample(sample);
        addedSamples.push(sample);
      }
      
      // Reload from database to ensure consistency
      await loadSamples(projectId);
      ElMessage.success("Samples added successfully");
      return true;
    } catch (error) {
      console.error("Error adding typing samples:", error);
      ElMessage.error("Failed to add typing samples");
      return false;
    }
  }

  async function deleteSample(projectId: number | string, sampleId: string | number) {
    try {
      console.log("Deleting typing sample:", sampleId);
      
      // Delete from database
      await dexie.deleteTypingSample(String(sampleId));
      
      // Reload to keep UI in sync
      await loadSamples(projectId);
      ElMessage.success("Sample deleted successfully");
    } catch (error) {
      console.error("Error deleting typing sample:", error);
      ElMessage.error("Failed to delete typing sample");
    }
  }

  async function deleteSamplesByLabel(projectId: number | string, label: string) {
    try {
      console.log("Deleting typing samples by label:", label);
      
      // Delete from database
      await dexie.deleteTypingSamplesByLabel(projectId, label);
      
      // Reload to keep UI in sync
      await loadSamples(projectId);
      ElMessage.success("Samples deleted successfully");
    } catch (error) {
      console.error("Error deleting typing samples by label:", error);
      ElMessage.error("Failed to delete typing samples");
    }
  }

  async function clearSamples(projectId: number | string) {
    try {
      console.log("Clearing all typing samples for project:", projectId);
      
      // Delete from database
      await dexie.clearTypingSamplesByProject(projectId);
      
      // Clear from memory
      samples.value = [];
      ElMessage.success("All samples cleared successfully");
    } catch (error) {
      console.error("Error clearing typing samples:", error);
      ElMessage.error("Failed to clear typing samples");
    }
  }

  return {
    samples,
    model,
    isTraining,
    trainingProgress,
    loadSamples,
    loadModel,
    saveModel,
    deleteModel,
    addSamples,
    deleteSample,
    deleteSamplesByLabel,
    clearSamples,
  };
});
