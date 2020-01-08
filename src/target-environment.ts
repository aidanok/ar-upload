import { TransactionParameters, TransactionId } from "./transaction-parameters";

export type PostTransaction = (params: TransactionParameters) => Promise<TransactionId | { id: TransactionId }>;

export type GetStatus = (id: TransactionId) => Promise<{ status: number; confirmed: null | { number_of_confirmations: number } }>;

/**
 * The interface to access the destination environment (upload)
 *
 * This will usually be an Arweave SDK of some type, such as arweave-js or
 * the extension. It can be an interface to anything.
 */
export interface TargetEnvironment {
  postTransaction: PostTransaction;

  getStatus: GetStatus;
}
