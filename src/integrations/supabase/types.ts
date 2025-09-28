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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address: Json | null
          assigned_to_user_id: string | null
          created_at: string
          created_by_user_id: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          tenant_id: string
          total_jobs_count: number | null
          total_revenue_billed: number | null
          updated_at: string | null
        }
        Insert: {
          address?: Json | null
          assigned_to_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          tenant_id: string
          total_jobs_count?: number | null
          total_revenue_billed?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: Json | null
          assigned_to_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          tenant_id?: string
          total_jobs_count?: number | null
          total_revenue_billed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by_user_id: string
          customer_id: string
          customer_name: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          job_id: string | null
          line_items: Json
          notes: string | null
          paid_date: string | null
          payment_instructions: string | null
          payment_terms: string
          paypal_me_link: string | null
          sent_date: string | null
          share_token: string | null
          share_token_expires_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string | null
          venmo_handle: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          customer_id: string
          customer_name: string
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          job_id?: string | null
          line_items: Json
          notes?: string | null
          paid_date?: string | null
          payment_instructions?: string | null
          payment_terms?: string
          paypal_me_link?: string | null
          sent_date?: string | null
          share_token?: string | null
          share_token_expires_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          tax_rate?: number
          tenant_id: string
          total_amount: number
          updated_at?: string | null
          venmo_handle?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          customer_id?: string
          customer_name?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          job_id?: string | null
          line_items?: Json
          notes?: string | null
          paid_date?: string | null
          payment_instructions?: string | null
          payment_terms?: string
          paypal_me_link?: string | null
          sent_date?: string | null
          share_token?: string | null
          share_token_expires_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string | null
          venmo_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_occurrences: {
        Row: {
          actual_cost: number | null
          assigned_to_user_id: string | null
          completion_notes: string | null
          created_at: string
          customer_id: string
          customer_name: string
          end_at: string
          id: string
          override_description: string | null
          override_estimated_cost: number | null
          override_title: string | null
          priority: Database["public"]["Enums"]["job_priority"]
          series_id: string
          series_local_start_time: string | null
          series_timezone: string | null
          start_at: string
          status: Database["public"]["Enums"]["job_status"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          assigned_to_user_id?: string | null
          completion_notes?: string | null
          created_at?: string
          customer_id: string
          customer_name?: string
          end_at: string
          id?: string
          override_description?: string | null
          override_estimated_cost?: number | null
          override_title?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          series_id: string
          series_local_start_time?: string | null
          series_timezone?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["job_status"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          assigned_to_user_id?: string | null
          completion_notes?: string | null
          created_at?: string
          customer_id?: string
          customer_name?: string
          end_at?: string
          id?: string
          override_description?: string | null
          override_estimated_cost?: number | null
          override_title?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          series_id?: string
          series_local_start_time?: string | null
          series_timezone?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_occurrences_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "job_series"
            referencedColumns: ["id"]
          },
        ]
      }
      job_series: {
        Row: {
          active: boolean
          actual_cost: number | null
          assigned_to_user_id: string | null
          completion_notes: string | null
          created_at: string
          created_by_user_id: string
          customer_id: string
          customer_name: string
          description: string | null
          duration_minutes: number
          estimated_cost: number | null
          generation_cap_days: number | null
          generation_status: string | null
          id: string
          is_recurring: boolean
          last_generated_until: string | null
          local_start_time: string
          notes: string | null
          priority: Database["public"]["Enums"]["job_priority"]
          rrule: string | null
          scheduled_end_time_utc: string | null
          scheduled_time_utc: string | null
          service_type: Database["public"]["Enums"]["job_service_type"]
          start_date: string
          status: Database["public"]["Enums"]["job_status"] | null
          tenant_id: string
          timezone: string
          title: string
          until_date: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          actual_cost?: number | null
          assigned_to_user_id?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by_user_id: string
          customer_id: string
          customer_name: string
          description?: string | null
          duration_minutes?: number
          estimated_cost?: number | null
          generation_cap_days?: number | null
          generation_status?: string | null
          id?: string
          is_recurring?: boolean
          last_generated_until?: string | null
          local_start_time?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          rrule?: string | null
          scheduled_end_time_utc?: string | null
          scheduled_time_utc?: string | null
          service_type?: Database["public"]["Enums"]["job_service_type"]
          start_date: string
          status?: Database["public"]["Enums"]["job_status"] | null
          tenant_id: string
          timezone?: string
          title: string
          until_date?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          actual_cost?: number | null
          assigned_to_user_id?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by_user_id?: string
          customer_id?: string
          customer_name?: string
          description?: string | null
          duration_minutes?: number
          estimated_cost?: number | null
          generation_cap_days?: number | null
          generation_status?: string | null
          id?: string
          is_recurring?: boolean
          last_generated_until?: string | null
          local_start_time?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          rrule?: string | null
          scheduled_end_time_utc?: string | null
          scheduled_time_utc?: string | null
          service_type?: Database["public"]["Enums"]["job_service_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["job_status"] | null
          tenant_id?: string
          timezone?: string
          title?: string
          until_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          parent_admin_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          parent_admin_id?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          parent_admin_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_admin_id_fkey"
            columns: ["parent_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_responses: {
        Row: {
          created_at: string
          customer_comments: string | null
          customer_email: string | null
          id: string
          ip_address: string | null
          quote_id: string
          response_type: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          customer_comments?: string | null
          customer_email?: string | null
          id?: string
          ip_address?: string | null
          quote_id: string
          response_type: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          customer_comments?: string | null
          customer_email?: string | null
          id?: string
          ip_address?: string | null
          quote_id?: string
          response_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          created_at: string
          created_by_user_id: string
          customer_id: string
          customer_name: string
          estimated_completion_date: string | null
          estimated_start_date: string | null
          id: string
          is_emergency: boolean
          line_items: Json
          notes: string | null
          quote_number: string
          sent_date: string | null
          share_token: string | null
          share_token_expires_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          terms: string
          title: string
          total_amount: number
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          customer_id: string
          customer_name: string
          estimated_completion_date?: string | null
          estimated_start_date?: string | null
          id?: string
          is_emergency?: boolean
          line_items: Json
          notes?: string | null
          quote_number: string
          sent_date?: string | null
          share_token?: string | null
          share_token_expires_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          tax_rate?: number
          tenant_id: string
          terms?: string
          title: string
          total_amount: number
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          customer_id?: string
          customer_name?: string
          estimated_completion_date?: string | null
          estimated_start_date?: string | null
          id?: string
          is_emergency?: boolean
          line_items?: Json
          notes?: string | null
          quote_number?: string
          sent_date?: string | null
          share_token?: string | null
          share_token_expires_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string
          terms?: string
          title?: string
          total_amount?: number
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string | null
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          name: string
          price_per_unit: number
          taxable: boolean
          tenant_id: string
          unit_type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          id?: string
          name: string
          price_per_unit: number
          taxable?: boolean
          tenant_id: string
          unit_type?: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          id?: string
          name?: string
          price_per_unit?: number
          taxable?: boolean
          tenant_id?: string
          unit_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          brand_color: string | null
          business_address: Json | null
          business_email: string | null
          business_hours: Json | null
          business_name: string | null
          business_phone: string | null
          business_website: string | null
          created_at: string
          created_by_user_id: string
          id: string
          invoice_settings: Json | null
          logo_url: string | null
          notification_settings: Json | null
          payment_settings: Json | null
          service_settings: Json | null
          system_settings: Json | null
          tax_settings: Json | null
          tenant_id: string
          text_color: string | null
          time_zone: Database["public"]["Enums"]["time_zones"] | null
          updated_at: string | null
          user_preferences: Json | null
        }
        Insert: {
          brand_color?: string | null
          business_address?: Json | null
          business_email?: string | null
          business_hours?: Json | null
          business_name?: string | null
          business_phone?: string | null
          business_website?: string | null
          created_at?: string
          created_by_user_id: string
          id?: string
          invoice_settings?: Json | null
          logo_url?: string | null
          notification_settings?: Json | null
          payment_settings?: Json | null
          service_settings?: Json | null
          system_settings?: Json | null
          tax_settings?: Json | null
          tenant_id: string
          text_color?: string | null
          time_zone?: Database["public"]["Enums"]["time_zones"] | null
          updated_at?: string | null
          user_preferences?: Json | null
        }
        Update: {
          brand_color?: string | null
          business_address?: Json | null
          business_email?: string | null
          business_hours?: Json | null
          business_name?: string | null
          business_phone?: string | null
          business_website?: string | null
          created_at?: string
          created_by_user_id?: string
          id?: string
          invoice_settings?: Json | null
          logo_url?: string | null
          notification_settings?: Json | null
          payment_settings?: Json | null
          service_settings?: Json | null
          system_settings?: Json | null
          tax_settings?: Json | null
          tenant_id?: string
          text_color?: string | null
          time_zone?: Database["public"]["Enums"]["time_zones"] | null
          updated_at?: string | null
          user_preferences?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_content_access_logs: {
        Row: {
          accessed_at: string
          content_id: string
          content_type: string
          id: string
          ip_address: string | null
          referrer: string | null
          share_token: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          content_id: string
          content_type: string
          id?: string
          ip_address?: string | null
          referrer?: string | null
          share_token: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          content_id?: string
          content_type?: string
          id?: string
          ip_address?: string | null
          referrer?: string | null
          share_token?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          access_invoicing: boolean
          access_services: boolean
          created_at: string
          id: string
          send_quotes: boolean
          supervisor: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_invoicing?: boolean
          access_services?: boolean
          created_at?: string
          id?: string
          send_quotes?: boolean
          supervisor?: boolean
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_invoicing?: boolean
          access_services?: boolean
          created_at?: string
          id?: string
          send_quotes?: boolean
          supervisor?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      check_rate_limit: {
        Args: {
          _endpoint: string
          _identifier: string
          _max_requests?: number
          _window_minutes?: number
        }
        Returns: boolean
      }
      cleanup_expired_rate_limits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      generate_quote_share_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_permissions: {
        Args: { target_user_id: string }
        Returns: {
          access_invoicing: boolean
          access_services: boolean
          send_quotes: boolean
          supervisor: boolean
        }[]
      }
      get_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      customer_type: "residential" | "commercial"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      job_priority: "low" | "medium" | "high" | "urgent"
      job_service_type:
        | "plumbing"
        | "electrical"
        | "hvac"
        | "cleaning"
        | "landscaping"
        | "general_maintenance"
        | "other"
      job_status: "scheduled" | "in_progress" | "completed" | "cancelled"
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired"
      time_zones:
        | "Eastern"
        | "Central"
        | "Mountain"
        | "Pacific"
        | "Arizona"
        | "Alaska"
        | "Hawaii Aleutian"
      user_role: "business_admin" | "contractor"
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
    Enums: {
      customer_type: ["residential", "commercial"],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      job_priority: ["low", "medium", "high", "urgent"],
      job_service_type: [
        "plumbing",
        "electrical",
        "hvac",
        "cleaning",
        "landscaping",
        "general_maintenance",
        "other",
      ],
      job_status: ["scheduled", "in_progress", "completed", "cancelled"],
      quote_status: ["draft", "sent", "accepted", "declined", "expired"],
      time_zones: [
        "Eastern",
        "Central",
        "Mountain",
        "Pacific",
        "Arizona",
        "Alaska",
        "Hawaii Aleutian",
      ],
      user_role: ["business_admin", "contractor"],
    },
  },
} as const
