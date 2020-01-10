import { TransactionParameters } from "./transaction-parameters";
import { Upload } from "./upload";

export type RetrieveTransaction = (item: string, progress: Upload) => Promise<TransactionParameters>;

export type DeduplicateTransaction = (item: string) => Promise<string | undefined>;

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
