export type DetectionConfig =
  | { kind: "url_path"; fragments: string[] }
  | { kind: "url_suffix"; suffix: string }
  | { kind: "news_keywords"; fragments: string[] }
  | {
      kind: "html_badge";
      /** ej. a.badge-categoria con href que contenga este fragmento */
      hrefContains: string;
    }
  | {
      kind: "json_ld_article_section";
      /** coincidencia por inclusión (minúsculas) */
      sections: string[];
    };

export type NewsSource = {
  id: string;
  name: string;
  baseUrl: string;
  sitemapUrl: string;
  detection: DetectionConfig;
  /**
   * Hints para extracción de contenido (título/bajada/cuerpo editorial).
   * El extractor es heurístico: estos selectores solo guían la elección del contenedor.
   */
  content?: {
    /** Selectores candidatos (ordenados) para el contenedor principal del artículo. */
    rootSelectors?: string[];
    /** Selectores de nodos a remover dentro del contenedor (share/related/nav/etc). */
    excludeSelectors?: string[];
  };
};

export type ArticleCandidate = {
  url: string;
  title: string;
  /** ISO o texto del sitemap */
  publishedAt: string;
  /** Texto de news:keywords si existe */
  newsKeywords?: string;
};

export type SemanticTagMatch = {
  tag: string;
  similarity: number;
  weightedScore: number;
};

export type ArticleSemantic = {
  score: number;
  matches: SemanticTagMatch[];
};

export type MatchedArticle = ArticleCandidate & {
  sourceId: string;
  sourceName: string;
  content?: NewsSource["content"];
  semantic?: ArticleSemantic;
};
