import { TransactionParameters } from "./transaction-parameters";

export type RetrieveTransaction = (item: string) => Promise<TransactionParameters>;

export type DeduplicateTransaction = (transaction: TransactionParameters) => Promise<string | undefined>;

/**
 * The interface to access the source environment (read)
 *
 * This might be a FileSystem, Database, Remote API,
 * or a combination of things.
 */
export interface SourceEnvironment {
  retrieveTransaction: RetrieveTransaction;

  dedupTransaction?: DeduplicateTransaction;
}
