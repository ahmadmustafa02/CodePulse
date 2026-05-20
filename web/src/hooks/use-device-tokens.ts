import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeviceToken, listDeviceTokens, revokeDeviceToken } from "@/lib/api";

export const deviceTokensQueryKey = ["device-tokens"] as const;

export function useDeviceTokens() {
  return useQuery({
    queryKey: deviceTokensQueryKey,
    queryFn: listDeviceTokens,
  });
}

export function useCreateDeviceToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDeviceToken(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: deviceTokensQueryKey });
    },
  });
}

export function useRevokeDeviceToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeDeviceToken(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: deviceTokensQueryKey });
    },
  });
}
