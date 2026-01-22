// Minimal types for keywords and loading options
export type Keyword = {
  id: number | string;
  projectId?: string;
  keyword: string;
  created_at?: string;
  lemma?: string;
  tags?: string;
  grammemes?: string;
  morphology_processed?: number;
  category_name?: string;
  category_similarity?: number;
  class_name?: string;
  class_similarity?: number;
  classification_label?: string;
  classification_score?: number;
  cluster_label?: string;
  cluster_score?: number;
  target_query?: number | boolean;
  is_valid_headline?: number | boolean;
};

export type LoadKeywordsOptions = {
  skip?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  resetSearch?: boolean;
  after?: any;
  searchQuery?: string;
};
export type ColumnDef = {
  prop: string
  name?: string
  width?: number
  disabled?: boolean
}
