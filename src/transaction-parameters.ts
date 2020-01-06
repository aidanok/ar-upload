export type Winston = string;
export type Address = string;
export type TransactionId = string;

/**
 * TransactionParameters
 *
 * The user supplied parameters of a transaction, excluding any wallet
 * details.
 *
 */
export interface TransactionParameters {

  /**
   * The target wallet address.
   * Optional if you are only saving data.
   * If specified, must not be the same as the sender's address.
   */
  target?: Address;

  /**
   * The quanitity of coins to send in Winston.
   * Optional when saving data.
   */
  quanity?: Winston;

  /**
   * Data to store with this transaction.
   * Optional when sending AR.
   */
  data?: ArrayBuffer;

  /**
   * The tags for this transaction.
   * Total size of the tags must not exceed 2KiB.
   */
  tags?: { name: string; value: string }[];

  /**
   * The miner reward for this transaction.
   * If not set, will be calculated automatically.
   *
   */
  reward?: Winston;
}
