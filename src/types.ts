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
  /** Fuente de candidatos. En la mayoría de medios es un sitemap, pero puede ser RSS o un listing HTML. */
  sitemapUrl: string;
  /**
   * Override opcional: usar RSS (feed) o un front/listado HTML en lugar del sitemap.
   * Mantiene compatibilidad hacia atrás: si no está, se usa `sitemapUrl`.
   */
  candidates?: { kind: "sitemap"; url: string } | { kind: "rss"; url: string } | {
    kind: "front";
    url: string;
    /** Match flexible por clases: si el link está dentro de un nodo con alguna de estas clases, se toma. */
    linkContainerClassAnyOf: string[];
  };
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
  /** Opciones para evitar fetch HTML en fuentes bloqueadas (403). */
  semantic?: {
    /** Si está en true, no se hace fetch HTML para scoring/temas (se intenta con `prefetchedText`). */
    disableHtmlFetch?: boolean;
  };
};

export type ArticleCandidate = {
  url: string;
  title: string;
  /** ISO o texto del sitemap */
  publishedAt: string;
  /** Texto de news:keywords si existe */
  newsKeywords?: string;
  /**
   * Texto ya disponible sin abrir el HTML de la nota (ej. RSS description/content).
   * Se usa como fallback para scoring cuando el HTML está bloqueado (403).
   */
  prefetchedText?: string;
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
  disableHtmlFetchForSemantic?: boolean;
  semantic?: ArticleSemantic;
};
