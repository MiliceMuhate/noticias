/**
 * Tipos da base de dados Supabase.
 *
 * Escrito à mão a partir de docs/DATA_MODEL.md para o arranque; substituir pelo
 * output de `pnpm gen:types` (supabase gen types typescript --local) assim que
 * o ambiente local estiver a correr — o formato é o mesmo.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type TopicStatus =
  | 'detected'
  | 'scored'
  | 'approved_for_gen'
  | 'rejected'
  | 'processing'
  | 'generated'
  | 'failed'
export type ContentStatus = 'pending_review' | 'published' | 'rejected'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type TranslationLang = 'en' | 'es' | 'fr'
export type TranslationStatus = 'ready' | 'blocked' | 'failed'
export type Momentum = 'rising' | 'peaked' | 'falling'
export type Desk = 'resultados' | 'transferencias' | 'analise' | 'institucional'

// content_items.author — autoria transparente, não pessoas fictícias (ver
// docs/publicador/AUTHORS.md §1).
export interface AuthorInfo {
  byline: string
  desk: Desk
  editor: string
  ai_assisted: boolean
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          role: string
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          id: string
          kind: string
          niche: string
          config: Json
          enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          kind: string
          niche: string
          config?: Json
          enabled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          kind?: string
          niche?: string
          config?: Json
          enabled?: boolean
          created_at?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          id: string
          source_id: string
          term: string
          region: string
          category: string | null
          score: number | null
          momentum: Momentum | null
          status: TopicStatus
          raw_data: Json | null
          detected_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source_id: string
          term: string
          region: string
          category?: string | null
          score?: number | null
          momentum?: Momentum | null
          status?: TopicStatus
          raw_data?: Json | null
          detected_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          source_id?: string
          term?: string
          region?: string
          category?: string | null
          score?: number | null
          momentum?: Momentum | null
          status?: TopicStatus
          raw_data?: Json | null
          detected_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sport_facts: {
        Row: {
          id: string
          topic_id: string
          provider: string
          data: Json
          source_url: string | null
          fetched_at: string
        }
        Insert: {
          id?: string
          topic_id: string
          provider: string
          data: Json
          source_url?: string | null
          fetched_at?: string
        }
        Update: {
          id?: string
          topic_id?: string
          provider?: string
          data?: Json
          source_url?: string | null
          fetched_at?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          id: string
          topic_id: string
          status: ContentStatus
          title: string | null
          body: string | null
          media_url: string | null
          author: AuthorInfo | null
          metadata: Json
          review_note: string | null
          created_at: string
          published_at: string | null
          published_url: string | null
          published_via: 'manual' | 'auto' | null
          view_count: number
        }
        Insert: {
          id?: string
          topic_id: string
          status?: ContentStatus
          title?: string | null
          body?: string | null
          media_url?: string | null
          author?: AuthorInfo | null
          metadata?: Json
          review_note?: string | null
          created_at?: string
          published_at?: string | null
          published_url?: string | null
          published_via?: 'manual' | 'auto' | null
          view_count?: number
        }
        Update: {
          id?: string
          topic_id?: string
          status?: ContentStatus
          title?: string | null
          body?: string | null
          media_url?: string | null
          author?: AuthorInfo | null
          metadata?: Json
          review_note?: string | null
          created_at?: string
          published_at?: string | null
          published_url?: string | null
          published_via?: 'manual' | 'auto' | null
          view_count?: number
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          type: string
          content_item_id: string | null
          topic_id: string | null
          payload: Json
          status: JobStatus
          attempts: number
          error: string | null
          input_tokens: number
          output_tokens: number
          cost_usd: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: string
          content_item_id?: string | null
          topic_id?: string | null
          payload?: Json
          status?: JobStatus
          attempts?: number
          error?: string | null
          input_tokens?: number
          output_tokens?: number
          cost_usd?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          type?: string
          content_item_id?: string | null
          topic_id?: string | null
          payload?: Json
          status?: JobStatus
          attempts?: number
          error?: string | null
          input_tokens?: number
          output_tokens?: number
          cost_usd?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor: string | null
          action: string
          entity: string
          entity_id: string
          detail: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor?: string | null
          action: string
          entity: string
          entity_id: string
          detail?: Json
          created_at?: string
        }
        Update: {
          id?: string
          actor?: string | null
          action?: string
          entity?: string
          entity_id?: string
          detail?: Json
          created_at?: string
        }
        Relationships: []
      }
      content_translations: {
        Row: {
          id: string
          content_item_id: string
          lang: TranslationLang
          status: TranslationStatus
          title: string | null
          body: string | null
          dek: string | null
          seo_description: string | null
          tags: Json
          slug: string | null
          source_hash: string
          originality: Json | null
          error: string | null
          attempts: number
          created_at: string
          updated_at: string
        }
        // escrita só pelo backend (service_role)
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      published_articles: {
        Row: {
          id: string
          title: string | null
          body: string | null
          media_url: string | null
          author: string | null
          editor: string | null
          desk: Desk | null
          ai_assisted: boolean
          published_at: string | null
          published_url: string | null
          view_count: number
          slug: string
          seo_description: string | null
          dek: string | null
          tags: Json
          source_name: string | null
          source_url: string | null
          category: string | null
          /** 'pt' (content_items) ou a língua de uma content_translations 'ready' */
          lang: string
          /** [{lang, slug}] de todas as versões deste artigo, incluindo esta */
          alternates: Json
        }
        Relationships: []
      }
    }
    Functions: {
      is_operator: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      increment_article_view: {
        Args: { p_id: string }
        Returns: void
      }
      set_ai_provider_key: {
        Args: { p_provider_id: string; p_key: string | null }
        Returns: void
      }
      ai_provider_key_status: {
        Args: Record<string, never>
        Returns: { provider_id: string; updated_at: string }[]
      }
    }
    Enums: {
      topic_status: TopicStatus
      content_status: ContentStatus
      job_status: JobStatus
    }
  }
}

// Atalhos convenientes
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Topic = Tables<'topics'>
export type Source = Tables<'sources'>
export type ContentItem = Tables<'content_items'>
export type SportFact = Tables<'sport_facts'>
export type Job = Tables<'jobs'>
export type Profile = Tables<'profiles'>
export type PublishedArticle = Database['public']['Views']['published_articles']['Row']
export type ContentTranslation = Tables<'content_translations'>
