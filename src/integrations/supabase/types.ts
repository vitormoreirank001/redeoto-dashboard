export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          agenda_end_hour: number;
          agenda_slot_minutes: number;
          agenda_start_hour: number;
          id: boolean;
          logo_url: string | null;
          updated_at: string;
          whatsapp_connected_at: string | null;
          whatsapp_webhook_token: string;
        };
        Insert: {
          agenda_end_hour?: number;
          agenda_slot_minutes?: number;
          agenda_start_hour?: number;
          id?: boolean;
          logo_url?: string | null;
          updated_at?: string;
          whatsapp_connected_at?: string | null;
          whatsapp_webhook_token?: string;
        };
        Update: {
          agenda_end_hour?: number;
          agenda_slot_minutes?: number;
          agenda_start_hour?: number;
          id?: boolean;
          logo_url?: string | null;
          updated_at?: string;
          whatsapp_connected_at?: string | null;
          whatsapp_webhook_token?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount: number;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string;
          expense_date: string;
          id: string;
        };
        Insert: {
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          expense_date?: string;
          id?: string;
        };
        Update: {
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          expense_date?: string;
          id?: string;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          category: string | null;
          created_at: string;
          expiry_date: string | null;
          id: string;
          name: string;
          notes: string | null;
          quantity: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          quantity?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          quantity?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_events: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload: Json;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      custom_fields: {
        Row: {
          created_at: string;
          field_type: string;
          id: string;
          key: string;
          label: string;
          options: Json;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          field_type?: string;
          id?: string;
          key: string;
          label: string;
          options?: Json;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          field_type?: string;
          id?: string;
          key?: string;
          label?: string;
          options?: Json;
          sort_order?: number;
        };
        Relationships: [];
      };
      field_options: {
        Row: {
          created_at: string;
          field_key: string;
          id: string;
          sort_order: number;
          value: string;
        };
        Insert: {
          created_at?: string;
          field_key: string;
          id?: string;
          sort_order?: number;
          value: string;
        };
        Update: {
          created_at?: string;
          field_key?: string;
          id?: string;
          sort_order?: number;
          value?: string;
        };
        Relationships: [];
      };
      daily_calls: {
        Row: {
          calls_answered: number;
          calls_made: number;
          created_at: string;
          date: string;
          id: string;
        };
        Insert: {
          calls_answered?: number;
          calls_made?: number;
          created_at?: string;
          date: string;
          id?: string;
        };
        Update: {
          calls_answered?: number;
          calls_made?: number;
          created_at?: string;
          date?: string;
          id?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          appointment_date: string | null;
          budget_amount: number | null;
          calls: Json;
          checklist: Json;
          created_at: string;
          created_by: string | null;
          custom_data: Json;
          entry_date: string;
          financing: string | null;
          history: Json;
          id: string;
          media: string;
          name: string;
          notes: string | null;
          origin: string;
          phone: string | null;
          service: string;
          stage: string;
          updated_at: string;
          urgent: boolean;
        };
        Insert: {
          appointment_date?: string | null;
          budget_amount?: number | null;
          calls?: Json;
          checklist?: Json;
          created_at?: string;
          created_by?: string | null;
          custom_data?: Json;
          entry_date?: string;
          financing?: string | null;
          history?: Json;
          id?: string;
          media?: string;
          name: string;
          notes?: string | null;
          origin?: string;
          phone?: string | null;
          service?: string;
          stage?: string;
          updated_at?: string;
          urgent?: boolean;
        };
        Update: {
          appointment_date?: string | null;
          budget_amount?: number | null;
          calls?: Json;
          checklist?: Json;
          created_at?: string;
          created_by?: string | null;
          custom_data?: Json;
          entry_date?: string;
          financing?: string | null;
          history?: Json;
          id?: string;
          media?: string;
          name?: string;
          notes?: string | null;
          origin?: string;
          phone?: string | null;
          service?: string;
          stage?: string;
          updated_at?: string;
          urgent?: boolean;
        };
        Relationships: [];
      };
      monthly_goals: {
        Row: {
          created_at: string;
          id: string;
          month: number;
          target_amount: number;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          month: number;
          target_amount?: number;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          month?: number;
          target_amount?: number;
          year?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          reference_price: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          reference_price?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          reference_price?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "comercial";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "comercial"],
    },
  },
} as const;
