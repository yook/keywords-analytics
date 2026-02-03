/**
 * Clustering Worker
 * Implements Connected Components and DBSCAN clustering algorithms for keyword embeddings
 */

interface ClusteringItem {
  id: string;
  keyword: string;
  embedding: number[];
}

interface ClusterResult {
  id: string;
  cluster: number;
  cluster_label: string;
  cluster_score?: number;
}

interface ConnectedComponentsParams {
  items: ClusteringItem[];
  threshold: number;
}

interface DBSCANParams {
  items: ClusteringItem[];
  eps: number;
  minPts: number;
}

// Math helpers
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== b.length) return 0;
  
  let dot = 0;
  let na = 0;
  let nb = 0;
  
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  
  na = Math.sqrt(na) || 1e-12;
  nb = Math.sqrt(nb) || 1e-12;
  return dot / (na * nb);
}

function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Connected Components clustering with progress reporting
 * Groups items where cosine similarity >= threshold
 * Optimized with batching to prevent UI freezing on large datasets
 */
async function buildClustersWithComponents(
  params: ConnectedComponentsParams,
  messageId: number
): Promise<ClusterResult[]> {
  const { items, threshold } = params;
  const n = items.length;
  
  // Build adjacency graph with progress reporting and batching
  const graph = new Map<number, Set<number>>();
  const totalComparisons = (n * (n - 1)) / 2;
  let completedComparisons = 0;
  let lastReportedPercent = 0;
  
  // Batch size for yielding control to prevent blocking
  const COMPARISON_BATCH_SIZE = 5000;
  let batchComparisons = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
      if (sim >= threshold) {
        if (!graph.has(i)) graph.set(i, new Set());
        if (!graph.has(j)) graph.set(j, new Set());
        graph.get(i)!.add(j);
        graph.get(j)!.add(i);
      }
      
      completedComparisons++;
      batchComparisons++;
      
      // Yield control every COMPARISON_BATCH_SIZE comparisons to prevent blocking
      if (batchComparisons >= COMPARISON_BATCH_SIZE) {
        batchComparisons = 0;
        // Use setTimeout with 0 delay to yield to event loop
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Report progress with finer granularity (0.1%)
      const currentPercent = Math.round((completedComparisons / totalComparisons) * 500) / 10; // 0..50
      if (currentPercent > lastReportedPercent) {
        lastReportedPercent = currentPercent;
        // Send progress message
        self.postMessage({
          id: messageId,
          type: "progress",
          progress: {
            stage: "graph",
            percent: currentPercent,
            comparisons: completedComparisons,
            total: totalComparisons,
          },
        });
      }
    }
  }
  
  // Find connected components via DFS (remaining 50% of progress)
  const visited = new Set<number>();
  const results: ClusterResult[] = [];
  let clusterId = 1;
  let processedNodes = 0;
  
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    if (!graph.has(i)) {
      // Singleton (no connections) - assign to cluster 0 (noise)
      results.push({
        id: items[i].id,
        cluster: 0,
        cluster_label: "0"
      });
      processedNodes++;
      
      // Report progress
      const currentPercent = 50 + Math.round((processedNodes / n) * 500) / 10; // 50..100
      if (currentPercent > lastReportedPercent) {
        lastReportedPercent = currentPercent;
        self.postMessage({
          id: messageId,
          type: "progress",
          progress: {
            stage: "clustering",
            percent: currentPercent,
            processed: processedNodes,
            total: n,
          },
        });
      }
      continue;
    }
    
    // DFS to find component
    const stack = [i];
    const component: number[] = [];
    
    while (stack.length > 0) {
      const v = stack.pop()!;
      if (visited.has(v)) continue;
      visited.add(v);
      component.push(v);
      
      const neighbors = graph.get(v) || new Set();
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          stack.push(nb);
        }
      }
    }
    
    // Assign cluster ID to all items in component
    if (component.length > 1) {
      for (const idx of component) {
        results.push({
          id: items[idx].id,
          cluster: clusterId,
          cluster_label: String(clusterId)
        });
      }
      clusterId++;
    } else {
      // Single item component - treat as noise
      results.push({
        id: items[component[0]].id,
        cluster: 0,
        cluster_label: "0"
      });
    }
    
    processedNodes += component.length;
    
    // Report progress
    const currentPercent = 50 + Math.round((processedNodes / n) * 500) / 10; // 50..100
    if (currentPercent > lastReportedPercent) {
      lastReportedPercent = currentPercent;
      self.postMessage({
        id: messageId,
        type: "progress",
        progress: {
          stage: "clustering",
          percent: currentPercent,
          processed: processedNodes,
          total: n,
        },
      });
    }
  }
  
  // Send final 100% progress
  self.postMessage({
    id: messageId,
    type: "progress",
    progress: {
      stage: "clustering",
      percent: 100,
      processed: n,
      total: n,
    },
  });
  
  return calculateConfidence(items, results);
}

/**
 * DBSCAN clustering with progress reporting
 * Density-based clustering using cosine distance
 * Optimized with batching to prevent UI freezing on large datasets
 */
async function buildClustersWithDBSCAN(
  params: DBSCANParams,
  messageId: number
): Promise<ClusterResult[]> {
  const { items, eps, minPts } = params;
  const n = items.length;
  
  const visited = new Array(n).fill(false);
  const clusterId = new Array(n).fill(-1); // -1 = noise
  let currentCluster = 0;
  let processedPoints = 0;
  let lastReportedPercent = 0;
  
  // Batch size for yielding control
  const BATCH_SIZE = 100;
  
  function rangeQuery(pointIdx: number): number[] {
    const neighbors: number[] = [];
    for (let i = 0; i < n; i++) {
      if (cosineDistance(items[pointIdx].embedding, items[i].embedding) <= eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }
  
  async function expandCluster(pointIdx: number, neighbors: number[]) {
    clusterId[pointIdx] = currentCluster;
    const queue = [...neighbors];
    let expansionCount = 0;
    
    while (queue.length > 0) {
      const q = queue.shift()!;
      if (!visited[q]) {
        visited[q] = true;
        const qNeighbors = rangeQuery(q);
        if (qNeighbors.length >= minPts) {
          queue.push(...qNeighbors);
        }
      }
      if (clusterId[q] === -1) {
        clusterId[q] = currentCluster;
      }
      
      // Yield control periodically during cluster expansion
      expansionCount++;
      if (expansionCount % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
  
  // Main DBSCAN loop with progress reporting
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const neighbors = rangeQuery(i);
    
    if (neighbors.length < minPts) {
      clusterId[i] = -1; // noise
    } else {
      await expandCluster(i, neighbors);
      currentCluster++;
    }
    
    processedPoints++;
    
    // Yield control periodically
    if (processedPoints % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Report progress every 5%
    const currentPercent = Math.round((processedPoints / n) * 1000) / 10; // 0..100 with 0.1% precision
    if (currentPercent > lastReportedPercent) {
      lastReportedPercent = currentPercent;
      self.postMessage({
        id: messageId,
        type: "progress",
        progress: {
          stage: "dbscan",
          percent: currentPercent,
          processed: processedPoints,
          total: n,
          clusters: currentCluster,
        },
      });
    }
  }
  
  // Convert to results
  const results: ClusterResult[] = [];
  for (let i = 0; i < n; i++) {
    const cid = clusterId[i];
    // Noise (-1) becomes cluster 0, others shifted by 1
    const finalCluster = cid === -1 ? 0 : cid + 1;
    results.push({
      id: items[i].id,
      cluster: finalCluster,
      cluster_label: String(finalCluster)
    });
  }
  
  // Send final 100% progress
  self.postMessage({
    id: messageId,
    type: "progress",
    progress: {
      stage: "dbscan",
      percent: 100,
      processed: n,
      total: n,
      clusters: currentCluster,
    },
  });
  
  return calculateConfidence(items, results);
}

/**
 * Calculate confidence score for each item based on its similarity to cluster centroid
 */
function calculateConfidence(
  items: ClusteringItem[],
  results: ClusterResult[],
): ClusterResult[] {
  // Group indices by cluster ID
  const clusterGroups = new Map<number, number[]>();
  for (let i = 0; i < results.length; i++) {
    const cid = results[i].cluster;
    if (cid === 0) {
      results[i].cluster_score = 0;
      continue;
    }
    if (!clusterGroups.has(cid)) clusterGroups.set(cid, []);
    clusterGroups.get(cid)!.push(i);
  }

  // Process each cluster
  for (const [cid, indices] of clusterGroups.entries()) {
    if (indices.length === 0) continue;

    // Handle single-item clusters (though CC usually filters these to 0)
    if (indices.length === 1) {
      results[indices[0]].cluster_score = 1.0;
      continue;
    }

    const firstEmb = items[indices[0]].embedding;
    const dim = firstEmb.length;
    const centroid = new Array(dim).fill(0);

    // Calculate mean embedding
    for (const idx of indices) {
      const emb = items[idx].embedding;
      for (let d = 0; d < dim; d++) {
        centroid[d] += emb[d] || 0;
      }
    }

    for (let d = 0; d < dim; d++) {
      centroid[d] /= indices.length;
    }

    // Calculate similarity of each item to the centroid
    for (const idx of indices) {
      results[idx].cluster_score = cosineSimilarity(
        items[idx].embedding,
        centroid,
      );
    }
  }

  return results;
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  
  try {
    if (type === "cluster-components") {
      const results = await buildClustersWithComponents(payload, id);
      self.postMessage({ id, type: "result", result: results });
    } else if (type === "cluster-dbscan") {
      const results = await buildClustersWithDBSCAN(payload, id);
      self.postMessage({ id, type: "result", result: results });
    } else {
      self.postMessage({ 
        id, 
        type: "error", 
        error: `Unknown message type: ${type}` 
      });
    }
  } catch (error) {
    self.postMessage({ 
      id, 
      type: "error", 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
};
