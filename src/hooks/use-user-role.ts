import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: r } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return r?.role ?? "comercial";
    },
    staleTime: 5 * 60 * 1000,
  });

  return { role: data ?? null, isAdmin: data === "admin", isLoading };
}
