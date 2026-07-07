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
      chat_read_states: {
        Row: {
          chat_room_id: number | null
          created_at: string
          direct_chat_id: number | null
          id: number
          last_read_at: string
          last_read_message_id: number | null
          user_id: number
        }
        Insert: {
          chat_room_id?: number | null
          created_at?: string
          direct_chat_id?: number | null
          id?: number
          last_read_at?: string
          last_read_message_id?: number | null
          user_id: number
        }
        Update: {
          chat_room_id?: number | null
          created_at?: string
          direct_chat_id?: number | null
          id?: number
          last_read_at?: string
          last_read_message_id?: number | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_states_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_states_direct_chat_id_fkey"
            columns: ["direct_chat_id"]
            isOneToOne: false
            referencedRelation: "direct_chats"
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
      chat_room_members: {
        Row: {
          chat_room_id: number
          joined_at: string
          user_id: number
        }
        Insert: {
          chat_room_id: number
          joined_at?: string
          user_id: number
        }
        Update: {
          chat_room_id?: number
          joined_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: number | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_created_by_fkey"
            columns: ["created_by"]
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
      comment_reactions: {
        Row: {
          comment_id: number
          created_at: string
          id: number
          reaction_type_id: number
          updated_at: string | null
          user_id: number
        }
        Insert: {
          comment_id: number
          created_at?: string
          id?: number
          reaction_type_id: number
          updated_at?: string | null
          user_id: number
        }
        Update: {
          comment_id?: number
          created_at?: string
          id?: number
          reaction_type_id?: number
          updated_at?: string | null
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
          author_id: number
          content: string
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
          author_id: number
          content: string
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
          author_id?: number
          content?: string
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
      direct_chats: {
        Row: {
          created_at: string
          id: number
          user1_id: number
          user2_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          user1_id: number
          user2_id: number
        }
        Update: {
          created_at?: string
          id?: number
          user1_id?: number
          user2_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "direct_chats_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_chats_user2_id_fkey"
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
      message_attachments: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
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
          file_name: string
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
          file_name?: string
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
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          id: number
          message_id: number
          reaction_type_id: number
          updated_at: string | null
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          message_id: number
          reaction_type_id: number
          updated_at?: string | null
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
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
          chat_room_id: number | null
          content: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          direct_chat_id: number | null
          edited_at: string | null
          id: number
          is_edited: boolean
          parent_id: number | null
          sender_id: number
        }
        Insert: {
          chat_room_id?: number | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          direct_chat_id?: number | null
          edited_at?: string | null
          id?: number
          is_edited?: boolean
          parent_id?: number | null
          sender_id: number
        }
        Update: {
          chat_room_id?: number | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          direct_chat_id?: number | null
          edited_at?: string | null
          id?: number
          is_edited?: boolean
          parent_id?: number | null
          sender_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
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
            foreignKeyName: "messages_direct_chat_id_fkey"
            columns: ["direct_chat_id"]
            isOneToOne: false
            referencedRelation: "direct_chats"
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
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: number | null
          body: string | null
          comment_id: number | null
          created_at: string
          id: number
          message_id: number | null
          post_id: number | null
          read_at: string | null
          recipient_id: number
          space_id: number | null
          title: string | null
        }
        Insert: {
          actor_id?: number | null
          body?: string | null
          comment_id?: number | null
          created_at?: string
          id?: number
          message_id?: number | null
          post_id?: number | null
          read_at?: string | null
          recipient_id: number
          space_id?: number | null
          title?: string | null
        }
        Update: {
          actor_id?: number | null
          body?: string | null
          comment_id?: number | null
          created_at?: string
          id?: number
          message_id?: number | null
          post_id?: number | null
          read_at?: string | null
          recipient_id?: number
          space_id?: number | null
          title?: string | null
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
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
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
      post_attachments: {
        Row: {
          alt: string | null
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
          alt?: string | null
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
          alt?: string | null
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
            foreignKeyName: "post_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          id: number
          post_id: number
          reaction_type_id: number
          updated_at: string | null
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          post_id: number
          reaction_type_id: number
          updated_at?: string | null
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          post_id?: number
          reaction_type_id?: number
          updated_at?: string | null
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
          author_id: number
          comment_count: number
          content: string
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          id: number
          is_anonymous: boolean
          is_pinned: boolean
          pinned_at: string | null
          pinned_by: number | null
          pub_id: string
          reaction_count: number
          space_id: number
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: number
          comment_count?: number
          content: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: number
          is_anonymous?: boolean
          is_pinned?: boolean
          pinned_at?: string | null
          pinned_by?: number | null
          pub_id?: string
          reaction_count?: number
          space_id: number
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: number
          comment_count?: number
          content?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: number
          is_anonymous?: boolean
          is_pinned?: boolean
          pinned_at?: string | null
          pinned_by?: number | null
          pub_id?: string
          reaction_count?: number
          space_id?: number
          title?: string
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
      space_members: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          banned_by: number | null
          joined_at: string
          notification_setting: Database["public"]["Enums"]["notification_setting"]
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
          pub_id: string
          type: Database["public"]["Enums"]["space_type"]
          updated_at: string | null
        }
        Insert: {
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
          pub_id?: string
          type: Database["public"]["Enums"]["space_type"]
          updated_at?: string | null
        }
        Update: {
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
      cleanup_direct_chat: {
        Args: { p_direct_chat_id: number }
        Returns: undefined
      }
      complete_storage_cleanup: { Args: { p_id: number }; Returns: undefined }
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
      get_chat_messages: {
        Args: {
          p_before_id?: number
          p_chat_room_id?: number
          p_direct_chat_id?: number
          p_limit?: number
        }
        Returns: {
          attachments: Json
          chat_room_id: number
          content: string
          created_at: string
          deleted_at: string
          direct_chat_id: number
          edited_at: string
          is_edited: boolean
          message_id: number
          parent_message: Json
          reactions: Json
          reads: Json
          sender: Json
          sender_id: number
        }[]
      }
      list_chat_rooms: {
        Args: never
        Returns: {
          avatar_url: string
          chat_room_id: number
          created_at: string
          direct_chat_id: number
          display_initials: string
          display_name: string
          last_message_content: string
          last_message_created_at: string
          last_message_has_attachment: boolean
          last_message_id: number
          last_message_sender_id: number
          last_message_sender_name: string
          member_count: number
          name: string
          unread_count: number
        }[]
      }
      remove_group_member: {
        Args: { p_chat_room_id: number; p_user_id: number }
        Returns: undefined
      }
      request_attachment_removal: {
        Args: { p_attachment_id: number; p_attachment_kind: string }
        Returns: undefined
      }
      review_profile: {
        Args: {
          p_profile_id: number
          p_status: Database["public"]["Enums"]["profile_status"]
        }
        Returns: undefined
      }
      search_messages: {
        Args: {
          p_chat_room_id?: number
          p_direct_chat_id?: number
          p_query: string
        }
        Returns: {
          content_snippet: string
          created_at: string
          message_id: number
          sender_name: string
        }[]
      }
      send_direct_message_with_attachment: {
        Args: {
          p_content?: string
          p_content_type: string
          p_direct_chat_id: number
          p_file_name: string
          p_height?: number
          p_parent_id?: number
          p_size_bytes: number
          p_storage_path: string
          p_width?: number
        }
        Returns: number
      }
      send_room_message_with_attachment: {
        Args: {
          p_chat_room_id: number
          p_content?: string
          p_content_type: string
          p_file_name: string
          p_height?: number
          p_parent_id?: number
          p_size_bytes: number
          p_storage_path: string
          p_width?: number
        }
        Returns: number
      }
      soft_delete_message: { Args: { p_id: number }; Returns: undefined }
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
      withdraw_profile: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "user" | "admin"
      club_type: "major" | "general"
      gongang_location: "floor_b1" | "floor_2" | "floor_4" | "floor_10"
      member_role: "owner" | "admin" | "manager" | "member"
      notification_level: "mention" | "all"
      notification_setting: "off" | "mentions" | "all"
      profile_gender: "male" | "female"
      profile_status: "none" | "pending" | "accepted" | "rejected" | "withdrawn"
      profile_track: "domestic" | "international"
      profile_type: "student" | "teacher" | "alumni"
      space_join_policy: "auto_join" | "invite_only"
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
      club_type: ["major", "general"],
      gongang_location: ["floor_b1", "floor_2", "floor_4", "floor_10"],
      member_role: ["owner", "admin", "manager", "member"],
      notification_level: ["mention", "all"],
      notification_setting: ["off", "mentions", "all"],
      profile_gender: ["male", "female"],
      profile_status: ["none", "pending", "accepted", "rejected", "withdrawn"],
      profile_track: ["domestic", "international"],
      profile_type: ["student", "teacher", "alumni"],
      space_join_policy: ["auto_join", "invite_only"],
      space_type: ["group", "community"],
    },
  },
} as const

