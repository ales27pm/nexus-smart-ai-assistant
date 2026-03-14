import { useState, useCallback, useEffect, useMemo } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LlamaConfig,
  DEFAULT_LLAMA_CONFIG,
  loadLlamaConfig,
  saveLlamaConfig,
  checkServerHealth,
} from '@/utils/llamaClient';

export const [LlamaProvider, useLlama] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  const configQuery = useQuery({
    queryKey: ['llama-config'],
    queryFn: loadLlamaConfig,
  });

  const config = configQuery.data ?? DEFAULT_LLAMA_CONFIG;

  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: LlamaConfig) => {
      await saveLlamaConfig(newConfig);
      return newConfig;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['llama-config'] });
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: async (serverUrl?: string) => {
      const url = serverUrl ?? config.serverUrl;
      const healthy = await checkServerHealth(url);
      setIsConnected(healthy);
      return healthy;
    },
  });

  const healthMutate = healthCheckMutation.mutate;
  useEffect(() => {
    if (configQuery.data?.serverUrl) {
      healthMutate(configQuery.data.serverUrl);
    }
  }, [configQuery.data?.serverUrl, healthMutate]);

  const updateConfig = useCallback((newConfig: Partial<LlamaConfig>) => {
    const merged = { ...config, ...newConfig };
    updateConfigMutation.mutate(merged);
  }, [config, updateConfigMutation]);

  const checkHealth = useCallback((serverUrl?: string) => {
    healthCheckMutation.mutate(serverUrl);
  }, [healthCheckMutation]);

  return useMemo(() => ({
    config,
    isConnected,
    isLoading: configQuery.isLoading,
    isCheckingHealth: healthCheckMutation.isPending,
    updateConfig,
    checkHealth,
  }), [config, isConnected, configQuery.isLoading, healthCheckMutation.isPending, updateConfig, checkHealth]);
});
