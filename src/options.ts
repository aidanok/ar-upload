export interface Options { 
  maxPendingBytes: number 
  maxPendingTxs: number 
  confirmationsRequired: number 
  pollTime: number 
  MAX_TX_SIZE: number 
}

export const DEFAULT_OPTIONS: Options = {
  maxPendingBytes: 1024 * 1024 * 30,
  maxPendingTxs: 40,
  confirmationsRequired: 4,
  pollTime: 20,
  MAX_TX_SIZE: 1024 * 1024 * 10
};

