import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';

export const bridgeConfigSchema = z.object({
  vaultRoot: z.string().min(1).max(4096), hostId: z.string().min(1),
  driveFolderId: z.string().max(256), driveAccount: z.string().max(320),
}).strict();
export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;
export const fileSchema = z.object({
  platform: z.enum(['darwin', 'win32', 'linux']).optional(),
  hostId: z.string(), path: z.string(), absolutePath: z.string(), name: z.string(),
  isDirectory: z.boolean(), size: z.number(), modifiedAt: z.string(),
  driveUrl: z.string().nullable(),
  driveStatus: z.enum(['found', 'pending', 'ambiguous', 'unavailable', 'unconfigured']),
  account: z.string(),
  driveSource: z.enum(['sync', 'agent-upload']).optional(),
  uploadStatus: z.enum(['current', 'stale']).optional(),
});
export type VaultFile = z.infer<typeof fileSchema>;
export const pathInput = z.object({ path: z.string().max(4096) }).strict();
export const hostInput = pathInput.extend({ config: bridgeConfigSchema }).strict();
export const listingSchema = z.object({ path: z.string(), files: z.array(fileSchema), truncated: z.boolean() });
export const documentSchema = z.object({ file: fileSchema, content: z.string().max(2 * 1024 * 1024) });
export const fingerprintSchema = z.object({ file: fileSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const hostContract = defineRpcContract({
  read: { input: hostInput, output: documentSchema },
  fingerprint: { input: hostInput, output: fingerprintSchema },
  resolve: { input: hostInput, output: fileSchema },
  list: { input: hostInput, output: listingSchema },
  reveal: { input: hostInput, output: z.object({ revealed: z.literal(true) }) },
});
export const rpcContract = defineRpcContract({
  read: { input: pathInput, output: documentSchema },
  resolve: { input: pathInput, output: fileSchema },
  list: { input: pathInput, output: listingSchema },
  reveal: { input: pathInput, output: z.object({ revealed: z.literal(true) }) },
});
