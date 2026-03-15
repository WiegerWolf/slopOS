export const CONTRACT_VERSIONS = {
  bridgeProtocol: 1,
  coreSurfaces: 1,
  coreTools: 1,
  turnParts: 1,
  bridgeHistory: 1,
  shellState: 1
} as const;

export type ContractVersionKey = keyof typeof CONTRACT_VERSIONS;
