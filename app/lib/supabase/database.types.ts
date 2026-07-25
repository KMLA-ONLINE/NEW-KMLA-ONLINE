export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_notification_settings: {
        Row: {
          conversation_id: number
          created_at: string
          level: Database["public"]["Enums"]["notification_level"]
          muted_until: string | null
          updated_at: string | null
          user_id: number
        }
        Insert: {
          conversation_id: number
          created_at?: string
          level?: Database["public"]["Enums"]["notification_level"]
          muted_until?: string | null
          updated_at?: string | null
          user_id: number
        }
        Update: {
          conversation_id?: number
          created_at?: string
          level?: Database["public"]["Enums"]["notification_level"]
          muted_until?: string | null
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_notification_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_states: {
        Row: {
          conversation_id: number
          last_read_at: string
          last_read_message_id: number | null
          user_id: number
        }
        Insert: {
          conversation_id: number
          last_read_at?: string
          last_read_message_id?: number | null
          user_id: number
        }
        Update: {
          conversation_id?: number
          last_read_at?: string
          last_read_message_id?: number | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_states_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_apply_rounds: {
        Row: {
          apply_range: unknown
          created_at: string
          created_by: number | null
          ends_at: string
          id: number
          name: string
          starts_at: string
        }
        Insert: {
          apply_range?: unknown
          created_at?: string
          created_by?: number | null
          ends_at: string
          id?: number
          name: string
          starts_at: string
        }
        Update: {
          apply_range?: unknown
          created_at?: string
          created_by?: number | null
          ends_at?: string
          id?: number
          name?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_apply_rounds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          description: string | null
          id: number
          name: string
          type: Database["public"]["Enums"]["club_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          name: string
          type?: Database["public"]["Enums"]["club_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          type?: Database["public"]["Enums"]["club_type"]
        }
        Relationships: []
      }
      clubs_apply: {
        Row: {
          club_id: number
          created_at: string
          id: number
          round_id: number
          user_id: number
        }
        Insert: {
          club_id: number
          created_at?: string
          id?: number
          round_id: number
          user_id: number
        }
        Update: {
          club_id?: number
          created_at?: string
          id?: number
          round_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "clubs_apply_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_apply_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "club_apply_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_apply_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: number
          created_at: string
          user_id: number
        }
        Insert: {
          comment_id: number
          created_at?: string
          user_id: number
        }
        Update: {
          comment_id?: number
          created_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          comment_id: number
          created_at: string
          is_anonymous: boolean
          reaction_type_id: number
          user_id: number
        }
        Insert: {
          comment_id: number
          created_at?: string
          is_anonymous?: boolean
          reaction_type_id: number
          user_id: number
        }
        Update: {
          comment_id?: number
          created_at?: string
          is_anonymous?: boolean
          reaction_type_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_reaction_type_id_fkey"
            columns: ["reaction_type_id"]
            isOneToOne: false
            referencedRelation: "reaction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_attribution:
            | Database["public"]["Enums"]["author_attribution"]
            | null
          author_id: number
          content: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          id: number
          is_anonymous: boolean
          parent_id: number | null
          post_id: number
          updated_at: string | null
        }
        Insert: {
          author_attribution?:
            | Database["public"]["Enums"]["author_attribution"]
            | null
          author_id: number
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: number
          is_anonymous?: boolean
          parent_id?: number | null
          post_id: number
          updated_at?: string | null
        }
        Update: {
          author_attribution?:
            | Database["public"]["Enums"]["author_attribution"]
            | null
          author_id?: number
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: number
          is_anonymous?: boolean
          parent_id?: number | null
          post_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: number
          joined_at: string
          user_id: number
        }
        Insert: {
          conversation_id: number
          joined_at?: string
          user_id: number
        }
        Update: {
          conversation_id?: number
          joined_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: number | null
          id: number
          name: string | null
          type: Database["public"]["Enums"]["conversation_type"]
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          id?: number
          name?: string | null
          type: Database["public"]["Enums"]["conversation_type"]
        }
        Update: {
          created_at?: string
          created_by?: number | null
          id?: number
          name?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_conversations: {
        Row: {
          conversation_id: number
          user1_id: number
          user2_id: number
        }
        Insert: {
          conversation_id: number
          user1_id: number
          user2_id: number
        }
        Update: {
          conversation_id?: number
          user1_id?: number
          user2_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversations_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversations_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gongangs: {
        Row: {
          created_at: string
          day_of_week: number
          end_minute: number
          id: number
          location: Database["public"]["Enums"]["gongang_location"]
          owner_id: number
          start_minute: number
          time_range: unknown
          valid_from: string
          valid_until: string
          validity_range: unknown
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: number
          location: Database["public"]["Enums"]["gongang_location"]
          owner_id: number
          start_minute: number
          time_range?: unknown
          valid_from: string
          valid_until: string
          validity_range?: unknown
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: number
          location?: Database["public"]["Enums"]["gongang_location"]
          owner_id?: number
          start_minute?: number
          time_range?: unknown
          valid_from?: string
          valid_until?: string
          validity_range?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "gongangs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachment_mime_types: {
        Row: {
          content_type: string
          created_at: string
          max_bytes: number
        }
        Insert: {
          content_type: string
          created_at?: string
          max_bytes: number
        }
        Update: {
          content_type?: string
          created_at?: string
          max_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_attachment_mime_types_content_type_fkey"
            columns: ["content_type"]
            isOneToOne: true
            referencedRelation: "mime_types"
            referencedColumns: ["content_type"]
          },
        ]
      }
      message_attachments: {
        Row: {
          content_type: string
          created_at: string
          duration_ms: number | null
          file_name: string | null
          file_name_ciphertext: string | null
          height: number | null
          id: number
          message_id: number
          size_bytes: number | null
          sort_order: number
          storage_bucket: string
          storage_path: string
          width: number | null
        }
        Insert: {
          content_type: string
          created_at?: string
          duration_ms?: number | null
          file_name?: string | null
          file_name_ciphertext?: string | null
          height?: number | null
          id?: number
          message_id: number
          size_bytes?: number | null
          sort_order?: number
          storage_bucket: string
          storage_path: string
          width?: number | null
        }
        Update: {
          content_type?: string
          created_at?: string
          duration_ms?: number | null
          file_name?: string | null
          file_name_ciphertext?: string | null
          height?: number | null
          id?: number
          message_id?: number
          size_bytes?: number | null
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_content_type_fkey"
            columns: ["content_type"]
            isOneToOne: false
            referencedRelation: "message_attachment_mime_types"
            referencedColumns: ["content_type"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_keys: {
        Row: {
          created_at: string
          message_id: number
          recipient_public_key: string
          sender_public_key: string
          user_id: number
          wrapped_key: string
        }
        Insert: {
          created_at?: string
          message_id: number
          recipient_public_key: string
          sender_public_key: string
          user_id: number
          wrapped_key: string
        }
        Update: {
          created_at?: string
          message_id?: number
          recipient_public_key?: string
          sender_public_key?: string
          user_id?: number
          wrapped_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_keys_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          message_id: number
          reaction_type_id: number
          updated_at: string | null
          user_id: number
        }
        Insert: {
          created_at?: string
          message_id: number
          reaction_type_id: number
          updated_at?: string | null
          user_id: number
        }
        Update: {
          created_at?: string
          message_id?: number
          reaction_type_id?: number
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_reaction_type_id_fkey"
            columns: ["reaction_type_id"]
            isOneToOne: false
            referencedRelation: "reaction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          content_ciphertext: string | null
          content_normalized: string | null
          conversation_id: number
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          edited_at: string | null
          id: number
          parent_id: number | null
          pinned_at: string | null
          pinned_by: number | null
          sender_id: number
        }
        Insert: {
          content?: string | null
          content_ciphertext?: string | null
          content_normalized?: string | null
          conversation_id: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          edited_at?: string | null
          id?: number
          parent_id?: number | null
          pinned_at?: string | null
          pinned_by?: number | null
          sender_id: number
        }
        Update: {
          content?: string | null
          content_ciphertext?: string | null
          content_normalized?: string | null
          conversation_id?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          edited_at?: string | null
          id?: number
          parent_id?: number | null
          pinned_at?: string | null
          pinned_by?: number | null
          sender_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mime_types: {
        Row: {
          content_type: string
          created_at: string
          kind: Database["public"]["Enums"]["attachment_kind"]
        }
        Insert: {
          content_type: string
          created_at?: string
          kind: Database["public"]["Enums"]["attachment_kind"]
        }
        Update: {
          content_type?: string
          created_at?: string
          kind?: Database["public"]["Enums"]["attachment_kind"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: number | null
          actor_is_anonymous: boolean
          comment_id: number | null
          created_at: string
          id: number
          payload: Json | null
          post_id: number | null
          read_at: string | null
          recipient_id: number
          space_id: number | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          actor_id?: number | null
          actor_is_anonymous?: boolean
          comment_id?: number | null
          created_at?: string
          id?: number
          payload?: Json | null
          post_id?: number | null
          read_at?: string | null
          recipient_id: number
          space_id?: number | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          actor_id?: number | null
          actor_is_anonymous?: boolean
          comment_id?: number | null
          created_at?: string
          id?: number
          payload?: Json | null
          post_id?: number | null
          read_at?: string | null
          recipient_id?: number
          space_id?: number | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      post_attachment_mime_types: {
        Row: {
          content_type: string
          created_at: string
          max_bytes: number
        }
        Insert: {
          content_type: string
          created_at?: string
          max_bytes: number
        }
        Update: {
          content_type?: string
          created_at?: string
          max_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_attachment_mime_types_content_type_fkey"
            columns: ["content_type"]
            isOneToOne: true
            referencedRelation: "mime_types"
            referencedColumns: ["content_type"]
          },
        ]
      }
      post_attachments: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          height: number | null
          id: number
          post_id: number
          size_bytes: number | null
          sort_order: number
          storage_bucket: string
          storage_path: string
          width: number | null
        }
        Insert: {
          content_type: string
          created_at?: string
          file_name: string
          height?: number | null
          id?: number
          post_id: number
          size_bytes?: number | null
          sort_order?: number
          storage_bucket: string
          storage_path: string
          width?: number | null
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          height?: number | null
          id?: number
          post_id?: number
          size_bytes?: number | null
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_attachments_content_type_fkey"
            columns: ["content_type"]
            isOneToOne: false
            referencedRelation: "post_attachment_mime_types"
            referencedColumns: ["content_type"]
          },
          {
            foreignKeyName: "post_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_mentions: {
        Row: {
          created_at: string
          post_id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          post_id: number
          user_id: number
        }
        Update: {
          created_at?: string
          post_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          is_anonymous: boolean
          post_id: number
          reaction_type_id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          is_anonymous?: boolean
          post_id: number
          reaction_type_id: number
          user_id: number
        }
        Update: {
          created_at?: string
          is_anonymous?: boolean
          post_id?: number
          reaction_type_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_reaction_type_id_fkey"
            columns: ["reaction_type_id"]
            isOneToOne: false
            referencedRelation: "reaction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_attribution:
            | Database["public"]["Enums"]["author_attribution"]
            | null
          author_id: number
          category_id: number | null
          content: string
          content_normalized: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          id: number
          is_anonymous: boolean
          pinned_at: string | null
          pinned_by: number | null
          pub_id: string
          space_id: number
          title: string
          title_normalized: string | null
          updated_at: string | null
        }
        Insert: {
          author_attribution?:
            | Database["public"]["Enums"]["author_attribution"]
            | null
          author_id: number
          category_id?: number | null
          content: string
          content_normalized?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: number
          is_anonymous?: boolean
          pinned_at?: string | null
          pinned_by?: number | null
          pub_id?: string
          space_id: number
          title: string
          title_normalized?: string | null
          updated_at?: string | null
        }
        Update: {
          author_attribution?:
            | Database["public"]["Enums"]["author_attribution"]
            | null
          author_id?: number
          category_id?: number | null
          content?: string
          content_normalized?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: number
          is_anonymous?: boolean
          pinned_at?: string | null
          pinned_by?: number | null
          pub_id?: string
          space_id?: number
          title?: string
          title_normalized?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "space_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_departments: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          birthday: string | null
          class_no: number | null
          cohort: number | null
          contact_email: string | null
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          description: string | null
          dorm_room: number | null
          gender: Database["public"]["Enums"]["profile_gender"] | null
          id: number
          is_reenrolled: boolean
          name: string
          onboarding_completed_at: string | null
          phone_number: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["profile_status"]
          status_updated_at: string | null
          status_updated_by: number | null
          student_number: string | null
          track: Database["public"]["Enums"]["profile_track"] | null
          type: Database["public"]["Enums"]["profile_type"]
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          birthday?: string | null
          class_no?: number | null
          cohort?: number | null
          contact_email?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          dorm_room?: number | null
          gender?: Database["public"]["Enums"]["profile_gender"] | null
          id?: number
          is_reenrolled?: boolean
          name: string
          onboarding_completed_at?: string | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          status_updated_at?: string | null
          status_updated_by?: number | null
          student_number?: string | null
          track?: Database["public"]["Enums"]["profile_track"] | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          birthday?: string | null
          class_no?: number | null
          cohort?: number | null
          contact_email?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          dorm_room?: number | null
          gender?: Database["public"]["Enums"]["profile_gender"] | null
          id?: number
          is_reenrolled?: boolean
          name?: string
          onboarding_completed_at?: string | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          status_updated_at?: string | null
          status_updated_by?: number | null
          student_number?: string | null
          track?: Database["public"]["Enums"]["profile_track"] | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_fkey"
            columns: ["department"]
            isOneToOne: false
            referencedRelation: "profile_departments"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "profiles_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reaction_types: {
        Row: {
          created_at: string
          icon: string | null
          id: number
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: number
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: number
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      song_requests: {
        Row: {
          id: number
          requested_at: string
          requester_id: number
          url: string
        }
        Insert: {
          id?: number
          requested_at?: string
          requester_id: number
          url: string
        }
        Update: {
          id?: number
          requested_at?: string
          requester_id?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_anonymity_suspensions: {
        Row: {
          created_at: string
          space_id: number
          suspended_by: number | null
          suspended_until: string
          user_id: number
        }
        Insert: {
          created_at?: string
          space_id: number
          suspended_by?: number | null
          suspended_until: string
          user_id: number
        }
        Update: {
          created_at?: string
          space_id?: number
          suspended_by?: number | null
          suspended_until?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_anonymity_suspensions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_anonymity_suspensions_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_anonymity_suspensions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_categories: {
        Row: {
          created_at: string
          id: number
          name: string
          sort_order: number
          space_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          sort_order?: number
          space_id: number
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          sort_order?: number
          space_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_categories_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_invites: {
        Row: {
          created_at: string
          created_by: number | null
          expires_at: string | null
          id: number
          revoked_at: string | null
          space_id: number
          target_user_id: number | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          expires_at?: string | null
          id?: number
          revoked_at?: string | null
          space_id: number
          target_user_id?: number | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          expires_at?: string | null
          id?: number
          revoked_at?: string | null
          space_id?: number
          target_user_id?: number | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_join_requests: {
        Row: {
          created_at: string
          space_id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          space_id: number
          user_id: number
        }
        Update: {
          created_at?: string
          space_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_join_requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          banned_by: number | null
          joined_at: string
          notification_setting: Database["public"]["Enums"]["notification_setting"]
          pinned_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          space_id: number
          user_id: number
        }
        Insert: {
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: number | null
          joined_at?: string
          notification_setting?: Database["public"]["Enums"]["notification_setting"]
          pinned_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          space_id: number
          user_id: number
        }
        Update: {
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: number | null
          joined_at?: string
          notification_setting?: Database["public"]["Enums"]["notification_setting"]
          pinned_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          space_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_members_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          anonymity_policy: Database["public"]["Enums"]["space_anonymity_policy"]
          cover_image_url: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          image_url: string | null
          join_policy: Database["public"]["Enums"]["space_join_policy"]
          member_count: number
          name: string
          post_policy: Database["public"]["Enums"]["space_post_policy"]
          pub_id: string
          type: Database["public"]["Enums"]["space_type"]
          updated_at: string | null
        }
        Insert: {
          anonymity_policy?: Database["public"]["Enums"]["space_anonymity_policy"]
          cover_image_url?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: number
          image_url?: string | null
          join_policy?: Database["public"]["Enums"]["space_join_policy"]
          member_count?: number
          name: string
          post_policy?: Database["public"]["Enums"]["space_post_policy"]
          pub_id?: string
          type: Database["public"]["Enums"]["space_type"]
          updated_at?: string | null
        }
        Update: {
          anonymity_policy?: Database["public"]["Enums"]["space_anonymity_policy"]
          cover_image_url?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: number
          image_url?: string | null
          join_policy?: Database["public"]["Enums"]["space_join_policy"]
          member_count?: number
          name?: string
          post_policy?: Database["public"]["Enums"]["space_post_policy"]
          pub_id?: string
          type?: Database["public"]["Enums"]["space_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_keys: {
        Row: {
          created_at: string
          identity_public_key: string
          updated_at: string | null
          user_id: number
          wrapped_identity_secret_key: string
          wrapped_user_key: string
        }
        Insert: {
          created_at?: string
          identity_public_key: string
          updated_at?: string | null
          user_id: number
          wrapped_identity_secret_key: string
          wrapped_user_key: string
        }
        Update: {
          created_at?: string
          identity_public_key?: string
          updated_at?: string | null
          user_id?: number
          wrapped_identity_secret_key?: string
          wrapped_user_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          granted_at: string
          granted_by: number | null
          permission_key: string
          user_id: number
        }
        Insert: {
          granted_at?: string
          granted_by?: number | null
          permission_key: string
          user_id: number
        }
        Update: {
          granted_at?: string
          granted_by?: number | null
          permission_key?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_space_invite: { Args: { p_token: string }; Returns: number }
      approve_join_request: {
        Args: { p_space_id: number; p_user_id: number }
        Returns: undefined
      }
      bootstrap_first_app_admin: {
        Args: { p_profile_id: number }
        Returns: undefined
      }
      claim_storage_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          id: number
          storage_bucket: string
          storage_path: string
        }[]
      }
      cleanup_conversation: {
        Args: { p_conversation_id: number }
        Returns: undefined
      }
      clear_space_cover: { Args: { p_space_id: number }; Returns: undefined }
      clear_space_image: { Args: { p_space_id: number }; Returns: undefined }
      complete_storage_cleanup: { Args: { p_id: number }; Returns: undefined }
      count_pending_profiles: { Args: never; Returns: number }
      create_direct_conversation: {
        Args: { p_peer_id: number }
        Returns: number
      }
      create_post_with_attachments: {
        Args: {
          p_attachments?: Json
          p_author_attribution?: Database["public"]["Enums"]["author_attribution"]
          p_category_id?: number
          p_content: string
          p_is_anonymous?: boolean
          p_space_id: number
          p_title: string
        }
        Returns: string
      }
      create_space: {
        Args: {
          p_anonymity_policy?: Database["public"]["Enums"]["space_anonymity_policy"]
          p_description?: string
          p_join_policy?: Database["public"]["Enums"]["space_join_policy"]
          p_name: string
          p_post_policy?: Database["public"]["Enums"]["space_post_policy"]
          p_pub_id?: string
          p_type: Database["public"]["Enums"]["space_type"]
        }
        Returns: number
      }
      create_space_invite: {
        Args: {
          p_expires_at?: string
          p_space_id: number
          p_target_user_id?: number
        }
        Returns: string
      }
      create_user_keys: {
        Args: {
          p_identity_public_key: string
          p_wrapped_identity_secret_key: string
          p_wrapped_user_key: string
        }
        Returns: undefined
      }
      edit_encrypted_message: {
        Args: { p_content_ciphertext: string; p_id: number }
        Returns: undefined
      }
      enqueue_due_storage_cleanup: { Args: never; Returns: number }
      fail_storage_cleanup: {
        Args: { p_error: string; p_id: number }
        Returns: undefined
      }
      finalize_avatar: { Args: { p_storage_path: string }; Returns: undefined }
      finalize_cover_image: {
        Args: { p_storage_path: string }
        Returns: undefined
      }
      finalize_space_cover: {
        Args: { p_space_id: number; p_storage_path: string }
        Returns: undefined
      }
      finalize_space_image: {
        Args: { p_space_id: number; p_storage_path: string }
        Returns: undefined
      }
      get_chat_messages: {
        Args: {
          p_before_id?: number
          p_conversation_id: number
          p_limit?: number
        }
        Returns: {
          attachments: Json
          content: string
          content_ciphertext: string
          conversation_id: number
          created_at: string
          deleted_at: string
          edited_at: string
          is_edited: boolean
          message_id: number
          message_key: Json
          parent_message: Json
          pinned_at: string
          pinned_by: Json
          reactions: Json
          reads: Json
          sender: Json
          sender_id: number
        }[]
      }
      get_encrypted_message_bodies: {
        Args: {
          p_before_id?: number
          p_conversation_id: number
          p_limit?: number
        }
        Returns: {
          content_ciphertext: string
          created_at: string
          message_id: number
          message_key: Json
          sender_id: number
        }[]
      }
      get_identity_public_keys: {
        Args: { p_user_ids: number[] }
        Returns: {
          identity_public_key: string
          user_id: number
        }[]
      }
      get_my_key_vault: {
        Args: never
        Returns: {
          identity_public_key: string
          wrapped_identity_secret_key: string
          wrapped_user_key: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string
          birthday: string
          class_no: number
          cohort: number
          contact_email: string
          cover_image_url: string
          created_at: string
          department: string
          description: string
          dorm_room: number
          gender: Database["public"]["Enums"]["profile_gender"]
          id: number
          is_reenrolled: boolean
          name: string
          onboarding_completed_at: string
          phone_number: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["profile_status"]
          status_updated_at: string
          student_number: string
          track: Database["public"]["Enums"]["profile_track"]
          type: Database["public"]["Enums"]["profile_type"]
          updated_at: string
        }[]
      }
      get_post: {
        Args: { p_pub_id: string }
        Returns: {
          attachments: Json
          author: Json
          author_attribution: Database["public"]["Enums"]["author_attribution"]
          category: Json
          comment_count: number
          content: string
          created_at: string
          is_anonymous: boolean
          is_author_anonymity_suspended: boolean
          is_mine: boolean
          my_reaction_id: number
          pinned_at: string
          post_id: number
          pub_id: string
          reaction_count: number
          space_id: number
          title: string
          top_reactions: Json
          updated_at: string
        }[]
      }
      get_post_anonymous_reaction_counts: {
        Args: { p_post_id: number }
        Returns: {
          reaction_count: number
          reaction_type_id: number
        }[]
      }
      get_post_comments: {
        Args: { p_after_id?: number; p_limit?: number; p_post_id: number }
        Returns: {
          anonymous_label: string
          author: Json
          author_attribution: Database["public"]["Enums"]["author_attribution"]
          comment_id: number
          content: string
          created_at: string
          is_anonymous: boolean
          is_author_anonymity_suspended: boolean
          is_deleted: boolean
          is_mine: boolean
          my_reaction_id: number
          parent_id: number
          reaction_count: number
          top_reactions: Json
          updated_at: string
        }[]
      }
      get_post_reactors: {
        Args: {
          p_after_user_id?: number
          p_limit?: number
          p_post_id: number
          p_reaction_type_id?: number
        }
        Returns: {
          avatar_url: string
          created_at: string
          name: string
          reaction_type_id: number
          user_id: number
        }[]
      }
      get_unread_message_count: { Args: never; Returns: number }
      get_unread_notification_count: { Args: never; Returns: number }
      join_space: { Args: { p_space_id: number }; Returns: string }
      leave_space: { Args: { p_space_id: number }; Returns: undefined }
      list_conversations: {
        Args: never
        Returns: {
          avatar_url: string
          conversation_id: number
          created_at: string
          display_initials: string
          display_name: string
          last_message_content: string
          last_message_content_ciphertext: string
          last_message_created_at: string
          last_message_has_attachment: boolean
          last_message_id: number
          last_message_key: Json
          last_message_sender_id: number
          last_message_sender_name: string
          member_count: number
          muted_until: string
          name: string
          notification_level: Database["public"]["Enums"]["notification_level"]
          type: Database["public"]["Enums"]["conversation_type"]
          unread_count: number
        }[]
      }
      list_feed_posts: {
        Args: { p_before_id?: number; p_limit?: number }
        Returns: {
          attachments: Json
          author: Json
          author_attribution: Database["public"]["Enums"]["author_attribution"]
          category: Json
          comment_count: number
          content: string
          created_at: string
          is_anonymous: boolean
          is_author_anonymity_suspended: boolean
          is_mine: boolean
          my_reaction_id: number
          pinned_at: string
          post_id: number
          pub_id: string
          reaction_count: number
          space: Json
          title: string
          top_reactions: Json
          updated_at: string
        }[]
      }
      list_notifications: {
        Args: { p_before_id?: number; p_limit?: number }
        Returns: {
          actor: Json
          actor_is_anonymous: boolean
          comment: Json
          created_at: string
          id: number
          payload: Json
          post: Json
          read_at: string
          space: Json
          type: Database["public"]["Enums"]["notification_type"]
        }[]
      }
      list_pending_profiles: {
        Args: { p_after_id?: number; p_limit?: number }
        Returns: {
          avatar_url: string
          birthday: string
          class_no: number
          cohort: number
          department: string
          description: string
          dorm_room: number
          gender: Database["public"]["Enums"]["profile_gender"]
          id: number
          is_reenrolled: boolean
          name: string
          onboarding_completed_at: string
          phone_number: string
          student_number: string
          track: Database["public"]["Enums"]["profile_track"]
          type: Database["public"]["Enums"]["profile_type"]
        }[]
      }
      list_space_posts: {
        Args: {
          p_before_id?: number
          p_category_id?: number
          p_limit?: number
          p_space_id: number
        }
        Returns: {
          attachments: Json
          author: Json
          author_attribution: Database["public"]["Enums"]["author_attribution"]
          category: Json
          comment_count: number
          content: string
          created_at: string
          is_anonymous: boolean
          is_author_anonymity_suspended: boolean
          is_mine: boolean
          my_reaction_id: number
          pinned_at: string
          post_id: number
          pub_id: string
          reaction_count: number
          title: string
          top_reactions: Json
          updated_at: string
        }[]
      }
      purge_deleted_content: {
        Args: { p_limit?: number; p_older_than?: string }
        Returns: {
          purged_comments: number
          purged_posts: number
        }[]
      }
      purge_due_spaces: {
        Args: { p_limit?: number }
        Returns: {
          purged: number
          skipped: number
        }[]
      }
      purge_notifications: {
        Args: { p_limit?: number; p_older_than?: string }
        Returns: number
      }
      remove_group_member: {
        Args: { p_conversation_id: number; p_user_id: number }
        Returns: undefined
      }
      rename_group_conversation: {
        Args: { p_conversation_id: number; p_name: string }
        Returns: undefined
      }
      request_attachment_removal: {
        Args: { p_attachment_id: number; p_owner_type: string }
        Returns: undefined
      }
      reseal_user_keys: {
        Args: { p_wrapped_user_key: string }
        Returns: undefined
      }
      review_profile: {
        Args: {
          p_profile_id: number
          p_status: Database["public"]["Enums"]["profile_status"]
        }
        Returns: undefined
      }
      review_profiles: {
        Args: {
          p_profile_ids: number[]
          p_status: Database["public"]["Enums"]["profile_status"]
        }
        Returns: number
      }
      revoke_space_invite: { Args: { p_invite_id: number }; Returns: undefined }
      rotate_user_keys: {
        Args: {
          p_identity_public_key: string
          p_wrapped_identity_secret_key: string
          p_wrapped_user_key: string
        }
        Returns: undefined
      }
      search_messages: {
        Args: { p_conversation_id: number; p_query: string }
        Returns: {
          content_snippet: string
          created_at: string
          message_id: number
          sender_name: string
        }[]
      }
      search_posts: {
        Args: { p_query: string; p_space_id: number }
        Returns: {
          author: Json
          author_attribution: Database["public"]["Enums"]["author_attribution"]
          content_snippet: string
          created_at: string
          post_id: number
          pub_id: string
          title: string
        }[]
      }
      send_encrypted_message: {
        Args: {
          p_attachments?: Json
          p_content_ciphertext?: string
          p_conversation_id: number
          p_keys?: Json
          p_parent_id?: number
        }
        Returns: number
      }
      send_message_with_attachments: {
        Args: {
          p_attachments: Json
          p_content?: string
          p_conversation_id: number
          p_parent_id?: number
        }
        Returns: number
      }
      set_app_admin: { Args: { p_profile_id: number }; Returns: undefined }
      set_post_attachments: {
        Args: { p_attachments: Json; p_post_id: number }
        Returns: undefined
      }
      set_post_pinned: {
        Args: { p_id: number; p_pinned: boolean }
        Returns: undefined
      }
      set_space_join_policy: {
        Args: {
          p_join_policy: Database["public"]["Enums"]["space_join_policy"]
          p_space_id: number
        }
        Returns: undefined
      }
      set_space_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["member_role"]
          p_space_id: number
          p_user_id: number
        }
        Returns: undefined
      }
      soft_delete_comment: { Args: { p_id: number }; Returns: undefined }
      soft_delete_message: { Args: { p_id: number }; Returns: undefined }
      soft_delete_post: { Args: { p_id: number }; Returns: undefined }
      soft_delete_space: { Args: { p_space_id: number }; Returns: undefined }
      submit_onboarding: {
        Args: {
          p_birthday: string
          p_class_no: number
          p_cohort: number
          p_department: string
          p_description: string
          p_dorm_room: number
          p_gender: Database["public"]["Enums"]["profile_gender"]
          p_is_reenrolled: boolean
          p_name: string
          p_phone_number: string
          p_student_number: string
          p_track: Database["public"]["Enums"]["profile_track"]
          p_type: Database["public"]["Enums"]["profile_type"]
        }
        Returns: undefined
      }
      suspend_comment_author_anonymity: {
        Args: { p_comment_id: number }
        Returns: undefined
      }
      suspend_post_author_anonymity: {
        Args: { p_post_id: number }
        Returns: undefined
      }
      transfer_space_ownership: {
        Args: { p_new_owner_id: number; p_space_id: number }
        Returns: undefined
      }
      undo_comment_anonymity_suspension: {
        Args: { p_comment_id: number }
        Returns: undefined
      }
      undo_post_anonymity_suspension: {
        Args: { p_post_id: number }
        Returns: undefined
      }
      unset_app_admin: { Args: { p_profile_id: number }; Returns: undefined }
      withdraw_profile: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "user" | "admin"
      attachment_kind: "image" | "audio" | "video" | "file"
      author_attribution: "staff"
      club_type: "major" | "general"
      conversation_type: "direct" | "group"
      gongang_location: "floor_b1" | "floor_2" | "floor_4" | "floor_10"
      member_role: "owner" | "admin" | "manager" | "member"
      notification_level: "mention" | "all"
      notification_setting: "off" | "mentions" | "all"
      notification_type:
        | "post_comment"
        | "comment_reply"
        | "post_mention"
        | "comment_mention"
        | "space_join_request"
        | "space_join_approved"
        | "space_join_rejected"
        | "space_invited"
        | "space_role_changed"
        | "space_anonymity_suspended"
        | "post_removed"
        | "comment_removed"
      profile_gender: "male" | "female"
      profile_status: "none" | "pending" | "accepted" | "rejected" | "withdrawn"
      profile_track: "domestic" | "international"
      profile_type: "student" | "teacher" | "alumni"
      space_anonymity_policy: "disabled" | "optional" | "required"
      space_join_policy: "public" | "request" | "invite_only"
      space_post_policy: "all" | "managers"
      space_type: "group" | "community"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["user", "admin"],
      attachment_kind: ["image", "audio", "video", "file"],
      author_attribution: ["staff"],
      club_type: ["major", "general"],
      conversation_type: ["direct", "group"],
      gongang_location: ["floor_b1", "floor_2", "floor_4", "floor_10"],
      member_role: ["owner", "admin", "manager", "member"],
      notification_level: ["mention", "all"],
      notification_setting: ["off", "mentions", "all"],
      notification_type: [
        "post_comment",
        "comment_reply",
        "post_mention",
        "comment_mention",
        "space_join_request",
        "space_join_approved",
        "space_join_rejected",
        "space_invited",
        "space_role_changed",
        "space_anonymity_suspended",
        "post_removed",
        "comment_removed",
      ],
      profile_gender: ["male", "female"],
      profile_status: ["none", "pending", "accepted", "rejected", "withdrawn"],
      profile_track: ["domestic", "international"],
      profile_type: ["student", "teacher", "alumni"],
      space_anonymity_policy: ["disabled", "optional", "required"],
      space_join_policy: ["public", "request", "invite_only"],
      space_post_policy: ["all", "managers"],
      space_type: ["group", "community"],
    },
  },
} as const
