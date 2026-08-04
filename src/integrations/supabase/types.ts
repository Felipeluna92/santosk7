export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_tokens: {
        Row: {
          access_token: string
          account_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          account_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_owners: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_accounts: {
        Row: {
          account_type: string | null
          created_at: string
          display_name: string | null
          id: string
          instagram_user_id: string
          last_sync_at: string | null
          profile_picture_url: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_user_id: string
          last_sync_at?: string | null
          profile_picture_url?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          account_type?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_user_id?: string
          last_sync_at?: string | null
          profile_picture_url?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          area: string
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
        }
        Insert: {
          area: string
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json
        }
        Update: {
          area?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
        }
        Relationships: []
      }
      media_items: {
        Row: {
          created_at: string
          favorite: boolean
          id: string
          media_type: string
          public_url: string
          tags: string[]
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          created_at?: string
          favorite?: boolean
          id?: string
          media_type?: string
          public_url: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          created_at?: string
          favorite?: boolean
          id?: string
          media_type?: string
          public_url?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          account_id: string | null
          caption: string | null
          carousel_urls: string[]
          cover_url: string | null
          created_at: string
          error_message: string | null
          hashtags: string | null
          id: string
          media_url: string | null
          meta_container_id: string | null
          meta_media_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          caption?: string | null
          carousel_urls?: string[]
          cover_url?: string | null
          created_at?: string
          error_message?: string | null
          hashtags?: string | null
          id?: string
          media_url?: string | null
          meta_container_id?: string | null
          meta_media_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          caption?: string | null
          carousel_urls?: string[]
          cover_url?: string | null
          created_at?: string
          error_message?: string | null
          hashtags?: string | null
          id?: string
          media_url?: string | null
          meta_container_id?: string | null
          meta_media_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: string
          locale: string
          meta_graph_version: string
          oauth_mode: string
          setup_completed: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locale?: string
          meta_graph_version?: string
          oauth_mode?: string
          setup_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          meta_graph_version?: string
          oauth_mode?: string
          setup_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_app_ownership: { Args: never; Returns: boolean }
      is_app_owner: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
